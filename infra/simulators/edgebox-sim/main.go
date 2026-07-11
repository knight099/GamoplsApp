// Command edgebox-sim publishes fake Edge Box telemetry to a local MQTT
// broker, for exercising services/core-ingestion end-to-end without real
// hardware.
//
// It picks Go (rather than Node or a mosquitto_pub shell script) because
// services/core-ingestion is already Go, so this stays a zero-extra-
// runtime dev tool: `go run .` needs nothing but the Go toolchain already
// required to work on core-ingestion, and it can reuse the same raw
// payload shape/JSON field names documented in
// services/core-ingestion/internal/normalize and
// plugins/ingestion-edgebox/src/edgebox-payload.ts without pulling in a
// second language's package manager just for a dev script.
//
// Usage:
//
//	MQTT_BROKER_URL=tcp://localhost:1883 go run . \
//	  -devices 3 -org org-chennai-pilot -fleet fleet-north -interval 2s
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"os"
	"time"

	paho "github.com/eclipse/paho.mqtt.golang"
)

type gps struct {
	Lat      float64 `json:"lat"`
	Lng      float64 `json:"lng"`
	Heading  float64 `json:"heading"`
	SpeedKmh float64 `json:"speed_kmh"`
}

type telemetry struct {
	BatteryPct  float64 `json:"battery_pct"`
	EngineTempC float64 `json:"engine_temp_c"`
	FuelPct     float64 `json:"fuel_pct"`
	HealthScore float64 `json:"health_score"`
}

type payload struct {
	DeviceID  string    `json:"device_id"`
	AssetID   string    `json:"asset_id"`
	OrgID     string    `json:"org_id"`
	FleetID   string    `json:"fleet_id"`
	Ts        string    `json:"ts"`
	GPS       gps       `json:"gps"`
	Telemetry telemetry `json:"telemetry"`
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	brokerURL := flag.String("broker", getenv("MQTT_BROKER_URL", "tcp://localhost:1883"), "MQTT broker URL")
	// Broker credentials (suggestions.md S-2): anonymous MQTT is disabled;
	// defaults match infra/mosquitto's dev passwd file ("edgebox" is the
	// device-side user allowed to WRITE edgebox/# topics). Deliberately a
	// different env var than core-ingestion's MQTT_USERNAME so a shared
	// root .env can't hand the simulator the service's read-only user.
	username := flag.String("username", getenv("MQTT_DEVICE_USERNAME", "edgebox"), "MQTT username")
	password := flag.String("password", getenv("MQTT_DEVICE_PASSWORD", "changeme-dev-only"), "MQTT password")
	orgID := flag.String("org", "org-chennai-pilot", "org_id to stamp on every reading")
	fleetID := flag.String("fleet", "fleet-north", "fleet_id to stamp on every reading")
	deviceCount := flag.Int("devices", 3, "number of simulated Edge Box devices")
	interval := flag.Duration("interval", 3*time.Second, "publish interval per device")
	flag.Parse()

	opts := paho.NewClientOptions().AddBroker(*brokerURL).SetClientID("edgebox-sim")
	if *username != "" {
		opts.SetUsername(*username)
		opts.SetPassword(*password)
	}
	client := paho.NewClient(opts)
	if token := client.Connect(); token.Wait() && token.Error() != nil {
		log.Fatalf("failed to connect to MQTT broker at %s: %v", *brokerURL, token.Error())
	}
	defer client.Disconnect(250)
	log.Printf("edgebox-sim connected to %s, simulating %d device(s) every %s", *brokerURL, *deviceCount, *interval)

	// Seed each device with a starting position around Chennai and a
	// running health score that drifts slowly, occasionally producing a
	// malformed message to exercise the drop-and-log path downstream.
	type deviceState struct {
		deviceID string
		assetID  string
		lat, lng float64
		health   float64
	}
	devices := make([]*deviceState, *deviceCount)
	for i := 0; i < *deviceCount; i++ {
		devices[i] = &deviceState{
			deviceID: fmt.Sprintf("edgebox-%03d", i+1),
			assetID:  fmt.Sprintf("vehicle-%03d", i+1),
			lat:      13.0827 + rand.Float64()*0.05,
			lng:      80.2707 + rand.Float64()*0.05,
			health:   85 + rand.Float64()*10,
		}
	}

	ticker := time.NewTicker(*interval)
	defer ticker.Stop()

	for range ticker.C {
		for _, d := range devices {
			d.lat += (rand.Float64() - 0.5) * 0.002
			d.lng += (rand.Float64() - 0.5) * 0.002
			d.health += (rand.Float64() - 0.5) * 2
			if d.health > 100 {
				d.health = 100
			}
			if d.health < 0 {
				d.health = 0
			}

			topic := fmt.Sprintf("edgebox/%s/%s/%s/telemetry", *orgID, *fleetID, d.deviceID)

			// ~5% of the time, publish an intentionally malformed message
			// to exercise core-ingestion's drop-and-log path.
			if rand.Float64() < 0.05 {
				publishRaw(client, topic, []byte(`{"device_id": "`+d.deviceID+`", "gps": "not-an-object"}`))
				continue
			}

			p := payload{
				DeviceID: d.deviceID,
				AssetID:  d.assetID,
				OrgID:    *orgID,
				FleetID:  *fleetID,
				Ts:       time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
				GPS: gps{
					Lat:      d.lat,
					Lng:      d.lng,
					Heading:  rand.Float64() * 360,
					SpeedKmh: rand.Float64() * 60,
				},
				Telemetry: telemetry{
					BatteryPct:  40 + rand.Float64()*60,
					EngineTempC: 70 + rand.Float64()*30,
					FuelPct:     20 + rand.Float64()*80,
					HealthScore: d.health,
				},
			}
			data, err := json.Marshal(p)
			if err != nil {
				log.Printf("failed to marshal simulated payload: %v", err)
				continue
			}
			publishRaw(client, topic, data)
		}
	}
}

func publishRaw(client paho.Client, topic string, data []byte) {
	token := client.Publish(topic, 1, false, data)
	token.Wait()
	if err := token.Error(); err != nil {
		log.Printf("failed to publish to %s: %v", topic, err)
		return
	}
	log.Printf("published to %s: %s", topic, data)
}

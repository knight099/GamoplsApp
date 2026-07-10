// Command core-ingestion subscribes to Edge Box MQTT telemetry topics,
// normalizes each payload via internal/normalize, and publishes the
// resulting events to NATS via internal/publish: location updates on
// AssetLocationUpdated, raw health readings on AssetHealthRaw (scored and
// republished as AssetHealthChanged by services/ai-engine). Malformed
// messages are dropped and logged, never allowed to crash the subscriber
// loop.
package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/gamopls/teamcore/services/core-ingestion/internal/mqtt"
	"github.com/gamopls/teamcore/services/core-ingestion/internal/normalize"
	"github.com/gamopls/teamcore/services/core-ingestion/internal/publish"
)

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	mqttBrokerURL := getenv("MQTT_BROKER_URL", "tcp://localhost:1883")
	mqttTopicFilter := getenv("MQTT_TOPIC_FILTER", "edgebox/+/+/+/telemetry")
	natsURL := getenv("NATS_URL", "nats://localhost:4222")

	publisher, err := publish.NewPublisher(natsURL)
	if err != nil {
		log.Fatalf("failed to connect to NATS: %v", err)
	}
	defer publisher.Close()

	handler := func(topic string, payload []byte) {
		result, err := normalize.Parse(payload)
		if err != nil {
			// Drop-and-log: one malformed device message must never take
			// down the subscriber loop for the whole fleet.
			log.Printf("dropping malformed message on topic %s: %v", topic, err)
			return
		}
		if err := publisher.PublishResult(result); err != nil {
			log.Printf("failed to publish normalized event from topic %s: %v", topic, err)
		}
	}

	sub, err := mqtt.Connect(mqtt.Options{
		BrokerURL:   mqttBrokerURL,
		ClientID:    "core-ingestion",
		TopicFilter: mqttTopicFilter,
		QoS:         1,
	}, handler)
	if err != nil {
		log.Fatalf("failed to connect to MQTT broker: %v", err)
	}
	defer sub.Close()

	log.Printf("core-ingestion subscribed to %s on %s, publishing to %s", mqttTopicFilter, mqttBrokerURL, natsURL)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	log.Println("shutting down core-ingestion")
}

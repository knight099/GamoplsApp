package normalize

import (
	"testing"
)

const validPayload = `{
	"device_id": "edgebox-042",
	"asset_id": "vehicle-042",
	"org_id": "org-chennai-pilot",
	"fleet_id": "fleet-north",
	"ts": "2026-07-08T10:15:30.000Z",
	"gps": { "lat": 13.0827, "lng": 80.2707, "heading": 87.5, "speed_kmh": 42.1 },
	"telemetry": { "battery_pct": 76, "engine_temp_c": 91.2, "fuel_pct": 54, "health_score": 88 }
}`

func TestParse_ValidPayload_ProducesBothUpdates(t *testing.T) {
	result, err := Parse([]byte(validPayload))
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if result.LocationUpdate == nil {
		t.Fatal("expected LocationUpdate to be set")
	}
	if result.HealthUpdate == nil {
		t.Fatal("expected HealthUpdate to be set")
	}

	loc := result.LocationUpdate
	if loc.Type != AssetLocationUpdatedType {
		t.Errorf("expected type %s, got %s", AssetLocationUpdatedType, loc.Type)
	}
	if loc.OrgID != "org-chennai-pilot" || loc.FleetID != "fleet-north" || loc.AssetID != "vehicle-042" {
		t.Errorf("unexpected identity fields: %+v", loc)
	}
	if loc.Lat != 13.0827 || loc.Lng != 80.2707 {
		t.Errorf("unexpected lat/lng: %f, %f", loc.Lat, loc.Lng)
	}
	if loc.Heading == nil || *loc.Heading != 87.5 {
		t.Errorf("expected heading 87.5, got %+v", loc.Heading)
	}
	if loc.Speed == nil || *loc.Speed != 42.1 {
		t.Errorf("expected speed 42.1, got %+v", loc.Speed)
	}

	health := result.HealthUpdate
	if health.Type != AssetHealthChangedType {
		t.Errorf("expected type %s, got %s", AssetHealthChangedType, health.Type)
	}
	if health.HealthScore != 88 {
		t.Errorf("expected health score 88, got %f", health.HealthScore)
	}
	if health.Telemetry["battery_pct"] != 76.0 {
		t.Errorf("expected battery_pct 76 in telemetry, got %+v", health.Telemetry)
	}
	if _, present := health.Telemetry["health_score"]; present {
		t.Errorf("health_score should be lifted to HealthScore field, not left in telemetry map")
	}
}

func TestParse_GPSOnlyPayload_ProducesOnlyLocationUpdate(t *testing.T) {
	payload := `{
		"device_id": "edgebox-042",
		"asset_id": "vehicle-042",
		"org_id": "org-1",
		"fleet_id": "fleet-1",
		"ts": "2026-07-08T10:15:30.000Z",
		"gps": { "lat": 13.0, "lng": 80.0 }
	}`
	result, err := Parse([]byte(payload))
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if result.LocationUpdate == nil {
		t.Fatal("expected LocationUpdate to be set")
	}
	if result.HealthUpdate != nil {
		t.Fatal("expected HealthUpdate to be nil")
	}
}

func TestParse_TelemetryOnlyPayload_ProducesOnlyHealthUpdate(t *testing.T) {
	payload := `{
		"device_id": "edgebox-042",
		"asset_id": "vehicle-042",
		"org_id": "org-1",
		"fleet_id": "fleet-1",
		"ts": "2026-07-08T10:15:30.000Z",
		"telemetry": { "health_score": 55 }
	}`
	result, err := Parse([]byte(payload))
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if result.LocationUpdate != nil {
		t.Fatal("expected LocationUpdate to be nil")
	}
	if result.HealthUpdate == nil {
		t.Fatal("expected HealthUpdate to be set")
	}
}

func TestParse_TelemetryWithoutHealthScore_ProducesNoHealthUpdate(t *testing.T) {
	payload := `{
		"device_id": "edgebox-042",
		"asset_id": "vehicle-042",
		"org_id": "org-1",
		"fleet_id": "fleet-1",
		"ts": "2026-07-08T10:15:30.000Z",
		"gps": { "lat": 13.0, "lng": 80.0 },
		"telemetry": { "battery_pct": 40 }
	}`
	result, err := Parse([]byte(payload))
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if result.HealthUpdate != nil {
		t.Fatal("expected HealthUpdate to be nil when health_score is absent")
	}
	if result.LocationUpdate == nil {
		t.Fatal("expected LocationUpdate to still be set")
	}
}

func TestParse_MalformedPayloads_ReturnErrorNotPanic(t *testing.T) {
	cases := []struct {
		name    string
		payload string
	}{
		{"not json", `not json at all`},
		{"empty object", `{}`},
		{"missing device_id", `{"asset_id":"a","org_id":"o","fleet_id":"f","ts":"2026-07-08T10:15:30.000Z","gps":{"lat":1,"lng":1}}`},
		{"missing asset_id", `{"device_id":"d","org_id":"o","fleet_id":"f","ts":"2026-07-08T10:15:30.000Z","gps":{"lat":1,"lng":1}}`},
		{"missing org_id", `{"device_id":"d","asset_id":"a","fleet_id":"f","ts":"2026-07-08T10:15:30.000Z","gps":{"lat":1,"lng":1}}`},
		{"missing fleet_id", `{"device_id":"d","asset_id":"a","org_id":"o","ts":"2026-07-08T10:15:30.000Z","gps":{"lat":1,"lng":1}}`},
		{"missing ts", `{"device_id":"d","asset_id":"a","org_id":"o","fleet_id":"f","gps":{"lat":1,"lng":1}}`},
		{"invalid ts", `{"device_id":"d","asset_id":"a","org_id":"o","fleet_id":"f","ts":"not-a-date","gps":{"lat":1,"lng":1}}`},
		{"lat out of range", `{"device_id":"d","asset_id":"a","org_id":"o","fleet_id":"f","ts":"2026-07-08T10:15:30.000Z","gps":{"lat":999,"lng":1}}`},
		{"lng out of range", `{"device_id":"d","asset_id":"a","org_id":"o","fleet_id":"f","ts":"2026-07-08T10:15:30.000Z","gps":{"lat":1,"lng":999}}`},
		{"gps missing lng", `{"device_id":"d","asset_id":"a","org_id":"o","fleet_id":"f","ts":"2026-07-08T10:15:30.000Z","gps":{"lat":1}}`},
		{"health_score out of range", `{"device_id":"d","asset_id":"a","org_id":"o","fleet_id":"f","ts":"2026-07-08T10:15:30.000Z","telemetry":{"health_score":150}}`},
		{"neither gps nor health_score", `{"device_id":"d","asset_id":"a","org_id":"o","fleet_id":"f","ts":"2026-07-08T10:15:30.000Z"}`},
		{"null payload", `null`},
		{"array payload", `[1,2,3]`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			defer func() {
				if r := recover(); r != nil {
					t.Fatalf("Parse panicked on malformed input %q: %v", tc.name, r)
				}
			}()
			result, err := Parse([]byte(tc.payload))
			if err == nil {
				t.Fatalf("expected an error for case %q, got result: %+v", tc.name, result)
			}
			if result != nil {
				t.Fatalf("expected nil result alongside error for case %q, got: %+v", tc.name, result)
			}
		})
	}
}

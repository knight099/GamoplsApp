// Package normalize turns raw Edge Box MQTT telemetry payloads into
// normalized event structs, mirroring the same raw Edge Box payload shape
// and JSON field names as plugins/ingestion-edgebox (TypeScript).
//
// The two implementations are kept contract-compatible (same field names,
// same validation rules) by convention, not by shared code — per
// CLAUDE.md's "plugins are separate deployable services" rule, this Go
// service cannot import the TS package in-process, so the parsing logic
// is deliberately reimplemented natively here.
//
// Raw Edge Box payload shape (see plugins/ingestion-edgebox/src/edgebox-payload.ts
// for the canonical documented version):
//
//	{
//	  "device_id": "edgebox-042",
//	  "asset_id": "vehicle-042",
//	  "org_id": "org-chennai-pilot",
//	  "fleet_id": "fleet-north",
//	  "ts": "2026-07-08T10:15:30.000Z",
//	  "gps": { "lat": 13.0827, "lng": 80.2707, "heading": 87.5, "speed_kmh": 42.1 },
//	  "telemetry": { "battery_pct": 76, "engine_temp_c": 91.2, "fuel_pct": 54, "health_score": 88 }
//	}
package normalize

import (
	"encoding/json"
	"fmt"
	"time"
)

// AssetLocationUpdated mirrors @gamopls/event-schemas' assetLocationUpdatedSchema.
type AssetLocationUpdated struct {
	Type      string   `json:"type"`
	OrgID     string   `json:"org_id"`
	FleetID   string   `json:"fleet_id"`
	Timestamp string   `json:"timestamp"`
	AssetID   string   `json:"asset_id"`
	Lat       float64  `json:"lat"`
	Lng       float64  `json:"lng"`
	Heading   *float64 `json:"heading,omitempty"`
	Speed     *float64 `json:"speed,omitempty"`
}

// AssetHealthChanged mirrors @gamopls/event-schemas' assetHealthChangedSchema.
type AssetHealthChanged struct {
	Type        string                 `json:"type"`
	OrgID       string                 `json:"org_id"`
	FleetID     string                 `json:"fleet_id"`
	Timestamp   string                 `json:"timestamp"`
	AssetID     string                 `json:"asset_id"`
	HealthScore float64                `json:"healthScore"`
	Telemetry   map[string]interface{} `json:"telemetry"`
}

const (
	AssetLocationUpdatedType = "AssetLocationUpdated"
	AssetHealthChangedType   = "AssetHealthChanged"
)

// rawGPS and rawTelemetry mirror the optional nested blocks of the raw
// Edge Box payload. Pointer fields distinguish "absent" from "zero value".
type rawGPS struct {
	Lat      *float64 `json:"lat"`
	Lng      *float64 `json:"lng"`
	Heading  *float64 `json:"heading"`
	SpeedKmh *float64 `json:"speed_kmh"`
}

type rawTelemetry struct {
	BatteryPct  *float64 `json:"battery_pct"`
	EngineTempC *float64 `json:"engine_temp_c"`
	FuelPct     *float64 `json:"fuel_pct"`
	OdometerKm  *float64 `json:"odometer_km"`
	HealthScore *float64 `json:"health_score"`
}

type rawEdgeBoxPayload struct {
	DeviceID  *string       `json:"device_id"`
	AssetID   *string       `json:"asset_id"`
	OrgID     *string       `json:"org_id"`
	FleetID   *string       `json:"fleet_id"`
	Ts        *string       `json:"ts"`
	GPS       *rawGPS       `json:"gps"`
	Telemetry *rawTelemetry `json:"telemetry"`
}

// ParseResult is the normalized output of a single Edge Box payload. Either
// field may be nil depending on which blocks were present in the raw
// payload; both nil only occurs alongside a non-nil error from Parse.
type ParseResult struct {
	LocationUpdate *AssetLocationUpdated
	HealthUpdate   *AssetHealthChanged
}

// Parse normalizes a raw Edge Box MQTT message body (JSON bytes) into
// AssetLocationUpdated/AssetHealthChanged structs.
//
// It never panics: malformed input always returns a non-nil error so
// callers (the MQTT subscriber loop) can drop-and-log the single bad
// message instead of crashing.
func Parse(raw []byte) (*ParseResult, error) {
	var payload rawEdgeBoxPayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, fmt.Errorf("payload is not valid JSON: %w", err)
	}

	if payload.DeviceID == nil || *payload.DeviceID == "" {
		return nil, fmt.Errorf("missing or invalid required field: device_id")
	}
	if payload.AssetID == nil || *payload.AssetID == "" {
		return nil, fmt.Errorf("missing or invalid required field: asset_id")
	}
	if payload.OrgID == nil || *payload.OrgID == "" {
		return nil, fmt.Errorf("missing or invalid required field: org_id")
	}
	if payload.FleetID == nil || *payload.FleetID == "" {
		return nil, fmt.Errorf("missing or invalid required field: fleet_id")
	}
	if payload.Ts == nil || *payload.Ts == "" {
		return nil, fmt.Errorf("missing or invalid required field: ts")
	}

	parsedTs, err := time.Parse(time.RFC3339, *payload.Ts)
	if err != nil {
		// Fall back to RFC3339Nano to tolerate fractional seconds beyond
		// what time.RFC3339 accepts in some encoders.
		parsedTs, err = time.Parse(time.RFC3339Nano, *payload.Ts)
		if err != nil {
			return nil, fmt.Errorf("invalid timestamp: %s", *payload.Ts)
		}
	}
	isoTimestamp := parsedTs.UTC().Format("2006-01-02T15:04:05.000Z")

	result := &ParseResult{}

	if payload.GPS != nil {
		if payload.GPS.Lat == nil || payload.GPS.Lng == nil {
			return nil, fmt.Errorf("invalid gps block: lat/lng must be present when gps is present")
		}
		lat := *payload.GPS.Lat
		lng := *payload.GPS.Lng
		if lat < -90 || lat > 90 {
			return nil, fmt.Errorf("invalid gps block: lat %f out of range", lat)
		}
		if lng < -180 || lng > 180 {
			return nil, fmt.Errorf("invalid gps block: lng %f out of range", lng)
		}
		if payload.GPS.Heading != nil && (*payload.GPS.Heading < 0 || *payload.GPS.Heading > 360) {
			return nil, fmt.Errorf("invalid gps block: heading %f out of range", *payload.GPS.Heading)
		}
		if payload.GPS.SpeedKmh != nil && *payload.GPS.SpeedKmh < 0 {
			return nil, fmt.Errorf("invalid gps block: speed_kmh %f out of range", *payload.GPS.SpeedKmh)
		}

		result.LocationUpdate = &AssetLocationUpdated{
			Type:      AssetLocationUpdatedType,
			OrgID:     *payload.OrgID,
			FleetID:   *payload.FleetID,
			Timestamp: isoTimestamp,
			AssetID:   *payload.AssetID,
			Lat:       lat,
			Lng:       lng,
			Heading:   payload.GPS.Heading,
			Speed:     payload.GPS.SpeedKmh,
		}
	}

	if payload.Telemetry != nil && payload.Telemetry.HealthScore != nil {
		score := *payload.Telemetry.HealthScore
		if score < 0 || score > 100 {
			return nil, fmt.Errorf("invalid telemetry block: health_score %f out of range", score)
		}

		telemetry := map[string]interface{}{}
		if payload.Telemetry.BatteryPct != nil {
			telemetry["battery_pct"] = *payload.Telemetry.BatteryPct
		}
		if payload.Telemetry.EngineTempC != nil {
			telemetry["engine_temp_c"] = *payload.Telemetry.EngineTempC
		}
		if payload.Telemetry.FuelPct != nil {
			telemetry["fuel_pct"] = *payload.Telemetry.FuelPct
		}
		if payload.Telemetry.OdometerKm != nil {
			telemetry["odometer_km"] = *payload.Telemetry.OdometerKm
		}

		result.HealthUpdate = &AssetHealthChanged{
			Type:        AssetHealthChangedType,
			OrgID:       *payload.OrgID,
			FleetID:     *payload.FleetID,
			Timestamp:   isoTimestamp,
			AssetID:     *payload.AssetID,
			HealthScore: score,
			Telemetry:   telemetry,
		}
	}

	if result.LocationUpdate == nil && result.HealthUpdate == nil {
		return nil, fmt.Errorf("payload contained neither a usable gps block nor a health_score")
	}

	return result, nil
}

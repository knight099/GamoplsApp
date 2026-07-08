// Package publish wraps a NATS connection for publishing normalized Edge
// Box events. Subject naming mirrors the event type name so subscribers
// (services/map, services/board, etc.) can subscribe by subject without
// any Edge-Box-specific knowledge.
package publish

import (
	"encoding/json"
	"fmt"
	"log"

	"github.com/nats-io/nats.go"

	"github.com/gamopls/teamcore/services/core-ingestion/internal/normalize"
)

const (
	SubjectAssetLocationUpdated = "events.AssetLocationUpdated"
	SubjectAssetHealthChanged   = "events.AssetHealthChanged"
)

// Publisher publishes normalized events to NATS subjects.
type Publisher struct {
	nc *nats.Conn
}

// NewPublisher connects to the given NATS server URL(s).
func NewPublisher(natsURL string) (*Publisher, error) {
	nc, err := nats.Connect(natsURL, nats.Name("core-ingestion"))
	if err != nil {
		return nil, fmt.Errorf("connecting to NATS at %s: %w", natsURL, err)
	}
	return &Publisher{nc: nc}, nil
}

// Close drains and closes the underlying NATS connection.
func (p *Publisher) Close() {
	if p.nc != nil {
		_ = p.nc.Drain()
	}
}

// PublishResult publishes whichever of LocationUpdate/HealthUpdate are set
// on the given normalize.ParseResult.
func (p *Publisher) PublishResult(result *normalize.ParseResult) error {
	if result.LocationUpdate != nil {
		if err := p.publishJSON(SubjectAssetLocationUpdated, result.LocationUpdate); err != nil {
			return fmt.Errorf("publishing AssetLocationUpdated: %w", err)
		}
	}
	if result.HealthUpdate != nil {
		if err := p.publishJSON(SubjectAssetHealthChanged, result.HealthUpdate); err != nil {
			return fmt.Errorf("publishing AssetHealthChanged: %w", err)
		}
	}
	return nil
}

func (p *Publisher) publishJSON(subject string, payload interface{}) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshaling payload: %w", err)
	}
	if err := p.nc.Publish(subject, data); err != nil {
		return err
	}
	log.Printf("published to %s: %s", subject, data)
	return nil
}

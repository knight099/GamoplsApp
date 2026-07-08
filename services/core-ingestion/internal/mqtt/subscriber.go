// Package mqtt subscribes to Edge Box telemetry topics and hands raw
// message bytes to a caller-supplied handler. It has no knowledge of the
// Edge Box payload shape — that's internal/normalize's job — so this
// package stays reusable if a future ingestion source needs MQTT too.
package mqtt

import (
	"fmt"
	"log"
	"time"

	paho "github.com/eclipse/paho.mqtt.golang"
)

// Handler processes one raw MQTT message payload for a given topic.
type Handler func(topic string, payload []byte)

// Subscriber wraps a Paho MQTT client subscribed to a single topic filter.
type Subscriber struct {
	client paho.Client
}

// Options configures the underlying MQTT connection.
type Options struct {
	// BrokerURL e.g. "tcp://localhost:1883"
	BrokerURL string
	ClientID  string
	// TopicFilter e.g. "edgebox/+/+/+/telemetry"
	TopicFilter string
	QoS         byte
}

// Connect dials the MQTT broker and subscribes to TopicFilter, invoking
// handler for every message received.
func Connect(opts Options, handler Handler) (*Subscriber, error) {
	clientOpts := paho.NewClientOptions().
		AddBroker(opts.BrokerURL).
		SetClientID(opts.ClientID).
		SetAutoReconnect(true).
		SetConnectRetry(true).
		SetConnectRetryInterval(2 * time.Second)

	client := paho.NewClient(clientOpts)
	token := client.Connect()
	if !token.WaitTimeout(10 * time.Second) {
		return nil, fmt.Errorf("timed out connecting to MQTT broker at %s", opts.BrokerURL)
	}
	if err := token.Error(); err != nil {
		return nil, fmt.Errorf("connecting to MQTT broker at %s: %w", opts.BrokerURL, err)
	}

	subToken := client.Subscribe(opts.TopicFilter, opts.QoS, func(_ paho.Client, msg paho.Message) {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("recovered from panic in MQTT handler for topic %s: %v", msg.Topic(), r)
			}
		}()
		handler(msg.Topic(), msg.Payload())
	})
	if !subToken.WaitTimeout(10 * time.Second) {
		return nil, fmt.Errorf("timed out subscribing to topic filter %s", opts.TopicFilter)
	}
	if err := subToken.Error(); err != nil {
		return nil, fmt.Errorf("subscribing to topic filter %s: %w", opts.TopicFilter, err)
	}

	return &Subscriber{client: client}, nil
}

// Close disconnects from the MQTT broker.
func (s *Subscriber) Close() {
	if s.client != nil && s.client.IsConnected() {
		s.client.Disconnect(250)
	}
}

import asyncio
import json
import os
import sys
from ai_engine.events import AssetHealthChanged, ASSET_HEALTH_CHANGED_SUBJECT
from ai_engine.task_suggestion import process_and_publish
from ai_engine.publisher import NatsEventPublisher

async def main():
    nats_url = os.getenv("NATS_URL", "nats://localhost:4222")
    print(f"ai-engine: connecting to NATS at {nats_url}...", flush=True)

    try:
        import nats
    except ImportError:
        print("ai-engine error: nats-py is not installed. Please run `uv pip install nats-py` or ensure the nats extra is installed.", file=sys.stderr, flush=True)
        sys.exit(1)

    try:
        nc = await nats.connect(nats_url)
        print("ai-engine: connected successfully to NATS event bus.", flush=True)
    except Exception as e:
        print(f"ai-engine error: failed to connect to NATS: {e}", file=sys.stderr, flush=True)
        sys.exit(1)

    publisher = NatsEventPublisher(nats_url)
    await publisher.connect()

    async def message_handler(msg):
        subject = msg.subject
        data = msg.data.decode("utf-8")
        try:
            payload = json.loads(data)
            # Skip messages we published ourselves to avoid infinite recursion
            if payload.get("telemetry", {}).get("_processed_by_ai"):
                return

            event = AssetHealthChanged(**payload)
            print(f"ai-engine: received AssetHealthChanged for asset {event.asset_id} (raw score: {event.healthScore})", flush=True)
            
            # Mark as processed to prevent loops
            event.telemetry["_processed_by_ai"] = True

            updated, suggestion = process_and_publish(event, publisher)
            print(f"ai-engine: recomputed health score for asset {event.asset_id} -> {updated.healthScore}", flush=True)
            
            if suggestion:
                print(f"ai-engine: health score {updated.healthScore} is below threshold! Published TaskSuggested: '{suggestion.title}'", flush=True)
        except Exception as e:
            print(f"ai-engine error: failed to process message on subject {subject}: {e}", file=sys.stderr, flush=True)

    await nc.subscribe(ASSET_HEALTH_CHANGED_SUBJECT, cb=message_handler)
    print(f"ai-engine: subscribed to NATS subject '{ASSET_HEALTH_CHANGED_SUBJECT}'", flush=True)

    # Keep running
    try:
        while True:
            await asyncio.sleep(1)
    except asyncio.CancelledError:
        print("ai-engine: shutting down...", flush=True)
    finally:
        await nc.close()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nai-engine: stopped by user.", flush=True)

import asyncio
import json
import os
import sys
from ai_engine.events import AssetHealthChanged, ASSET_HEALTH_RAW_SUBJECT, ASSET_HEALTH_CHANGED_SUBJECT, TASK_SUGGESTED_SUBJECT
from ai_engine.events import AssetLocationUpdated, ASSET_LOCATION_UPDATED_SUBJECT, ALERT_RAISED_SUBJECT
from ai_engine.task_suggestion import build_task_suggestion, DEGRADED_HEALTH_THRESHOLD
from ai_engine.health_score import process_health_event
from ai_engine.idle_detection import IdleDetector
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

    idle_detector = IdleDetector()

    async def location_handler(msg):
        try:
            payload = json.loads(msg.data.decode("utf-8"))
            event = AssetLocationUpdated(**payload)
            alert = idle_detector.process_location_update(event)
            if alert is not None:
                await publisher.publish_async(ALERT_RAISED_SUBJECT, alert.model_dump(mode="json"))
                print(f"ai-engine: published idle AlertRaised for asset {event.asset_id}", flush=True)
        except Exception as e:
            print(f"ai-engine error: failed to process AssetLocationUpdated: {e}", file=sys.stderr, flush=True)

    async def message_handler(msg):
        subject = msg.subject
        data = msg.data.decode("utf-8")
        try:
            payload = json.loads(data)
            event = AssetHealthChanged(**payload)
            print(f"ai-engine: received raw health reading for asset {event.asset_id} (raw score: {event.healthScore})", flush=True)

            # Recompute the score and republish on the SCORED subject.
            # No loop-breaker marker needed: we consume AssetHealthRaw and
            # publish AssetHealthChanged, so we never see our own output.
            updated = process_health_event(event)
            await publisher.publish_async(ASSET_HEALTH_CHANGED_SUBJECT, updated.model_dump(mode="json"))
            print(f"ai-engine: recomputed health score for asset {event.asset_id} -> {updated.healthScore}", flush=True)
            
            if updated.healthScore < DEGRADED_HEALTH_THRESHOLD:
                suggestion = build_task_suggestion(updated)
                await publisher.publish_async(TASK_SUGGESTED_SUBJECT, suggestion.model_dump(mode="json"))
                print(f"ai-engine: health score {updated.healthScore} is below threshold! Published TaskSuggested: '{suggestion.title}'", flush=True)
        except Exception as e:
            print(f"ai-engine error: failed to process message on subject {subject}: {e}", file=sys.stderr, flush=True)

    await nc.subscribe(ASSET_HEALTH_RAW_SUBJECT, cb=message_handler)
    print(f"ai-engine: subscribed to NATS subject '{ASSET_HEALTH_RAW_SUBJECT}'", flush=True)

    await nc.subscribe(ASSET_LOCATION_UPDATED_SUBJECT, cb=location_handler)
    print(f"ai-engine: subscribed to NATS subject '{ASSET_LOCATION_UPDATED_SUBJECT}'", flush=True)

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

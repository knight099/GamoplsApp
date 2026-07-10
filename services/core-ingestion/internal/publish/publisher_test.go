package publish

import "testing"

// The subject strings are a cross-language wire contract shared with
// packages/event-schemas (TS) and services/ai-engine (Python). Pin them so
// a rename here can't silently detach ingestion from its subscribers.
func TestWireSubjects(t *testing.T) {
	if SubjectAssetLocationUpdated != "AssetLocationUpdated" {
		t.Errorf("SubjectAssetLocationUpdated = %q, want %q", SubjectAssetLocationUpdated, "AssetLocationUpdated")
	}
	// Raw health readings must NOT go out on AssetHealthChanged: only
	// services/ai-engine publishes there (scored events). See
	// event-schemas' ASSET_HEALTH_RAW_SUBJECT doc comment.
	if SubjectAssetHealthRaw != "AssetHealthRaw" {
		t.Errorf("SubjectAssetHealthRaw = %q, want %q", SubjectAssetHealthRaw, "AssetHealthRaw")
	}
	if SubjectAssetHealthRaw == "AssetHealthChanged" {
		t.Error("ingestion must not publish health readings on the scored AssetHealthChanged subject")
	}
}

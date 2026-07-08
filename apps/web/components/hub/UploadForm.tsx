"use client";

import { useState, type FormEvent } from "react";
import { Button, Card } from "@gamopls/ui";
import { HubApiError, uploadDocument } from "./api";
import { formatBytes, LARGE_FILE_WARNING_BYTES, readFileAsBase64 } from "./file-encoding";

export interface UploadFormProps {
  /** Tenant scope is enforced by the gateway (query params from the JWT),
   * not sent in the upload body — see types.ts's UploadDocumentInput doc
   * comment. Only uploaderId travels in the request body. */
  uploaderId: string;
  onUploaded: (document: import("./types").HubDocument) => void;
}

type SubmitState = "idle" | "submitting" | "error";

/**
 * Document upload form (PLAN.md 6.7). services/hub expects base64
 * `content` in the JSON body, not multipart/form-data — so this reads the
 * chosen file client-side via FileReader and posts base64 + metadata to
 * `/api/hub/documents`. No chunked/resumable upload; see
 * file-encoding.ts's doc comment for the known V1 large-file caveat.
 */
export function UploadForm({ uploaderId, onUploaded }: UploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose a file to upload.");
      setState("error");
      return;
    }

    setState("submitting");
    setError(null);

    try {
      const content = await readFileAsBase64(file);
      const created = await uploadDocument({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        uploader: uploaderId,
        description: description.trim() || undefined,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        content,
      });
      setFile(null);
      setDescription("");
      setTags("");
      setState("idle");
      onUploaded(created);
    } catch (err) {
      setError(err instanceof HubApiError ? err.message : "Upload failed.");
      setState("error");
    }
  }

  return (
    <Card>
      <h2 style={{ marginTop: 0 }}>Upload document</h2>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <label style={{ fontSize: "0.875rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          File
          <input
            type="file"
            aria-label="Choose file"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError(null);
            }}
          />
        </label>
        {file && (
          <p style={{ fontSize: "0.75rem", color: "#6b7280", margin: 0 }}>
            {file.name} · {formatBytes(file.size)}
            {file.size > LARGE_FILE_WARNING_BYTES && (
              <span style={{ color: "#92400e" }}>
                {" "}
                — this is a large file. V1 uploads send the whole file as base64 inside a JSON request,
                which isn&apos;t efficient for big files; it may be slow or fail.
              </span>
            )}
          </p>
        )}
        <label style={{ fontSize: "0.875rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          Description (optional)
          <input
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <label style={{ fontSize: "0.875rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          Tags, comma separated (optional)
          <input type="text" value={tags} onChange={(event) => setTags(event.target.value)} />
        </label>
        {error && (
          <p role="alert" style={{ color: "#991b1b", margin: 0 }}>
            {error}
          </p>
        )}
        <Button type="submit" disabled={state === "submitting"}>
          {state === "submitting" ? "Uploading…" : "Upload"}
        </Button>
      </form>
    </Card>
  );
}

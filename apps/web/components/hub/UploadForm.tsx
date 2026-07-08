"use client";

import { useState, type FormEvent } from "react";
import { Button, Card } from "@gamopls/ui";
import { HubApiError, uploadDocument } from "./api";
import { formatBytes, LARGE_FILE_WARNING_BYTES, readFileAsBase64 } from "./file-encoding";
import { Input } from "../ui/input";
import { UploadCloud, ShieldAlert, FileIcon } from "lucide-react";

export interface UploadFormProps {
  uploaderId: string;
  onUploaded: (document: import("./types").HubDocument) => void;
}

type SubmitState = "idle" | "submitting" | "error";

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
    <Card className="border border-border bg-card p-6">
      <h2 className="text-lg font-bold text-white mb-4 border-b border-border/50 pb-2 flex items-center gap-1.5">
        <UploadCloud className="h-5 w-5 text-cyan-400" />
        Upload document
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Target Document File
          </label>
          <div className="relative border border-dashed border-border/60 hover:border-muted-foreground/30 rounded-lg p-6 bg-background/30 text-center transition-all duration-150">
            <input
              type="file"
              aria-label="Choose file"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setError(null);
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="space-y-2">
              <div className="flex justify-center text-muted-foreground/80">
                <FileIcon className="h-8 w-8 text-cyan-400/80" />
              </div>
              <p className="text-xs font-semibold text-white">
                {file ? file.name : "Select or drag file here"}
              </p>
              <p className="text-[10px] text-muted-foreground/80">
                {file ? formatBytes(file.size) : "Standard technical documents & diagrams"}
              </p>
            </div>
          </div>
        </div>

        {file && file.size > LARGE_FILE_WARNING_BYTES && (
          <div className="flex items-center gap-2 text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
            <span>
              Large file warning: uploading files over {formatBytes(LARGE_FILE_WARNING_BYTES)} may be slow over standard base64 API payloads.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Description (optional)
            </label>
            <Input
              type="text"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="e.g. Chennai fleet maintenance guide"
              className="h-8 text-xs bg-background/50 border-border"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Tags (comma separated)
            </label>
            <Input
              type="text"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="e.g. manual, chennai, maintenance"
              className="h-8 text-xs bg-background/50 border-border"
            />
          </div>
        </div>

        {error && (
          <p role="alert" style={{ color: "#ef4444", fontSize: "0.875rem", margin: 0 }}>
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

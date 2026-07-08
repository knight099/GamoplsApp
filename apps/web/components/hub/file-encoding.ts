/**
 * services/hub's `POST /documents` expects the file inline as base64 JSON
 * (`content`, see services/hub/src/schemas.ts) rather than a multipart
 * upload — a deliberate V1 simplification documented there. This helper
 * reads a browser `File` into that base64 string client-side.
 *
 * Known V1 limitation (intentionally not solved here): shipping a whole
 * file as base64 inside a JSON body is ~33% larger than the raw bytes and
 * has to be buffered fully in memory on both ends before it's usable —
 * fine for the pilot's document sizes, not a fit for large files. A
 * pre-signed/`blobUrl` upload path exists in the schema for that case but
 * isn't wired up in this UI yet.
 */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read file as base64."));
        return;
      }
      // readAsDataURL yields "data:<mime>;base64,<data>" — strip the prefix.
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

/** Soft warning threshold only — services/hub does not enforce a size cap
 * in V1, this is purely a UI hint about the base64-JSON tradeoff above. */
export const LARGE_FILE_WARNING_BYTES = 5 * 1024 * 1024; // 5MB

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

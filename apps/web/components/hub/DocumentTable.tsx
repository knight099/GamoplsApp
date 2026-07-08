import { Badge, DataTable } from "@gamopls/ui";
import type { DataTableColumn } from "@gamopls/ui";
import { formatBytes } from "./file-encoding";
import type { HubDocument } from "./types";

export interface DocumentTableProps {
  documents: HubDocument[];
}

/** Renders uploaded documents' metadata — filename, mime type, size,
 * uploader, created_at — per PLAN.md 6.7. */
export function DocumentTable({ documents }: DocumentTableProps) {
  const columns: DataTableColumn<HubDocument>[] = [
    { key: "filename", header: "Filename", render: (doc) => doc.filename },
    { key: "mimeType", header: "Type", render: (doc) => <Badge tone="info">{doc.mimeType}</Badge> },
    { key: "size", header: "Size", render: (doc) => formatBytes(doc.size) },
    { key: "uploader", header: "Uploaded by", render: (doc) => doc.uploader },
    {
      key: "createdAt",
      header: "Uploaded",
      render: (doc) => new Date(doc.createdAt).toLocaleString(),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={documents}
      getRowKey={(doc) => doc.id}
      emptyState="No documents uploaded yet."
    />
  );
}

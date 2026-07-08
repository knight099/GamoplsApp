import type { ReactNode } from "react";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyState?: ReactNode;
}

/**
 * Minimal shared table shell — column-driven rendering only, no sorting/
 * pagination/virtualization built in. Consumers (map/chat/board/hub views)
 * layer that on top as needed rather than this package growing a full
 * data-grid product.
 */
export function DataTable<T>({ columns, rows, getRowKey, emptyState }: DataTableProps<T>) {
  if (rows.length === 0) {
    return <div data-testid="data-table-empty">{emptyState ?? "No data"}</div>;
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              style={{
                textAlign: "left",
                borderBottom: "1px solid #e5e7eb",
                padding: "0.5rem",
                fontSize: "0.75rem",
                color: "#6b7280",
                textTransform: "uppercase",
              }}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={getRowKey(row)}>
            {columns.map((col) => (
              <td
                key={col.key}
                style={{ borderBottom: "1px solid #f3f4f6", padding: "0.5rem", fontSize: "0.875rem" }}
              >
                {col.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

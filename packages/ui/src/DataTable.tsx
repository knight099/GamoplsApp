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

/** Shared table shell with premium, clean SaaS style. */
export function DataTable<T>({ columns, rows, getRowKey, emptyState }: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <div 
        data-testid="data-table-empty"
        style={{
          padding: "2rem",
          textAlign: "center",
          color: "var(--muted-foreground, #9ca3af)",
          border: "1px dashed var(--border, rgba(255,255,255,0.1))",
          borderRadius: "var(--radius, 0.5rem)",
          fontSize: "0.875rem",
        }}
      >
        {emptyState ?? "No records found"}
      </div>
    );
  }

  return (
    <div style={{ width: "100%", overflowX: "auto", border: "1px solid var(--border, rgba(255,255,255,0.1))", borderRadius: "var(--radius, 0.5rem)", background: "var(--card, #1e293b)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border, rgba(255,255,255,0.1))", background: "rgba(255,255,255,0.02)" }}>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  textAlign: "left",
                  padding: "0.75rem 1rem",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "var(--muted-foreground, #9ca3af)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr 
              key={getRowKey(row)}
              style={{ 
                borderBottom: "1px solid var(--border, rgba(255,255,255,0.05))",
                transition: "background-color 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.02)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{ 
                    padding: "0.75rem 1rem", 
                    color: "var(--foreground, #fff)",
                  }}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

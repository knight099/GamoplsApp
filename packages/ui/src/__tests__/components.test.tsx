import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "../Badge.js";
import { Button } from "../Button.js";
import { Card } from "../Card.js";
import { DataTable } from "../DataTable.js";
import { KpiTile } from "../KpiTile.js";
import { Spinner } from "../Spinner.js";
import { StatusChip } from "../StatusChip.js";

describe("@gamopls/ui primitives", () => {
  it("renders a Button with its label and variant", () => {
    render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn).toBeDefined();
    expect(btn.getAttribute("data-variant")).toBe("danger");
  });

  it("renders Card children", () => {
    render(<Card>hello</Card>);
    expect(screen.getByText("hello")).toBeDefined();
  });

  it("renders Badge with tone", () => {
    render(<Badge tone="success">Online</Badge>);
    const badge = screen.getByText("Online");
    expect(badge.getAttribute("data-tone")).toBe("success");
  });

  it("renders StatusChip with a tone", () => {
    render(<StatusChip tone="danger">Offline</StatusChip>);
    const chip = screen.getByText("Offline");
    expect(chip.getAttribute("data-tone")).toBe("danger");
  });

  it("renders StatusChip with a different tone", () => {
    render(<StatusChip tone="success">Connected</StatusChip>);
    expect(screen.getByText("Connected").getAttribute("data-tone")).toBe("success");
  });

  it("renders KpiTile with label, value, and unit", () => {
    render(<KpiTile icon={<span>icon</span>} label="Avg fleet health" value="87" unit="%" />);
    expect(screen.getByText("Avg fleet health")).toBeDefined();
    expect(screen.getByText("87")).toBeDefined();
    expect(screen.getByText("%")).toBeDefined();
  });

  it("renders KpiTile's delta row only when delta is provided", () => {
    const { rerender } = render(<KpiTile icon={<span>icon</span>} label="Active alerts" value="3" />);
    expect(screen.queryByText(/vs yesterday/)).toBeNull();
    rerender(
      <KpiTile
        icon={<span>icon</span>}
        label="Active alerts"
        value="3"
        delta={{ label: "+1 vs yesterday", tone: "negative" }}
      />,
    );
    expect(screen.getByText(/\+1 vs yesterday/)).toBeDefined();
  });

  it("renders Spinner with accessible role/label", () => {
    render(<Spinner label="Fetching assets" />);
    expect(screen.getByRole("status", { name: "Fetching assets" })).toBeDefined();
  });

  it("renders DataTable rows via column render fns", () => {
    render(
      <DataTable
        columns={[{ key: "name", header: "Name", render: (r: { name: string }) => r.name }]}
        rows={[{ name: "Vehicle A" }, { name: "Vehicle B" }]}
        getRowKey={(r) => r.name}
      />,
    );
    expect(screen.getByText("Vehicle A")).toBeDefined();
    expect(screen.getByText("Vehicle B")).toBeDefined();
  });

  it("renders DataTable empty state when there are no rows", () => {
    render(
      <DataTable
        columns={[{ key: "name", header: "Name", render: (r: { name: string }) => r.name }]}
        rows={[]}
        getRowKey={(r) => r.name}
        emptyState="Nothing here"
      />,
    );
    expect(screen.getByTestId("data-table-empty").textContent).toBe("Nothing here");
  });
});

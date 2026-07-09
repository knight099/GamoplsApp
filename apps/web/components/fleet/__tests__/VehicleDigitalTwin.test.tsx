// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { VehicleDigitalTwin, computeHotspots } from "../VehicleDigitalTwin";

afterEach(() => cleanup());

describe("computeHotspots", () => {
  it("computes tone per hotspot from its own reading, not the aggregate score", () => {
    const hotspots = computeHotspots(
      { engine_temp_c: 120, battery_pct: 80, fuel_pct: 5 },
      95, // high overall score, but engine and fuel should independently be danger
    );
    const engine = hotspots.find((h) => h.key === "engine")!;
    const battery = hotspots.find((h) => h.key === "battery")!;
    const fuel = hotspots.find((h) => h.key === "fuel")!;
    const overall = hotspots.find((h) => h.key === "overall")!;

    expect(engine.tone).toBe("danger");
    expect(battery.tone).toBe("success");
    expect(fuel.tone).toBe("danger");
    expect(overall.tone).toBe("success");
  });

  it("marks a hotspot as neutral/no-data when its telemetry key is missing", () => {
    const hotspots = computeHotspots({ engine_temp_c: 90 }, 100);
    const battery = hotspots.find((h) => h.key === "battery")!;
    expect(battery.tone).toBe("neutral");
    expect(battery.value).toBeNull();
  });

  it("overall hotspot is always present using healthScore", () => {
    const hotspots = computeHotspots({}, 42);
    const overall = hotspots.find((h) => h.key === "overall")!;
    expect(overall.value).toBe(42);
    expect(overall.tone).toBe("danger");
  });
});

describe("VehicleDigitalTwin", () => {
  it("renders all four hotspot labels and shows detail on click", () => {
    render(<VehicleDigitalTwin telemetry={{ engine_temp_c: 91, battery_pct: 76, fuel_pct: 54 }} healthScore={88} />);

    expect(screen.getByText(/Engine/)).toBeInTheDocument();
    expect(screen.getByText(/Battery/)).toBeInTheDocument();
    expect(screen.getByText(/Fuel/)).toBeInTheDocument();
    expect(screen.getByText(/Overall/)).toBeInTheDocument();

    const engineHotspot = screen.getByTestId("hotspot-engine");
    fireEvent.click(engineHotspot);
    expect(screen.getByText("Engine: 91°C")).toBeInTheDocument();
  });

  it("shows 'No data' for a hotspot with no matching telemetry", () => {
    render(<VehicleDigitalTwin telemetry={{}} healthScore={100} />);
    fireEvent.click(screen.getByTestId("hotspot-battery"));
    expect(screen.getByText("Battery: No data")).toBeInTheDocument();
  });
});

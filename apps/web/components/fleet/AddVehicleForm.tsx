"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@gamopls/ui";
import { Input } from "../ui/input";
import { Plus, ShieldAlert } from "lucide-react";
import type { CreateVehicleInput, VehicleDetails } from "./types";

const VEHICLE_TYPES: VehicleDetails["vehicleType"][] = ["car", "van", "truck", "bike", "bus", "other"];
const FUEL_TYPES: VehicleDetails["fuelType"][] = ["petrol", "diesel", "electric", "hybrid", "cng"];

export interface AddVehicleFormProps {
  onSubmit: (input: CreateVehicleInput) => Promise<void>;
}

export function AddVehicleForm({ onSubmit }: AddVehicleFormProps) {
  const [plateNumber, setPlateNumber] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleDetails["vehicleType"]>("car");
  const [fuelType, setFuelType] = useState<VehicleDetails["fuelType"]>("petrol");
  const [showMore, setShowMore] = useState(false);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [year, setYear] = useState("");
  const [vin, setVin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!plateNumber.trim()) {
      setError("Plate number is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        plateNumber: plateNumber.trim(),
        vehicleType,
        fuelType,
        make: make.trim() || null,
        model: model.trim() || null,
        color: color.trim() || null,
        year: year.trim() || null,
        vin: vin.trim() || null,
      });
      setPlateNumber("");
      setMake("");
      setModel("");
      setColor("");
      setYear("");
      setVin("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add vehicle");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-1.5">
        <Plus className="h-4 w-4 text-cyan-400" />
        Add vehicle
      </h3>
      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Plate number</label>
        <Input
          aria-label="Plate number"
          value={plateNumber}
          onChange={(e) => setPlateNumber(e.target.value)}
          placeholder="e.g. TN-09-AB-1234"
          className="h-8 text-xs bg-background/50 border-border"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Type</label>
          <select
            aria-label="Vehicle type"
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value as VehicleDetails["vehicleType"])}
            className="w-full h-8 px-2 rounded-md bg-background/50 border border-border text-xs text-foreground"
          >
            {VEHICLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fuel</label>
          <select
            aria-label="Fuel type"
            value={fuelType}
            onChange={(e) => setFuelType(e.target.value as VehicleDetails["fuelType"])}
            className="w-full h-8 px-2 rounded-md bg-background/50 border border-border text-xs text-foreground"
          >
            {FUEL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="text-xs font-semibold text-cyan-400 hover:underline"
      >
        {showMore ? "Hide more details" : "More details (optional)"}
      </button>

      {showMore && (
        <div className="grid grid-cols-2 gap-3">
          <Input aria-label="Make" value={make} onChange={(e) => setMake(e.target.value)} placeholder="Make" className="h-8 text-xs bg-background/50 border-border" />
          <Input aria-label="Model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model" className="h-8 text-xs bg-background/50 border-border" />
          <Input aria-label="Color" value={color} onChange={(e) => setColor(e.target.value)} placeholder="Color" className="h-8 text-xs bg-background/50 border-border" />
          <Input aria-label="Year" value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year" className="h-8 text-xs bg-background/50 border-border" />
          <Input aria-label="VIN" value={vin} onChange={(e) => setVin(e.target.value)} placeholder="VIN" className="h-8 text-xs bg-background/50 border-border col-span-2" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded-lg">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <Button type="submit" disabled={submitting || !plateNumber.trim()} style={{ width: "100%", padding: "0.4rem 0.75rem", fontSize: "0.75rem" }}>
        {submitting ? "Adding…" : "Add vehicle"}
      </Button>
    </form>
  );
}

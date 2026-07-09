"use client";

import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Geofence } from "./types";

export interface MapMarkerData {
  id: string;
  icon: string;
  label: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  positionUpdatedAt: string;
  healthScore?: number;
  fuelPct?: number | null;
  odometerKm?: number | null;
}

export interface MapCanvasProps {
  markers: MapMarkerData[];
  geofences: Geofence[];
}

function healthTone(score: number | undefined): "success" | "warning" | "danger" | "neutral" {
  if (score === undefined) return "neutral";
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "danger";
}

const TONE_COLORS: Record<ReturnType<typeof healthTone>, string> = {
  success: "#4ade80",
  warning: "#fbbf24",
  danger: "#f87171",
  neutral: "#9ca3af",
};

function markerIcon(score: number | undefined): L.DivIcon {
  const color = TONE_COLORS[healthTone(score)];
  return L.divIcon({
    className: "gamopls-map-marker",
    html: `<span style="display:block;width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,0.5);"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

const DEFAULT_CENTER: [number, number] = [13.0827, 80.2707]; // Chennai — matches the pilot fleet's home region

export function MapCanvas({ markers, geofences }: MapCanvasProps) {
  const center: [number, number] = markers.length > 0 ? [markers[0].lat, markers[0].lng] : DEFAULT_CENTER;

  return (
    <MapContainer center={center} zoom={12} style={{ height: "480px", width: "100%", borderRadius: "0.75rem" }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {markers.map((marker) => (
        <Marker key={marker.id} position={[marker.lat, marker.lng]} icon={markerIcon(marker.healthScore)}>
          <Popup>{marker.label}</Popup>
        </Marker>
      ))}
      {geofences.map((geofence) => (
        <Circle
          key={geofence.id}
          center={[geofence.centerLat, geofence.centerLng]}
          radius={geofence.radiusMeters}
          pathOptions={{ color: "#22d3ee", fillOpacity: 0.1 }}
        />
      ))}
    </MapContainer>
  );
}

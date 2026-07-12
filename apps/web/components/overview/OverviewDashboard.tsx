"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Spinner } from "@gamopls/ui";
import * as fleetApi from "@/components/fleet/api";
import * as boardApi from "@/components/board/api";
import * as chatApi from "@/components/chat/api";
import type { Asset } from "@/components/fleet/types";
import type { Task } from "@/components/board/types";
import type { ChatMessage } from "@/components/chat/types";
import { computeFleetHealth } from "@/lib/fleet-health";
import { filterAlertMessages, mergeEvents } from "@/lib/events-feed";
import { VehiclesTable } from "@/components/fleet/VehiclesTable";
import { OverviewKpiRow } from "./OverviewKpiRow";
import { EventsFeed } from "./EventsFeed";

const POLL_INTERVAL_MS = 15000;
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;
const ALERT_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface OverviewDashboardProps {
  fleetId: string;
}

function countOnline(vehicles: Asset[]): number {
  const now = Date.now();
  return vehicles.filter(
    (v) => v.telemetry_updated_at !== null && now - new Date(v.telemetry_updated_at).getTime() < ONLINE_THRESHOLD_MS,
  ).length;
}

function avgMileage(vehicles: Asset[]): number | null {
  const values = vehicles.map((v) => v.last_mileage_kmpl).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Composes three already-existing gateway clients into one dashboard: no
 * backend changes anywhere in this component. Alerts are sourced from the
 * *earliest*-created channel belonging to the current fleet, mirroring
 * services/chat/src/alert-bridge.ts's own channel-resolution rule exactly
 * (it always posts to that same channel) — this is not a heuristic, it's a
 * client-side replica of a server-side invariant.
 */
export function OverviewDashboard({ fleetId }: OverviewDashboardProps) {
  const [vehicles, setVehicles] = useState<Asset[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [alertMessages, setAlertMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const isFirstLoad = useRef(true);

  const load = useCallback(async () => {
    if (isFirstLoad.current) setLoading(true);
    try {
      const [vehiclesData, tasksData, channels] = await Promise.all([
        fleetApi.listVehicles(),
        boardApi.listTasks(),
        chatApi.fetchChannels(),
      ]);
      setVehicles(vehiclesData);
      setTasks(tasksData.filter((t) => t.status === "draft"));

      const fleetChannels = channels
        .filter((c) => c.fleet_id === fleetId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const alertChannel = fleetChannels[0];
      if (alertChannel) {
        const messages = await chatApi.fetchMessages(alertChannel.id);
        setAlertMessages(filterAlertMessages(messages));
      } else {
        setAlertMessages([]);
      }
    } catch {
      // Glance dashboard, not any page's source of truth — a failed poll
      // leaves the last-known data on screen instead of showing an error.
    } finally {
      setLoading(false);
      isFirstLoad.current = false;
    }
  }, [fleetId]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size={32} label="Loading overview" />
      </div>
    );
  }

  const health = computeFleetHealth(vehicles);
  const activeAlerts24h = alertMessages.filter(
    (m) => Date.now() - new Date(m.createdAt).getTime() < ALERT_WINDOW_MS,
  ).length;
  const events = mergeEvents(tasks, alertMessages);
  const isEmpty = vehicles.length === 0 && events.length === 0;

  if (isEmpty) {
    return (
      <div className="text-center py-24 space-y-3">
        <p className="text-lg font-semibold text-foreground">Get started</p>
        <p className="text-sm text-muted-foreground">Add your first vehicle to start seeing fleet data here.</p>
        <Link
          href="/fleet"
          className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Add vehicle
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OverviewKpiRow
        vehiclesOnline={countOnline(vehicles)}
        vehiclesTotal={vehicles.length}
        avgHealth={health.avg}
        activeAlerts24h={activeAlerts24h}
        avgMileageKmpl={avgMileage(vehicles)}
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Vehicles</h2>
          {vehicles.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12 border border-dashed border-border rounded-lg">
              No vehicles yet — <Link href="/fleet" className="text-primary hover:underline">add one</Link>.
            </p>
          ) : (
            <VehiclesTable vehicles={vehicles} />
          )}
        </div>
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
          <EventsFeed events={events} />
        </div>
      </div>
    </div>
  );
}

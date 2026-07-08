#!/usr/bin/env node
/**
 * scripts/start-all.mjs
 *
 * Orchestration script to spin up the entire GAMOPLS TeamCore platform at once:
 *   1. Starts local docker compose services (NATS & MQTT broker).
 *   2. Waits for NATS (4222) and MQTT (1883) to be fully reachable.
 *   3. Loads root .env variables.
 *   4. Launches in parallel:
 *      - Javascript/Typescript workspace services (via pnpm dev)
 *      - Go Ingestion service (core-ingestion)
 *      - Python AI Engine service (ai-engine server)
 *      - Edge Box Simulator (telemetry simulator)
 *   5. Prefixes and redirects all logs to the terminal, color-coded.
 *   6. Handles graceful teardown of all services on Ctrl+C.
 */

import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// Color helpers
const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

const LOG_PREFIXES = {
  docker: `${COLORS.blue}[DOCKER]${COLORS.reset}`,
  webServices: `${COLORS.cyan}[JS-SERVICES]${COLORS.reset}`,
  goIngest: `${COLORS.green}[GO-INGEST]${COLORS.reset}`,
  pyAI: `${COLORS.magenta}[PY-AI]${COLORS.reset}`,
  simulator: `${COLORS.yellow}[SIMULATOR]${COLORS.reset}`,
};

const activeProcesses = [];

/**
 * Loads and parses root .env file.
 */
function loadEnv() {
  const envPath = path.join(rootDir, ".env");
  if (!fs.existsSync(envPath)) {
    console.log(`${COLORS.yellow}Warning: No .env file found at root. Using system env.${COLORS.reset}`);
    return {};
  }
  const env = {};
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

/**
 * Wait for a port to become reachable.
 */
function waitForPort(port, host = "127.0.0.1", timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket
        .connect(port, host, () => {
          socket.destroy();
          resolve();
        })
        .on("error", () => {
          socket.destroy();
          if (Date.now() - start > timeoutMs) {
            reject(new Error(`Timeout waiting for port ${port} on ${host}`));
          } else {
            setTimeout(check, 500);
          }
        })
        .on("timeout", () => {
          socket.destroy();
          if (Date.now() - start > timeoutMs) {
            reject(new Error(`Timeout waiting for port ${port} on ${host}`));
          } else {
            setTimeout(check, 500);
          }
        });
    };
    check();
  });
}

/**
 * Prefix and print a stream of data.
 */
function handleLogStream(prefix, stream) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    // Keep the last partial line in the buffer
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.trim()) {
        console.log(`${prefix} ${line}`);
      }
    }
  });
}

/**
 * Spawn a child process and track it.
 */
function startProcess(name, prefix, cmd, args, cwd, env) {
  console.log(`${prefix} Starting: ${cmd} ${args.join(" ")}...`);
  const childEnv = { ...process.env, ...env };
  const child = spawn(cmd, args, { cwd, env: childEnv });

  activeProcesses.push({ name, child });

  handleLogStream(prefix, child.stdout);
  handleLogStream(prefix, child.stderr);

  child.on("close", (code) => {
    console.log(`${prefix} Process exited with code ${code}`);
  });

  child.on("error", (err) => {
    console.error(`${prefix} Process encountered error:`, err);
  });
}

/**
 * Shutdown all active processes gracefully.
 */
function shutdown() {
  console.log(`\n${COLORS.bright}${COLORS.red}Shutting down all services...${COLORS.reset}`);
  
  // Kill simulator first to stop telemetry flow
  const simulator = activeProcesses.find(p => p.name === "simulator");
  if (simulator) {
    console.log("Stopping simulator...");
    simulator.child.kill("SIGINT");
  }

  // Kill other services
  for (const proc of activeProcesses) {
    if (proc.name !== "simulator") {
      console.log(`Stopping ${proc.name}...`);
      proc.child.kill("SIGINT");
    }
  }

  // Docker compose down
  try {
    console.log("Bringing down docker services...");
    execSync("docker-compose -f infra/docker-compose.yml down", { stdio: "inherit" });
  } catch (err) {
    console.error("Failed to bring down docker services:", err.message);
  }

  console.log(`${COLORS.green}Cleanup complete. Goodbye!${COLORS.reset}`);
  process.exit(0);
}

// Register signals
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function main() {
  const env = loadEnv();
  
  console.log(`${COLORS.bright}${COLORS.cyan}=== GAMOPLS TEAMCORE LOCAL RUNNER ===${COLORS.reset}\n`);

  // 1. Docker compose up
  try {
    console.log(`${LOG_PREFIXES.docker} Starting Postgres, Redis, NATS, and MQTT services...`);
    execSync("docker-compose -f infra/docker-compose.yml up -d", { stdio: "inherit", cwd: rootDir });
  } catch (err) {
    console.error(`${LOG_PREFIXES.docker} Failed to start docker services:`, err.message);
    process.exit(1);
  }

  // 2. Wait for NATS (4222) and MQTT (1883)
  try {
    console.log(`${LOG_PREFIXES.docker} Waiting for NATS and MQTT to start listening...`);
    await Promise.all([
      waitForPort(4222),
      waitForPort(1883),
    ]);
    console.log(`${LOG_PREFIXES.docker} NATS (4222) and MQTT (1883) are healthy.`);
  } catch (err) {
    console.error(`${LOG_PREFIXES.docker} Port healthcheck failed:`, err.message);
    shutdown();
  }

  // 3. Start services
  // A. JS/TS Workspace services
  startProcess(
    "js-services", 
    LOG_PREFIXES.webServices, 
    "pnpm", 
    ["dev"], 
    rootDir, 
    env
  );

  // B. Go Ingestion
  startProcess(
    "go-ingest", 
    LOG_PREFIXES.goIngest, 
    "go", 
    ["run", "cmd/core-ingestion/main.go"], 
    path.join(rootDir, "services/core-ingestion"), 
    env
  );

  // C. Python AI Engine
  startProcess(
    "py-ai", 
    LOG_PREFIXES.pyAI, 
    "uv", 
    ["run", "python", "src/ai_engine/server.py"], 
    path.join(rootDir, "services/ai-engine"), 
    env
  );

  // Wait 5 seconds before starting the simulator so services can initialize and subscribe
  console.log(`${LOG_PREFIXES.simulator} Delaying simulator start by 5s to allow subscriptions...`);
  await new Promise(resolve => setTimeout(resolve, 5000));

  // D. Edgebox Simulator
  startProcess(
    "simulator", 
    LOG_PREFIXES.simulator, 
    "go", 
    ["run", "main.go", "-devices", "3", "-interval", "2s"], 
    path.join(rootDir, "infra/simulators/edgebox-sim"), 
    env
  );

  console.log(`\n${COLORS.bright}${COLORS.green}All services running! Press Ctrl+C to terminate.${COLORS.reset}\n`);
}

main().catch((err) => {
  console.error("Main execution failed:", err);
  shutdown();
});

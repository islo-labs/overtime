import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import cron from "node-cron";
import type { JobConfig, Credentials } from "./config.js";
import { runJob, type JobResult } from "./runner.js";
import { notifySlack } from "./notify.js";
import { nextRun } from "./cron.js";

export type JobStatus = "idle" | "running" | "done" | "error";

export interface JobState {
  config: JobConfig;
  status: JobStatus;
  lastResult?: JobResult;
  lastRun?: Date;
  nextRun: Date;
}

// --- Persistent history ---

const OVERTIME_DIR = resolve(homedir(), ".overtime");
const HISTORY_FILE = resolve(OVERTIME_DIR, "history.json");
const LOGS_DIR = resolve(OVERTIME_DIR, "logs");

interface HistoryEntry {
  status: "done" | "error";
  lastRun: string;
  durationMs: number;
  success: boolean;
  cost?: number;
  sessionId?: string;
}

function loadHistory(): Record<string, HistoryEntry> {
  if (!existsSync(HISTORY_FILE)) return {};
  try {
    return JSON.parse(readFileSync(HISTORY_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveHistory(history: Record<string, HistoryEntry>) {
  mkdirSync(OVERTIME_DIR, { recursive: true });
  writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2) + "\n");
}

function saveJobLog(name: string, result: JobResult) {
  mkdirSync(LOGS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logFile = resolve(LOGS_DIR, `${name}-${timestamp}.log`);
  const header = [
    `Job: ${name}`,
    `Status: ${result.success ? "success" : "failed"}`,
    `Duration: ${(result.durationMs / 1000).toFixed(1)}s`,
    result.cost ? `Cost: $${result.cost.toFixed(4)}` : null,
    `Exit code: ${result.exitCode}`,
    `---`,
  ]
    .filter(Boolean)
    .join("\n");

  writeFileSync(logFile, header + "\n" + result.output + (result.error ? "\n\nSTDERR:\n" + result.error : "") + "\n");
}

function loadLatestLog(name: string): JobResult | undefined {
  if (!existsSync(LOGS_DIR)) return undefined;

  const files = readdirSync(LOGS_DIR)
    .filter((f) => f.startsWith(name + "-") && f.endsWith(".log"))
    .sort()
    .reverse();

  if (files.length === 0) return undefined;

  const content = readFileSync(resolve(LOGS_DIR, files[0]), "utf-8");
  const divider = content.indexOf("---\n");
  const header = divider >= 0 ? content.slice(0, divider) : "";
  const body = divider >= 0 ? content.slice(divider + 4) : content;

  const success = header.includes("Status: success");
  const durationMatch = header.match(/Duration: ([\d.]+)s/);
  const exitMatch = header.match(/Exit code: (\d+|null)/);
  const costMatch = header.match(/Cost: \$([\d.]+)/);

  // Split body into output and stderr
  const stderrIdx = body.indexOf("\n\nSTDERR:\n");
  const output = stderrIdx >= 0 ? body.slice(0, stderrIdx) : body.trimEnd();
  const error = stderrIdx >= 0 ? body.slice(stderrIdx + 9).trimEnd() : undefined;

  return {
    success,
    output,
    error,
    durationMs: durationMatch ? parseFloat(durationMatch[1]) * 1000 : 0,
    exitCode: exitMatch?.[1] === "null" ? null : parseInt(exitMatch?.[1] ?? "0"),
    cost: costMatch ? parseFloat(costMatch[1]) : undefined,
  };
}

// --- Scheduler ---

export class Scheduler {
  private jobs = new Map<string, JobState>();
  private tasks = new Map<string, cron.ScheduledTask>();
  private abortControllers = new Map<string, AbortController>();
  private listeners: Array<() => void> = [];
  private history: Record<string, HistoryEntry>;

  constructor(
    private configs: JobConfig[],
    private credentials: Credentials = {},
    private configPath?: string
  ) {
    this.history = loadHistory();

    for (const config of configs) {
      const past = this.history[config.name];
      this.jobs.set(config.name, {
        config,
        status: past?.status ?? "idle",
        lastResult: loadLatestLog(config.name),
        lastRun: past?.lastRun ? new Date(past.lastRun) : undefined,
        nextRun: nextRun(config.schedule),
      });
    }
  }

  getJobs(): JobState[] {
    return Array.from(this.jobs.values());
  }

  onStateChange(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notify() {
    for (const cb of this.listeners) cb();
  }

  start() {
    for (const config of this.configs) {
      const task = cron.schedule(config.schedule, () => {
        this.executeJob(config.name);
      });
      this.tasks.set(config.name, task);
    }
  }

  async stop(): Promise<void> {
    for (const task of this.tasks.values()) {
      task.stop();
    }
    this.tasks.clear();

    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }

    const deadline = Date.now() + 30_000;
    while (this.abortControllers.size > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  async runNow(name: string): Promise<void> {
    await this.executeJob(name);
  }

  getSessionId(name: string): string | undefined {
    const state = this.jobs.get(name);
    return state?.lastResult?.sessionId ?? this.history[name]?.sessionId;
  }

  deleteJob(name: string): boolean {
    const state = this.jobs.get(name);
    if (!state || state.status === "running") return false;

    // Stop cron task
    const task = this.tasks.get(name);
    if (task) {
      task.stop();
      this.tasks.delete(name);
    }

    // Remove from state
    this.jobs.delete(name);
    this.configs = this.configs.filter((c) => c.name !== name);

    // Remove from history
    delete this.history[name];
    saveHistory(this.history);

    // Update overtime.yml
    if (this.configPath) {
      try {
        const raw = readFileSync(this.configPath, "utf-8");
        const doc = parseYaml(raw);
        if (doc?.jobs) {
          doc.jobs = doc.jobs.filter((j: { name: string }) => j.name !== name);
          writeFileSync(this.configPath, stringifyYaml(doc));
        }
      } catch {
        // Config update failed — job is still removed from runtime
      }
    }

    this.notify();
    return true;
  }

  private async executeJob(name: string): Promise<void> {
    const state = this.jobs.get(name);
    if (!state) return;

    if (state.status === "running") return;

    const controller = new AbortController();
    this.abortControllers.set(name, controller);

    state.status = "running";
    this.notify();

    try {
      const result = await runJob(state.config, this.credentials, controller.signal);

      state.status = result.success ? "done" : "error";
      state.lastResult = result;
      state.lastRun = new Date();
      state.nextRun = nextRun(state.config.schedule);

      // Persist to disk
      this.history[name] = {
        status: state.status,
        lastRun: state.lastRun.toISOString(),
        durationMs: result.durationMs,
        success: result.success,
        cost: result.cost,
        sessionId: result.sessionId,
      };
      saveHistory(this.history);
      saveJobLog(name, result);

      if (state.config.notify === "slack") {
        notifySlack(name, result, this.credentials).catch(() => {});
      }
    } catch (err) {
      state.status = "error";
      state.lastRun = new Date();
      state.lastResult = {
        success: false,
        output: "",
        error: (err as Error).message,
        durationMs: 0,
        exitCode: null,
      };

      this.history[name] = {
        status: "error",
        lastRun: state.lastRun.toISOString(),
        durationMs: 0,
        success: false,
      };
      saveHistory(this.history);
    } finally {
      this.abortControllers.delete(name);
      this.notify();
    }
  }
}

import cron from "node-cron";
import type { JobConfig } from "./config.js";
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

export class Scheduler {
  private jobs = new Map<string, JobState>();
  private tasks = new Map<string, cron.ScheduledTask>();
  private abortControllers = new Map<string, AbortController>();
  private listeners: Array<() => void> = [];

  constructor(private configs: JobConfig[]) {
    for (const config of configs) {
      this.jobs.set(config.name, {
        config,
        status: "idle",
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
    // Stop all cron tasks
    for (const task of this.tasks.values()) {
      task.stop();
    }
    this.tasks.clear();

    // Abort running jobs
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }

    // Wait for running jobs to finish (up to 30s)
    const deadline = Date.now() + 30_000;
    while (this.abortControllers.size > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  async runNow(name: string): Promise<void> {
    await this.executeJob(name);
  }

  private async executeJob(name: string): Promise<void> {
    const state = this.jobs.get(name);
    if (!state) return;

    // Overlap prevention
    if (state.status === "running") return;

    const controller = new AbortController();
    this.abortControllers.set(name, controller);

    state.status = "running";
    this.notify();

    try {
      const result = await runJob(state.config, controller.signal);

      state.status = result.success ? "done" : "error";
      state.lastResult = result;
      state.lastRun = new Date();
      state.nextRun = nextRun(state.config.schedule);

      // Fire-and-forget notification
      if (state.config.notify === "slack") {
        notifySlack(name, result).catch(() => {});
      }
    } catch (err) {
      state.status = "error";
      state.lastResult = {
        success: false,
        output: "",
        error: (err as Error).message,
        durationMs: 0,
        exitCode: null,
      };
    } finally {
      this.abortControllers.delete(name);
      this.notify();
    }
  }
}

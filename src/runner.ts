import { spawn } from "node:child_process";
import type { ShiftConfig, Credentials } from "./config.js";

export interface JobResult {
  success: boolean;
  output: string;
  error?: string;
  durationMs: number;
  exitCode: number | null;
  cost?: number;
  sessionId?: string;
}

export function runShift(
  job: ShiftConfig,
  credentials?: Credentials,
  signal?: AbortSignal,
  onOutput?: (chunk: string) => void
): Promise<JobResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const args = ["--print"];

    if (job.model) args.push("--model", job.model);
    if (job.maxBudget) args.push("--max-turns", "50");

    args.push(job.task);

    const credEnv: Record<string, string> = {};
    if (credentials?.githubToken) credEnv.GITHUB_TOKEN = credentials.githubToken;
    if (credentials?.linearApiKey) credEnv.LINEAR_API_KEY = credentials.linearApiKey;
    if (credentials?.anthropicApiKey) credEnv.ANTHROPIC_API_KEY = credentials.anthropicApiKey;

    const child = spawn("claude", args, {
      cwd: job.workdir ?? process.cwd(),
      env: { ...process.env, ...credEnv, ...job.env },
      stdio: ["ignore", "pipe", "pipe"],
      signal,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      onOutput?.(text);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      onOutput?.(`[stderr] ${text}`);
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000);
    }, job.timeout * 1000);

    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      const durationMs = Date.now() - start;

      resolve({
        success: code === 0,
        output: stdout,
        error: stderr || undefined,
        durationMs,
        exitCode: code,
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      onOutput?.(`[error] ${err.message}`);
      resolve({
        success: false,
        output: "",
        error: err.message,
        durationMs: Date.now() - start,
        exitCode: null,
      });
    });
  });
}

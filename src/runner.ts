import { spawn } from "node:child_process";
import type { JobConfig, Credentials } from "./config.js";

export interface JobResult {
  success: boolean;
  output: string;
  error?: string;
  durationMs: number;
  exitCode: number | null;
  cost?: number;
}

export function runJob(
  job: JobConfig,
  credentials?: Credentials,
  signal?: AbortSignal
): Promise<JobResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const args = ["--print", "--output-format", "json"];

    if (job.model) args.push("--model", job.model);
    if (job.maxBudget) args.push("--max-turns", "50");

    args.push(job.task);

    // Inject stored credentials as env vars so the agent can use them
    const credEnv: Record<string, string> = {};
    if (credentials?.githubToken) credEnv.GITHUB_TOKEN = credentials.githubToken;
    if (credentials?.linearApiKey) credEnv.LINEAR_API_KEY = credentials.linearApiKey;
    if (credentials?.anthropicApiKey) credEnv.ANTHROPIC_API_KEY = credentials.anthropicApiKey;

    const child = spawn(job.agent, args, {
      cwd: job.workdir ?? process.cwd(),
      env: { ...process.env, ...credEnv, ...job.env },
      stdio: ["ignore", "pipe", "pipe"],
      signal,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // Timeout
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000);
    }, job.timeout * 1000);

    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      const durationMs = Date.now() - start;

      // Try to parse JSON output for metadata
      let output = stdout;
      let cost: number | undefined;

      try {
        const parsed = JSON.parse(stdout);
        output = parsed.result ?? parsed.content ?? stdout;
        cost = parsed.cost_usd ?? parsed.cost;
      } catch {
        // Not JSON, use raw stdout
      }

      resolve({
        success: code === 0,
        output,
        error: stderr || undefined,
        durationMs,
        exitCode: code,
        cost,
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
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

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { parseToCron } from "./cron.js";

const JobSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Job name must be lowercase alphanumeric with dashes"),
  schedule: z.string(),
  task: z.string().min(1),
  agent: z.string().default("claude"),
  notify: z.enum(["slack"]).optional(),
  model: z.string().optional(),
  maxBudget: z.number().positive().optional(),
  timeout: z.number().positive().default(300),
  workdir: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const ConfigSchema = z
  .object({
    defaults: z
      .object({
        agent: z.string().optional(),
        timeout: z.number().positive().optional(),
        notify: z.enum(["slack"]).optional(),
      })
      .optional(),
    jobs: z.array(JobSchema).min(1, "At least one job is required"),
  })
  .refine(
    (config) => {
      const names = config.jobs.map((j) => j.name);
      return new Set(names).size === names.length;
    },
    { message: "Job names must be unique" }
  );

export type JobConfig = z.infer<typeof JobSchema>;
export type OvertimeConfig = z.infer<typeof ConfigSchema>;

// --- Credentials ---

export interface Credentials {
  githubToken?: string;
  linearApiKey?: string;
  slackWebhookUrl?: string;
  anthropicApiKey?: string;
}

export function loadCredentials(): Credentials {
  const credPath = resolve(homedir(), ".overtime", "credentials.json");
  let stored: Record<string, string> = {};

  if (existsSync(credPath)) {
    try {
      stored = JSON.parse(readFileSync(credPath, "utf-8"));
    } catch {
      // Corrupted file, ignore
    }
  }

  // Env vars override stored credentials
  return {
    githubToken: process.env.GITHUB_TOKEN ?? stored.githubToken,
    linearApiKey: process.env.LINEAR_API_KEY ?? stored.linearApiKey,
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL ?? stored.slackWebhookUrl,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? stored.anthropicApiKey,
  };
}

// --- Config loading ---

function resolveEnvVars(text: string): string {
  return text.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? "");
}

export function loadConfig(configPath?: string): OvertimeConfig & { configPath: string } {
  const candidates = configPath
    ? [configPath]
    : ["overtime.yml", "overtime.yaml", ".overtime.yml"];

  const found = candidates.map((c) => resolve(c)).find((c) => existsSync(c));

  if (!found) {
    console.error(
      `No config file found. Run "overtime init" to get started, or create overtime.yml manually.`
    );
    process.exit(1);
  }

  const raw = readFileSync(found, "utf-8");
  const resolved = resolveEnvVars(raw);
  const parsed = parseYaml(resolved);

  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    console.error(`Invalid config (${found}):\n`);
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  const config = result.data!;
  const defaults = config.defaults;

  // Merge defaults into jobs
  if (defaults) {
    for (const job of config.jobs) {
      if (defaults.agent && job.agent === "claude") {
        job.agent = defaults.agent;
      }
      if (defaults.timeout && job.timeout === 300) {
        job.timeout = defaults.timeout;
      }
      if (defaults.notify && !job.notify) {
        job.notify = defaults.notify;
      }
    }
  }

  // Convert natural language schedules to cron
  for (const job of config.jobs) {
    const cron = parseToCron(job.schedule);
    if (!cron) {
      console.error(
        `Invalid schedule for job "${job.name}": "${job.schedule}"\n` +
          `  Examples: "every hour", "every day at 9am", "every monday at 2pm"`
      );
      process.exit(1);
    }
    job.schedule = cron;
  }

  return { ...config, configPath: found };
}

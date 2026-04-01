import { program } from "commander";
import { loadConfig } from "./config.js";
import { Scheduler } from "./scheduler.js";
import { runJob } from "./runner.js";
import { notifySlack } from "./notify.js";

program
  .name("overtime")
  .description("Cron for AI agents")
  .version("0.1.0")
  .option("-c, --config <path>", "Path to config file");

// Default command: start TUI
program
  .command("start", { isDefault: true })
  .description("Start the scheduler with TUI dashboard")
  .action(async (_, cmd) => {
    const opts = cmd.optsWithGlobals();
    const config = loadConfig(opts.config);
    const scheduler = new Scheduler(config.jobs);

    // Dynamic import to avoid loading React for `run` command
    const { render } = await import("ink");
    const React = await import("react");
    const { App } = await import("./app.js");

    const { unmount, waitUntilExit } = render(
      React.createElement(App, { scheduler })
    );

    // Handle SIGINT/SIGTERM
    const shutdown = async () => {
      await scheduler.stop();
      unmount();
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    await waitUntilExit();
  });

// Run a single job immediately
program
  .command("run <job>")
  .description("Run a single job immediately (no TUI)")
  .action(async (jobName: string, _, cmd) => {
    const opts = cmd.optsWithGlobals();
    const config = loadConfig(opts.config);
    const job = config.jobs.find((j) => j.name === jobName);

    if (!job) {
      console.error(
        `Job "${jobName}" not found. Available: ${config.jobs.map((j) => j.name).join(", ")}`
      );
      process.exit(1);
      return;
    }

    console.log(`Running "${jobName}"...`);
    const result = await runJob(job);

    console.log(result.output);
    if (result.error) console.error(result.error);

    const duration = (result.durationMs / 1000).toFixed(1);
    const cost = result.cost ? ` | $${result.cost.toFixed(4)}` : "";
    console.log(
      `\n${result.success ? "✓" : "✗"} ${duration}s${cost}`
    );

    if (job.notify === "slack") {
      await notifySlack(jobName, result);
    }

    process.exit(result.success ? 0 : 1);
  });

program.parse();

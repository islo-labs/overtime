import React from "react";
import { Box, Text, useInput, useApp } from "ink";
import type { JobState, JobStatus } from "./scheduler.js";
import { formatRelativeTime, describeCron } from "./cron.js";

// --- Status formatting ---

function statusColor(status: JobStatus): string {
  switch (status) {
    case "idle":
      return "gray";
    case "running":
      return "yellow";
    case "done":
      return "green";
    case "error":
      return "red";
  }
}

function statusLabel(status: JobStatus): string {
  switch (status) {
    case "idle":
      return "idle";
    case "running":
      return "⟳ running";
    case "done":
      return "✓ done";
    case "error":
      return "✗ error";
  }
}

function formatLastRun(date?: Date): string {
  if (!date) return "-";
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

// --- Column widths ---

const COL = { name: 18, schedule: 18, status: 12, lastRun: 12, next: 14 };

// --- Components ---

function Header() {
  return (
    <Box>
      <Text bold color="gray">
        <Text>{pad("JOB", COL.name)}</Text>
        <Text>{pad("SCHEDULE", COL.schedule)}</Text>
        <Text>{pad("STATUS", COL.status)}</Text>
        <Text>{pad("LAST RUN", COL.lastRun)}</Text>
        <Text>{"NEXT RUN"}</Text>
      </Text>
    </Box>
  );
}

function JobRow({
  job,
  selected,
}: {
  job: JobState;
  selected: boolean;
}) {
  const color = statusColor(job.status);
  const pointer = selected ? "▸ " : "  ";

  return (
    <Box>
      <Text inverse={selected}>
        <Text>{pointer}</Text>
        <Text bold={selected}>{pad(job.config.name, COL.name)}</Text>
        <Text dimColor>{pad(describeCron(job.config.schedule), COL.schedule)}</Text>
        <Text color={color}>{pad(statusLabel(job.status), COL.status)}</Text>
        <Text dimColor>{pad(formatLastRun(job.lastRun), COL.lastRun)}</Text>
        <Text>{formatRelativeTime(job.nextRun)}</Text>
      </Text>
    </Box>
  );
}

function StatusBar({ mode }: { mode: "table" | "output" }) {
  if (mode === "output") {
    return (
      <Box marginTop={1}>
        <Text dimColor>
          [esc] back  [q] quit
        </Text>
      </Box>
    );
  }

  return (
    <Box marginTop={1}>
      <Text dimColor>
        [↑↓] select  [r] run  [s] resume session  [d] delete  [enter] output  [q] quit
      </Text>
    </Box>
  );
}

function OutputView({ job }: { job: JobState }) {
  const output =
    job.lastResult?.output || job.lastResult?.error || "No output yet — run the job first or check ~/.overtime/logs/";

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>
          {job.config.name}
          <Text dimColor>
            {" "}
            — {job.lastResult?.success ? "✓ success" : job.lastResult ? "✗ failed" : "no runs yet"}
            {job.lastResult
              ? ` (${(job.lastResult.durationMs / 1000).toFixed(1)}s)`
              : ""}
            {job.lastResult?.cost
              ? ` $${job.lastResult.cost.toFixed(4)}`
              : ""}
          </Text>
        </Text>
      </Box>
      <Text>{output}</Text>
    </Box>
  );
}

// --- Main Dashboard ---

export function Dashboard({
  jobs,
  onRunJob,
  onDeleteJob,
  onResumeJob,
  onQuit,
}: {
  jobs: JobState[];
  onRunJob: (name: string) => void;
  onDeleteJob: (name: string) => void;
  onResumeJob: (name: string) => void;
  onQuit: () => void;
}) {
  const { exit } = useApp();
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [mode, setMode] = React.useState<"table" | "output">("table");

  useInput((input, key) => {
    if (input === "q") {
      onQuit();
      exit();
      return;
    }

    if (mode === "output") {
      if (key.escape || key.return) {
        setMode("table");
      }
      return;
    }

    // Table mode
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIndex((i) => Math.min(jobs.length - 1, i + 1));
    } else if (input === "r") {
      const job = jobs[selectedIndex];
      if (job && job.status !== "running") {
        onRunJob(job.config.name);
      }
    } else if (input === "d") {
      const job = jobs[selectedIndex];
      if (job && job.status !== "running") {
        onDeleteJob(job.config.name);
        setSelectedIndex((i) => Math.min(i, jobs.length - 2));
      }
    } else if (input === "s") {
      const job = jobs[selectedIndex];
      if (job) {
        onResumeJob(job.config.name);
      }
    } else if (key.return) {
      setMode("output");
    }
  });

  const selectedJob = jobs[selectedIndex];

  if (mode === "output" && selectedJob) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        paddingX={1}
      >
        <OutputView job={selectedJob} />
        <StatusBar mode="output" />
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      paddingY={1}
    >
      <Box marginBottom={1}>
        <Text bold color="cyan">
          overtime
        </Text>
        <Text dimColor> — {jobs.length} jobs</Text>
      </Box>

      <Header />
      {jobs.map((job, i) => (
        <JobRow key={job.config.name} job={job} selected={i === selectedIndex} />
      ))}

      <StatusBar mode="table" />
    </Box>
  );
}

// --- Helpers ---

function pad(str: string, width: number): string {
  return str.length >= width ? str.slice(0, width) : str + " ".repeat(width - str.length);
}

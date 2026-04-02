import React from "react";
import { Box, Text, useInput, useApp } from "ink";
import type { ShiftState, ShiftStatus } from "./scheduler.js";
import { formatRelativeTime, describeCron } from "./cron.js";

function statusColor(status: ShiftStatus): string {
  switch (status) {
    case "idle": return "gray";
    case "running": return "yellow";
    case "done": return "green";
    case "error": return "red";
  }
}

function statusLabel(status: ShiftStatus): string {
  switch (status) {
    case "idle": return "idle";
    case "running": return "⟳ running";
    case "done": return "✓ done";
    case "error": return "✗ error";
  }
}

function formatLastRun(date?: Date): string {
  if (!date) return "-";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

const COL = { name: 18, schedule: 18, status: 12, lastRun: 12, next: 14 };

function Header() {
  return (
    <Box>
      <Text bold color="gray">
        <Text>{pad("SHIFT", COL.name)}</Text>
        <Text>{pad("SCHEDULE", COL.schedule)}</Text>
        <Text>{pad("STATUS", COL.status)}</Text>
        <Text>{pad("LAST RUN", COL.lastRun)}</Text>
        <Text>{"NEXT RUN"}</Text>
      </Text>
    </Box>
  );
}

function ShiftRow({ shift, selected }: { shift: ShiftState; selected: boolean }) {
  const color = statusColor(shift.status);
  const pointer = selected ? "▸ " : "  ";

  return (
    <Box>
      <Text inverse={selected}>
        <Text>{pointer}</Text>
        <Text bold={selected}>{pad(shift.config.name, COL.name)}</Text>
        <Text dimColor>{pad(describeCron(shift.config.schedule), COL.schedule)}</Text>
        <Text color={color}>{pad(statusLabel(shift.status), COL.status)}</Text>
        <Text dimColor>{pad(formatLastRun(shift.lastRun), COL.lastRun)}</Text>
        <Text>{formatRelativeTime(shift.nextRun)}</Text>
      </Text>
    </Box>
  );
}

function StatusBar({ mode }: { mode: "table" | "output" }) {
  if (mode === "output") {
    return (
      <Box marginTop={1}>
        <Text dimColor>[r] run  [s] resume session  [esc] back  [q] quit</Text>
      </Box>
    );
  }
  return (
    <Box marginTop={1}>
      <Text dimColor>[↑↓] select  [r] run  [s] resume session  [d] delete  [enter] output  [q] quit</Text>
    </Box>
  );
}

function OutputView({ shift }: { shift: ShiftState }) {
  const isRunning = shift.status === "running";
  const hasOutput = (shift.lastResult?.output?.length ?? 0) > 0;
  const hasError = (shift.lastResult?.error?.length ?? 0) > 0;

  let output: string;
  if (isRunning && !hasOutput) {
    output = "Running — output will appear when the shift completes...";
  } else if (hasOutput) {
    output = shift.lastResult!.output;
  } else if (hasError) {
    output = shift.lastResult!.error!;
  } else {
    output = "No output yet — press [r] to run or wait for the next scheduled run.";
  }

  const statusText = isRunning
    ? "⟳ running..."
    : shift.lastResult?.success
      ? "✓ success"
      : shift.lastResult
        ? "✗ failed"
        : "no runs yet";

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>
          {shift.config.name}
          <Text dimColor>
            {" "}— {statusText}
            {shift.lastResult && !isRunning ? ` (${(shift.lastResult.durationMs / 1000).toFixed(1)}s)` : ""}
            {shift.lastResult?.cost ? ` $${shift.lastResult.cost.toFixed(4)}` : ""}
          </Text>
        </Text>
      </Box>
      <Text>{output}</Text>
    </Box>
  );
}

export function Dashboard({
  shifts,
  onRun,
  onDelete,
  onResume,
  onQuit,
}: {
  shifts: ShiftState[];
  onRun: (name: string) => void;
  onDelete: (name: string) => void;
  onResume: (name: string) => void;
  onQuit: () => void;
}) {
  const { exit } = useApp();
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [mode, setMode] = React.useState<"table" | "output">("table");

  useInput((input, key) => {
    if (input === "q") { onQuit(); exit(); return; }

    if (mode === "output") {
      if (key.escape || key.return) setMode("table");
      else if (input === "r") {
        const s = shifts[selectedIndex];
        if (s && s.status !== "running") onRun(s.config.name);
      } else if (input === "s") {
        const s = shifts[selectedIndex];
        if (s) onResume(s.config.name);
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIndex((i) => Math.min(shifts.length - 1, i + 1));
    } else if (input === "r") {
      const s = shifts[selectedIndex];
      if (s && s.status !== "running") onRun(s.config.name);
    } else if (input === "d") {
      const s = shifts[selectedIndex];
      if (s && s.status !== "running") {
        onDelete(s.config.name);
        setSelectedIndex((i) => Math.min(i, shifts.length - 2));
      }
    } else if (input === "s") {
      const s = shifts[selectedIndex];
      if (s) onResume(s.config.name);
    } else if (key.return) {
      setMode("output");
    }
  });

  const selected = shifts[selectedIndex];

  if (mode === "output" && selected) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <OutputView shift={selected} />
        <StatusBar mode="output" />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">itsovertime</Text>
        <Text dimColor> — {shifts.length} shifts</Text>
      </Box>
      <Header />
      {shifts.map((s, i) => (
        <ShiftRow key={s.config.name} shift={s} selected={i === selectedIndex} />
      ))}
      <StatusBar mode="table" />
    </Box>
  );
}

function pad(str: string, width: number): string {
  return str.length >= width ? str.slice(0, width) : str + " ".repeat(width - str.length);
}

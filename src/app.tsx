import React, { useEffect, useState, useCallback } from "react";
import { useApp } from "ink";
import { Scheduler } from "./scheduler.js";
import type { JobState } from "./scheduler.js";
import { Dashboard } from "./ui.js";

export function App({
  scheduler,
  onResume,
}: {
  scheduler: Scheduler;
  onResume: (sessionId: string, jobName: string) => void;
}) {
  const { exit } = useApp();
  const [jobs, setJobs] = useState<JobState[]>(scheduler.getJobs());

  useEffect(() => {
    scheduler.start();

    const unsubscribe = scheduler.onStateChange(() => {
      setJobs([...scheduler.getJobs()]);
    });

    return () => {
      unsubscribe();
      scheduler.stop();
    };
  }, [scheduler]);

  // Refresh relative times every 30s
  useEffect(() => {
    const timer = setInterval(() => {
      setJobs([...scheduler.getJobs()]);
    }, 30_000);
    return () => clearInterval(timer);
  }, [scheduler]);

  const handleRunJob = useCallback(
    (name: string) => {
      scheduler.runNow(name);
    },
    [scheduler]
  );

  const handleDeleteJob = useCallback(
    (name: string) => {
      scheduler.deleteJob(name);
    },
    [scheduler]
  );

  const handleResumeJob = useCallback(
    (name: string) => {
      const sessionId = scheduler.getSessionId(name);
      if (!sessionId) return;
      exit();
      // Defer to after Ink unmounts
      setTimeout(() => onResume(sessionId, name), 100);
    },
    [scheduler, exit, onResume]
  );

  const handleQuit = useCallback(() => {
    scheduler.stop();
  }, [scheduler]);

  return (
    <Dashboard
      jobs={jobs}
      onRunJob={handleRunJob}
      onDeleteJob={handleDeleteJob}
      onResumeJob={handleResumeJob}
      onQuit={handleQuit}
    />
  );
}

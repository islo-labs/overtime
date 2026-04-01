import React, { useEffect, useState, useCallback } from "react";
import { Scheduler } from "./scheduler.js";
import type { JobState } from "./scheduler.js";
import { Dashboard } from "./ui.js";

export function App({ scheduler }: { scheduler: Scheduler }) {
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

  const handleQuit = useCallback(() => {
    scheduler.stop();
  }, [scheduler]);

  return <Dashboard jobs={jobs} onRunJob={handleRunJob} onDeleteJob={handleDeleteJob} onQuit={handleQuit} />;
}

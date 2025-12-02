import { CronJob } from "cron";
import { EventEmitter } from "node:events";
import type { Workflow } from "../../lib/index.js";

/**
 * Scheduled job info
 */
export interface ScheduledJob {
  id: string;
  workflowName: string;
  cron: string;
  nextRun: Date | null;
  lastRun: Date | null;
  lastStatus: "success" | "failure" | null;
  inputs?: Record<string, unknown>;
}

/**
 * Events emitted by the scheduler
 */
export interface SchedulerEvents {
  "job:trigger": { job: ScheduledJob; workflow: Workflow };
  "job:added": { job: ScheduledJob };
  "job:removed": { jobId: string };
  "scheduler:started": void;
  "scheduler:stopped": void;
}

/**
 * Scheduler for workflow cron jobs
 */
export class Scheduler extends EventEmitter {
  private jobs: Map<string, CronJob> = new Map();
  private jobInfo: Map<string, ScheduledJob> = new Map();
  private workflows: Map<string, Workflow> = new Map();
  private running = false;

  constructor() {
    super();
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    for (const job of this.jobs.values()) {
      job.start();
    }

    this.emit("scheduler:started");
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    for (const job of this.jobs.values()) {
      job.stop();
    }

    this.emit("scheduler:stopped");
  }

  /**
   * Add a workflow's schedules to the scheduler
   */
  addWorkflow(workflow: Workflow): void {
    this.workflows.set(workflow.name, workflow);

    if (!workflow.on?.schedule) return;

    for (let i = 0; i < workflow.on.schedule.length; i++) {
      const schedule = workflow.on.schedule[i];
      const jobId = `${workflow.name}:${i}`;

      const jobInfo: ScheduledJob = {
        id: jobId,
        workflowName: workflow.name,
        cron: schedule.cron,
        nextRun: null,
        lastRun: null,
        lastStatus: null,
        inputs: schedule.inputs,
      };

      const cronJob = new CronJob(
        schedule.cron,
        () => this.triggerJob(jobId),
        null,
        this.running
      );

      this.jobs.set(jobId, cronJob);
      this.jobInfo.set(jobId, jobInfo);

      // Update next run time
      jobInfo.nextRun = cronJob.nextDate().toJSDate();

      this.emit("job:added", { job: jobInfo });
    }
  }

  /**
   * Remove a workflow's schedules from the scheduler
   */
  removeWorkflow(workflowName: string): void {
    this.workflows.delete(workflowName);

    for (const [jobId, job] of this.jobs.entries()) {
      if (jobId.startsWith(`${workflowName}:`)) {
        job.stop();
        this.jobs.delete(jobId);
        this.jobInfo.delete(jobId);
        this.emit("job:removed", { jobId });
      }
    }
  }

  /**
   * Reload a workflow (remove and re-add)
   */
  reloadWorkflow(workflow: Workflow): void {
    this.removeWorkflow(workflow.name);
    this.addWorkflow(workflow);
  }

  /**
   * Get all scheduled jobs
   */
  getJobs(): ScheduledJob[] {
    const jobs: ScheduledJob[] = [];

    for (const [jobId, cronJob] of this.jobs.entries()) {
      const info = this.jobInfo.get(jobId);
      if (info) {
        // Update next run time
        info.nextRun = cronJob.nextDate().toJSDate();
        jobs.push(info);
      }
    }

    return jobs.sort((a, b) => {
      if (!a.nextRun) return 1;
      if (!b.nextRun) return -1;
      return a.nextRun.getTime() - b.nextRun.getTime();
    });
  }

  /**
   * Get a specific job by ID
   */
  getJob(jobId: string): ScheduledJob | null {
    return this.jobInfo.get(jobId) ?? null;
  }

  /**
   * Manually trigger a job
   */
  triggerJob(jobId: string): void {
    const info = this.jobInfo.get(jobId);
    if (!info) return;

    const workflow = this.workflows.get(info.workflowName);
    if (!workflow) return;

    info.lastRun = new Date();

    this.emit("job:trigger", { job: info, workflow });
  }

  /**
   * Manually trigger a workflow by name
   */
  triggerWorkflow(workflowName: string): boolean {
    const workflow = this.workflows.get(workflowName);
    if (!workflow) return false;

    // Find the first job for this workflow, or create a one-off trigger
    for (const [jobId, info] of this.jobInfo.entries()) {
      if (info.workflowName === workflowName) {
        this.triggerJob(jobId);
        return true;
      }
    }

    // No scheduled job, but workflow exists - emit trigger anyway
    this.emit("job:trigger", {
      job: {
        id: `${workflowName}:manual`,
        workflowName,
        cron: "manual",
        nextRun: null,
        lastRun: new Date(),
        lastStatus: null,
      },
      workflow,
    });

    return true;
  }

  /**
   * Update job status after execution
   */
  updateJobStatus(jobId: string, success: boolean): void {
    const info = this.jobInfo.get(jobId);
    if (info) {
      info.lastStatus = success ? "success" : "failure";
    }
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get count of scheduled jobs
   */
  getJobCount(): number {
    return this.jobs.size;
  }
}

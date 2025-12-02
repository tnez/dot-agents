import express, { type Express, type Request, type Response } from "express";
import type { Server } from "node:http";
import type { Scheduler, ScheduledJob } from "../lib/scheduler.js";
import type { Daemon } from "../daemon.js";

/**
 * API response types
 */
interface StatusResponse {
  status: "running" | "stopped";
  uptime: number;
  jobs: number;
  version: string;
}

interface JobsResponse {
  jobs: ScheduledJob[];
}

interface TriggerResponse {
  success: boolean;
  message: string;
  runId?: string;
}

/**
 * Create the HTTP API server
 */
export function createApiServer(daemon: Daemon): Express {
  const app = express();

  app.use(express.json());

  // Health check
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // Status
  app.get("/status", (_req: Request, res: Response) => {
    const status: StatusResponse = {
      status: daemon.isRunning() ? "running" : "stopped",
      uptime: daemon.getUptime(),
      jobs: daemon.getScheduler().getJobCount(),
      version: "0.1.0",
    };
    res.json(status);
  });

  // List scheduled jobs
  app.get("/jobs", (_req: Request, res: Response) => {
    const jobs = daemon.getScheduler().getJobs();
    const response: JobsResponse = { jobs };
    res.json(response);
  });

  // Get specific job
  app.get("/jobs/:id", (req: Request, res: Response) => {
    const job = daemon.getScheduler().getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(job);
  });

  // Trigger a workflow
  app.post("/trigger/:workflow", async (req: Request, res: Response) => {
    const workflowName = req.params.workflow;
    const inputs = req.body?.inputs;

    try {
      const result = await daemon.triggerWorkflow(workflowName, inputs);
      const response: TriggerResponse = {
        success: result.success,
        message: result.success
          ? `Workflow ${workflowName} completed successfully`
          : `Workflow ${workflowName} failed`,
        runId: result.runId,
      };
      res.json(response);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: (error as Error).message,
      });
    }
  });

  // List workflows
  app.get("/workflows", async (_req: Request, res: Response) => {
    try {
      const workflows = await daemon.getWorkflows();
      res.json({ workflows });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // List personas
  app.get("/personas", async (_req: Request, res: Response) => {
    try {
      const personas = await daemon.getPersonas();
      res.json({ personas });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Recent sessions/logs
  app.get("/sessions", async (_req: Request, res: Response) => {
    try {
      const sessions = await daemon.getRecentSessions(20);
      res.json({ sessions });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Reload workflows (after file changes)
  app.post("/reload", async (_req: Request, res: Response) => {
    try {
      await daemon.reloadWorkflows();
      res.json({ success: true, message: "Workflows reloaded" });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  return app;
}

/**
 * Start the API server
 */
export function startApiServer(
  app: Express,
  port: number
): Promise<Server> {
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      resolve(server);
    });
  });
}

import express, { type Express, type Request, type Response } from "express";
import type { Server } from "node:http";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Scheduler, ScheduledJob } from "../lib/scheduler.js";
import type { Daemon } from "../daemon.js";
import { getVersion } from "../../lib/index.js";
import { createChannelsRouter } from "./channels.js";

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
  app.get("/status", async (_req: Request, res: Response) => {
    const version = await getVersion();
    const status: StatusResponse = {
      status: daemon.isRunning() ? "running" : "stopped",
      uptime: daemon.getUptime(),
      jobs: daemon.getScheduler().getJobCount(),
      version,
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

  // Channels API
  const config = daemon.getConfig();
  if (config) {
    app.use("/channels", createChannelsRouter(config.channelsDir));

    // SSE endpoint for real-time channel updates
    app.get("/channels-stream", (req: Request, res: Response) => {
      const watcher = daemon.getWatcher();

      // Set up SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.flushHeaders();

      // Send initial connection message
      res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

      // Keep-alive ping every 30 seconds
      const keepAlive = setInterval(() => {
        res.write(`: ping\n\n`);
      }, 30000);

      if (watcher) {
        // Forward watcher events to SSE clients
        const onDmReceived = (event: { channel: string; messageId: string }) => {
          res.write(`data: ${JSON.stringify({ type: "dm:received", ...event })}\n\n`);
        };

        const onChannelMessage = (event: { channel: string; messageId: string }) => {
          res.write(`data: ${JSON.stringify({ type: "channel:message", ...event })}\n\n`);
        };

        watcher.on("dm:received", onDmReceived);
        watcher.on("channel:message", onChannelMessage);

        // Clean up on client disconnect
        req.on("close", () => {
          clearInterval(keepAlive);
          watcher.off("dm:received", onDmReceived);
          watcher.off("channel:message", onChannelMessage);
        });
      } else {
        // No watcher available, just keep connection alive
        req.on("close", () => {
          clearInterval(keepAlive);
        });
      }
    });
  }

  // Serve static files for web UI
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const webDir = join(__dirname, "..", "web");
  app.use("/ui", express.static(webDir));

  // Redirect root to UI
  app.get("/", (_req: Request, res: Response) => {
    res.redirect("/ui");
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

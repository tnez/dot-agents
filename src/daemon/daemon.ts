import { readdir, stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Server } from "node:http";
import type { Express } from "express";
import {
  type DotAgentsConfig,
  type Workflow,
  type ExecutionResult,
  requireConfig,
  listWorkflows,
  loadWorkflow,
  listPersonas,
  loadPersona,
  getPackageInfo,
} from "../lib/index.js";
import { Scheduler, type ScheduledJob } from "./lib/scheduler.js";
import { Executor } from "./lib/executor.js";
import { Watcher } from "./lib/watcher.js";
import { createApiServer, startApiServer } from "./api/server.js";

/**
 * Daemon configuration options
 */
export interface DaemonOptions {
  /** HTTP API port */
  port?: number;
  /** Enable file watching */
  watch?: boolean;
  /** Custom config (auto-detected if not provided) */
  config?: DotAgentsConfig;
}

/**
 * Session log metadata
 */
export interface SessionInfo {
  filename: string;
  timestamp: Date;
  workflow?: string;
  persona?: string;
}

/**
 * Main daemon class
 */
export class Daemon {
  private config: DotAgentsConfig | null = null;
  private scheduler: Scheduler;
  private executor: Executor | null = null;
  private watcher: Watcher | null = null;
  private apiServer: Server | null = null;
  private app: Express | null = null;
  private startTime: Date | null = null;
  private running = false;

  private port: number;
  private watchEnabled: boolean;

  /** Map of channel names to workflows that trigger on them */
  private channelTriggers: Map<string, Workflow> = new Map();

  constructor(options: DaemonOptions = {}) {
    this.port = options.port ?? 3141;
    this.watchEnabled = options.watch ?? true;
    this.scheduler = new Scheduler();

    if (options.config) {
      this.config = options.config;
    }

    // Wire up scheduler events
    this.scheduler.on("job:trigger", async ({ job, workflow }) => {
      console.log(`[trigger] ${workflow.name} (${job.cron})`);
      try {
        const result = await this.executor!.run(workflow, job.inputs);
        this.scheduler.updateJobStatus(job.id, result.success);
        console.log(
          `[complete] ${workflow.name}: ${result.success ? "success" : "failure"} (${result.duration}ms)`
        );
      } catch (error) {
        this.scheduler.updateJobStatus(job.id, false);
        console.error(`[error] ${workflow.name}: ${(error as Error).message}`);
      }
    });
  }

  /**
   * Start the daemon
   */
  async start(): Promise<void> {
    if (this.running) return;

    // Get package info and format startup timestamp
    const pkgInfo = await getPackageInfo();
    const timestamp = new Date().toISOString();

    console.log(`[${timestamp}] dot-agents v${pkgInfo.version} starting...`);

    // Load config if not provided
    if (!this.config) {
      this.config = await requireConfig();
    }

    this.executor = new Executor(this.config);
    this.startTime = new Date();

    // Load and schedule workflows
    console.log(`[${new Date().toISOString()}] Loading workflows from ${this.config.agentsDir}`);
    await this.loadWorkflows();

    // Start scheduler
    this.scheduler.start();
    const jobCount = this.scheduler.getJobCount();
    const channelCount = this.channelTriggers.size;
    console.log(
      `[${new Date().toISOString()}] Scheduler started with ${jobCount} scheduled job${jobCount !== 1 ? "s" : ""}` +
      (channelCount > 0 ? `, ${channelCount} channel trigger${channelCount !== 1 ? "s" : ""}` : "")
    );

    // Start file watcher
    if (this.watchEnabled) {
      this.watcher = new Watcher(
        this.config.workflowsDir,
        this.config.personasDir,
        this.config.channelsDir
      );
      this.setupWatcherEvents();
      this.watcher.start();
      console.log(`[${new Date().toISOString()}] File watcher started`);
    }

    // Start API server
    this.app = createApiServer(this);
    this.apiServer = await startApiServer(this.app, this.port);
    console.log(`[${new Date().toISOString()}] API listening on http://localhost:${this.port}`);

    this.running = true;
    console.log(`[${new Date().toISOString()}] Daemon ready`);
  }

  /**
   * Stop the daemon
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    console.log("[daemon] Stopping...");

    // Stop scheduler
    this.scheduler.stop();

    // Stop watcher
    if (this.watcher) {
      await this.watcher.stop();
    }

    // Stop API server
    if (this.apiServer) {
      await new Promise<void>((resolve) => {
        this.apiServer!.close(() => resolve());
      });
    }

    this.running = false;
    console.log("[daemon] Stopped");
  }

  /**
   * Load all workflows and add to scheduler
   */
  private async loadWorkflows(): Promise<void> {
    const workflowPaths = await listWorkflows(this.config!.workflowsDir);

    // Clear existing channel triggers
    this.channelTriggers.clear();

    for (const path of workflowPaths) {
      try {
        const workflow = await loadWorkflow(path);
        this.scheduler.addWorkflow(workflow);

        // Register channel triggers
        if (workflow.on?.channel) {
          const channel = workflow.on.channel.channel;
          this.channelTriggers.set(channel, workflow);
          console.log(`[loaded] ${workflow.name} (triggers on ${channel})`);
        } else {
          console.log(`[loaded] ${workflow.name}`);
        }
      } catch (error) {
        console.error(`[error] Failed to load workflow at ${path}: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Reload all workflows
   */
  async reloadWorkflows(): Promise<void> {
    console.log("[reload] Reloading workflows...");

    // Get current workflow names
    const currentJobs = this.scheduler.getJobs();
    const currentWorkflows = new Set(currentJobs.map((j) => j.workflowName));

    // Remove all current workflows
    for (const name of currentWorkflows) {
      this.scheduler.removeWorkflow(name);
    }

    // Reload
    await this.loadWorkflows();

    console.log(
      `[reload] Complete. ${this.scheduler.getJobCount()} jobs scheduled.`
    );
  }

  /**
   * Set up file watcher event handlers
   */
  private setupWatcherEvents(): void {
    if (!this.watcher) return;

    this.watcher.on("workflow:added", async ({ path }) => {
      console.log(`[watcher] Workflow added: ${path}`);
      try {
        const workflow = await loadWorkflow(path);
        this.scheduler.addWorkflow(workflow);

        // Register channel trigger if present
        if (workflow.on?.channel) {
          const channel = workflow.on.channel.channel;
          this.channelTriggers.set(channel, workflow);
          console.log(`[watcher] Registered ${workflow.name} for channel ${channel}`);
        }
      } catch (error) {
        console.error(`[error] Failed to load new workflow: ${(error as Error).message}`);
      }
    });

    this.watcher.on("workflow:changed", async ({ path }) => {
      console.log(`[watcher] Workflow changed: ${path}`);
      try {
        const workflow = await loadWorkflow(path);
        this.scheduler.reloadWorkflow(workflow);

        // Update channel trigger registration
        // First, remove old registration for this workflow
        for (const [channel, w] of this.channelTriggers.entries()) {
          if (w.name === workflow.name) {
            this.channelTriggers.delete(channel);
          }
        }
        // Re-register if workflow has channel trigger
        if (workflow.on?.channel) {
          const channel = workflow.on.channel.channel;
          this.channelTriggers.set(channel, workflow);
          console.log(`[watcher] Updated ${workflow.name} for channel ${channel}`);
        }
      } catch (error) {
        console.error(`[error] Failed to reload workflow: ${(error as Error).message}`);
      }
    });

    this.watcher.on("workflow:removed", ({ path }) => {
      console.log(`[watcher] Workflow removed: ${path}`);
      // Extract workflow name from path - this is a bit fragile
      const parts = path.split("/");
      const name = parts[parts.length - 1];
      this.scheduler.removeWorkflow(name);

      // Remove any channel trigger registration for this workflow
      for (const [channel, w] of this.channelTriggers.entries()) {
        if (w.name === name) {
          this.channelTriggers.delete(channel);
          console.log(`[watcher] Unregistered ${name} from channel ${channel}`);
        }
      }
    });

    // Handle DM messages to personas
    this.watcher.on("dm:received", async ({ channel, messageId, messagePath }) => {
      // Extract persona name from channel (e.g., "@channel-manager" -> "channel-manager")
      const personaName = channel.slice(1);
      console.log(`[dm] Received message for ${personaName}: ${messageId}`);

      try {
        // Read the message content
        const messageContent = await readFile(messagePath, "utf-8");

        // Strip frontmatter if present
        let content = messageContent;
        if (content.startsWith("---\n")) {
          const endIndex = content.indexOf("\n---\n", 4);
          if (endIndex !== -1) {
            content = content.slice(endIndex + 5).trim();
          }
        }

        // Invoke the persona with the message
        console.log(`[dm] Invoking persona ${personaName}...`);
        const result = await this.executor!.invokePersona(personaName, content, {
          source: channel,
          context: { DM_MESSAGE_ID: messageId },
        });

        console.log(
          `[dm] ${personaName}: ${result.success ? "success" : "failure"} (${result.duration}ms)`
        );
      } catch (error) {
        console.error(`[dm] Failed to invoke ${personaName}: ${(error as Error).message}`);
      }
    });

    // Handle public channel messages -> trigger workflows
    this.watcher.on("channel:message", async ({ channel, messageId, messagePath }) => {
      // Check if any workflow is registered to trigger on this channel
      const workflow = this.channelTriggers.get(channel);
      if (!workflow) {
        // No workflow registered for this channel - that's fine, not all channels trigger workflows
        return;
      }

      console.log(`[channel] ${channel} message ${messageId} -> triggering ${workflow.name}`);

      try {
        // Read the message content
        const messageContent = await readFile(messagePath, "utf-8");

        // Strip frontmatter if present
        let content = messageContent;
        if (content.startsWith("---\n")) {
          const endIndex = content.indexOf("\n---\n", 4);
          if (endIndex !== -1) {
            content = content.slice(endIndex + 5).trim();
          }
        }

        // Merge trigger-specific inputs with the message content
        const inputs: Record<string, unknown> = {
          ...workflow.on?.channel?.inputs,
          CHANNEL_MESSAGE: content,
          CHANNEL_MESSAGE_ID: messageId,
          CHANNEL_NAME: channel,
        };

        const result = await this.executor!.run(workflow, { inputs });

        console.log(
          `[channel] ${workflow.name}: ${result.success ? "success" : "failure"} (${result.duration}ms)`
        );
      } catch (error) {
        console.error(`[channel] Failed to trigger ${workflow.name}: ${(error as Error).message}`);
      }
    });
  }

  /**
   * Manually trigger a workflow
   */
  async triggerWorkflow(
    name: string,
    inputs?: Record<string, unknown>
  ): Promise<ExecutionResult> {
    const workflows = await this.getWorkflows();
    const workflow = workflows.find((w) => w.name === name);

    if (!workflow) {
      throw new Error(`Workflow not found: ${name}`);
    }

    return this.executor!.run(workflow, inputs);
  }

  /**
   * Get all workflows
   */
  async getWorkflows(): Promise<Workflow[]> {
    const workflowPaths = await listWorkflows(this.config!.workflowsDir);
    const workflows: Workflow[] = [];

    for (const path of workflowPaths) {
      try {
        const workflow = await loadWorkflow(path);
        workflows.push(workflow);
      } catch {
        // Skip invalid workflows
      }
    }

    return workflows;
  }

  /**
   * Get all personas (just basic info, not resolved)
   */
  async getPersonas(): Promise<Array<{ path: string; name: string; description?: string }>> {
    const personaPaths = await listPersonas(this.config!.personasDir);
    const personas: Array<{ path: string; name: string; description?: string }> = [];

    for (const path of personaPaths) {
      try {
        const persona = await loadPersona(path);
        personas.push({
          path,
          name: persona.name,
          description: persona.description,
        });
      } catch {
        // Skip invalid personas
      }
    }

    return personas;
  }

  /**
   * Get recent session logs
   */
  async getRecentSessions(limit: number = 20): Promise<SessionInfo[]> {
    const sessions: SessionInfo[] = [];

    try {
      const files = await readdir(this.config!.sessionsDir);
      const logFiles = files.filter((f) => f.endsWith(".log"));

      // Sort by filename (which includes timestamp)
      logFiles.sort().reverse();

      for (const file of logFiles.slice(0, limit)) {
        // Parse timestamp from filename: YYYYMMDD-HHMMSS.log
        const match = file.match(/^(\d{8})-(\d{6})\.log$/);
        if (match) {
          const [, date, time] = match;
          const timestamp = new Date(
            `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`
          );
          sessions.push({ filename: file, timestamp });
        }
      }
    } catch {
      // Sessions directory might not exist yet
    }

    return sessions;
  }

  /**
   * Get the scheduler instance
   */
  getScheduler(): Scheduler {
    return this.scheduler;
  }

  /**
   * Check if daemon is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get uptime in seconds
   */
  getUptime(): number {
    if (!this.startTime) return 0;
    return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
  }

  /**
   * Get the API port
   */
  getPort(): number {
    return this.port;
  }
}

import { readdir, stat, readFile, access, constants } from "node:fs/promises";
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
  getRecentSessions as getRecentSessionsFromLib,
  type SessionInfo as LibSessionInfo,
  writePidFile,
  removePidFile,
} from "../lib/index.js";
import { Scheduler, type ScheduledJob } from "./lib/scheduler.js";
import { Executor } from "./lib/executor.js";
import { Watcher } from "./lib/watcher.js";
import { isSelfReply, RateLimiter } from "./lib/safeguards.js";
import { createApiServer, startApiServer } from "./api/server.js";

/**
 * Read a file with retries for cloud-synced files
 *
 * Files synced via iCloud/Syncthing may appear in the filesystem before they're
 * fully readable (EAGAIN error). This function retries with exponential backoff.
 */
async function readFileWithRetry(
  path: string,
  maxRetries: number = 5,
  initialDelayMs: number = 100
): Promise<string> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Check if file is readable first
      await access(path, constants.R_OK);
      return await readFile(path, "utf-8");
    } catch (error) {
      lastError = error as Error;
      // Only retry on EAGAIN (-11) or similar transient errors
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EAGAIN" && code !== "EBUSY" && code !== "Unknown system error -11") {
        // For non-transient errors, check the errno
        const errno = (error as NodeJS.ErrnoException).errno;
        if (errno !== -11) {
          throw error; // Not a transient error, don't retry
        }
      }

      // Wait before retrying (exponential backoff)
      const delay = initialDelayMs * Math.pow(2, attempt);
      console.log(`[dm:debug] File not ready, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error(`Failed to read file after ${maxRetries} attempts`);
}

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
 * Session info for API compatibility
 * @deprecated Use SessionInfo from lib/session.ts instead
 */
export interface SessionInfo {
  /** Session ID (directory name) */
  id: string;
  /** Full path to session directory */
  path: string;
  /** When session started */
  timestamp: Date;
  /** Persona name if available */
  persona?: string;
  /** Workflow name if available */
  workflow?: string;
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

  /** Rate limiter for persona invocations (doom loop protection) */
  private rateLimiter: RateLimiter = new RateLimiter(5, 60_000);

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

    // Write PID file
    await writePidFile(this.config.agentsDir, process.pid);

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

    // Remove PID file
    if (this.config) {
      await removePidFile(this.config.agentsDir);
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
        // Read the message content (with retries for cloud-synced files)
        const messageContent = await readFileWithRetry(messagePath);

        // Self-reply detection (doom loop protection)
        if (isSelfReply(messageContent, personaName)) {
          console.log(`[dm] Skipping self-reply from ${personaName}`);
          return;
        }

        // Rate limiting (doom loop protection)
        if (!this.rateLimiter.tryInvoke(personaName)) {
          const count = this.rateLimiter.getInvocationCount(personaName);
          console.warn(
            `[dm] Rate limit exceeded for ${personaName} (${count}/5 per minute) - dropping message`
          );
          return;
        }

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
        // Read the message content (with retries for cloud-synced files)
        const messageContent = await readFileWithRetry(messagePath);

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
    if (!this.config) {
      return [];
    }

    const libSessions = await getRecentSessionsFromLib(this.config.sessionsDir, limit);

    // Convert to daemon SessionInfo format for API compatibility
    return libSessions.map((s) => ({
      id: s.id,
      path: s.path,
      timestamp: s.timestamp,
      persona: s.metadata?.persona?.name,
      workflow: s.metadata?.workflow?.name,
    }));
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

  /**
   * Get the config (for API routes that need access to directories)
   */
  getConfig(): DotAgentsConfig | null {
    return this.config;
  }

  /**
   * Get the watcher instance (for SSE/WebSocket integration)
   */
  getWatcher(): Watcher | null {
    return this.watcher;
  }
}

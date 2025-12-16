import { watch, type FSWatcher } from "chokidar";
import { EventEmitter } from "node:events";
import { dirname, basename } from "node:path";

/**
 * Events emitted by the watcher
 */
export interface WatcherEvents {
  "workflow:added": { path: string };
  "workflow:changed": { path: string };
  "workflow:removed": { path: string };
  "persona:added": { path: string };
  "persona:changed": { path: string };
  "persona:removed": { path: string };
  "dm:received": { channel: string; messageId: string; messagePath: string };
  "channel:message": { channel: string; messageId: string; messagePath: string };
}

/**
 * File watcher for workflows, personas, and channels
 */
export class Watcher extends EventEmitter {
  private workflowWatcher: FSWatcher | null = null;
  private personaWatcher: FSWatcher | null = null;
  private channelWatcher: FSWatcher | null = null;
  private running = false;

  constructor(
    private workflowsDir: string,
    private personasDir: string,
    private channelsDir?: string
  ) {
    super();
  }

  /**
   * Start watching for file changes
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Watch workflows
    this.workflowWatcher = watch(`${this.workflowsDir}/**/WORKFLOW.md`, {
      ignoreInitial: true,
      persistent: true,
    });

    this.workflowWatcher.on("add", (path) => {
      this.emit("workflow:added", { path: dirname(path) });
    });

    this.workflowWatcher.on("change", (path) => {
      this.emit("workflow:changed", { path: dirname(path) });
    });

    this.workflowWatcher.on("unlink", (path) => {
      this.emit("workflow:removed", { path: dirname(path) });
    });

    // Watch personas
    this.personaWatcher = watch(`${this.personasDir}/**/PERSONA.md`, {
      ignoreInitial: true,
      persistent: true,
    });

    this.personaWatcher.on("add", (path) => {
      this.emit("persona:added", { path: dirname(path) });
    });

    this.personaWatcher.on("change", (path) => {
      this.emit("persona:changed", { path: dirname(path) });
    });

    this.personaWatcher.on("unlink", (path) => {
      this.emit("persona:removed", { path: dirname(path) });
    });

    // Watch channels for new messages (both DM @* and public #*)
    if (this.channelsDir) {
      // Watch the channels directory for new message.md files
      // Using directory watch instead of glob because @* patterns are unreliable
      this.channelWatcher = watch(this.channelsDir, {
        ignoreInitial: true,
        persistent: true,
        depth: 3, // channels/{@name|#name}/message-id/message.md
      });

      this.channelWatcher.on("add", (path) => {
        // Only process message.md files
        if (!path.endsWith("/message.md")) {
          return;
        }

        // Path: {channelsDir}/{@persona|#channel}/{message-id}/message.md
        const messageDir = dirname(path);
        const messageId = basename(messageDir);
        const channelDir = dirname(messageDir);
        const channel = basename(channelDir);

        // Emit appropriate event based on channel type
        if (channel.startsWith("@")) {
          // DM channel -> invoke persona
          this.emit("dm:received", { channel, messageId, messagePath: path });
        } else if (channel.startsWith("#")) {
          // Public channel -> trigger workflow
          this.emit("channel:message", { channel, messageId, messagePath: path });
        }
      });

      this.channelWatcher.on("error", (error: unknown) => {
        console.error(`[watcher] Channel watcher error: ${(error as Error).message}`);
      });
    }
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    if (this.workflowWatcher) {
      await this.workflowWatcher.close();
      this.workflowWatcher = null;
    }

    if (this.personaWatcher) {
      await this.personaWatcher.close();
      this.personaWatcher = null;
    }

    if (this.channelWatcher) {
      await this.channelWatcher.close();
      this.channelWatcher = null;
    }
  }

  /**
   * Check if watcher is running
   */
  isRunning(): boolean {
    return this.running;
  }
}

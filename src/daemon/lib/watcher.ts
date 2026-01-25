import { watch, type FSWatcher } from "chokidar";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { dirname, basename } from "node:path";

/**
 * Check if a string looks like an ISO timestamp (message ID format)
 * Message IDs are ISO timestamps like "2026-01-24T23:29:20.778Z"
 * UUIDs are like "621f4c3e-69f8-4c16-994b-3cbda5e27f97"
 */
function isISOTimestamp(str: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str);
}

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
    // Use polling for reliable detection of cloud-synced files (iCloud, Syncthing)
    this.workflowWatcher = watch(`${this.workflowsDir}/**/WORKFLOW.md`, {
      ignoreInitial: true,
      persistent: true,
      usePolling: true,
      interval: 5000, // Poll every 5s (workflows change infrequently)
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
    // Use polling for reliable detection of cloud-synced files (iCloud, Syncthing)
    this.personaWatcher = watch(`${this.personasDir}/**/PERSONA.md`, {
      ignoreInitial: true,
      persistent: true,
      usePolling: true,
      interval: 5000, // Poll every 5s (personas change infrequently)
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
        depth: 3, // channels/{@name|#name}/{thread-id}/{message-id}.md
        // Use polling for reliable detection of cloud-synced files (iCloud, Syncthing)
        // fs.watch (chokidar v4 default) may miss files synced from other machines
        usePolling: true,
        interval: 1000, // Poll every 1 second (balance between responsiveness and CPU)
        // Wait for files to stabilize before emitting events
        // This helps with cloud-synced files that appear before they're fully written
        awaitWriteFinish: {
          stabilityThreshold: 500, // Wait 500ms after last change
          pollInterval: 100,
        },
      });

      this.channelWatcher.on("add", async (path) => {
        // Only process .md message files
        if (!path.endsWith(".md")) {
          return;
        }

        // Path: {channelsDir}/{@persona|#channel}/{thread-id}/{message-id}.md
        const messageId = basename(path, ".md");
        const threadDir = dirname(path);
        const threadId = basename(threadDir);
        const channelDir = dirname(threadDir);
        const channel = basename(channelDir);

        // Emit appropriate event based on channel type
        if (channel.startsWith("@")) {
          // DM channel -> invoke persona
          this.emit("dm:received", { channel, messageId, messagePath: path });
        } else if (channel.startsWith("#")) {
          // Public channel -> trigger workflow
          // Skip thread replies by checking frontmatter thread_id
          // - New messages have UUID thread_id (random identifier)
          // - Replies have timestamp thread_id (pointing to another message)
          try {
            const content = await readFile(path, "utf-8");
            const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
            if (frontmatterMatch) {
              const threadIdMatch = frontmatterMatch[1].match(/thread_id:\s*["']?([^\s"'\n]+)/);
              if (threadIdMatch) {
                const frontmatterThreadId = threadIdMatch[1];
                // If thread_id is a timestamp (not UUID), it's a reply - skip it
                if (isISOTimestamp(frontmatterThreadId)) {
                  console.log(`[watcher] Skipping thread reply: ${messageId} (reply to: ${frontmatterThreadId})`);
                  return;
                }
              }
            }
          } catch {
            // If we can't read the file, skip it (fail closed for safety)
            console.warn(`[watcher] Could not read message file: ${path}`);
            return;
          }
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

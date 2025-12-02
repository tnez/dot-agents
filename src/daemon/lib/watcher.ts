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
}

/**
 * File watcher for workflows and personas
 */
export class Watcher extends EventEmitter {
  private workflowWatcher: FSWatcher | null = null;
  private personaWatcher: FSWatcher | null = null;
  private running = false;

  constructor(
    private workflowsDir: string,
    private personasDir: string
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
  }

  /**
   * Check if watcher is running
   */
  isRunning(): boolean {
    return this.running;
  }
}

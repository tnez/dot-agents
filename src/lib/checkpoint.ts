import { spawn, type ChildProcess } from "node:child_process";

export interface CheckpointOptions {
  /**
   * Minutes of inactivity before sending checkpoint reminder.
   * Activity = any stdout output from the agent.
   * Default: 5 minutes
   */
  inactivityMinutes?: number;

  /**
   * Session directory path for checkpoint reminders.
   * If not provided, checkpointing is disabled.
   */
  sessionDir?: string;

  /**
   * Custom checkpoint message template.
   * Use {{sessionDir}} as placeholder for session directory.
   * Default: "[dot-agents] Please update {{sessionDir}}/session.md with your current progress."
   */
  messageTemplate?: string;

  /**
   * Whether to show checkpoint reminders in output.
   * Default: true
   */
  verbose?: boolean;
}

const DEFAULT_INACTIVITY_MINUTES = 5;
const DEFAULT_MESSAGE_TEMPLATE =
  "[dot-agents] Please update {{sessionDir}}/session.md with your current progress.";

/**
 * Spawns a process with activity-based checkpoint reminders.
 *
 * Monitors stdout for activity and sends checkpoint reminders to stdin
 * after a period of inactivity (no stdout output).
 *
 * This is provider-agnostic - works with any interactive agent that
 * reads from stdin and writes to stdout.
 */
export function spawnWithCheckpoints(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
  options: CheckpointOptions = {}
): ChildProcess {
  const {
    inactivityMinutes = DEFAULT_INACTIVITY_MINUTES,
    sessionDir,
    messageTemplate = DEFAULT_MESSAGE_TEMPLATE,
    verbose = true,
  } = options;

  // If no session dir, just spawn normally without checkpointing
  if (!sessionDir) {
    return spawn(command, args, {
      cwd,
      env,
      stdio: "inherit",
    });
  }

  const inactivityMs = inactivityMinutes * 60 * 1000;
  let lastActivityTime = Date.now();
  let checkpointTimer: NodeJS.Timeout | null = null;

  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Format checkpoint message
  const formatMessage = () =>
    messageTemplate.replace(/\{\{sessionDir\}\}/g, sessionDir);

  // Reset inactivity timer
  const resetTimer = () => {
    lastActivityTime = Date.now();
    if (checkpointTimer) {
      clearTimeout(checkpointTimer);
    }
    checkpointTimer = setTimeout(sendCheckpointReminder, inactivityMs);
  };

  // Send checkpoint reminder to agent's stdin
  const sendCheckpointReminder = () => {
    if (!child.stdin || child.stdin.destroyed) {
      return;
    }

    // Only send reminder if there's been real inactivity
    const timeSinceActivity = Date.now() - lastActivityTime;
    if (timeSinceActivity < inactivityMs - 1000) {
      // Timer fired early due to race condition, reset
      resetTimer();
      return;
    }

    const message = formatMessage();

    if (verbose) {
      // Write to stderr so it doesn't mix with agent output
      process.stderr.write(`\n${message}\n`);
    }

    // Write to agent's stdin as a user message
    child.stdin.write(`${message}\n`);

    // Reset timer for next checkpoint
    resetTimer();
  };

  // Pipe stdin from user to child, allowing checkpoint injection
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.pipe(child.stdin);

  // Pipe stdout from child to user, tracking activity
  child.stdout?.on("data", (data: Buffer) => {
    resetTimer();
    process.stdout.write(data);
  });

  // Pipe stderr from child to user
  child.stderr?.on("data", (data: Buffer) => {
    process.stderr.write(data);
  });

  // Start the inactivity timer
  resetTimer();

  // Cleanup on exit
  child.on("exit", () => {
    if (checkpointTimer) {
      clearTimeout(checkpointTimer);
    }
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
  });

  // Handle SIGINT/SIGTERM - attempt graceful checkpoint prompt
  const handleSignal = (signal: NodeJS.Signals) => {
    if (checkpointTimer) {
      clearTimeout(checkpointTimer);
    }

    // Don't inject checkpoint on exit - just forward signal
    // The agent should have been saving periodically
    child.kill(signal);
  };

  process.on("SIGINT", () => handleSignal("SIGINT"));
  process.on("SIGTERM", () => handleSignal("SIGTERM"));

  return child;
}

/**
 * Check if checkpointing should be enabled for a session.
 * Returns true if session directory is set and checkpointing is not disabled.
 */
export function shouldEnableCheckpoints(
  sessionDir: string | undefined,
  interactive: boolean
): boolean {
  // Only enable for interactive sessions with a session directory
  return !!sessionDir && interactive;
}

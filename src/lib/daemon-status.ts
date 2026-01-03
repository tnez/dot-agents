import { readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";

const PID_FILE = "daemon.pid";

/**
 * Daemon status information
 */
export interface DaemonStatus {
  /** Whether the daemon is running */
  running: boolean;
  /** Process ID if running */
  pid?: number;
}

/**
 * Get the path to the daemon PID file for an agents directory
 */
export function getPidFilePath(agentsDir: string): string {
  return join(agentsDir, PID_FILE);
}

/**
 * Write the daemon PID file
 */
export async function writePidFile(agentsDir: string, pid: number): Promise<void> {
  const pidPath = getPidFilePath(agentsDir);
  await writeFile(pidPath, pid.toString(), "utf-8");
}

/**
 * Remove the daemon PID file
 */
export async function removePidFile(agentsDir: string): Promise<void> {
  const pidPath = getPidFilePath(agentsDir);
  try {
    await unlink(pidPath);
  } catch {
    // File may not exist, ignore
  }
}

/**
 * Check if a process with the given PID is running
 */
function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 tests if process exists without actually signaling it
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the daemon status for an agents directory
 */
export async function getDaemonStatus(agentsDir: string): Promise<DaemonStatus> {
  const pidPath = getPidFilePath(agentsDir);

  try {
    const content = await readFile(pidPath, "utf-8");
    const pid = parseInt(content.trim(), 10);

    if (isNaN(pid)) {
      return { running: false };
    }

    if (isProcessRunning(pid)) {
      return { running: true, pid };
    }

    // PID file exists but process is not running (stale)
    return { running: false };
  } catch {
    // No PID file
    return { running: false };
  }
}

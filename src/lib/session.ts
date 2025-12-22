import { mkdir, writeFile, readFile, readdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { parseFrontmatter, stringifyFrontmatter } from "./frontmatter.js";

/**
 * Runtime context for the session
 */
export interface RuntimeContext {
  /** Machine hostname */
  hostname: string;
  /** How the session is being run */
  executionMode: "interactive" | "headless";
  /** What triggered the session */
  triggerType: "manual" | "cron" | "dm" | "channel";
  /** Working directory for the session */
  workingDir: string;
}

/**
 * Metadata stored in session.md frontmatter
 */
export interface SessionMetadata {
  /** Unique session ID (matches directory name) */
  id: string;
  /** When session started */
  started: string;
  /** When session ended (set on finalize) */
  ended?: string;
  /** What this session is trying to accomplish */
  goal?: string;
  /** Runtime context */
  runtime: RuntimeContext;
  /**
   * Upstream return address - where to send completions/escalations
   * Format: "@project:persona --session-id <id>" or "@persona" for local
   * Examples:
   *   "@odin:dottie --session-id 2025-12-22T15-30-45"
   *   "@developer"
   *   null (for top-level interactive sessions)
   */
  upstream?: string;
  /** Persona info */
  persona?: {
    name: string;
    inheritanceChain?: string[];
  };
  /** Workflow info (if running a workflow) */
  workflow?: {
    name: string;
    path?: string;
    inputs?: Record<string, unknown>;
  };
  /** Execution results (set on finalize) */
  result?: {
    success: boolean;
    exitCode: number;
    duration: number;
    error?: string;
  };
}

/**
 * Info about a session for listing
 */
export interface SessionInfo {
  /** Directory name (also the session ID) */
  id: string;
  /** Full path to session directory */
  path: string;
  /** When session started */
  timestamp: Date;
  /** Session metadata from frontmatter */
  metadata?: SessionMetadata;
}

/**
 * Options for creating a session
 */
export interface CreateSessionOptions {
  /** Base sessions directory */
  sessionsDir: string;
  /** Runtime context */
  runtime: RuntimeContext;
  /** Upstream return address (e.g., "@odin:dottie --session-id abc123") */
  upstream?: string;
  /** Goal/description for this session */
  goal?: string;
  /** Persona info */
  persona?: {
    name: string;
    inheritanceChain?: string[];
  };
  /** Workflow info */
  workflow?: {
    name: string;
    path?: string;
    inputs?: Record<string, unknown>;
  };
}

/**
 * Active session handle
 */
export interface Session {
  /** Session ID (directory name) */
  id: string;
  /** Full path to session directory */
  path: string;
  /** Path to session.md */
  sessionFile: string;
  /** Session metadata */
  metadata: SessionMetadata;
}

/**
 * Generate session ID from timestamp
 * Format: YYYY-MM-DDTHH-MM-SS (sortable, filesystem-safe)
 */
export function generateSessionId(date: Date = new Date()): string {
  return date.toISOString()
    .replace(/:/g, "-")
    .split(".")[0]; // e.g., "2025-12-22T15-30-45"
}

/**
 * Parse session ID back to Date
 */
export function parseSessionId(id: string): Date | null {
  // Match YYYY-MM-DDTHH-MM-SS format
  const match = id.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  // Convert back to ISO format with Z suffix for UTC
  const [, datePart, hour, minute, second] = match;
  const isoString = `${datePart}T${hour}:${minute}:${second}Z`;
  const date = new Date(isoString);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Create a new session directory and initial session.md
 */
export async function createSession(options: CreateSessionOptions): Promise<Session> {
  const startTime = new Date();
  const id = generateSessionId(startTime);
  const sessionPath = join(options.sessionsDir, id);
  const sessionFile = join(sessionPath, "session.md");

  // Create session directory
  await mkdir(sessionPath, { recursive: true });

  // Build metadata
  const metadata: SessionMetadata = {
    id,
    started: startTime.toISOString(),
    runtime: options.runtime,
  };

  if (options.upstream) {
    metadata.upstream = options.upstream;
  }

  if (options.goal) {
    metadata.goal = options.goal;
  }

  if (options.persona) {
    metadata.persona = options.persona;
  }

  if (options.workflow) {
    metadata.workflow = options.workflow;
  }

  // Write initial session.md
  const content = stringifyFrontmatter(metadata, "# Session Log\n\nSession started.\n");
  await writeFile(sessionFile, content, "utf-8");

  return {
    id,
    path: sessionPath,
    sessionFile,
    metadata,
  };
}

/**
 * Options for finalizing a session
 */
export interface FinalizeSessionOptions {
  /** Whether execution succeeded */
  success: boolean;
  /** Exit code from process */
  exitCode: number;
  /** Duration in milliseconds */
  duration: number;
  /** Error message if failed */
  error?: string;
  /** Standard output to append to log */
  stdout?: string;
  /** Standard error to append to log */
  stderr?: string;
}

/**
 * Finalize a session with execution results
 */
export async function finalizeSession(
  session: Session,
  options: FinalizeSessionOptions
): Promise<void> {
  const endTime = new Date();

  // Read current session.md
  const currentContent = await readFile(session.sessionFile, "utf-8");
  const { frontmatter, body } = parseFrontmatter<SessionMetadata>(currentContent);

  // Update metadata
  frontmatter.ended = endTime.toISOString();
  frontmatter.result = {
    success: options.success,
    exitCode: options.exitCode,
    duration: options.duration,
    error: options.error,
  };

  // Build updated content
  const logParts: string[] = [body.trim()];
  logParts.push("");
  logParts.push(`## Execution Complete`);
  logParts.push("");
  logParts.push(`- **Ended:** ${endTime.toISOString()}`);
  logParts.push(`- **Duration:** ${options.duration}ms`);
  logParts.push(`- **Exit Code:** ${options.exitCode}`);
  logParts.push(`- **Success:** ${options.success}`);

  if (options.error) {
    logParts.push(`- **Error:** ${options.error}`);
  }

  if (options.stdout) {
    logParts.push("");
    logParts.push("### Output");
    logParts.push("");
    logParts.push("```");
    logParts.push(options.stdout);
    logParts.push("```");
  }

  if (options.stderr) {
    logParts.push("");
    logParts.push("### Errors");
    logParts.push("");
    logParts.push("```");
    logParts.push(options.stderr);
    logParts.push("```");
  }

  logParts.push("");

  // Write updated session.md
  const updatedContent = stringifyFrontmatter(frontmatter, logParts.join("\n"));
  await writeFile(session.sessionFile, updatedContent, "utf-8");
}

/**
 * Get recent sessions from sessions directory
 */
export async function getRecentSessions(
  sessionsDir: string,
  limit: number = 20
): Promise<SessionInfo[]> {
  const sessions: SessionInfo[] = [];

  try {
    const entries = await readdir(sessionsDir);

    // Filter to directories that match session ID pattern
    const sessionDirs: Array<{ name: string; date: Date }> = [];
    for (const entry of entries) {
      const entryPath = join(sessionsDir, entry);
      const stats = await stat(entryPath);

      if (stats.isDirectory()) {
        const date = parseSessionId(entry);
        if (date) {
          sessionDirs.push({ name: entry, date });
        }
      }
    }

    // Sort by date, newest first
    sessionDirs.sort((a, b) => b.date.getTime() - a.date.getTime());

    // Take top N
    for (const { name, date } of sessionDirs.slice(0, limit)) {
      const sessionPath = join(sessionsDir, name);
      const sessionFile = join(sessionPath, "session.md");

      const info: SessionInfo = {
        id: name,
        path: sessionPath,
        timestamp: date,
      };

      // Try to read metadata
      try {
        const content = await readFile(sessionFile, "utf-8");
        const { frontmatter } = parseFrontmatter<SessionMetadata>(content);
        info.metadata = frontmatter;
      } catch {
        // Session.md might not exist or be invalid
      }

      sessions.push(info);
    }
  } catch {
    // Sessions directory might not exist yet
  }

  return sessions;
}

/**
 * Read a session by ID
 */
export async function readSession(
  sessionsDir: string,
  sessionId: string
): Promise<Session | null> {
  const sessionPath = join(sessionsDir, sessionId);
  const sessionFile = join(sessionPath, "session.md");

  try {
    const content = await readFile(sessionFile, "utf-8");
    const { frontmatter } = parseFrontmatter<SessionMetadata>(content);

    return {
      id: sessionId,
      path: sessionPath,
      sessionFile,
      metadata: frontmatter,
    };
  } catch {
    return null;
  }
}

/**
 * Session-as-Thread primitives
 *
 * Sessions are threads in the #sessions channel. This provides a simpler
 * model than the directory-based sessions, with cross-machine coordination
 * via file sync (since channels are just files).
 */

import { hostname } from "node:os";
import {
  publishMessage,
  replyToMessage,
  getThreadWorkspace,
  ensureChannel,
} from "./channel.js";

const SESSIONS_CHANNEL = "#sessions";

/**
 * Session start options
 */
export interface StartSessionOptions {
  /** Base channels directory */
  channelsDir: string;
  /** Persona name running the session */
  persona: string;
  /** Execution mode */
  mode: "interactive" | "headless";
  /** What triggered the session */
  trigger: "manual" | "cron" | "dm" | "channel";
  /** Session goal/description */
  goal?: string;
  /** Upstream return address for delegation callbacks */
  upstream?: string;
}

/**
 * Active session handle
 */
export interface SessionThread {
  /** Session/thread ID (ISO timestamp) */
  id: string;
  /** Path to workspace directory */
  workspacePath: string;
  /** Channels directory */
  channelsDir: string;
}

/**
 * Start a new session by creating a thread in #sessions
 *
 * @returns Session handle with thread ID and workspace path
 */
export async function startSession(
  options: StartSessionOptions
): Promise<SessionThread> {
  const { channelsDir, persona, mode, trigger, goal, upstream } = options;
  const host = hostname();

  // Build the initial session message
  const lines: string[] = [];
  lines.push("**Session Started**");
  lines.push("");
  lines.push(`- **Persona:** ${persona}`);
  lines.push(`- **Mode:** ${mode}`);
  lines.push(`- **Trigger:** ${trigger}`);
  lines.push(`- **Host:** ${host}`);
  if (goal) {
    lines.push(`- **Goal:** ${goal}`);
  }
  if (upstream) {
    lines.push(`- **Upstream:** ${upstream}`);
  }

  // Publish to #sessions channel
  const threadId = await publishMessage(channelsDir, SESSIONS_CHANNEL, lines.join("\n"), {
    from: `session:${persona}`,
    tags: ["session-start", mode, trigger],
  });

  // Create and return workspace path
  const workspacePath = await getThreadWorkspace(
    channelsDir,
    SESSIONS_CHANNEL,
    threadId,
    true // create if doesn't exist
  );

  if (!workspacePath) {
    throw new Error(`Failed to create workspace for session ${threadId}`);
  }

  return {
    id: threadId,
    workspacePath,
    channelsDir,
  };
}

/**
 * Post an update to a session thread
 *
 * @param session - Session handle or session ID
 * @param channelsDir - Channels directory (required if session is just an ID)
 * @param message - Update message content
 * @param from - Who is posting (defaults to session persona)
 */
export async function updateSession(
  session: SessionThread | string,
  channelsDirOrMessage: string,
  messageOrFrom?: string,
  from?: string
): Promise<string> {
  let channelsDir: string;
  let threadId: string;
  let message: string;
  let sender: string | undefined;

  if (typeof session === "string") {
    // Called as updateSession(threadId, channelsDir, message, from?)
    threadId = session;
    channelsDir = channelsDirOrMessage;
    message = messageOrFrom!;
    sender = from;
  } else {
    // Called as updateSession(session, message, from?)
    threadId = session.id;
    channelsDir = session.channelsDir;
    message = channelsDirOrMessage;
    sender = messageOrFrom;
  }

  const replyId = await replyToMessage(
    channelsDir,
    SESSIONS_CHANNEL,
    threadId,
    message,
    {
      from: sender,
    }
  );

  return replyId;
}

/**
 * End session options
 */
export interface EndSessionOptions {
  /** Whether the session completed successfully */
  success: boolean;
  /** Exit code */
  exitCode: number;
  /** Duration in milliseconds */
  duration: number;
  /** Error message if failed */
  error?: string;
}

/**
 * End a session by posting a completion message
 *
 * @param session - Session handle
 * @param options - End session options
 */
export async function endSession(
  session: SessionThread,
  options: EndSessionOptions
): Promise<string> {
  const { success, exitCode, duration, error } = options;

  // Format duration nicely
  const durationStr = formatDuration(duration);

  const lines: string[] = [];
  lines.push("**Session Ended**");
  lines.push("");
  lines.push(`- **Success:** ${success ? "✓" : "✗"}`);
  lines.push(`- **Exit Code:** ${exitCode}`);
  lines.push(`- **Duration:** ${durationStr}`);
  if (error) {
    lines.push(`- **Error:** ${error}`);
  }

  const replyId = await replyToMessage(
    session.channelsDir,
    SESSIONS_CHANNEL,
    session.id,
    lines.join("\n"),
    {
      from: "system",
      tags: ["session-end", success ? "success" : "failed"],
    }
  );

  return replyId;
}

/**
 * Format duration in human-readable form
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  if (ms < 3600000) {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Get the workspace path for a session thread
 */
export async function getSessionWorkspace(
  channelsDir: string,
  sessionId: string,
  create: boolean = false
): Promise<string | null> {
  return getThreadWorkspace(channelsDir, SESSIONS_CHANNEL, sessionId, create);
}

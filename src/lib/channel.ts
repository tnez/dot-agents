import { readdir, mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { parseFrontmatter } from "./frontmatter.js";
import type {
  ChannelMetadata,
  ChannelMessage,
  ChannelMessageMeta,
  ChannelReply,
} from "./types/channel.js";

const METADATA_FILE = "_metadata.yaml";
const MESSAGE_FILE_LEGACY = "message.md"; // Backwards compatibility
const LAST_PROCESSED_FILE = "_last_processed.yaml";

/**
 * Check if a path exists and is a directory
 */
async function isDirectory(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if a path exists and is a file
 */
async function isFile(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Generate ISO 8601 timestamp for message ID
 */
function generateMessageId(): string {
  return new Date().toISOString();
}

/**
 * Get the path to the initial message file in a thread directory.
 * Supports both new format (<threadId>.md) and legacy format (message.md).
 */
async function getInitialMessagePath(threadDir: string, threadId: string): Promise<string | null> {
  // Try new format first: <threadId>.md
  const newPath = join(threadDir, `${threadId}.md`);
  if (await isFile(newPath)) {
    return newPath;
  }

  // Fall back to legacy format: message.md
  const legacyPath = join(threadDir, MESSAGE_FILE_LEGACY);
  if (await isFile(legacyPath)) {
    return legacyPath;
  }

  return null;
}

/**
 * Check if a name is a valid channel name (starts with # or @)
 */
export function isChannelName(name: string): boolean {
  return name.startsWith("#") || name.startsWith("@");
}

/**
 * Result of resolving a channel address
 */
export interface ResolvedChannelAddress {
  /** Path to the channels directory */
  channelsDir: string;
  /** Channel name (e.g., @persona, #channel) */
  localChannelName: string;
}

/**
 * Resolve a channel address to a channels directory and channel name
 *
 * @param address - Channel address (e.g., @persona, #channel)
 * @param localChannelsDir - The local channels directory
 * @returns Resolved channel address info
 */
export async function resolveChannelAddress(
  address: string,
  localChannelsDir: string
): Promise<ResolvedChannelAddress> {
  if (!isChannelName(address)) {
    throw new Error(
      `Invalid channel address: ${address}. Must start with # or @`
    );
  }

  return {
    channelsDir: localChannelsDir,
    localChannelName: address,
  };
}

/**
 * List all channels in the channels directory
 */
export async function listChannels(
  channelsDir: string
): Promise<{ name: string; metadata: ChannelMetadata }[]> {
  const channels: { name: string; metadata: ChannelMetadata }[] = [];

  if (!(await isDirectory(channelsDir))) {
    return channels;
  }

  const entries = await readdir(channelsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!isChannelName(entry.name)) continue;

    const metadataPath = join(channelsDir, entry.name, METADATA_FILE);
    if (await isFile(metadataPath)) {
      try {
        const content = await readFile(metadataPath, "utf-8");
        const metadata = parseYaml(content) as ChannelMetadata;
        channels.push({ name: entry.name, metadata });
      } catch {
        channels.push({
          name: entry.name,
          metadata: {
            name: entry.name.slice(1),
            created_by: "unknown",
            created_at: "unknown",
          },
        });
      }
    }
  }

  return channels.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Ensure a channel exists, creating it if needed
 */
export async function ensureChannel(
  channelsDir: string,
  channelName: string,
  createdBy: string = "system"
): Promise<void> {
  if (!isChannelName(channelName)) {
    throw new Error(
      `Invalid channel name: ${channelName}. Must start with # or @`
    );
  }

  const channelPath = join(channelsDir, channelName);

  await mkdir(channelPath, { recursive: true });

  const metadataPath = join(channelPath, METADATA_FILE);
  if (!(await isFile(metadataPath))) {
    const metadata: ChannelMetadata = {
      name: channelName.slice(1),
      created_by: createdBy,
      created_at: new Date().toISOString(),
    };
    await writeFile(metadataPath, stringifyYaml(metadata), "utf-8");
  }
}

/**
 * Publish a message to a channel
 */
export async function publishMessage(
  channelsDir: string,
  channelName: string,
  content: string,
  meta?: ChannelMessageMeta
): Promise<string> {
  await ensureChannel(channelsDir, channelName, meta?.from);

  const messageId = generateMessageId();
  const messagePath = join(channelsDir, channelName, messageId);

  await mkdir(messagePath, { recursive: true });

  const host = hostname();
  let messageContent = "";
  const frontmatter: Record<string, unknown> = { host };
  if (meta?.from) frontmatter.from = meta.from;
  if (meta?.run_id) frontmatter.run_id = meta.run_id;
  if (meta?.tags?.length) frontmatter.tags = meta.tags;
  if (meta?.thread_id) frontmatter.thread_id = meta.thread_id;
  messageContent = `---\n${stringifyYaml(frontmatter)}---\n\n`;
  messageContent += content + "\n";

  // Write initial message with timestamp filename (uniform with replies)
  await writeFile(join(messagePath, `${messageId}.md`), messageContent, "utf-8");

  return messageId;
}

/**
 * Read messages from a channel
 */
export async function readChannel(
  channelsDir: string,
  channelName: string,
  limit?: number,
  since?: Date,
  threadId?: string
): Promise<ChannelMessage[]> {
  const channelPath = join(channelsDir, channelName);

  if (!(await isDirectory(channelPath))) {
    return [];
  }

  const entries = await readdir(channelPath, { withFileTypes: true });
  const messages: ChannelMessage[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("_")) continue;

    const messageDir = join(channelPath, entry.name);
    const threadId_local = entry.name;

    // Find initial message file (new or legacy format)
    const messagePath = await getInitialMessagePath(messageDir, threadId_local);
    if (!messagePath) continue;

    const messageDate = new Date(entry.name);
    if (since && messageDate < since) continue;

    // If filtering by thread, we need to read and check frontmatter first
    if (threadId) {
      try {
        const content = await readFile(messagePath, "utf-8");
        if (content.startsWith("---\n")) {
          const parsed = parseFrontmatter<ChannelMessageMeta>(content);
          if (parsed.frontmatter.thread_id !== threadId) continue;
        } else {
          continue; // No frontmatter means no thread_id
        }
      } catch {
        continue;
      }
    }

    try {
      const content = await readFile(messagePath, "utf-8");
      let meta: ChannelMessageMeta = {};
      let body: string;

      if (content.startsWith("---\n")) {
        try {
          const parsed = parseFrontmatter<ChannelMessageMeta>(content);
          meta = parsed.frontmatter;
          body = parsed.body;
        } catch {
          body = content;
        }
      } else {
        body = content.trim();
      }

      const replies = await readReplies(messageDir, threadId_local);

      messages.push({
        id: entry.name,
        content: body,
        meta,
        replies: replies.length > 0 ? replies : undefined,
      });
    } catch {
      continue;
    }
  }

  messages.sort((a, b) => b.id.localeCompare(a.id));

  if (limit && limit > 0) {
    return messages.slice(0, limit);
  }

  return messages;
}

/**
 * Read replies for a message (excluding the initial message)
 */
async function readReplies(messageDir: string, threadId: string): Promise<ChannelReply[]> {
  const entries = await readdir(messageDir, { withFileTypes: true });
  const replies: ChannelReply[] = [];

  // Files to skip: legacy message.md and the initial message (<threadId>.md)
  const initialMessageFile = `${threadId}.md`;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name === MESSAGE_FILE_LEGACY) continue; // Skip legacy initial
    if (entry.name === initialMessageFile) continue;  // Skip new-format initial
    if (!entry.name.endsWith(".md")) continue;

    const replyId = entry.name.replace(/\.md$/, "");
    const replyPath = join(messageDir, entry.name);

    try {
      const content = await readFile(replyPath, "utf-8");
      let meta: ChannelMessageMeta = {};
      let body: string;

      if (content.startsWith("---\n")) {
        try {
          const parsed = parseFrontmatter<ChannelMessageMeta>(content);
          meta = parsed.frontmatter;
          body = parsed.body;
        } catch {
          body = content.trim();
        }
      } else {
        body = content.trim();
      }

      replies.push({
        id: replyId,
        content: body,
        meta,
      });
    } catch {
      continue;
    }
  }

  return replies.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Reply to a message in a channel
 */
export async function replyToMessage(
  channelsDir: string,
  channelName: string,
  messageId: string,
  content: string,
  meta?: ChannelMessageMeta
): Promise<string> {
  const messagePath = join(channelsDir, channelName, messageId);

  if (!(await isDirectory(messagePath))) {
    throw new Error(`Message not found: ${channelName}/${messageId}`);
  }

  const replyId = generateMessageId();

  const host = hostname();
  let replyContent = "";
  const frontmatter: Record<string, unknown> = { host };
  if (meta?.from) frontmatter.from = meta.from;
  if (meta?.run_id) frontmatter.run_id = meta.run_id;
  if (meta?.tags?.length) frontmatter.tags = meta.tags;
  replyContent = `---\n${stringifyYaml(frontmatter)}---\n\n`;
  replyContent += content + "\n";

  await writeFile(join(messagePath, `${replyId}.md`), replyContent, "utf-8");

  return replyId;
}

/**
 * Load channel metadata
 */
export async function loadChannelMetadata(
  channelsDir: string,
  channelName: string
): Promise<ChannelMetadata | null> {
  const metadataPath = join(channelsDir, channelName, METADATA_FILE);

  if (!(await isFile(metadataPath))) {
    return null;
  }

  const content = await readFile(metadataPath, "utf-8");
  return parseYaml(content) as ChannelMetadata;
}

/**
 * Last processed tracking for channels process command
 */
interface LastProcessedInfo {
  /** ISO timestamp of when the channel was last processed */
  last_processed_at: string;
  /** Hostname that performed the last processing */
  processed_by: string;
}

/**
 * Get the last processed timestamp for a channel
 */
export async function getLastProcessedTime(
  channelsDir: string,
  channelName: string
): Promise<Date | null> {
  const lastProcessedPath = join(channelsDir, channelName, LAST_PROCESSED_FILE);

  if (!(await isFile(lastProcessedPath))) {
    return null;
  }

  try {
    const content = await readFile(lastProcessedPath, "utf-8");
    const info = parseYaml(content) as LastProcessedInfo;
    return new Date(info.last_processed_at);
  } catch {
    return null;
  }
}

/**
 * Mark a channel as processed at the current time
 */
export async function markChannelProcessed(
  channelsDir: string,
  channelName: string
): Promise<void> {
  const channelPath = join(channelsDir, channelName);

  if (!(await isDirectory(channelPath))) {
    return;
  }

  const info: LastProcessedInfo = {
    last_processed_at: new Date().toISOString(),
    processed_by: hostname(),
  };

  const lastProcessedPath = join(channelPath, LAST_PROCESSED_FILE);
  await writeFile(lastProcessedPath, stringifyYaml(info), "utf-8");
}

/**
 * A pending message that needs processing
 */
export interface PendingMessage {
  /** Message ID (ISO 8601 timestamp) */
  id: string;
  /** Channel name (e.g., @persona) */
  channel: string;
  /** Path to the message file */
  path: string;
  /** Message content (body, without frontmatter) */
  content: string;
  /** Message metadata */
  meta: ChannelMessageMeta;
}

/**
 * Get pending (unprocessed) messages for a DM channel
 * Returns messages newer than the last processed timestamp
 */
export async function getPendingMessages(
  channelsDir: string,
  channelName: string
): Promise<PendingMessage[]> {
  const channelPath = join(channelsDir, channelName);

  if (!(await isDirectory(channelPath))) {
    return [];
  }

  const lastProcessed = await getLastProcessedTime(channelsDir, channelName);
  const entries = await readdir(channelPath, { withFileTypes: true });
  const pending: PendingMessage[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("_")) continue;

    // Message ID is an ISO timestamp
    const messageDate = new Date(entry.name);
    if (Number.isNaN(messageDate.getTime())) continue;

    // Skip if already processed
    if (lastProcessed && messageDate <= lastProcessed) continue;

    const messageDir = join(channelPath, entry.name);
    const threadId = entry.name;

    // Find initial message file (new or legacy format)
    const messagePath = await getInitialMessagePath(messageDir, threadId);
    if (!messagePath) continue;

    try {
      const content = await readFile(messagePath, "utf-8");
      let meta: ChannelMessageMeta = {};
      let body: string;

      if (content.startsWith("---\n")) {
        try {
          const parsed = parseFrontmatter<ChannelMessageMeta>(content);
          meta = parsed.frontmatter;
          body = parsed.body;
        } catch {
          body = content;
        }
      } else {
        body = content.trim();
      }

      pending.push({
        id: entry.name,
        channel: channelName,
        path: messagePath,
        content: body,
        meta,
      });
    } catch {
      continue;
    }
  }

  // Sort by timestamp ascending (oldest first for processing order)
  return pending.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * List all DM channels (@persona) in the channels directory
 */
export async function listDMChannels(
  channelsDir: string
): Promise<string[]> {
  if (!(await isDirectory(channelsDir))) {
    return [];
  }

  const entries = await readdir(channelsDir, { withFileTypes: true });
  const dmChannels: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("@")) {
      dmChannels.push(entry.name);
    }
  }

  return dmChannels.sort();
}

/**
 * Get the workspace directory path for a thread.
 * The workspace is a directory within the thread for working files.
 *
 * @param channelsDir - Base channels directory
 * @param channelName - Channel name (e.g., "#sessions")
 * @param threadId - Thread ID (ISO timestamp)
 * @param create - If true, creates the workspace directory if it doesn't exist
 * @returns Path to the workspace directory, or null if thread doesn't exist
 */
export async function getThreadWorkspace(
  channelsDir: string,
  channelName: string,
  threadId: string,
  create: boolean = false
): Promise<string | null> {
  const threadDir = join(channelsDir, channelName, threadId);

  if (!(await isDirectory(threadDir))) {
    return null;
  }

  const workspacePath = join(threadDir, "workspace");

  if (create) {
    await mkdir(workspacePath, { recursive: true });
  }

  return workspacePath;
}

/**
 * Get the thread directory path.
 *
 * @param channelsDir - Base channels directory
 * @param channelName - Channel name (e.g., "#sessions")
 * @param threadId - Thread ID (ISO timestamp)
 * @returns Path to the thread directory, or null if it doesn't exist
 */
export async function getThreadPath(
  channelsDir: string,
  channelName: string,
  threadId: string
): Promise<string | null> {
  const threadDir = join(channelsDir, channelName, threadId);

  if (!(await isDirectory(threadDir))) {
    return null;
  }

  return threadDir;
}

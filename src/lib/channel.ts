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
const MESSAGE_FILE = "message.md";

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
 * Check if a name is a valid channel name (starts with # or @)
 */
export function isChannelName(name: string): boolean {
  return name.startsWith("#") || name.startsWith("@");
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

  await writeFile(join(messagePath, MESSAGE_FILE), messageContent, "utf-8");

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
    const messagePath = join(messageDir, MESSAGE_FILE);

    if (!(await isFile(messagePath))) continue;

    const messageDate = new Date(entry.name);
    if (since && messageDate < since) continue;

    // If filtering by thread, we need to read and check frontmatter first
    if (threadId) {
      const messagePath = join(messageDir, MESSAGE_FILE);
      if (!(await isFile(messagePath))) continue;
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

      const replies = await readReplies(messageDir);

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
 * Read replies for a message
 */
async function readReplies(messageDir: string): Promise<ChannelReply[]> {
  const entries = await readdir(messageDir, { withFileTypes: true });
  const replies: ChannelReply[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name === MESSAGE_FILE) continue;
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

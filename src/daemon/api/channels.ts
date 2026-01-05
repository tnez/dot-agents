import { Router, type Request, type Response } from "express";
import {
  listChannels,
  readChannel,
  loadChannelMetadata,
  publishMessage,
  replyToMessage,
} from "../../lib/channel.js";
import type {
  ChannelMetadata,
  ChannelMessage,
  ChannelMessageMeta,
} from "../../lib/types/channel.js";

/**
 * API response types for channels
 */
interface ChannelListResponse {
  channels: Array<{
    name: string;
    metadata: ChannelMetadata;
  }>;
}

interface ChannelReadResponse {
  channel: string;
  metadata: ChannelMetadata | null;
  messages: ChannelMessage[];
}

interface MessageResponse {
  channel: string;
  message: ChannelMessage | null;
}

interface PublishResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface ReplyResponse {
  success: boolean;
  replyId?: string;
  error?: string;
}

/**
 * Parse duration string (e.g., "24h", "7d", "4w", "1m") to Date
 */
function parseSince(since: string): Date | undefined {
  const match = since.match(/^(\d+)([hdwm])$/);
  if (!match) return undefined;

  const value = parseInt(match[1], 10);
  const unit = match[2];
  const now = new Date();

  switch (unit) {
    case "h":
      return new Date(now.getTime() - value * 60 * 60 * 1000);
    case "d":
      return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
    case "w":
      return new Date(now.getTime() - value * 7 * 24 * 60 * 60 * 1000);
    case "m":
      return new Date(now.getTime() - value * 30 * 24 * 60 * 60 * 1000);
    default:
      return undefined;
  }
}

/**
 * Create the channels API router
 */
export function createChannelsRouter(channelsDir: string): Router {
  const router = Router();

  // GET /channels - List all channels
  router.get("/", async (_req: Request, res: Response) => {
    try {
      const channels = await listChannels(channelsDir);
      const response: ChannelListResponse = { channels };
      res.json(response);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // GET /channels/:name - Read messages from a channel
  router.get("/:name", async (req: Request, res: Response) => {
    try {
      const channelName = req.params.name;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const since = req.query.since ? parseSince(req.query.since as string) : undefined;
      const threadId = req.query.thread as string | undefined;

      const metadata = await loadChannelMetadata(channelsDir, channelName);
      const messages = await readChannel(channelsDir, channelName, limit, since, threadId);

      const response: ChannelReadResponse = {
        channel: channelName,
        metadata,
        messages,
      };
      res.json(response);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // GET /channels/:name/:messageId - Get a specific message with replies
  router.get("/:name/:messageId", async (req: Request, res: Response) => {
    try {
      const channelName = req.params.name;
      const messageId = req.params.messageId;

      // Read all messages and find the one we want
      const messages = await readChannel(channelsDir, channelName);
      const message = messages.find((m) => m.id === messageId) || null;

      const response: MessageResponse = {
        channel: channelName,
        message,
      };

      if (!message) {
        res.status(404).json(response);
        return;
      }

      res.json(response);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // POST /channels/:name - Publish a message
  router.post("/:name", async (req: Request, res: Response) => {
    try {
      const channelName = req.params.name;
      const { content, from, tags, thread_id } = req.body;

      if (!content || typeof content !== "string") {
        res.status(400).json({ success: false, error: "content is required" });
        return;
      }

      const meta: ChannelMessageMeta = {};
      if (from) meta.from = from;
      if (tags && Array.isArray(tags)) meta.tags = tags;
      if (thread_id) meta.thread_id = thread_id;

      const messageId = await publishMessage(channelsDir, channelName, content, meta);

      const response: PublishResponse = {
        success: true,
        messageId,
      };
      res.status(201).json(response);
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // POST /channels/:name/:messageId/reply - Reply to a message
  router.post("/:name/:messageId/reply", async (req: Request, res: Response) => {
    try {
      const channelName = req.params.name;
      const messageId = req.params.messageId;
      const { content, from, tags } = req.body;

      if (!content || typeof content !== "string") {
        res.status(400).json({ success: false, error: "content is required" });
        return;
      }

      const meta: ChannelMessageMeta = {};
      if (from) meta.from = from;
      if (tags && Array.isArray(tags)) meta.tags = tags;

      const replyId = await replyToMessage(channelsDir, channelName, messageId, content, meta);

      const response: ReplyResponse = {
        success: true,
        replyId,
      };
      res.status(201).json(response);
    } catch (error) {
      if ((error as Error).message.includes("not found")) {
        res.status(404).json({ success: false, error: (error as Error).message });
        return;
      }
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  return router;
}

import { Command } from "commander";
import chalk from "chalk";
import { join } from "node:path";
import {
  requireConfig,
  listChannels,
  publishMessage,
  readChannel,
  replyToMessage,
  isChannelName,
  resolveChannelAddress,
  parseChannelAddress,
  processChannels,
  listDMChannels,
  getPendingMessages,
  getDaemonStatus,
} from "../../lib/index.js";
import type { ExecutionMode } from "../../lib/processor.js";

/**
 * Parsed from address with optional thread context
 */
export interface ParsedFromAddress {
  /** The channel or identity (e.g., "#docs/sessions", "@docs", "human:tnez") */
  address: string;
  /** Optional thread ID for callbacks */
  thread?: string;
}

/**
 * Parse a from address that may include a thread suffix
 * Format: <address>:<thread-id> or just <address>
 *
 * Examples:
 * - "#docs/sessions:2026-01-02T21:00:00.000Z" -> { address: "#docs/sessions", thread: "2026-01-02T21:00:00.000Z" }
 * - "@docs" -> { address: "@docs", thread: undefined }
 * - "human:tnez" -> { address: "human:tnez", thread: undefined }
 */
export function parseFromAddress(from: string): ParsedFromAddress {
  // Only parse thread suffix if it starts with # (channel with thread)
  // This avoids breaking "human:tnez" or "agent:persona"
  if (from.startsWith("#")) {
    // Find the last colon that separates channel from thread
    // Thread IDs are ISO timestamps like 2026-01-02T21:00:00.000Z
    const match = from.match(/^(#[^:]+):(.+)$/);
    if (match) {
      return { address: match[1], thread: match[2] };
    }
  }
  return { address: from, thread: undefined };
}

/**
 * Resolve the 'from' field using priority order:
 * 1. --from flag (explicit override)
 * 2. FROM_ADDRESS env var (set by session system for callbacks)
 * 3. DOT_AGENTS_PERSONA env var -> agent:<persona-path>
 * 4. Fallback to human:$USER
 */
function resolveFrom(explicitFrom?: string): string {
  if (explicitFrom) {
    return explicitFrom;
  }

  // Session-provided return address for callbacks
  const fromAddress = process.env.FROM_ADDRESS;
  if (fromAddress) {
    return fromAddress;
  }

  const persona = process.env.DOT_AGENTS_PERSONA;
  if (persona) {
    return `agent:${persona}`;
  }

  const user = process.env.USER || process.env.USERNAME || "unknown";
  return `human:${user}`;
}

export const channelsCommand = new Command("channels")
  .description("Manage channels for agent communication")
  .action(() => {
    channelsCommand.help();
  });

channelsCommand
  .command("list")
  .description("List all channels")
  .action(async () => {
    try {
      const config = await requireConfig();
      const channels = await listChannels(config.channelsDir);

      if (channels.length === 0) {
        console.log(chalk.yellow("No channels found"));
        return;
      }

      console.log(chalk.blue(`Channels (${channels.length}):\n`));

      for (const { name, metadata } of channels) {
        console.log(chalk.white(`  ${name}`));
        if (metadata.description) {
          console.log(chalk.dim(`    ${metadata.description}`));
        }
        console.log(
          chalk.dim(`    created by ${metadata.created_by} at ${metadata.created_at}`)
        );
        console.log();
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

channelsCommand
  .command("publish")
  .description("Publish a message to a channel")
  .argument("<channel>", "Channel name (e.g., #status, @persona, #channel:thread-id)")
  .argument("<message>", "Message content")
  .option("--from <from>", "Sender identifier")
  .option("--run-id <runId>", "Run ID for workflow context")
  .option("--tags <tags>", "Comma-separated tags")
  .option("--thread <threadId>", "Thread ID to add message to (default: creates new thread)")
  .action(async (channel, message, options) => {
    try {
      // Parse channel address - may include thread suffix (#channel:thread-id)
      const parsed = parseFromAddress(channel);
      const channelName = parsed.address;
      const embeddedThread = parsed.thread;

      // Validate basic format (must start with # or @)
      if (!isChannelName(channelName)) {
        console.error(
          chalk.red(`Invalid channel name: ${channelName}. Must start with # or @`)
        );
        process.exit(1);
      }

      const config = await requireConfig();

      // Resolve channel address (checks projects first for @name)
      const resolved = await resolveChannelAddress(
        channelName,
        config.channelsDir
      );

      const meta: { from: string; run_id?: string; tags?: string[]; thread_id?: string } = {
        from: resolveFrom(options.from),
      };

      if (options.runId) meta.run_id = options.runId;
      if (options.tags) meta.tags = options.tags.split(",").map((t: string) => t.trim());

      // Thread priority: --thread flag > embedded in channel > new UUID
      const threadId = options.thread || embeddedThread || crypto.randomUUID();
      meta.thread_id = threadId;

      const messageId = await publishMessage(
        resolved.channelsDir,
        resolved.localChannelName,
        message,
        meta
      );

      console.log(chalk.green(`Published to ${channel}`));
      console.log(chalk.dim(`  Message ID: ${messageId}`));
      console.log(chalk.dim(`  Thread ID: ${threadId}`));
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

channelsCommand
  .command("read")
  .description("Read messages from a channel")
  .argument("<channel>", "Channel name (e.g., #status, @persona, @project)")
  .option("-l, --limit <n>", "Number of messages to show", "10")
  .option("--since <duration>", "Show messages since duration (e.g., 24h, 7d)")
  .option("--thread <threadId>", "Filter messages by thread ID")
  .action(async (channel, options) => {
    try {
      if (!isChannelName(channel)) {
        console.error(
          chalk.red(`Invalid channel name: ${channel}. Must start with # or @`)
        );
        process.exit(1);
      }

      const config = await requireConfig();

      // Resolve channel address (checks projects first for @name)
      const resolved = await resolveChannelAddress(
        channel,
        config.channelsDir
      );

      const limit = parseInt(options.limit, 10);

      let since: Date | undefined;
      if (options.since) {
        since = parseDuration(options.since);
      }

      const messages = await readChannel(
        resolved.channelsDir,
        resolved.localChannelName,
        limit,
        since,
        options.thread
      );

      if (messages.length === 0) {
        console.log(chalk.yellow(`No messages in ${channel}`));
        return;
      }

      console.log(chalk.blue(`${channel} (${messages.length} messages):\n`));

      for (const msg of messages) {
        const from = msg.meta.from || "unknown";
        const host = msg.meta.host || "unknown";
        const timestamp = formatTimestamp(msg.id);

        console.log(chalk.white(`  [${timestamp}] ${chalk.cyan(from)} ${chalk.dim(`(${host})`)}`));
        console.log(chalk.dim(`    ID: ${msg.id}`));
        if (msg.meta.thread_id) {
          console.log(chalk.dim(`    Thread: ${msg.meta.thread_id}`));
        }

        const lines = msg.content.split("\n");
        for (const line of lines) {
          console.log(`    ${line}`);
        }

        if (msg.replies && msg.replies.length > 0) {
          console.log(chalk.dim(`    └─ ${msg.replies.length} replies`));
        }

        console.log();
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

channelsCommand
  .command("reply")
  .description("Reply to a message thread")
  .argument("<channel>", "Channel name (e.g., @persona, @project)")
  .argument("<messageId>", "Message ID to reply to")
  .argument("<message>", "Reply content")
  .option("--from <from>", "Sender identifier")
  .action(async (channel, messageId, message, options) => {
    try {
      if (!isChannelName(channel)) {
        console.error(
          chalk.red(`Invalid channel name: ${channel}. Must start with # or @`)
        );
        process.exit(1);
      }

      const config = await requireConfig();

      // Resolve channel address (checks projects first for @name)
      const resolved = await resolveChannelAddress(
        channel,
        config.channelsDir
      );

      const meta: { from: string } = {
        from: resolveFrom(options.from),
      };

      const replyId = await replyToMessage(
        resolved.channelsDir,
        resolved.localChannelName,
        messageId,
        message,
        meta
      );

      console.log(chalk.green(`Replied in ${channel}`));
      console.log(chalk.dim(`  Reply ID: ${replyId}`));
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

/**
 * Parse duration string to Date
 */
function parseDuration(duration: string): Date {
  const match = duration.match(/^(\d+)([hdwm])$/);
  if (!match) {
    throw new Error(
      `Invalid duration: ${duration}. Use format like 24h, 7d, 4w, 1m`
    );
  }

  const [, value, unit] = match;
  const now = new Date();
  const ms = parseInt(value, 10);

  switch (unit) {
    case "h":
      return new Date(now.getTime() - ms * 60 * 60 * 1000);
    case "d":
      return new Date(now.getTime() - ms * 24 * 60 * 60 * 1000);
    case "w":
      return new Date(now.getTime() - ms * 7 * 24 * 60 * 60 * 1000);
    case "m":
      return new Date(now.getTime() - ms * 30 * 24 * 60 * 60 * 1000);
    default:
      throw new Error(`Unknown duration unit: ${unit}`);
  }
}

/**
 * Format ISO timestamp for display
 */
function formatTimestamp(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp);
    return date.toLocaleString();
  } catch {
    return isoTimestamp;
  }
}

channelsCommand
  .command("process")
  .description("Process pending messages in DM channels (one-shot)")
  .argument("[channel]", "Specific channel to process (e.g., @persona)")
  .option("--dry-run", "Show pending messages without processing")
  .option("--mode <mode>", "Execution mode: headless (default) or interactive", "headless")
  .option("--verbose", "Stream delegate output for visibility")
  .action(async (channel, options) => {
    try {
      const config = await requireConfig();

      // Validate channel format if provided
      if (channel && !channel.startsWith("@")) {
        console.error(
          chalk.red(`Invalid channel: ${channel}. Only DM channels (@persona) can be processed.`)
        );
        process.exit(1);
      }

      if (options.dryRun) {
        // Dry run: just show pending messages
        let channels: string[];
        if (channel) {
          channels = [channel];
        } else {
          channels = await listDMChannels(config.channelsDir);
        }

        let totalPending = 0;

        for (const ch of channels) {
          const pending = await getPendingMessages(config.channelsDir, ch);
          if (pending.length === 0) continue;

          totalPending += pending.length;
          console.log(chalk.blue(`\n${ch} (${pending.length} pending):`));

          for (const msg of pending) {
            const from = msg.meta.from || "unknown";
            const timestamp = formatTimestamp(msg.id);
            console.log(chalk.white(`  [${timestamp}] ${chalk.cyan(from)}`));
            console.log(chalk.dim(`    ID: ${msg.id}`));
            const lines = msg.content.split("\n").slice(0, 3);
            for (const line of lines) {
              console.log(`    ${line}`);
            }
            if (msg.content.split("\n").length > 3) {
              console.log(chalk.dim(`    ...`));
            }
          }
        }

        if (totalPending === 0) {
          console.log(chalk.yellow("No pending messages to process"));
        } else {
          console.log(chalk.dim(`\nTotal: ${totalPending} pending message(s)`));
        }
        return;
      }

      // Validate mode option
      const mode = options.mode as ExecutionMode;
      if (mode !== "headless" && mode !== "interactive") {
        console.error(
          chalk.red(`Invalid mode: ${options.mode}. Must be "headless" or "interactive".`)
        );
        process.exit(1);
      }

      // Process messages
      console.log(chalk.blue("Processing pending messages..."));

      // Progress tracking for elapsed time display
      let currentChannel: string | null = null;
      let processingStartTime: number | null = null;
      let progressInterval: ReturnType<typeof setInterval> | null = null;

      // Format elapsed time for display
      const formatElapsed = (ms: number): string => {
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) {
          return `${seconds}s`;
        }
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
      };

      // Progress callback to show elapsed time
      const onProgress = (ch: string, status: "started" | "processing" | "complete") => {
        if (status === "started") {
          currentChannel = ch;
          processingStartTime = Date.now();

          // Start progress interval (update every 5 seconds)
          if (progressInterval) {
            clearInterval(progressInterval);
          }
          progressInterval = setInterval(() => {
            if (processingStartTime && currentChannel) {
              const elapsed = Date.now() - processingStartTime;
              process.stdout.write(`\r  [${currentChannel}] Processing... (${formatElapsed(elapsed)} elapsed)`);
            }
          }, 5000);

          // Initial progress message
          process.stdout.write(`  [${ch}] Processing...`);
        } else if (status === "complete") {
          // Clear the interval
          if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
          }
          // Clear the line for final result
          process.stdout.write("\r" + " ".repeat(60) + "\r");
          currentChannel = null;
          processingStartTime = null;
        }
      };

      const result = await processChannels(config, {
        channel,
        requirePersona: true,
        mode,
        verbose: options.verbose,
        onProgress,
      });

      // Ensure interval is cleared
      if (progressInterval) {
        clearInterval(progressInterval);
      }

      if (result.messagesProcessed === 0) {
        console.log(chalk.yellow("No pending messages to process"));
        return;
      }

      // Show results
      for (const r of result.results) {
        if (r.success) {
          console.log(
            chalk.green(`  [ok] ${r.channel} ${r.messageId.slice(0, 19)} (${formatElapsed(r.duration)})`)
          );
        } else {
          console.log(
            chalk.red(`  [fail] ${r.channel} ${r.messageId.slice(0, 19)}: ${r.error}`)
          );
        }
      }

      console.log();
      console.log(
        chalk.dim(
          `Processed ${result.messagesProcessed} message(s) across ${result.channelsChecked} channel(s)`
        )
      );

      if (!result.success) {
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

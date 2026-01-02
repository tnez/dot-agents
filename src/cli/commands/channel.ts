import { Command } from "commander";
import chalk from "chalk";
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
} from "../../lib/index.js";

/**
 * Resolve the 'from' field using priority order:
 * 1. --from flag (explicit override)
 * 2. DOT_AGENTS_PERSONA env var -> agent:<persona-path>
 * 3. Fallback to human:$USER
 */
function resolveFrom(explicitFrom?: string): string {
  if (explicitFrom) {
    return explicitFrom;
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
  .argument("<channel>", "Channel name (e.g., #status, @persona, @project/persona)")
  .argument("<message>", "Message content")
  .option("--from <from>", "Sender identifier")
  .option("--run-id <runId>", "Run ID for workflow context")
  .option("--tags <tags>", "Comma-separated tags")
  .option("--thread <threadId>", "Thread ID to add message to (default: creates new thread)")
  .action(async (channel, message, options) => {
    try {
      // Validate basic format (must start with # or @)
      if (!isChannelName(channel)) {
        console.error(
          chalk.red(`Invalid channel name: ${channel}. Must start with # or @`)
        );
        process.exit(1);
      }

      const config = await requireConfig();

      // Resolve cross-project address
      const { channelsDir, localChannelName } = await resolveChannelAddress(
        channel,
        config.channelsDir
      );

      const meta: { from: string; run_id?: string; tags?: string[]; thread_id?: string } = {
        from: resolveFrom(options.from),
      };

      if (options.runId) meta.run_id = options.runId;
      if (options.tags) meta.tags = options.tags.split(",").map((t: string) => t.trim());

      // Every message belongs to a thread - use provided or create new
      const threadId = options.thread || crypto.randomUUID();
      meta.thread_id = threadId;

      const messageId = await publishMessage(
        channelsDir,
        localChannelName,
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
  .argument("<channel>", "Channel name (e.g., #status, @project/persona)")
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

      // Resolve cross-project address
      const { channelsDir, localChannelName } = await resolveChannelAddress(
        channel,
        config.channelsDir
      );

      const limit = parseInt(options.limit, 10);

      let since: Date | undefined;
      if (options.since) {
        since = parseDuration(options.since);
      }

      const messages = await readChannel(
        channelsDir,
        localChannelName,
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
  .argument("<channel>", "Channel name (e.g., @persona, @project/persona)")
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

      // Resolve cross-project address
      const { channelsDir, localChannelName } = await resolveChannelAddress(
        channel,
        config.channelsDir
      );

      const meta: { from: string } = {
        from: resolveFrom(options.from),
      };

      const replyId = await replyToMessage(
        channelsDir,
        localChannelName,
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

      // Process messages
      console.log(chalk.blue("Processing pending messages..."));

      const result = await processChannels(config, {
        channel,
        requirePersona: true,
      });

      if (result.messagesProcessed === 0) {
        console.log(chalk.yellow("No pending messages to process"));
        return;
      }

      // Show results
      for (const r of result.results) {
        if (r.success) {
          console.log(
            chalk.green(`  [ok] ${r.channel} ${r.messageId.slice(0, 19)} (${r.duration}ms)`)
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

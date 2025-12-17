import { Command } from "commander";
import chalk from "chalk";
import {
  requireConfig,
  listChannels,
  publishMessage,
  readChannel,
  replyToMessage,
  isChannelName,
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
  .argument("<channel>", "Channel name (e.g., #status, @persona)")
  .argument("<message>", "Message content")
  .option("--from <from>", "Sender identifier")
  .option("--run-id <runId>", "Run ID for workflow context")
  .option("--tags <tags>", "Comma-separated tags")
  .action(async (channel, message, options) => {
    try {
      if (!isChannelName(channel)) {
        console.error(
          chalk.red(`Invalid channel name: ${channel}. Must start with # or @`)
        );
        process.exit(1);
      }

      const config = await requireConfig();
      const meta: { from: string; run_id?: string; tags?: string[] } = {
        from: resolveFrom(options.from),
      };

      if (options.runId) meta.run_id = options.runId;
      if (options.tags) meta.tags = options.tags.split(",").map((t: string) => t.trim());

      const messageId = await publishMessage(
        config.channelsDir,
        channel,
        message,
        meta
      );

      console.log(chalk.green(`Published to ${channel}`));
      console.log(chalk.dim(`  Message ID: ${messageId}`));
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

channelsCommand
  .command("read")
  .description("Read messages from a channel")
  .argument("<channel>", "Channel name (e.g., #status)")
  .option("-l, --limit <n>", "Number of messages to show", "10")
  .option("--since <duration>", "Show messages since duration (e.g., 24h, 7d)")
  .action(async (channel, options) => {
    try {
      if (!isChannelName(channel)) {
        console.error(
          chalk.red(`Invalid channel name: ${channel}. Must start with # or @`)
        );
        process.exit(1);
      }

      const config = await requireConfig();
      const limit = parseInt(options.limit, 10);

      let since: Date | undefined;
      if (options.since) {
        since = parseDuration(options.since);
      }

      const messages = await readChannel(
        config.channelsDir,
        channel,
        limit,
        since
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
  .argument("<channel>", "Channel name")
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
      const meta: { from: string } = {
        from: resolveFrom(options.from),
      };

      const replyId = await replyToMessage(
        config.channelsDir,
        channel,
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

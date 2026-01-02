import {
  type DotAgentsConfig,
  type PendingMessage,
  getPendingMessages,
  markChannelProcessed,
  listDMChannels,
  listPersonas,
  invokePersona,
} from "./index.js";
import { hasPersonaFile } from "./persona.js";
import { parseFromAddress } from "../cli/commands/channel.js";

/**
 * Result of processing a single message
 */
export interface ProcessResult {
  /** Message ID that was processed */
  messageId: string;
  /** Channel the message was in */
  channel: string;
  /** Persona that processed the message */
  persona: string;
  /** Whether processing succeeded */
  success: boolean;
  /** Duration in milliseconds */
  duration: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Result of processing all pending messages
 */
export interface ProcessAllResult {
  /** Number of channels checked */
  channelsChecked: number;
  /** Number of messages processed */
  messagesProcessed: number;
  /** Results for each processed message */
  results: ProcessResult[];
  /** Overall success (all messages processed successfully) */
  success: boolean;
}

/**
 * Options for processing channels
 */
export interface ProcessOptions {
  /** Specific channel to process (e.g., @persona). If not provided, processes all DM channels. */
  channel?: string;
  /** Only process channels that have a matching persona */
  requirePersona?: boolean;
}

/**
 * Build context object from message metadata
 * Extracts callback info from 'from' field if present
 */
function buildMessageContext(message: PendingMessage): Record<string, string> {
  const context: Record<string, string> = {
    DM_MESSAGE_ID: message.id,
  };

  // Parse from address for callback routing
  if (message.meta.from) {
    const parsed = parseFromAddress(message.meta.from);
    context.FROM_ADDRESS = message.meta.from;
    context.FROM_CHANNEL = parsed.address;
    if (parsed.thread) {
      context.FROM_THREAD = parsed.thread;
    }
  }

  return context;
}

/**
 * Process a single pending message by invoking the persona
 */
async function processMessage(
  config: DotAgentsConfig,
  message: PendingMessage
): Promise<ProcessResult> {
  const personaName = message.channel.slice(1); // Remove @ prefix

  try {
    const context = buildMessageContext(message);
    const result = await invokePersona(config, personaName, message.content, {
      source: message.channel,
      context,
      goal: `Process DM: ${personaName}`,
    });

    return {
      messageId: message.id,
      channel: message.channel,
      persona: personaName,
      success: result.success,
      duration: result.duration,
      error: result.success ? undefined : (result.stderr || result.error),
    };
  } catch (error) {
    return {
      messageId: message.id,
      channel: message.channel,
      persona: personaName,
      success: false,
      duration: 0,
      error: (error as Error).message,
    };
  }
}

/**
 * Check if a persona exists for a given DM channel
 */
async function personaExists(
  config: DotAgentsConfig,
  channelName: string
): Promise<boolean> {
  const personaName = channelName.slice(1); // Remove @ prefix

  // Check for root persona (.agents/PERSONA.md)
  if (personaName === "root") {
    return await hasPersonaFile(config.agentsDir);
  }

  const personaPaths = await listPersonas(config.personasDir);

  for (const path of personaPaths) {
    // Extract persona name from path
    const parts = path.split("/");
    const name = parts[parts.length - 1];
    if (name === personaName) {
      return true;
    }
  }

  return false;
}

/**
 * Process all pending messages in DM channels
 *
 * For each @persona channel with pending messages:
 * 1. Check if persona exists
 * 2. Invoke persona with each message
 * 3. Mark channel as processed
 */
export async function processChannels(
  config: DotAgentsConfig,
  options: ProcessOptions = {}
): Promise<ProcessAllResult> {
  const results: ProcessResult[] = [];
  let channelsChecked = 0;

  // Get channels to process
  let channels: string[];
  if (options.channel) {
    // Process specific channel
    if (!options.channel.startsWith("@")) {
      return {
        channelsChecked: 0,
        messagesProcessed: 0,
        results: [],
        success: false,
      };
    }
    channels = [options.channel];
  } else {
    // Process all DM channels
    channels = await listDMChannels(config.channelsDir);
  }

  for (const channel of channels) {
    channelsChecked++;

    // Check if persona exists for this channel
    const hasPersona = await personaExists(config, channel);
    if (!hasPersona) {
      if (options.requirePersona) {
        continue;
      }
      // Skip channels without personas silently
      continue;
    }

    // Get pending messages
    const pending = await getPendingMessages(config.channelsDir, channel);

    if (pending.length === 0) {
      continue;
    }

    // Process each message
    for (const message of pending) {
      const result = await processMessage(config, message);
      results.push(result);
    }

    // Mark channel as processed
    await markChannelProcessed(config.channelsDir, channel);
  }

  return {
    channelsChecked,
    messagesProcessed: results.length,
    results,
    success: results.every((r) => r.success),
  };
}

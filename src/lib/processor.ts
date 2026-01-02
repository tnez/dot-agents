import { join } from "node:path";
import { hostname } from "node:os";
import { execa } from "execa";
import {
  type DotAgentsConfig,
  type ExecutionResult,
  type PendingMessage,
  resolvePersona,
  createExecutionContext,
  processTemplate,
  expandVariables,
  createSession,
  finalizeSession,
  getPendingMessages,
  markChannelProcessed,
  listDMChannels,
  listPersonas,
} from "./index.js";

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
 * Process a single pending message by invoking the persona
 */
async function processMessage(
  config: DotAgentsConfig,
  message: PendingMessage
): Promise<ProcessResult> {
  const startedAt = new Date();
  const personaName = message.channel.slice(1); // Remove @ prefix

  try {
    // Resolve persona
    const persona = await resolvePersona(
      join(config.personasDir, personaName),
      config.personasDir
    );

    // Create session for DM processing
    const session = await createSession({
      sessionsDir: config.sessionsDir,
      runtime: {
        hostname: hostname(),
        executionMode: "headless",
        triggerType: "dm",
        workingDir: config.agentsDir,
      },
      goal: `Process DM: ${personaName}`,
      persona: {
        name: persona.name,
        inheritanceChain: persona.inheritanceChain,
      },
    });

    const context = createExecutionContext({
      PERSONA_NAME: persona.name,
      PERSONA_DIR: persona.path,
      AGENTS_DIR: config.agentsDir,
      SESSION_DIR: session.path,
      INVOCATION_SOURCE: message.channel,
      DM_MESSAGE_ID: message.id,
    });

    // Merge environment
    const env: Record<string, string> = {
      ...process.env,
      ...persona.env,
      DOT_AGENTS_PERSONA: persona.name,
      DOT_AGENTS_INVOCATION: "dm",
    } as Record<string, string>;

    for (const [key, value] of Object.entries(env)) {
      if (value) {
        env[key] = expandVariables(
          value,
          context as Record<string, string>,
          env
        );
      }
    }

    // Build prompt: persona prompt + message
    const parts: string[] = [];
    if (persona.prompt) {
      const expandedPrompt = processTemplate(persona.prompt, context, persona.env);
      parts.push(expandedPrompt);
      parts.push("\n---\n");
    }
    parts.push(`You received a direct message:\n\n${message.content}`);
    const prompt = parts.join("\n");

    // Timeout (10 minutes for DM invocations)
    const timeoutMs = 10 * 60 * 1000;

    // Use headless commands
    const cmds = persona.commands.headless;

    if (!cmds) {
      const duration = Date.now() - startedAt.getTime();
      await finalizeSession(session, {
        success: false,
        exitCode: 1,
        duration,
        error: `Persona '${persona.name}' does not support headless mode`,
      });
      return {
        messageId: message.id,
        channel: message.channel,
        persona: personaName,
        success: false,
        duration,
        error: `Persona '${persona.name}' does not support headless mode`,
      };
    }

    // Try each command
    let lastError: Error | null = null;
    let execResult: ExecutionResult | null = null;

    for (const cmd of cmds) {
      try {
        const expandedCmd = expandVariables(
          cmd,
          context as Record<string, string>,
          env
        );
        const [command, ...args] = expandedCmd.split(/\s+/);

        const result = await execa(command, args, {
          input: prompt,
          cwd: config.agentsDir,
          env,
          timeout: timeoutMs,
          reject: false,
        });

        const endedAt = new Date();

        execResult = {
          success: result.exitCode === 0,
          exitCode: result.exitCode ?? 1,
          stdout: result.stdout,
          stderr: result.stderr,
          duration: endedAt.getTime() - startedAt.getTime(),
          runId: context.RUN_ID,
          startedAt,
          endedAt,
        };

        if (execResult.success) break;

        lastError = new Error(
          `Command failed with exit code ${execResult.exitCode}: ${result.stderr}`
        );
      } catch (error) {
        lastError = error as Error;
      }
    }

    const duration = Date.now() - startedAt.getTime();

    if (!execResult) {
      await finalizeSession(session, {
        success: false,
        exitCode: 1,
        duration,
        error: lastError?.message ?? "All commands failed",
      });
      return {
        messageId: message.id,
        channel: message.channel,
        persona: personaName,
        success: false,
        duration,
        error: lastError?.message ?? "All commands failed",
      };
    }

    // Finalize session
    await finalizeSession(session, {
      success: execResult.success,
      exitCode: execResult.exitCode,
      duration: execResult.duration,
      error: execResult.error,
      stdout: execResult.stdout,
      stderr: execResult.stderr,
    });

    return {
      messageId: message.id,
      channel: message.channel,
      persona: personaName,
      success: execResult.success,
      duration: execResult.duration,
      error: execResult.success ? undefined : (execResult.stderr || execResult.error),
    };
  } catch (error) {
    const duration = Date.now() - startedAt.getTime();
    return {
      messageId: message.id,
      channel: message.channel,
      persona: personaName,
      success: false,
      duration,
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

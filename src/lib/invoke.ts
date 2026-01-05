import { join } from "node:path";
import { hostname } from "node:os";
import { execa } from "execa";
import {
  type DotAgentsConfig,
  type ExecutionResult,
  resolvePersona,
  createExecutionContext,
  processTemplate,
  expandVariables,
  createSession,
  finalizeSession,
} from "./index.js";
import { getEnvironmentContextMarkdown } from "./environment.js";

/**
 * Execution mode for persona invocation
 */
export type ExecutionMode = "headless" | "interactive";

/**
 * Options for invoking a persona directly
 */
export interface InvokePersonaOptions {
  /** Extra context variables to include */
  context?: Record<string, string>;
  /** Source of the invocation (e.g., DM channel name) */
  source?: string;
  /** Goal description for the session */
  goal?: string;
  /** Timeout in milliseconds (default: 10 minutes) */
  timeoutMs?: number;
  /** Execution mode: headless (default) or interactive */
  mode?: ExecutionMode;
  /** Stream stdout/stderr to console for visibility */
  verbose?: boolean;
}

/**
 * Invoke a persona directly with a message (no workflow required)
 *
 * This is the shared implementation used by:
 * - daemon/lib/executor.ts for DM-triggered invocations
 * - lib/processor.ts for one-shot channel processing
 */
export async function invokePersona(
  config: DotAgentsConfig,
  personaName: string,
  message: string,
  options: InvokePersonaOptions = {}
): Promise<ExecutionResult> {
  const startedAt = new Date();
  const {
    context: extraContext = {},
    source = "dm",
    goal = `DM invocation: ${personaName}`,
    timeoutMs = 10 * 60 * 1000,
    mode = "headless",
    verbose = false,
  } = options;

  // Resolve persona path - handle root persona specially
  const personaPath = personaName === "root"
    ? config.agentsDir
    : join(config.personasDir, personaName);

  const persona = await resolvePersona(personaPath, config.personasDir);

  // Create session for DM invocation
  const session = await createSession({
    sessionsDir: config.sessionsDir,
    runtime: {
      hostname: hostname(),
      executionMode: mode,
      triggerType: "dm",
      workingDir: config.agentsDir,
    },
    goal,
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
    INVOCATION_SOURCE: source,
    ...extraContext,
  });

  // Merge environment
  // Include FROM_ADDRESS, FROM_CHANNEL, FROM_THREAD from context if provided
  const env: Record<string, string> = {
    ...process.env,
    ...persona.env,
    DOT_AGENTS_PERSONA: persona.name,
    DOT_AGENTS_INVOCATION: "dm",
    // Pass session env vars from legacy session
    SESSION_DIR: session.path,
    // Pass callback routing from context (for cross-project delegation)
    ...(extraContext.FROM_ADDRESS && { FROM_ADDRESS: extraContext.FROM_ADDRESS }),
    ...(extraContext.FROM_CHANNEL && { FROM_CHANNEL: extraContext.FROM_CHANNEL }),
    ...(extraContext.FROM_THREAD && { FROM_THREAD: extraContext.FROM_THREAD }),
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

  // Build prompt: persona prompt + environment context + message
  const parts: string[] = [];
  if (persona.prompt) {
    const expandedPrompt = processTemplate(persona.prompt, context, persona.env);
    parts.push(expandedPrompt);
    parts.push("\n---\n");
  }

  // Inject environment discovery context
  const environmentContext = await getEnvironmentContextMarkdown(config);
  parts.push(environmentContext);
  parts.push("\n---\n");

  parts.push(`You received a direct message:\n\n${message}`);
  const prompt = parts.join("\n");

  // Use commands based on mode
  const cmds = mode === "interactive" ? persona.commands.interactive : persona.commands.headless;

  if (!cmds) {
    const endedAt = new Date();
    const result: ExecutionResult = {
      success: false,
      exitCode: 1,
      stdout: "",
      stderr: `Persona '${persona.name}' does not support ${mode} mode`,
      duration: endedAt.getTime() - startedAt.getTime(),
      runId: context.RUN_ID,
      startedAt,
      endedAt,
      error: `Persona does not support ${mode} mode`,
    };
    await finalizeSession(session, {
      success: result.success,
      exitCode: result.exitCode,
      duration: result.duration,
      error: result.error,
      stderr: result.stderr,
    });
    return result;
  }

  // Try each command
  let lastError: Error | null = null;
  let result: ExecutionResult | null = null;

  for (const cmd of cmds) {
    try {
      const expandedCmd = expandVariables(
        cmd,
        context as Record<string, string>,
        env
      );
      const [command, ...args] = expandedCmd.split(/\s+/);

      // Execute with appropriate stdio based on verbose mode
      const execResult = verbose
        ? await execa(command, args, {
            input: prompt,
            cwd: config.agentsDir,
            env,
            timeout: timeoutMs,
            reject: false,
            stdout: "inherit",
            stderr: "inherit",
          })
        : await execa(command, args, {
            input: prompt,
            cwd: config.agentsDir,
            env,
            timeout: timeoutMs,
            reject: false,
          });

      const endedAt = new Date();

      result = {
        success: execResult.exitCode === 0,
        exitCode: execResult.exitCode ?? 1,
        stdout: verbose ? "" : (execResult.stdout as string) || "",
        stderr: verbose ? "" : (execResult.stderr as string) || "",
        duration: endedAt.getTime() - startedAt.getTime(),
        runId: context.RUN_ID,
        startedAt,
        endedAt,
      };

      if (result.success) break;

      const stderrStr = verbose ? "" : (execResult.stderr as string) || "";
      lastError = new Error(
        `Command failed with exit code ${result.exitCode}${stderrStr ? `: ${stderrStr}` : ""}`
      );
    } catch (error) {
      lastError = error as Error;
    }
  }

  if (!result) {
    const endedAt = new Date();
    result = {
      success: false,
      exitCode: 1,
      stdout: "",
      stderr: lastError?.message ?? "All commands failed",
      duration: endedAt.getTime() - startedAt.getTime(),
      runId: context.RUN_ID,
      startedAt,
      endedAt,
      error: lastError?.message,
    };
  }

  // Finalize session
  await finalizeSession(session, {
    success: result.success,
    exitCode: result.exitCode,
    duration: result.duration,
    error: result.error,
    stdout: result.stdout,
    stderr: result.stderr,
  });

  return result;
}

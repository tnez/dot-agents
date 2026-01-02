import { execa } from "execa";
import { join } from "node:path";
import { hostname } from "node:os";
import {
  type Workflow,
  type ResolvedPersona,
  type ExecutionResult,
  type DotAgentsConfig,
  type ResolvedCommands,
  resolvePersona,
  createExecutionContext,
  processTemplate,
  expandVariables,
  getInputDefaults,
  createSession,
  finalizeSession,
  invokePersona as invokePersonaLib,
  type Session,
} from "../../lib/index.js";

/**
 * Parse duration string to milliseconds
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(s|m|h)$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const [, value, unit] = match;
  const num = parseInt(value, 10);

  switch (unit) {
    case "s":
      return num * 1000;
    case "m":
      return num * 60 * 1000;
    case "h":
      return num * 60 * 60 * 1000;
    default:
      throw new Error(`Unknown duration unit: ${unit}`);
  }
}

/**
 * Build the full prompt for the agent
 */
function buildPrompt(
  workflow: Workflow,
  persona: ResolvedPersona,
  context: Record<string, string>,
  inputs: Record<string, unknown>
): string {
  const parts: string[] = [];

  if (persona.prompt) {
    const expandedPrompt = processTemplate(
      persona.prompt,
      { ...context, ...inputs },
      persona.env
    );
    parts.push(expandedPrompt);
    parts.push("\n---\n");
  }

  const expandedTask = processTemplate(
    workflow.task,
    { ...context, ...inputs },
    { ...persona.env, ...workflow.env }
  );
  parts.push(expandedTask);

  return parts.join("\n");
}

/**
 * Options for workflow execution
 */
export interface ExecutionOptions {
  /** Input overrides */
  inputs?: Record<string, unknown>;
  /** Run in interactive mode (requires persona to support it) */
  interactive?: boolean;
}

/**
 * Options for direct persona invocation
 */
export interface InvokeOptions {
  /** Optional context to include in the prompt */
  context?: Record<string, string>;
  /** Source of the invocation (e.g., DM channel name) */
  source?: string;
}

/**
 * Executor for running workflows
 */
export class Executor {
  constructor(private config: DotAgentsConfig) {}

  /**
   * Execute a workflow
   */
  async run(
    workflow: Workflow,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const { inputs: inputOverrides, interactive = false } = options;
    const startedAt = new Date();

    // Resolve persona
    const persona = await resolvePersona(
      join(this.config.personasDir, workflow.persona),
      this.config.personasDir
    );

    // Determine working directory early (needed for session creation)
    let workingDir = workflow.working_dir ?? process.cwd();

    // Create session
    const session = await createSession({
      sessionsDir: this.config.sessionsDir,
      runtime: {
        hostname: hostname(),
        executionMode: interactive ? "interactive" : "headless",
        triggerType: "cron",
        workingDir,
      },
      goal: `Run workflow: ${workflow.name}`,
      persona: {
        name: persona.name,
        inheritanceChain: persona.inheritanceChain,
      },
      workflow: {
        name: workflow.name,
        path: workflow.path,
        inputs: inputOverrides,
      },
    });

    const context = createExecutionContext({
      WORKFLOW_NAME: workflow.name,
      WORKFLOW_DIR: workflow.path,
      PERSONA_NAME: persona.name,
      PERSONA_DIR: persona.path,
      AGENTS_DIR: this.config.agentsDir,
      SESSION_DIR: session.path,
    });

    // Merge inputs
    const inputs: Record<string, unknown> = {
      ...getInputDefaults(workflow),
      ...inputOverrides,
    };

    // Merge environment
    const env: Record<string, string> = {
      ...process.env,
      ...persona.env,
      ...workflow.env,
      DOT_AGENTS_PERSONA: persona.name,
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

    // Expand working directory variables
    workingDir = expandVariables(
      workingDir,
      { ...context, ...(inputs as Record<string, string>) },
      env
    );

    // Build prompt
    const prompt = buildPrompt(
      workflow,
      persona,
      context as Record<string, string>,
      inputs
    );

    // Timeout
    const timeoutMs = workflow.timeout
      ? parseDuration(workflow.timeout)
      : 10 * 60 * 1000;

    // Select commands based on execution mode
    const cmds = interactive
      ? persona.commands.interactive
      : persona.commands.headless;

    if (!cmds) {
      const endedAt = new Date();
      const result: ExecutionResult = {
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: `Persona '${persona.name}' does not support ${interactive ? "interactive" : "headless"} mode`,
        duration: endedAt.getTime() - startedAt.getTime(),
        runId: context.RUN_ID,
        startedAt,
        endedAt,
        error: `Unsupported execution mode: ${interactive ? "interactive" : "headless"}`,
      };
      // Finalize session for error
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

        const execResult = await execa(command, args, {
          input: prompt,
          cwd: workingDir,
          env,
          timeout: timeoutMs,
          reject: false,
        });

        const endedAt = new Date();

        result = {
          success: execResult.exitCode === 0,
          exitCode: execResult.exitCode ?? 1,
          stdout: execResult.stdout,
          stderr: execResult.stderr,
          duration: endedAt.getTime() - startedAt.getTime(),
          runId: context.RUN_ID,
          startedAt,
          endedAt,
        };

        if (result.success) break;

        lastError = new Error(
          `Command failed with exit code ${result.exitCode}: ${execResult.stderr}`
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

  /**
   * Invoke a persona directly with a message (no workflow required)
   * Used for DM-triggered invocations
   */
  async invokePersona(
    personaName: string,
    message: string,
    options: InvokeOptions = {}
  ): Promise<ExecutionResult> {
    return invokePersonaLib(this.config, personaName, message, {
      source: options.source ?? "dm",
      context: options.context,
    });
  }
}

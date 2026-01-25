import { Command } from "commander";
import chalk from "chalk";
import { execa } from "execa";
import { relative } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";
import {
  requireConfig,
  listPersonas,
  loadPersona,
  resolvePersona,
  expandVariables,
  createExecutionContext,
  // Legacy session support (for --session-id backwards compatibility)
  readSession,
  type Session,
  // New session-as-thread support
  startSession,
  endSession,
  type SessionThread,
  // Environment discovery
  getEnvironmentContextMarkdown,
} from "../../lib/index.js";
import type { McpConfig } from "../../lib/types/persona.js";

export const personasCommand = new Command("personas")
  .description("Manage and run personas")
  .action(() => {
    personasCommand.help();
  });

personasCommand
  .command("list")
  .description("List available personas")
  .option("-v, --verbose", "Show detailed information")
  .action(async (options) => {
    try {
      const config = await requireConfig();

      // Check for root persona (.agents/PERSONA.md)
      const { loadRootPersona } = await import("../../lib/persona.js");
      const rootPersona = await loadRootPersona(config.agentsDir);

      const personaPaths = await listPersonas(config.personasDir);
      const totalCount = personaPaths.length + (rootPersona ? 1 : 0);

      if (totalCount === 0) {
        console.log(chalk.yellow("No personas found"));
        return;
      }

      console.log(chalk.blue(`Personas (${totalCount}):\n`));

      // Show root persona first if it exists
      if (rootPersona) {
        console.log(chalk.green(`  root (default)`));
        if (rootPersona.description) {
          console.log(chalk.dim(`    ${rootPersona.description}`));
        }
        if (options.verbose) {
          const cmd = Array.isArray(rootPersona.cmd)
            ? rootPersona.cmd[0]
            : typeof rootPersona.cmd === "object" && rootPersona.cmd !== null
              ? rootPersona.cmd.interactive?.[0] || rootPersona.cmd.headless?.[0]
              : rootPersona.cmd;
          if (cmd) {
            console.log(chalk.dim(`    Command: ${cmd}`));
          }
        }
        console.log();
      }

      for (const personaPath of personaPaths) {
        try {
          const persona = await loadPersona(personaPath);
          const relPath = relative(config.personasDir, personaPath);

          // Skip _project if root persona came from there (avoid duplicate)
          if (relPath === "_project" && rootPersona?.path === personaPath) {
            continue;
          }

          console.log(chalk.white(`  ${relPath}`));
          if (persona.description) {
            console.log(chalk.dim(`    ${persona.description}`));
          }

          if (options.verbose) {
            const cmd = Array.isArray(persona.cmd)
              ? persona.cmd[0]
              : typeof persona.cmd === "object" && persona.cmd !== null
                ? persona.cmd.interactive?.[0] || persona.cmd.headless?.[0]
                : persona.cmd;
            if (cmd) {
              console.log(chalk.dim(`    Command: ${cmd}`));
            }

            if (persona.skills && persona.skills.length > 0) {
              console.log(chalk.dim(`    Skills: ${persona.skills.join(", ")}`));
            }

            if (persona.env && Object.keys(persona.env).length > 0) {
              console.log(
                chalk.dim(`    Env: ${Object.keys(persona.env).join(", ")}`)
              );
            }
          }

          console.log();
        } catch (error) {
          console.log(chalk.red(`  ${personaPath} (invalid)`));
          if (options.verbose) {
            console.log(chalk.red(`    Error: ${(error as Error).message}`));
          }
          console.log();
        }
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

personasCommand
  .command("run")
  .description("Run a persona directly (defaults to root persona if no name given)")
  .argument("[name]", "Persona name/path (e.g., developer, claude/autonomous). Defaults to 'root'")
  .option("-p, --prompt <text>", "Prompt to pass to the persona")
  .option("--interactive", "Run in interactive mode (default)")
  .option("--headless", "Run in headless/print mode")
  .option("-w, --working-dir <path>", "Working directory")
  .option("-s, --session-id <id>", "Resume an existing session")
  .option("--upstream <address>", "Upstream return address (e.g., @odin:dottie --session-id abc)")
  .option("-v, --verbose", "Verbose output")
  .action(async (name, options) => {
    const startedAt = new Date();

    try {
      const config = await requireConfig();

      // Resolve persona path
      let personaPath: string;
      if (!name || name === "root") {
        // No name or "root" - use root persona (.agents/PERSONA.md)
        personaPath = config.agentsDir;
      } else if (name.startsWith("/")) {
        personaPath = name;
      } else {
        personaPath = `${config.personasDir}/${name}`;
      }

      if (options.verbose) {
        console.log(chalk.dim(`Resolving persona: ${personaPath}`));
      }

      // Resolve persona with inheritance
      const persona = await resolvePersona(personaPath, config.personasDir);

      if (options.verbose) {
        console.log(chalk.dim(`Found persona: ${persona.name}`));
        console.log(
          chalk.dim(`Inheritance chain: ${persona.inheritanceChain.join(" → ")}`)
        );
      }

      // Determine execution mode
      let interactive = true; // Default to interactive
      if (options.interactive && options.headless) {
        console.error(chalk.red("Cannot specify both --interactive and --headless"));
        process.exit(1);
      } else if (options.headless) {
        interactive = false;
      } else if (options.interactive) {
        interactive = true;
      }

      // Validate mode support
      if (interactive && !persona.commands.interactive) {
        console.error(chalk.red(`Persona '${persona.name}' does not support interactive mode`));
        process.exit(1);
      }
      if (!interactive && !persona.commands.headless) {
        console.error(chalk.red(`Persona '${persona.name}' does not support headless mode`));
        process.exit(1);
      }

      // Select command
      const cmds = interactive
        ? persona.commands.interactive
        : persona.commands.headless;

      if (!cmds || cmds.length === 0) {
        console.error(chalk.red(`No commands configured for ${interactive ? "interactive" : "headless"} mode`));
        process.exit(1);
      }

      // Determine working directory
      const workingDir = options.workingDir ?? process.cwd();

      // Handle session: resume legacy session or create new thread-based session
      let legacySession: Session | null = null;
      let sessionThread: SessionThread | null = null;
      let sessionId: string;
      let workspacePath: string;

      if (options.sessionId) {
        // Try to resume existing legacy session (backwards compatibility)
        legacySession = await readSession(config.sessionsDir, options.sessionId);
        if (!legacySession) {
          // TODO: In future, also check #sessions channel for thread-based sessions
          console.error(chalk.red(`Session not found: ${options.sessionId}`));
          process.exit(1);
        }
        sessionId = legacySession.id;
        workspacePath = legacySession.path;
        if (options.verbose) {
          console.log(chalk.dim(`Resuming legacy session: ${sessionId}`));
        }
      } else {
        // Create new thread-based session
        sessionThread = await startSession({
          channelsDir: config.channelsDir,
          persona: persona.name,
          mode: interactive ? "interactive" : "headless",
          trigger: "manual",
          goal: options.prompt ? `${options.prompt.substring(0, 100)}...` : undefined,
          upstream: options.upstream,
        });
        sessionId = sessionThread.id;
        workspacePath = sessionThread.workspacePath;
        if (options.verbose) {
          console.log(chalk.dim(`Created session thread: ${sessionId}`));
        }
      }

      // Build FROM_ADDRESS for callback routing
      // Format: #sessions:session-id
      const fromAddress = `#sessions:${sessionId}`;

      // Create execution context with session
      const context = createExecutionContext({
        PERSONA_NAME: persona.name,
        PERSONA_DIR: persona.path,
        SESSION_ID: sessionId,
        SESSION_THREAD_ID: sessionId, // Alias for clarity
        SESSION_WORKSPACE: workspacePath,
        FROM_ADDRESS: fromAddress,
      });

      // Build environment
      // Note: We set both prefixed (DOT_AGENTS_*) and unprefixed versions
      // The unprefixed versions match what _base persona documents ($SESSION_ID, etc.)
      const env: Record<string, string> = {
        ...process.env,
        ...persona.env,
        DOT_AGENTS_PERSONA: persona.path,
        DOT_AGENTS_SESSION_ID: sessionId,
        DOT_AGENTS_SESSION_THREAD_ID: sessionId,
        DOT_AGENTS_SESSION_WORKSPACE: workspacePath,
        // Unprefixed versions for persona use (matches _base documentation)
        SESSION_ID: sessionId,
        SESSION_THREAD_ID: sessionId,
        SESSION_WORKSPACE: workspacePath,
        FROM_ADDRESS: fromAddress,
      } as Record<string, string>;

      // Expand environment variable values
      for (const [key, value] of Object.entries(env)) {
        if (value) {
          env[key] = expandVariables(value, context as Record<string, string>, env);
        }
      }

      // Write MCP config to temp file if present
      let mcpConfigPath: string | undefined;
      if (persona.mcpConfig) {
        const mcpDir = join(tmpdir(), "dot-agents-mcp");
        await mkdir(mcpDir, { recursive: true });
        mcpConfigPath = join(mcpDir, `${persona.name}-${Date.now()}.json`);
        await writeFile(mcpConfigPath, JSON.stringify(persona.mcpConfig, null, 2));

        if (options.verbose) {
          console.log(chalk.dim(`MCP config: ${mcpConfigPath}`));
        }
      }

      // Write hooks config to temp settings file if present (Claude-specific)
      // Claude Code reads hooks from settings.local.json in the project .claude directory
      let hooksConfigPath: string | undefined;
      if (persona.hooksConfig) {
        const hooksDir = join(tmpdir(), "dot-agents-hooks");
        await mkdir(hooksDir, { recursive: true });
        hooksConfigPath = join(hooksDir, `${persona.name}-${Date.now()}.json`);
        const settingsContent = { hooks: persona.hooksConfig };
        await writeFile(hooksConfigPath, JSON.stringify(settingsContent, null, 2));

        if (options.verbose) {
          console.log(chalk.dim(`Hooks config: ${hooksConfigPath}`));
        }
      }

      // Build the full prompt (system prompt + environment + session context + user prompt)
      const promptParts: string[] = [];
      if (persona.prompt) {
        promptParts.push(persona.prompt);
      }

      // Inject environment discovery context
      const environmentContext = await getEnvironmentContextMarkdown(config);
      if (promptParts.length > 0) {
        promptParts.push("\n---\n");
      }
      promptParts.push(environmentContext);

      // Include session context when resuming legacy session
      if (legacySession?.content) {
        if (promptParts.length > 0) {
          promptParts.push("\n---\n");
        }
        promptParts.push("# Previous Session Context\n");
        promptParts.push("You are resuming a previous session. Here is the context from that session:\n");
        promptParts.push(legacySession.content);
      }

      if (options.prompt) {
        if (promptParts.length > 0) {
          promptParts.push("\n---\n");
        }
        promptParts.push(options.prompt);
      }
      const fullPrompt = promptParts.join("\n");

      if (options.verbose) {
        console.log(chalk.dim(`Execution mode: ${interactive ? "interactive" : "headless"}`));
        console.log(chalk.dim(`Working dir: ${workingDir}`));
        console.log(chalk.dim(`Command: ${cmds[0]}`));
        if (persona.prompt) {
          console.log(chalk.dim(`System prompt: ${persona.prompt.substring(0, 100)}...`));
        }
      }

      // Try each command in order
      let lastError: Error | null = null;
      let success = false;
      let stdout = "";
      let stderr = "";
      let exitCode = 1;

      for (const cmd of cmds) {
        try {
          const expandedCmd = expandVariables(cmd, context as Record<string, string>, env);
          let [command, ...args] = expandedCmd.split(/\s+/);

          // Inject MCP config if present (Claude-specific for now)
          if (mcpConfigPath && command === "claude") {
            args = ["--mcp-config", mcpConfigPath, ...args];
          }

          // Inject hooks config if present (Claude-specific for now)
          if (hooksConfigPath && command === "claude") {
            args = ["--settings", hooksConfigPath, ...args];
          }

          if (options.verbose) {
            console.log(chalk.dim(`Executing: ${command} ${args.join(" ")}`));
          }

          if (interactive) {
            // Interactive mode: pass full prompt as CLI argument, inherit stdio
            // Show session info before starting
            console.log(chalk.dim(`Session: ${sessionId}`));
            console.log(chalk.dim(`Workspace: ${workspacePath}`));
            console.log();

            const execArgs = fullPrompt ? [...args, fullPrompt] : args;

            const result = await execa(command, execArgs, {
              cwd: workingDir,
              env,
              stdio: "inherit",
              reject: false,
            });

            exitCode = result.exitCode ?? 1;
            if (exitCode === 0) {
              success = true;
              break;
            }

            lastError = new Error(`Command exited with code ${exitCode}`);
          } else {
            // Headless mode: pass full prompt via stdin
            if (fullPrompt) {
              const result = await execa(command, args, {
                input: fullPrompt,
                cwd: workingDir,
                env,
                reject: false,
              });

              stdout = result.stdout ?? "";
              stderr = result.stderr ?? "";
              exitCode = result.exitCode ?? 1;

              if (stdout) {
                console.log(stdout);
              }

              if (exitCode === 0) {
                success = true;
                break;
              }

              if (stderr) {
                console.error(stderr);
              }

              lastError = new Error(`Command exited with code ${exitCode}`);
            } else {
              console.error(chalk.red("Headless mode requires --prompt or a persona with a system prompt"));
              process.exit(1);
            }
          }
        } catch (error) {
          lastError = error as Error;
        }
      }

      const endedAt = new Date();
      const duration = endedAt.getTime() - startedAt.getTime();

      // Finalize session for headless mode (interactive sessions are managed by the user/persona)
      if (!interactive && sessionThread) {
        await endSession(sessionThread, {
          success,
          exitCode,
          duration,
          error: lastError?.message,
        });
      }

      if (!success) {
        console.error(chalk.red(`Failed to run persona: ${lastError?.message ?? "unknown error"}`));
        process.exit(exitCode);
      }

      // Show session info after interactive session ends
      if (interactive) {
        console.log();
        console.log(chalk.dim(`Session ended: ${sessionId}`));
        console.log(chalk.dim(`Thread: #sessions/${sessionId}`));
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

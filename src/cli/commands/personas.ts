import { Command } from "commander";
import chalk from "chalk";
import { execa } from "execa";
import { relative } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  requireConfig,
  listPersonas,
  loadPersona,
  resolvePersona,
  expandVariables,
  createExecutionContext,
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
      const personaPaths = await listPersonas(config.personasDir);

      if (personaPaths.length === 0) {
        console.log(chalk.yellow("No personas found"));
        return;
      }

      console.log(chalk.blue(`Personas (${personaPaths.length}):\n`));

      for (const personaPath of personaPaths) {
        try {
          const persona = await loadPersona(personaPath);
          const relPath = relative(config.personasDir, personaPath);

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
  .description("Run a persona directly")
  .argument("<name>", "Persona name/path (e.g., developer, claude/autonomous)")
  .option("-p, --prompt <text>", "Prompt to pass to the persona")
  .option("--interactive", "Run in interactive mode (default)")
  .option("--headless", "Run in headless/print mode")
  .option("-w, --working-dir <path>", "Working directory")
  .option("-v, --verbose", "Verbose output")
  .action(async (name, options) => {
    try {
      const config = await requireConfig();

      // Resolve persona path
      const personaPath = name.startsWith("/")
        ? name
        : `${config.personasDir}/${name}`;

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

      // Create execution context
      const context = createExecutionContext({
        PERSONA_NAME: persona.name,
        PERSONA_DIR: persona.path,
      });

      // Build environment
      const env: Record<string, string> = {
        ...process.env,
        ...persona.env,
        DOT_AGENTS_PERSONA: persona.path,
      } as Record<string, string>;

      // Expand environment variable values
      for (const [key, value] of Object.entries(env)) {
        if (value) {
          env[key] = expandVariables(value, context as Record<string, string>, env);
        }
      }

      // Determine working directory
      const workingDir = options.workingDir ?? process.cwd();

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

      if (options.verbose) {
        console.log(chalk.dim(`Execution mode: ${interactive ? "interactive" : "headless"}`));
        console.log(chalk.dim(`Working dir: ${workingDir}`));
        console.log(chalk.dim(`Command: ${cmds[0]}`));
      }

      // Try each command in order
      let lastError: Error | null = null;
      let success = false;

      for (const cmd of cmds) {
        try {
          const expandedCmd = expandVariables(cmd, context as Record<string, string>, env);
          let [command, ...args] = expandedCmd.split(/\s+/);

          // Inject MCP config if present (Claude-specific for now)
          if (mcpConfigPath && command === "claude") {
            args = ["--mcp-config", mcpConfigPath, ...args];
          }

          if (options.verbose) {
            console.log(chalk.dim(`Executing: ${command} ${args.join(" ")}`));
          }

          if (interactive) {
            // Interactive mode: inherit stdio for terminal interaction
            const execArgs = options.prompt ? [...args, options.prompt] : args;

            const result = await execa(command, execArgs, {
              cwd: workingDir,
              env,
              stdio: "inherit",
              reject: false,
            });

            if (result.exitCode === 0) {
              success = true;
              break;
            }

            lastError = new Error(`Command exited with code ${result.exitCode}`);
          } else {
            // Headless mode: pass prompt via stdin or argument
            if (options.prompt) {
              const result = await execa(command, args, {
                input: options.prompt,
                cwd: workingDir,
                env,
                reject: false,
              });

              if (result.stdout) {
                console.log(result.stdout);
              }

              if (result.exitCode === 0) {
                success = true;
                break;
              }

              if (result.stderr) {
                console.error(result.stderr);
              }

              lastError = new Error(`Command exited with code ${result.exitCode}`);
            } else {
              console.error(chalk.red("Headless mode requires --prompt"));
              process.exit(1);
            }
          }
        } catch (error) {
          lastError = error as Error;
        }
      }

      if (!success) {
        console.error(chalk.red(`Failed to run persona: ${lastError?.message ?? "unknown error"}`));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

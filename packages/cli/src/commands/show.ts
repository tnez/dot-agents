import { Command } from "commander";
import chalk from "chalk";
import {
  requireConfig,
  findWorkflow,
  resolvePersona,
  createExecutionContext,
  getInputDefaults,
} from "@dot-agents/core";
import { buildPrompt } from "../lib/runner.js";

export const showCommand = new Command("show")
  .description("Show resolved workflow or persona details");

showCommand
  .command("workflow")
  .alias("w")
  .description("Show workflow details")
  .argument("<name>", "Workflow name")
  .option("--prompt", "Show the full resolved prompt")
  .action(async (name, options) => {
    try {
      const config = await requireConfig();
      const workflow = await findWorkflow(name, config.workflowsDir);

      if (!workflow) {
        console.error(chalk.red(`Workflow not found: ${name}`));
        process.exit(1);
      }

      console.log(chalk.blue(`Workflow: ${workflow.name}\n`));
      console.log(chalk.white("Description:"), workflow.description);
      console.log(chalk.white("Path:"), workflow.path);
      console.log(chalk.white("Persona:"), workflow.persona);

      if (workflow.timeout) {
        console.log(chalk.white("Timeout:"), workflow.timeout);
      }

      if (workflow.working_dir) {
        console.log(chalk.white("Working Dir:"), workflow.working_dir);
      }

      if (workflow.on) {
        console.log(chalk.white("\nTriggers:"));
        if (workflow.on.schedule) {
          for (const schedule of workflow.on.schedule) {
            console.log(chalk.dim(`  - schedule: ${schedule.cron}`));
          }
        }
        if (workflow.on.manual) {
          console.log(chalk.dim(`  - manual: enabled`));
        }
        if (workflow.on.file_change) {
          console.log(
            chalk.dim(`  - file_change: ${workflow.on.file_change.paths.join(", ")}`)
          );
        }
      }

      if (workflow.inputs && workflow.inputs.length > 0) {
        console.log(chalk.white("\nInputs:"));
        for (const input of workflow.inputs) {
          const required = input.required ? " (required)" : "";
          const defaultVal =
            input.default !== undefined ? ` [default: ${input.default}]` : "";
          console.log(chalk.dim(`  - ${input.name}${required}${defaultVal}`));
          if (input.description) {
            console.log(chalk.dim(`    ${input.description}`));
          }
        }
      }

      if (workflow.outputs && workflow.outputs.length > 0) {
        console.log(chalk.white("\nOutputs:"));
        for (const output of workflow.outputs) {
          console.log(chalk.dim(`  - ${output.path}`));
        }
      }

      if (options.prompt) {
        const persona = await resolvePersona(
          `${config.personasDir}/${workflow.persona}`,
          config.personasDir
        );

        const context = createExecutionContext({
          WORKFLOW_NAME: workflow.name,
          WORKFLOW_DIR: workflow.path,
          PERSONA_NAME: persona.name,
          PERSONA_DIR: persona.path,
        });

        const inputs = getInputDefaults(workflow);
        const prompt = buildPrompt(workflow, persona, context, inputs);

        console.log(chalk.white("\n--- Resolved Prompt ---\n"));
        console.log(prompt);
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

showCommand
  .command("persona")
  .alias("p")
  .description("Show persona details (with inheritance resolved)")
  .argument("<name>", "Persona path (e.g., claude/autonomous)")
  .action(async (name) => {
    try {
      const config = await requireConfig();
      const persona = await resolvePersona(
        `${config.personasDir}/${name}`,
        config.personasDir
      );

      console.log(chalk.blue(`Persona: ${persona.name}\n`));

      if (persona.description) {
        console.log(chalk.white("Description:"), persona.description);
      }

      console.log(chalk.white("Path:"), persona.path);
      console.log(
        chalk.white("Inheritance:"),
        persona.inheritanceChain.join(" → ")
      );

      console.log(chalk.white("\nCommands:"));
      for (const cmd of persona.cmd) {
        console.log(chalk.dim(`  - ${cmd}`));
      }

      if (Object.keys(persona.env).length > 0) {
        console.log(chalk.white("\nEnvironment:"));
        for (const [key, value] of Object.entries(persona.env)) {
          console.log(chalk.dim(`  ${key}=${value}`));
        }
      }

      if (persona.skills.length > 0) {
        console.log(chalk.white("\nSkills:"));
        for (const skill of persona.skills) {
          console.log(chalk.dim(`  - ${skill}`));
        }
      }

      if (persona.prompt) {
        console.log(chalk.white("\n--- System Prompt ---\n"));
        console.log(persona.prompt);
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

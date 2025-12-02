#!/usr/bin/env node

import { Command } from "commander";
import { runCommand, listCommand, showCommand, scheduleCommand, daemonCommand } from "./commands/index.js";

const program = new Command();

program
  .name("dot-agents")
  .description("Run and manage agentic workflows")
  .version("0.1.0")
  .action(() => {
    program.help();
  });

program.addCommand(runCommand);
program.addCommand(listCommand);
program.addCommand(showCommand);
program.addCommand(scheduleCommand);
program.addCommand(daemonCommand);

// Alias 'workflows' to 'list workflows'
program
  .command("workflows")
  .description("List all workflows (alias for 'list workflows')")
  .option("-v, --verbose", "Show detailed information")
  .action(async (options) => {
    await listCommand.parseAsync(["workflows", ...(options.verbose ? ["-v"] : [])], {
      from: "user",
    });
  });

// Alias 'personas' to 'list personas'
program
  .command("personas")
  .description("List all personas (alias for 'list personas')")
  .option("-v, --verbose", "Show detailed information")
  .action(async (options) => {
    await listCommand.parseAsync(["personas", ...(options.verbose ? ["-v"] : [])], {
      from: "user",
    });
  });

program.parse();

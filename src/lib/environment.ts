import { join, relative } from "node:path";
import { listPersonas, loadPersona, loadRootPersona } from "./persona.js";
import { listWorkflows, loadWorkflow } from "./workflow.js";
import { listChannels } from "./channel.js";
import { getProjectNameByPath, listProjects } from "./registry.js";
import { getDaemonStatus } from "./daemon-status.js";
import type { DotAgentsConfig } from "./types/index.js";

/**
 * Threshold for switching from full display to names-only
 */
const NAMES_ONLY_THRESHOLD = 10;

/**
 * Threshold for truncating list with "Run X for full list" message
 */
const TRUNCATE_THRESHOLD = 25;

/**
 * Persona info for environment context
 */
interface PersonaInfo {
  name: string;
  description?: string;
}

/**
 * Workflow info for environment context
 */
interface WorkflowInfo {
  name: string;
  description?: string;
}

/**
 * Channel info for environment context
 */
interface ChannelInfo {
  name: string;
}

/**
 * Registered project info for environment context
 */
interface RegisteredProjectInfo {
  name: string;
  path: string;
  daemonRunning: boolean;
  daemonPid?: number;
}

/**
 * Environment context data
 */
export interface EnvironmentContext {
  currentTime: Date;
  projectName: string | null;
  daemonRunning: boolean;
  daemonPid?: number;
  registeredProjects: RegisteredProjectInfo[];
  personas: PersonaInfo[];
  workflows: WorkflowInfo[];
  channels: ChannelInfo[];
}

/**
 * Build environment context by discovering project resources.
 *
 * This function:
 * 1. Gets current project info from registry
 * 2. Lists all registered projects with daemon status
 * 3. Lists personas (name + description)
 * 4. Lists workflows (name + description)
 * 5. Lists channels
 */
export async function buildEnvironmentContext(
  config: DotAgentsConfig
): Promise<EnvironmentContext> {
  // Get project name from registry
  const projectName = await getProjectNameByPath(config.agentsDir);

  // Get daemon status for current project
  const daemonStatus = await getDaemonStatus(config.agentsDir);

  // Get all registered projects with daemon status
  const allProjects = await listProjects();
  const registeredProjects: RegisteredProjectInfo[] = await Promise.all(
    allProjects.map(async (project) => {
      const projectDaemonStatus = await getDaemonStatus(project.path);
      return {
        name: project.name,
        path: project.path,
        daemonRunning: projectDaemonStatus.running,
        daemonPid: projectDaemonStatus.pid,
      };
    })
  );

  // List personas
  const personaPaths = await listPersonas(config.personasDir);
  const personas: PersonaInfo[] = [];

  // Check for root persona
  const rootPersona = await loadRootPersona(config.agentsDir);
  if (rootPersona) {
    personas.push({
      name: "root",
      description: rootPersona.description,
    });
  }

  for (const personaPath of personaPaths) {
    try {
      const persona = await loadPersona(personaPath);
      // Skip _project if root persona came from there (avoid duplicate)
      const relPath = relative(config.personasDir, personaPath);
      if (relPath === "_project" && rootPersona?.path === personaPath) {
        continue;
      }
      personas.push({
        name: relPath,
        description: persona.description,
      });
    } catch {
      // Skip invalid personas
    }
  }

  // List workflows
  const workflowPaths = await listWorkflows(config.workflowsDir);
  const workflows: WorkflowInfo[] = [];

  for (const workflowPath of workflowPaths) {
    try {
      const workflow = await loadWorkflow(workflowPath);
      workflows.push({
        name: workflow.name,
        description: workflow.description,
      });
    } catch {
      // Skip invalid workflows
    }
  }

  // List channels
  const channelList = await listChannels(config.channelsDir);
  const channels: ChannelInfo[] = channelList.map((c) => ({
    name: c.name,
  }));

  return {
    currentTime: new Date(),
    projectName,
    daemonRunning: daemonStatus.running,
    daemonPid: daemonStatus.pid,
    registeredProjects,
    personas,
    workflows,
    channels,
  };
}

/**
 * Format a list of items with length management.
 *
 * | Items | Behavior |
 * |-------|----------|
 * | ≤ 10 | Include full list with descriptions |
 * | 11-25 | Include names only, no descriptions |
 * | > 25 | Truncate + "Run `dot-agents list X` for full list" |
 */
function formatList<T extends { name: string; description?: string }>(
  items: T[],
  itemType: "personas" | "workflows" | "channels"
): string {
  if (items.length === 0) {
    return "(none)";
  }

  const count = items.length;
  const lines: string[] = [];

  if (count <= NAMES_ONLY_THRESHOLD) {
    // Full list with descriptions
    for (const item of items) {
      if (item.description) {
        lines.push(`- ${item.name} - ${item.description}`);
      } else {
        lines.push(`- ${item.name}`);
      }
    }
  } else if (count <= TRUNCATE_THRESHOLD) {
    // Names only, no descriptions
    for (const item of items) {
      lines.push(`- ${item.name}`);
    }
  } else {
    // Truncate and show first 10, then hint
    for (let i = 0; i < 10; i++) {
      lines.push(`- ${items[i].name}`);
    }
    lines.push(`- ... and ${count - 10} more`);
    lines.push(`Run \`npx dot-agents list ${itemType}\` for full list`);
  }

  return lines.join("\n");
}

/**
 * Format environment context as markdown for injection into persona prompt.
 *
 * Example output:
 * ```markdown
 * ## Your Environment
 *
 * **Project:** docs (registered as @docs) ○ daemon stopped
 *
 * **Personas:** (3)
 * - dottie - Executive assistant
 * - researcher - Deep research with web search
 * - handyman - Routine maintenance fixes
 *
 * **Workflows:** (2)
 * - process-inbox - Process inbox files
 * - daily-review - Review daily sessions
 *
 * **Channels:** (4)
 * #sessions, #issues, #journals, @human
 *
 * **Other Registered Projects:** (2)
 * - @dot-agents ○ daemon stopped
 * - @scoutos ● daemon running (pid 12345)
 * ```
 */
export function formatEnvironmentContext(context: EnvironmentContext): string {
  const lines: string[] = [];

  lines.push("## Your Environment");
  lines.push("");

  // Current time with day of week
  const dateOptions: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  };
  const formattedTime = context.currentTime.toLocaleString(undefined, dateOptions);
  lines.push(`**Current Time:** ${formattedTime}`);
  lines.push("");

  // Project info with daemon status
  const daemonIndicator = context.daemonRunning
    ? `● daemon running${context.daemonPid ? ` (pid ${context.daemonPid})` : ""}`
    : "○ daemon stopped";

  if (context.projectName) {
    lines.push(`**Project:** ${context.projectName} (registered as @${context.projectName}) ${daemonIndicator}`);
  } else {
    lines.push(`**Project:** (not registered) ${daemonIndicator}`);
  }
  lines.push("");

  // Personas
  lines.push(`**Personas:** (${context.personas.length})`);
  lines.push(formatList(context.personas, "personas"));
  lines.push("");

  // Workflows
  lines.push(`**Workflows:** (${context.workflows.length})`);
  lines.push(formatList(context.workflows, "workflows"));
  lines.push("");

  // Channels - format inline if short, otherwise as list
  lines.push(`**Channels:** (${context.channels.length})`);
  if (context.channels.length === 0) {
    lines.push("(none)");
  } else if (context.channels.length <= 10) {
    // Inline format for short lists
    lines.push(context.channels.map((c) => c.name).join(", "));
  } else {
    lines.push(formatList(context.channels, "channels"));
  }
  lines.push("");

  // Registered projects (other projects you can communicate with)
  const otherProjects = context.registeredProjects.filter(
    (p) => p.name !== context.projectName
  );
  if (otherProjects.length > 0) {
    lines.push(`**Other Registered Projects:** (${otherProjects.length})`);
    for (const project of otherProjects) {
      const daemonStatus = project.daemonRunning
        ? `● daemon running${project.daemonPid ? ` (pid ${project.daemonPid})` : ""}`
        : "○ daemon stopped";
      lines.push(`- @${project.name} ${daemonStatus}`);
    }
  }

  return lines.join("\n");
}

/**
 * Build and format environment context as markdown.
 * Convenience function that combines buildEnvironmentContext and formatEnvironmentContext.
 */
export async function getEnvironmentContextMarkdown(
  config: DotAgentsConfig
): Promise<string> {
  const context = await buildEnvironmentContext(config);
  return formatEnvironmentContext(context);
}

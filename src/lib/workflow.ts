import { readdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { loadMarkdownFile } from "./frontmatter.js";
import type { Workflow, WorkflowFrontmatter } from "./types/workflow.js";

const WORKFLOW_FILENAME = "WORKFLOW.md";

/**
 * Load a single workflow file
 */
export async function loadWorkflow(workflowPath: string): Promise<Workflow> {
  const filePath = workflowPath.endsWith(WORKFLOW_FILENAME)
    ? workflowPath
    : join(workflowPath, WORKFLOW_FILENAME);

  const { frontmatter, body } =
    await loadMarkdownFile<WorkflowFrontmatter>(filePath);

  if (!frontmatter.name) {
    throw new Error(`Workflow missing required 'name' field: ${filePath}`);
  }

  if (!frontmatter.description) {
    throw new Error(
      `Workflow missing required 'description' field: ${filePath}`
    );
  }

  if (!frontmatter.persona) {
    throw new Error(`Workflow missing required 'persona' field: ${filePath}`);
  }

  if (!body) {
    throw new Error(`Workflow missing task body: ${filePath}`);
  }

  return {
    ...frontmatter,
    path: dirname(filePath),
    task: body,
  };
}

/**
 * Check if a directory contains a WORKFLOW.md file
 */
async function hasWorkflowFile(dirPath: string): Promise<boolean> {
  try {
    const filePath = join(dirPath, WORKFLOW_FILENAME);
    const stats = await stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * List all workflows in a directory (recursive)
 */
export async function listWorkflows(workflowsRoot: string): Promise<string[]> {
  const workflows: string[] = [];

  async function scanDir(dir: string): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subDir = join(dir, entry.name);
          if (await hasWorkflowFile(subDir)) {
            workflows.push(subDir);
          }
          await scanDir(subDir);
        }
      }
    } catch {
      // Directory doesn't exist or not readable
    }
  }

  await scanDir(workflowsRoot);
  return workflows;
}

/**
 * Find a workflow by name
 */
export async function findWorkflow(
  name: string,
  workflowsRoot: string
): Promise<Workflow | null> {
  const workflowPaths = await listWorkflows(workflowsRoot);

  for (const workflowPath of workflowPaths) {
    try {
      const workflow = await loadWorkflow(workflowPath);
      if (workflow.name === name) {
        return workflow;
      }
    } catch {
      // Skip invalid workflows
    }
  }

  return null;
}

/**
 * Get all scheduled workflows
 */
export async function getScheduledWorkflows(
  workflowsRoot: string
): Promise<Workflow[]> {
  const workflowPaths = await listWorkflows(workflowsRoot);
  const scheduled: Workflow[] = [];

  for (const workflowPath of workflowPaths) {
    try {
      const workflow = await loadWorkflow(workflowPath);
      if (workflow.on?.schedule && workflow.on.schedule.length > 0) {
        scheduled.push(workflow);
      }
    } catch {
      // Skip invalid workflows
    }
  }

  return scheduled;
}

/**
 * Validate workflow inputs against definition
 */
export function validateInputs(
  workflow: Workflow,
  inputs: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const inputDef of workflow.inputs ?? []) {
    const value = inputs[inputDef.name];

    // Check required
    if (inputDef.required && value === undefined) {
      errors.push(`Missing required input: ${inputDef.name}`);
      continue;
    }

    // Skip validation for undefined optional inputs
    if (value === undefined) continue;

    // Type validation
    if (inputDef.type) {
      const actualType = typeof value;
      if (inputDef.type === "path") {
        if (actualType !== "string") {
          errors.push(
            `Input '${inputDef.name}' must be a path (string), got ${actualType}`
          );
        }
      } else if (actualType !== inputDef.type) {
        errors.push(
          `Input '${inputDef.name}' must be ${inputDef.type}, got ${actualType}`
        );
      }
    }

    // Enum validation
    if (inputDef.enum && !inputDef.enum.includes(value as string | number)) {
      errors.push(
        `Input '${inputDef.name}' must be one of: ${inputDef.enum.join(", ")}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get default values for workflow inputs
 */
export function getInputDefaults(
  workflow: Workflow
): Record<string, string | number | boolean> {
  const defaults: Record<string, string | number | boolean> = {};

  for (const inputDef of workflow.inputs ?? []) {
    if (inputDef.default !== undefined) {
      defaults[inputDef.name] = inputDef.default;
    }
  }

  return defaults;
}

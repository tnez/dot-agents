import type { ExecutionContext } from "./types/index.js";

/**
 * Generate a unique run ID
 */
export function generateRunId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * Create execution context with built-in variables
 */
export function createExecutionContext(
  overrides: Partial<ExecutionContext> = {}
): ExecutionContext {
  const now = new Date();

  return {
    DATE: now.toISOString().split("T")[0],
    DATETIME: now.toISOString(),
    TIME: now.toTimeString().split(" ")[0],
    RUN_ID: generateRunId(),
    ...overrides,
  };
}

/**
 * Expand environment variables in a string
 * Supports ${VAR} syntax
 */
export function expandVariables(
  template: string,
  context: Record<string, string | undefined>,
  env: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >
): string {
  // Combined context: explicit context takes precedence over env
  const combined = { ...env, ...context };

  return template.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    const value = combined[varName];
    if (value !== undefined) {
      return value;
    }
    // Leave unmatched variables as-is
    return match;
  });
}

/**
 * Expand variables in an object's string values (recursive)
 */
export function expandObjectVariables<T extends Record<string, unknown>>(
  obj: T,
  context: Record<string, string | undefined>,
  env?: Record<string, string | undefined>
): T {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = expandVariables(value, context, env);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === "string"
          ? expandVariables(item, context, env)
          : typeof item === "object" && item !== null
            ? expandObjectVariables(
                item as Record<string, unknown>,
                context,
                env
              )
            : item
      );
    } else if (typeof value === "object" && value !== null) {
      result[key] = expandObjectVariables(
        value as Record<string, unknown>,
        context,
        env
      );
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * Process simple conditionals in a template
 * Supports: {{#if var}}...{{/if}} and {{#unless var}}...{{/unless}}
 */
export function processConditionals(
  template: string,
  context: Record<string, unknown>
): string {
  let result = template;

  // Process {{#if var}}...{{/if}}
  result = result.replace(
    /\{\{#if\s+(\w+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, varName, content) => {
      const value = context[varName];
      // Truthy check: exists and not empty string/false/0
      if (value && value !== "" && value !== false && value !== 0) {
        return content;
      }
      return "";
    }
  );

  // Process {{#unless var}}...{{/unless}}
  result = result.replace(
    /\{\{#unless\s+(\w+)\s*\}\}([\s\S]*?)\{\{\/unless\}\}/g,
    (_, varName, content) => {
      const value = context[varName];
      // Falsy check
      if (!value || value === "" || value === false || value === 0) {
        return content;
      }
      return "";
    }
  );

  // Process {{#if var == "value"}}...{{/if}}
  result = result.replace(
    /\{\{#if\s+(\w+)\s*==\s*"([^"]+)"\s*\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, varName, compareValue, content) => {
      const value = context[varName];
      if (String(value) === compareValue) {
        return content;
      }
      return "";
    }
  );

  return result;
}

/**
 * Full template processing: conditionals then variable expansion
 */
export function processTemplate(
  template: string,
  context: Record<string, unknown>,
  env?: Record<string, string | undefined>
): string {
  // First process conditionals
  let result = processConditionals(template, context);

  // Then expand variables
  const stringContext: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(context)) {
    if (value !== undefined && value !== null) {
      stringContext[key] = String(value);
    }
  }

  result = expandVariables(result, stringContext, env);

  return result;
}

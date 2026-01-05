import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  ValidationResult,
  ValidationIssue,
  createError,
  createWarning,
} from "./types.js";

const PERSONA_FILENAME = "PERSONA.md";

/**
 * Known persona frontmatter fields
 */
const KNOWN_FIELDS = new Set(["name", "description", "cmd", "env", "skills"]);

/**
 * Common legacy/misnamed fields and their correct names
 */
const FIELD_SUGGESTIONS: Record<string, string> = {
  command: "cmd",
  commands: "cmd",
  skill: "skills",
  environment: "env",
  variables: "env",
  model: "env.CLAUDE_MODEL or similar",
};

/**
 * Parse frontmatter from markdown content without full validation
 */
function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} | null {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return null;
  }

  const [, yamlContent, body] = match;
  try {
    const frontmatter = parseYaml(yamlContent) as Record<string, unknown>;
    return { frontmatter, body: body.trim() };
  } catch {
    return null;
  }
}

/**
 * Validate a persona file
 *
 * @param personaPath Path to the persona directory or PERSONA.md file
 * @param isRootPersona Whether this is a root persona (requires cmd)
 */
export async function validatePersona(
  personaPath: string,
  isRootPersona: boolean = true
): Promise<ValidationResult> {
  const filePath = personaPath.endsWith(PERSONA_FILENAME)
    ? personaPath
    : join(personaPath, PERSONA_FILENAME);

  const issues: ValidationIssue[] = [];
  let name: string | undefined;

  try {
    const content = await readFile(filePath, "utf-8");
    const parsed = parseFrontmatter(content);

    if (!parsed) {
      issues.push(
        createError(
          "invalid_value",
          "frontmatter",
          "No valid YAML frontmatter found",
          "File must start with --- followed by YAML and another ---"
        )
      );
      return {
        path: filePath,
        valid: false,
        issues,
      };
    }

    const { frontmatter } = parsed;
    name = frontmatter.name as string | undefined;

    // Check required fields
    if (!frontmatter.name) {
      issues.push(
        createError(
          "missing_field",
          "name",
          "Missing required 'name' field",
          "Add: name: my-persona"
        )
      );
    } else if (typeof frontmatter.name !== "string") {
      issues.push(
        createError("invalid_type", "name", "'name' must be a string")
      );
    }

    // cmd is required for root personas, optional for child personas (inherited)
    if (isRootPersona && !frontmatter.cmd) {
      issues.push(
        createError(
          "missing_field",
          "cmd",
          "Missing required 'cmd' field for root persona",
          "Add: cmd: \"claude --print\" or cmd: [\"claude --print\", \"claude -p\"]"
        )
      );
    }

    // Validate cmd type if present
    if (frontmatter.cmd !== undefined) {
      const isString = typeof frontmatter.cmd === "string";
      const isArray = Array.isArray(frontmatter.cmd);
      const isCommandModes =
        typeof frontmatter.cmd === "object" &&
        !isArray &&
        frontmatter.cmd !== null &&
        ("headless" in frontmatter.cmd || "interactive" in frontmatter.cmd);

      if (!isString && !isArray && !isCommandModes) {
        issues.push(
          createError(
            "invalid_type",
            "cmd",
            "'cmd' must be a string, array, or object with headless/interactive",
            'Use: cmd: "claude --print" or cmd: { headless: "...", interactive: "..." }'
          )
        );
      } else if (isArray) {
        (frontmatter.cmd as unknown[]).forEach((c: unknown, index: number) => {
          if (typeof c !== "string") {
            issues.push(
              createError(
                "invalid_type",
                `cmd[${index}]`,
                "Command must be a string"
              )
            );
          }
        });
      } else if (isCommandModes) {
        // Validate CommandModes object format
        const cmd = frontmatter.cmd as Record<string, unknown>;
        const validKeys = ["headless", "interactive"];
        const cmdKeys = Object.keys(cmd);

        // Check for unknown keys
        for (const key of cmdKeys) {
          if (!validKeys.includes(key)) {
            issues.push(
              createWarning(
                "unknown_field",
                `cmd.${key}`,
                `Unknown cmd mode '${key}'`,
                "Valid modes: headless, interactive"
              )
            );
          }
        }

        // Must have at least one mode
        if (!cmd.headless && !cmd.interactive) {
          issues.push(
            createError(
              "invalid_value",
              "cmd",
              "cmd must specify at least headless or interactive",
              'Use: cmd: { headless: "...", interactive: "..." }'
            )
          );
        }

        // Validate each mode's value
        for (const mode of validKeys) {
          if (cmd[mode] !== undefined) {
            const modeValue = cmd[mode];
            if (typeof modeValue !== "string" && !Array.isArray(modeValue)) {
              issues.push(
                createError(
                  "invalid_type",
                  `cmd.${mode}`,
                  `'cmd.${mode}' must be a string or array of strings`
                )
              );
            } else if (Array.isArray(modeValue)) {
              modeValue.forEach((c: unknown, index: number) => {
                if (typeof c !== "string") {
                  issues.push(
                    createError(
                      "invalid_type",
                      `cmd.${mode}[${index}]`,
                      "Command must be a string"
                    )
                  );
                }
              });
            }
          }
        }
      }
    }

    // Validate env if present
    if (frontmatter.env !== undefined) {
      if (
        typeof frontmatter.env !== "object" ||
        Array.isArray(frontmatter.env) ||
        frontmatter.env === null
      ) {
        issues.push(
          createError(
            "invalid_type",
            "env",
            "'env' must be an object",
            "Use: env: { CLAUDE_MODEL: 'sonnet' }"
          )
        );
      } else {
        // Check that all env values are strings
        const env = frontmatter.env as Record<string, unknown>;
        for (const [key, value] of Object.entries(env)) {
          if (typeof value !== "string") {
            issues.push(
              createWarning(
                "unknown_field",
                `env.${key}`,
                `Environment variable '${key}' should be a string, got ${typeof value}`,
                "Convert to string or use ${VAR} expansion"
              )
            );
          }
        }
      }
    }

    // Validate skills if present
    if (frontmatter.skills !== undefined) {
      if (!Array.isArray(frontmatter.skills)) {
        issues.push(
          createError(
            "invalid_type",
            "skills",
            "'skills' must be an array of glob patterns",
            "Use: skills: [\"productivity/**\", \"!experimental/*\"]"
          )
        );
      } else {
        frontmatter.skills.forEach((skill: unknown, index: number) => {
          if (typeof skill !== "string") {
            issues.push(
              createError(
                "invalid_type",
                `skills[${index}]`,
                "Skill pattern must be a string"
              )
            );
          }
        });
      }
    }

    // Check for unknown/legacy fields
    for (const key of Object.keys(frontmatter)) {
      if (!KNOWN_FIELDS.has(key)) {
        const suggestion = FIELD_SUGGESTIONS[key];
        if (suggestion) {
          issues.push(
            createWarning(
              "unknown_field",
              key,
              `Unknown field '${key}'`,
              `Did you mean '${suggestion}'?`
            )
          );
        } else {
          issues.push(
            createWarning("unknown_field", key, `Unknown field '${key}'`)
          );
        }
      }
    }
  } catch (error) {
    issues.push(
      createError(
        "invalid_value",
        "file",
        `Failed to read persona: ${(error as Error).message}`
      )
    );
  }

  const hasErrors = issues.some((i) => i.severity === "error");

  return {
    path: dirname(filePath),
    name,
    valid: !hasErrors,
    issues,
  };
}

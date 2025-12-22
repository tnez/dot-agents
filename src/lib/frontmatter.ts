import { readFile } from "node:fs/promises";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Result of parsing a markdown file with YAML frontmatter
 */
export interface ParsedMarkdown<T> {
  /** Parsed YAML frontmatter */
  frontmatter: T;
  /** Markdown body content (after frontmatter) */
  body: string;
}

/**
 * Check if content has YAML frontmatter
 */
export function hasFrontmatter(content: string): boolean {
  return FRONTMATTER_REGEX.test(content);
}

/**
 * Parse YAML frontmatter from a markdown file
 */
export function parseFrontmatter<T>(content: string): ParsedMarkdown<T> {
  const match = content.match(FRONTMATTER_REGEX);

  if (!match) {
    throw new Error("No YAML frontmatter found");
  }

  const [, yamlContent, body] = match;
  const frontmatter = parseYaml(yamlContent) as T;

  return {
    frontmatter,
    body: body.trim(),
  };
}

/**
 * Load and parse a markdown file with YAML frontmatter
 */
export async function loadMarkdownFile<T>(
  filePath: string
): Promise<ParsedMarkdown<T>> {
  const content = await readFile(filePath, "utf-8");
  return parseFrontmatter<T>(content);
}

/**
 * Stringify frontmatter and body back to markdown format
 */
export function stringifyFrontmatter<T>(frontmatter: T, body: string): string {
  const yamlContent = stringifyYaml(frontmatter, { indent: 2 }).trim();
  return `---\n${yamlContent}\n---\n\n${body}`;
}

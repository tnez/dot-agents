import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

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
 * Parse YAML frontmatter from a markdown file
 */
export function parseFrontmatter<T>(content: string): ParsedMarkdown<T> {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

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

import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Package information from package.json
 */
export interface PackageInfo {
  name: string;
  version: string;
}

let cachedInfo: PackageInfo | null = null;

/**
 * Get the path to the package.json
 */
function getPackageJsonPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const libDir = dirname(currentFile);
  // From dist/lib or src/lib -> root
  const packageRoot = dirname(dirname(libDir));
  return join(packageRoot, "package.json");
}

/**
 * Get package information synchronously (for CLI startup)
 * Caches the result after first read
 */
export function getPackageInfoSync(): PackageInfo {
  if (cachedInfo) return cachedInfo;

  const packagePath = getPackageJsonPath();
  const content = readFileSync(packagePath, "utf-8");
  const pkg = JSON.parse(content) as { name: string; version: string };

  cachedInfo = {
    name: pkg.name,
    version: pkg.version,
  };

  return cachedInfo;
}

/**
 * Get package information (name and version)
 * Caches the result after first read
 */
export async function getPackageInfo(): Promise<PackageInfo> {
  if (cachedInfo) return cachedInfo;

  const packagePath = getPackageJsonPath();
  const content = await readFile(packagePath, "utf-8");
  const pkg = JSON.parse(content) as { name: string; version: string };

  cachedInfo = {
    name: pkg.name,
    version: pkg.version,
  };

  return cachedInfo;
}

/**
 * Get the package version synchronously
 */
export function getVersionSync(): string {
  return getPackageInfoSync().version;
}

/**
 * Get the package version
 */
export async function getVersion(): Promise<string> {
  const info = await getPackageInfo();
  return info.version;
}

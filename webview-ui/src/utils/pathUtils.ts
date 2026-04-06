/**
 * Convert an absolute path to a path relative to the given cwd.
 * If the path is outside cwd, returns the original absolute path.
 */
export function toRelativePath(absolutePath: string, cwd: string): string {
  // Normalize both to forward slashes for comparison
  const normPath = absolutePath.replace(/\\/g, '/');
  const normCwd = cwd.replace(/\\/g, '/').replace(/\/$/, '');

  if (normPath.startsWith(normCwd + '/')) {
    return normPath.slice(normCwd.length + 1);
  }

  // External path — return as-is
  return absolutePath;
}

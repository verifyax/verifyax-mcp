import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** True when `entryUrl` is the Node entry script (not a module imported by tests). */
export function isMainModule(entryUrl: string): boolean {
  const invoked = process.argv[1];
  if (!invoked) {
    return false;
  }
  try {
    return entryUrl === pathToFileURL(realpathSync(invoked)).href;
  } catch {
    return false;
  }
}

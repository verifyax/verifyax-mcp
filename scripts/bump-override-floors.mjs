#!/usr/bin/env node
// Raise stale *targeted* pnpm override floors to the patched version.
//
// The repo pins security fixes for transitive deps as targeted, self-healing
// floors in pnpm-workspace.yaml, e.g. `hono@<4.13.11: 4.13.11` ("at least
// 4.13.11"). When a *new* advisory lands whose patched version is above the
// current floor, `pnpm audit --prod` goes red and someone has to hand-raise the
// floor — this has recurred for hono, fast-uri, and ip-address.
//
// This script closes that loop: it reads the live prod audit, and for every
// advisory whose package already has a targeted floor sitting below the patched
// version, it rewrites the floor (selector + value) to the patched version. It
// only touches floors it understands:
//   - Targeted floors it raises automatically (self-healing by design).
//   - Blanket pins and packages with no existing override are left alone and
//     reported, because the right fix there needs a human (e.g. major-scoping a
//     new override, as body-parser needed `>=2.0.0 <2.4.0`).
//
// Usage:  node scripts/bump-override-floors.mjs
// Then:   pnpm install   (to update the lockfile)
// The override-floor-bumps workflow runs both and opens a PR.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE = join(ROOT, 'pnpm-workspace.yaml');

/** Numeric-segment semver compare (prerelease ignored; enough for picking floors). */
function cmpSemver(a, b) {
  const parts = (v) =>
    String(v)
      .split('-')[0]
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  }
  return 0;
}

/** Lowest `>=X` bound in a patched-versions range, or null when there's no fix. */
function minPatched(patchedVersions) {
  if (!patchedVersions || patchedVersions === '<0.0.0') return null;
  const bounds = [
    ...patchedVersions.matchAll(/>=\s*([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.]+)?)/g),
  ].map((m) => m[1]);
  if (bounds.length === 0) return null;
  bounds.sort(cmpSemver);
  return bounds[0];
}

/** Run the prod audit and return { pkgName -> lowestPatchedVersion } for moderate+ advisories. */
function auditPatchedFloors() {
  let raw;
  // Test seam: point BUMP_OVERRIDE_AUDIT_FIXTURE at a saved `pnpm audit --json`
  // payload to exercise the parse/rewrite without a live audit.
  const fixture = process.env.BUMP_OVERRIDE_AUDIT_FIXTURE;
  if (fixture) {
    raw = readFileSync(fixture, 'utf8');
  } else {
    try {
      raw = execFileSync('pnpm', ['audit', '--prod', '--audit-level', 'moderate', '--json'], {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        shell: process.platform === 'win32',
      });
    } catch (err) {
      // pnpm audit exits non-zero when it finds vulnerabilities; the JSON is still on stdout.
      raw = err.stdout?.toString() ?? '';
      if (!raw) throw err;
    }
  }
  const advisories = JSON.parse(raw).advisories ?? {};
  const floors = new Map();
  for (const adv of Object.values(advisories)) {
    const patched = minPatched(adv.patched_versions);
    if (!patched) continue; // no fix available — can't auto-raise
    const existing = floors.get(adv.module_name);
    // Keep the highest required floor across advisories on the same package.
    if (!existing || cmpSemver(patched, existing) > 0) floors.set(adv.module_name, patched);
  }
  return floors;
}

/** Split an overrides key into its package name and version selector. */
function parseKey(key) {
  // A scoped package starts with @, so only a *later* @ introduces a selector.
  const at = key.lastIndexOf('@');
  if (at > 0) return { name: key.slice(0, at), selector: key.slice(at + 1) };
  return { name: key, selector: null };
}

function main() {
  const floors = auditPatchedFloors();
  if (floors.size === 0) {
    console.log('bump-override-floors: prod audit clean — nothing to do.');
    return;
  }

  const original = readFileSync(WORKSPACE, 'utf8');
  const lines = original.split('\n');
  const changes = [];
  const handled = new Set();

  const out = lines.map((line) => {
    // Match an override entry. The key may be quoted (and then contain spaces,
    // e.g. 'pkg@>=1.0.0 <1.2.0') or bare (e.g. nanoid or hono@<3.3.18).
    const m = line.match(/^(\s+)(?:'([^']+)'|([^'\s:]+)):\s*('?)([^'\s#]+)\4(\s*#.*)?$/);
    if (!m) return line;
    const [, indent, quotedKey, bareKey, , value, trailer = ''] = m;
    const key = quotedKey ?? bareKey;
    const { name, selector } = parseKey(key);
    const patched = floors.get(name);
    if (patched === undefined) return line;
    // Only auto-raise *targeted floors* (selector with an upper `<` bound).
    if (!selector || !selector.includes('<')) return line; // blanket pin — leave for a human
    handled.add(name);
    if (cmpSemver(value, patched) >= 0) return line; // floor already covers the advisory
    const newSelector = selector.replace(/<\s*[0-9][^\s]*/, `<${patched}`);
    const newKey = `${name}@${newSelector}`;
    changes.push({ name, from: value, to: patched });
    // Targeted selectors contain spaces/`<`, so they must stay quoted.
    return `${indent}'${newKey}': ${patched}${trailer}`;
  });

  // Advisories whose package has no targeted floor we could raise — surface them.
  const manual = [...floors.keys()].filter((n) => !handled.has(n));

  if (changes.length === 0) {
    console.log(
      'bump-override-floors: audit flags packages, but no stale targeted floor to raise.'
    );
  } else {
    writeFileSync(WORKSPACE, out.join('\n'));
    console.log('bump-override-floors: raised targeted floors:');
    for (const c of changes) console.log(`  ${c.name}: ${c.from} -> ${c.to}`);
  }
  if (manual.length > 0) {
    console.log(
      `bump-override-floors: NEEDS MANUAL ATTENTION (no targeted floor to raise): ${manual.join(', ')}`
    );
    console.log(
      '  Add a targeted override by hand (major-scope it if multiple majors are in the tree).'
    );
  }
  // Emit a machine-readable summary the workflow can fold into a PR body.
  console.log(`::BUMP_SUMMARY::${JSON.stringify({ changes, manual })}`);
}

main();

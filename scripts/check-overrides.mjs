#!/usr/bin/env node
// Fail when a *blanket* pnpm override pins a package to a version with a known
// advisory.
//
// `pnpm audit` already reports that a vulnerable package is present. What it
// cannot tell you is *why no Dependabot PR exists to fix it* -- and when an
// override is the cause, that is the whole question. Dependabot does not fight
// an explicit override, so the alert sits open looking like Dependabot is
// broken while the repo quietly pins the vulnerable version in place.
//
// This has now happened three times in this repo: hono (#59), then fast-uri and
// ip-address (#76). Each was found only because a human noticed an open alert
// with no PR beside it.
//
// The distinction that matters is the override's shape:
//
//   hono: 4.12.34          <- blanket. Freezes the version. Outranks everything.
//   'hono@<4.13.5': 4.13.5 <- targeted. "at least this version". Self-healing.
//
// A blanket pin is a standing commitment to one exact version; nothing warns you
// when the world moves past it. Only blanket pins are checked here -- a targeted
// rule raises a floor rather than freezing, so it cannot strand you below a fix.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workspace = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');

// Minimal parse: the overrides block is a flat map, so a full YAML dependency
// would buy nothing. Bail loudly rather than silently checking zero pins.
const block = workspace.match(/^overrides:\n((?:[ \t]+.*\n|\n)*)/m);
if (!block) {
  console.error('check-overrides: no `overrides:` block found in pnpm-workspace.yaml');
  process.exit(1);
}

const blanket = [];
for (const line of block[1].split('\n')) {
  const m = line.match(/^\s+'?([^'\s:]+)'?:\s*'?([^'\s#]+)'?\s*(?:#.*)?$/);
  if (!m) continue;
  const [, name, version] = m;
  // A selector carries a range after the package name (`pkg@<1.2.3`). Scoped
  // packages start with @, so only treat a *later* @ as a selector.
  const isSelector = name.lastIndexOf('@') > 0;
  if (!isSelector) blanket.push({ name, version });
}

if (blanket.length === 0) {
  console.log('check-overrides: no blanket pins to check.');
  process.exit(0);
}

/** Numeric-segment semver compare, enough to pick the highest patched version. */
function compareSemver(a, b) {
  const parts = (v) =>
    String(v)
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  }
  return 0;
}

/**
 * Does a GitHub `vulnerable_version_range` cover `version`?
 * The format is comma-separated comparators, e.g. ">= 4.0.0, < 4.1.4" or "< 2.4.6".
 * Unparseable input returns true, so an unrecognised range is reported rather
 * than silently dropped -- a false alarm is cheap, a missed advisory is not.
 */
function rangeCovers(range, version) {
  if (!range) return true;
  return range.split(',').every((part) => {
    const m = part.trim().match(/^(>=|<=|>|<|=)?\s*(\d[\w.-]*)$/);
    if (!m) return true;
    const [, op = '=', bound] = m;
    const cmp = compareSemver(version, bound);
    if (op === '>=') return cmp >= 0;
    if (op === '<=') return cmp <= 0;
    if (op === '>') return cmp > 0;
    if (op === '<') return cmp < 0;
    return cmp === 0;
  });
}

const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
const headers = {
  accept: 'application/vnd.github+json',
  'user-agent': 'verifyax-check-overrides',
  ...(token ? { authorization: `Bearer ${token}` } : {}),
};

let failed = false;
for (const { name, version } of blanket) {
  const url = `https://api.github.com/advisories?ecosystem=npm&affects=${encodeURIComponent(
    `${name}@${version}`
  )}&per_page=20`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    // Never fail the build on an unreachable advisory database: a rate limit or
    // an outage is not a security finding, and treating it as one trains people
    // to rerun until it passes.
    console.warn(
      `check-overrides: could not query advisories for ${name}@${version} ` +
        `(HTTP ${res.status}) -- skipped, not treated as a failure.`
    );
    continue;
  }

  const advisories = await res.json();
  if (advisories.length === 0) {
    console.log(`  ok    ${name}@${version}`);
    continue;
  }

  failed = true;
  const worst = advisories[0];

  // Only consider advisories whose vulnerable range actually covers the pinned
  // version, then take the highest fix among those. A package usually carries
  // advisories against several release lines, and both naive choices mislead:
  // fast-uri@3.1.6 reports fixes of 2.4.6 (an older line) and 4.1.4 (a newer
  // one), so "first" suggests a version that is still vulnerable and "highest"
  // suggests a major upgrade nobody asked for. The right answer is 3.1.7 -- the
  // fix for the range that actually contains 3.1.6.
  const patched =
    advisories
      .flatMap((a) => a.vulnerabilities ?? [])
      .filter(
        (v) =>
          v.package?.name === name &&
          v.first_patched_version &&
          rangeCovers(v.vulnerable_version_range, version)
      )
      .map((v) => v.first_patched_version)
      .sort(compareSemver)
      .pop() ?? 'see advisory';
  console.error(
    `\n  FAIL  ${name}@${version} is pinned by a blanket override and has ` +
      `${advisories.length} known advisor${advisories.length === 1 ? 'y' : 'ies'}` +
      `\n        ${worst.severity}: ${worst.ghsa_id} -- ${worst.summary}` +
      `\n        patched in: ${patched}` +
      `\n        Dependabot will not propose a fix while this override exists.` +
      `\n        Replace it with a targeted rule, e.g. '${name}@<${patched}': ${patched}`
  );
}

if (failed) {
  console.error('\ncheck-overrides: a blanket override is holding a vulnerable version in place.');
  process.exit(1);
}
console.log('check-overrides: all blanket pins are clear of known advisories.');

#!/usr/bin/env node
/**
 * The one way to check work locally (see AGENTS.md, "Testing").
 *
 *   pnpm verify:quick   while coding: the tests for what you changed, in seconds
 *   pnpm verify:ready   once, before delivering: lint, typecheck and the full unit suite
 *
 * verify:quick picks tests from the files that differ from origin/main,
 * committed or not: each changed file's own tests (same name, next to it),
 * test files that refer to it directly, and any changed test file. A widely
 * shared module would pull in much of the suite, so above QUICK_LIMIT it
 * keeps only that file's own tests and says so.
 *
 * verify:ready records a pass against the code's tree hash (tracked and
 * untracked files, after .gitignore) and the Node version. Running it again
 * on identical code says so and runs nothing; `--force` runs it anyway.
 */
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const CACHE = path.join(ROOT, "node_modules", ".cache", "verify");
const QUICK_LIMIT = 40;
const TEST_FILE = /\.(test|spec)\.tsx?$/;
const SOURCE_FILE = /\.(tsx?|mjs|js)$/;
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "coverage", "packages", "e2e", ".worktrees"]);

// Node keeps compiled bytecode here between runs, so later runs skip recompiling Vitest and dependencies.
const RUN_ENV = { ...process.env, NODE_COMPILE_CACHE: path.join(ROOT, "node_modules", ".cache", "node-compile-cache") };

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const lines = (text) => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

function run(label, command, args) {
  const started = Date.now();
  console.log(`\n[verify] ${label}: ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd: ROOT, stdio: "inherit", env: RUN_ENV, shell: process.platform === "win32" });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`[verify] ${label}: ${result.status === 0 ? "passed" : "FAILED"} in ${seconds}s`);
  return result.status === 0;
}

function changedFiles() {
  const base = (() => {
    try {
      return git("merge-base", "HEAD", "origin/main");
    } catch {
      return "HEAD";
    }
  })();
  return [
    ...new Set([
      ...lines(git("diff", "--name-only", base)),
      ...lines(git("ls-files", "--others", "--exclude-standard")),
    ]),
  ].filter((file) => existsSync(path.join(ROOT, file)));
}

function allTestFiles(dir = ROOT, found = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) allTestFiles(full, found);
    else if (TEST_FILE.test(entry)) found.push(path.relative(ROOT, full).split(path.sep).join("/"));
  }
  return found;
}

/** The ways a test file can name `file`: its `@/` import path, a relative path, or its file name. */
function namesFor(file) {
  const noExt = file.replace(/\.(tsx?|mjs|js)$/, "");
  const names = new Set([`@/${noExt}`, `@/${file}`, path.posix.basename(file)]);
  if (noExt.endsWith("/route")) names.delete("route.ts");
  if (noExt.endsWith("/page")) names.delete("page.tsx");
  return names;
}

function quick() {
  const changed = changedFiles();
  if (!changed.length) {
    console.log("[verify] Nothing differs from origin/main.");
    return true;
  }
  const tests = allTestFiles().filter((file) => !file.startsWith("cli/tests/"));
  const sources = new Map(tests.map((file) => [file, readFileSync(path.join(ROOT, file), "utf8")]));
  const picked = new Set();
  const notes = [];

  for (const file of changed) {
    if (TEST_FILE.test(file)) {
      if (sources.has(file)) picked.add(file);
      continue;
    }
    if (file.startsWith("cli/tests/")) {
      notes.push(`${file}: a CLI scenario; run \`pnpm test:cli\` against \`pnpm dev\`.`);
      continue;
    }
    const dir = path.posix.dirname(file);
    const stem = path.posix.basename(file).replace(/\.(tsx?|mjs|js|md|json|prisma|css)$/, "");
    // Its own tests: next to it, named after it (`issues.ts` → `issues.test.ts`, `issues-mentions.test.ts`).
    const own = tests.filter((test) => path.posix.dirname(test) === dir && (path.posix.basename(test).startsWith(`${stem}.`) || path.posix.basename(test).startsWith(`${stem}-`)));
    // Tests that name it directly.
    const names = namesFor(file);
    const referring = tests.filter((test) => !own.includes(test) && [...names].some((name) => sources.get(test).includes(name)));
    if (own.length + referring.length > QUICK_LIMIT) {
      own.forEach((test) => picked.add(test));
      notes.push(`${file} is shared by ${referring.length} test files; quick ran only its own ${own.length}. \`pnpm verify:ready\` covers the rest.`);
      continue;
    }
    [...own, ...referring].forEach((test) => picked.add(test));
    if (!own.length && !referring.length && (SOURCE_FILE.test(file) || file.endsWith(".prisma"))) {
      notes.push(`${file}: no test refers to it directly.`);
    }
  }

  for (const note of notes) console.log(`[verify] ${note}`);
  if (!picked.size) {
    console.log("[verify] No unit tests map to these changes. Run `pnpm verify:ready` before delivering.");
    return true;
  }
  console.log(`[verify] ${picked.size} test file${picked.size === 1 ? "" : "s"} for ${changed.length} changed file${changed.length === 1 ? "" : "s"}.`);
  return run("quick tests", "pnpm", ["exec", "vitest", "run", ...[...picked].sort()]);
}

/** Runs a command with its output held back, so two can run at once without mixing their logs. */
function runBuffered(label, command, args) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: ROOT, env: RUN_ENV, shell: process.platform === "win32" });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => {
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`\n[verify] ${label}: ${command} ${args.join(" ")}`);
      if (output.trim()) process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
      console.log(`[verify] ${label}: ${code === 0 ? "passed" : "FAILED"} in ${seconds}s`);
      resolve(code === 0);
    });
  });
}

/** The tree the working copy would commit as, untracked files included, without touching the real index. */
function treeHash() {
  const index = path.join(tmpdir(), `verify-index-${process.pid}`);
  const real = path.join(ROOT, git("rev-parse", "--git-path", "index"));
  if (existsSync(real)) copyFileSync(real, index);
  try {
    const env = { ...process.env, GIT_INDEX_FILE: index };
    execFileSync("git", ["add", "-A"], { cwd: ROOT, env });
    return execFileSync("git", ["write-tree"], { cwd: ROOT, env, encoding: "utf8" }).trim();
  } finally {
    rmSync(index, { force: true });
  }
}

async function ready(force) {
  mkdirSync(CACHE, { recursive: true });
  const key = `${treeHash()}-node${process.versions.node}`;
  const record = path.join(CACHE, `ready-${key}.json`);
  if (!force && existsSync(record)) {
    const { at } = JSON.parse(readFileSync(record, "utf8"));
    console.log(`[verify] This exact code already passed verify:ready at ${at}. Nothing to run (use --force to run again).`);
    return true;
  }
  const started = Date.now();
  // Lint and typecheck don't depend on each other: run them together, then the tests.
  const [linted, typed] = await Promise.all([runBuffered("lint", "pnpm", ["lint"]), runBuffered("typecheck", "pnpm", ["typecheck"])]);
  if (!linted || !typed) return false;
  if (!run("unit tests", "pnpm", ["exec", "vitest", "run"])) return false;
  writeFileSync(record, JSON.stringify({ at: new Date().toISOString(), tree: key, seconds: Math.round((Date.now() - started) / 1000) }));
  console.log(`\n[verify] Ready: lint, typecheck and unit tests passed in ${Math.round((Date.now() - started) / 1000)}s. Recorded for this exact code.`);
  return true;
}

const [mode, ...rest] = process.argv.slice(2);
const ok = mode === "quick" ? quick() : mode === "ready" ? await ready(rest.includes("--force")) : (console.error("Usage: node scripts/verify.mjs quick|ready [--force]"), false);
process.exit(ok ? 0 : 1);

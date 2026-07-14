import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { SkillTarget } from "./detect";
import {
  SkillsError,
  assertManifestCompatible,
  canonicalSkillsDirectory,
  loadManifest,
  sha256,
  verifySkillDirectory,
  type SkillManifest,
  type SkillManifestEntry,
} from "./verify";

type ReceiptSkill = { version: string; files: Record<string, string> };
type Receipt = {
  manifestVersion: 1;
  releaseVersion: string;
  skills: Record<string, ReceiptSkill>;
};

type PlannedSkill = {
  target: SkillTarget;
  skill: SkillManifestEntry;
  state: "new" | "unchanged" | "update" | "modified";
  diff: string[];
  backupPath?: string;
};

const RECEIPT = ".snabbsajt-skills.json";

function existsEvenIfBroken(path: string): boolean {
  if (existsSync(path)) return true;
  try { lstatSync(path); return true; } catch { return false; }
}

function assertInside(base: string, target: string): void {
  const resolvedBase = resolve(base);
  const resolvedTarget = resolve(target);
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(`${resolvedBase}${sep}`)) {
    throw new SkillsError("UNSAFE_PATH", `${target} escapes the selected install scope`);
  }
}

function assertNoSymlinks(base: string, target: string): void {
  assertInside(base, target);
  if (existsEvenIfBroken(base) && lstatSync(base).isSymbolicLink()) {
    throw new SkillsError("SYMLINK_TARGET", `refusing symbolic-link install scope ${base}`, { path: base });
  }
  const rel = relative(resolve(base), resolve(target));
  let current = resolve(base);
  for (const part of rel.split(sep).filter(Boolean)) {
    current = join(current, part);
    if (existsEvenIfBroken(current) && lstatSync(current).isSymbolicLink()) {
      throw new SkillsError("SYMLINK_TARGET", `refusing symbolic-link install target ${current}`, { path: current });
    }
  }
}

function loadReceipt(root: string): Receipt | null {
  const path = join(root, RECEIPT);
  if (!existsEvenIfBroken(path)) return null;
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    throw new SkillsError("SYMLINK_TARGET", `refusing symbolic-link receipt ${path}`, { path });
  }
  if (!stat.isFile()) {
    throw new SkillsError("UNSAFE_PATH", `receipt must be a regular file: ${path}`, { path });
  }
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Receipt;
    return value?.manifestVersion === 1 && value.skills && typeof value.skills === "object" ? value : null;
  } catch {
    return null;
  }
}

function expectedFiles(skill: SkillManifestEntry): Record<string, string> {
  return Object.fromEntries(skill.files.map((file) => [file.path, file.sha256]));
}

function installedFiles(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new SkillsError("SYMLINK_TARGET", `refusing symbolic-link skill content ${path}`, { path });
      }
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files[relative(root, path)] = sha256(path);
      else throw new SkillsError("UNSAFE_PATH", `unsupported installed skill entry ${path}`);
    }
  };
  visit(root);
  return files;
}

function sameFiles(actual: Record<string, string>, expected: Record<string, string>): boolean {
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index] && actual[key] === expected[key]);
}

function diffInstalled(
  root: string,
  skill: SkillManifestEntry,
  receipt: ReceiptSkill | undefined,
): { state: PlannedSkill["state"]; diff: string[] } {
  const skillRoot = join(root, skill.name);
  if (!existsEvenIfBroken(skillRoot)) return { state: "new", diff: [] };
  if (lstatSync(skillRoot).isSymbolicLink()) {
    throw new SkillsError("SYMLINK_TARGET", `refusing symbolic-link skill target ${skillRoot}`, { path: skillRoot });
  }
  if (!lstatSync(skillRoot).isDirectory()) {
    return { state: "modified", diff: [`${skill.name}: expected a directory`] };
  }

  const actualFiles = installedFiles(skillRoot);
  const desiredFiles = expectedFiles(skill);
  const matchesDesired = sameFiles(actualFiles, desiredFiles);
  const matchesReceipt = Boolean(receipt) && sameFiles(actualFiles, receipt!.files);
  const diff = [...new Set([...Object.keys(actualFiles), ...Object.keys(desiredFiles)])]
    .filter((path) => actualFiles[path] !== desiredFiles[path])
    .map((path) => `${skill.name}/${path}: ${actualFiles[path] ? (desiredFiles[path] ? "content differs" : "unexpected file") : "missing"}`);
  if (matchesDesired) return { state: "unchanged", diff: [] };
  if (matchesReceipt) return { state: "update", diff };
  return { state: "modified", diff };
}

function backupPathFor(root: string, skillName: string): string {
  return join(root, ".snabbsajt-backups", `${skillName}-${Date.now()}`);
}

function planInstall(
  base: string,
  targets: SkillTarget[],
  manifest: SkillManifest,
): PlannedSkill[] {
  const planned: PlannedSkill[] = [];
  for (const target of targets) {
    assertNoSymlinks(base, target.root);
    const receipt = loadReceipt(target.root);
    for (const skill of manifest.skills) {
      const result = diffInstalled(target.root, skill, receipt?.skills[skill.name]);
      const item: PlannedSkill = {
        target,
        skill,
        ...result,
        backupPath: result.state === "modified" ? backupPathFor(target.root, skill.name) : undefined,
      };
      if (item.backupPath) assertNoSymlinks(target.root, dirname(item.backupPath));
      planned.push(item);
    }
  }
  return planned;
}

function replaceSkill(
  assetsDir: string,
  planned: PlannedSkill,
  force: boolean,
): string | undefined {
  const { root } = planned.target;
  const target = join(root, planned.skill.name);
  mkdirSync(root, { recursive: true });
  let backup: string | undefined;
  if (planned.state === "modified" && force) {
    backup = planned.backupPath;
    mkdirSync(dirname(backup!), { recursive: true });
    cpSync(target, backup!, { recursive: true, errorOnExist: true });
  }
  const staging = join(root, `.snabbsajt-install-${planned.skill.name}-${process.pid}-${Date.now()}`);
  assertNoSymlinks(root, staging);
  cpSync(join(assetsDir, planned.skill.name), staging, { recursive: true, errorOnExist: true });
  try {
    verifySkillDirectory(staging, planned.skill);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  if (existsEvenIfBroken(target)) {
    const previous = join(root, `.snabbsajt-previous-${planned.skill.name}-${process.pid}-${Date.now()}`);
    renameSync(target, previous);
    try {
      renameSync(staging, target);
      rmSync(previous, { recursive: true, force: true });
    } catch (error) {
      if (!existsEvenIfBroken(target)) renameSync(previous, target);
      rmSync(staging, { recursive: true, force: true });
      throw error;
    }
  } else {
    renameSync(staging, target);
  }
  return backup;
}

function writeReceipt(root: string, manifest: SkillManifest): void {
  const receipt: Receipt = {
    manifestVersion: 1,
    releaseVersion: manifest.releaseVersion,
    skills: Object.fromEntries(
      manifest.skills.map((skill) => [
        skill.name,
        { version: skill.version, files: expectedFiles(skill) },
      ]),
    ),
  };
  const path = join(root, RECEIPT);
  if (existsEvenIfBroken(path)) {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      throw new SkillsError("SYMLINK_TARGET", `refusing symbolic-link receipt ${path}`, { path });
    }
    if (!stat.isFile()) throw new SkillsError("UNSAFE_PATH", `receipt must be a regular file: ${path}`);
  }
  const temporary = join(root, `.snabbsajt-receipt-${process.pid}-${Date.now()}`);
  writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  renameSync(temporary, path);
}

export type InstallResult = {
  installed: number;
  updated: number;
  unchanged: number;
  valid: number;
  backups: string[];
  targets: SkillTarget[];
  manifest: SkillManifest;
};

export function installSkills(options: {
  base: string;
  targets: SkillTarget[];
  cliVersion: string;
  force: boolean;
}): InstallResult {
  const assetsDir = canonicalSkillsDirectory();
  const manifest = loadManifest(assetsDir);
  assertManifestCompatible(options.cliVersion, manifest);
  const planned = planInstall(options.base, options.targets, manifest);
  const modified = planned.find((item) => item.state === "modified");
  if (modified && !options.force) {
    throw new SkillsError(
      "MODIFIED_INSTALL",
      `refusing to overwrite modified ${modified.skill.name}; rerun with --force after reviewing the diff and backup path`,
      { diff: modified.diff.join("\n"), backupPath: modified.backupPath },
    );
  }

  const backups: string[] = [];
  for (const item of planned) {
    if (item.state === "unchanged") continue;
    const backup = replaceSkill(assetsDir, item, options.force);
    if (backup) backups.push(backup);
  }
  for (const target of options.targets) writeReceipt(target.root, manifest);
  const verification = inspectSkills({ base: options.base, targets: options.targets, manifest });
  if (verification.modified > 0 || verification.missing > 0) {
    throw new SkillsError("CHECKSUM_MISMATCH", "installed skill verification failed", verification);
  }
  return {
    installed: planned.filter((item) => item.state === "new").length,
    updated: planned.filter((item) => item.state === "update" || item.state === "modified").length,
    unchanged: planned.filter((item) => item.state === "unchanged").length,
    valid: verification.valid,
    backups,
    targets: options.targets,
    manifest,
  };
}

export function inspectSkills(options: {
  base: string;
  targets: SkillTarget[];
  manifest?: SkillManifest;
}) {
  const manifest = options.manifest ?? loadManifest();
  const skills: Array<{
    name: string;
    version: string;
    agent: string;
    path: string;
    status: "valid" | "modified" | "missing";
  }> = [];
  for (const target of options.targets) {
    assertNoSymlinks(options.base, target.root);
    for (const skill of manifest.skills) {
      const installedRoot = join(target.root, skill.name);
      let status: "valid" | "modified" | "missing" = "valid";
      if (!existsEvenIfBroken(installedRoot)) status = "missing";
      else if (lstatSync(installedRoot).isSymbolicLink() || !lstatSync(installedRoot).isDirectory()) status = "modified";
      else if (!sameFiles(installedFiles(installedRoot), expectedFiles(skill))) status = "modified";
      skills.push({ name: skill.name, version: skill.version, agent: target.agent, path: installedRoot, status });
    }
  }
  return {
    skills,
    valid: skills.filter((skill) => skill.status === "valid").length,
    modified: skills.filter((skill) => skill.status === "modified").length,
    missing: skills.filter((skill) => skill.status === "missing").length,
  };
}

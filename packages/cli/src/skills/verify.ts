import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  IMPORT_REPORT_FORMAT,
  IMPORT_REPORT_FORMAT_VERSION,
  PORTABLE_FORMAT,
  PORTABLE_VERSION,
} from "@snabbsajt/site-kit";

export type SkillFile = { path: string; sha256: string };
export type SkillManifestEntry = { name: string; version: string; files: SkillFile[] };
export type SkillManifest = {
  manifestVersion: number;
  releaseVersion: string;
  minimumCliVersion: string;
  portableFormat: { format: string; version: number };
  reportContract: { format: string; version: string };
  skills: SkillManifestEntry[];
};

export class SkillsError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function isSafeRelativePath(path: string): boolean {
  if (!path || isAbsolute(path) || path.includes("\0")) return false;
  const normalized = normalize(path);
  return normalized !== ".." && !normalized.startsWith(`..${sep}`) && normalized === path;
}

function validateManifest(value: unknown): asserts value is SkillManifest {
  if (!value || typeof value !== "object") throw new SkillsError("INVALID_MANIFEST", "skill manifest must be an object");
  const manifest = value as Partial<SkillManifest>;
  if (manifest.manifestVersion !== 1 || !Array.isArray(manifest.skills)) {
    throw new SkillsError("INVALID_MANIFEST", "unsupported skill manifest");
  }
  if (
    typeof manifest.releaseVersion !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(manifest.releaseVersion) ||
    typeof manifest.minimumCliVersion !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(manifest.minimumCliVersion)
  ) {
    throw new SkillsError("INVALID_MANIFEST", "releaseVersion and minimumCliVersion must be stable semantic versions");
  }
  if (
    !manifest.portableFormat ||
    typeof manifest.portableFormat.format !== "string" ||
    typeof manifest.portableFormat.version !== "number" ||
    !manifest.reportContract ||
    typeof manifest.reportContract.format !== "string" ||
    typeof manifest.reportContract.version !== "string"
  ) {
    throw new SkillsError("INVALID_MANIFEST", "portableFormat and reportContract are required");
  }
  const names = new Set<string>();
  for (const skill of manifest.skills) {
    if (!skill || typeof skill.name !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name)) {
      throw new SkillsError("UNSAFE_PATH", "skill name is not a safe directory name");
    }
    if (names.has(skill.name)) throw new SkillsError("INVALID_MANIFEST", `duplicate skill ${skill.name}`);
    names.add(skill.name);
    if (typeof skill.version !== "string" || !/^\d+\.\d+\.\d+$/.test(skill.version)) {
      throw new SkillsError("INVALID_MANIFEST", `${skill.name} has an invalid stable semantic version`);
    }
    if (!Array.isArray(skill.files) || skill.files.length === 0) {
      throw new SkillsError("INVALID_MANIFEST", `${skill.name} has no files`);
    }
    const paths = new Set<string>();
    for (const file of skill.files) {
      if (!file || typeof file.path !== "string" || !isSafeRelativePath(file.path)) {
        throw new SkillsError("UNSAFE_PATH", `${skill.name} contains an unsafe file path`);
      }
      if (typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256)) {
        throw new SkillsError("INVALID_MANIFEST", `${skill.name}/${file.path} has an invalid checksum`);
      }
      if (paths.has(file.path)) {
        throw new SkillsError("INVALID_MANIFEST", `${skill.name} declares duplicate file ${file.path}`);
      }
      paths.add(file.path);
    }
  }
}

function inventoryRegularFiles(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        throw new SkillsError("UNSAFE_PATH", `skill source must not contain symbolic links: ${relative(root, path)}`);
      }
      if (stat.isDirectory()) visit(path);
      else if (stat.isFile()) files[relative(root, path)] = sha256(path);
      else throw new SkillsError("UNSAFE_PATH", `skill source contains unsupported entry: ${relative(root, path)}`);
    }
  };
  visit(root);
  return files;
}

export function verifySkillDirectory(root: string, skill: SkillManifestEntry): void {
  const actual = inventoryRegularFiles(root);
  const expected = Object.fromEntries(skill.files.map((file) => [file.path, file.sha256]));
  const actualPaths = Object.keys(actual).sort();
  const expectedPaths = Object.keys(expected).sort();
  if (
    actualPaths.length !== expectedPaths.length ||
    actualPaths.some((path, index) => path !== expectedPaths[index] || actual[path] !== expected[path])
  ) {
    throw new SkillsError("CHECKSUM_MISMATCH", `source inventory does not match manifest for ${skill.name}`);
  }
}

export function canonicalSkillsDirectory(): string {
  const override = process.env.SNABBSAJT_SKILLS_DIR;
  if (override) return resolve(override);
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(moduleDir, "skills"), resolve(moduleDir, "../../../../skills")];
  const found = candidates.find((candidate) => existsSync(join(candidate, "manifest.json")));
  if (!found) throw new SkillsError("ASSETS_NOT_FOUND", "bundled skill assets were not found");
  return found;
}

export function loadManifest(assetsDir = canonicalSkillsDirectory()): SkillManifest {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(join(assetsDir, "manifest.json"), "utf8"));
  } catch (error) {
    throw new SkillsError("INVALID_MANIFEST", `cannot read skill manifest: ${(error as Error).message}`);
  }
  validateManifest(value);
  for (const skill of value.skills) {
    const sourceRoot = resolve(assetsDir, skill.name);
    if (!existsSync(sourceRoot) || lstatSync(sourceRoot).isSymbolicLink() || !lstatSync(sourceRoot).isDirectory()) {
      throw new SkillsError("UNSAFE_PATH", `skill source must be a real directory: ${skill.name}`);
    }
    verifySkillDirectory(sourceRoot, skill);
  }
  return value;
}

function semverParts(version: string): number[] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new SkillsError("INVALID_MANIFEST", `invalid semantic version ${version}`);
  return match.slice(1).map(Number);
}

export function assertManifestCompatible(currentCliVersion: string, manifest: SkillManifest): void {
  assertCompatible(currentCliVersion, manifest.minimumCliVersion);
  if (
    manifest.portableFormat.format !== PORTABLE_FORMAT ||
    manifest.portableFormat.version !== PORTABLE_VERSION
  ) {
    throw new SkillsError(
      "INCOMPATIBLE_PORTABLE_FORMAT",
      `skills require ${manifest.portableFormat.format}@${manifest.portableFormat.version}; CLI supports ${PORTABLE_FORMAT}@${PORTABLE_VERSION}`,
    );
  }
  if (
    manifest.reportContract.format !== IMPORT_REPORT_FORMAT ||
    manifest.reportContract.version !== IMPORT_REPORT_FORMAT_VERSION
  ) {
    throw new SkillsError(
      "INCOMPATIBLE_REPORT_CONTRACT",
      `skills require ${manifest.reportContract.format}@${manifest.reportContract.version}; CLI supports ${IMPORT_REPORT_FORMAT}@${IMPORT_REPORT_FORMAT_VERSION}`,
    );
  }
}

export function assertCompatible(current: string, minimum: string): void {
  const a = semverParts(current);
  const b = semverParts(minimum);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return;
    if (a[index] < b[index]) {
      throw new SkillsError(
        "INCOMPATIBLE_CLI",
        `skills require SnabbSajt CLI ${minimum} or newer; installed ${current}`,
        { installedCliVersion: current, minimumCliVersion: minimum },
      );
    }
  }
}

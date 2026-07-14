import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { zipSync } from "fflate";

type Manifest = {
  releaseVersion: string;
  skills: Array<{
    name: string;
    files: Array<{ path: string; source?: string; sha256: string }>;
  }>;
};

const root = resolve(import.meta.dirname, "..");
const skillsRoot = join(root, "skills");
const output = join(root, "release-assets");
const manifest = JSON.parse(readFileSync(join(skillsRoot, "manifest.json"), "utf8")) as Manifest;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

const checksums: string[] = [];
for (const skill of manifest.skills) {
  const files: Record<string, Uint8Array> = {};
  for (const entry of skill.files) {
    const source = entry.source
      ? join(skillsRoot, entry.source)
      : join(skillsRoot, skill.name, entry.path);
    const bytes = new Uint8Array(readFileSync(source));
    if (sha256(bytes) !== entry.sha256) {
      throw new Error(`${skill.name}/${entry.path} does not match skills/manifest.json`);
    }
    files[`${skill.name}/${entry.path}`] = bytes;
  }
  const archive = zipSync(files, { level: 9 });
  const fileName = `${skill.name}-${manifest.releaseVersion}.zip`;
  writeFileSync(join(output, fileName), archive);
  checksums.push(`${sha256(archive)}  ${fileName}`);
}

writeFileSync(join(output, "SHA256SUMS.txt"), `${checksums.sort().join("\n")}\n`);
console.log(`Wrote ${checksums.length} skill archive(s) for ${manifest.releaseVersion}.`);

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Generate skills/manifest.json from the declared skill set below.
//
// The manifest pins a sha256 for every file a skill installs, which is what
// makes `snabbsajt skills install` able to tell "the CLI shipped a new version"
// apart from "the human edited this file". Those hashes used to be maintained
// by hand, so a one-word fix to a SKILL.md left the manifest describing a file
// that no longer existed and the installer refused with CHECKSUM_MISMATCH -
// a loud failure, but only at install time, on someone else's machine.
//
// One of the referenced files (section-schema.md) is itself generated from the
// contract, so drift here is not hypothetical: regenerate the schema and every
// manifest hash downstream of it is stale.
//
//   bun scripts/gen-skill-manifest.ts          # write the manifest
//   bun scripts/gen-skill-manifest.ts --check  # fail if it is stale (CI)
// ---------------------------------------------------------------------------

/** The skill set, its versions, and the shared references each one installs.
 *  Shared files live once under skills/shared/ and are copied into each skill
 *  that declares them, at install time and in the release archives. */
const SKILLS = [
  {
    name: "snabbsajt-getting-started",
    version: "1.0.0",
    references: ["cli-commands.md", "mcp-tools.md"],
  },
  {
    name: "import-website",
    version: "1.3.0",
    references: ["import-mapping-rules.md", "cli-commands.md", "section-schema.md"],
  },
  {
    name: "build-snabbsajt-site",
    version: "1.2.0",
    references: ["cli-commands.md", "section-schema.md"],
  },
  {
    name: "review-site-package",
    version: "1.1.0",
    references: ["cli-commands.md", "section-schema.md"],
  },
  {
    name: "manage-snabbsajt-site",
    version: "1.1.0",
    references: ["mcp-tools.md"],
  },
  {
    name: "make-site-editable",
    version: "1.0.0",
    references: ["cli-commands.md", "mcp-tools.md"],
  },
] as const;

const RELEASE_VERSION = "1.4.0";
const MINIMUM_CLI_VERSION = "0.1.0";

const skillsRoot = resolve(import.meta.dirname, "../skills");
const sha256 = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

const manifest = {
  manifestVersion: 1,
  releaseVersion: RELEASE_VERSION,
  minimumCliVersion: MINIMUM_CLI_VERSION,
  portableFormat: { format: "sajt-site", version: 1 },
  reportContract: { format: "snabbsajt-import-report", version: "1" },
  skills: SKILLS.map((skill) => ({
    name: skill.name,
    version: skill.version,
    files: [
      { path: "SKILL.md", sha256: sha256(join(skillsRoot, skill.name, "SKILL.md")) },
      ...skill.references.map((reference) => ({
        path: `references/${reference}`,
        source: `shared/${reference}`,
        sha256: sha256(join(skillsRoot, "shared", reference)),
      })),
    ],
  })),
};

const next = `${JSON.stringify(manifest, null, 2)}\n`;
const manifestPath = join(skillsRoot, "manifest.json");

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(manifestPath, "utf8");
  } catch {
    // Missing file counts as stale.
  }
  if (current !== next) {
    console.error("skills/manifest.json is stale. Run: bun scripts/gen-skill-manifest.ts");
    process.exit(1);
  }
  console.log("skills/manifest.json is up to date.");
} else {
  writeFileSync(manifestPath, next);
  console.log(`Wrote skills/manifest.json (${SKILLS.length} skills, ${RELEASE_VERSION}).`);
}

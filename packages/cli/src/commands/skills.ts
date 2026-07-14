import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { detectSkillTargets, type AgentChoice } from "../skills/detect";
import { inspectSkills, installSkills } from "../skills/install";
import { assertManifestCompatible, loadManifest, SkillsError } from "../skills/verify";

type Output = { stdout(message: string): void; stderr(message: string): void };

function cliVersion(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const path = join(current, "package.json");
    if (existsSync(path)) {
      const value = JSON.parse(readFileSync(path, "utf8")) as { name?: string; version?: string };
      if (value.name === "@snabbsajt/cli" && value.version) return value.version;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new SkillsError("CLI_VERSION_NOT_FOUND", "could not resolve @snabbsajt/cli version");
}

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("-")) throw new SkillsError("INVALID_ARGUMENT", `${name} requires a value`);
  return value;
}

function parseAgent(args: string[]): AgentChoice {
  const agent = optionValue(args, "--agent") ?? "auto";
  if (!(["auto", "codex", "claude", "all"] as string[]).includes(agent)) {
    throw new SkillsError("INVALID_ARGUMENT", `unknown agent ${agent}; use auto, codex, claude, or all`);
  }
  return agent as AgentChoice;
}

function emit(output: Output, asJson: boolean, value: Record<string, unknown>, message: string): void {
  if (asJson) output.stdout(JSON.stringify(value));
  else output.stdout(message);
}

export async function runSkillsCommand(
  rawArgs: string[],
  output: Output = { stdout: console.log, stderr: console.error },
): Promise<number> {
  const asJson = rawArgs.includes("--json");
  const args = rawArgs.filter((arg) => arg !== "--json");
  const [command] = args;
  try {
    if (!command || !["install", "list", "doctor"].includes(command)) {
      throw new SkillsError("UNKNOWN_COMMAND", `unknown skills command ${command ?? ""}`.trim());
    }
    const global = args.includes("--global");
    const agent = parseAgent(args);
    const base = global ? homedir() : process.cwd();
    const targets = detectSkillTargets({ cwd: process.cwd(), agent, global });
    const manifest = loadManifest();
    assertManifestCompatible(cliVersion(), manifest);

    if (command === "install") {
      const result = installSkills({ base, targets, cliVersion: cliVersion(), force: args.includes("--force") });
      const value = {
        ok: true,
        command: "skills install",
        scope: global ? "global" : "local",
        agent,
        releaseVersion: manifest.releaseVersion,
        installed: result.installed,
        updated: result.updated,
        unchanged: result.unchanged,
        valid: result.valid,
        backups: result.backups,
        targets,
      };
      emit(output, asJson, value, `Installed ${result.installed}, updated ${result.updated}, unchanged ${result.unchanged}; ${result.valid} checksum(s) valid.`);
      return 0;
    }

    const inspection = inspectSkills({ base, targets, manifest });
    const ok = command === "list" || (inspection.modified === 0 && inspection.missing === 0);
    const value = {
      ok,
      command: `skills ${command}`,
      scope: global ? "global" : "local",
      agent,
      releaseVersion: manifest.releaseVersion,
      ...inspection,
    };
    emit(
      output,
      asJson,
      value,
      inspection.skills.map((skill) => `${skill.status.padEnd(8)} ${skill.agent.padEnd(6)} ${skill.name} ${skill.version}`).join("\n"),
    );
    return ok ? 0 : 1;
  } catch (error) {
    const known = error instanceof SkillsError ? error : new SkillsError("SKILLS_ERROR", error instanceof Error ? error.message : String(error));
    const value = { ok: false, command: `skills ${command ?? ""}`.trim(), code: known.code, error: known.message, ...known.details };
    if (asJson) output.stderr(JSON.stringify(value));
    else {
      const detailLines = [
        typeof known.details.diff === "string" ? `Diff:\n${known.details.diff}` : null,
        typeof known.details.backupPath === "string" ? `Backup path: ${known.details.backupPath}` : null,
      ].filter((line): line is string => line !== null);
      output.stderr(`snabbsajt: ${known.message}${detailLines.length ? `\n${detailLines.join("\n")}` : ""}`);
    }
    return 1;
  }
}

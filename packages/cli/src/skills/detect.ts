import { existsSync, lstatSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { SkillsError } from "./verify";

export type AgentChoice = "auto" | "codex" | "claude" | "all";
export type SkillTarget = { agent: "codex" | "claude"; root: string };

function present(path: string): boolean {
  return existsSync(path) || (() => {
    try { lstatSync(path); return true; } catch { return false; }
  })();
}

export function detectSkillTargets(options: {
  cwd: string;
  agent: AgentChoice;
  global: boolean;
}): SkillTarget[] {
  const base = options.global ? homedir() : resolve(options.cwd);
  const codexCandidates = options.global
    ? [join(base, ".agents/skills")]
    : [join(base, ".agents/skills"), join(base, ".codex/skills")];
  const claude = join(base, ".claude/skills");

  if (options.agent === "auto") {
    const targets: SkillTarget[] = [];
    for (const root of codexCandidates) if (present(root)) targets.push({ agent: "codex", root });
    if (present(claude)) targets.push({ agent: "claude", root: claude });
    if (targets.length === 0) {
      throw new SkillsError(
        "NO_AGENT_DETECTED",
        "no project-local agent skill directory found; create .agents/skills or .claude/skills, or choose --agent codex|claude",
      );
    }
    return targets;
  }

  const targets: SkillTarget[] = [];
  if (options.agent === "codex" || options.agent === "all") {
    targets.push({ agent: "codex", root: codexCandidates.find(present) ?? codexCandidates[0] });
  }
  if (options.agent === "claude" || options.agent === "all") {
    targets.push({ agent: "claude", root: claude });
  }
  return targets;
}

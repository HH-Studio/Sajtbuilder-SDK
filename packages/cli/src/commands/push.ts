import { ConnectError } from "./connect/deviceAuth";
import { readEnvVar } from "./connect/project";
import {
  ADMIN_TOKEN_ENV_VAR,
  ADMIN_TOKEN_PREFIX,
  ENV_FILE,
  readAdminConfig,
  readAdminToken,
} from "./admin/adminProject";
import { DEFAULT_APP_URL, createMcpClient } from "./admin/mcpClient";
import { cliVersion, loadPackage, printReport, reportCounts } from "./site";
import { validateSitePackage, type PortableSiteV1, type SiteKitReport } from "@snabbsajt/site-kit";
import { consoleOutput, type Output } from "../output";

// ---------------------------------------------------------------------------
// `snabbsajt push` — upload a locally validated Site Kit package into an
// EXISTING SnabbSajt website draft, by merge-import.
//
// It is `pull`'s write-side twin, but it deliberately does NOT use pull's
// credential: SNABBSAJT_DELIVERY_TOKEN (sajt_pub_…) is read-only by design and
// is never accepted here. push authenticates with the admin token from
// `snabbsajt admin pair` (SNABBSAJT_ADMIN_TOKEN, sajt_live_…, content:write)
// and calls the same `import_site` MCP tool an AI assistant uses — one tool
// layer, re-authorized server-side, never a parallel REST path.
//
// Merge semantics live server-side (convex commitMergeImport): sections match
// by externalKey; new ones insert, unedited matches update, app-edited ones are
// reported as conflicts and SKIPPED unless --force-key lists them. Site config,
// theme and fonts are never touched, and a restore point is taken first.
// `--dry-run` runs the whole merge server-side and rolls it back, so the
// preview can never diverge from the real thing.
// ---------------------------------------------------------------------------

export type PushDeps = {
  /** Overrides the app origin the MCP client talks to. */
  appUrl?: string;
  fetch?: typeof globalThis.fetch;
};

type PushArgs = {
  target: string;
  siteId?: string;
  appUrl?: string;
  dryRun: boolean;
  forceKeys: string[];
  /** `--branch <name> --preview-url <https://...>`: the address the agency's
   *  host built for this branch. Reported after a successful push so the
   *  client's "Var är den live?" card can list it. Never created here; the host
   *  builds one per branch on its own. */
  branch?: string;
  previewUrl?: string;
  previewLabel?: string;
};

type MergeSectionEntry = {
  externalKey?: string;
  type: string;
  action: string;
  /** Present on a conflict from a server new enough to send it: what each side
   *  says that the other does not. Optional because the CLI is installed
   *  independently of the deployment it talks to, and an older server simply
   *  omits it. */
  conflictPreview?: { theirs?: string[]; ours?: string[] };
};
type MergeSummary = {
  pagesAdded?: string[];
  pagesMatched?: string[];
  sections?: MergeSectionEntry[];
};
type PushResultData = {
  websiteId?: string;
  editorUrl?: string;
  pagesImported?: number;
  assetsSkipped?: number;
  merge?: MergeSummary;
  preview?: boolean;
};

function parsePushArgs(args: string[]): PushArgs {
  let target: string | undefined;
  let siteId: string | undefined;
  let appUrl: string | undefined;
  let dryRun = false;
  let branch: string | undefined;
  let previewUrl: string | undefined;
  let previewLabel: string | undefined;
  const forceKeys: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (
      argument === "--site" ||
      argument === "--app-url" ||
      argument === "--force-key" ||
      argument === "--branch" ||
      argument === "--preview-url" ||
      argument === "--preview-label"
    ) {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) throw new ConnectError(`${argument} requires a value`);
      index += 1;
      if (argument === "--site") {
        if (siteId) throw new ConnectError("push accepts --site only once");
        siteId = value;
      } else if (argument === "--app-url") {
        if (appUrl) throw new ConnectError("push accepts --app-url only once");
        appUrl = value;
      } else if (argument === "--branch") {
        if (branch) throw new ConnectError("push accepts --branch only once");
        branch = value;
      } else if (argument === "--preview-url") {
        if (previewUrl) throw new ConnectError("push accepts --preview-url only once");
        previewUrl = value;
      } else if (argument === "--preview-label") {
        if (previewLabel) throw new ConnectError("push accepts --preview-label only once");
        previewLabel = value;
      } else {
        forceKeys.push(value);
      }
      continue;
    }
    if (argument.startsWith("-")) throw new ConnectError(`unknown push option "${argument}"`);
    if (target !== undefined) throw new ConnectError(`unexpected push argument "${argument}"`);
    target = argument;
  }
  if (!target) {
    throw new ConnectError(
      "push requires a package: snabbsajt push <site.json|package-dir> [--site <websiteId>] [--dry-run]",
    );
  }
  // Half a pair is a mistake worth naming: a branch with no address reports
  // nothing, and an address with no branch has nowhere to go.
  if ((branch && !previewUrl) || (previewUrl && !branch)) {
    throw new ConnectError(
      "--branch and --preview-url go together: --branch staging --preview-url https://...",
    );
  }
  return {
    target,
    ...(siteId ? { siteId } : {}),
    ...(appUrl ? { appUrl } : {}),
    ...(branch ? { branch } : {}),
    ...(previewUrl ? { previewUrl } : {}),
    ...(previewLabel ? { previewLabel } : {}),
    dryRun,
    forceKeys,
  };
}

/** The write credential, fail-closed with a message that names the fix. A
 *  read-only delivery token (sajt_pub_…) gets its own message: it is the wrong
 *  KIND of token, not a stale one. */
function requirePushToken(cwd: string): string {
  const token = readAdminToken(cwd);
  if (token) return token;
  const raw = readEnvVar(cwd, ADMIN_TOKEN_ENV_VAR);
  if (raw?.startsWith("sajt_pub_")) {
    throw new ConnectError(
      `${ADMIN_TOKEN_ENV_VAR} holds a delivery token (sajt_pub_…), which is read-only by design and can never push. Run \`snabbsajt admin pair\` to get a ${ADMIN_TOKEN_PREFIX}… token with content:write.`,
    );
  }
  if (raw !== undefined) {
    throw new ConnectError(
      `${ADMIN_TOKEN_ENV_VAR} does not look like a SnabbSajt admin token (they start with ${ADMIN_TOKEN_PREFIX}). Run \`snabbsajt admin pair\` to get one.`,
    );
  }
  throw new ConnectError(
    `No ${ADMIN_TOKEN_ENV_VAR} found in the environment or ${ENV_FILE}. Run \`snabbsajt admin pair\` first, or set it from your secret store. (SNABBSAJT_DELIVERY_TOKEN is read-only and is never accepted here.)`,
  );
}

function json(output: Output, payload: unknown): void {
  output.stdout(JSON.stringify(payload, null, 2));
}

function countByAction(sections: MergeSectionEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const section of sections) {
    counts[section.action] = (counts[section.action] ?? 0) + 1;
  }
  return counts;
}

function printMergeReport(
  output: Output,
  data: PushResultData,
  dryRun: boolean,
): void {
  const sections = data.merge?.sections ?? [];
  const counts = countByAction(sections);
  if (dryRun || data.preview) {
    output.stdout("DRY RUN — nothing was written. This is what a real push would do:");
  }
  output.stdout(
    `  Sections  ${counts.added ?? 0} added, ${counts.updated ?? 0} updated, ${counts.unchanged ?? 0} unchanged, ${counts.conflict ?? 0} conflict(s)`,
  );
  const pagesAdded = data.merge?.pagesAdded ?? [];
  const pagesMatched = data.merge?.pagesMatched ?? [];
  output.stdout(`  Pages     ${pagesAdded.length} added, ${pagesMatched.length} matched`);
  if (data.assetsSkipped) {
    output.stdout(
      `  Assets    ${data.assetsSkipped} skipped (not fetchable server-side — assets must be reachable URLs)`,
    );
  }
  const conflicts = sections.filter((section) => section.action === "conflict");
  if (conflicts.length > 0) {
    output.stdout("  Conflicts (edited in the app since the last import — kept, not overwritten):");
    for (const section of conflicts) {
      output.stdout(`    - ${section.externalKey ?? "(no externalKey)"} (${section.type})`);
      // The words on each side, when the server sent them. This is the half a
      // builder cannot see from their own repo, and it is usually enough to
      // decide between keeping the client's version and forcing their own
      // without opening the editor.
      const theirs = section.conflictPreview?.theirs ?? [];
      const ours = section.conflictPreview?.ours ?? [];
      for (const line of theirs) output.stdout(`        in the app:  ${line}`);
      for (const line of ours) output.stdout(`        your push:   ${line}`);
      if (section.conflictPreview && theirs.length === 0 && ours.length === 0) {
        // Distinguishes "edited, but not in the text" - a swapped image, a
        // layout knob - from "this server did not tell us", which prints
        // nothing at all rather than a misleading blank.
        output.stdout("        (the change is not in the text)");
      }
    }
    output.stdout("  Re-run with --force-key <externalKey> to overwrite a specific one.");
  }
  if (!dryRun && !data.preview && data.editorUrl) {
    output.stdout(`  Editor    ${data.editorUrl}`);
  }
}

export async function runPushCommand(
  rawArgs: string[],
  output: Output = consoleOutput,
  deps: PushDeps = {},
): Promise<number> {
  const asJson = rawArgs.includes("--json");
  const args = rawArgs.filter((arg) => arg !== "--json");
  try {
    if (args[0] !== undefined && ["help", "--help", "-h"].includes(args[0])) {
      usage(output);
      return 0;
    }
    const parsed = parsePushArgs(args);
    const cwd = process.cwd();

    // 1. Validate locally, with the exact validator `site validate` runs. An
    //    invalid package never leaves the machine.
    const loaded = loadPackage(parsed.target);
    const report: SiteKitReport = validateSitePackage(loaded.payload, {
      assetFileNames: loaded.dir ? new Set(Object.keys(loaded.assetFiles)) : undefined,
      fontFileNames: loaded.dir ? new Set(Object.keys(loaded.fontFiles)) : undefined,
    });
    if (!report.ok) {
      if (asJson) {
        json(output, { ok: false, command: "push", stage: "validate", ...reportCounts(report), issues: report.issues });
      } else {
        output.stderr("snabbsajt: the package is invalid — nothing was sent.");
        printReport(report, output);
      }
      return 1;
    }

    // 2. Resolve credential + target site.
    const token = requirePushToken(cwd);
    const config = readAdminConfig(cwd);
    const siteId = parsed.siteId ?? config?.siteId;
    if (!siteId) {
      throw new ConnectError(
        "push needs a target website: pass --site <websiteId>, or run `snabbsajt admin pair` in this directory first.",
      );
    }
    const appUrl =
      parsed.appUrl ??
      deps.appUrl ??
      process.env.SNABBSAJT_APP_URL ??
      config?.appUrl ??
      DEFAULT_APP_URL;

    // 3. Merge-import through the same MCP tool layer an AI assistant uses.
    const client = createMcpClient({
      appUrl,
      token,
      version: safeVersion(),
      ...(deps.fetch ? { fetch: deps.fetch } : {}),
    });
    const result = await client.callTool("import_site", {
      site: loaded.payload as PortableSiteV1,
      mergeIntoWebsiteId: siteId,
      ...(parsed.forceKeys.length > 0 ? { forceKeys: parsed.forceKeys } : {}),
      ...(parsed.dryRun ? { dryRun: true } : {}),
    });

    if (result.isError) {
      const message = result.text || "import_site reported an error without a message.";
      if (asJson) json(output, { ok: false, command: "push", siteId, error: message });
      else output.stderr(`snabbsajt: ${message}`);
      return 1;
    }

    const data = (result.data ?? {}) as PushResultData;

    // The branch preview, after the import and never before it: reporting an
    // address for content that failed to land would put a stale page on the
    // client's card. Skipped on a dry run for the same reason.
    let branchPreview: { branch: string; reported: boolean; error?: string } | undefined;
    if (parsed.branch && parsed.previewUrl && !parsed.dryRun) {
      const reported = await client.callTool("record_branch_preview", {
        websiteId: siteId,
        branch: parsed.branch,
        url: parsed.previewUrl,
        ...(parsed.previewLabel ? { label: parsed.previewLabel } : {}),
      });
      branchPreview = reported.isError
        ? {
            branch: parsed.branch,
            reported: false,
            error: reported.text || "record_branch_preview reported an error.",
          }
        : { branch: parsed.branch, reported: true };
    }
    if (asJson) {
      json(output, {
        ok: true,
        command: "push",
        siteId,
        dryRun: parsed.dryRun,
        preview: data.preview === true,
        pagesImported: data.pagesImported,
        assetsSkipped: data.assetsSkipped,
        sectionCounts: countByAction(data.merge?.sections ?? []),
        merge: data.merge,
        editorUrl: data.editorUrl,
        ...(branchPreview ? { branchPreview } : {}),
      });
    } else {
      output.stdout(parsed.dryRun ? `Previewed push to ${siteId}.` : `Pushed to ${siteId}.`);
      printMergeReport(output, data, parsed.dryRun);
      if (branchPreview?.reported) {
        output.stdout(`Branch preview for ${branchPreview.branch} is on the client's card.`);
      } else if (branchPreview) {
        // The content landed. Say what did not, and do not fail the push over
        // a card entry: re-pushing to fix it would re-import everything.
        output.stderr(`snabbsajt: the push landed, but the branch preview was not recorded: ${branchPreview.error}`);
      }
    }
    return 0;
  } catch (error) {
    // ConnectError/McpError are the expected shapes, but loadPackage throws the
    // site module's own CliError (not exported) — so any Error is reported as a
    // message here rather than a crash. Non-Errors stay a crash.
    if (error instanceof Error) {
      if (asJson) json(output, { ok: false, command: "push", error: error.message });
      else output.stderr(`snabbsajt: ${error.message}`);
      return 1;
    }
    throw error;
  }
}

function safeVersion(): string {
  try {
    return cliVersion();
  } catch {
    return "0.0.0";
  }
}

function usage(output: Output): void {
  output.stdout(`Usage:
  snabbsajt push <site.json|package-dir> [--site <websiteId>] [--dry-run]
                 [--force-key <externalKey>]... [--app-url <url>] [--json]
                 [--branch <name> --preview-url <https://...> [--preview-label <text>]]

push validates the package locally (same checks as \`site validate\`), then
merge-imports it into an EXISTING website draft through the same import_site
tool an AI assistant uses. Sections match by externalKey: new ones are added,
unedited matches are updated, and sections edited in the app are reported as
conflicts and kept — unless you name them with --force-key. Site config, theme
and fonts are never touched, a restore point is taken first, and nothing is
published.

--dry-run runs the whole merge server-side and rolls it back, printing what a
real push would do.

--branch reports the preview address your host built for that branch, so the
client's "Var är den live?" card lists it. It runs after the import, never
before, and a failure there does not fail the push: the content already landed.
It needs the settings:write scope, and only the agency that delivers the site
may call it.

Auth: ${ADMIN_TOKEN_ENV_VAR} (${ADMIN_TOKEN_PREFIX}…) from \`snabbsajt admin pair\`,
with the content:write scope. The read-only SNABBSAJT_DELIVERY_TOKEN that
\`pull\` uses is never accepted. The target site comes from --site or the
paired .snabbsajt-admin.json.`);
}

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { consoleOutput, type Output } from "../output";
import { ConnectError } from "./connect/deviceAuth";
import {
  ADMIN_TOKEN_ENV_VAR,
  ENV_FILE,
  readAdminConfig,
  readAdminToken,
} from "./admin/adminProject";
import { createMcpClient, type McpClient } from "./admin/mcpClient";

// ---------------------------------------------------------------------------
// `snabbsajt pull --format portable` — the client's page, back in the repo.
//
// Plan: docs/plans/doing/P0-2026-08-19-agency-program-master.md slice 2.5.
//
// The ordinary `pull` fetches the PUBLISHED snapshot, which is what a site
// renders. This fetches the DRAFT as `PortableSiteV1`, which is what a site is
// built FROM. The difference is the whole point: an agency pushes from its
// repository, the client adds a page in the editor, and without this the next
// push either loses that page or the agency stops pushing.
//
// It asks the server rather than converting a snapshot here. The app already
// exports this format for the owner's own download button, so a converter in
// the CLI would be a second definition of the format that drifts, and a drifted
// export is one that silently drops a client's page on the next push.
//
// It therefore needs the ADMIN token, not the delivery one: `export_site` is an
// MCP tool behind `site:read`. That is a read-only scope, and the tool changes
// nothing.
//
// One file per page, plus the site file. A single blob would make every pull a
// whole-repository diff, and the point of committing this is that a reviewer
// can see which page the client changed.
// ---------------------------------------------------------------------------

export const DEFAULT_PORTABLE_DIR = "snabbsajt/content";

type PortablePage = { slug?: string; [key: string]: unknown };
type PortableSite = { pages?: PortablePage[]; [key: string]: unknown };

/** A slug turned into a file name that is safe on every filesystem we support.
 *
 *  The home page has an empty slug, which is not a file name at all, so it
 *  becomes `index`. Everything else keeps its shape with the separators
 *  flattened: `tjanster/tandblekning` is one file, not a directory tree, so a
 *  page renamed into a folder does not leave an orphan behind. */
export function pageFileName(slug: string | undefined): string {
  const cleaned = (slug ?? "").replace(/[^a-z0-9/_-]/gi, "-").replace(/\/+/g, "__");
  return `${cleaned === "" ? "index" : cleaned}.json`;
}

/** Split one exported site into the files a repository commits. Pure, so the
 *  layout can be tested without a token or a network. */
export function portableFiles(
  site: PortableSite,
): { path: string; contents: string }[] {
  const pages = Array.isArray(site.pages) ? site.pages : [];
  const { pages: _pages, ...rest } = site;
  const files = [
    {
      path: "site.json",
      // The site WITHOUT its pages: fonts, theme, services, redirects. Keeping
      // the pages out of it means a page edit touches one file.
      contents: `${JSON.stringify({ ...rest, pages: [] }, null, 2)}\n`,
    },
  ];
  for (const page of pages) {
    files.push({
      path: join("pages", pageFileName(page.slug)),
      contents: `${JSON.stringify(page, null, 2)}\n`,
    });
  }
  return files;
}

export type PortablePullDeps = {
  client?: McpClient;
  cwd?: string;
};

export async function runPortablePull(
  args: string[],
  asJson: boolean,
  output: Output = consoleOutput,
  deps: PortablePullDeps = {},
): Promise<number> {
  const cwd = deps.cwd ?? process.cwd();
  const outIndex = args.indexOf("--out");
  const targetDir = resolve(
    cwd,
    (outIndex >= 0 ? args[outIndex + 1] : undefined) ?? DEFAULT_PORTABLE_DIR,
  );

  let client = deps.client;
  let siteId = "";
  if (!client) {
    const token = readAdminToken(cwd);
    if (!token) {
      throw new ConnectError(
        `--format portable reads the DRAFT, which needs the admin token. No ${ADMIN_TOKEN_ENV_VAR} in the environment or ${ENV_FILE}. Run \`snabbsajt admin pair\` first.`,
      );
    }
    const config = readAdminConfig(cwd);
    if (!config) {
      throw new ConnectError(
        "No .snabbsajt-admin.json in this directory. Run `snabbsajt admin pair` first.",
      );
    }
    siteId = config.siteId;
    client = createMcpClient({ appUrl: config.appUrl, token });
  }
  const siteIdIndex = args.indexOf("--site");
  if (siteIdIndex >= 0 && args[siteIdIndex + 1]) siteId = args[siteIdIndex + 1]!;
  if (!siteId) {
    throw new ConnectError("no site to export; pass --site <id> or pair this directory");
  }

  const result = await client.callTool("export_site", { websiteId: siteId });
  if (result.isError) {
    throw new ConnectError(result.text || "export_site reported an error.");
  }
  const site = (result.data as { site?: PortableSite } | undefined)?.site;
  if (!site) {
    throw new ConnectError("export_site returned no site; nothing was written.");
  }

  const files = portableFiles(site);
  mkdirSync(join(targetDir, "pages"), { recursive: true });
  for (const file of files) {
    writeFileSync(join(targetDir, file.path), file.contents, "utf8");
  }

  const pageCount = files.length - 1;
  if (asJson) {
    output.stdout(
      JSON.stringify({
        ok: true,
        command: "pull",
        format: "portable",
        siteId,
        pages: pageCount,
        directory: targetDir,
        files: files.map((file) => file.path),
      }),
    );
    return 0;
  }
  output.stdout(
    `Pulled ${pageCount} page${pageCount === 1 ? "" : "s"} as PortableSiteV1.`,
  );
  output.stdout(`Written to ${targetDir}. Commit it: this is the client's work.`);
  return 0;
}

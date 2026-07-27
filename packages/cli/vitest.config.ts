import { defineConfig } from "vitest/config";

// The CLI package deliberately has NO `@snabbsajt/site-kit` alias.
//
// The repo root aliases that specifier to `src/index.ts` so the starter
// template validates against local source. Without a config of its own this
// package inherited that alias, which broke every subpath import — `import …
// from "@snabbsajt/site-kit/local-files"` resolved to `src/index.ts/local-files`
// and the whole file failed to load with ENOTDIR. That took the entire CLI
// suite offline (and with it `npm test` at the root) from the commit that added
// the alias until this file existed.
//
// Resolving through the workspace link instead is also the more honest test:
// the CLI is a published package that consumes another published package, so it
// should exercise the same `exports` map its users get.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});

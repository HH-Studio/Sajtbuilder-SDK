import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // The starter template imports the SDK by its published name. In tests we
      // point that at local source so template fixtures validate against the
      // code in this repo, not the last published release.
      "@snabbsajt/site-kit": fileURLToPath(new URL("./src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
});

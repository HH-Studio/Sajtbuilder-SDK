import { cpSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { loadManifest } from "../src/skills/verify";

const packageRoot = resolve(import.meta.dirname, "..");
const source = resolve(packageRoot, "../../skills");
const target = resolve(packageRoot, "dist/skills");

loadManifest(source);
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });

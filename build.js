
import { build } from "esbuild";
import {
  mkdir,
  rm,
  copyFile
} from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = process.cwd();

const ENTRY = resolve(ROOT, "src/index.js");

const OUTPUT_DIR = resolve(ROOT, "dist");
const OUTPUT_FILE = resolve(OUTPUT_DIR, "main.js");
const OUTPUT_CSS = resolve(OUTPUT_DIR, "styles.css");

const SOURCE_CSS = resolve(
  ROOT,
  "src/ui/styles.css"
);

async function buildPlugin() {
  console.log("Building RouteLens...");

  await mkdir(OUTPUT_DIR, {
    recursive: true
  });

  await rm(OUTPUT_FILE, {
    force: true
  });

  try {
    await build({
      entryPoints: [ ENTRY ],
      outfile: OUTPUT_FILE,
      bundle: true,
      minify: true,
      platform: "browser",
      format: "iife",
      target: [ "es2020" ],
      charset: "utf8",
      legalComments: "none",
      sourcemap: false,
      treeShaking: true,
      external: [],
      logLevel: "info"
    });

    await copyFile(
      SOURCE_CSS,
      OUTPUT_CSS
    );

    console.log("");
    console.log(
      "RouteLens build completed successfully."
    );
    console.log(`JavaScript: ${OUTPUT_FILE}`);
    console.log(`Stylesheet: ${OUTPUT_CSS}`);
  } catch (error) {
    console.error("");
    console.error("RouteLens build failed.");
    console.error(error);

    process.exitCode = 1;
  }
}

buildPlugin();

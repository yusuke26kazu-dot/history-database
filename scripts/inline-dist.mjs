import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = resolve(root, "dist/index.html");

let html = await readFile(indexPath, "utf8");

html = await replaceAsset(
  html,
  /<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/,
  "style",
);
html = await replaceAsset(
  html,
  /<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/,
  "script",
);

await writeFile(indexPath, html);

async function replaceAsset(source, pattern, tagName) {
  const match = source.match(pattern);
  if (!match) return source;

  const assetPath = resolve(root, "dist", match[1]);
  const asset = await readFile(assetPath, "utf8");
  const replacement =
    tagName === "style"
      ? `<style>\n${asset}\n</style>`
      : `<script type="module">\n${asset}\n</script>`;

  return source.replace(match[0], () => replacement);
}

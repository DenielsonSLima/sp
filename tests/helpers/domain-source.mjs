import { readFile, readdir } from "node:fs/promises";
import { transform } from "esbuild";

/** Structural checks follow domain splits without depending on source formatting. */
async function readDomainFiles(folder, extension) {
  const files = [];
  async function visit(base) {
    for (const entry of await readdir(base, { withFileTypes: true })) {
      const child = new URL(entry.name + (entry.isDirectory() ? "/" : ""), base);
      if (entry.isDirectory()) await visit(child);
      else if (entry.name.endsWith(extension)) files.push(child);
    }
  }
  await visit(new URL(`../../${folder}/`, import.meta.url));
  return (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
}
export const readDomainSource = async (folder) => sourceContract(await readDomainFiles(folder, ".js"));
export async function readDomainStyles(folder) {
  const source = await readDomainFiles(folder, ".css");
  const compact = await transform(source, { loader: "css", minifyWhitespace: true });
  return sourceContract(source) + "\n" + compact.code;
}
export async function readModuleSource(file) {
  return sourceContract(await readFile(new URL(`../../${file}`, import.meta.url), "utf8"));
}
/** Follow local imports in cascade order; resolve assets from their owning stylesheet. */
export async function readStylesheet(file) {
  const resources = [];
  async function expand(url, ancestors = []) {
    if (ancestors.includes(url.href)) throw new Error(`Circular stylesheet import: ${url.href}`);
    const raw = await readFile(url, "utf8");
    const imports = /@import\s+['"]([^'"]+)['"]\s*;/g;
    let source = "",
      cursor = 0;
    function rebase(fragment) {
      return fragment.replace(/url\(\s*(['"]?)([^'"\s)]+)\1\s*\)/g, (match, quote, target) => {
        if (/^(?:[a-z]+:|\/\/|#)/i.test(target)) return match;
        const resolved = new URL(target, url).href;
        resources.push(resolved);
        return `url("${resolved}")`;
      });
    }
    for (const match of raw.matchAll(imports)) {
      source += rebase(raw.slice(cursor, match.index));
      source += await expand(new URL(match[1], url), [...ancestors, url.href]);
      cursor = match.index + match[0].length;
    }
    return source + rebase(raw.slice(cursor));
  }
  const source = await expand(new URL(`../../${file}`, import.meta.url));
  return { source, resources };
}
export async function readModuleStyles(file) {
  const { source } = await readStylesheet(file);
  const compact = await transform(source, { loader: "css", minifyWhitespace: true });
  return sourceContract(source) + "\n" + compact.code;
}
function sourceContract(source) {
  const collapsed = source.replace(/\s+/g, " ");
  const compact = source.replace(/\s*([=,;(){}\[\]:<>!+|&?.])\s*/g, "$1");
  return [source, collapsed, collapsed.replaceAll('"', "'"), compact, compact.replaceAll('"', "'")].join("\n");
}

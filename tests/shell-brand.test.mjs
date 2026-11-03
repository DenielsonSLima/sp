import { readModuleStyles, readStylesheet } from "./helpers/domain-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const luminance = (hex) => {
  const rgb = hex
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const contrast = (a, b) => {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
test("branded navigation foregrounds meet normal-text contrast", () => {
  for (const [fg, bg] of [
    ["#fff2f2", "#d52b32"],
    ["#f5c9cc", "#a6111d"],
    ["#531019", "#ffe04a"],
    ["#ffe66e", "#890e19"],
    ["#551621", "#fffdf9"],
    ["#806c70", "#fffdf9"],
  ])
    assert(contrast(fg, bg) >= 4.5, `${fg} on ${bg}: ${contrast(fg, bg)}`);
});
test("branded shell retains mobile drawer accessibility and original logo", async () => {
  const js = await readFile(new URL("../interno/shell.js", import.meta.url), "utf8"),
    css = await readModuleStyles("interno/shell.css");
  for (const value of ["aria-expanded", "aria-modal", "Escape", "setDrawer", "confirmLogout", "${logo()}"])
    assert(js.includes(value));
  assert(!js.includes("nav-new"));
  for (const value of [
    "visibility:hidden",
    "position:sticky",
    "min-height:48px",
    "focus-visible",
    "prefers-reduced-motion",
    "top:72px",
  ])
    assert(css.includes(value));
});

test("sidebar keeps direct-on-red navigation with subtle decorative graphics", async () => {
  const css = await readModuleStyles("interno/shell.css");
  const { resources } = await readStylesheet("interno/shell.css");
  assert(resources.includes(new URL("../assets/sidebar-brand-art.svg", import.meta.url).href));
  assert(!css.includes(".sidebar nav{background:#fffaf6"));
});
test("decorative sidebar SVG stays local, noninteractive and preserves readable navigation zone", async () => {
  const svg = await readFile(new URL("../assets/sidebar-brand-art.svg", import.meta.url), "utf8");
  assert(!/<script|<foreignObject|href=|onload=/i.test(svg));
  assert(svg.includes('id="groceries"'));
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  let native;
  try {
    native = require("@napi-rs/canvas");
  } catch {
    return;
  }
  const canvas = native.createCanvas(320, 1080),
    ctx = canvas.getContext("2d");
  ctx.drawImage(await native.loadImage(Buffer.from(svg)), 0, 0);
  for (let y = 220; y < 850; y += 35)
    for (let x = 35; x < 270; x += 25) {
      const p = ctx.getImageData(x, y, 1, 1).data;
      const bg =
        "#" +
        [...p]
          .slice(0, 3)
          .map((n) => n.toString(16).padStart(2, "0"))
          .join("");
      assert(contrast("#fff2f2", bg) >= 4.5, `${x},${y}: ${bg}`);
    }
});

test("sidebar logo is ten percent smaller within the same plaque without duplicate slogan", async () => {
  const js = await readFile(new URL("../interno/shell.js", import.meta.url), "utf8"),
    css = await readModuleStyles("interno/shell.css");
  assert(!js.includes("ONDE O POVO FAZ ECONOMIA"));
  assert.match(css, /\.sidebar>\.brand-logo img\{transform:scale\(0?\.9\)/);
  assert(css.includes("width:195px;height:90px"));
});

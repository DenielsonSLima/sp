import test from "node:test";
import assert from "node:assert/strict";
import { readStylesheet } from "./helpers/domain-source.mjs";
import { transform } from "esbuild";
test("compact desktop spacing preserves mobile touch targets and label styling", async () => {
  const { source } = await readStylesheet("interno/shell.css");
  const section = source.split("/* Slightly denser module rhythm;")[1];
  assert(section, "desktop density rules remain present");
  const css = (
    await transform("/* Slightly denser module rhythm;" + section, { loader: "css", minifyWhitespace: true })
  ).code;
  assert.match(css, /min-height:36px/);
  assert.match(css, /@media\(max-width:760px\).*min-height:44px/);
  assert.match(css, /margin-top:2px/);
  assert.match(css, /padding-top:7\.29px/);
  assert.doesNotMatch(css, /font-size|background|brand-logo|[;{]width:/);
});

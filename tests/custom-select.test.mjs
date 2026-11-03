import test from "node:test";
import assert from "node:assert/strict";
import { readModuleSource, readModuleStyles } from "./helpers/domain-source.mjs";
import { enhanceSelect, installCustomSelects } from "../shared/components/custom-select/index.js";
const source = await readModuleSource("shared/components/custom-select/index.js");
const styles = await readModuleStyles("shared/components/custom-select/styles.css");
test("custom select module imports safely without a browser and exports reusable APIs", () => {
  assert.equal(typeof enhanceSelect, "function");
  assert.equal(typeof installCustomSelects, "function");
});
test("custom select contract avoids HTML injection and global prototype mutation", () => {
  assert.doesNotMatch(source, /\.innerHTML\s*=|insertAdjacentHTML|Object\.defineProperty\(HTML\w+\.prototype/);
  assert.match(source, /node\.textContent = text/);
  assert.match(source, /select\.hidden = true/);
  assert.match(styles, /select\.custom-select-native\{display:none!important\}/);
});
test("custom select contract provides focus, form and lifecycle behavior", () => {
  for (const feature of [
    "aria-activedescendant",
    "aria-expanded",
    "aria-selected",
    "aria-required",
    "aria-invalid",
    "MutationObserver",
    "visualViewport",
    "'selectedIndex'",
    "'selected'",
    "'invalid'",
    "'reset'",
    "listeners.abort()",
    "popup.remove()",
  ])
    assert(source.includes(feature), feature);
  assert.match(source, /new Event\('input',\s*\{\s*bubbles:\s*true\s*\}\)/);
  assert.match(source, /new Event\('change',\s*\{\s*bubbles:\s*true\s*\}\)/);
  assert.match(styles, /min-height:44px/);
  assert.match(styles, /@media\(max-width:600px\)/);
});
test("select popups stay within a modal dialog to avoid inert ancestors", async () => {
  const src = await readModuleSource("shared/components/custom-select/index.js");
  assert.match(src, /select\.closest\('dialog'\) \|\| document\.body/);
});

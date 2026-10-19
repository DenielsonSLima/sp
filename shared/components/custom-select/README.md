# System selects

Import `installCustomSelects` from this directory's `index.js` in the app entry,
load `styles.css`, and call `installCustomSelects(app)` once before rendering.
Keep writing standard, labelled `<select>` / `<option>` markup in feature modules.
Every present and subsequently inserted select receives the same component.
Do not implement feature-specific native dropdowns.

The hidden original select retains its name, values, FormData integration,
constraint validation, form reset, and bubbling `input` / `change` events.
Assignments to `select.value`, `select.selectedIndex`, and `option.selected`
refresh immediately. Mutation observers cover option updates and disabled states.
The returned manager exposes `refresh()` for explicit refreshes and `destroy()`
for teardown. `enhanceSelect(select)` also exposes `open()` and `close()`.

Controls support disabled options/groups, multiple selection, Arrow Up/Down,
Home/End, Enter/Space, Escape, Tab, accent-insensitive typeahead and search.
Search appears for eight or more options, or for `data-searchable="true"`.
Mobile presents a system-styled bottom sheet with a close control. This is a
non-modal listbox: outside click and leaving focus close it. Desktop positioning
tracks viewport changes and scrolling. Modern browsers use the Popover API's
unclipped top layer; others use a fixed-position HTML panel. Neither uses native
select popup UI. All option content is inserted as text, never interpreted HTML.

Tests: `node --test tests/custom-select.browser.mjs` (Playwright plus Chromium).
The browser suite covers required validation, keyboard selection, disabled items,
FormData, change events, programmatic values, reset, dynamic options, HTML safety,
search, no-results, responsive bounds, focus restoration and route teardown.
Run this in an environment permitted to launch Chromium. The component itself
has no external dependencies. The project’s default tests remain browser-free.

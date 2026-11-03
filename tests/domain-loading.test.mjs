import test from "node:test";
import assert from "node:assert/strict";
import { createSettingsStore } from "../interno/configuracoes/store.js";
import { createHomeRefresh } from "../interno/inicio/hooks/use-home-refresh.js";
import { createDraftAutosave } from "../interno/tabela-precos/hooks/use-draft-autosave.js";
import { projectCampaigns } from "../interno/calendario/model.js";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("settings loads requested resources only and shares overlapping in-flight profile reads", async () => {
  const calls = [],
    waiting = deferred();
  const store = createSettingsStore({
    scope: () => "company:user",
    read: async (resource) => {
      calls.push(resource);
      if (resource === "profiles") await waiting.promise;
      return resource === "company_settings" ? [{ id: "default", name: "Loja", _version: 2 }] : [];
    },
  });
  await store.loadSettings(["company"]);
  assert.deepEqual(calls, ["company_settings"]);
  const users = store.loadSettings(["users", "profiles"]),
    profiles = store.loadSettings(["profiles"]);
  assert.equal(calls.filter((resource) => resource === "profiles").length, 1);
  waiting.resolve();
  await Promise.all([users, profiles]);
  assert.deepEqual(calls, ["company_settings", "user_access", "profiles"]);
  assert.deepEqual(store.settings.watermark, {});
});

test("settings rejects late reads and writes after context reset instead of filling the next company", async () => {
  let scope = "company-a:user";
  const read = deferred(),
    write = deferred();
  const store = createSettingsStore({ scope: () => scope, read: () => read.promise, write: () => write.promise });
  const loading = store.loadSettings(["company"]);
  scope = "company-b:user";
  store.reset();
  read.resolve([{ id: "default", name: "Antiga" }]);
  await assert.rejects(loading, /sessão ou empresa/);
  assert.deepEqual(store.settings.company, {});
  const saving = store.saveCompany({ name: "Antiga", _version: 1 });
  scope = "company-c:user";
  store.reset();
  write.resolve({ id: "default", name: "Antiga", _version: 2 });
  await assert.rejects(saving, /sessão ou empresa/);
  assert.deepEqual(store.settings.company, {});
});

test("summary resource bursts share a request and refresh once more if data changes while reading", async () => {
  const first = deferred(),
    values = [];
  let reads = 0;
  const refresh = createHomeRefresh(
    () => (++reads === 1 ? first.promise : Promise.resolve(reads)),
    (value) => values.push(value),
  );
  const a = refresh(),
    b = refresh();
  assert.equal(a, b);
  await tick();
  assert.equal(reads, 1);
  const c = refresh();
  assert.equal(a, c);
  first.resolve(1);
  await a;
  assert.deepEqual(values, [1, 2]);
  assert.equal(reads, 2);
});

test("summary ignores detached results and allows retry after a failed read", async () => {
  const waiting = deferred(),
    applied = [];
  let current = true;
  const refresh = createHomeRefresh(
    () => waiting.promise,
    (value) => applied.push(value),
    () => current,
  );
  const request = refresh();
  await tick();
  current = false;
  waiting.resolve(3);
  await request;
  assert.deepEqual(applied, []);
  let fails = true;
  const retry = createHomeRefresh(
    async () => {
      if (fails) throw Error("Offline");
      return 4;
    },
    (value) => applied.push(value),
  );
  await assert.rejects(retry, /Offline/);
  fails = false;
  await retry();
  assert.deepEqual(applied, [4]);
});

function timers() {
  let sequence = 0;
  const jobs = new Map();
  return {
    setTimer: (fn) => {
      jobs.set(++sequence, fn);
      return sequence;
    },
    clearTimer: (id) => jobs.delete(id),
    run() {
      const callbacks = [...jobs.values()];
      jobs.clear();
      callbacks.forEach((fn) => fn());
    },
    get size() {
      return jobs.size;
    },
  };
}

test("draft typing is debounced and explicit flush saves the latest values without waiting for the timer", async () => {
  const clock = timers(),
    writes = [],
    notifications = [];
  const autosave = createDraftAutosave(
    async (input) => {
      writes.push(input);
      return { id: "draft" };
    },
    { ...clock, onSaved: (saved) => notifications.push(saved.id) },
  );
  autosave.schedule({ price: "0,04" });
  autosave.schedule({ price: "0,49" });
  autosave.schedule({ price: "4,99" });
  assert.equal(writes.length, 0);
  assert.equal(clock.size, 1);
  await autosave.flush();
  assert.deepEqual(writes, [{ price: "4,99" }]);
  assert.deepEqual(notifications, ["draft"]);
  assert.equal(clock.size, 0);
});

test("draft saves remain serial and an older result cannot clear a newer unsaved edit", async () => {
  const clock = timers(),
    first = deferred(),
    writes = [],
    notifications = [];
  const autosave = createDraftAutosave(
    async (input) => {
      writes.push(input);
      if (writes.length === 1) await first.promise;
      return input;
    },
    { ...clock, onSaved: (saved) => notifications.push(saved.price) },
  );
  autosave.schedule({ price: "1,00" });
  const a = autosave.flush();
  await tick();
  autosave.schedule({ price: "2,00" });
  const b = autosave.flush();
  await tick();
  assert.equal(writes.length, 1);
  first.resolve();
  await Promise.all([a, b]);
  assert.deepEqual(writes, [{ price: "1,00" }, { price: "2,00" }]);
  assert.deepEqual(notifications, ["2,00"]);
});

test("calendar projects only real valid campaign identifiers without touching their documents", () => {
  const campaigns = [
      { id: "campaign-1", name: "Ofertas", start: "2026-11-01", end: "2026-11-07", notes: "" },
      { id: "../invalid", start: "2026-11-01", end: "2026-11-07" },
    ],
    before = structuredClone(campaigns);
  assert.equal(projectCampaigns(campaigns).length, 1);
  assert.equal(projectCampaigns(campaigns)[0].href, "#promocoes/campaign-1");
  assert.deepEqual(campaigns, before);
});

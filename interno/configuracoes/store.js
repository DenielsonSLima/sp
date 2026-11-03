import { readSettingRecords, writeSettingRecord, settingsScope } from "./services.js";

export const settingResources = {
  company: "company_settings",
  users: "user_access",
  profiles: "profiles",
  watermark: "watermarks",
  header: "headers",
};
const singletons = new Set(["company", "watermark", "header"]);

export function createSettingsStore({
  read = readSettingRecords,
  write = writeSettingRecord,
  scope = settingsScope,
} = {}) {
  const settings = { company: {}, users: [], profiles: [], watermark: {}, header: {} };
  const pending = new Map();
  let revision = 0;
  const reset = () => {
    revision++;
    pending.clear();
    Object.assign(settings, { company: {}, users: [], profiles: [], watermark: {}, header: {} });
  };
  const current = (requestRevision, requestScope) => revision === requestRevision && scope() === requestScope;
  const readKey = (key) => {
    if (!Object.hasOwn(settingResources, key)) throw Error("Configuração desconhecida.");
    if (pending.has(key)) return pending.get(key);
    const requestRevision = revision,
      requestScope = scope();
    const request = read(settingResources[key])
      .then((rows) => {
        if (!current(requestRevision, requestScope))
          throw Error("A sessão ou empresa ativa mudou. Reabra a configuração.");
        if (singletons.has(key) && !rows[0])
          throw Error(
            "As configurações iniciais ainda não estão cadastradas no banco da empresa. Solicite a inicialização ao administrador.",
          );
        settings[key] = singletons.has(key) ? rows[0] : rows;
        return settings[key];
      })
      .finally(() => {
        if (pending.get(key) === request) pending.delete(key);
      });
    pending.set(key, request);
    return request;
  };
  const writeScoped = async (...args) => {
    const requestRevision = revision,
      requestScope = scope();
    const saved = await write(...args);
    if (!current(requestRevision, requestScope)) throw Error("A sessão ou empresa ativa mudou. Reabra a configuração.");
    return saved;
  };
  const singleton = async (resource, key, input) => {
    const saved = await writeScoped(
      resource,
      { ...settings[key], ...input, id: "default" },
      { expectedVersion: input._version ?? settings[key]._version },
    );
    Object.assign(settings[key], saved);
    return saved;
  };
  const upsert = (key, saved) => {
    const index = settings[key].findIndex((row) => row.id === saved.id);
    if (index < 0) settings[key].push(saved);
    else settings[key][index] = saved;
    return saved;
  };
  return {
    settings,
    reset,
    async loadSettings(keys = Object.keys(settingResources)) {
      await Promise.all(keys.map(readKey));
      return settings;
    },
    saveCompany: (input) => singleton("company_settings", "company", input),
    saveWatermark: (input) => singleton("watermarks", "watermark", input),
    saveHeader: (input) => singleton("headers", "header", input),
    async addUser(input) {
      return upsert("users", await writeScoped("user_access", input));
    },
    async addProfile(name) {
      return upsert("profiles", await writeScoped("profiles", { name, modules: [] }));
    },
    async updateUser(user, changes) {
      return upsert(
        "users",
        await writeScoped("user_access", { ...user, ...changes }, { expectedVersion: user._version }),
      );
    },
    async updateProfile(profile, changes) {
      return upsert(
        "profiles",
        await writeScoped("profiles", { ...profile, ...changes }, { expectedVersion: profile._version }),
      );
    },
  };
}
export const settingsStore = createSettingsStore();

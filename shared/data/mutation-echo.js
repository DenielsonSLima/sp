/** Match only a specific successful local command. Other tabs/users always invalidate. */
export function createMutationEcho({ onUncertainChange }) {
  const commands = new Map();
  function begin(resource) {
    const id = globalThis.crypto.randomUUID();
    commands.set(id, { resource, pending: true, observed: false });
    return id;
  }
  function finish(id, succeeded) {
    const command = commands.get(id);
    if (!command) return;
    if (succeeded) command.pending = false;
    else {
      commands.delete(id);
      if (command.observed) void onUncertainChange(command.resource);
    }
    // Forgetting an old acknowledgement only permits an extra refresh; never hides a foreign event.
    if (commands.size > 512) {
      for (const [key, entry] of commands) {
        if (!entry.pending) commands.delete(key);
        if (commands.size <= 256) break;
      }
    }
  }
  function handles(resource, id) {
    const command = commands.get(id);
    if (!command || command.resource !== resource) return false;
    command.observed = true;
    return true;
  }
  return { begin, finish, handles, clear: () => commands.clear() };
}

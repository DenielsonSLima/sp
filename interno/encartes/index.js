import { renderWorkspace } from './workspace/index.js';
import { renderModels } from './modelos/index.js';
import { readFlyerSection } from './navigation.js';

export function render(root) {
  const tab = readFlyerSection(location.hash);
  return ['ready', 'mine'].includes(tab)
    ? renderModels(root, { tab })
    : renderWorkspace(root, { tab });
}

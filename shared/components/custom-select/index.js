/** System-styled select enhancement. Native controls remain the form/validation source
 * of truth but are never exposed to pointer, keyboard or accessibility interaction. */
let sequence = 0;
const instances = new WeakMap();
const fold = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const element = (tag, className, text) => { const node = document.createElement(tag); node.className = className; if (text != null) node.textContent = text; return node; };

export function enhanceSelect(select) {
  if (instances.has(select)) return instances.get(select);
  const id = `custom-select-${++sequence}`;
  const optionDescriptors = new Map();
  const original = {hidden: select.hidden, tabindex: select.getAttribute('tabindex'), ariaHidden: select.getAttribute('aria-hidden')};
  const wrapper = element('span', 'custom-select');
  const trigger = element('button', 'custom-select-trigger');
  trigger.type = 'button'; trigger.id = `${id}-trigger`;
  trigger.setAttribute('role', 'combobox'); trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', `${id}-list`);
  const value = element('span', 'custom-select-value');
  const chevron = element('span', 'custom-select-chevron', '⌄'); chevron.setAttribute('aria-hidden', 'true');
  trigger.append(value, chevron);
  const error = element('span', 'custom-select-error'); error.id = `${id}-error`; error.hidden = true;
  const popup = element('div', 'custom-select-popup'); popup.hidden = true; popup.setAttribute('popover', 'manual');
  const header = element('div', 'custom-select-header');
  const title = element('span', 'custom-select-title');
  const closeButton = element('button', 'custom-select-close', 'Fechar'); closeButton.type = 'button';
  header.append(title, closeButton);
  const search = element('input', 'custom-select-search'); search.type = 'search'; search.placeholder = 'Buscar opção…'; search.setAttribute('aria-label', 'Buscar opção'); search.autocomplete = 'off';
  search.setAttribute('role', 'combobox'); search.setAttribute('aria-autocomplete', 'list'); search.setAttribute('aria-controls', `${id}-list`); search.setAttribute('aria-expanded', 'true');
  const list = element('div', 'custom-select-options'); list.id = `${id}-list`; list.setAttribute('role', 'listbox');
  const empty = element('p', 'custom-select-empty', 'Nenhuma opção encontrada.'); empty.setAttribute('role', 'status'); empty.hidden = true;
  popup.append(header, search, list, empty);
  let opened = false, active = -1, rows = [], typeahead = '', typeTimer, destroyed = false;
  const listeners = new AbortController(); const signal = listeners.signal;
  const labelText = () => select.getAttribute('aria-label') || [...select.labels || []].map(label => { const copy = label.cloneNode(true); copy.querySelectorAll('select,.custom-select,input,button').forEach(node => node.remove()); return copy.textContent.trim(); }).join(' ') || select.name || 'Selecionar opção';
  const name = labelText(); trigger.setAttribute('aria-label', name); title.textContent = name; list.setAttribute('aria-label', name);
  if (select.hasAttribute('aria-labelledby')) trigger.setAttribute('aria-labelledby', select.getAttribute('aria-labelledby'));
  select.before(wrapper); wrapper.append(trigger, error); select.hidden = true; select.tabIndex = -1; select.setAttribute('aria-hidden', 'true'); select.classList.add('custom-select-native');
  // Stay outside wrapping labels: options must not activate the label's native control.
  (select.closest('dialog') || document.body).append(popup);
  const disabled = option => option.disabled || option.parentElement?.tagName === 'OPTGROUP' && option.parentElement.disabled;
  const enabledRows = () => rows.filter(row => !row.option.hidden && !disabled(row.option));
  function setActive(index, scroll = true) {
    active = index;
    for (const row of rows) row.node.classList.toggle('is-active', row.index === active);
    const current = rows.find(row => row.index === active);
    for (const control of [trigger, search]) { if (current) control.setAttribute('aria-activedescendant', current.node.id); else control.removeAttribute('aria-activedescendant'); }
    if (scroll && current) current.node.scrollIntoView({block: 'nearest'});
  }
  function renderOptions() {
    const query = fold(search.value.trim()); list.replaceChildren(); rows = [];
    let lastGroup;
    [...select.options].forEach((option, index) => {
      if (option.hidden || query && !fold(option.label).includes(query)) return;
      const group = option.parentElement.tagName === 'OPTGROUP' ? option.parentElement.label : '';
      if (group && group !== lastGroup) { const heading = element('div', 'custom-select-group', group); heading.setAttribute('role', 'presentation'); list.append(heading); }
      lastGroup = group;
      const node = element('div', 'custom-select-option', option.label); node.id = `${id}-option-${index}`; node.setAttribute('role', 'option'); node.setAttribute('aria-selected', String(option.selected)); node.setAttribute('aria-disabled', String(disabled(option)));
      node.addEventListener('pointerdown', event => event.preventDefault());
      node.addEventListener('click', () => choose(index)); list.append(node); rows.push({node, option, index});
    });
    list.setAttribute('aria-multiselectable', String(select.multiple)); empty.hidden = rows.length > 0;
    const options = enabledRows(); setActive(options.some(row => row.index === active) ? active : (options.find(row => row.option.selected) || options[0])?.index ?? -1, false);
  }
  function sync() {
    if (destroyed) return;
    // selected is a property, not an observed HTML attribute. Keep programmatic
    // option selections in step with the trigger as well as select.value.
    for (const [option, previous] of optionDescriptors) {
      if (!select.contains(option)) { if (previous) Object.defineProperty(option, 'selected', previous); else delete option.selected; optionDescriptors.delete(option); }
    }
    for (const option of select.options) {
      if (optionDescriptors.has(option)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(HTMLOptionElement.prototype, 'selected');
      optionDescriptors.set(option, Object.getOwnPropertyDescriptor(option, 'selected'));
      Object.defineProperty(option, 'selected', {configurable: true, get() { return descriptor.get.call(this); }, set(next) { descriptor.set.call(this, next); sync(); }});
    }
    value.textContent = [...select.selectedOptions].map(option => option.label).join(', ') || 'Selecione uma opção';
    trigger.disabled = select.matches(':disabled'); trigger.setAttribute('aria-required', String(select.required));
    const describedBy = [select.getAttribute('aria-describedby'), !error.hidden && error.id].filter(Boolean).join(' ');
    if (describedBy) trigger.setAttribute('aria-describedby', describedBy); else trigger.removeAttribute('aria-describedby');
    if (select.validity.valid) { error.hidden = true; trigger.removeAttribute('aria-invalid'); }
    if (opened && trigger.disabled) close(false);
    if (opened) { renderOptions(); position(); }
  }
  function position() {
    if (!opened) return;
    const viewport = window.visualViewport;
    const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
    const offsetTop = viewport?.offsetTop || 0, offsetLeft = viewport?.offsetLeft || 0;
    if (width <= 600) { popup.style.left = `${offsetLeft + 8}px`; popup.style.top = 'auto'; popup.style.bottom = `${Math.max(0, innerHeight - height - offsetTop) + 8}px`; popup.style.width = `${width - 16}px`; popup.style.maxHeight = `${Math.max(120, height - 24)}px`; return; }
    const rect = trigger.getBoundingClientRect();
    const w = Math.min(Math.max(rect.width, 260), width - 16);
    const below = offsetTop + height - rect.bottom - 12, above = rect.top - offsetTop - 12;
    const upwards = below < 240 && above > below;
    const max = Math.min(380, Math.max(100, upwards ? above : below));
    popup.style.width = `${w}px`; popup.style.maxHeight = `${max}px`; popup.style.bottom = 'auto';
    popup.style.left = `${Math.max(offsetLeft + 8, Math.min(rect.left, offsetLeft + width - w - 8))}px`;
    popup.style.top = `${upwards ? Math.max(offsetTop + 8, rect.top - Math.min(popup.scrollHeight, max) - 6) : rect.bottom + 6}px`;
  }
  function open() {
    sync(); if (trigger.disabled || opened) return;
    document.dispatchEvent(new CustomEvent('custom-select:opening', {detail: trigger}));
    opened = true; active = -1; search.value = ''; search.hidden = select.options.length < 8 && select.dataset.searchable !== 'true';
    popup.hidden = false; trigger.setAttribute('aria-expanded', 'true'); renderOptions();
    if (popup.showPopover) popup.showPopover(); position();
    (search.hidden ? trigger : search).focus(); setActive(active);
  }
  function close(restore = true) {
    if (!opened) return; opened = false;
    if (popup.hidePopover && popup.matches(':popover-open')) popup.hidePopover();
    popup.hidden = true; trigger.setAttribute('aria-expanded', 'false'); trigger.removeAttribute('aria-activedescendant');
    if (restore && trigger.isConnected && !trigger.disabled) trigger.focus();
  }
  function choose(index) {
    const option = select.options[index]; if (!option || disabled(option)) return;
    if (select.multiple) option.selected = !option.selected; else select.selectedIndex = index;
    select.dispatchEvent(new Event('input', {bubbles: true})); select.dispatchEvent(new Event('change', {bubbles: true}));
    sync(); if (!select.multiple) close();
  }
  function keydown(event) {
    const key = event.key;
    if (key === 'Escape' && opened) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (key === 'Tab') { close(false); if (event.target === search || event.target === closeButton) trigger.focus(); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
      if (event.target === search && ['Home', 'End'].includes(key)) return;
      event.preventDefault(); const wasOpen = opened; if (!opened) open(); const options = enabledRows(); if (!options.length) return;
      let i = options.findIndex(row => row.index === active);
      if (key === 'Home') i = 0; else if (key === 'End') i = options.length - 1; else if (wasOpen) i = (i + (key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      setActive(options[Math.max(0, i)].index); return;
    }
    if ((key === 'Enter' || key === ' ' && event.target !== search) && event.target !== closeButton) { event.preventDefault(); if (!opened) open(); else choose(active); return; }
    if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.target === trigger) {
      event.preventDefault(); if (!opened) open(); clearTimeout(typeTimer); typeahead += fold(key); typeTimer = setTimeout(() => { typeahead = ''; }, 700);
      const found = enabledRows().find(row => fold(row.option.label).startsWith(typeahead)); if (found) setActive(found.index);
    }
  }
  trigger.addEventListener('click', () => opened ? close() : open(), {signal});
  trigger.addEventListener('keydown', keydown, {signal}); popup.addEventListener('keydown', keydown, {signal});
  closeButton.addEventListener('click', () => close(), {signal});
  search.addEventListener('input', () => { active = -1; renderOptions(); position(); }, {signal});
  document.addEventListener('pointerdown', event => { if (opened && !wrapper.contains(event.target) && !popup.contains(event.target)) close(false); }, {signal});
  document.addEventListener('focusin', event => { if (opened && !wrapper.contains(event.target) && !popup.contains(event.target)) close(false); }, {signal});
  document.addEventListener('custom-select:opening', event => { if (event.detail !== trigger) close(false); }, {signal});
  select.addEventListener('input', sync, {signal}); select.addEventListener('change', sync, {signal});
  select.addEventListener('invalid', event => { event.preventDefault(); error.textContent = select.validationMessage || 'Selecione uma opção.'; error.hidden = false; trigger.setAttribute('aria-invalid', 'true'); trigger.setAttribute('aria-describedby', [select.getAttribute('aria-describedby'), error.id].filter(Boolean).join(' ')); trigger.focus(); }, {signal});
  select.addEventListener('focus', () => trigger.focus(), {signal});
  // Intercept programmatic value changes without modifying any global prototypes.
  const ownDescriptors = new Map();
  for (const property of ['value', 'selectedIndex']) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, property);
    ownDescriptors.set(property, Object.getOwnPropertyDescriptor(select, property));
    Object.defineProperty(select, property, {configurable: true, get() { return descriptor.get.call(this); }, set(next) { descriptor.set.call(this, next); sync(); }});
  }
  const observer = new MutationObserver(sync); observer.observe(select, {subtree: true, childList: true, characterData: true, attributes: true});
  const reset = event => { if (event.target === select.form) setTimeout(sync, 0); }; document.addEventListener('reset', reset, {signal});
  window.addEventListener('resize', position, {signal}); window.addEventListener('scroll', position, {capture: true, signal});
  window.visualViewport?.addEventListener('resize', position, {signal}); window.visualViewport?.addEventListener('scroll', position, {signal});
  const api = {refresh: sync, open, close, destroy() {
    if (destroyed) return; close(false); destroyed = true; observer.disconnect(); listeners.abort(); clearTimeout(typeTimer); popup.remove(); wrapper.remove();
    select.hidden = original.hidden; select.classList.remove('custom-select-native');
    for (const [attribute, previous] of [['tabindex', original.tabindex], ['aria-hidden', original.ariaHidden]]) { if (previous == null) select.removeAttribute(attribute); else select.setAttribute(attribute, previous); }
    for (const [property, descriptor] of ownDescriptors) { if (descriptor) Object.defineProperty(select, property, descriptor); else delete select[property]; }
    for (const [option, previous] of optionDescriptors) { if (previous) Object.defineProperty(option, 'selected', previous); else delete option.selected; }
    optionDescriptors.clear(); instances.delete(select);
  }};
  instances.set(select, api); sync(); return api;
}

/** Install once at app bootstrap, before the first render. Handles new routes/forms. */
export function installCustomSelects(root = document.body) {
  const tracked = new Map(); let queued = false, stopped = false;
  function refresh() {
    if (stopped) return;
    queued = false;
    for (const [select, api] of tracked) { if (!root.contains(select)) { api.destroy(); tracked.delete(select); } }
    for (const select of root.querySelectorAll('select')) {
      if (!tracked.has(select)) tracked.set(select, enhanceSelect(select));
    }
    for (const api of tracked.values()) api.refresh();
  }
  const observer = new MutationObserver(records => {
    if (!records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && (node.matches?.('select') || node.querySelector?.('select'))) || record.type === 'attributes' && record.target.tagName === 'FIELDSET')) return;
    if (!queued) { queued = true; queueMicrotask(refresh); }
  });
  observer.observe(root, {childList: true, subtree: true, attributes: true, attributeFilter: ['disabled']}); refresh();
  return {refresh, destroy() { stopped = true; observer.disconnect(); for (const api of tracked.values()) api.destroy(); tracked.clear(); }};
}

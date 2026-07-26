const DATABASE_URL = '/data/himnario.db.json';
const $ = id => document.getElementById(id);

const elements = {
  collection: $('collection-select'), search: $('hymn-search'), dropdown: $('hymn-dropdown'), mode: $('sequence-mode'),
  previous: $('prev-line'), next: $('next-line'), visibility: $('visibility-toggle'), counter: $('line-counter'),
  meta: $('selection-meta'), title: $('selected-hymn-title'), section: $('selected-hymn-section'),
  previewCurrent: $('preview-current'), previewNext: $('preview-next'), currentType: $('current-type'),
  databaseStatus: $('database-status'), themeList: $('theme-list'),
  settingsButton: $('settings-button'), settingsDrawer: $('settings-drawer'), settingsClose: $('settings-close'),
  settingsScrim: $('settings-scrim'), reset: $('reset-theme-settings')
};

let collections = [];
let database = null;
let hymnsById = new Map();
let masterSectionsById = new Map();
let sectionsById = new Map();
let searchResults = [];
let selectedHymn = null;
let sequence = [];
let currentIndex = 0;
let isVisible = false;
let selectedThemeId = 'classic';
let themeSettings = { ...window.BibleThemeDefaults };
let searchTimer;

const controls = {
  horizontalAlign: $('horizontal-align'), verticalAlign: $('vertical-align'), autoFit: $('auto-fit-toggle'),
  fontFamily: $('font-family'), fontSize: $('font-size'),
  textColor: $('text-color'), textAlign: $('text-align'), lineHeight: $('line-height'),
  backgroundColor: $('background-color'), backgroundOpacity: $('background-opacity'),
  backgroundVisible: $('background-toggle'), padding: $('padding'), maxWidth: $('max-width'), textEffect: $('text-effect')
};

function setDatabaseStatus(state, message) {
  elements.databaseStatus.className = `database-status ${state}`;
  elements.databaseStatus.querySelector('span:last-child').textContent = message;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function partLabel(item) {
  if (item.type === 'chorus') return 'Coro';
  if (item.type === 'repetition') return 'Repetición';
  return item.label && /^\d+$/.test(item.label) ? `Estrofa ${item.label}` : (item.label || 'Estrofa');
}

function hymnReference(item = sequence[currentIndex]) {
  if (!selectedHymn || !item) return '';
  const collection = collections.find(entry => entry.id === selectedHymn.collectionId);
  return `${collection?.name || selectedHymn.collectionId} ${selectedHymn.displayNumber} · ${selectedHymn.title} · ${partLabel(item)} · ${currentIndex + 1}/${sequence.length}`;
}

function saveState() {
  localStorage.setItem('hymnalControlState', JSON.stringify({
    collection: elements.collection.value,
    hymnId: selectedHymn && selectedHymn.id,
    mode: elements.mode.value,
    index: currentIndex,
    visible: isVisible,
    themeId: selectedThemeId,
    themeSettings
  }));
}

function sendCommand(command) {
  localStorage.setItem('hymnalDisplayCommand', JSON.stringify({ ...command, sentAt: Date.now() }));
}

function sendThemeSettings() {
  localStorage.setItem('hymnalSelectedTheme', selectedThemeId);
  localStorage.setItem('hymnalThemeSettings', JSON.stringify({ themeId: selectedThemeId, settings: themeSettings }));
  sendCommand({ action: 'theme-settings', themeId: selectedThemeId, settings: themeSettings });
}

function sendCurrentLine() {
  const item = sequence[currentIndex];
  if (!item) return;
  sendCommand({
    action: 'load', content: item.text, reference: hymnReference(item), show: isVisible,
    themeId: selectedThemeId, settings: themeSettings
  });
}

function updatePreview() {
  const current = sequence[currentIndex];
  const next = sequence[currentIndex + 1];
  elements.previewCurrent.querySelector('.verse-text').textContent = current ? current.text : 'Seleccione un himno';
  elements.previewCurrent.querySelector('.verse-ref').textContent = current ? `Actual: ${hymnReference(current)}` : 'Actual';
  elements.currentType.textContent = current ? partLabel(current) : '';
  elements.previewNext.querySelector('.verse-text').textContent = next ? next.text : (current ? 'Fin del himno' : '—');
  elements.previewNext.querySelector('.verse-ref').textContent = next ? `Siguiente: ${partLabel(next)}` : 'Siguiente';
  elements.counter.textContent = sequence.length ? `${currentIndex + 1} / ${sequence.length}` : '— / —';
  elements.previous.disabled = !sequence.length || currentIndex === 0;
  elements.next.disabled = !sequence.length || currentIndex >= sequence.length - 1;
}

function selectLine(index) {
  if (!sequence[index]) return;
  currentIndex = index;
  updatePreview();
  if (isVisible) sendCurrentLine();
  saveState();
}

function loadSequence(preferredIndex = 0) {
  if (!selectedHymn) return;
  const parts = new Map(selectedHymn.parts.map(part => [part.id, part]));
  sequence = (selectedHymn.sequence[elements.mode.value] || []).map(item => ({
    ...parts.get(item.partId),
    sequencePosition: item.position,
    repeated: item.repeated,
    note: item.note
  }));
  currentIndex = Math.max(0, Math.min(preferredIndex, sequence.length - 1));
  updatePreview();
  if (isVisible) sendCurrentLine();
  saveState();
}

function selectHymn(hymn, preferredIndex = 0) {
  selectedHymn = hymn;
  elements.search.value = `${hymn.displayNumber}. ${hymn.title}`;
  elements.dropdown.classList.remove('visible');
  elements.meta.hidden = false;
  elements.title.textContent = `${hymn.displayNumber}. ${hymn.title}`;
  const collection = collections.find(entry => entry.id === hymn.collectionId);
  const masterSection = masterSectionsById.get(hymn.masterSectionId);
  const section = sectionsById.get(hymn.sectionId);
  elements.section.textContent = [
    collection?.name,
    masterSection && `${masterSection.code}. ${masterSection.name}`,
    section?.name
  ].filter(Boolean).join(' · ');
  loadSequence(preferredIndex);
}

function renderSearchResults(items) {
  searchResults = items;
  if (!items.length) {
    elements.dropdown.innerHTML = '<div class="no-results">No se encontraron himnos</div>';
  } else {
    elements.dropdown.innerHTML = items.map((hymn, index) => `
      <div class="search-dropdown-item${index === 0 ? ' active' : ''}" data-index="${index}">
        <div class="hymn-result"><strong><span class="hymn-number">${escapeHtml(hymn.displayNumber)}</span>${escapeHtml(hymn.title)}</strong><small>${escapeHtml(masterSectionsById.get(hymn.masterSectionId)?.name || collections.find(entry => entry.id === hymn.collectionId)?.name || '')}</small></div>
      </div>`).join('');
    elements.dropdown.querySelectorAll('.search-dropdown-item').forEach(node => node.addEventListener('click', () => selectHymn(searchResults[Number(node.dataset.index)])));
  }
  elements.dropdown.classList.add('visible');
}

function normalizeSearch(value) {
  return String(value || '').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLocaleLowerCase('es-MX');
}

function levenshteinDistance(source, target) {
  if (source === target) return 0;
  if (!source.length) return target.length;
  if (!target.length) return source.length;
  let previous = Array.from({ length: target.length + 1 }, (_, index) => index);
  for (let row = 1; row <= source.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= target.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (source[row - 1] === target[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[target.length];
}

function fuzzyTermScore(term, words) {
  const exactIndex = words.findIndex(word => word === term);
  if (exactIndex >= 0) return exactIndex / 1000;
  const prefixIndex = words.findIndex(word => word.startsWith(term) || term.startsWith(word));
  if (prefixIndex >= 0) return 0.25 + prefixIndex / 1000;
  if (term.length < 3) return null;
  const tolerance = term.length < 6 ? 1 : 2;
  let best = null;
  words.forEach((word, index) => {
    if (Math.abs(word.length - term.length) > tolerance) return;
    const distance = levenshteinDistance(term, word);
    if (distance <= tolerance) best = Math.min(best ?? Infinity, distance + 1 + index / 1000);
  });
  return best;
}

function scoreHymnSearch(hymn, terms, normalizedQuery) {
  if (hymn.searchText.includes(normalizedQuery)) return -1;
  const scores = terms.map(term => fuzzyTermScore(term, hymn.searchWords));
  return scores.every(score => score !== null)
    ? scores.reduce((total, score) => total + score, 0)
    : null;
}

function searchHymns(query = '') {
  if (!database) return renderSearchResults([]);
  const term = normalizeSearch(query.trim());
  const terms = [...new Set(term.split(/\s+/u).filter(Boolean))];
  const items = database.hymns
    .filter(hymn => hymn.collectionId === elements.collection.value)
    .map(hymn => ({ hymn, score: term ? scoreHymnSearch(hymn, terms, term) : 0 }))
    .filter(result => result.score !== null)
    .sort((left, right) => left.score - right.score || left.hymn.title.localeCompare(right.hymn.title, 'es'))
    .slice(0, 30)
    .map(result => result.hymn);
  renderSearchResults(items);
}

async function initializeDatabase(saved) {
  try {
    const response = await fetch(DATABASE_URL);
    if (!response.ok) throw new Error(`No se pudo leer la base local (${response.status})`);
    database = await response.json();
    if (database.schemaVersion !== 2 || !Array.isArray(database.hymns)) {
      throw new Error('La base local no tiene un formato compatible');
    }
    collections = database.collections || [];
    database.hymns.forEach(hymn => {
      hymn.searchText = normalizeSearch([
        hymn.displayNumber, hymn.title, hymn.subtitle, hymn.bodyText,
        ...(hymn.authors || []), ...(hymn.translators || [])
      ].filter(Boolean).join(' '));
      hymn.searchWords = [...new Set(hymn.searchText.split(/\s+/u).filter(Boolean))];
    });
    hymnsById = new Map(database.hymns.map(hymn => [hymn.id, hymn]));
    masterSectionsById = new Map(database.masterSections.map(section => [section.id, section]));
    sectionsById = new Map(database.sections.map(section => [section.id, section]));
    elements.collection.innerHTML = collections.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} (${item.hymnCount})</option>`).join('');
    if (saved.collection && collections.some(item => item.id === saved.collection)) elements.collection.value = saved.collection;
    setDatabaseStatus('connected', `${database.hymns.length} himnos en la base local`);
    if (saved.hymnId) {
      const hymn = hymnsById.get(saved.hymnId);
      if (hymn) selectHymn(hymn, saved.index || 0);
      else searchHymns('');
    } else {
      searchHymns('');
    }
  } catch (error) {
    console.error(error);
    setDatabaseStatus('error', 'No se pudo cargar la base local');
  }
}

function getThemeDefaults() {
  const theme = window.BibleThemeRegistry.get(selectedThemeId);
  return { ...window.BibleThemeDefaults, ...(theme ? theme.defaults : {}) };
}

function updateSettingOutputs() {
  const units = { 'font-size': ' px', 'line-height': '', 'background-opacity': '%', padding: ' px', 'max-width': ' px' };
  Object.entries(units).forEach(([id, unit]) => { $(`${id}-value`).textContent = `${$(id).value}${unit}`; });
}

function syncThemeSettingsUI() {
  const values = {
    horizontalAlign: themeSettings.horizontalAlign, verticalAlign: themeSettings.verticalAlign,
    fontSize: themeSettings.fontSize, textColor: themeSettings.textColor,
    textAlign: themeSettings.textAlign, lineHeight: themeSettings.lineHeight, backgroundColor: themeSettings.backgroundColor,
    backgroundOpacity: themeSettings.backgroundOpacity, padding: themeSettings.padding, maxWidth: themeSettings.maxWidth, textEffect: themeSettings.textEffect
  };
  Object.entries(values).forEach(([key, value]) => { controls[key].value = value; });
  controls.backgroundVisible.checked = themeSettings.backgroundVisible !== false;
  controls.autoFit.checked = themeSettings.autoFit !== false;
  controls.fontSize.disabled = controls.autoFit.checked;
  controls.fontSize.closest('.settings-grid')?.classList.toggle('auto-fit-active', controls.autoFit.checked);
  const theme = window.BibleThemeRegistry.get(selectedThemeId);
  controls.fontFamily.innerHTML = '';
  (theme.fonts || []).forEach(font => controls.fontFamily.add(new Option(font.split(',')[0], font)));
  if (![...controls.fontFamily.options].some(option => option.value === themeSettings.fontFamily)) controls.fontFamily.add(new Option(themeSettings.fontFamily.split(',')[0], themeSettings.fontFamily));
  controls.fontFamily.value = themeSettings.fontFamily;
  updateSettingOutputs();
}

function renderThemeCards() {
  elements.themeList.innerHTML = window.BibleThemeRegistry.all().map(theme => `
    <button type="button" class="theme-card${theme.id === selectedThemeId ? ' selected' : ''}" data-theme="${theme.id}" role="radio" aria-checked="${theme.id === selectedThemeId}">
      <span class="theme-swatch theme-swatch-${theme.id}"></span><span><strong>${theme.name}</strong></span>
    </button>`).join('');
  elements.themeList.querySelectorAll('.theme-card').forEach(card => card.addEventListener('click', () => {
    selectedThemeId = card.dataset.theme;
    themeSettings = getThemeDefaults();
    renderThemeCards(); syncThemeSettingsUI(); sendThemeSettings();
    if (isVisible) sendCurrentLine();
    saveState();
  }));
}

function updateThemeSettings() {
  themeSettings = {
    horizontalAlign: controls.horizontalAlign.value, verticalAlign: controls.verticalAlign.value,
    autoFit: controls.autoFit.checked, fontFamily: controls.fontFamily.value,
    fontSize: Number(controls.fontSize.value), textColor: controls.textColor.value, textAlign: controls.textAlign.value,
    lineHeight: Number(controls.lineHeight.value), backgroundColor: controls.backgroundColor.value,
    backgroundOpacity: Number(controls.backgroundOpacity.value), backgroundVisible: controls.backgroundVisible.checked,
    padding: Number(controls.padding.value), maxWidth: Number(controls.maxWidth.value), textEffect: controls.textEffect.value
  };
  controls.fontSize.disabled = controls.autoFit.checked;
  controls.fontSize.closest('.settings-grid')?.classList.toggle('auto-fit-active', controls.autoFit.checked);
  updateSettingOutputs(); sendThemeSettings();
  if (isVisible) sendCurrentLine();
  saveState();
}

function toggleSettings(open) {
  elements.settingsDrawer.classList.toggle('open', open);
  elements.settingsDrawer.setAttribute('aria-hidden', String(!open));
  elements.settingsButton.setAttribute('aria-expanded', String(open));
  elements.settingsScrim.hidden = !open;
}

document.addEventListener('DOMContentLoaded', async () => {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('hymnalControlState') || '{}'); } catch {}
  selectedThemeId = window.BibleThemeRegistry.has(saved.themeId) ? saved.themeId : 'classic';
  themeSettings = { ...getThemeDefaults(), ...(saved.themeSettings || {}) };
  isVisible = Boolean(saved.visible);
  elements.visibility.checked = isVisible;
  if (saved.mode) elements.mode.value = saved.mode;
  $('obs-url').textContent = `${window.location.origin}/visualizador/`;

  renderThemeCards(); syncThemeSettingsUI(); sendThemeSettings();
  document.querySelectorAll('.collapsible-section .section-toggle').forEach(button => button.addEventListener('click', () => {
    const section = button.closest('.collapsible-section');
    const open = section.classList.toggle('open');
    button.setAttribute('aria-expanded', String(open));
  }));

  elements.search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => searchHymns(elements.search.value), 180); });
  elements.search.addEventListener('focus', () => searchHymns(elements.search.value.includes('.') ? '' : elements.search.value));
  elements.search.addEventListener('keydown', event => {
    if (event.key === 'Enter' && searchResults[0]) { event.preventDefault(); selectHymn(searchResults[0]); }
    if (event.key === 'Escape') elements.dropdown.classList.remove('visible');
  });
  document.addEventListener('click', event => { if (!elements.search.contains(event.target) && !elements.dropdown.contains(event.target)) elements.dropdown.classList.remove('visible'); });
  elements.collection.addEventListener('change', () => { selectedHymn = null; sequence = []; currentIndex = 0; elements.search.value = ''; elements.meta.hidden = true; updatePreview(); searchHymns(''); saveState(); });
  elements.mode.addEventListener('change', () => loadSequence(0));
  elements.previous.addEventListener('click', () => selectLine(currentIndex - 1));
  elements.next.addEventListener('click', () => selectLine(currentIndex + 1));
  elements.visibility.addEventListener('change', () => {
    isVisible = elements.visibility.checked;
    if (isVisible) sendCurrentLine(); else sendCommand({ action: 'hide' });
    saveState();
  });

  [controls.fontSize, controls.lineHeight, controls.backgroundOpacity, controls.padding, controls.maxWidth].forEach(input => input.addEventListener('input', updateThemeSettings));
  [controls.horizontalAlign, controls.verticalAlign, controls.autoFit, controls.fontFamily, controls.textColor, controls.textAlign, controls.backgroundColor, controls.backgroundVisible, controls.textEffect].forEach(input => input.addEventListener('change', updateThemeSettings));
  elements.reset.addEventListener('click', () => { themeSettings = getThemeDefaults(); syncThemeSettingsUI(); sendThemeSettings(); if (isVisible) sendCurrentLine(); saveState(); });
  elements.settingsButton.addEventListener('click', () => toggleSettings(!elements.settingsDrawer.classList.contains('open')));
  elements.settingsClose.addEventListener('click', () => toggleSettings(false));
  elements.settingsScrim.addEventListener('click', () => toggleSettings(false));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') toggleSettings(false);
    if (event.key === 'ArrowLeft' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) selectLine(currentIndex - 1);
    if (event.key === 'ArrowRight' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) selectLine(currentIndex + 1);
  });

  await initializeDatabase(saved);
});

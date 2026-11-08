const DATABASE_URL = '/data/himnario.db.json';
const $ = id => document.getElementById(id);

const elements = {
  collection: $('collection-select'), search: $('hymn-search'), searchClear: $('hymn-search-clear'), dropdown: $('hymn-dropdown'), mode: $('sequence-mode'),
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
const PROGRAM_STORAGE_KEY = 'hymnalProgram';
let programmedHymns = [];

const hymnNumberCollator = new Intl.Collator('es-MX', { numeric: true, sensitivity: 'base' });

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

function setSearchClearButton() {
  elements.searchClear.hidden = !elements.search.value;
}

function partLabel(item) {
  if (item.type === 'title') return 'Título';
  if (item.type === 'chorus') return 'Coro';
  if (item.type === 'repetition') return 'Repetición';
  if (item.type === 'verse' && !item.label && item.verseNumber) return `Estrofa ${item.verseNumber}`;
  return item.label && /^\d+$/.test(item.label) ? `Estrofa ${item.label}` : (item.label || 'Estrofa');
}

function hymnReference(item = sequence[currentIndex]) {
  if (!selectedHymn || !item) return '';
  if (item.type === 'title') return 'Título';
  return `${selectedHymn.displayNumber} · ${selectedHymn.title} · ${partLabel(item)} · ${sequenceProgress()}`;
}

function sequenceProgress() {
  if (!sequence.length) return '— / —';
  if (sequence[currentIndex]?.type === 'title') return 'Título';
  const current = sequence[currentIndex];
  return `${current.partPosition} / ${current.partTotal}`;
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
    action: 'load', content: item.text, reference: item.type === 'title' ? '' : hymnReference(item), show: isVisible,
    titleCard: item.type === 'title' ? item.titleCard : null,
    themeId: selectedThemeId, settings: themeSettings
  });
}

function updatePreview() {
  const current = sequence[currentIndex];
  const next = sequence[currentIndex + 1];
  renderPartPreview(elements.previewCurrent, current, 'Seleccione un himno');
  elements.previewCurrent.querySelector('.verse-ref').textContent = current ? `Actual: ${hymnReference(current)}` : 'Actual';
  elements.currentType.textContent = current ? partLabel(current) : '';
  renderPartPreview(elements.previewNext, next, current ? 'Fin del himno' : '—');
  elements.previewNext.querySelector('.verse-ref').textContent = next ? `Siguiente: ${partLabel(next)}` : 'Siguiente';
  elements.counter.textContent = sequenceProgress();
  elements.previous.disabled = !sequence.length || currentIndex === 0;
  elements.next.disabled = !sequence.length || currentIndex >= sequence.length - 1;
}

function renderPartPreview(container, part, fallback) {
  const text = container.querySelector('.verse-text');
  text.textContent = '';
  container.dataset.coverTheme = part?.type === 'title' ? selectedThemeId : '';
  if (part?.type !== 'title') {
    text.textContent = part?.text || fallback;
    return;
  }
  for (const key of ['title', 'section']) {
    if (!part.titleCard[key]) continue;
    const line = document.createElement('div');
    line.className = `preview-cover-${key}`;
    line.textContent = part.titleCard[key];
    text.appendChild(line);
  }
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
  sequence = buildDisplaySequence(selectedHymn, elements.mode.value);
  currentIndex = Math.max(0, Math.min(preferredIndex, sequence.length - 1));
  updatePreview();
  if (isVisible) sendCurrentLine();
  saveState();
}

function buildDisplaySequence(hymn, mode) {
  const parts = new Map(hymn.parts.map(part => [part.id, part]));
  const titleCard = {
    title: `${hymn.displayNumber}. ${hymn.title}`,
    section: hymnSectionName(hymn)
  };
  const order = mode === 'performance' || mode === 'performanceLines' ? 'performance' : 'source';
  const verseNumbers = new Map();
  let verseOrdinal = 0;
  for (const part of hymn.parts) {
    if (part.type === 'verse') {
      verseOrdinal += 1;
      verseNumbers.set(part.id, part.number ?? verseOrdinal);
    }
  }
  const orderedParts = (hymn.sequence[order] || []).map((item, index, entries) => ({
    ...parts.get(item.partId), verseNumber: verseNumbers.get(item.partId),
    partPosition: index + 1, partTotal: entries.length
  }));
  const content = mode === 'lines' || mode === 'performanceLines'
    ? orderedParts.flatMap(part => part.lines.filter(line => line.trim()).map(line => ({ ...part, text: line, lines: [line] })))
    : orderedParts;
  return [{ type: 'title', titleCard, text: [titleCard.title, titleCard.section].filter(Boolean).join('\n') }, ...content];
}

function selectHymn(hymn, preferredIndex = 0) {
  selectedHymn = hymn;
  elements.collection.value = hymn.collectionId;
  elements.search.value = `${hymn.displayNumber}. ${hymn.title}`;
  setSearchClearButton();
  elements.dropdown.classList.remove('visible');
  elements.meta.hidden = false;
  elements.title.textContent = `${hymn.displayNumber}. ${hymn.title}`;
  elements.section.textContent = [hymnCollectionName(hymn), hymnSectionName(hymn)].filter(Boolean).join(' · ');
  loadSequence(preferredIndex);
  renderProgram();
}

function saveProgram() {
  localStorage.setItem(PROGRAM_STORAGE_KEY, JSON.stringify(programmedHymns));
  renderProgram();
}

function addToProgram() {
  if (!selectedHymn || programmedHymns.includes(selectedHymn.id)) return;
  programmedHymns.push(selectedHymn.id);
  saveProgram();
}

function toggleProgramBookmark() {
  if (!selectedHymn) return;
  const index = programmedHymns.indexOf(selectedHymn.id);
  if (index >= 0) removeProgramHymn(index);
  else addToProgram();
}

function reorderProgramHymn(index, target) {
  if (index < 0 || index >= programmedHymns.length || target < 0 || target >= programmedHymns.length || index === target) return;
  const [id] = programmedHymns.splice(index, 1);
  programmedHymns.splice(target, 0, id);
  saveProgram();
}

function removeProgramHymn(index) {
  if (index < 0 || index >= programmedHymns.length) return;
  programmedHymns.splice(index, 1);
  saveProgram();
}

function loadProgram() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROGRAM_STORAGE_KEY) || '[]');
    programmedHymns = Array.isArray(saved) ? [...new Set(saved.filter(id => hymnsById.has(id)))] : [];
  } catch { programmedHymns = []; }
  renderProgram();
}

function renderProgram() {
  const list = $('program-list');
  $('program-count').textContent = programmedHymns.length;
  const bookmark = $('program-bookmark');
  const saved = Boolean(selectedHymn && programmedHymns.includes(selectedHymn.id));
  bookmark.disabled = !selectedHymn;
  bookmark.setAttribute('aria-pressed', String(saved));
  bookmark.title = saved ? 'Quitar himno de programados' : 'Guardar himno en programados';
  bookmark.setAttribute('aria-label', bookmark.title);
  list.innerHTML = programmedHymns.length ? programmedHymns.map((id, index) => {
    const hymn = hymnsById.get(id);
    return `<li class="program-row" data-index="${index}"><button type="button" class="program-grip" draggable="true" data-index="${index}" aria-label="Ordenar: ${escapeHtml(hymn.title)}" title="Arrastra para ordenar; usa las flechas arriba y abajo con el teclado"><i class="fas fa-grip-lines" aria-hidden="true"></i></button><button type="button" class="program-select" data-index="${index}" aria-current="${selectedHymn?.id === id}"><strong>${index + 1}. ${escapeHtml(hymn.displayNumber)} &middot; ${escapeHtml(hymn.title)}</strong><small>${escapeHtml(hymnCollectionName(hymn))}</small></button><button type="button" class="program-remove-bookmark" data-index="${index}" aria-pressed="true" aria-label="Quitar marcador: ${escapeHtml(hymn.title)}" title="Quitar de programados"><i class="fas fa-bookmark" aria-hidden="true"></i></button></li>`;
  }).join('') : '<li class="no-results">Agrega himnos de cualquier colecci&#243;n para preparar tu lista.</li>';
  list.querySelectorAll('.program-select').forEach(button => button.addEventListener('click', () => {
    const hymn = hymnsById.get(programmedHymns[Number(button.dataset.index)]);
    if (hymn) selectHymn(hymn);
  }));
  list.querySelectorAll('.program-remove-bookmark').forEach(button => button.addEventListener('click', () => {
    removeProgramHymn(Number(button.dataset.index));
  }));
  let draggedIndex = null;
  const clearDropIndicators = () => list.querySelectorAll('.program-row').forEach(row => {
    row.classList.remove('drop-before', 'drop-after', 'dragging');
  });
  list.querySelectorAll('.program-grip').forEach(handle => {
    handle.addEventListener('dragstart', event => {
      draggedIndex = Number(handle.dataset.index);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', programmedHymns[draggedIndex]);
      const row = handle.closest('.program-row');
      event.dataTransfer.setDragImage(row, 12, row.offsetHeight / 2);
      row.classList.add('dragging');
    });
    handle.addEventListener('dragend', () => {
      draggedIndex = null;
      clearDropIndicators();
    });
    handle.addEventListener('keydown', event => {
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const index = Number(handle.dataset.index);
      const target = index + (event.key === 'ArrowUp' ? -1 : 1);
      reorderProgramHymn(index, target);
      list.querySelector(`.program-grip[data-index="${Math.max(0, Math.min(programmedHymns.length - 1, target))}"]`)?.focus();
    });
  });
  list.querySelectorAll('.program-row').forEach(row => {
    const insertAfter = event => {
      const bounds = row.getBoundingClientRect();
      return event.clientY > bounds.top + bounds.height / 2;
    };
    row.addEventListener('dragover', event => {
      if (draggedIndex === null) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      list.querySelectorAll('.program-row').forEach(item => item.classList.remove('drop-before', 'drop-after'));
      row.classList.add(insertAfter(event) ? 'drop-after' : 'drop-before');
    });
    row.addEventListener('dragleave', event => {
      if (!row.contains(event.relatedTarget)) row.classList.remove('drop-before', 'drop-after');
    });
    row.addEventListener('drop', event => {
      if (draggedIndex === null) return;
      event.preventDefault();
      const insertion = Number(row.dataset.index) + (insertAfter(event) ? 1 : 0);
      const target = insertion - (draggedIndex < insertion ? 1 : 0);
      const from = draggedIndex;
      draggedIndex = null;
      clearDropIndicators();
      reorderProgramHymn(from, target);
    });
  });
}

function hymnCollectionName(hymn) {
  return collections.find(entry => entry.id === hymn.collectionId)?.name || hymn.collectionId;
}

function hymnSectionName(hymn) {
  const masterSection = masterSectionsById.get(hymn.masterSectionId);
  const section = sectionsById.get(hymn.sectionId);
  return [masterSection && `${masterSection.code}. ${masterSection.name}`, section?.name].filter(Boolean).join(' · ');
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
  if (source.length === target.length) {
    let first = 0;
    while (first < source.length && source[first] === target[first]) first++;
    if (source[first] === target[first + 1] && source[first + 1] === target[first] && source.slice(first + 2) === target.slice(first + 2)) return 1;
  }
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
  const prefixIndex = term.length >= 3 ? words.findIndex(word => word.startsWith(term)) : -1;
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

function scoreSearchField(searchText, searchWords, terms, normalizedQuery) {
  if (!searchText) return null;
  if (searchText === normalizedQuery) return 0;
  if (searchText.startsWith(normalizedQuery)) return 0.05;
  if (searchText.includes(normalizedQuery)) return 0.1;
  const scores = terms.map(term => fuzzyTermScore(term, searchWords));
  const missing = scores.filter(score => score === null).length;
  if (missing > (terms.length >= 3 ? 1 : 0)) return null;
  if (!terms.some((term, index) => term.length >= 3 && scores[index] !== null)) return null;
  return missing * 100 + 0.25 + scores.reduce((total, score) => total + (score ?? 0), 0);
}

function scoreNumberSearch(numberText, normalizedQuery) {
  if (numberText === normalizedQuery) return 0;
  if (!/^\d+$/u.test(normalizedQuery)) return null;
  if (numberText.startsWith(`${normalizedQuery} `)) return 0.02;
  if (numberText.startsWith(normalizedQuery)) return 0.05;
  return numberText.includes(normalizedQuery) ? 0.1 : null;
}

function scoreHymnSearch(hymn, terms, normalizedQuery) {
  const numberScore = scoreNumberSearch(hymn.numberSearchText, normalizedQuery);
  if (numberScore !== null) return { priority: 0, relevance: numberScore };

  const titleScore = scoreSearchField(hymn.titleSearchText, hymn.titleSearchWords, terms, normalizedQuery);
  const headingScore = scoreSearchField(hymn.headingSearchText, hymn.headingSearchWords, terms, normalizedQuery);
  if (titleScore !== null || headingScore !== null) {
    return {
      priority: 1,
      relevance: Math.min(titleScore ?? Infinity, (headingScore ?? Infinity) + 0.05)
    };
  }

  const lyricsScore = scoreSearchField(hymn.lyricsSearchText, hymn.lyricsSearchWords, terms, normalizedQuery);
  return lyricsScore === null ? null : { priority: 2, relevance: lyricsScore };
}

function compareHymnOrder(left, right) {
  return hymnNumberCollator.compare(left.displayNumber, right.displayNumber)
    || left.title.localeCompare(right.title, 'es-MX', { sensitivity: 'base' });
}

function searchHymns(query = '') {
  if (!database) return renderSearchResults([]);
  const term = normalizeSearch(query.trim());
  const terms = [...new Set(term.split(/\s+/u).filter(Boolean))];
  const items = database.hymns
    .filter(hymn => hymn.collectionId === elements.collection.value)
    .map(hymn => ({ hymn, match: term ? scoreHymnSearch(hymn, terms, term) : { priority: 0, relevance: 0 } }))
    .filter(result => result.match !== null)
    .sort((left, right) => (term
      ? left.match.priority - right.match.priority || left.match.relevance - right.match.relevance
      : 0) || compareHymnOrder(left.hymn, right.hymn))
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
      hymn.numberSearchText = normalizeSearch(hymn.displayNumber);
      hymn.titleSearchText = normalizeSearch([hymn.title, hymn.subtitle].filter(Boolean).join(' '));
      hymn.headingSearchText = normalizeSearch([hymn.displayNumber, hymn.title, hymn.subtitle].filter(Boolean).join(' '));
      hymn.lyricsSearchText = normalizeSearch([
        hymn.bodyText, ...(hymn.authors || []), ...(hymn.translators || [])
      ].filter(Boolean).join(' '));
      hymn.titleSearchWords = [...new Set(hymn.titleSearchText.split(/\s+/u).filter(Boolean))];
      hymn.headingSearchWords = [...new Set(hymn.headingSearchText.split(/\s+/u).filter(Boolean))];
      hymn.lyricsSearchWords = [...new Set(hymn.lyricsSearchText.split(/\s+/u).filter(Boolean))];
    });
    hymnsById = new Map(database.hymns.map(hymn => [hymn.id, hymn]));
    masterSectionsById = new Map(database.masterSections.map(section => [section.id, section]));
    sectionsById = new Map(database.sections.map(section => [section.id, section]));
    loadProgram();
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
    renderThemeCards(); syncThemeSettingsUI(); sendThemeSettings(); updatePreview();
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
  elements.mode.value = saved.mode === 'performance' && saved.displayMode === 'lines' ? 'performanceLines'
    : saved.mode === 'source' && saved.displayMode === 'lines' ? 'lines'
    : ['source', 'performance', 'lines', 'performanceLines'].includes(saved.mode) ? saved.mode : 'source';
  $('obs-url').textContent = `${window.location.origin}/visualizador/`;

  renderThemeCards(); syncThemeSettingsUI(); sendThemeSettings();

  $('program-bookmark').addEventListener('click', toggleProgramBookmark);
  elements.search.addEventListener('input', () => {
    setSearchClearButton();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => searchHymns(elements.search.value), 180);
  });
  elements.search.addEventListener('focus', () => searchHymns(elements.search.value.includes('.') ? '' : elements.search.value));
  elements.search.addEventListener('keydown', event => {
    if (event.key === 'Enter' && searchResults[0]) { event.preventDefault(); selectHymn(searchResults[0]); }
    if (event.key === 'Escape') elements.dropdown.classList.remove('visible');
  });
  document.addEventListener('click', event => { if (!elements.search.contains(event.target) && !elements.dropdown.contains(event.target)) elements.dropdown.classList.remove('visible'); });
  elements.searchClear.addEventListener('click', () => {
    clearTimeout(searchTimer);
    elements.search.value = '';
    setSearchClearButton();
    elements.search.focus();
    searchHymns('');
  });
  elements.collection.addEventListener('change', () => { selectedHymn = null; sequence = []; currentIndex = 0; elements.search.value = ''; setSearchClearButton(); elements.meta.hidden = true; renderProgram(); updatePreview(); searchHymns(''); saveState(); });
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

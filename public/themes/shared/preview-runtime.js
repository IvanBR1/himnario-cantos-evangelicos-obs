(function () {
  const root = document.documentElement;
  const body = document.body;
  const params = new URLSearchParams(window.location.search);
  const preferredTheme = params.get('theme');
  let selectedThemeId = preferredTheme || localStorage.getItem('hymnalSelectedTheme') || 'classic';
  let activeSettings = {};
  let verseContainer;
  let verseText;
  let verseReference;
  let fitFrame;
  let activeTitleCard = null;

  function renderContent(text, titleCard) {
    activeTitleCard = titleCard || null;
    verseContainer.classList.toggle('title-card', Boolean(activeTitleCard));
    verseText.textContent = '';
    if (!activeTitleCard) {
      verseText.textContent = text;
      return;
    }
    for (const [key, className] of [['title', 'hymn-cover-title'], ['section', 'hymn-cover-section']]) {
      if (!activeTitleCard[key]) continue;
      const line = document.createElement('div');
      line.className = className;
      line.textContent = activeTitleCard[key];
      verseText.appendChild(line);
    }
  }

  const getTheme = () => window.BibleThemeRegistry.get(selectedThemeId) || window.BibleThemeRegistry.get('classic');
  const getDefaults = () => ({ ...window.BibleThemeDefaults, ...getTheme().defaults });

  function setEffect(effect) {
    const effects = {
      none: ['none', 'none'],
      shadow: ['0 4px 18px rgba(0,0,0,.82)', 'none'],
      outline: ['-1px -1px 0 rgba(0,0,0,.8),1px -1px 0 rgba(0,0,0,.8),-1px 1px 0 rgba(0,0,0,.8),1px 1px 0 rgba(0,0,0,.8),0 4px 14px rgba(0,0,0,.7)', 'none'],
      contrast: ['0 3px 12px rgba(0,0,0,.95)', 'contrast(1.18)']
    };
    const current = effects[effect] || effects.shadow;
    root.style.setProperty('--verse-text-shadow', current[0]);
    root.style.setProperty('--verse-filter', current[1]);
  }

  function setAnchoring(horizontal, vertical) {
    const horizontalPositions = {
      left: ['24px', 'auto', '0%'],
      center: ['50%', 'auto', '-50%'],
      right: ['auto', '24px', '0%']
    };
    const verticalPositions = {
      top: ['24px', 'auto', '0%'],
      center: ['50%', 'auto', '-50%'],
      bottom: ['auto', '24px', '0%']
    };
    const [left, right, translateX] = horizontalPositions[horizontal] || horizontalPositions.center;
    const [top, bottom, translateY] = verticalPositions[vertical] || verticalPositions.center;
    root.style.setProperty('--verse-left', left);
    root.style.setProperty('--verse-right', right);
    root.style.setProperty('--verse-top', top);
    root.style.setProperty('--verse-bottom', bottom);
    root.style.setProperty('--verse-translate-x', translateX);
    root.style.setProperty('--verse-translate-y', translateY);
    body.dataset.horizontalAlign = horizontalPositions[horizontal] ? horizontal : 'center';
    body.dataset.verticalAlign = verticalPositions[vertical] ? vertical : 'center';
  }

  function contentFits() {
    if (!verseContainer) return true;
    const bounds = verseContainer.getBoundingClientRect();
    const margin = 23;
    return verseContainer.scrollHeight <= verseContainer.clientHeight + 1
      && verseContainer.scrollWidth <= verseContainer.clientWidth + 1
      && bounds.top >= margin
      && bounds.left >= margin
      && bounds.bottom <= window.innerHeight - margin
      && bounds.right <= window.innerWidth - margin;
  }

  function fitTextToContainer() {
    if (!verseContainer || !verseText || !verseText.textContent.trim()) return;
    const safe = window.BibleThemeUtilities;
    const requestedSize = safe.clamp(activeSettings.fontSize, 8, 96, 52);
    const maximumSize = activeSettings.autoFit === false ? requestedSize : 96;
    const minimumSize = 8;

    root.style.setProperty('--verse-font-size', `${maximumSize}px`);
    if (contentFits()) return;

    let low = minimumSize;
    let high = maximumSize;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const candidate = (low + high) / 2;
      root.style.setProperty('--verse-font-size', `${candidate}px`);
      if (contentFits()) low = candidate;
      else high = candidate;
    }
    root.style.setProperty('--verse-font-size', `${Math.max(minimumSize, low - 0.5).toFixed(1)}px`);
  }

  function scheduleFit() {
    cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(() => {
      fitFrame = requestAnimationFrame(fitTextToContainer);
    });
  }

  function applySettings(settings) {
    activeSettings = { ...getDefaults(), ...activeSettings, ...(settings || {}) };
    const safe = window.BibleThemeUtilities;
    setAnchoring(activeSettings.horizontalAlign, activeSettings.verticalAlign);
    root.style.setProperty('--verse-font-family', activeSettings.fontFamily);
    root.style.setProperty('--verse-font-size', `${safe.clamp(activeSettings.fontSize, 18, 96, 52)}px`);
    root.style.setProperty('--verse-text-color', activeSettings.textColor);
    root.style.setProperty('--verse-container-bg', safe.hexToRgba(activeSettings.backgroundColor, safe.clamp(activeSettings.backgroundOpacity, 0, 100, 88) / 100));
    root.style.setProperty('--verse-text-align', activeSettings.textAlign);
    root.style.setProperty('--verse-line-height', safe.clamp(activeSettings.lineHeight, .8, 2.5, 1.2));
    root.style.setProperty('--verse-padding', `${safe.clamp(activeSettings.padding, 0, 120, 32)}px`);
    root.style.setProperty('--verse-max-width', `${safe.clamp(activeSettings.maxWidth, 320, 1800, 1120)}px`);
    body.classList.toggle('background-hidden', activeSettings.backgroundVisible === false);
    setEffect(activeSettings.textEffect);
    scheduleFit();
  }

  function renderTheme(themeId) {
    if (!window.BibleThemeRegistry.has(themeId)) return;
    const oldText = verseText ? verseText.textContent : '';
    const oldReference = verseReference ? verseReference.textContent : '';
    const wasVisible = verseContainer && verseContainer.classList.contains('visible');
    selectedThemeId = themeId;
    const theme = getTheme();
    body.dataset.theme = theme.id;
    document.getElementById('theme-root').innerHTML = theme.render();
    verseContainer = document.getElementById('verse-container');
    verseText = document.getElementById('verse-text');
    verseReference = document.getElementById('verse-reference');
    renderContent(oldText, activeTitleCard);
    verseReference.textContent = oldReference;
    applySettings(activeSettings);
    if (wasVisible) showVerse();
    scheduleFit();
  }

  function showVerse() {
    verseContainer.classList.add('visible');
    body.classList.add('has-verse');
    scheduleFit();
  }
  function hideVerse() {
    verseContainer.classList.remove('visible');
    body.classList.remove('has-verse');
  }
  function processCommand(command) {
    if (!command) return;
    if (command.themeId && command.themeId !== selectedThemeId) renderTheme(command.themeId);
    if (command.settings) applySettings(command.settings);
    if (command.action === 'load') {
      renderContent(command.content || '', command.titleCard);
      verseReference.textContent = command.titleCard ? '' : (command.reference || '');
      if (command.show !== false) showVerse();
      scheduleFit();
    }
    if (command.action === 'show') showVerse();
    if (command.action === 'hide') hideVerse();
  }
  function receiveCommand() {
    const raw = localStorage.getItem('hymnalDisplayCommand');
    if (!raw) return;
    try { processCommand(JSON.parse(raw)); } catch (error) { console.error('Comando de himnario inválido:', error); }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = JSON.parse(localStorage.getItem('hymnalThemeSettings') || '{}');
    if (!preferredTheme && savedTheme.themeId && window.BibleThemeRegistry.has(savedTheme.themeId)) selectedThemeId = savedTheme.themeId;
    renderTheme(selectedThemeId);
    applySettings(savedTheme.settings || {});
    hideVerse();
    window.addEventListener('storage', event => { if (event.key === 'hymnalDisplayCommand') receiveCommand(); });
    window.addEventListener('resize', scheduleFit);
    if (document.fonts?.ready) document.fonts.ready.then(scheduleFit);
    receiveCommand();
  });
}());

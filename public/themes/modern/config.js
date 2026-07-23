window.BibleThemeRegistry.register({
    id: 'modern',
    name: 'Libro moderno',
    description: 'Fondo de Biblia y composición editorial centrada.',
    preview: '/themes/modern/preview.html',
    fonts: ['Cormorant Garamond, Georgia, serif', 'Libre Baskerville, Georgia, serif', 'Merriweather, Georgia, serif'],
    defaults: { fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 50, textColor: '#f8efe0', backgroundColor: '#111111', backgroundOpacity: 24, horizontalAlign: 'center', verticalAlign: 'center', autoFit: true, textAlign: 'center', lineHeight: 1.14, padding: 24, maxWidth: 1380, textEffect: 'shadow' },
    render: () => `<div class="theme-background modern-background" aria-hidden="true"></div><div class="theme-overlay modern-overlay" aria-hidden="true"></div><section class="verse-container modern-card" id="verse-container"><div class="verse-text" id="verse-text"></div><div class="verse-reference" id="verse-reference"></div></section>`
});

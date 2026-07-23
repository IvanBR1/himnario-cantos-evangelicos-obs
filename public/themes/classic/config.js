window.BibleThemeRegistry.register({
    id: 'classic',
    name: 'Clásico',
    description: 'Tarjeta sobria y legible para cualquier transmisión.',
    preview: '/themes/classic/preview.html',
    fonts: ['Merriweather, Georgia, serif', 'Open Sans, Arial, sans-serif', 'Georgia, serif'],
    defaults: { fontFamily: 'Merriweather, Georgia, serif', fontSize: 38, textColor: '#ecf0f1', backgroundColor: '#2c3e50', backgroundOpacity: 94, horizontalAlign: 'center', verticalAlign: 'center', autoFit: true, textAlign: 'left', lineHeight: 1.42, padding: 28, maxWidth: 1240, textEffect: 'shadow' },
    render: () => `<section class="verse-container classic-card" id="verse-container"><div class="verse-text" id="verse-text"></div><div class="verse-reference" id="verse-reference"></div></section>`
});

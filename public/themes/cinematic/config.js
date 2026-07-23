window.BibleThemeRegistry.register({
    id: 'cinematic',
    name: 'Cinematográfico',
    description: 'Alto contraste, degradado y presencia para proyección.',
    preview: '/themes/cinematic/preview.html',
    fonts: ['Cinzel, Georgia, serif', 'Cormorant Garamond, Georgia, serif', 'Merriweather, Georgia, serif'],
    defaults: { fontFamily: 'Cinzel, Georgia, serif', fontSize: 46, textColor: '#fff6df', backgroundColor: '#090609', backgroundOpacity: 88, horizontalAlign: 'center', verticalAlign: 'center', autoFit: true, textAlign: 'center', lineHeight: 1.2, padding: 30, maxWidth: 1360, textEffect: 'outline' },
    render: () => `<div class="cinematic-backdrop" aria-hidden="true"></div><section class="verse-container cinematic-card" id="verse-container"><div class="cinematic-rule" aria-hidden="true"></div><div class="verse-text" id="verse-text"></div><div class="verse-reference" id="verse-reference"></div></section>`
});

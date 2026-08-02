window.BibleThemeRegistry.register({
    id: 'neon',
    name: 'Neón',
    description: 'Marco luminoso de alto impacto para pantallas.',
    preview: '/themes/neon/preview.html',
    fonts: ['Archivo, Arial, sans-serif', 'Cinzel, Georgia, serif', 'Cormorant Garamond, Georgia, serif', 'Inter, Arial, sans-serif', 'Merriweather, Georgia, serif', 'Open Sans, Arial, sans-serif', 'Playfair Display, Georgia, serif', 'Space Grotesk, Arial, sans-serif'],
    defaults: { fontFamily: 'Space Grotesk, Arial, sans-serif', fontWeight: 700, fontSize: 43, textColor: '#f2fdff', backgroundColor: '#06101e', backgroundOpacity: 94, horizontalAlign: 'center', verticalAlign: 'center', autoFit: true, textAlign: 'center', lineHeight: 1.16, padding: 38, maxWidth: 1200, textEffect: 'shadow' },
    render: () => `<section class="verse-container neon-card" id="verse-container"><div class="verse-text" id="verse-text"></div><div class="verse-reference" id="verse-reference"></div></section>`
});

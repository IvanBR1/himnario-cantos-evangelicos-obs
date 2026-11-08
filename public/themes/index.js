(function () {
    const themes = new Map();
    window.BibleThemeRegistry = {
        register(theme) { themes.set(theme.id, theme); },
        get(id) { return themes.get(id); },
        all() { return Array.from(themes.values()); },
        has(id) { return themes.has(id); }
    };

    ['shared/defaults.js', 'shared/utilities.js']
        .forEach(file => document.write(`<script src="/themes/${file}?v=20261108-cover2"><` + '/script>'));

    // Único punto de alta: cada entrada aporta su configuración y su hoja de estilos.
    ['classic', 'modern', 'minimal', 'cinematic', 'broadcast', 'glass', 'editorial', 'neon', 'ribbon', 'spotlight'].forEach(theme => {
        document.write(`<link rel="stylesheet" href="/themes/${theme}/styles.css?v=20261108-cover2">`);
        document.write(`<script src="/themes/${theme}/config.js?v=20261108-cover2"><` + '/script>');
    });
}());

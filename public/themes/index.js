(function () {
    const themes = new Map();
    window.BibleThemeRegistry = {
        register(theme) { themes.set(theme.id, theme); },
        get(id) { return themes.get(id); },
        all() { return Array.from(themes.values()); },
        has(id) { return themes.has(id); }
    };

    ['types.js', 'shared/defaults.js', 'shared/utilities.js']
        .forEach(file => document.write(`<script src="/themes/${file}"><` + '/script>'));

    // Único punto de alta: cada entrada aporta su configuración y su hoja de estilos.
    ['classic', 'modern', 'minimal', 'cinematic'].forEach(theme => {
        document.write(`<link rel="stylesheet" href="/themes/${theme}/styles.css">`);
        document.write(`<script src="/themes/${theme}/config.js"><` + '/script>');
    });
}());

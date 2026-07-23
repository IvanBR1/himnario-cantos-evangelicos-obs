window.BibleThemeUtilities = {
    clamp(value, min, max, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
    },
    hexToRgba(hex, opacity) {
        const cleanHex = String(hex || '').replace('#', '');
        if (!/^[0-9a-f]{6}$/i.test(cleanHex)) return `rgba(23, 33, 43, ${opacity})`;
        const value = parseInt(cleanHex, 16);
        return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${opacity})`;
    },
    sanitizeText(text) {
        const element = document.createElement('div');
        element.innerHTML = text || '';
        return element.textContent || element.innerText || 'Texto no disponible';
    }
};

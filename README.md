# Himnario OBS 1.1.0

Aplicación monolítica y estática para consultar el himnario, controlar la letra mostrada y usar un visualizador como fuente de navegador en OBS.

## Rutas

- `/`: presentación del desarrollador y accesos al proyecto.
- `/panel/`: panel de búsqueda, navegación y personalización.
- `/visualizador/`: salida limpia para OBS.

No existe un servicio de consulta separado. El panel carga directamente `/data/himnario.db.json`, filtra los himnos en el navegador y construye las secuencias desde la misma base local.

## Preparación y uso local

Requiere Node.js 22.5 o posterior.

```bash
npm run build
npm start
```

Después abre:

- Presentación: `http://localhost:3000/`
- Panel: `http://localhost:3000/panel/`
- Visualizador: `http://localhost:3000/visualizador/`

En OBS agrega una fuente **Navegador** de 1920 × 1080 con la URL del visualizador. El panel y el visualizador deben usar el mismo origen porque sincronizan la selección, visibilidad, tema y ajustes mediante `localStorage`.

## Importación

`npm run build` analiza `backup/Himnario.txt` y `backup/HIMNARIO ESFORZADOR.txt`, genera la base canónica `data/himnario.db.json` y copia la versión pública a `public/data/himnario.db.json`.

La base contiene:

- 713 cantos: 550 del himnario base y 163 del Esforzador.
- 17 secciones maestras y 30 subsecciones.
- Variantes editoriales `428 a/b` y `429 a/b/c`.
- Títulos multilínea, referencias, autores y traductores.
- Estrofas, coros, indicaciones, repeticiones y saltos de línea.
- Secuencias en orden original y de interpretación con coros.

Para corregir contenido se editan los TXT conservados en `backup/` y se vuelve a ejecutar la construcción.

## Panel y visualizador

La integración conserva las funciones y apariencia del proyecto `himnario-panel-obs`:

- búsqueda por número, título, autor o traductor;
- selección entre ambas colecciones;
- navegación con botones o flechas del teclado;
- parte actual y siguiente;
- salida visible u oculta;
- estado persistente del último himno;
- temas Clásico, Libro moderno, Minimalista, Cinematográfico, Transmisión, Cristal, Editorial, Neón, Cinta y Reflector;
- posición mediante selectores horizontal y vertical;
- autoajuste tipográfico activo por defecto, con reducción de seguridad para impedir recortes;
- tipografía, colores, opacidad, ancho y efectos configurables.

Las líneas vacías y los saltos internos se presentan mediante `white-space: pre-line`. Si el TXT no numera una estrofa, el panel no inventa numeración.

Cada tema define una posición inicial, y las posiciones superior, central e inferior actúan como anclajes completos; en posición inferior, un texto largo crece hacia arriba. La referencia del visualizador incluye colección, número, título del himno, tipo de parte y progreso.

## Netlify

`netlify.toml` ejecuta `npm run build` y publica únicamente `public`. No se despliegan funciones: presentación, panel, visualizador, temas, imagen y base son archivos estáticos del mismo sitio.

## Verificación

```bash
npm test
```

Las pruebas verifican la importación editorial, la copia pública determinista, las tres rutas, los recursos estáticos, la base local y la ausencia de rutas de consulta separadas.

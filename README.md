# Himnario OBS 1.2.0

Aplicación monolítica y estática para consultar el himnario, controlar la letra mostrada y usar un visualizador como fuente de navegador en OBS.

## Rutas

- `/`: presentación de la herramienta y accesos al proyecto.
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

- Presentación: `http://localhost:3011/`
- Panel: `http://localhost:3011/panel/`
- Visualizador: `http://localhost:3011/visualizador/`

En OBS agrega una fuente **Navegador** de 1920 × 1080 con la URL del visualizador. El panel y el visualizador deben usar el mismo origen porque sincronizan la selección, visibilidad, tema y ajustes mediante `localStorage`.

## Importación

`npm run build` lee todos los TXT de `fuentes/`, genera la base canónica `data/himnario.db.json` y copia la versión pública a `public/data/himnario.db.json`. Cada TXT declara su colección, himnos, créditos y partes mediante un formato común; la importación no depende del nombre del archivo.

La base contiene:

- 714 cantos: 550 del himnario base, 163 del Esforzador y 1 extra.
- 17 secciones maestras y 30 subsecciones.
- Variantes editoriales `428 a/b` y `429 a/b/c`.
- Títulos multilínea, referencias, autores y traductores.
- Estrofas, coros, indicaciones, repeticiones y saltos de línea.
- Secuencias en orden original y de interpretación con coros.

Los extras tienen numeración independiente desde 1. Para agregar o editar cantos se modifican los TXT de `fuentes/` y se vuelve a ejecutar la construcción. Se puede crear otro TXT con cualquier nombre: los datos se declaran dentro del documento.

El formato se explica en [`fuentes/FORMATO.md`](fuentes/FORMATO.md): `@himno`, `@autor`, `@estrofa`, `@coro` y `@fin` delimitan explícitamente los datos. Cada renglón de letra sirve tanto para Original como para Línea por línea. «Desconocido» y «Anónimo» se conservan como autores, fuera de la letra.

## Panel y visualizador

La integración conserva las funciones y apariencia del proyecto `himnario-panel-obs`:

- búsqueda por número, título, autor o traductor;
- selección entre las tres colecciones;
- navegación con botones o flechas del teclado;
- parte actual y siguiente;
- selector único: Original, Con coros, Línea por línea y Con coros (línea por línea), con conteo por parte y la misma letra;
- salida visible u oculta;
- estado persistente del último himno;
- temas Clásico, Libro moderno, Minimalista, Cinematográfico, Transmisión, Cristal, Editorial, Neón, Cinta y Reflector;
- posición mediante selectores horizontal y vertical;
- autoajuste tipográfico activo por defecto, con reducción de seguridad para impedir recortes;
- tipografía, colores, opacidad, ancho y efectos configurables.

Las líneas vacías y los saltos internos se presentan mediante `white-space: pre-line`. La fuente conserva la numeración original; en pantalla se identifica cada estrofa y el contador se mantiene durante todas sus líneas.

Cada tema define una posición inicial, y las posiciones superior, central e inferior actúan como anclajes completos; en posición inferior, un texto largo crece hacia arriba. La referencia del visualizador incluye número, título del himno, tipo de parte y progreso. La portada precede a la letra y no se incluye en el conteo; muestra título y sección.

## Netlify

`netlify.toml` ejecuta `npm run build` y publica únicamente `public`. No se despliegan funciones: presentación, panel, visualizador, temas, imagen y base son archivos estáticos del mismo sitio.

## Verificación

```bash
npm test
```

Las pruebas verifican la importación editorial, la copia pública determinista, las tres rutas, los recursos estáticos, la base local y la ausencia de rutas de consulta separadas.

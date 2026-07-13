# Himnario API

API sencilla y de **solo lectura** para consultar los dos archivos del himnario. Usa SQLite mediante `node:sqlite`, por lo que no requiere instalar MySQL, SQLite CLI ni paquetes de npm.

## Requisitos

Node.js 22.5 o superior. La versión usada para preparar el proyecto fue Node 24.

## Uso

```powershell
npm run import
npm start
```

La importación crea `data/himnario.sqlite` a partir de `Himnario.txt` y `HIMNARIO ESFORZADOR.txt`. Puede ejecutarse de nuevo: sustituye íntegramente la base de datos.

El servidor escucha en `http://localhost:3000` por defecto. Puede cambiarse con `PORT`.

## Rutas de consulta

- `GET /health`
- `GET /api/collections`
- `GET /api/sections`
- `GET /api/hymns?search=jesus&collection=himnario&section=1&limit=50&offset=0`
- `GET /api/hymns/:id`
- `GET /api/hymns/:id/sequence?mode=source`
- `GET /api/hymns/:id/sequence?mode=performance`

La respuesta de un himno incluye el enlace de audio (`audioUrl`, inicialmente `null`) y sus partes. Cada parte es un párrafo completo —estrofa, coro o repetición— con `startTimeMs` y `endTimeMs`, inicialmente `null`, listos para sincronizar posteriormente con el audio. El texto conserva sus saltos internos, pero no se divide ni se cronometra línea por línea.

## Modelo de secuencia

`source` refleja el orden que aparece en el TXT. `performance` conserva ese orden y, si el TXT contiene un coro y varias estrofas, añade el coro después de cada estrofa que no lo tenga escrito inmediatamente después. Así queda preparada la reproducción que normalmente finaliza con coro. Las marcas `::` se conservan como partes de tipo `repetition` y se señalan en la secuencia.

La API no expone rutas de escritura; la carga y las futuras ediciones de tiempos/audio se harán por proceso controlado o una interfaz posterior.

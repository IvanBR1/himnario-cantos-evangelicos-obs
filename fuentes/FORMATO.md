# Formato de las fuentes

Estos TXT son la fuente editable del himnario. El importador lee todos los
archivos `.txt` de esta carpeta; su nombre no determina la colección ni los himnos.
Se pueden renombrar o dividir en varios archivos. Cada archivo comienza así:

```text
@formato himnario/1
@coleccion extras | Extras
```

`extras` es el identificador estable de la colección y `Extras` su nombre visible.
Para continuar una colección en otro archivo, repetir esa declaración. Para
crear otra colección, declarar un identificador nuevo, sin editar el importador.

## Un himno

Ejemplo para el siguiente Extra; sustituir las líneas entre `< >` por la letra
literal antes de guardarlo en un TXT:

```text
@formato himnario/1
@coleccion extras | Extras

@himno 2 | TÍTULO DEL HIMNO
@autor Desconocido

@estrofa 1
<Primera línea de la primera estrofa>
<Segunda línea de la primera estrofa>

@coro
<Primera línea del coro>
<Segunda línea del coro>

@estrofa 2
<Primera línea de la segunda estrofa>
<Última línea>

@fin
```

Agregar más bloques desde `@himno` hasta `@fin` al mismo archivo o crear otro TXT
con la cabecera completa. El número debe ser único dentro de la colección;
continuar la numeración existente. Se admiten variantes como `@himno 428 a | TÍTULO`.

## Letra y partes

- `@estrofa` abre una estrofa sin número explícito; `@estrofa 1` conserva el número
  de la fuente. No añadir números si el original no los tiene.
- `@coro` o `@coro 1` abre un coro. `@repeticion` abre un bloque de repetición.
- `@indicacion Al final` abre una parte con esa indicación, seguida de su letra.
- Una marca de parte termina la parte anterior. `@fin` termina el himno.
- Cada renglón de letra es una línea en el modo línea por línea. El modo Original
  muestra la parte completa. Se conservan palabras, puntuación y saltos internos;
  las líneas vacías entre marcas sirven para que el TXT sea legible.
- Los párrafos y coros se delimitan con marcas, nunca por mayúsculas, nombres,
  números sueltos ni por palabras como «coro» dentro de una línea cantada.
- Para escribir una línea cantada que empiece por `@`, usar `@@` al principio.
  Los comentarios `# ...` solo se admiten fuera de los himnos.
- Guardar las partes en su orden original. Si hay una referencia explícita a un
  coro ya escrito, copiar su letra bajo otro `@coro` en ese lugar. El modo Con
  coros repite por convención un único coro después de las estrofas posteriores;
  si hay varios coros escritos, respeta el orden explícito.

## Autores y otros créditos

Los créditos van después de `@himno` y antes de la primera parte. No son letra:

```text
@autor Anónimo
@autor Desconocido
@traductor Nombre del traductor
```

Usar únicamente los autores que correspondan al himno. «Anónimo» y «Desconocido»
son valores del campo autor, igual que un nombre propio. Si hay varios autores,
repetir `@autor`. Si la fuente no aporta un crédito, no se inventa uno.

También se admiten `@letrista`, `@compositor`, `@arreglista`, `@adaptador` y
`@referencia`. Un detalle opcional se escribe después de ` | `, por ejemplo:
`@autor Nombre | (Est. 2 y 3)`. `@subtitulo Texto` es opcional y también va antes
de la letra.

## Secciones opcionales

Se declaran fuera de los himnos y se aplican a los siguientes bloques:

```text
@seccion IV | JESUCRISTO, EL SEÑOR
@subseccion 1 | SU NACIMIENTO
```

La sección usa un código romano y la subsección un número. Una sección nueva
limpia la subsección anterior. `@subseccion -` quita la subsección;
`@seccion -` quita ambas. Al continuar en otro archivo hay que volver a declarar
la sección correspondiente; el contexto no depende del archivo anterior.

## Importar

Guardar como UTF-8 y ejecutar `npm run build`. Los errores indican archivo y línea;
las marcas desconocidas, los himnos duplicados y las partes vacías se rechazan.
No hay que actualizar catálogos, JSON ni listas de nombres de archivo.

La migración de los 714 himnos conserva las letras de todas sus partes y sus
créditos. Una prueba registra esa base de comparación; al cambiar deliberadamente
el repertorio habrá que actualizar las expectativas de las pruebas.

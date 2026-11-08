# Validación de las fuentes contra el documento original

La revisión del 8 de noviembre de 2026 encontró coincidencia de letras, títulos
y créditos para los 713 himnos presentes en `fuentes/Himnario Nuevo.docx`.
El archivo recibido es Word, no Excel. No se modificaron el documento, los TXT,
las letras ni los autores durante esta revisión.

| Elemento cotejado | Resultado |
| --- | --- |
| Himnario | 550 entradas, incluidas las variantes 428 a/b y 429 a/b/c |
| Himnario Esforzador | 163 entradas |
| Títulos | 713 coincidentes, reuniendo los títulos divididos en varios renglones |
| Líneas cantadas | 12,746 coincidentes en texto y orden |
| Créditos | 712 entradas localizadas y cotejadas con sus nombres o transcripciones originales |
| Marcas explícitas de estrofa, coro e indicación | Sin discrepancias con las partes importadas |
| Autores Anónimo | Conservados en 39 himnos como autor, fuera de la letra |
| Autores Desconocido | Conservados en 73 himnos como autor, fuera de la letra |
| Extras | Gozo inefable no figura en el documento y no puede validarse con esta fuente |

## Método y alcance

Se extrajeron los 18,501 párrafos del cuerpo del DOCX, incluyendo tabulaciones y
saltos explícitos de línea. Se localizaron las 713 cabeceras por número, variante
y título, y se cotejó cada bloque con la base importada desde los TXT actuales.
Los párrafos se identificaron por su posición en el XML, no por página impresa.

La comparación ignora sangría, tabulaciones y espacios de formato; conserva la
comparación de palabras, mayúsculas, acentos y puntuación. Para cotejar la letra
se separaron números de estrofa, etiquetas de coro, títulos, subtítulos, secciones
y créditos. Los saltos automáticos de renglón por ancho de página no cuentan como
líneas nuevas: se compararon párrafos y saltos explícitos del documento.

La indicación aislada `Coro 1` del Esforzador 159 se cotejó como repetición del coro
escrito anteriormente. Las 12,746 líneas incluyen esa repetición explícita. Las
marcas de parte se comprobaron en las posiciones correspondientes de la letra;
no se reinterpretaron divisiones ambiguas por razones musicales.

Los créditos se cotejaron contra su transcripción documental. Se conservaron
normalizaciones existentes como `Autor desconocido` o `Autor desconcido` en el
campo autor `Desconocido`. Esta revisión acredita la coincidencia con el documento,
no una investigación bibliográfica independiente sobre la autoría.

## Observaciones revisadas

- **Himno 545, En los campos de Judea:** el documento confirma que
  `coro angelical cantó:` es la segunda línea de la primera estrofa. El TXT actual
  la conserva completa dentro de `@estrofa 1`; no abre un coro allí.
- **Himno 527, No a nosotras, oh Jehová:** el subtítulo aparece partido entre
  los párrafos 14832 y 14833. El TXT lo reúne en `@subtitulo` sin cambiar sus palabras.
- **Portada del Esforzador:** los lemas `“Por Cristo y por su Iglesia”` y
  `“Por el triunfo del evangelio”`, párrafos 15496 y 15497, pertenecen a la portada,
  no al himno 547 que los precede. No se consideran letras faltantes.
- **Sin créditos en el documento:** Himnario 358, *Salvo navego en la nave “Salud”*;
  Himnario 428 a, *Mujeres, siervas del Maestro*; Esforzador 1, *Al pecador Jesús buscó*.
  Sus créditos siguen vacíos; no se inventó un autor ni se añadió «Desconocido».
- **Extra 1, Gozo inefable:** queda pendiente cotejar letra y autor con otra fuente
  original porque no aparece en este documento.

Documento cotejado, SHA-256:
`82ae255d088079c7ae3c2d78d3c8161c20a3ca1036c86b09ed1cfaf53ab66848`.

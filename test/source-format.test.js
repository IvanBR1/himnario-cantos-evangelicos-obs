const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { SOURCE_DIRECTORY, buildDatabase, parseSource } = require('../src/import-hymnal');

function semanticDigest(database) {
  const hymns = database.hymns.map(hymn => ({
    id: hymn.id, title: hymn.title, sourceTitle: hymn.sourceTitle, subtitle: hymn.subtitle,
    masterSectionId: hymn.masterSectionId, sectionId: hymn.sectionId,
    credits: hymn.credits.map(({ raw, ...credit }) => credit),
    parts: hymn.parts.map(({ sourceText, ...part }) => part), sequence: hymn.sequence
  })).sort((a, b) => a.id.localeCompare(b.id));
  return crypto.createHash('sha256').update(JSON.stringify(hymns)).digest('hex');
}

test('los 714 himnos conservan letras, partes y créditos anteriores a la migración', () => {
  // Captured from the reviewed corpus BEFORE replacing the old parser and TXT format.
  assert.equal(semanticDigest(buildDatabase()), '4e22c62863b0dc09f80cfc24b885383829bf24625dc9d775c50f88a195756dad');
});

function temporaryDirectory(context) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hymnal-source-test-'));
  context.after(() => {
    for (const filename of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, filename));
    fs.rmdirSync(directory);
  });
  return directory;
}

test('la importación no depende de nombres TXT ni de una lista fija de colecciones', context => {
  const directory = temporaryDirectory(context);
  fs.readdirSync(SOURCE_DIRECTORY).filter(name => name.endsWith('.txt')).reverse().forEach((name, index) => {
    fs.copyFileSync(path.join(SOURCE_DIRECTORY, name), path.join(directory, `archivo-${index}.TXT`));
  });
  assert.equal(semanticDigest(buildDatabase(directory)), semanticDigest(buildDatabase()));
  fs.writeFileSync(path.join(directory, 'cualquier-nombre.txt'), `@formato himnario/1
@coleccion nueva | Nueva colección
@himno 1 | Himno nuevo
@autor Desconocido
@estrofa
Letra de prueba.
@fin
`);
  assert.equal(buildDatabase(directory).collections.find(item => item.id === 'nueva').hymnCount, 1);
  fs.copyFileSync(path.join(directory, 'cualquier-nombre.txt'), path.join(directory, 'duplicado.txt'));
  assert.throws(() => buildDatabase(directory), /himno duplicado nueva-1/u);
});

const example = `@formato himnario/1
@coleccion prueba | Colección de prueba
@seccion I | SECCIÓN
@subseccion 1 | SUBSECCIÓN
@himno 1 | Título
@autor Anónimo
@autor Desconocido
@traductor Traductor de prueba

@estrofa 1
coro angelical cantó:
Juan Pérez
2
ESTRIBILLOS
última línea.

@coro
Amén.

@estrofa 2
Primera línea del segundo párrafo.
@@Una línea que comienza con arroba.
@fin
`;

test('el esquema distingue autores, estrofas, coros y líneas sin adivinar por el texto', () => {
  const hymn = parseSource(example, 'arbitrario.txt').hymns[0];
  assert.deepEqual(hymn.authors, ['Anónimo', 'Desconocido']);
  assert.deepEqual(hymn.translators, ['Traductor de prueba']);
  assert.deepEqual(hymn.parts.map(part => part.type), ['verse', 'chorus', 'verse']);
  assert.deepEqual(hymn.parts[0].lines, ['coro angelical cantó:', 'Juan Pérez', '2', 'ESTRIBILLOS', 'última línea.']);
  assert.equal(hymn.parts[2].lines[1], '@Una línea que comienza con arroba.');
  assert.ok(!hymn.bodyText.includes('Anónimo'));
  assert.ok(!hymn.bodyText.includes('Desconocido'));
  assert.deepEqual(hymn.sequence.performance.map(item => item.partId), [1, 2, 3, 2]);
});

test('el intérprete rechaza errores del formato e identifica archivo y línea', () => {
  assert.throws(() => parseSource(example.replace('@fin', ''), 'incompleto.txt'), /incompleto\.txt:\d+: Falta @fin/u);
  assert.throws(() => parseSource(example.replace('@estrofa 1', '@estrofa uno')), /Valor inválido/u);
  assert.throws(() => parseSource(example.replace('@formato himnario/1', '@formato otro/1')), /Se requiere @formato/u);
  assert.throws(() => parseSource(example.replace('@coro', '@constructor')), /Directiva desconocida/u);
  assert.throws(() => parseSource(example.replace('@coro', '@autor Otro')), /metadatos van antes/u);
  assert.throws(() => parseSource(example.replace('Amén.', '')), /Parte sin letra/u);
  assert.throws(() => parseSource(example.replace('@fin', '@himno 2 | Siguiente')), /Falta @fin/u);
});

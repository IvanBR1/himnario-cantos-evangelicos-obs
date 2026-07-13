const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { DATABASE_PATH } = require('../src/database');
const { importDatabase, parseHymns } = require('../src/import-hymnal');

const TEST_DATABASE_PATH = DATABASE_PATH.replace(/\.sqlite$/, '.test.sqlite');

test('se detectan ambos archivos y su numeración conserva los saltos editoriales', () => {
  const main = parseHymns({ filename: 'Himnario.txt' });
  const esforzador = parseHymns({ filename: 'HIMNARIO ESFORZADOR.txt' });
  assert.equal(main.length, 545);
  assert.equal(main.at(-1).number, 547);
  assert.equal(esforzador.length, 163);
  assert.equal(esforzador.at(-1).number, 163);
});

test('la base incluye coro, secuencia y tiempos por párrafo preparados', () => {
  importDatabase(TEST_DATABASE_PATH);
  assert.ok(fs.existsSync(TEST_DATABASE_PATH));
  const db = new DatabaseSync(TEST_DATABASE_PATH, { readOnly: true });
  const hymn = db.prepare(`SELECT h.id, h.has_chorus AS hasChorus, h.audio_url AS audioUrl
    FROM hymns h JOIN collections c ON c.id = h.collection_id
    WHERE c.slug = 'himnario' AND h.number = 2`).get();
  assert.equal(hymn.hasChorus, 1);
  assert.equal(hymn.audioUrl, null);
  const paragraphs = db.prepare(`SELECT type, text FROM hymn_parts
    WHERE hymn_id = ? ORDER BY position`).all(hymn.id);
  assert.equal(paragraphs.length, 3);
  assert.deepEqual(paragraphs.map((part) => part.type), ['verse', 'chorus', 'verse']);
  const sequence = db.prepare(`SELECT ps.position, hp.type FROM playback_sequence ps
    JOIN hymn_parts hp ON hp.id = ps.part_id
    WHERE ps.hymn_id = ? AND ps.mode = 'performance' ORDER BY ps.position`).all(hymn.id);
  assert.equal(sequence.at(-1).type, 'chorus');
  const timedParagraph = db.prepare(`SELECT start_time_ms AS startTimeMs, end_time_ms AS endTimeMs
    FROM hymn_parts WHERE hymn_id = ? ORDER BY position LIMIT 1`).get(hymn.id);
  assert.equal(timedParagraph.startTimeMs, null);
  assert.equal(timedParagraph.endTimeMs, null);
  const obsoleteTable = db.prepare(`SELECT COUNT(*) AS total FROM sqlite_master
    WHERE type = 'table' AND name = 'part_lines'`).get();
  assert.equal(obsoleteTable.total, 0);
  db.close();
  fs.rmSync(TEST_DATABASE_PATH, { force: true });
});

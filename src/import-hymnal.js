const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { DATABASE_PATH } = require('./database');

const ROOT = path.resolve(__dirname, '..');
const SOURCES = [
  { slug: 'himnario', name: 'Himnario', filename: 'Himnario.txt' },
  { slug: 'esforzador', name: 'Himnario Esforzador', filename: 'HIMNARIO ESFORZADOR.txt' }
];

function compact(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function isBlank(value) {
  return value.trim() === '';
}

function isSectionHeading(value) {
  const match = value.trim().match(/^[IVXLCDM]+\.\s+(.+)$/);
  if (!match) return false;
  const letters = match[1].replace(/[^\p{L}]/gu, '');
  return letters.length > 0 && letters === letters.toLocaleUpperCase('es-MX');
}

function isHymnHeading(lines, index, previousHymnNumber) {
  const value = lines[index].trim();
  const match = value.match(/^(\d{1,3})\.\s*\S/);
  if (!match) return false;

  // Los títulos están aislados por una línea vacía. Esto evita confundirlos
  // con "1.Primera línea de la estrofa".
  const previousIsBlank = index === 0 || isBlank(lines[index - 1]);
  const nextIsBlank = index === lines.length - 1 || isBlank(lines[index + 1]);
  const number = Number(match[1]);
  // La numeración tiene algunos saltos en los originales (por ejemplo 427 a
  // 430). Una estrofa nunca supera el número del himno actual, por lo que un
  // número mayor, aislado por blancos, identifica con seguridad el siguiente
  // título sin perder los saltos editoriales.
  return previousIsBlank && nextIsBlank && (previousHymnNumber === null ? number === 1 : number > previousHymnNumber);
}

function isCredit(lines) {
  const text = compact(lines.join(' '));
  return /^(Autor desconocido|Trad\.?|Tr\.?|Arreg\.?|M[úu]sica|Letra|En |De |[A-Z]\.?\s+[A-ZÁÉÍÓÚÜÑ][\p{L}'’.-]+|[A-ZÁÉÍÓÚÜÑ][\p{L}'’.-]+(?:\s+[A-ZÁÉÍÓÚÜÑ][\p{L}'’.-]+){1,5})$/u.test(text);
}

function toPart(group, position, implicitVerseNumber) {
  const first = group[0];
  const chorusMatch = first.match(/^Coro\s*:\s*(.*)$/i);
  const numberedMatch = first.match(/^(\d+)\.\s*(.*)$/);
  const hasRepeatMark = group.some((line) => line.includes('::'));

  let type = 'verse';
  let label = String(implicitVerseNumber);
  let lines = [...group];

  if (chorusMatch) {
    type = 'chorus';
    label = 'Coro';
    lines[0] = chorusMatch[1];
  } else if (/^:{2,}/.test(first)) {
    type = 'repetition';
    label = 'Repetición';
  } else if (numberedMatch) {
    label = numberedMatch[1];
    lines[0] = numberedMatch[2];
  }

  lines = lines.map((line) => line.replace(/^::\s?/, '').replace(/\s?::$/, '').trim()).filter(Boolean);
  return {
    type,
    label,
    position,
    repeatMarked: hasRepeatMark ? 1 : 0,
    text: lines.join('\n'),
    lines
  };
}

function splitParts(lines) {
  const content = lines.map((line) => line.trim()).filter(Boolean);

  // Los créditos están al final del himno y no forman parte de la letra.
  while (content.length && isCredit([content.at(-1)])) content.pop();

  const groups = [];
  let current = [];
  for (const line of content) {
    const startsPart = /^Coro\s*:/i.test(line) || /^\d+\.\s*\S/.test(line) || /^:{2,}/.test(line);
    if (startsPart && current.length) {
      groups.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length) groups.push(current);

  let verseNumber = 0;
  return groups.map((group, index) => {
    const isVerse = !/^Coro\s*:/i.test(group[0]) && !/^:{2,}/.test(group[0]);
    if (isVerse) verseNumber += 1;
    return toPart(group, index + 1, verseNumber || 1);
  });
}

function parseHymns(source) {
  const filePath = path.join(ROOT, source.filename);
  const lines = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  const hymns = [];
  let activeSection = null;
  let current = null;
  let previousHymnNumber = null;

  function closeCurrent() {
    if (!current) return;
    current.parts = splitParts(current.rawLines);
    if (current.parts.length) hymns.push(current);
    current = null;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (isSectionHeading(line)) {
      closeCurrent();
      const match = line.trim().match(/^([IVXLCDM]+)\.\s+(.+)$/);
      activeSection = { code: match[1], name: match[2] };
      continue;
    }
    if (isHymnHeading(lines, index, previousHymnNumber)) {
      closeCurrent();
      const match = line.trim().match(/^(\d+)\.\s*(.+)$/);
      previousHymnNumber = Number(match[1]);
      current = {
        number: Number(match[1]),
        title: compact(match[2]),
        section: activeSection,
        rawLines: []
      };
      continue;
    }
    if (current) current.rawLines.push(line);
  }
  closeCurrent();
  return hymns;
}

const schema = `
PRAGMA foreign_keys = ON;
CREATE TABLE collections (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  source_file TEXT NOT NULL
);
CREATE TABLE sections (
  id INTEGER PRIMARY KEY,
  collection_id INTEGER NOT NULL REFERENCES collections(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE(collection_id, code)
);
CREATE TABLE hymns (
  id INTEGER PRIMARY KEY,
  collection_id INTEGER NOT NULL REFERENCES collections(id),
  section_id INTEGER REFERENCES sections(id),
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  audio_url TEXT,
  has_chorus INTEGER NOT NULL DEFAULT 0,
  ends_with_chorus INTEGER NOT NULL DEFAULT 0,
  raw_ends_with_repetition INTEGER NOT NULL DEFAULT 0,
  UNIQUE(collection_id, number)
);
CREATE TABLE hymn_parts (
  id INTEGER PRIMARY KEY,
  hymn_id INTEGER NOT NULL REFERENCES hymns(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('verse', 'chorus', 'repetition')),
  label TEXT NOT NULL,
  text TEXT NOT NULL,
  repeat_marked INTEGER NOT NULL DEFAULT 0,
  start_time_ms INTEGER,
  end_time_ms INTEGER,
  CHECK(start_time_ms IS NULL OR start_time_ms >= 0),
  CHECK(end_time_ms IS NULL OR end_time_ms >= start_time_ms),
  UNIQUE(hymn_id, position)
);
CREATE TABLE playback_sequence (
  id INTEGER PRIMARY KEY,
  hymn_id INTEGER NOT NULL REFERENCES hymns(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK(mode IN ('source', 'performance')),
  position INTEGER NOT NULL,
  part_id INTEGER NOT NULL REFERENCES hymn_parts(id) ON DELETE CASCADE,
  note TEXT,
  UNIQUE(hymn_id, mode, position)
);
CREATE INDEX idx_hymns_title ON hymns(title);
CREATE INDEX idx_hymn_parts_hymn_position ON hymn_parts(hymn_id, position);
CREATE INDEX idx_playback_sequence_lookup ON playback_sequence(hymn_id, mode, position);
`;

function addSequence(insert, hymnId, mode, parts) {
  parts.forEach((part, index) => {
    insert.run(hymnId, mode, index + 1, part.id, part.note || null);
  });
}

function importDatabase(databasePath = DATABASE_PATH) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS playback_sequence;
    DROP TABLE IF EXISTS part_lines;
    DROP TABLE IF EXISTS hymn_parts;
    DROP TABLE IF EXISTS hymns;
    DROP TABLE IF EXISTS sections;
    DROP TABLE IF EXISTS collections;
  `);
  db.exec(schema);

  const insertCollection = db.prepare('INSERT INTO collections (slug, name, source_file) VALUES (?, ?, ?)');
  const insertSection = db.prepare('INSERT INTO sections (collection_id, code, name) VALUES (?, ?, ?)');
  const insertHymn = db.prepare(`INSERT INTO hymns
    (collection_id, section_id, number, title, has_chorus, ends_with_chorus, raw_ends_with_repetition)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insertPart = db.prepare(`INSERT INTO hymn_parts
    (hymn_id, position, type, label, text, repeat_marked) VALUES (?, ?, ?, ?, ?, ?)`);
  const insertSequence = db.prepare(`INSERT INTO playback_sequence
    (hymn_id, mode, position, part_id, note) VALUES (?, ?, ?, ?, ?)`);

  let hymnCount = 0;
  db.exec('BEGIN');
  try {
    for (const source of SOURCES) {
      const collectionId = Number(insertCollection.run(source.slug, source.name, source.filename).lastInsertRowid);
      const sections = new Map();
      for (const hymn of parseHymns(source)) {
        let sectionId = null;
        if (hymn.section) {
          const key = hymn.section.code;
          if (!sections.has(key)) {
            sections.set(key, Number(insertSection.run(collectionId, hymn.section.code, hymn.section.name).lastInsertRowid));
          }
          sectionId = sections.get(key);
        }

        const hasChorus = hymn.parts.some((part) => part.type === 'chorus');
        const lastPart = hymn.parts.at(-1);
        const hymnId = Number(insertHymn.run(
          collectionId,
          sectionId,
          hymn.number,
          hymn.title,
          hasChorus ? 1 : 0,
          lastPart?.type === 'chorus' ? 1 : 0,
          lastPart?.type === 'repetition' || lastPart?.repeatMarked ? 1 : 0
        ).lastInsertRowid);

        const parts = hymn.parts.map((part) => {
          const id = Number(insertPart.run(hymnId, part.position, part.type, part.label, part.text, part.repeatMarked).lastInsertRowid);
          return { ...part, id };
        });

        addSequence(insertSequence, hymnId, 'source', parts);

        const chorus = parts.find((part) => part.type === 'chorus');
        const performance = [];
        for (let index = 0; index < parts.length; index += 1) {
          const part = parts[index];
          performance.push(part);
          // Convención del himnario: un coro escrito tras la primera estrofa se
          // interpreta nuevamente después de cada estrofa posterior.
          if (chorus && part.type === 'verse' && parts[index + 1]?.type !== 'chorus') {
            performance.push({ ...chorus, note: 'Coro repetido por convención' });
          }
        }
        addSequence(insertSequence, hymnId, 'performance', performance);
        hymnCount += 1;
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.close();
  }
  return hymnCount;
}

if (require.main === module) {
  try {
    const count = importDatabase();
    console.log(`Base creada: ${DATABASE_PATH}`);
    console.log(`Himnos importados: ${count}`);
  } catch (error) {
    console.error(`Error al importar: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { parseHymns, toPart, importDatabase };

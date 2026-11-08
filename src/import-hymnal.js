const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DATABASE_PATH = path.join(ROOT, 'data', 'himnario.db.json');
const SOURCE_DIRECTORY = path.join(ROOT, 'fuentes');
const CREDIT_ROLES = { autor: 'author', traductor: 'translator', letrista: 'lyricist', compositor: 'composer',
  arreglista: 'arranger', adaptador: 'adapter', referencia: 'source' };
const PART_TYPES = { estrofa: 'verse', coro: 'chorus', repeticion: 'repetition', indicacion: 'instruction' };

function trimBlankEdges(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start++;
  while (end > start && !lines[end - 1].trim()) end--;
  return lines.slice(start, end);
}

function romanOrdinal(code) {
  const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  return [...code].reduce((sum, character, index) => sum
    + (values[character] < (values[code[index + 1]] || 0) ? -values[character] : values[character]), 0);
}

function parseSource(text, filename = '<fuente>') {
  const result = { collections: [], masterSections: [], sections: [], hymns: [] };
  const lines = text.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n').split('\n');
  let hasFormat = false;
  let collection = null;
  let masterSection = null;
  let section = null;
  let hymn = null;
  let part = null;
  let lineNumber = 0;
  function requireValue(condition, message) {
    if (!condition) throw new Error(`${filename}:${lineNumber}: ${message}`);
  }
  const fields = value => value.split(' | ').map(field => field.trim());
  function closePart() {
    if (!part) return;
    const content = trimBlankEdges(part.lines);
    requireValue(content.some(line => line.trim()), 'Parte sin letra');
    const position = hymn.parts.length + 1;
    const depth = Math.max(0, ...content.flatMap(line => [...line.matchAll(/:{2,}/gu)].map(match => match[0].length)));
    hymn.parts.push({ id: position, position, type: part.type, label: part.label, number: part.number,
      explicitNumber: part.number !== null, repeatMarked: depth >= 2, repeatDepth: depth || null,
      text: content.join('\n'), lines: content, sourceText: content.join('\n') });
    part = null;
  }
  function closeHymn() {
    closePart();
    requireValue(hymn.parts.length > 0, 'Himno sin partes');
    hymn.bodyText = hymn.parts.map(part => part.text).join('\n\n');
    hymn.sourceText = hymn.bodyText;
    hymn.authors = hymn.credits.filter(credit => credit.role === 'author').map(credit => credit.name);
    hymn.translators = hymn.credits.filter(credit => credit.role === 'translator').map(credit => credit.name);
    hymn.hasChorus = hymn.parts.some(part => part.type === 'chorus');
    hymn.endsWithChorus = hymn.parts.at(-1).type === 'chorus';
    hymn.hasRepetitions = hymn.parts.some(part => part.repeatMarked);
    hymn.sequence = buildPerformanceSequence(hymn.parts);
    hymn.source.endLine = lineNumber;
    result.hymns.push(hymn);
    hymn = null;
  }
  for (let index = 0; index < lines.length; index++) {
    lineNumber = index + 1;
    const line = lines[index];
    if (line.startsWith('@@')) {
      requireValue(part, 'Letra fuera de una parte');
      part.lines.push(line.slice(1));
      continue;
    }
    if (!line.startsWith('@')) {
      if (part) part.lines.push(line);
      else requireValue(!line.trim() || (!hymn && line.startsWith('#')), 'Texto fuera de una parte; falta @estrofa o @coro');
      continue;
    }
    const match = line.match(/^@([a-z]+)(?:\s+(.*))?$/u);
    requireValue(match, 'Directiva inválida; usar @@ para una línea cantada que empieza con @');
    const [, command, rawValue = ''] = match;
    const value = rawValue.trim();
    if (command === 'formato') {
      requireValue(!hasFormat && !collection && value === 'himnario/1', 'Se requiere @formato himnario/1 una sola vez al inicio');
      hasFormat = true;
      continue;
    }
    requireValue(hasFormat, 'Falta @formato himnario/1');
    if (command === 'coleccion') {
      requireValue(!hymn, 'Falta @fin antes de cambiar de colección');
      const [id, name, extra] = fields(value);
      requireValue(/^[a-z][a-z0-9-]*$/u.test(id) && name && extra === undefined, 'Usar @coleccion identificador | Nombre');
      collection = { id, slug: id, name };
      result.collections.push(collection);
      masterSection = section = null;
      continue;
    }
    requireValue(collection, 'Falta @coleccion');
    if (command === 'seccion' || command === 'subseccion') {
      requireValue(!hymn, 'Falta @fin antes de cambiar de sección');
      if (value === '-') {
        if (command === 'seccion') masterSection = null;
        section = null;
        continue;
      }
      const [code, name, extra] = fields(value);
      requireValue(name && extra === undefined, 'La sección necesita código | Nombre');
      if (command === 'seccion') {
        requireValue(/^[IVXLCDM]+$/u.test(code), 'La sección usa un código romano');
        masterSection = { id: `${collection.id}-${code.toLowerCase()}`, collectionId: collection.id,
          code, ordinal: romanOrdinal(code), name, sourceCode: code, sourceLabel: `${code}. ${name}`, normalized: false };
        result.masterSections.push(masterSection);
        section = null;
      } else {
        requireValue(masterSection && /^[1-9]\d*$/u.test(code), 'La subsección necesita sección y número positivo');
        section = { id: `${masterSection.id}-${Number(code)}`, collectionId: collection.id,
          masterSectionId: masterSection.id, number: Number(code), name, sourceLabel: `${code}. ${name}` };
        result.sections.push(section);
      }
      continue;
    }
    if (command === 'himno') {
      requireValue(!hymn, 'Falta @fin antes del siguiente himno');
      const [identifier, title, extra] = fields(value);
      const numberMatch = identifier.match(/^([1-9]\d*)(?:\s+([a-z]))?$/u);
      requireValue(numberMatch && Number.isSafeInteger(Number(numberMatch[1])) && title && extra === undefined,
        'Usar @himno número [variante] | Título');
      const number = Number(numberMatch[1]);
      const variant = numberMatch[2] || null;
      hymn = { id: `${collection.id}-${number}${variant || ''}`, collectionId: collection.id,
        masterSectionId: masterSection?.id || null, sectionId: section?.id || null,
        number, variant, displayNumber: variant ? `${number} ${variant}` : String(number),
        title: title.toLocaleUpperCase('es-MX'), titleLines: [title.toLocaleUpperCase('es-MX')],
        sourceTitle: title, sourceTitleLines: [title], subtitle: null, credits: [], parts: [],
        source: { file: filename, startLine: lineNumber, endLine: null } };
      continue;
    }
    requireValue(hymn, `@${command} necesita un himno abierto`);
    if (command === 'fin') {
      requireValue(!value, '@fin no admite texto');
      closeHymn();
    } else if (command === 'subtitulo' || Object.hasOwn(CREDIT_ROLES, command)) {
      requireValue(!part && !hymn.parts.length && value, 'Los metadatos van antes de la letra');
      if (command === 'subtitulo') {
        requireValue(!hymn.subtitle, 'Subtítulo duplicado');
        hymn.subtitle = value;
      } else {
        const [name, details, extra] = fields(value);
        requireValue(name && extra === undefined, 'Crédito inválido');
        hymn.credits.push({ role: CREDIT_ROLES[command], name, ...(details ? { details } : {}), raw: value });
      }
    } else if (Object.hasOwn(PART_TYPES, command)) {
      closePart();
      const numbered = command === 'estrofa' || command === 'coro';
      requireValue(numbered ? !value || /^[1-9]\d*$/u.test(value) : command === 'indicacion' ? Boolean(value) : !value,
        `Valor inválido para @${command}`);
      const number = numbered && value ? Number(value) : null;
      part = { type: PART_TYPES[command], number, lines: [], label: command === 'coro' ? (value ? `Coro ${value}` : 'Coro')
        : command === 'indicacion' ? `[${value}]` : value || null };
    } else requireValue(false, `Directiva desconocida: @${command}`);
  }
  requireValue(hasFormat && result.collections.length, 'Fuente sin formato o colección');
  requireValue(!hymn, 'Falta @fin al final del himno');
  return result;
}

function buildDatabase(sourceDirectory = SOURCE_DIRECTORY) {
  const definitions = { collections: new Map(), masterSections: new Map(), sections: new Map() };
  const hymns = new Map();
  const filenames = fs.readdirSync(sourceDirectory).filter(name => name.toLowerCase().endsWith('.txt')).sort();
  if (!filenames.length) throw new Error('No hay fuentes TXT para importar');
  for (const filename of filenames) {
    const parsed = parseSource(fs.readFileSync(path.join(sourceDirectory, filename), 'utf8'), filename);
    for (const [kind, entries] of Object.entries(definitions)) {
      for (const entry of parsed[kind]) {
        if (entries.has(entry.id) && JSON.stringify(entries.get(entry.id)) !== JSON.stringify(entry)) {
          throw new Error(`${filename}: definición incompatible de ${entry.id}`);
        }
        entries.set(entry.id, entry);
      }
    }
    for (const hymn of parsed.hymns) {
      if (hymns.has(hymn.id)) throw new Error(`${filename}: himno duplicado ${hymn.id}`);
      hymns.set(hymn.id, hymn);
    }
  }
  const collectionOrder = [...definitions.collections.values()].sort((a, b) => {
    const firstSection = id => Math.min(Infinity, ...[...definitions.masterSections.values()]
      .filter(section => section.collectionId === id).map(section => section.ordinal));
    return firstSection(a.id) - firstSection(b.id) || a.name.localeCompare(b.name, 'es');
  });
  const collectionRank = new Map(collectionOrder.map((entry, index) => [entry.id, index]));
  const allHymns = [...hymns.values()].sort((a, b) => collectionRank.get(a.collectionId) - collectionRank.get(b.collectionId)
    || a.number - b.number || (a.variant || '').localeCompare(b.variant || ''));
  return { schemaVersion: 2, description: 'Base local generada desde los TXT estructurados de fuentes/.',
    collections: collectionOrder.map(entry => ({ ...entry,
      hymnCount: allHymns.filter(hymn => hymn.collectionId === entry.id).length })),
    masterSections: [...definitions.masterSections.values()].sort((a, b) => a.ordinal - b.ordinal).map(entry => ({ ...entry,
      hymnCount: allHymns.filter(hymn => hymn.masterSectionId === entry.id).length })),
    sections: [...definitions.sections.values()].map(entry => ({ ...entry,
      hymnCount: allHymns.filter(hymn => hymn.sectionId === entry.id).length })), hymns: allHymns };
}

function importDatabase(databasePath = DATABASE_PATH) {
  const database = buildDatabase();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
  return { path: databasePath, collectionCount: database.collections.length,
    sectionCount: database.sections.length, hymnCount: database.hymns.length };
}

if (require.main === module) {
  try {
    const result = importDatabase();
    console.log(`Base creada: ${result.path}\nColecciones: ${result.collectionCount}\nHimnos importados: ${result.hymnCount}`);
  } catch (error) {
    console.error(`Error al importar: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { DATABASE_PATH, SOURCE_DIRECTORY, buildDatabase, importDatabase, parseSource };

function buildPerformanceSequence(parts) {
  const sourceSequence = parts.map((part) => ({
    position: part.position,
    partId: part.id,
    repeated: false,
    note: null
  }));
  const choruses = parts.filter((part) => part.type === 'chorus');
  if (choruses.length !== 1) return { source: sourceSequence, performance: sourceSequence };

  const chorus = choruses[0];
  const performance = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    performance.push({
      position: performance.length + 1,
      partId: part.id,
      repeated: false,
      note: null
    });
    if (
      part.type === 'verse'
      && part.position > chorus.position
      && parts[index + 1]?.type !== 'chorus'
    ) {
      performance.push({
        position: performance.length + 1,
        partId: chorus.id,
        repeated: true,
        note: 'Coro repetido por convención'
      });
    }
  }
  return { source: sourceSequence, performance };
}

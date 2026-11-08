const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DATABASE_PATH = path.join(ROOT, 'data', 'himnario.db.json');

const SOURCES = [
  {
    slug: 'himnario',
    name: 'Himnario',
    filename: 'Himnario.txt',
    firstMasterSectionOrdinal: 1
  },
  {
    slug: 'esforzador',
    name: 'Himnario Esforzador',
    filename: 'Himnario Esforzador.txt',
    firstMasterSectionOrdinal: 17
  },
  {
    slug: 'extras',
    name: 'Extras',
    filename: 'Extras.txt',
    firstMasterSectionOrdinal: 18
  }
];

function compact(value) {
  return value.replace(/\s+/gu, ' ').trim();
}

function trimOuterBlankLines(lines) {
  const result = [...lines];
  while (result.length && result[0].trim() === '') result.shift();
  while (result.length && result.at(-1).trim() === '') result.pop();
  return result;
}

function isUppercaseText(value) {
  const letters = value.replace(/[^\p{L}]/gu, '');
  return letters.length > 0 && letters === letters.toLocaleUpperCase('es-MX');
}

function parseRoman(value) {
  const numerals = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  let previous = 0;
  for (const character of [...value].reverse()) {
    const current = numerals[character] || 0;
    total += current < previous ? -current : current;
    previous = Math.max(previous, current);
  }
  return total;
}

function parseSectionHeading(line) {
  const match = line.match(/^\s*([IVXLCDM]+)(\.)?\s+(.+?)\s*$/u);
  if (!match || !isUppercaseText(match[3])) return null;
  return {
    sourceCode: match[1],
    sourceLabel: compact(line),
    hasSourcePeriod: Boolean(match[2]),
    name: compact(match[3])
  };
}

function parseHymnHeading(line, previousHeading) {
  const match = line.match(/^\s*(\d{1,3})(?:\s*([a-z]))?\.\s*(.+?)\s*$/iu);
  if (!match) return null;
  const title = compact(match[3]);
  if (!isUppercaseText(title) && !/^\p{Ll}/u.test(title)) return null;
  const number = Number(match[1]);
  const variant = match[2]?.toLocaleLowerCase('es-MX') || null;
  if (previousHeading) {
    const isNextNumber = number > previousHeading.number;
    const isNextVariant = number === previousHeading.number
      && variant
      && (!previousHeading.variant || variant > previousHeading.variant);
    if (!isNextNumber && !isNextVariant) return null;
  }
  return {
    number,
    variant,
    displayNumber: variant ? `${number} ${variant}` : String(number),
    title
  };
}

function parseSubsectionHeading(line, previousHeading) {
  if (!previousHeading) return null;
  const match = line.match(/^(\d{1,2})\.?\s+(.+?)\s*$/u);
  if (!match || !isUppercaseText(match[2])) return null;
  const number = Number(match[1]);
  if (number >= previousHeading.number) return null;
  return { number, name: compact(match[2]), sourceLabel: compact(line) };
}

function isProperName(value) {
  const cleaned = value.replace(/[.,;:]+$/u, '').trim();
  const words = cleaned.split(/\s+/u);
  if (words.length > 9) return false;
  if (/(?:^|\s)(?:Am[ée]n|Dios|Cristo|Jes[úu]s|Señor|Salvador|Salvaci[óo]n|Jehov[áa]|Trinidad)(?:\s|$)/u.test(cleaned)) {
    return false;
  }
  const connector = /^(?:de|del|la|las|los|y|e)$/iu;
  const nameWord = /^(?:[\p{Lu}ÁÉÍÓÚÜÑ]\.?|[\p{Lu}ÁÉÍÓÚÜÑ][\p{L}'’.-]*)$/u;
  return words.every((word) => connector.test(word) || nameWord.test(word));
}

function parseCredit(line) {
  const raw = line.trim();
  if (!raw) return null;

  let match = raw.match(/^(?:Trad(?:ucci[óo]n)?\.?\s+|Tr\.\s*)(.+)$/iu);
  if (match) return { role: 'translator', name: compact(match[1]), raw };

  match = raw.match(/^Autor(?:a)?\s*:?\s*(.+)$/iu);
  if (match) {
    const name = /desconocido|desconcido/iu.test(match[1]) ? 'Desconocido' : compact(match[1]);
    return { role: 'author', name, raw };
  }

  match = raw.match(/^(Letra|M[úu]sica|Arreg(?:lo)?|Adapt(?:aci[óo]n)?|Vers(?:i[óo]n)?)\.?\s*:?\s*(.+)$/iu);
  if (match) {
    const roles = {
      letra: 'lyricist',
      música: 'composer',
      musica: 'composer',
      arreg: 'arranger',
      arreglo: 'arranger',
      adapt: 'adapter',
      adaptación: 'adapter',
      adaptacion: 'adapter',
      vers: 'adapter',
      versión: 'adapter',
      version: 'adapter'
    };
    return { role: roles[match[1].toLocaleLowerCase('es-MX')] || 'credit', name: compact(match[2]), raw };
  }

  if (/^An[óo]nimo\.?$/iu.test(raw)) return { role: 'author', name: 'Anónimo', raw };
  if (/^En\s+Estrella\s+de\s+Bel[ée]n\.?$/iu.test(raw)) {
    return { role: 'source', name: raw.replace(/\.$/u, ''), raw };
  }
  match = raw.match(/^(.+?)\s+(\([^()]+\))$/u);
  if (match && isProperName(match[1])) {
    return {
      role: 'author',
      name: match[1].replace(/\.$/u, ''),
      details: match[2],
      raw
    };
  }
  if (isProperName(raw)) {
    return { role: 'author', name: raw.replace(/\s+y\s*$/iu, '').replace(/\.$/u, ''), raw };
  }
  return null;
}

function extractCredits(lines) {
  const filtered = trimOuterBlankLines(lines).filter((line) => {
    const value = line.trim();
    return value !== 'ESTRIBILLOS'
      && !/^\d{1,3}$/u.test(value)
      && !/^[\p{Lu}ÁÉÍÓÚÜÑ][\p{Lu}ÁÉÍÓÚÜÑ ]{3,}\s{2,}\d{1,3}$/u.test(value);
  });
  const content = trimOuterBlankLines(filtered);
  const credits = [];

  while (content.length) {
    const credit = parseCredit(content.at(-1));
    if (!credit) break;
    credits.unshift(credit);
    content.pop();
    while (content.length && content.at(-1).trim() === '') content.pop();
  }

  return { bodyLines: content, credits };
}

function extractTitleMetadata(lines, headingTitle) {
  const content = trimOuterBlankLines(lines);
  const titleLines = [headingTitle];
  const subtitleLines = [];

  while (
    content.length
    && !content[0].trim().startsWith('(')
    && isUppercaseText(content[0])
    && !/^(?:Coro|\d+\.)\s*/iu.test(content[0].trim())
  ) {
    titleLines.push(compact(content.shift()));
  }

  while (content.length && content[0].trim() === '') content.shift();

  if (content[0]?.trim().startsWith('(')) {
    do {
      const line = content.shift();
      subtitleLines.push(compact(line));
      if (line.trim().endsWith(')')) break;
    } while (content.length && content[0].trim() !== '');
    while (content.length && content[0].trim() === '') content.shift();
  } else if (
    content[0]
    && !/^\d+\.\s*/u.test(content[0].trim())
    && /\d+(?:[.:]\d+)?/u.test(content[0])
    && content[0].trim().length <= 80
  ) {
    subtitleLines.push(compact(content.shift()));
    while (content.length && content[0].trim() === '') content.shift();
  }

  return {
    title: compact(titleLines.join(' ')),
    titleLines,
    subtitle: subtitleLines.length ? compact(subtitleLines.join(' ')) : null,
    content
  };
}

function parsePartMarker(value) {
  const chorus = value.match(/^Coro\b(?:\s+(\d+))?\s*:?\s*(.*)$/iu);
  if (chorus) {
    const label = chorus[1] ? `Coro ${chorus[1]}` : 'Coro';
    return {
      type: 'chorus',
      label,
      number: chorus[1] ? Number(chorus[1]) : null,
      explicitNumber: Boolean(chorus[1]),
      content: chorus[2]
    };
  }

  const verse = value.match(/^(\d{1,2})\.\s*(.*)$/u);
  if (verse) {
    return {
      type: 'verse',
      label: verse[1],
      number: Number(verse[1]),
      explicitNumber: true,
      content: verse[2]
    };
  }

  const instruction = value.match(/^\[([^\]]+)\]\s*(.*)$/u);
  if (instruction) {
    return {
      type: 'instruction',
      label: `[${compact(instruction[1])}]`,
      number: null,
      explicitNumber: false,
      content: instruction[2]
    };
  }

  return null;
}

function repeatDepth(lines) {
  let depth = 0;
  for (const line of lines) {
    for (const match of line.matchAll(/:{2,}/gu)) depth = Math.max(depth, match[0].length);
  }
  return depth;
}

function finalizePart(part, position) {
  const normalizedLines = trimOuterBlankLines(part.lines).map((line) => line.trim());
  const sourceLines = trimOuterBlankLines(part.sourceLines).map((line) => line.replace(/\s+$/u, ''));
  const depth = repeatDepth(normalizedLines);
  return {
    id: position,
    position,
    type: part.type,
    label: part.label,
    number: part.number,
    explicitNumber: part.explicitNumber,
    repeatMarked: depth >= 2,
    repeatDepth: depth || null,
    text: normalizedLines.join('\n'),
    lines: normalizedLines,
    sourceText: sourceLines.join('\n')
  };
}

function splitParts(lines) {
  const content = trimOuterBlankLines(lines).map((line) => line.replace(/\s+$/u, ''));
  const parts = [];
  let current = null;
  let pendingBlank = false;

  function closeCurrent() {
    if (!current) return;
    parts.push(finalizePart(current, parts.length + 1));
    current = null;
    pendingBlank = false;
  }

  function startPart(marker, originalLine) {
    current = {
      type: marker?.type || (/^:{2,}/u.test(originalLine.trim()) ? 'repetition' : 'verse'),
      label: marker?.label || null,
      number: marker?.number ?? null,
      explicitNumber: marker?.explicitNumber || false,
      lines: [],
      sourceLines: [originalLine]
    };
    const firstContent = marker ? marker.content : originalLine.trim();
    if (firstContent) current.lines.push(firstContent);
  }

  for (const originalLine of content) {
    const value = originalLine.trim();
    if (!value) {
      pendingBlank = Boolean(current);
      continue;
    }

    const marker = parsePartMarker(value);
    const startsRepeatedBlock = pendingBlank && /^:{2,}/u.test(value);
    const repeatBlockClosed = current?.type === 'repetition'
      && /:{2,}\s*$/u.test(current.lines.at(-1));
    const startsImplicitParagraph = pendingBlank
      && current
      && !current.explicitNumber
      && current.type !== 'chorus'
      && (current.type !== 'repetition' || repeatBlockClosed);

    if (marker || startsRepeatedBlock || startsImplicitParagraph) closeCurrent();
    if (marker?.type === 'chorus' && !marker.content) {
      const referenced = parts.find((part) => part.type === 'chorus' && part.number === marker.number);
      if (referenced) {
        const position = parts.length + 1;
        parts.push({ ...referenced, id: position, position, sourceText: originalLine });
        continue;
      }
    }
    if (!current) {
      startPart(marker, originalLine);
      pendingBlank = false;
      continue;
    }

    if (pendingBlank) {
      current.lines.push('');
      current.sourceLines.push('');
    }
    current.lines.push(value);
    current.sourceLines.push(originalLine);
    pendingBlank = false;
  }
  closeCurrent();
  return parts.filter((part) => part.text);
}

function parseHymns(source) {
  const filePath = path.join(ROOT, 'backup', source.filename);
  const raw = fs.readFileSync(filePath, 'utf8')
    .replace(/^\uFEFF/u, '')
    .replace(/\r\n?/gu, '\n');
  const lines = raw.split('\n');
  const hymns = [];
  const masterSectionDefinitions = [];
  const sectionDefinitions = [];
  let currentMasterSection = null;
  let currentSection = null;
  let current = null;
  let previousHymnHeading = null;

  function closeCurrent(endLine) {
    if (!current) return;
    const metadata = extractTitleMetadata(current.rawLines, current.headingTitle);
    const { bodyLines, credits } = extractCredits(metadata.content);
    const normalizedBodyLines = trimOuterBlankLines(bodyLines).map((line) => line.trim());
    const parts = splitParts(bodyLines);
    current.sourceTitle = metadata.title;
    current.sourceTitleLines = metadata.titleLines;
    current.title = isUppercaseText(metadata.title)
      ? metadata.title
      : metadata.title.toLocaleUpperCase('es-MX');
    current.titleLines = metadata.titleLines.map((line) => (
      isUppercaseText(line) ? line : line.toLocaleUpperCase('es-MX')
    ));
    current.subtitle = metadata.subtitle;
    current.credits = credits;
    current.authors = credits.filter((credit) => credit.role === 'author').map((credit) => credit.name);
    current.translators = credits.filter((credit) => credit.role === 'translator').map((credit) => credit.name);
    current.bodyText = normalizedBodyLines.join('\n');
    current.sourceText = trimOuterBlankLines(bodyLines).map((line) => line.replace(/\s+$/u, '')).join('\n');
    current.parts = parts;
    current.source.endLine = endLine;
    delete current.headingTitle;
    delete current.rawLines;
    hymns.push(current);
    current = null;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const sectionHeading = parseSectionHeading(line);
    if (sectionHeading) {
      closeCurrent(index);
      const expectedOrdinal = source.firstMasterSectionOrdinal + masterSectionDefinitions.length;
      const sourceOrdinal = parseRoman(sectionHeading.sourceCode);
      const ordinal = sourceOrdinal !== expectedOrdinal ? expectedOrdinal : sourceOrdinal;
      const code = ordinal === sourceOrdinal
        ? sectionHeading.sourceCode
        : ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII'][ordinal - 1];
      currentMasterSection = {
        id: `${source.slug}-${code.toLocaleLowerCase('es-MX')}`,
        collectionId: source.slug,
        code,
        ordinal,
        name: sectionHeading.name,
        sourceCode: sectionHeading.sourceCode,
        sourceLabel: sectionHeading.sourceLabel,
        normalized: code !== sectionHeading.sourceCode || !sectionHeading.hasSourcePeriod
      };
      masterSectionDefinitions.push(currentMasterSection);
      currentSection = null;
      continue;
    }

    const heading = parseHymnHeading(line, previousHymnHeading);
    if (heading) {
      closeCurrent(index);
      previousHymnHeading = heading;
      current = {
        id: `${source.slug}-${heading.number}${heading.variant || ''}`,
        collectionId: source.slug,
        masterSectionId: currentMasterSection?.id || null,
        sectionId: currentSection?.id || null,
        number: heading.number,
        variant: heading.variant,
        displayNumber: heading.displayNumber,
        headingTitle: heading.title,
        rawLines: [],
        source: {
          file: source.filename,
          startLine: index + 1,
          endLine: null
        }
      };
      continue;
    }

    const subsectionHeading = parseSubsectionHeading(line, previousHymnHeading);
    if (subsectionHeading && currentMasterSection) {
      closeCurrent(index);
      currentSection = {
        id: `${currentMasterSection.id}-${subsectionHeading.number}`,
        collectionId: source.slug,
        masterSectionId: currentMasterSection.id,
        number: subsectionHeading.number,
        name: subsectionHeading.name,
        sourceLabel: subsectionHeading.sourceLabel
      };
      sectionDefinitions.push(currentSection);
      continue;
    }

    if (current) current.rawLines.push(line);
  }
  closeCurrent(lines.length);

  return {
    hymns,
    masterSections: masterSectionDefinitions,
    sections: sectionDefinitions
  };
}

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

function buildDatabase() {
  const collections = [];
  const masterSections = [];
  const sections = [];
  const hymns = [];

  for (const source of SOURCES) {
    const parsed = parseHymns(source);
    masterSections.push(...parsed.masterSections);
    sections.push(...parsed.sections);
    for (const hymn of parsed.hymns) {
      const sequence = buildPerformanceSequence(hymn.parts);
      hymns.push({
        ...hymn,
        hasChorus: hymn.parts.some((part) => part.type === 'chorus'),
        endsWithChorus: hymn.parts.at(-1)?.type === 'chorus',
        hasRepetitions: hymn.parts.some((part) => part.repeatMarked),
        sequence
      });
    }
    collections.push({
      id: source.slug,
      slug: source.slug,
      name: source.name,
      sourceFile: source.filename,
      hymnCount: parsed.hymns.length
    });
  }

  const hymnCountBySection = new Map();
  const hymnCountByMasterSection = new Map();
  for (const hymn of hymns) {
    hymnCountBySection.set(hymn.sectionId, (hymnCountBySection.get(hymn.sectionId) || 0) + 1);
    hymnCountByMasterSection.set(
      hymn.masterSectionId,
      (hymnCountByMasterSection.get(hymn.masterSectionId) || 0) + 1
    );
  }

  return {
    schemaVersion: 2,
    description: 'Base local de solo lectura generada desde los archivos TXT del himnario.',
    collections,
    masterSections: masterSections.map((masterSection) => ({
      ...masterSection,
      hymnCount: hymnCountByMasterSection.get(masterSection.id) || 0
    })),
    sections: sections.map((section) => ({
      ...section,
      hymnCount: hymnCountBySection.get(section.id) || 0
    })),
    hymns
  };
}

function importDatabase(databasePath = DATABASE_PATH) {
  const database = buildDatabase();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
  return {
    path: databasePath,
    collectionCount: database.collections.length,
    sectionCount: database.sections.length,
    hymnCount: database.hymns.length
  };
}

if (require.main === module) {
  try {
    const result = importDatabase();
    console.log(`Base creada: ${result.path}`);
    console.log(`Colecciones: ${result.collectionCount}`);
    console.log(`Secciones: ${result.sectionCount}`);
    console.log(`Himnos importados: ${result.hymnCount}`);
  } catch (error) {
    console.error(`Error al importar: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  DATABASE_PATH,
  SOURCES,
  buildDatabase,
  importDatabase,
  parseCredit,
  parseHymns,
  parseHymnHeading,
  parseSectionHeading,
  parseSubsectionHeading,
  splitParts
};

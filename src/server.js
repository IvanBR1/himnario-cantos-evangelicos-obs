const http = require('node:http');
const { openDatabase } = require('./database');

const PORT = Number(process.env.PORT || 3000);
const MAX_LIMIT = 100;

function json(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  response.end(JSON.stringify(payload));
}

function parsePagination(query) {
  const limit = Math.min(Math.max(Number(query.get('limit')) || 50, 1), MAX_LIMIT);
  const offset = Math.max(Number(query.get('offset')) || 0, 0);
  return { limit, offset };
}

function listHymns(db, query) {
  const { limit, offset } = parsePagination(query);
  const clauses = [];
  const values = [];
  const search = query.get('search')?.trim();
  if (search) {
    clauses.push('LOWER(h.title) LIKE LOWER(?)');
    values.push(`%${search}%`);
  }
  if (query.get('collection')) {
    clauses.push('c.slug = ?');
    values.push(query.get('collection'));
  }
  if (query.get('section')) {
    clauses.push('s.code = ?');
    values.push(query.get('section'));
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT h.id, h.number, h.title, h.audio_url AS audioUrl,
    h.has_chorus AS hasChorus, h.ends_with_chorus AS endsWithChorus,
    h.raw_ends_with_repetition AS rawEndsWithRepetition,
    c.slug AS collection, c.name AS collectionName, s.code AS sectionCode, s.name AS sectionName
    FROM hymns h JOIN collections c ON c.id = h.collection_id
    LEFT JOIN sections s ON s.id = h.section_id ${where}
    ORDER BY c.id, h.number LIMIT ? OFFSET ?`).all(...values, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) AS total FROM hymns h
    JOIN collections c ON c.id = h.collection_id LEFT JOIN sections s ON s.id = h.section_id ${where}`).get(...values).total;
  return { total, limit, offset, items: rows };
}

function getHymn(db, id) {
  const hymn = db.prepare(`SELECT h.id, h.number, h.title, h.audio_url AS audioUrl,
    h.has_chorus AS hasChorus, h.ends_with_chorus AS endsWithChorus,
    h.raw_ends_with_repetition AS rawEndsWithRepetition,
    c.slug AS collection, c.name AS collectionName, s.code AS sectionCode, s.name AS sectionName
    FROM hymns h JOIN collections c ON c.id = h.collection_id
    LEFT JOIN sections s ON s.id = h.section_id WHERE h.id = ?`).get(id);
  if (!hymn) return null;
  const parts = db.prepare(`SELECT id, position, type, label, text, repeat_marked AS repeatMarked,
    start_time_ms AS startTimeMs, end_time_ms AS endTimeMs FROM hymn_parts WHERE hymn_id = ? ORDER BY position`).all(id);
  return { ...hymn, parts };
}

function getSequence(db, id, mode) {
  return db.prepare(`SELECT ps.position, ps.note, hp.id AS partId, hp.type, hp.label, hp.text,
    hp.repeat_marked AS repeatMarked, hp.start_time_ms AS startTimeMs, hp.end_time_ms AS endTimeMs
    FROM playback_sequence ps
    JOIN hymn_parts hp ON hp.id = ps.part_id WHERE ps.hymn_id = ? AND ps.mode = ? ORDER BY ps.position`).all(id, mode);
}

const server = http.createServer((request, response) => {
  try {
    if (request.method !== 'GET') return json(response, 405, { error: 'Solo se permiten consultas GET.' });
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const db = openDatabase();
    try {
      if (url.pathname === '/health') return json(response, 200, { ok: true });
      if (url.pathname === '/api/collections') {
        const items = db.prepare(`SELECT c.slug, c.name, c.source_file AS sourceFile, COUNT(h.id) AS hymnCount
          FROM collections c LEFT JOIN hymns h ON h.collection_id = c.id GROUP BY c.id ORDER BY c.id`).all();
        return json(response, 200, { items });
      }
      if (url.pathname === '/api/sections') {
        const items = db.prepare(`SELECT c.slug AS collection, s.code, s.name, COUNT(h.id) AS hymnCount
          FROM sections s JOIN collections c ON c.id = s.collection_id
          LEFT JOIN hymns h ON h.section_id = s.id GROUP BY s.id ORDER BY c.id, s.id`).all();
        return json(response, 200, { items });
      }
      if (url.pathname === '/api/hymns') return json(response, 200, listHymns(db, url.searchParams));
      const sequenceMatch = url.pathname.match(/^\/api\/hymns\/(\d+)\/sequence$/);
      if (sequenceMatch) {
        const mode = url.searchParams.get('mode') === 'source' ? 'source' : 'performance';
        const hymn = getHymn(db, Number(sequenceMatch[1]));
        if (!hymn) return json(response, 404, { error: 'Himno no encontrado.' });
        return json(response, 200, { hymnId: hymn.id, mode, endsWithChorus: Boolean(hymn.endsWithChorus), items: getSequence(db, hymn.id, mode) });
      }
      const hymnMatch = url.pathname.match(/^\/api\/hymns\/(\d+)$/);
      if (hymnMatch) {
        const hymn = getHymn(db, Number(hymnMatch[1]));
        return hymn ? json(response, 200, hymn) : json(response, 404, { error: 'Himno no encontrado.' });
      }
      return json(response, 404, { error: 'Ruta no encontrada.' });
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(error);
    return json(response, 500, { error: 'No fue posible consultar la base de datos.' });
  }
});

server.listen(PORT, () => console.log(`Himnario API disponible en http://localhost:${PORT}`));

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATABASE_PATH = path.resolve(__dirname, '..', 'data', 'himnario.sqlite');

function openDatabase() {
  if (!fs.existsSync(DATABASE_PATH)) {
    throw new Error('No existe data/himnario.sqlite. Ejecuta primero: npm run import');
  }

  const db = new DatabaseSync(DATABASE_PATH, { readOnly: true });
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

module.exports = { DATABASE_PATH, openDatabase };

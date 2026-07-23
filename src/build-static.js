const fs = require('node:fs');
const path = require('node:path');
const { DATABASE_PATH } = require('./import-hymnal');

const PUBLIC_DATABASE_PATH = path.resolve(__dirname, '..', 'public', 'data', 'himnario.db.json');

function copyDatabase() {
  if (!fs.existsSync(DATABASE_PATH)) {
    throw new Error('No existe la base local. Ejecuta primero: npm run import');
  }
  fs.mkdirSync(path.dirname(PUBLIC_DATABASE_PATH), { recursive: true });
  fs.copyFileSync(DATABASE_PATH, PUBLIC_DATABASE_PATH);
  return PUBLIC_DATABASE_PATH;
}

if (require.main === module) {
  try {
    console.log(`Base pública creada: ${copyDatabase()}`);
  } catch (error) {
    console.error(`Error al preparar el sitio: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { PUBLIC_DATABASE_PATH, copyDatabase };

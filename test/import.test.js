const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { PUBLIC_DATABASE_PATH, copyDatabase } = require("../src/build-static");
const { createServer, resolvePublicPath } = require("../src/server");
const {
  DATABASE_PATH,
  SOURCES,
  buildDatabase,
  importDatabase,
  parseHymns,
} = require("../src/import-hymnal");

const ROOT = path.resolve(__dirname, "..");

test("importa los 713 cantos, incluidos títulos multilínea y variantes editoriales", () => {
  const main = parseHymns(SOURCES[0]);
  const esforzador = parseHymns(SOURCES[1]);

  assert.equal(main.hymns.length, 550);
  assert.equal(esforzador.hymns.length, 163);
  assert.equal(main.hymns.at(-1).number, 547);
  assert.equal(esforzador.hymns.at(-1).number, 163);

  const variants = main.hymns
    .filter((hymn) => [428, 429].includes(hymn.number))
    .map((hymn) => hymn.displayNumber);
  assert.deepEqual(variants, ["428 a", "428 b", "429 a", "429 b", "429 c"]);
  assert.equal(
    main.hymns.find((hymn) => hymn.number === 213).title,
    "CUANDO COMBATIDO POR LA ADVERSIDAD",
  );
  assert.equal(
    main.hymns.find((hymn) => hymn.number === 10).title,
    "NUNCA DIOS MÍO",
  );
  assert.equal(
    main.hymns.find((hymn) => hymn.number === 10).sourceTitle,
    "nunca dios mÍo",
  );
  assert.equal(
    main.hymns.find((hymn) => hymn.number === 527).subtitle,
    "(Himno oficial de la Escuela Bíblica para Misioneras)",
  );
  assert.equal(
    esforzador.hymns.find((hymn) => hymn.number === 82).subtitle,
    "(SALMO 150)",
  );
});

test("modela secciones maestras y subsecciones sin mezclarlas con la letra", () => {
  const database = buildDatabase();
  assert.equal(database.masterSections.length, 17);
  assert.equal(database.sections.length, 30);

  const supplement = database.masterSections.find(
    (section) => section.name === "SUPLEMENTO",
  );
  assert.equal(supplement.code, "XVI");
  assert.equal(supplement.sourceCode, "XIV");
  assert.equal(supplement.normalized, true);

  const birth = database.sections.find(
    (section) => section.name === "SU NACIMIENTO",
  );
  const hymn = database.hymns.find((item) => item.id === "himnario-35");
  assert.equal(hymn.masterSectionId, "himnario-iv");
  assert.equal(hymn.sectionId, birth.id);
  assert.ok(!hymn.bodyText.includes("SU NACIMIENTO"));
});

test("conserva saltos, numeración explícita, repeticiones y créditos", () => {
  const database = buildDatabase();
  const unnumbered = database.hymns.find((hymn) => hymn.id === "himnario-1");
  assert.equal(unnumbered.parts[0].number, null);
  assert.equal(unnumbered.parts[0].label, null);
  assert.match(
    unnumbered.parts[0].text,
    /Te loamos, te glorificamos,\nte confesamos/u,
  );
  assert.deepEqual(unnumbered.authors, ["Germán Lüders"]);

  const numbered = database.hymns.find((hymn) => hymn.id === "himnario-2");
  assert.deepEqual(
    numbered.parts.map((part) => part.type),
    ["verse", "chorus", "verse"],
  );
  assert.deepEqual(
    numbered.parts.map((part) => part.label),
    ["1", "Coro", "2"],
  );
  assert.equal(numbered.parts[0].explicitNumber, true);
  assert.equal(numbered.parts[1].repeatMarked, true);
  assert.match(numbered.parts[1].text, /^::/u);
  assert.match(numbered.parts[1].sourceText, /^Coro:\s*::/u);
  assert.match(numbered.bodyText, /\n\nCoro:/u);
  assert.deepEqual(numbered.translators, ["Vicente Mendoza"]);

  const unknown = database.hymns.find((hymn) => hymn.id === "esforzador-10");
  assert.deepEqual(unknown.authors, ["Desconocido"]);
  assert.equal(unknown.credits[0].raw, "Autor desconcido");
});

test("genera y publica una única base local determinista", () => {
  const temporaryPath = path.join(ROOT, "data", "himnario.test.db.json");
  const result = importDatabase(temporaryPath);
  const database = JSON.parse(fs.readFileSync(temporaryPath, "utf8"));
  assert.equal(result.hymnCount, 713);
  assert.equal(database.schemaVersion, 2);
  fs.rmSync(temporaryPath, { force: true });

  copyDatabase();
  const canonical = fs.readFileSync(DATABASE_PATH);
  const published = fs.readFileSync(PUBLIC_DATABASE_PATH);
  const digest = (value) =>
    crypto.createHash("sha256").update(value).digest("hex");
  assert.equal(digest(published), digest(canonical));
});

test("sirve presentación, panel, visualizador y base desde el mismo monolito", async (context) => {
  assert.equal(resolvePublicPath("/"), path.join(ROOT, "public", "index.html"));
  assert.equal(
    resolvePublicPath("/panel/"),
    path.join(ROOT, "public", "panel", "index.html"),
  );
  assert.equal(
    resolvePublicPath("/visualizador/"),
    path.join(ROOT, "public", "visualizador", "index.html"),
  );
  assert.equal(resolvePublicPath("/../../etc/passwd"), null);

  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const get = (pathname) => fetch(`http://127.0.0.1:${port}${pathname}`);

  const presentation = await get("/");
  assert.equal(presentation.status, 200);
  assert.match(await presentation.text(), /Iván Bermúdez Regino/u);

  const panel = await get("/panel/");
  assert.equal(panel.status, 200);
  assert.match(await panel.text(), /biblioteca local/u);

  const viewer = await get("/visualizador/");
  assert.equal(viewer.status, 200);
  assert.match(await viewer.text(), /theme-root/u);

  const database = await get("/data/himnario.db.json");
  assert.equal(database.status, 200);
  assert.equal((await database.json()).hymns.length, 713);
});

test("la versión y los recursos integrados no dependen de un servicio separado", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
  );
  const presentation = fs.readFileSync(
    path.join(ROOT, "public", "index.html"),
    "utf8",
  );
  const control = fs.readFileSync(
    path.join(ROOT, "public", "assets", "js", "control.js"),
    "utf8",
  );

  assert.equal(packageJson.version, "1.1.0");
  assert.match(presentation, /Versión 1\.1\.0/u);
  assert.match(presentation, /href="\/panel\/"/u);
  assert.match(presentation, /href="\/visualizador\/"/u);
  assert.match(control, /\/data\/himnario\.db\.json/u);
  assert.equal(fs.existsSync(path.join(ROOT, "netlify", "functions")), false);
  assert.ok(
    fs.existsSync(
      path.join(ROOT, "public", "themes", "modern", "assets", "piano_bg_1.png"),
    ),
  );
});

test("ofrece el catálogo de temas unificado", () => {
  const expectedThemes = [
    ["classic", "Clásico"],
    ["modern", "Libro moderno"],
    ["minimal", "Minimalista"],
    ["cinematic", "Cinematográfico"],
    ["broadcast", "Transmisión"],
    ["glass", "Cristal"],
    ["editorial", "Editorial"],
    ["neon", "Neón"],
    ["ribbon", "Cinta"],
    ["spotlight", "Reflector"],
  ];

  for (const [id, name] of expectedThemes) {
    const config = fs.readFileSync(
      path.join(ROOT, "public", "themes", id, "config.js"),
      "utf8",
    );
    assert.match(config, new RegExp(`id: '${id}'`, "u"));
    assert.match(config, new RegExp(`name: '${name}'`, "u"));
  }
});

test("el visualizador usa autoajuste seguro y posiciones por alineación", () => {
  const panel = fs.readFileSync(
    path.join(ROOT, "public", "panel", "index.html"),
    "utf8",
  );
  const control = fs.readFileSync(
    path.join(ROOT, "public", "assets", "js", "control.js"),
    "utf8",
  );
  const runtime = fs.readFileSync(
    path.join(ROOT, "public", "themes", "shared", "preview-runtime.js"),
    "utf8",
  );
  const defaults = fs.readFileSync(
    path.join(ROOT, "public", "themes", "shared", "defaults.js"),
    "utf8",
  );

  assert.match(panel, /id="horizontal-align"/u);
  assert.match(panel, /id="panel-appearance"/u);
  assert.match(panel, /value="compact"/u);
  assert.match(panel, /value="minimal"/u);
  assert.match(panel, /id="vertical-align"/u);
  assert.match(panel, /id="auto-fit-toggle"/u);
  assert.doesNotMatch(panel, /id="text-[xy]"/u);
  assert.match(control, /selectedHymn\.title/u);
  assert.match(control, /levenshteinDistance/u);
  assert.match(control, /hymn\.bodyText/u);
  assert.match(defaults, /horizontalAlign:\s*'center'/u);
  assert.match(defaults, /verticalAlign:\s*'center'/u);
  assert.match(defaults, /autoFit:\s*true/u);
  assert.match(runtime, /function fitTextToContainer/u);
  assert.match(
    runtime,
    /activeSettings\.autoFit === false \? requestedSize : 96/u,
  );
  assert.match(runtime, /verticalPositions/u);

  for (const theme of ["classic", "modern", "minimal", "cinematic"]) {
    const config = fs.readFileSync(
      path.join(ROOT, "public", "themes", theme, "config.js"),
      "utf8",
    );
    assert.match(config, /horizontalAlign:\s*'center'/u);
    assert.match(config, /verticalAlign:\s*'center'/u);
    assert.match(config, /autoFit:\s*true/u);
  }
});

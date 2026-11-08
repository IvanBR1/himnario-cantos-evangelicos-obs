const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
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

test("importa los 713 cantos originales, incluidos títulos multilínea y variantes editoriales", () => {
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

  const repeatedBlock = database.hymns.find((hymn) => hymn.id === "esforzador-1").parts[1];
  assert.equal(repeatedBlock.type, "repetition");
  assert.match(repeatedBlock.text, /el trono eternal\.\n\nGracia infinita de bondad,/u);
  assert.match(repeatedBlock.text, /por ti y por mí ::$/u);

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

  const coronadle = database.hymns.find((hymn) => hymn.id === "himnario-66");
  const coronadleChoruses = coronadle.parts.filter((part) => part.type === "chorus");
  assert.equal(coronadleChoruses.length, 1);
  assert.match(coronadleChoruses[0].text, /Coronadle, con cánticos hoy load;/u);

  const unknown = database.hymns.find((hymn) => hymn.id === "esforzador-10");
  assert.deepEqual(unknown.authors, ["Desconocido"]);
  assert.equal(unknown.credits[0].raw, "Autor desconcido");
});

test("genera y publica una única base local determinista", () => {
  const temporaryPath = path.join(ROOT, "data", "himnario.test.db.json");
  const result = importDatabase(temporaryPath);
  const database = JSON.parse(fs.readFileSync(temporaryPath, "utf8"));
  assert.equal(result.hymnCount, 714);
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
  assert.equal((await database.json()).hymns.length, 714);
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

  const registeredThemes = new Map();
  const context = vm.createContext({
    window: {
      BibleThemeRegistry: {
        register: (theme) => registeredThemes.set(theme.id, theme),
      },
    },
  });

  for (const [id, name] of expectedThemes) {
    const config = fs.readFileSync(
      path.join(ROOT, "public", "themes", id, "config.js"),
      "utf8",
    );
    assert.match(config, new RegExp(`id: '${id}'`, "u"));
    assert.match(config, new RegExp(`name: '${name}'`, "u"));
    vm.runInContext(config, context, { filename: `${id}/config.js` });
  }
  assert.deepEqual([...registeredThemes.keys()], expectedThemes.map(([id]) => id));
});

test("prioriza número, título y letra y ordena por número natural", () => {
  const control = fs.readFileSync(
    path.join(ROOT, "public", "assets", "js", "control.js"),
    "utf8",
  );
  const element = {};
  const context = vm.createContext({
    document: {
      getElementById: () => element,
      addEventListener: () => {},
    },
    window: { BibleThemeDefaults: {} },
  });
  vm.runInContext(control, context, { filename: "control.js" });

  const prepare = (displayNumber, title, bodyText = "") => {
    const hymn = { displayNumber, title };
    hymn.numberSearchText = context.normalizeSearch(displayNumber);
    hymn.titleSearchText = context.normalizeSearch(title);
    hymn.headingSearchText = context.normalizeSearch(`${displayNumber} ${title}`);
    hymn.lyricsSearchText = context.normalizeSearch(bodyText);
    for (const field of ["title", "heading", "lyrics"]) {
      hymn[`${field}SearchWords`] = [
        ...new Set(hymn[`${field}SearchText`].split(/\s+/u).filter(Boolean)),
      ];
    }
    return hymn;
  };
  const score = (hymn, query) => {
    const normalized = context.normalizeSearch(query);
    return context.scoreHymnSearch(hymn, normalized.split(/\s+/u), normalized);
  };

  assert.equal(score(prepare("10", "NUNCA DIOS MÍO"), "10").priority, 0);
  assert.equal(score(prepare("25", "DIOS ES AMOR"), "dios").priority, 1);
  assert.equal(score(prepare("2", "TIERNAS CANCIONES", "Dios es nuestro amparo"), "dios").priority, 2);
  assert.deepEqual(
    [prepare("100", "C"), prepare("9", "A"), prepare("10", "B"), prepare("428 b", "E"), prepare("428 a", "D")]
      .sort(context.compareHymnOrder)
      .map((hymn) => hymn.displayNumber),
    ["9", "10", "100", "428 a", "428 b"],
  );
  assert.match(control, /hymn-search-clear/u);
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


test("conserva línea por línea la fuente de cada canto y todas sus partes", () => {
  const normalize = text => text.replace(/\s+/gu, " ").trim();
  for (const source of SOURCES) {
    const lines = fs.readFileSync(path.join(ROOT, "backup", source.filename), "utf8").replace(/\r\n?/gu, "\n").split("\n");
    for (const hymn of parseHymns(source).hymns) {
      const sourceBody = lines.slice(hymn.source.startLine, hymn.source.endLine)
        .filter(line => !/^\s*\d{1,3}\s*$/u.test(line)
          && !/^ESTRIBILLOS(?:\s+\d+)?$/u.test(line.trim())).join("\n");
      const reconstructed = [
        ...hymn.sourceTitleLines.slice(1), hymn.subtitle || "",
        hymn.sourceText, ...hymn.credits.map(credit => credit.raw),
      ].join("\n");
      assert.equal(normalize(reconstructed), normalize(sourceBody), hymn.id + ": fuente completa");
      assert.equal(normalize(hymn.parts.map(part => part.sourceText).join("\n")),
        normalize(hymn.sourceText), hymn.id + ": partes completas");
      assert.ok(hymn.parts.length > 0, hymn.id);
    }
  }
});

test("enumera Extras desde 1 y conserva Gozo inefable completo", () => {
  const database = buildDatabase();
  const extras = database.hymns.filter(hymn => hymn.collectionId === "extras");
  assert.deepEqual(extras.map(hymn => hymn.number), extras.map((_, index) => index + 1));
  assert.equal(extras[0].title, "GOZO INEFABLE");
  assert.equal(extras[0].bodyText, "Gozo inefable siente el cristiano\ncuando da su ofrenda con amor,\npues sabe que no es en vano\ntodo lo que hace por su Señor. Amén.");
  assert.equal(database.collections.find(collection => collection.id === "extras").hymnCount, 1);
  assert.deepEqual(database.hymns.find(hymn => hymn.id === "himnario-499").translators, ["Esther López M."]);
  assert.ok(!database.hymns.find(hymn => hymn.id === "himnario-499").authors.includes("ESTRIBILLOS"));
});

test("reproduce la referencia al Coro 1 del Esforzador 159 sin perderla", () => {
  const hymn = buildDatabase().hymns.find(hymn => hymn.id === "esforzador-159");
  const choruses = hymn.parts.filter(part => part.type === "chorus" && part.number === 1);
  assert.equal(choruses.length, 2);
  assert.equal(choruses[1].sourceText.trim(), "Coro 1");
  assert.equal(choruses[1].text, choruses[0].text);
  assert.match(choruses[1].text, /^Resucitaré/u);
  assert.deepEqual(hymn.sequence.source.map(item => item.partId), hymn.parts.map(part => part.id));
  assert.deepEqual(hymn.sequence.performance.map(item => item.partId), hymn.parts.map(part => part.id));
});

test("antepone la portada a todas las estrofas en ambos modos del visualizador", () => {
  const context = vm.createContext({
    document: { getElementById: () => ({}), addEventListener: () => {} },
    window: { BibleThemeDefaults: {} },
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "public/assets/js/control.js"), "utf8"), context);
  const database = buildDatabase();
  context.catalog = database;
  vm.runInContext(`collections = catalog.collections;
    masterSectionsById = new Map(catalog.masterSections.map(item => [item.id, item]));
    sectionsById = new Map(catalog.sections.map(item => [item.id, item]));`, context);
  for (const hymn of database.hymns) {
    for (const mode of ["source", "performance"]) {
      const result = context.buildDisplaySequence(hymn, mode);
      assert.equal(result[0].type, "title");
      assert.equal(result[0].titleCard.title, `${hymn.displayNumber}. ${hymn.title}`);
      assert.equal(Object.hasOwn(result[0].titleCard, "collection"), false);
      assert.equal(result[0].titleCard.section, context.hymnSectionName(hymn));
      assert.deepEqual(Array.from(result.slice(1), item => item.id), hymn.sequence[mode].map(item => item.partId));
      assert.equal(result[1].text, hymn.parts[0].text);
      context.hymn = hymn;
      context.displaySequence = result;
      vm.runInContext('selectedHymn = hymn; sequence = displaySequence; currentIndex = 0;', context);
      assert.equal(context.sequenceProgress(), "Título");
      assert.equal(context.hymnReference(), "Título");
      for (let index = 1; index < result.length; index += 1) {
        vm.runInContext(`currentIndex = ${index};`, context);
        const progress = `${index} / ${result.length - 1}`;
        assert.equal(context.sequenceProgress(), progress);
        assert.equal(context.hymnReference(), `${hymn.displayNumber} · ${hymn.title} · ${context.partLabel(result[index])} · ${progress}`);
      }
    }
  }
});

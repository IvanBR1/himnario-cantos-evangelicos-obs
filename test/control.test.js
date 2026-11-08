const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
function setup() {
  const nodes = new Map();
  const storage = new Map();
  const getNode = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', innerHTML: '', classList: { remove() {} }, querySelectorAll() { return []; }, setAttribute(key, value) { this[key] = value; } });
    return nodes.get(id);
  };
  const context = vm.createContext({ window: { BibleThemeDefaults: {} }, document: { getElementById: getNode, addEventListener() {} }, localStorage: { setItem(k, v) { storage.set(k, v); }, getItem(k) { return storage.get(k); } } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/assets/js/control.js'), 'utf8'), context);
  return { context, storage, getNode, run: code => vm.runInContext(code, context) };
}
test('busqueda prioriza numero y titulo y tolera omisiones y letras intercambiadas', () => {
  const { run } = setup();
  assert.equal(run("levenshteinDistance('crsito', 'cristo')"), 1);
  assert.equal(run("fuzzyTermScore('salvador', ['sal'])"), null);
  assert.equal(run("scoreSearchField('cristo mi salvador', ['cristo','mi','salvador'], ['salvador','cristo'], 'salvador cristo') !== null"), true);
  assert.equal(run("scoreSearchField('cristo mi salvador', ['cristo','mi','salvador'], ['crsito','mi','salvador'], 'crsito mi salvador') !== null"), true);
  assert.equal(run("scoreSearchField('cristo mi salvador', ['cristo','mi','salvador'], ['cristo','palabra','salvador'], 'cristo palabra salvador') !== null"), true);
  assert.equal(run("scoreSearchField('cristo mi salvador', ['cristo','mi','salvador'], ['zzzzz','qqqqq'], 'zzzzz qqqqq')"), null);
  run(`hymn = { numberSearchText:'12', titleSearchText:'cristo mi salvador', titleSearchWords:['cristo','mi','salvador'], headingSearchText:'12 cristo mi salvador', headingSearchWords:['12','cristo','mi','salvador'], lyricsSearchText:'amor eterno', lyricsSearchWords:['amor','eterno'] };`);
  assert.equal(run("scoreHymnSearch(hymn,['12'],'12').priority"), 0);
  assert.equal(run("scoreHymnSearch(hymn,['salvador','cristo'],'salvador cristo').priority"), 1);
  assert.equal(run("scoreHymnSearch(hymn,['amor'],'amor').priority"), 2);
});
test('programados conserva orden, evita duplicados y selecciona entre colecciones', () => {
  const { run, storage, getNode } = setup();
  run(`
    collections = [{id:'a',name:'A'}, {id:'b',name:'B'}];
    hymnsById = new Map([['a-1',{id:'a-1',collectionId:'a',displayNumber:'1',title:'Primero'}],['b-1',{id:'b-1',collectionId:'b',displayNumber:'1',title:'Segundo'}]]);
    selectedHymn = hymnsById.get('a-1'); addToProgram(); addToProgram();
    selectedHymn = hymnsById.get('b-1'); addToProgram();
    reorderProgramHymn(1,0);
  `);
  assert.deepEqual(JSON.parse(storage.get('hymnalProgram')), ['b-1','a-1']);
  run('programmedHymns = []; loadProgram();');
  assert.equal(run('programmedHymns[0]'), 'b-1');
  run("loadSequence = () => {}; selectHymn(hymnsById.get('b-1'));");
  assert.equal(getNode('collection-select').value, 'b');
  assert.equal(run('selectedHymn.id'), 'b-1');
  assert.equal(getNode('program-bookmark')['aria-pressed'], 'true');
  run('toggleProgramBookmark();');
  assert.equal(getNode('program-bookmark')['aria-pressed'], 'false');
  run('toggleProgramBookmark(); reorderProgramHymn(1, 0);');
  assert.equal(getNode('program-bookmark')['aria-pressed'], 'true');
  run('removeProgramHymn(0);');
  assert.deepEqual(JSON.parse(storage.get('hymnalProgram')), ['a-1']);
  storage.set('hymnalProgram', '["a-1","missing","a-1"]');
  run('loadProgram();');
  assert.equal(run('programmedHymns.length'), 1);
  storage.set('hymnalProgram', '{bad');
  run('loadProgram();');
  assert.equal(run('programmedHymns.length'), 0);
});

test('arrastrar reubica un himno sin intercambiar ni perder los intermedios', () => {
  const { run, storage } = setup();
  run('renderProgram = () => {}; programmedHymns = ["a", "b", "c", "d"]; reorderProgramHymn(0, 3);');
  assert.deepEqual(JSON.parse(storage.get('hymnalProgram')), ['b', 'c', 'd', 'a']);
  run('reorderProgramHymn(3, 1);');
  assert.deepEqual(JSON.parse(storage.get('hymnalProgram')), ['b', 'a', 'c', 'd']);
  run('reorderProgramHymn(1, 1); reorderProgramHymn(-1, 0); reorderProgramHymn(0, 4);');
  assert.deepEqual(JSON.parse(storage.get('hymnalProgram')), ['b', 'a', 'c', 'd']);
});

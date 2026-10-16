// Lokale Datenhaltung (IndexedDB). Alle Daten bleiben auf dem Gerät.
// Stores:
//   kv        { key, value }                       Einstellungen und App-Zustand
//   sessions  { id, date, blockId, version, phase, minutes, srpe, cardio?, note? }
//   sets      { id, sessionId, exId, setNo, load, reps, rir, date }
//   checks    { id, date, sessionId?, leak, heaviness }   Beckenboden-Check (0/1/2)
//   tests     { id, date, testId, value, side?, variant? }
//   daily     { date, pf }                          Tägliches Beckenboden-Häkchen

const DB_NAME = 'hippofit';
const DB_VERSION = 1;
export const STORES = ['kv', 'sessions', 'sets', 'checks', 'tests', 'daily'];
export const EXPORT_SCHEMA = 1;

let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('sessions')) {
        const s = db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
        s.createIndex('date', 'date');
        s.createIndex('blockId', 'blockId');
      }
      if (!db.objectStoreNames.contains('sets')) {
        const s = db.createObjectStore('sets', { keyPath: 'id', autoIncrement: true });
        s.createIndex('sessionId', 'sessionId');
        s.createIndex('exId', 'exId');
      }
      if (!db.objectStoreNames.contains('checks')) {
        db.createObjectStore('checks', { keyPath: 'id', autoIncrement: true }).createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('tests')) {
        const s = db.createObjectStore('tests', { keyPath: 'id', autoIncrement: true });
        s.createIndex('date', 'date');
        s.createIndex('testId', 'testId');
      }
      if (!db.objectStoreNames.contains('daily')) db.createObjectStore('daily', { keyPath: 'date' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Datenbank ist in einem anderen Tab geöffnet.'));
  });
  return dbPromise;
}

function done(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result;
    Promise.resolve(fn(t)).then(r => { result = r; }, reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaktion abgebrochen'));
  });
}

// ---- Allgemein ----
export const add = (store, value) => tx(store, 'readwrite', t => done(t.objectStore(store).add(value)));
export const put = (store, value) => tx(store, 'readwrite', t => done(t.objectStore(store).put(value)));
export const get = (store, key) => tx(store, 'readonly', t => done(t.objectStore(store).get(key)));
export const del = (store, key) => tx(store, 'readwrite', t => done(t.objectStore(store).delete(key)));
export const all = (store) => tx(store, 'readonly', t => done(t.objectStore(store).getAll()));
export const byIndex = (store, index, value) =>
  tx(store, 'readonly', t => done(t.objectStore(store).index(index).getAll(value)));

/** Einträge eines Stores mit date ≥ sinceISO (Datum im Format JJJJ-MM-TT…). */
export const since = (store, sinceISO) =>
  tx(store, 'readonly', t => done(t.objectStore(store).index('date').getAll(IDBKeyRange.lowerBound(sinceISO))));

// ---- Einstellungen ----
export const DEFAULT_SETTINGS = {
  phase: 1,
  phaseStart: null,        // ISO-Datum, an dem die aktuelle Phase begonnen hat
  daysPerWeek: 3,
  version: 'short',        // 'short' | 'normal'
  theme: 'auto',           // 'auto' | 'light' | 'dark'
  runRefName: '',
  suitcaseTestKg: 16,
  lastBackup: null,
  onboarded: false
};

export async function getSettings() {
  const row = await get('kv', 'settings');
  return { ...DEFAULT_SETTINGS, ...(row ? row.value : {}) };
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await put('kv', { key: 'settings', value: next });
  return next;
}

// ---- Sicherung ----
export async function exportAll() {
  const out = { app: 'HippoFit', schema: EXPORT_SCHEMA, exported: new Date().toISOString(), stores: {} };
  for (const s of STORES) out.stores[s] = await all(s);
  return out;
}

export function validateBackup(data) {
  if (!data || data.app !== 'HippoFit') return 'Das ist keine HippoFit-Sicherung.';
  if (typeof data.schema !== 'number' || data.schema > EXPORT_SCHEMA) return 'Die Sicherung stammt aus einer neueren App-Version.';
  if (!data.stores || typeof data.stores !== 'object') return 'Die Sicherung ist unvollständig.';
  for (const s of Object.keys(data.stores)) {
    if (!STORES.includes(s)) return `Unbekannter Datenbereich: ${s}`;
    if (!Array.isArray(data.stores[s])) return `Datenbereich ${s} ist beschädigt.`;
  }
  return null;
}

/** Ersetzt alle lokalen Daten durch die Sicherung (in einer Transaktion). */
export async function importAll(data) {
  const err = validateBackup(data);
  if (err) throw new Error(err);
  await tx(STORES, 'readwrite', t => {
    for (const s of STORES) {
      const os = t.objectStore(s);
      os.clear();
      for (const row of data.stores[s] || []) os.put(row);
    }
  });
}

export async function wipeAll() {
  await tx(STORES, 'readwrite', t => { for (const s of STORES) t.objectStore(s).clear(); });
}

export async function counts() {
  const c = {};
  for (const s of STORES) c[s] = await tx(s, 'readonly', t => done(t.objectStore(s).count()));
  return c;
}

/** Bittet den Browser, die Daten nicht automatisch zu löschen (wichtig auf iOS). */
export async function requestPersistence() {
  if (!navigator.storage || !navigator.storage.persist) return null;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

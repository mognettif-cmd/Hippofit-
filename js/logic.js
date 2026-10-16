// Trainingslogik: Beckenboden-Ampel, Blockfreigabe, Wochenvorschlag, Datumshilfen.
import * as db from './db.js';
import { C, BLOCK } from './content.js';

// ---- Datum (lokale Zeit, Format JJJJ-MM-TT) ----
export function isoDay(d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export function daysAgo(n, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return d;
}
/** Montag der Woche als JJJJ-MM-TT. */
export function weekStart(d = new Date()) {
  const x = new Date(d);
  const wd = (x.getDay() + 6) % 7; // Mo = 0
  x.setDate(x.getDate() - wd);
  return isoDay(x);
}
export function weeksBetween(fromISO, to = new Date()) {
  if (!fromISO) return 0;
  const ms = to - new Date(fromISO + 'T00:00:00');
  return Math.max(0, Math.floor(ms / (7 * 864e5)));
}
export function formatDate(iso) {
  return new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)
    .toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ---- Beckenboden-Ampel ----
// Regeln siehe data/tests.json → pelvicCheck.ampel.logic
export function ampelFromChecks(checks, now = new Date()) {
  const d7 = isoDay(daysAgo(7, now));
  const d14 = isoDay(daysAgo(14, now));
  const last14 = checks.filter(c => c.date.slice(0, 10) > d14);
  const worst = c => Math.max(c.leak || 0, c.heaviness || 0);
  if (last14.some(c => c.date.slice(0, 10) > d7 && worst(c) >= 2)) return 'red';
  if (last14.some(c => worst(c) >= 1)) return 'yellow';
  if (last14.length >= 3) return 'green';
  return 'grey';
}

export async function currentAmpel() {
  const checks = await db.since('checks', isoDay(daysAgo(15)));
  return ampelFromChecks(checks);
}

export function ampelState(state) {
  return C.tests.pelvicCheck.ampel.states[state];
}

// ---- Blockfreigabe ----
/**
 * Status eines Blocks für Phase und Ampel.
 * locked: Phase noch nicht erreicht (sanfter Hinweis, trotzdem startbar)
 * impact: durch die Ampel eingeschränkt (Varianten oder bewusst überschreiben)
 */
export function blockStatus(block, phase, ampel) {
  const st = { locked: block.minPhase > phase, impact: false, note: '' };
  const maxImpact = ampelState(ampel).maxImpact;
  if (block.requiresGreen && ampel !== 'green') {
    st.impact = true;
    st.note = 'Nur bei grüner Ampel';
  } else if (block.maxImpact > maxImpact) {
    st.impact = true;
    st.note = block.variants ? 'Variante mit wenig Aufprall' : 'Sprünge werden ersetzt';
  }
  if (st.locked) st.note = `ab Phase ${block.minPhase}` + (st.note ? ` · ${st.note}` : '');
  return st;
}

// ---- Wochenvorschlag ----
/** Liefert den Wochenplan und den nächsten offenen Trainingstag dieser Woche. */
export async function weekSuggestion(settings) {
  const tpl = C.program.weekTemplates[String(settings.phase)][String(settings.daysPerWeek)];
  const sessions = await db.since('sessions', weekStart());
  const doneIds = sessions.map(s => s.blockId);
  // Ein Tag gilt als erledigt, wenn sein erster Block diese Woche schon trainiert wurde
  // (jeder Block zählt nur einmal).
  const pool = [...doneIds];
  const days = tpl.map(blocks => {
    const i = pool.indexOf(blocks[0]);
    const done = i >= 0;
    if (done) pool.splice(i, 1);
    return { blocks: blocks.map(id => BLOCK.get(id)), done };
  });
  const next = days.find(d => !d.done) || null;
  return { days, next, doneCount: days.filter(d => d.done).length };
}

// ---- Tägliches Beckenboden-Häkchen ----
export async function pfStreak() {
  const rows = await db.all('daily');
  const set = new Set(rows.filter(r => r.pf).map(r => r.date));
  let n = 0;
  const d = new Date();
  if (!set.has(isoDay(d))) d.setDate(d.getDate() - 1); // heute noch offen zählt nicht als Unterbruch
  while (set.has(isoDay(d))) { n++; d.setDate(d.getDate() - 1); }
  return { streak: n, today: set.has(isoDay()), total: set.size };
}

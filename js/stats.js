// Auswertungen für «stärker, schneller, ausdauernder», Belastung, Beckenboden und Tests.
import * as db from './db.js';
import { C, EX, BLOCK } from './content.js';
import { isoDay, daysAgo, weekStart } from './logic.js';

// ---- Stärker ----
/** Epley-Schätzung, nur für Sätze mit Gewicht und höchstens 10 Wiederholungen. */
export function e1rm(load, reps) {
  if (!(load > 0) || !(reps > 0) || reps > 10) return null;
  return load * (1 + reps / 30);
}

/** Übungen mit erfassten Sätzen, die meistgenutzten zuerst. */
export async function loggedExercises() {
  const sets = await db.all('sets');
  const n = new Map();
  sets.forEach(s => n.set(s.exId, (n.get(s.exId) || 0) + 1));
  return [...n].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ ex: EX.get(id), count })).filter(x => x.ex);
}

/**
 * Verlauf einer Übung, ein Punkt pro Einheit.
 * Mit Gewicht: bestes e1RM. Körpergewicht: meiste Wiederholungen. Zeit: längste Dauer. Kontakte: Summe.
 */
export async function exerciseSeries(exId, sinceISO) {
  const ex = EX.get(exId);
  const sets = (await db.byIndex('sets', 'exId', exId)).filter(s => !sinceISO || s.date >= sinceISO);
  const bySession = new Map();
  sets.forEach(s => { if (!bySession.has(s.sessionId)) bySession.set(s.sessionId, []); bySession.get(s.sessionId).push(s); });
  const unit = ex.unit || 'reps';
  const metric = ex.load !== 'bw' && unit === 'reps' ? 'e1rm' : unit === 'time' ? 'time' : unit === 'contacts' ? 'contacts' : 'reps';
  const points = [];
  for (const xs of bySession.values()) {
    const date = xs[0].date;
    let y = null, tip = '';
    if (metric === 'e1rm') {
      const best = xs.map(s => ({ s, v: e1rm(s.load, s.reps) })).filter(o => o.v).sort((a, b) => b.v - a.v)[0];
      if (!best) continue;
      y = Math.round(best.v * 10) / 10;
      tip = `≈ ${y} kg (aus ${best.s.load} kg × ${best.s.reps})`;
    } else if (metric === 'time') {
      y = Math.max(...xs.map(s => s.reps)); tip = `${y} s${ex.load !== 'bw' ? ` mit ${Math.max(...xs.map(s => s.load))} kg` : ''}`;
    } else if (metric === 'contacts') {
      y = xs.reduce((a, s) => a + s.reps, 0); tip = `${y} Kontakte`;
    } else {
      y = Math.max(...xs.map(s => s.reps)); tip = `${y} Wiederholungen`;
    }
    points.push({ x: date.slice(0, 10), y, tip });
  }
  points.sort((a, b) => a.x.localeCompare(b.x));
  const unitLabel = { e1rm: 'kg (geschätztes 1RM)', time: 's', contacts: 'Kontakte', reps: 'Wdh' }[metric];
  const best = points.length ? Math.max(...points.map(p => p.y)) : null;
  const first = points[0]?.y, last = points[points.length - 1]?.y;
  return { ex, metric, unitLabel, points, best, change: first ? ((last - first) / first) * 100 : null };
}

// ---- Wochenwerte ----
const GROUP = { strength: 'kraft', daily: 'kraft', power: 'power', plyo: 'power', endurance: 'ausdauer', hybrid: 'ausdauer' };

export async function weekly(weeks) {
  const start = weekStart(daysAgo(7 * (weeks - 1)));
  const sessions = await db.since('sessions', start);
  const out = [];
  for (let i = 0; i < weeks; i++) {
    const d = new Date(start + 'T12:00:00');
    d.setDate(d.getDate() + 7 * i);
    out.push({ week: isoDay(d), load: { kraft: 0, power: 0, ausdauer: 0 }, km: 0, hm: 0, minutes: 0, sessions: 0, easyMin: 0, cardioMin: 0 });
  }
  for (const s of sessions) {
    const w = out.find(o => o.week === weekStart(new Date(s.date)));
    if (!w) continue;
    const g = GROUP[BLOCK.get(s.blockId)?.category] || 'kraft';
    w.load[g] += s.load || 0;
    w.minutes += s.minutes || 0;
    w.sessions += 1;
    if (s.cardio) {
      w.km += s.cardio.distanceKm || 0;
      w.hm += s.cardio.elevationM || 0;
      w.cardioMin += s.minutes || 0;
      if (s.srpe <= 4) w.easyMin += s.minutes || 0;
    }
  }
  return out;
}

export const weekLabel = iso => new Date(iso + 'T12:00:00').toLocaleDateString('de-CH', { day: 'numeric', month: 'numeric' });

// ---- Schneller ----
/** Lauftempo in km/h bei lockeren Läufen (RPE ≤ 4) – gleiche Anstrengung, mehr Tempo = fitter. */
export async function easyRunSpeed(sinceISO) {
  const rows = await db.since('sessions', sinceISO);
  return rows
    .filter(s => s.cardio?.mode === 'Lauf' && s.cardio.distanceKm > 0 && s.minutes > 0 && s.srpe <= 4)
    .map(s => {
      const kmh = s.cardio.distanceKm / (s.minutes / 60);
      const pace = 60 / kmh;
      const mm = Math.floor(pace), ss = Math.round((pace - mm) * 60) % 60;
      return { x: s.date.slice(0, 10), y: Math.round(kmh * 10) / 10, tip: `${kmh.toFixed(1)} km/h (${mm}:${String(ss).padStart(2, '0')} min/km) · ${s.cardio.distanceKm} km · RPE ${s.srpe}` };
    })
    .sort((a, b) => a.x.localeCompare(b.x));
}

/** Höhenmeter pro Stunde bei Einheiten mit mindestens 100 Hm. */
export async function climbRate(sinceISO) {
  const rows = await db.since('sessions', sinceISO);
  return rows
    .filter(s => s.cardio?.elevationM >= 100 && s.minutes > 0)
    .map(s => ({ x: s.date.slice(0, 10), y: Math.round(s.cardio.elevationM / (s.minutes / 60)), tip: `${Math.round(s.cardio.elevationM / (s.minutes / 60))} Hm/h · ${s.cardio.elevationM} Hm in ${s.minutes} Min (${s.cardio.mode})` }))
    .sort((a, b) => a.x.localeCompare(b.x));
}

// ---- Beckenboden ----
export async function pelvicPoints(sinceISO) {
  const rows = await db.since('checks', sinceISO);
  return rows.map(c => ({
    x: c.date.slice(0, 10),
    level: Math.max(c.leak || 0, c.heaviness || 0),
    tip: `Urinverlust ${['nein', 'leicht', 'deutlich'][c.leak]} · Druck ${['nein', 'leicht', 'deutlich'][c.heaviness]}`
  })).sort((a, b) => a.x.localeCompare(b.x));
}

export async function pfDays(sinceISO) {
  return (await db.all('daily')).filter(r => r.pf && r.date >= sinceISO).length;
}

// ---- Tests ----
export const BATTERY_ID = 'battery';

/** Alle Testdurchgänge (gruppiert nach Datum) für die Testbatterie. */
export async function batteryRuns() {
  const rows = (await db.all('tests')).filter(t => t.kind === BATTERY_ID);
  const byDate = new Map();
  rows.forEach(r => { if (!byDate.has(r.date)) byDate.set(r.date, []); byDate.get(r.date).push(r); });
  return [...byDate].sort((a, b) => a[0].localeCompare(b[0])).map(([date, items]) => ({ date, items }));
}

function testValue(items, testId) {
  const xs = items.filter(i => i.testId === testId && i.value != null);
  if (!xs.length) return null;
  return { value: xs.reduce((a, x) => a + x.value, 0) / xs.length, sides: xs, variant: xs[0].variant || null };
}

/** Veränderung jedes Tests vom ersten zum letzten Durchgang, positiv = besser. */
export async function batteryChange() {
  const runs = await batteryRuns();
  const tests = C.tests.battery.tests;
  const rows = [];
  for (const t of tests) {
    const withVal = runs.map(r => ({ date: r.date, v: testValue(r.items, t.id) })).filter(r => r.v);
    if (withVal.length < 2) continue;
    const a = withVal[0], b = withVal[withVal.length - 1];
    if (a.v.variant !== b.v.variant) continue; // Klimmzug vs. Ringrudern nicht vergleichen
    let pct = ((b.v.value - a.v.value) / a.v.value) * 100;
    if (t.better === 'lower') pct = -pct;
    rows.push({ label: t.name, value: pct, detail: `${fmtTest(t, a.v.value)} → ${fmtTest(t, b.v.value)}` });
  }
  return { runs, rows };
}

export function fmtTest(t, v) {
  if (v == null) return '–';
  if (t.unit === 's' && t.better === 'lower') {
    const m = Math.floor(v / 60), s = Math.round(v % 60);
    return `${m}:${String(s).padStart(2, '0')} min`;
  }
  const r = Math.round(v * 10) / 10;
  return t.unit === 'reps' ? `${r} Wdh` : t.unit === 'cm' ? `${r} cm` : `${r} s`;
}

export async function lastBatteryDate() {
  const runs = await batteryRuns();
  return runs.length ? runs[runs.length - 1].date : null;
}

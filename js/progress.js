// Ansicht «Fortschritt»: stärker, schneller, ausdauernder, Belastung, Beckenboden, Tests, Tagebuch.
import * as db from './db.js';
import { C } from './content.js';
import { isoDay, daysAgo, formatDate, weeksBetween, currentAmpel, ampelState } from './logic.js';
import { esc, richText } from './ui.js';
import { lineChart, barChart, changeBars, statusStrip, wireCharts } from './charts.js';
import * as S from './stats.js';
import { recentSessions, sessionList } from './journal.js';

const RANGES = [[6, '6 Wochen'], [12, '12 Wochen'], [0, 'Alles']];
let range = 12;
let chosenEx = null;

const SERIES = [
  { key: 'kraft', label: 'Kraft', color: 'var(--series-1)' },
  { key: 'power', label: 'Power & Sprünge', color: 'var(--series-2)' },
  { key: 'ausdauer', label: 'Ausdauer', color: 'var(--series-3)' }
];

export async function fortschritt() {
  const all = await recentSessions();
  const first = all.length ? all[all.length - 1].date.slice(0, 10) : isoDay();
  const weeks = range || Math.min(52, Math.max(4, weeksBetween(first) + 1));
  const since = isoDay(daysAgo(weeks * 7));
  const inRange = all.filter(s => s.date >= since);

  const hours = inRange.reduce((a, s) => a + (s.minutes || 0), 0) / 60;
  const km = inRange.reduce((a, s) => a + (s.cardio?.distanceKm || 0), 0);
  const hm = inRange.reduce((a, s) => a + (s.cardio?.elevationM || 0), 0);

  // Stärker
  const exs = await S.loggedExercises();
  if (!chosenEx || !exs.some(e => e.ex.id === chosenEx)) chosenEx = exs[0]?.ex.id || null;
  const exSeries = chosenEx ? await S.exerciseSeries(chosenEx, since) : null;

  // Schneller / ausdauernder / Belastung
  const wk = await S.weekly(weeks);
  const speed = await S.easyRunSpeed(since);
  const climb = await S.climbRate(since);
  const cardioMin = wk.reduce((a, w) => a + w.cardioMin, 0);
  const easyShare = cardioMin ? Math.round((wk.reduce((a, w) => a + w.easyMin, 0) / cardioMin) * 100) : null;

  // Beckenboden
  const pelvic = await S.pelvicPoints(since);
  const pfDays = await S.pfDays(since);
  const ampel = await currentAmpel();

  // Tests
  const { runs, rows } = await S.batteryChange();
  const lastRun = runs.length ? runs[runs.length - 1].date : null;
  const due = !lastRun || weeksBetween(lastRun) >= C.tests.battery.intervalWeeks;
  const settings = await db.getSettings();

  const delta = v => v == null ? '' : `<span class="delta ${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(v))} %</span>`;

  return {
    title: 'Fortschritt',
    html: `
      <div class="seg" data-seg="range" role="group" aria-label="Zeitraum">${RANGES.map(([v, l]) =>
        `<button type="button" data-value="${v}" aria-pressed="${v === range}">${l}</button>`).join('')}</div>

      <div class="tiles">
        <div class="tile"><span class="tl">Einheiten</span><span class="tv">${inRange.length}</span></div>
        <div class="tile"><span class="tl">Stunden</span><span class="tv">${hours.toFixed(1)}</span></div>
        <div class="tile"><span class="tl">km · Hm</span><span class="tv">${Math.round(km)} · ${Math.round(hm)}</span></div>
      </div>

      <h2>Stärker 💪</h2>
      <div class="card">
        ${exs.length ? `
          <div class="field" style="margin-top:0"><label for="exsel">Übung</label>
            <select id="exsel">${exs.map(e => `<option value="${e.ex.id}" ${e.ex.id === chosenEx ? 'selected' : ''}>${esc(e.ex.name)} (${e.count} Sätze)</option>`).join('')}</select></div>
          <p class="small muted" style="margin:0">${esc(exSeries.unitLabel)}${exSeries.best != null ? ` · Bestwert ${esc(String(exSeries.best))}` : ''} ${delta(exSeries.change)}</p>
          ${lineChart({ points: exSeries.points, unit: exSeries.metric === 'e1rm' ? 'kg' : exSeries.unitLabel, empty: 'In diesem Zeitraum keine Sätze mit dieser Übung (für das e1RM zählen nur Sätze bis 10 Wdh).' })}
          ${exSeries.metric === 'e1rm' ? `<p class="small muted">${richText('Geschätztes Maximalgewicht nach Epley. Wichtig ist der Trend, nicht die einzelne Zahl.')}</p>` : ''}`
        : '<p class="muted small">Sobald du Krafteinheiten erfasst, siehst du hier deinen Verlauf pro Übung.</p>'}
      </div>

      <h2>Schneller 🏃‍♀️</h2>
      <div class="card">
        <h3>Tempo bei lockeren Läufen</h3>
        <p class="small muted" style="margin-top:0">km/h bei Läufen mit Anstrengung ≤ 4 – gleiche Anstrengung, höheres Tempo heisst: fitter.</p>
        ${lineChart({ points: speed, unit: 'km/h', fmt: v => v.toFixed(1), empty: 'Noch keine lockeren Läufe mit Distanz erfasst.' })}
      </div>
      <div class="card">
        <h3>Höhenmeter pro Stunde</h3>
        <p class="small muted" style="margin-top:0">Einheiten mit mindestens 100 Hm, ganze Dauer inklusive Abstieg.</p>
        ${lineChart({ points: climb, unit: 'Hm/h', zeroBase: true, fmt: v => String(Math.round(v)), empty: 'Noch keine Einheiten mit Höhenmetern.' })}
      </div>

      <h2>Ausdauernder ⛰️</h2>
      <div class="card">
        <h3>Kilometer pro Woche</h3>
        ${barChart({ bars: wk.map(w => ({ label: S.weekLabel(w.week), parts: { km: Math.round(w.km * 10) / 10 } })), series: [{ key: 'km', label: 'km', color: 'var(--series-1)' }], unit: 'km', empty: 'Noch keine Distanzen erfasst.' })}
      </div>
      <div class="card">
        <h3>Höhenmeter pro Woche</h3>
        ${barChart({ bars: wk.map(w => ({ label: S.weekLabel(w.week), parts: { hm: w.hm } })), series: [{ key: 'hm', label: 'Hm', color: 'var(--series-1)' }], unit: 'Hm', fmt: v => String(Math.round(v)), empty: 'Noch keine Höhenmeter erfasst.' })}
      </div>

      <h2>Belastung</h2>
      <div class="card">
        <h3>Wochenbelastung (Anstrengung × Minuten)</h3>
        ${barChart({ bars: wk.map(w => ({ label: S.weekLabel(w.week), parts: w.load })), series: SERIES, fmt: v => String(Math.round(v)), empty: 'Noch keine Einheiten erfasst.' })}
        ${easyShare != null ? `<p class="small">Anteil lockere Ausdauer (Anstrengung ≤ 4): <b>${easyShare} %</b> – ${richText('Ziel rund 75–80 % [15].')}</p>` : ''}
        <p class="small muted">${richText('Keine «Akut-zu-chronisch»-Ampel – sie sagt Verletzungen nicht voraus [39]. Achte stattdessen auf einzelne lange Läufe [21].')}</p>
      </div>

      <h2>Beckenboden 🌸</h2>
      <div class="card">
        <p style="margin-top:0"><span class="ampel-chip" data-state="${ampel}">${esc(ampelState(ampel).label)}</span>
          <span class="small"> · ${pfDays} Häkchen-Tage im Zeitraum</span></p>
        ${statusStrip({ points: pelvic, fromISO: since, toISO: isoDay(), empty: 'Noch keine Beckenboden-Checks im Zeitraum.' })}
      </div>

      <h2>Tests 📋</h2>
      <div class="card">
        <p style="margin-top:0" class="small">${lastRun ? `Letzte Testbatterie: ${esc(formatDate(lastRun))}` : 'Noch keine Testbatterie gemacht.'}
          ${due ? `<strong>${lastRun ? 'Wieder fällig.' : 'Mach sie als Ausgangswert.'}</strong>` : ''}</p>
        ${runs.length >= 2 ? `<h3>Veränderung seit dem ersten Test</h3>${changeBars({ rows })}`
          : runs.length === 1 ? '<p class="small muted">Ab dem zweiten Durchgang siehst du hier die Veränderung.</p>' : ''}
        <div class="btn-row">
          <a class="btn ${due ? 'primary' : ''}" href="#/tests">Testbatterie</a>
          ${settings.phase >= 3 ? '<a class="btn" href="#/eintrittstest">Eintrittstest Phase 4</a>' : ''}
          ${runs.length ? '<a class="btn" href="#/testverlauf">Alle Werte</a>' : ''}
        </div>
      </div>

      <h2>Tagebuch</h2>
      ${sessionList(all.slice(0, 8))}
      ${all.length > 8 ? '<a class="btn block" href="#/tagebuch">Alle Einträge</a>' : ''}
    `,
    mount(root, rerender) {
      wireCharts(root);
      root.querySelector('[data-seg="range"]').addEventListener('click', e => {
        const b = e.target.closest('button[data-value]');
        if (b) { range = Number(b.dataset.value); rerender(); }
      });
      root.querySelector('#exsel')?.addEventListener('change', e => { chosenEx = e.target.value; rerender(); });
    }
  };
}

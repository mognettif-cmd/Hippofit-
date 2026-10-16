// Trainingsdurchführung: Entwurf anlegen, Sätze mit einem Tipp erfassen,
// Pausen- und Intervalltimer, Abschluss mit Session-RPE und Beckenboden-Check.
import * as db from './db.js';
import { C, EX, BLOCK, resolveBlock, plyoLevel, zone } from './content.js';
import { isoDay, daysAgo, weeksBetween, currentAmpel, ampelState } from './logic.js';
import { esc, richText, openSheet, closeSheet, celebrate } from './ui.js';
import { startRest, stopRest, IntervalTimer, stepsFromSegments, fmt, unlockAudio, keepAwake } from './timer.js';

// ===================== Hilfen =====================
const KB = () => C.exercises.kbWeights;
const DB_STEP = () => C.exercises.dbRange.step;
const DB_MAX = () => C.exercises.dbRange.max;

const DEFAULT_LOAD = {
  kb: { main: 12, accessory: 8, eccentric: 8, calf: 8, carry: 16, power: 12, circuit: 12, core: 8, pf: 4 },
  db: { main: 8, accessory: 6, eccentric: 4, calf: 8, carry: 12, power: 6, circuit: 6, core: 4 }
};

/** Erste Zahl aus einer Dosierungsangabe, passend zur Einheit der Übung. */
export function targetFromDose(reps, unit) {
  const s = String(reps || '');
  if (unit === 'time') {
    const sec = s.match(/(\d+)(?:–\d+)?\s*s\b/);
    if (sec) return Number(sec[1]);
    const min = s.match(/(\d+)(?:–\d+)?\s*Min/);
    if (min) return Number(min[1]) * 60;
  }
  const wdh = s.match(/(\d+)(?:–\d+)?\s*Wdh/);
  if (wdh && unit !== 'time') return Number(wdh[1]);
  const any = s.match(/(\d+)/);
  return any ? Number(any[1]) : 10;
}

export function nextLoad(type, load, dir = 1) {
  if (type === 'kb') {
    const w = KB();
    const i = w.findIndex(x => x >= load);
    const cur = i < 0 ? w.length - 1 : (w[i] === load ? i : (dir > 0 ? i - 1 : i));
    return w[Math.min(w.length - 1, Math.max(0, cur + dir))];
  }
  if (type === 'db') return Math.min(DB_MAX(), Math.max(0, load + dir * DB_STEP()));
  return 0;
}

const unitLabel = (unit, v) => unit === 'time' ? `${v} s` : unit === 'contacts' ? `${v} Kont.` : `${v}`;
const loadLabel = (type, v) => type === 'bw' ? 'KG' : `${v} kg`;

/** Braucht diese Einheit einen Beckenboden-Check? (Laufen, Springen, Swing, schwere Hauptübungen) */
export function needsPelvicCheck(block) {
  if (['power', 'plyo', 'endurance', 'hybrid'].includes(block.category)) return true;
  return (block.items || []).some(i => i.dose === 'main');
}

// ===================== Entwurf =====================
export const getDraft = async () => (await db.get('kv', 'draft'))?.value || null;
const saveDraft = (d) => db.put('kv', { key: 'draft', value: d });
export const clearDraft = () => db.del('kv', 'draft');

async function lastSetsFor(exId) {
  const rows = await db.byIndex('sets', 'exId', exId);
  if (!rows.length) return null;
  const sid = Math.max(...rows.map(r => r.sessionId));
  return rows.filter(r => r.sessionId === sid).sort((a, b) => a.setNo - b.setNo);
}

function replacementFor(ex, maxImpact, usedIds) {
  const fam = C.exercises.exercises.filter(e => e.family === ex.family && e.impact <= maxImpact && !usedIds.has(e.id));
  if (fam.length) return fam[0];
  let e = ex;
  while (e?.easier) {
    e = EX.get(e.easier);
    if (e && e.impact <= maxImpact) return e;
  }
  const power = C.exercises.exercises.filter(x => x.family === 'power' && x.impact <= maxImpact && !usedIds.has(x.id));
  return ['power', 'plyo-low', 'plyo-mid', 'plyo-high'].includes(ex.family) ? power[0] || null : null;
}

async function buildItem(it, ex) {
  const unit = ex.unit || 'reps';
  const item = {
    exId: ex.id, family: it.family, doseType: it.doseType, dose: it.dose || {},
    unit, loadType: ex.load, warmup: it.family === 'warmup', sets: [], last: null, suggestion: null, note: it.note || null
  };
  if (item.warmup) {
    item.sets = [{ done: false }];
    return item;
  }
  const n = parseInt(item.dose.sets, 10) || 1;
  const target = targetFromDose(item.dose.reps, unit);
  let load = ex.load === 'bw' ? 0 : (DEFAULT_LOAD[ex.load]?.[it.doseType] ?? 8);
  let reps = target;
  const last = await lastSetsFor(ex.id);
  if (last) {
    const top = Math.max(...last.map(s => s.load || 0));
    item.last = last.map(s => `${ex.load === 'bw' ? '' : s.load + ' kg × '}${unitLabel(unit, s.reps)}`).join(', ');
    load = top;
    const easy = last.every(s => s.rir != null && s.rir >= 3);
    if (easy) {
      if (ex.load === 'bw' || unit === 'time' || unit === 'contacts') {
        reps = Math.max(target, Math.max(...last.map(s => s.reps)) + (unit === 'time' ? 5 : 1));
        item.suggestion = `Letztes Mal leicht → ${unitLabel(unit, reps)}`;
      } else {
        const up = nextLoad(ex.load, top, 1);
        if (up > top) { load = up; item.suggestion = `Letztes Mal leicht → ${up} kg`; }
      }
    }
  }
  for (let i = 0; i < n; i++) item.sets.push({ load, reps, done: false, rir: null });
  return item;
}

export async function createDraft(blockId, version, { override = false } = {}) {
  const b = BLOCK.get(blockId);
  const s = await db.getSettings();
  const ampel = await currentAmpel();
  const maxImpact = override ? 3 : ampelState(ampel).maxImpact;
  const lvl = s.phase >= 4 ? plyoLevel(weeksBetween(s.phaseStart) + 1) : 1;
  const resolved = resolveBlock(b, s.phase, version, { plyoLevel: lvl });
  const used = new Set(resolved.map(r => r.ex.id));
  const items = [];
  const notes = [];
  for (const r of resolved) {
    let ex = r.ex;
    if (ex.impact > maxImpact) {
      const rep = replacementFor(ex, maxImpact, used);
      if (!rep) { notes.push(`${ex.name} entfällt (Ampel)`); continue; }
      notes.push(`${ex.name} → ${rep.name} (Ampel)`);
      used.add(rep.id);
      ex = rep;
    }
    items.push(await buildItem(r, ex));
  }
  const draft = {
    blockId, version, phase: s.phase, startedAt: new Date().toISOString(),
    ampel, override, plyoLevel: b.levels ? lvl : null, items, notes, timerSec: null
  };
  await saveDraft(draft);
  return draft;
}

// ===================== Intervalltimer (überlebt Neuzeichnen) =====================
let timer = null;
let timerKey = null;
function stepsForDraft(d) {
  const b = BLOCK.get(d.blockId);
  const steps = [];
  if (b.circuit) {
    const work = d.items.filter(i => !i.warmup);
    for (let r = 1; r <= b.circuit.rounds; r++) {
      for (const it of work) {
        steps.push({ sec: b.circuit.workSec, zone: 'Z3', label: `${EX.get(it.exId).name} · Runde ${r}/${b.circuit.rounds}`, kind: 'work' });
        steps.push({ sec: b.circuit.restSec, zone: 'Z1', label: 'Wechseln', kind: 'rest' });
      }
    }
  }
  if (b.segments) steps.push(...stepsFromSegments(b.segments[d.version]));
  return steps;
}
function ensureTimer(d) {
  if (timer && timerKey === d.startedAt) return timer;
  timer?.stop();
  timer = new IntervalTimer(stepsForDraft(d), paintTimer);
  timerKey = d.startedAt;
  return timer;
}
function paintTimer(t) {
  const el = document.getElementById('itimer');
  if (!el) return;
  const step = t.steps[t.idx];
  el.querySelector('.it-time').textContent = t.done ? 'Fertig' : fmt(Math.ceil(t.remaining));
  el.querySelector('.it-label').textContent = t.done ? 'Gut gemacht! 🦛' : step.label;
  const z = !t.done && zone(step.zone);
  el.querySelector('.it-zone').textContent = z ? `${z.id} · ${z.name} · ${z.talk}` : '';
  el.dataset.kind = t.done ? 'done' : step.kind;
  const nxt = t.steps[t.idx + 1];
  el.querySelector('.it-next').textContent = nxt ? `Danach: ${nxt.label} (${fmt(nxt.sec)})` : '';
  el.querySelector('.it-total').textContent = `${fmt(t.elapsedSec())} von ${fmt(t.totalSec)}`;
  const go = el.querySelector('[data-t="toggle"]');
  go.textContent = t.running ? 'Pause' : (t.elapsedSec() > 0 && !t.done ? 'Weiter' : 'Start');
  go.disabled = t.done;
}

// ===================== Ansicht: Training läuft =====================
let clockInt = null;
export async function runView() {
  const d = await getDraft();
  if (!d) return { title: 'Training', back: '#/training', html: '<p>Kein laufendes Training.</p><a class="btn" href="#/training">Block wählen</a>' };
  const b = BLOCK.get(d.blockId);
  const hasTimer = !!(b.segments || b.circuit);
  const longestRun = b.category === 'endurance' ? await longestRunKm(30) : 0;

  const itemsHtml = d.items.map((it, i) => itemCard(it, i, d)).join('');
  const timerHtml = hasTimer ? `
    <div class="card itimer" id="itimer">
      <div class="it-zone small"></div>
      <div class="it-time">0:00</div>
      <div class="it-label"></div>
      <div class="it-next small muted"></div>
      <div class="btn-row">
        <button class="btn primary" data-t="toggle" style="flex:2">Start</button>
        <button class="btn" data-t="skip" style="flex:1">Überspringen</button>
      </div>
      <div class="it-total small muted"></div>
    </div>
    ${b.variants && d.ampel !== 'green' && !d.override ? `<div class="card small"><strong>Ampel ${esc(ampelState(d.ampel).label)}:</strong> ${esc(b.variants[d.ampel === 'red' ? 'red' : 'yellow'])}</div>` : ''}
    ${longestRun ? `<p class="small muted">${richText(`Längster Lauf der letzten 30 Tage: ${longestRun.toFixed(1)} km – heute möglichst nicht über ${(longestRun * 1.1).toFixed(1)} km [21].`)}</p>` : ''}` : '';

  return {
    title: b.name,
    back: '#/training',
    html: `
      <div class="runhead">
        <span class="badge ${b.category}">${esc(b.id)}</span>
        <span class="grow"><strong>${d.version === 'short' ? 'Kurz' : 'Normal'}</strong> · Phase ${Math.min(d.phase, 4)}${d.plyoLevel ? ` · Plyo-Stufe ${d.plyoLevel}` : ''}</span>
        <span class="clock" id="clock">0:00</span>
      </div>
      ${d.notes.length ? `<div class="card small">${d.notes.map(esc).join('<br>')}</div>` : ''}
      ${timerHtml}
      ${b.circuit ? `<div class="section-label">Zirkel: ${b.circuit.rounds} Runden à ${b.circuit.workSec} s / ${b.circuit.restSec} s</div>` : ''}
      ${itemsHtml}
      <div class="btn-row">
        <a class="btn primary block" href="#/fertig">Training abschliessen</a>
      </div>
      <div class="btn-row"><button class="btn danger block" data-act="discard">Abbrechen ohne Speichern</button></div>
      <div style="height:90px" aria-hidden="true"></div>
    `,
    mount(root, rerender) {
      clearInterval(clockInt);
      const clock = root.querySelector('#clock');
      const tickClock = () => { clock.textContent = fmt((Date.now() - new Date(d.startedAt)) / 1000); };
      tickClock();
      clockInt = setInterval(tickClock, 1000);
      keepAwake(true);
      if (hasTimer) {
        const t = ensureTimer(d);
        t.onUpdate = paintTimer;
        paintTimer(t);
        root.querySelector('[data-t="toggle"]').addEventListener('click', () => {
          unlockAudio();
          t.running ? t.pause() : t.start();
        });
        root.querySelector('[data-t="skip"]').addEventListener('click', () => t.skip());
      }
      root.onclick = e => onRunClick(e, d, rerender);
    },
    unmount({ leaving } = {}) {
      clearInterval(clockInt);
      if (leaving) stopRest();
      if (hasTimer && timer) {
        d.timerSec = Math.round(timer.elapsedSec());
        saveDraft(d);
      }
      if (!timer?.running) keepAwake(false);
    }
  };
}

function itemCard(it, i, d) {
  const ex = EX.get(it.exId);
  if (it.warmup) {
    const done = it.sets[0].done;
    return `<div class="card excard warm ${done ? 'is-done' : ''}">
      <div class="exhead"><button class="linkish" data-info="${i}">${esc(ex.name)}</button>
        <button class="check ${done ? 'on' : ''}" data-check="${i}:0" aria-label="Erledigt">${done ? '✓' : ''}</button></div>
      <div class="small muted">Aufwärmen · ${esc(it.dose.reps || '')}</div></div>`;
  }
  const doseTxt = it.dose ? `${esc(it.dose.sets)} × ${esc(it.dose.reps)}${it.dose.rir != null ? ` · RIR ${it.dose.rir}` : ''}${ex.unilateral ? ' · pro Seite' : ''}` : '';
  const rows = it.sets.map((s, j) => `
    <div class="setrow ${s.done ? 'is-done' : ''}">
      <span class="sn">${j + 1}</span>
      ${it.loadType === 'bw' ? '<span class="val static">KG</span>' : `<button class="val" data-edit="${i}:${j}:load">${loadLabel(it.loadType, s.load)}</button>`}
      <span class="x">×</span>
      <button class="val" data-edit="${i}:${j}:reps">${unitLabel(it.unit, s.reps)}</button>
      <button class="check ${s.done ? 'on' : ''}" data-check="${i}:${j}" aria-label="Satz ${j + 1} erledigt">${s.done ? '✓' : ''}</button>
    </div>
    ${s.done ? `<div class="rir" role="group" aria-label="Wie war der Satz?">${C.tests.sessionLog.rirButtons.map(r =>
      `<button data-rir="${i}:${j}:${r.rir}" aria-pressed="${s.rir === r.rir}">${esc(r.label)}</button>`).join('')}</div>` : ''}`).join('');
  return `<div class="card excard">
    <div class="exhead"><button class="linkish" data-info="${i}">${esc(ex.name)}</button>
      <button class="btn small-btn" data-swap="${i}">Tauschen</button></div>
    <div class="dose">${doseTxt}</div>
    ${it.last ? `<div class="small muted">Letztes Mal: ${esc(it.last)}</div>` : ''}
    ${it.suggestion ? `<div class="small sugg">↑ ${esc(it.suggestion)}</div>` : ''}
    ${rows}
    <button class="linkish small" data-addset="${i}">+ Satz</button>
  </div>`;
}

async function onRunClick(e, d, rerender) {
  const t = e.target.closest('button, a');
  if (!t) return;
  if (t.dataset.act === 'discard') {
    if (!confirm('Training abbrechen? Die Einträge dieser Einheit gehen verloren.')) return;
    stopRest(); timer?.stop(); timer = null;
    await clearDraft();
    location.hash = '#/training';
    return;
  }
  if (t.dataset.check) {
    unlockAudio();
    const [i, j] = t.dataset.check.split(':').map(Number);
    const it = d.items[i];
    const s = it.sets[j];
    s.done = !s.done;
    await saveDraft(d);
    if (s.done && !it.warmup) {
      const lastOfAll = i === d.items.length - 1 && j === it.sets.length - 1;
      if (!lastOfAll) startRest(it.dose.rest || 60, `Pause · nächster: ${nextLabel(d, i, j)}`);
    } else stopRest();
    rerender();
    return;
  }
  if (t.dataset.rir) {
    const [i, j, r] = t.dataset.rir.split(':').map(Number);
    const s = d.items[i].sets[j];
    s.rir = s.rir === r ? null : r;
    await saveDraft(d);
    rerender();
    return;
  }
  if (t.dataset.addset) {
    const it = d.items[Number(t.dataset.addset)];
    const prev = it.sets[it.sets.length - 1];
    it.sets.push({ load: prev.load, reps: prev.reps, done: false, rir: null });
    await saveDraft(d);
    rerender();
    return;
  }
  if (t.dataset.edit) return editValue(d, t.dataset.edit, rerender);
  if (t.dataset.swap) return swapSheet(d, Number(t.dataset.swap), rerender);
  if (t.dataset.info) {
    const ex = EX.get(d.items[Number(t.dataset.info)].exId);
    openSheet(`<h3>${esc(ex.name)}</h3><ul>${ex.cues.map(c => `<li>${esc(c)}</li>`).join('')}</ul>`);
  }
}

function nextLabel(d, i, j) {
  const it = d.items[i];
  if (j < it.sets.length - 1) return `Satz ${j + 2}`;
  const nx = d.items[i + 1];
  return nx ? EX.get(nx.exId).name : 'fertig';
}

function editValue(d, key, rerender) {
  const [i, j, field] = key.split(':');
  const it = d.items[Number(i)];
  const s = it.sets[Number(j)];
  let v = s[field];
  const isLoad = field === 'load';
  const step = (dir) => {
    if (isLoad) v = nextLoad(it.loadType, v, dir);
    else v = Math.max(0, v + dir * (it.unit === 'time' ? 5 : 1));
    document.getElementById('ev-val').textContent = isLoad ? loadLabel(it.loadType, v) : unitLabel(it.unit, v);
  };
  const chips = isLoad && it.loadType === 'kb'
    ? `<div class="chips">${KB().map(w => `<button class="chip-btn" data-kb="${w}">${w}</button>`).join('')}</div>` : '';
  openSheet(`
    <h3>${esc(EX.get(it.exId).name)} · Satz ${Number(j) + 1}</h3>
    <div class="stepper">
      <button class="btn" data-step="-1" aria-label="weniger">−</button>
      <div id="ev-val" class="ev-val">${isLoad ? loadLabel(it.loadType, v) : unitLabel(it.unit, v)}</div>
      <button class="btn" data-step="1" aria-label="mehr">+</button>
    </div>
    ${chips}
    <button class="btn primary block" data-apply>Übernehmen</button>
    <p class="small muted" style="text-align:center">Gilt auch für die folgenden offenen Sätze.</p>`);
  const sheet = document.querySelector('.sheet');
  sheet.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.step) step(Number(b.dataset.step));
    if (b.dataset.kb) { v = Number(b.dataset.kb); step(0); }
    if (b.hasAttribute('data-apply')) {
      it.sets.forEach((x, k) => { if (k >= Number(j) && (!x.done || k === Number(j))) x[field] = v; });
      await saveDraft(d);
      closeSheet();
      rerender();
    }
  });
}

async function swapSheet(d, i, rerender) {
  const it = d.items[i];
  const cur = EX.get(it.exId);
  const maxImpact = d.override ? 3 : ampelState(d.ampel).maxImpact;
  const opts = C.exercises.exercises.filter(e => e.family === cur.family && e.id !== cur.id && e.impact <= maxImpact);
  openSheet(`<h3>${esc(cur.name)} tauschen</h3>
    ${opts.length ? `<ul class="list">${opts.map(e => `<li><button class="row linkrow" data-to="${e.id}">
      <span class="grow"><span class="title">${esc(e.name)}</span>
      <span class="sub">${e.id === cur.easier ? 'leichter' : e.id === cur.harder ? 'schwerer' : 'gleiche Familie'}</span></span></button></li>`).join('')}</ul>`
      : '<p class="muted">Keine passende Alternative in dieser Übungsfamilie.</p>'}`);
  document.querySelector('.sheet').addEventListener('click', async e => {
    const b = e.target.closest('[data-to]');
    if (!b) return;
    const ex = EX.get(b.dataset.to);
    const fresh = await buildItem({ family: it.family, doseType: it.doseType, dose: it.dose }, ex);
    fresh.sets = fresh.sets.slice(0, 1);
    while (fresh.sets.length < it.sets.length) fresh.sets.push({ ...fresh.sets[0] });
    d.items[i] = fresh;
    await saveDraft(d);
    closeSheet();
    rerender();
  });
}

// ===================== Ausdauer-Hilfen =====================
const RUN_MODES = ['Lauf', 'Trail'];
export async function longestRunKm(days, beforeISO = null) {
  const rows = await db.since('sessions', isoDay(daysAgo(days)));
  return rows
    .filter(s => s.cardio && RUN_MODES.includes(s.cardio.mode) && (!beforeISO || s.date < beforeISO))
    .reduce((m, s) => Math.max(m, s.cardio.distanceKm || 0), 0);
}

// ===================== Ansicht: Abschluss =====================
export async function finishView() {
  const d = await getDraft();
  if (!d) return { title: 'Abschluss', back: '#/training', html: '<p>Kein laufendes Training.</p>' };
  const b = BLOCK.get(d.blockId);
  const elapsedMin = Math.max(1, Math.round((Date.now() - new Date(d.startedAt)) / 60000));
  const cardio = b.category === 'endurance' || b.category === 'hybrid';
  const minutes = d.timerSec ? Math.max(1, Math.round(d.timerSec / 60)) : (cardio && elapsedMin < 5 ? b.minutes[d.version] : elapsedMin);
  const pelvic = needsPelvicCheck(b);
  const pc = C.tests.pelvicCheck;
  const longest = cardio ? await longestRunKm(30) : 0;
  const modes = b.modes || ['Lauf', 'Wanderung', 'Velo'];
  const doneSets = d.items.filter(i => !i.warmup).reduce((n, i) => n + i.sets.filter(s => s.done).length, 0);
  const contacts = d.items.filter(i => i.unit === 'contacts').reduce((n, i) => n + i.sets.filter(s => s.done).reduce((a, s) => a + s.reps, 0), 0);

  const srpeScale = C.tests.sessionLog.srpe;
  return {
    title: 'Abschluss',
    back: '#/run',
    html: `
      <p class="muted small">${esc(b.name)} · ${doneSets} Sätze erledigt${contacts ? ` · ${contacts} Bodenkontakte` : ''}</p>
      <form id="fin" class="card" novalidate>
        <div class="field"><label for="min">Dauer (Minuten)</label>
          <input id="min" type="number" inputmode="numeric" min="1" max="600" value="${minutes}" required></div>
        ${cardio ? `
          <div class="field"><span class="label">Art</span>
            <div class="seg" data-seg="mode">${modes.map((m, k) => `<button type="button" data-value="${esc(m)}" aria-pressed="${k === 0}">${esc(m)}</button>`).join('')}</div></div>
          <div class="grid2">
            <div class="field"><label for="km">Distanz (km)</label><input id="km" type="number" inputmode="decimal" step="0.1" min="0" placeholder="z. B. 6.5"></div>
            <div class="field"><label for="hm">Höhenmeter</label><input id="hm" type="number" inputmode="numeric" min="0" placeholder="z. B. 250"></div>
          </div>
          <div class="field"><label for="hr">Puls Ø (optional)</label><input id="hr" type="number" inputmode="numeric" min="40" max="220"></div>
          <p class="small warn" id="spike" hidden></p>` : ''}
        <div class="field"><span class="label">${esc(srpeScale.question)}</span>
          <div class="rpe" data-seg="srpe">${Array.from({ length: 11 }, (_, v) => {
            const lab = srpeScale.scale.find(x => x.value === v);
            return `<button type="button" data-value="${v}" aria-pressed="false"><b>${v}</b>${lab ? `<small>${esc(lab.label)}</small>` : ''}</button>`;
          }).join('')}</div></div>
        ${pelvic ? `
          <div class="field"><span class="label">Beckenboden-Check</span>
            ${pc.questions.map(q => `<p class="small" style="margin:8px 0 4px">${esc(q.text)}</p>
              <div class="seg" data-seg="${q.id}">${pc.answers.map(a => `<button type="button" data-value="${a.value}" aria-pressed="false">${esc(a.label)}</button>`).join('')}</div>`).join('')}
          </div>` : ''}
        <div class="field"><label for="note">Notiz (optional)</label>
          <input id="note" type="text" maxlength="200" placeholder="z. B. schlecht geschlafen, Hausberg, Zyklus …"></div>
        <p class="small warn" id="missing" hidden></p>
        <button class="btn primary block" type="submit">Speichern</button>
      </form>`,
    mount(root) {
      const state = { mode: modes[0], srpe: null, leak: null, heaviness: null };
      root.querySelectorAll('[data-seg]').forEach(g => g.addEventListener('click', e => {
        const btn = e.target.closest('button[data-value]');
        if (!btn) return;
        g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === btn)));
        const k = g.dataset.seg;
        state[k] = k === 'mode' ? btn.dataset.value : Number(btn.dataset.value);
        checkSpike();
      }));
      const km = root.querySelector('#km');
      const spike = root.querySelector('#spike');
      function checkSpike() {
        if (!km) return;
        const v = parseFloat(km.value);
        const show = RUN_MODES.includes(state.mode) && longest > 0 && v > longest * 1.1;
        spike.hidden = !show;
        if (show) spike.textContent = `Achtung: ${v.toFixed(1)} km sind mehr als 10 % über deinem längsten Lauf der letzten 30 Tage (${longest.toFixed(1)} km). Das erhöht das Risiko für Überlastung – nächstes Mal etwas kürzer steigern.`;
      }
      km?.addEventListener('input', checkSpike);

      root.querySelector('#fin').addEventListener('submit', async e => {
        e.preventDefault();
        const missing = [];
        const mins = Number(root.querySelector('#min').value);
        if (!(mins > 0)) missing.push('Dauer');
        if (state.srpe == null) missing.push('Anstrengung');
        if (pelvic && (state.leak == null || state.heaviness == null)) missing.push('Beckenboden-Check');
        const m = root.querySelector('#missing');
        if (missing.length) { m.hidden = false; m.textContent = `Bitte noch ausfüllen: ${missing.join(', ')}`; return; }
        await saveSession(d, b, {
          minutes: mins, srpe: state.srpe, note: root.querySelector('#note').value.trim(),
          cardio: cardio ? {
            mode: state.mode,
            distanceKm: parseFloat(km.value) || null,
            elevationM: parseInt(root.querySelector('#hm').value, 10) || null,
            avgHr: parseInt(root.querySelector('#hr').value, 10) || null,
            source: 'manual'
          } : null,
          contacts: contacts || null,
          pelvic: pelvic ? { leak: state.leak, heaviness: state.heaviness } : null
        });
      });
    }
  };
}

async function saveSession(d, b, f) {
  const date = d.startedAt;
  const sessionId = await db.add('sessions', {
    date, blockId: d.blockId, version: d.version, phase: d.phase,
    minutes: f.minutes, srpe: f.srpe, load: f.minutes * f.srpe,
    cardio: f.cardio, contacts: f.contacts, note: f.note || null,
    ampel: d.ampel, override: d.override || false, plyoLevel: d.plyoLevel,
    items: d.items.map(i => ({ exId: i.exId, warmup: i.warmup, done: i.sets.some(s => s.done) }))
  });
  const sets = [];
  for (const it of d.items) {
    if (it.warmup) continue;
    it.sets.forEach((s, k) => {
      if (s.done) sets.push({ sessionId, exId: it.exId, setNo: k + 1, load: s.load, reps: s.reps, rir: s.rir, unit: it.unit, date });
    });
  }
  for (const s of sets) await db.add('sets', s);
  if (f.pelvic) await db.add('checks', { date, sessionId, ...f.pelvic });
  if (b.category === 'daily' || b.id === 'K3') {
    const today = isoDay();
    await db.put('daily', { date: today, pf: true });
  }
  stopRest();
  timer?.stop(); timer = null;
  await clearDraft();
  const doneSets = sets.length;
  celebrate('Stark gemacht! 💪', `${b.name} · ${f.minutes} Min${doneSets ? ` · ${doneSets} Sätze` : ''}${f.cardio?.distanceKm ? ` · ${f.cardio.distanceKm} km` : ''}`);
  location.hash = '#/heute';
}

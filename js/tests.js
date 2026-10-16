// Testbatterie (alle 6 Wochen), Testverlauf und Eintrittstest für Phase 4.
import * as db from './db.js';
import { C } from './content.js';
import { isoDay, formatDate, currentAmpel, ampelState } from './logic.js';
import { esc, richText, toast } from './ui.js';
import { unlockAudio, beep, fmt } from './timer.js';
import * as S from './stats.js';

/** «12:34» → 754 s, «12» → 720 s (Minuten), leer → null. */
export function parseMinSec(s) {
  s = String(s || '').trim().replace(',', '.');
  if (!s) return null;
  const m = s.match(/^(\d+):([0-5]?\d)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 60) : null;
}

const num = v => { const n = Number(String(v).replace(',', '.')); return v !== '' && Number.isFinite(n) && n >= 0 ? n : null; };

function stopwatchBtn(target) {
  return `<button type="button" class="btn sw-btn" data-sw="${target}" aria-label="Stoppuhr">⏱</button>`;
}

// ===================== Testbatterie =====================
export async function testsView() {
  const s = await db.getSettings();
  const ampel = await currentAmpel();
  const b = C.tests.battery;
  const green = ampel === 'green';

  const testCard = t => {
    const sides = t.side ? [['L', 'links'], ['R', 'rechts']] : [['', '']];
    let inputs;
    if (t.id === 'run-ref') {
      inputs = `<div class="field"><label for="runRefName">Strecke</label>
          <input id="runRefName" type="text" value="${esc(s.runRefName)}" placeholder="z. B. 3 km Seeweg"></div>
        <div class="field"><label for="t-run-ref">Zeit (mm:ss)</label>
          <div class="inrow"><input id="t-run-ref" type="text" inputmode="numeric" placeholder="z. B. 18:40">${stopwatchBtn('t-run-ref')}</div></div>`;
    } else {
      inputs = sides.map(([k, lab]) => `
        <div class="field"><label for="t-${t.id}${k}">${lab ? `${esc(lab)} · ` : ''}${t.unit === 'reps' ? 'Wiederholungen' : t.unit === 'cm' ? 'Zentimeter' : 'Sekunden'}</label>
          <div class="inrow"><input id="t-${t.id}${k}" type="number" inputmode="decimal" min="0" ${t.requiresGreen && !green ? 'disabled' : ''}>
          ${t.unit === 's' ? stopwatchBtn(`t-${t.id}${k}`) : ''}</div></div>`).join('');
      if (t.variants) inputs = `<div class="seg" data-seg="variant">${t.variants.map((v, i) =>
        `<button type="button" data-value="${esc(v)}" aria-pressed="${i === 0}">${esc(v)}</button>`).join('')}</div>` + inputs;
      if (t.id === 'suitcase-time') inputs = `<div class="field"><label for="suitKg">Kettlebell (kg) – immer die gleiche</label>
        <select id="suitKg">${C.exercises.kbWeights.map(w => `<option ${w === s.suitcaseTestKg ? 'selected' : ''}>${w}</option>`).join('')}</select></div>` + inputs;
    }
    return `<div class="card">
      <h3>${esc(t.name)}</h3>
      ${t.requiresGreen && !green ? `<p class="small warn">Nur bei grüner Beckenboden-Ampel (aktuell ${esc(ampelState(ampel).label)}). Diesmal überspringen.</p>` : ''}
      <details><summary class="small">Anleitung</summary><p class="small">${richText(t.protocol)}</p></details>
      ${inputs}</div>`;
  };

  return {
    title: 'Testbatterie',
    back: '#/fortschritt',
    html: `
      <p class="small">${esc(b.intro)}</p>
      <p class="small muted">${richText(b.gradeNote)} <span class="grade">${esc(b.grade)}</span></p>
      ${b.tests.map(testCard).join('')}
      <p class="small muted">Leere Felder werden übersprungen – du kannst auch nur einzelne Tests machen.</p>
      <button class="btn primary block" data-act="save">Ergebnisse speichern</button>
      <div style="height:20px"></div>`,
    mount(root) {
      let variant = C.tests.battery.tests.find(t => t.variants)?.variants[0] || null;
      root.querySelector('[data-seg="variant"]')?.addEventListener('click', e => {
        const btn = e.target.closest('button[data-value]');
        if (!btn) return;
        variant = btn.dataset.value;
        e.currentTarget.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === btn)));
      });
      wireStopwatches(root);
      root.querySelector('[data-act="save"]').addEventListener('click', async () => {
        const date = isoDay();
        const rows = [];
        for (const t of C.tests.battery.tests) {
          if (t.id === 'run-ref') {
            const v = parseMinSec(root.querySelector('#t-run-ref').value);
            if (v) rows.push({ kind: S.BATTERY_ID, date, testId: t.id, value: v, ref: root.querySelector('#runRefName').value.trim() });
            continue;
          }
          for (const k of t.side ? ['L', 'R'] : ['']) {
            const el = root.querySelector(`#t-${t.id}${k}`);
            const v = el && !el.disabled ? num(el.value) : null;
            if (v == null) continue;
            const row = { kind: S.BATTERY_ID, date, testId: t.id, value: v };
            if (k) row.side = k;
            if (t.variants) row.variant = variant;
            if (t.id === 'suitcase-time') row.kg = Number(root.querySelector('#suitKg').value);
            rows.push(row);
          }
        }
        if (!rows.length) { toast('Noch keine Werte eingetragen'); return; }
        // Gleicher Tag nochmals gespeichert → ersetzt die Werte dieses Tages
        const old = (await db.all('tests')).filter(x => x.kind === S.BATTERY_ID && x.date === date);
        for (const o of old) await db.del('tests', o.id);
        for (const r of rows) await db.add('tests', r);
        await db.saveSettings({
          runRefName: root.querySelector('#runRefName').value.trim(),
          suitcaseTestKg: Number(root.querySelector('#suitKg').value)
        });
        toast(`${rows.length} Testwerte gespeichert`);
        location.hash = '#/fortschritt';
      });
    }
  };
}

function wireStopwatches(root) {
  let running = null;
  root.querySelectorAll('[data-sw]').forEach(btn => {
    btn.addEventListener('click', () => {
      unlockAudio();
      if (running && running.btn === btn) {
        const sec = Math.round((Date.now() - running.t0) / 1000);
        clearInterval(running.int);
        const input = root.querySelector('#' + btn.dataset.sw);
        input.value = input.type === 'text' ? fmt(sec) : String(sec);
        btn.textContent = '⏱';
        btn.classList.remove('on');
        beep(880, 150);
        running = null;
        return;
      }
      if (running) return; // nur eine Stoppuhr gleichzeitig
      beep(660, 120);
      running = { btn, t0: Date.now() };
      btn.classList.add('on');
      const tick = () => { btn.textContent = `■ ${fmt((Date.now() - running.t0) / 1000)}`; };
      tick();
      running.int = setInterval(tick, 250);
    });
  });
}

// ===================== Testverlauf =====================
export async function testHistory() {
  const runs = await S.batteryRuns();
  const tests = C.tests.battery.tests;
  const cell = (items, t) => {
    const xs = items.filter(i => i.testId === t.id);
    if (!xs.length) return '–';
    return xs.map(x => `${x.side ? x.side + ' ' : ''}${S.fmtTest(t, x.value)}${x.variant ? ` (${x.variant})` : ''}${x.kg ? ` · ${x.kg} kg` : ''}`).join('<br>');
  };
  return {
    title: 'Testwerte',
    back: '#/fortschritt',
    html: runs.length ? `
      <div class="tablewrap"><table class="tbl">
        <thead><tr><th>Test</th>${runs.map(r => `<th>${esc(formatDate(r.date))}</th>`).join('')}</tr></thead>
        <tbody>${tests.map(t => `<tr><th>${esc(t.name)}</th>${runs.map(r => `<td>${cell(r.items, t)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>
      <div class="btn-row">${runs.map(r => `<button class="btn danger small-btn" data-del="${esc(r.date)}">${esc(formatDate(r.date))} löschen</button>`).join('')}</div>`
      : '<p class="muted">Noch keine Testwerte.</p>',
    mount(root, rerender) {
      root.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm(`Alle Testwerte vom ${formatDate(b.dataset.del)} löschen?`)) return;
        for (const r of runs.find(x => x.date === b.dataset.del).items) await db.del('tests', r.id);
        rerender();
      }));
    }
  };
}

// ===================== Eintrittstest Phase 4 =====================
export async function entryTest() {
  const e = C.tests.phase4Entry;
  const ampel = await currentAmpel();
  const s = await db.getSettings();
  const last = (await db.all('tests')).filter(t => t.kind === 'phase4').sort((a, b) => b.date.localeCompare(a.date))[0];
  const total = e.groups.reduce((n, g) => n + g.items.length, 0);
  return {
    title: 'Eintrittstest',
    back: '#/fortschritt',
    html: `
      <h2>${esc(e.name)}</h2>
      <p class="small">${esc(e.intro)}</p>
      <p class="small muted">${richText(e.gradeNote + ' [34]')} <span class="grade">${esc(e.grade)}</span></p>
      ${last ? `<p class="small">Letzter Versuch: ${esc(formatDate(last.date))} · ${last.done}/${last.total} ${last.passed ? '✓ bestanden' : ''}</p>` : ''}
      ${e.groups.map(g => `<div class="section-label">${esc(g.name)}</div>
        <div class="card" style="padding:4px 14px">${g.items.map(it => `
          <label class="checkrow"><input type="checkbox" data-item="${it.id}"><span>${esc(it.text)}</span></label>`).join('')}</div>`).join('')}
      <div class="card">
        <p style="margin-top:0">Beckenboden-Ampel: <span class="ampel-chip" data-state="${ampel}">${esc(ampelState(ampel).label)}</span></p>
        <p class="small" id="verdict">0 von ${total} erfüllt.</p>
        <button class="btn primary block" data-act="save">Ergebnis speichern</button>
      </div>
      <div id="after"></div>`,
    mount(root) {
      const boxes = [...root.querySelectorAll('[data-item]')];
      const verdict = root.querySelector('#verdict');
      const count = () => boxes.filter(b => b.checked).length;
      const update = () => { verdict.textContent = `${count()} von ${total} erfüllt (ohne Symptome).`; };
      boxes.forEach(b => b.addEventListener('change', update));
      root.querySelector('[data-act="save"]').addEventListener('click', async () => {
        const done = count();
        const passed = done === total && ampel === 'green';
        await db.add('tests', { kind: 'phase4', date: isoDay(), done, total, passed, ampel, items: boxes.filter(b => b.checked).map(b => b.dataset.item) });
        const after = root.querySelector('#after');
        after.innerHTML = passed
          ? `<div class="card"><h3>Bestanden 🎉</h3><p class="small">${esc(e.pass)}</p>
              ${s.phase < 4 ? '<button class="btn primary block" data-act="phase4">Phase 4 starten</button>' : ''}</div>`
          : `<div class="card"><h3>Noch nicht ganz</h3><p class="small">${esc(e.fail)}</p>
              ${done === total && ampel !== 'green' ? `<p class="small">Alle Punkte erfüllt – es fehlt nur die grüne Ampel (aktuell ${esc(ampelState(ampel).label)}).</p>` : ''}</div>`;
        after.querySelector('[data-act="phase4"]')?.addEventListener('click', async () => {
          await db.saveSettings({ phase: 4, phaseStart: isoDay() });
          toast('Phase 4 gestartet – viel Spass beim Hüpfen! 🦛');
          location.hash = '#/heute';
        });
        after.scrollIntoView({ behavior: 'smooth' });
      });
    }
  };
}

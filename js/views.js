// Ansichten. Jede Ansicht liefert { title, html, back?, mount?(root) }.
import * as db from './db.js';
import { C, EX, BLOCK, SRC, phaseInfo, familyName, equipmentName, zone, resolveBlock, plyoLevel } from './content.js';
import { isoDay, weeksBetween, formatDate, currentAmpel, ampelState, blockStatus, weekSuggestion, pfStreak } from './logic.js';
import { esc, richText, sourceHtml, toast, download } from './ui.js';
import * as R from './run.js';
import { lastBatteryDate } from './stats.js';

const CATEGORY = {
  strength: 'Kraft', power: 'Power', plyo: 'Plyometrie', endurance: 'Ausdauer', hybrid: 'Hybrid', daily: 'Täglich'
};

function seg(name, options, value) {
  return `<div class="seg" role="group" data-seg="${name}">${options.map(([v, l]) =>
    `<button type="button" data-value="${esc(v)}" aria-pressed="${String(v) === String(value)}">${esc(l)}</button>`).join('')}</div>`;
}

function onSeg(root, name, fn) {
  root.querySelector(`[data-seg="${name}"]`)?.addEventListener('click', e => {
    const b = e.target.closest('button[data-value]');
    if (b) fn(b.dataset.value);
  });
}

function blockRow(b, status) {
  const mins = b.minutes ? `${b.minutes.short}${b.minutes.normal !== b.minutes.short ? '–' + b.minutes.normal : ''} Min` : '';
  return `<li><a class="row" href="#/block/${b.id}">
    <span class="badge ${b.category}">${esc(b.id)}</span>
    <span class="grow"><span class="title">${esc(b.name)}</span>
      <span class="sub">${esc(mins)}${status?.note ? ` · <span class="chip ${status.locked ? 'locked' : ''}">${esc(status.note)}</span>` : ''}</span></span>
    <span class="chev">›</span></a></li>`;
}

// ===================== Heute =====================
export async function heute() {
  const s = await db.getSettings();
  const ph = phaseInfo(s.phase);
  const ampel = await currentAmpel();
  const amp = ampelState(ampel);
  const week = await weekSuggestion(s);
  const pf = await pfStreak();
  const counts = await db.counts();
  const weeksIn = weeksBetween(s.phaseStart) + 1;
  const draft = await R.getDraft();
  const running = draft ? `
    <a class="card running" href="#/run">
      <span class="badge ${BLOCK.get(draft.blockId).category}">${esc(draft.blockId)}</span>
      <span class="grow"><strong>Training läuft: ${esc(BLOCK.get(draft.blockId).name)}</strong>
        <span class="small muted" style="display:block">Seit ${new Date(draft.startedAt).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })} · antippen zum Fortsetzen</span></span>
      <span class="chev">›</span></a>` : '';

  const onboarding = !s.onboarded ? `
    <div class="card">
      <h2>Willkommen bei HippoFit 🌼</h2>
      <p>Wie oft pro Woche möchtest du trainieren?</p>
      ${seg('days', [[3, '3 Tage'], [4, '4 Tage']], s.daysPerWeek)}
      <p class="small muted">Du startest in Phase 1 «Basis». Phase, Tage und Dauer kannst du jederzeit unter «Mehr» ändern.</p>
      <button class="btn primary block" data-act="start">Los geht's</button>
    </div>` : '';

  const next = week.next ? `
    <ul class="list">${week.next.blocks.map(b => blockRow(b, blockStatus(b, s.phase, ampel))).join('')}</ul>
    ${week.next.blocks.length > 1 ? `<p class="small muted">${esc(C.program.templateNote)}</p>` : ''}`
    : `<p>Alle geplanten Einheiten dieser Woche sind erledigt. 🎉 Zusätzliche Blöcke findest du unter «Training».</p>`;

  const lastTest = await lastBatteryDate();
  const testDue = s.onboarded && (!lastTest || weeksBetween(lastTest) >= C.tests.battery.intervalWeeks);
  const testCard = testDue ? `<div class="card"><h3>Testbatterie ${lastTest ? 'fällig' : 'als Ausgangswert'}</h3>
      <p class="small">${lastTest ? `Letzter Test am ${esc(formatDate(lastTest))}. Alle 6 Wochen siehst du so, wie du stärker und schneller wirst.`
        : 'Sieben kurze Alltagstests (ca. 35 Min). So kannst du später sehen, wie viel du dazugewonnen hast.'}</p>
      <a class="btn block" href="#/tests">Testbatterie öffnen</a></div>` : '';
  const entryCard = s.phase === 3 && weeksBetween(s.phaseStart) >= 3 ? `<div class="card"><h3>Bereit für Sprünge?</h3>
      <p class="small">Nach 4–6 Wochen Phase 3 prüft der Eintrittstest, ob Beine und Beckenboden bereit für die Plyometrie sind.</p>
      <a class="btn block" href="#/eintrittstest">Eintrittstest Phase 4</a></div>` : '';
  const backupDue = counts.sessions > 0 && (!s.lastBackup || weeksBetween(s.lastBackup.slice(0, 10)) >= 2);

  return {
    title: 'Heute',
    html: `
      ${onboarding}
      ${running}
      <div class="card hero">
        <img class="hero-hippo" src="icons/hippo-anim.svg" alt="Das HippoFit-Hippo">
        <div>
          <div class="small muted">${esc(formatDate(isoDay()))}</div>
          <h2 style="margin:2px 0">Phase ${s.phase} · ${esc(ph.name)}</h2>
          <div class="small muted">${s.phase <= 4 ? `Woche ${weeksIn} von ${esc(ph.weeks)}` : 'Freie Wahl'}</div>
        </div>
      </div>

      <div class="card">
        <h3>Nächstes Training</h3>
        <p class="small muted">${week.doneCount} von ${week.days.length} Trainingstagen dieser Woche erledigt</p>
        ${next}
      </div>

      <div class="card">
        <h3>Beckenboden-Häkchen</h3>
        <p class="small">3 × 8–12 maximale Kontraktionen. Dauert etwa 3 Minuten. ${pf.streak ? `<strong>${pf.streak === 1 ? '1 Tag' : pf.streak + ' Tage'} in Folge.</strong>` : ''}</p>
        <button class="btn ${pf.today ? '' : 'primary'} block" data-act="pf">${pf.today ? '✓ Heute erledigt' : 'Heute erledigt'}</button>
        <p class="small"><a href="#/block/PF">Anleitung</a></p>
      </div>

      ${entryCard}
      ${testCard}

      <div class="card">
        <h3>Beckenboden-Ampel: ${esc(amp.label)}</h3>
        <p class="small">${esc(amp.text)}</p>
      </div>

      ${backupDue ? `<div class="card"><h3>Sicherung</h3>
        <p class="small">Deine Daten liegen nur auf diesem Gerät. Mach ab und zu eine Sicherung.</p>
        <a class="btn block" href="#/mehr">Zur Sicherung</a></div>` : ''}
    `,
    mount(root, rerender) {
      onSeg(root, 'days', async v => { await db.saveSettings({ daysPerWeek: Number(v) }); rerender(); });
      root.querySelector('[data-act="start"]')?.addEventListener('click', async () => {
        await db.saveSettings({ onboarded: true, phaseStart: isoDay() });
        db.requestPersistence();
        rerender();
      });
      root.querySelector('[data-act="pf"]').addEventListener('click', async () => {
        const today = isoDay();
        const row = await db.get('daily', today);
        await db.put('daily', { date: today, pf: !(row && row.pf) });
        rerender();
      });
    }
  };
}

// ===================== Training (Blockliste) =====================
export async function training() {
  const s = await db.getSettings();
  const ampel = await currentAmpel();
  const groups = [
    ['Kraft', ['strength']],
    ['Power & Sprünge', ['power', 'plyo']],
    ['Ausdauer', ['endurance', 'hybrid']],
    ['Täglich', ['daily']]
  ];
  return {
    title: 'Training',
    html: `
      <p class="small muted">Alle Blöcke sind frei wählbar. Blöcke über deiner Phase sind markiert, du kannst sie trotzdem öffnen.</p>
      ${groups.map(([label, cats]) => `
        <div class="section-label">${esc(label)}</div>
        <div class="card" style="padding:4px 14px">
          <ul class="list">${C.program.blocks.filter(b => cats.includes(b.category))
            .map(b => blockRow(b, blockStatus(b, s.phase, ampel))).join('')}</ul>
        </div>`).join('')}
    `
  };
}

// ===================== Block-Detail =====================
let blockVersion = null;
export async function block(id) {
  const b = BLOCK.get(id);
  if (!b) return notFound();
  const s = await db.getSettings();
  const ampel = await currentAmpel();
  const st = blockStatus(b, s.phase, ampel);
  const version = blockVersion || s.version;
  const lvl = plyoLevel(weeksBetween(s.phaseStart) + 1);
  const items = resolveBlock(b, s.phase, version, { plyoLevel: lvl });
  const variant = b.variants && ampel !== 'green' ? b.variants[ampel === 'red' ? 'red' : 'yellow'] : null;

  const exHtml = items.map(it => `
    <div class="ex">
      <a href="#/uebung/${it.ex.id}"><strong>${esc(it.ex.name)}</strong></a>
      <div class="dose">${it.dose ? `${esc(it.dose.sets)} × ${esc(it.dose.reps)}${it.dose.rir != null ? ` · RIR ${it.dose.rir}` : ''}${it.dose.rest ? ` · Pause ${it.dose.rest} s` : ''}` : ''}${it.ex.unilateral ? ' · pro Seite' : ''}</div>
    </div>`).join('');

  const segHtml = b.segments ? `
    <div class="section-label">Ablauf</div>
    <div class="card">${b.segments[version].map(sg => sg.repeat
      ? `<div class="ex"><strong>${sg.repeat} ×</strong> ${Math.round(sg.work.sec / 6) / 10} Min ${esc(sg.work.label)} (${esc(sg.work.zone)}) / ${Math.round(sg.rest.sec / 6) / 10} Min ${esc(sg.rest.label)}</div>`
      : `<div class="ex"><strong>${sg.min} Min</strong> ${esc(sg.label)} (${esc(sg.zone)} · ${esc(zone(sg.zone).talk)})</div>`).join('')}
      ${b.progression ? `<p class="small muted">${esc(b.progression)}</p>` : ''}
    </div>` : '';

  return {
    title: `${b.id} · ${b.name}`,
    back: '#/training',
    html: `
      <p>${richText(b.purpose)}</p>
      ${seg('version', [['short', `Kurz · ${b.minutes.short} Min`], ['normal', `Normal · ${b.minutes.normal} Min`]], version)}
      ${st.locked ? `<div class="card small">Dieser Block ist für Phase ${b.minPhase} gedacht. Du bist in Phase ${s.phase}. Du kannst ihn trotzdem machen – vielleicht in der Kurzversion.</div>` : ''}
      ${st.impact ? `<div class="card small"><strong>Ampel ${esc(ampelState(ampel).label)}:</strong> ${esc(variant || st.note)}</div>` : ''}
      ${b.rule ? `<div class="card small">${richText(b.rule)}</div>` : ''}
      ${b.levels ? `<p class="small muted">Plyometrie ${esc(C.program.plyoLevels[lvl - 1].name)} · ${esc(C.program.plyoLevels[lvl - 1].contacts)} Kontakte</p>` : ''}
      ${items.length ? `<div class="section-label">Übungen</div><div class="card" style="padding:4px 16px">${exHtml}</div>` : ''}
      ${segHtml}
      <button class="btn primary block" data-act="start">Training starten</button>
      ${b.refs?.length ? `<p class="small muted">Grundlage: ${richText('[' + b.refs.join(', ') + ']')}</p>` : ''}
    `,
    mount(root, rerender) {
      onSeg(root, 'version', v => { blockVersion = v; rerender(); });
      root.querySelector('[data-act="start"]').addEventListener('click', async () => {
        const existing = await R.getDraft();
        if (existing) {
          const eb = BLOCK.get(existing.blockId);
          if (existing.blockId === b.id && existing.version === version) { location.hash = '#/run'; return; }
          if (!confirm(`Es läuft noch «${eb.name}». Verwerfen und «${b.name}» starten?`)) { location.hash = '#/run'; return; }
          await R.clearDraft();
        }
        let override = false;
        if (b.requiresGreen && ampel !== 'green') {
          if (!confirm(`Die Beckenboden-Ampel ist ${ampelState(ampel).label}. Sprünge sind nur bei Grün vorgesehen. Trotzdem starten? Abbrechen bei Urinverlust, Druckgefühl oder Schmerz.`)) return;
          override = true;
        }
        await R.createDraft(b.id, version, { override });
        location.hash = '#/run';
      });
    }
  };
}

// ===================== Übung =====================
export async function uebung(id) {
  const e = EX.get(id);
  if (!e) return notFound();
  const link = (x, label) => x ? `<a class="btn" href="#/uebung/${x}">${label}: ${esc(EX.get(x).name)}</a>` : '';
  return {
    title: e.name,
    back: 'history',
    html: `
      <p><span class="chip">${esc(familyName(e.family))}</span> ${e.unilateral ? '<span class="chip">einseitig</span>' : ''}
        ${e.impact >= 2 ? '<span class="chip">Sprung</span>' : ''}</p>
      <div class="card">
        <h3>So geht's</h3>
        <ul>${e.cues.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
      </div>
      <p class="small muted">Material: ${e.equipment.map(equipmentName).map(esc).join(', ')}</p>
      <div class="btn-row">${link(e.easier, 'Leichter')}${link(e.harder, 'Schwerer')}</div>
      ${e.refs?.length ? `<p class="small muted">Grundlage: ${richText('[' + e.refs.join(', ') + ']')}</p>` : ''}
    `
  };
}


// ===================== Theorie =====================
export async function theorie() {
  const t = C.theory;
  return {
    title: 'Theorie',
    html: `
      <div class="card prose">
        <h3>${esc(t.intro.title)}</h3>
        ${renderContent(t.intro.content)}
      </div>
      <div class="card" style="padding:4px 14px">
        <ul class="list">
          ${t.chapters.map(ch => `<li><a class="row" href="#/theorie/${ch.id}">
            <span class="grow"><span class="title">${esc(ch.title)}</span></span>
            <span class="grade">${esc(ch.grade)}</span><span class="chev">›</span></a></li>`).join('')}
          <li><a class="row" href="#/quellen"><span class="grow"><span class="title">Quellenverzeichnis</span>
            <span class="sub">${C.sources.sources.length} Quellen</span></span><span class="chev">›</span></a></li>
        </ul>
      </div>`
  };
}

function renderContent(blocks) {
  return blocks.map(b => {
    if (b.t === 'h') return `<h3>${esc(b.x)}</h3>`;
    if (b.t === 'p') return `<p>${richText(b.x)}</p>`;
    if (b.t === 'ul') return `<ul>${b.items.map(i => `<li>${richText(i)}</li>`).join('')}</ul>`;
    return '';
  }).join('');
}

export async function kapitel(id) {
  const chs = C.theory.chapters;
  const i = chs.findIndex(c => c.id === id);
  if (i < 0) return notFound();
  const ch = chs[i];
  const prev = chs[i - 1], next = chs[i + 1];
  return {
    title: ch.title.replace(/^\d+\.\s*/, ''),
    back: '#/theorie',
    html: `
      <h2>${esc(ch.title)} <span class="grade">${esc(ch.grade)}</span></h2>
      <div class="summary"><strong>Kurz gesagt</strong>
        <ul>${ch.summary.map(x => `<li>${richText(x)}</li>`).join('')}</ul></div>
      <div class="prose">${renderContent(ch.content)}</div>
      <div class="section-label">Quellen dieses Kapitels</div>
      <div class="card">${ch.refs.map(n => sourceHtml(SRC.get(n))).join('')}</div>
      <div class="btn-row">
        ${prev ? `<a class="btn" href="#/theorie/${prev.id}">‹ Zurück</a>` : ''}
        ${next ? `<a class="btn primary" href="#/theorie/${next.id}" style="margin-left:auto">Weiter ›</a>` : ''}
      </div>`
  };
}

export async function quellen() {
  return {
    title: 'Quellenverzeichnis',
    back: '#/theorie',
    html: `
      <p class="small muted">${esc(C.sources.note)} Stand: ${esc(C.sources.checked)}.</p>
      <div class="card">${C.sources.sources.map(s => sourceHtml(s, true)).join('')}</div>`
  };
}

// ===================== Mehr (Einstellungen und Daten) =====================
export async function mehr() {
  const s = await db.getSettings();
  const c = await db.counts();
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
  return {
    title: 'Mehr',
    html: `
      <div class="card">
        <h3>Training</h3>
        <div class="field"><label for="phase">Aktuelle Phase</label>
          <select id="phase">${C.program.phases.map(p =>
            `<option value="${p.id}" ${p.id === s.phase ? 'selected' : ''}>Phase ${p.id} · ${esc(p.name)} (${esc(p.weeks)} Wo)</option>`).join('')}</select>
          <p class="small muted">${esc(phaseInfo(s.phase).goal)}</p></div>
        <div class="field"><span class="label">Trainingstage pro Woche</span>${seg('days', [[3, '3 Tage'], [4, '4 Tage']], s.daysPerWeek)}</div>
        <div class="field"><span class="label">Standard-Dauer</span>${seg('version', [['short', 'Kurz (~30 Min)'], ['normal', 'Normal (~45 Min)']], s.version)}</div>
        <div class="field"><label for="runRef">Referenzstrecke für den Lauftest</label>
          <input id="runRef" type="text" placeholder="z. B. 3 km Seeweg oder Hausberg" value="${esc(s.runRefName)}"></div>
      </div>

      <div class="card">
        <h3>Darstellung</h3>
        ${seg('theme', [['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']], s.theme)}
      </div>

      <div class="card">
        <h3>Daten und Sicherung</h3>
        <p class="small">Alle Daten liegen nur auf diesem Gerät. Es gibt kein Konto und keine Cloud.</p>
        <p class="small muted">${c.sessions} Einheiten · ${c.sets} Sätze · ${c.checks} Checks · ${c.tests} Tests · ${c.daily} Häkchen<br>
          Letzte Sicherung: ${s.lastBackup ? esc(formatDate(s.lastBackup)) : 'noch nie'}<br>
          Dauerhafter Speicher: ${persisted === null ? 'unbekannt' : persisted ? 'ja' : 'nein (Browser darf Daten bei Platzmangel löschen)'}</p>
        <div class="btn-row">
          <button class="btn primary" data-act="export">Sicherung speichern</button>
          <label class="btn">Sicherung laden<input type="file" accept="application/json,.json" data-act="import" hidden></label>
        </div>
        <div class="btn-row"><button class="btn danger" data-act="wipe">Alle Daten löschen</button></div>
      </div>

      <div class="card small">
        <h3>Über HippoFit</h3>
        <p>Evidenzbasiertes Hybrid-Training. Grundlage sind ${C.sources.sources.length} geprüfte Quellen, siehe <a href="#/theorie">Theorie</a>.</p>
        <p class="muted">${esc(C.tests.pelvicCheck.disclaimer)} Die App ersetzt keine medizinische Beratung.</p>
      </div>`,
    mount(root, rerender) {
      root.querySelector('#phase').addEventListener('change', async e => {
        await db.saveSettings({ phase: Number(e.target.value), phaseStart: isoDay() });
        toast('Phase geändert');
        rerender();
      });
      onSeg(root, 'days', async v => { await db.saveSettings({ daysPerWeek: Number(v) }); rerender(); });
      onSeg(root, 'version', async v => { await db.saveSettings({ version: v }); rerender(); });
      onSeg(root, 'theme', async v => { await db.saveSettings({ theme: v }); applyTheme(v); rerender(); });
      root.querySelector('#runRef').addEventListener('change', e => db.saveSettings({ runRefName: e.target.value.trim() }));

      root.querySelector('[data-act="export"]').addEventListener('click', async () => {
        const stamp = new Date().toISOString();
        await db.saveSettings({ lastBackup: stamp });
        const data = await db.exportAll();
        download(`hippofit-sicherung-${stamp.slice(0, 10)}.json`, JSON.stringify(data, null, 1));
        toast('Sicherung gespeichert');
        rerender();
      });
      root.querySelector('[data-act="import"]').addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const data = JSON.parse(await file.text());
          const err = db.validateBackup(data);
          if (err) throw new Error(err);
          const n = (data.stores.sessions || []).length;
          if (!confirm(`Sicherung vom ${formatDate(data.exported)} mit ${n} Einheiten laden? Die aktuellen Daten auf diesem Gerät werden ersetzt.`)) return;
          await db.importAll(data);
          applyTheme((await db.getSettings()).theme);
          toast('Sicherung geladen');
          rerender();
        } catch (err) {
          alert('Laden fehlgeschlagen: ' + err.message);
        } finally {
          e.target.value = '';
        }
      });
      root.querySelector('[data-act="wipe"]').addEventListener('click', async () => {
        if (!confirm('Wirklich alle Trainingsdaten auf diesem Gerät löschen?')) return;
        if (!confirm('Letzte Bestätigung: Ohne Sicherung sind die Daten verloren.')) return;
        await db.wipeAll();
        toast('Alle Daten gelöscht');
        rerender();
      });
    }
  };
}

export function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

export function notFound() {
  return { title: 'Nicht gefunden', back: '#/heute', html: '<p>Diese Seite gibt es nicht.</p><a class="btn" href="#/heute">Zu «Heute»</a>' };
}

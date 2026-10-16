// Trainingstagebuch: Liste aller Einheiten und Detailansicht.
import * as db from './db.js';
import { EX, BLOCK } from './content.js';
import { formatDate } from './logic.js';
import { esc, toast } from './ui.js';

function sessionRow(s) {
  const b = BLOCK.get(s.blockId);
  const c = s.cardio;
  const extra = c ? [c.mode, c.distanceKm && `${c.distanceKm} km`, c.elevationM && `${c.elevationM} Hm`].filter(Boolean).join(' · ')
    : s.contacts ? `${s.contacts} Kontakte` : '';
  return `<li><a class="row" href="#/eintrag/${s.id}">
    <span class="badge ${b?.category || ''}">${esc(s.blockId)}</span>
    <span class="grow"><span class="title">${esc(b?.name || s.blockId)}</span>
      <span class="sub">${esc(formatDate(s.date))} · ${s.minutes} Min · RPE ${s.srpe}${extra ? ' · ' + esc(extra) : ''}</span></span>
    <span class="chev">›</span></a></li>`;
}

export async function recentSessions(limit) {
  const all = await db.all('sessions');
  all.sort((a, b) => b.date.localeCompare(a.date));
  return limit ? all.slice(0, limit) : all;
}

export function sessionList(sessions) {
  if (!sessions.length) return '<div class="empty"><img src="icons/hippo.svg" alt="" width="96" height="96"><p class="muted">Noch keine Einheiten erfasst. Starte unter «Training» einen Block – das Hippo wartet schon.</p></div>';
  return `<div class="card" style="padding:4px 14px"><ul class="list">${sessions.map(sessionRow).join('')}</ul></div>`;
}

export async function tagebuch() {
  const all = await recentSessions();
  return {
    title: 'Tagebuch',
    back: '#/fortschritt',
    html: `<p class="small muted">${all.length} Einheiten</p>${sessionList(all)}`
  };
}

export async function eintrag(id) {
  const s = await db.get('sessions', Number(id));
  if (!s) return { title: 'Eintrag', back: '#/tagebuch', html: '<p>Diesen Eintrag gibt es nicht mehr.</p>' };
  const b = BLOCK.get(s.blockId);
  const sets = await db.byIndex('sets', 'sessionId', s.id);
  const checks = (await db.all('checks')).filter(c => c.sessionId === s.id);
  const byEx = new Map();
  sets.sort((a, b2) => a.setNo - b2.setNo).forEach(x => {
    if (!byEx.has(x.exId)) byEx.set(x.exId, []);
    byEx.get(x.exId).push(x);
  });
  const rirTxt = r => r == null ? '' : r >= 3 ? ' (leicht)' : r >= 1 ? ' (passend)' : ' (hart)';
  const val = x => x.unit === 'time' ? `${x.reps} s` : x.unit === 'contacts' ? `${x.reps} Kontakte` : `${x.reps}`;
  const ans = v => ['nein', 'leicht', 'deutlich'][v] ?? '–';
  const c = s.cardio;

  return {
    title: formatDate(s.date),
    back: '#/tagebuch',
    html: `
      <h2>${esc(b?.name || s.blockId)}</h2>
      <p class="muted small">${s.version === 'short' ? 'Kurz' : 'Normal'} · Phase ${Math.min(s.phase, 4)} · ${s.minutes} Min · RPE ${s.srpe} · Belastung ${s.load}</p>
      ${c ? `<div class="card"><h3>${esc(c.mode)}</h3>
        <p>${[c.distanceKm && `${c.distanceKm} km`, c.elevationM && `${c.elevationM} Hm`, c.avgHr && `Puls Ø ${c.avgHr}`,
          c.distanceKm && s.minutes && `${pace(s.minutes, c.distanceKm)} min/km`].filter(Boolean).map(esc).join(' · ') || 'Keine Distanz erfasst'}</p></div>` : ''}
      ${byEx.size ? `<div class="card">${[...byEx].map(([exId, xs]) => {
        const ex = EX.get(exId);
        return `<div class="ex"><strong>${esc(ex?.name || exId)}</strong>
          <div class="small">${xs.map(x => `${ex?.load === 'bw' ? '' : x.load + ' kg × '}${val(x)}${rirTxt(x.rir)}`).map(esc).join('<br>')}</div></div>`;
      }).join('')}</div>` : ''}
      ${s.contacts ? `<p class="small">${s.contacts} Bodenkontakte</p>` : ''}
      ${checks.map(k => `<div class="card small"><strong>Beckenboden-Check:</strong> Urinverlust ${ans(k.leak)} · Druck/Schwere ${ans(k.heaviness)}</div>`).join('')}
      ${s.note ? `<div class="card small"><strong>Notiz:</strong> ${esc(s.note)}</div>` : ''}
      ${s.override ? '<p class="small muted">Ampel bewusst überschrieben.</p>' : ''}
      <div class="btn-row"><button class="btn danger block" data-act="delete">Eintrag löschen</button></div>`,
    mount(root) {
      root.querySelector('[data-act="delete"]').addEventListener('click', async () => {
        if (!confirm('Diesen Eintrag mit allen Sätzen löschen?')) return;
        for (const x of sets) await db.del('sets', x.id);
        for (const k of checks) await db.del('checks', k.id);
        await db.del('sessions', s.id);
        toast('Eintrag gelöscht');
        location.hash = '#/tagebuch';
      });
    }
  };
}

export function pace(minutes, km) {
  const sec = Math.round((minutes * 60) / km);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

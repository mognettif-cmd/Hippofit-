// App-Start und Hash-Router.
import * as db from './db.js';
import { loadContent } from './content.js';
import { currentAmpel, ampelState } from './logic.js';
import { esc, closeSheet } from './ui.js';
import * as V from './views.js';
import * as R from './run.js';
import * as J from './journal.js';
import * as P from './progress.js';
import * as T from './tests.js';

const ROUTES = [
  [/^\/heute$/, () => V.heute(), 'heute'],
  [/^\/training$/, () => V.training(), 'training'],
  [/^\/block\/([\w-]+)$/, m => V.block(m[1]), 'training'],
  [/^\/uebung\/([\w-]+)$/, m => V.uebung(m[1]), 'training'],
  [/^\/run$/, () => R.runView(), 'training'],
  [/^\/fertig$/, () => R.finishView(), 'training'],
  [/^\/fortschritt$/, () => P.fortschritt(), 'fortschritt'],
  [/^\/tests$/, () => T.testsView(), 'fortschritt'],
  [/^\/testverlauf$/, () => T.testHistory(), 'fortschritt'],
  [/^\/eintrittstest$/, () => T.entryTest(), 'fortschritt'],
  [/^\/tagebuch$/, () => J.tagebuch(), 'fortschritt'],
  [/^\/eintrag\/(\d+)$/, m => J.eintrag(m[1]), 'fortschritt'],
  [/^\/theorie$/, () => V.theorie(), 'theorie'],
  [/^\/theorie\/([\w-]+)$/, m => V.kapitel(m[1]), 'theorie'],
  [/^\/quellen$/, () => V.quellen(), 'theorie'],
  [/^\/mehr$/, () => V.mehr(), 'mehr']
];

const $view = document.getElementById('view');
const $title = document.getElementById('title');
const $back = document.getElementById('back');
const $ampel = document.getElementById('ampel');
let backTarget = null;
let renderId = 0;
let currentView = null;
let currentPath = null;

async function render({ keepScroll = false } = {}) {
  const id = ++renderId;
  const path = location.hash.replace(/^#/, '') || '/heute';
  let view, tab = null;
  for (const [re, fn, t] of ROUTES) {
    const m = path.match(re);
    if (m) { view = fn(m); tab = t; break; }
  }
  try {
    view = await (view || V.notFound());
  } catch (err) {
    console.error(err);
    view = { title: 'Fehler', html: `<div class="card"><p>Da ist etwas schiefgelaufen.</p><p class="small muted">${esc(err.message)}</p></div>` };
  }
  if (id !== renderId) return; // inzwischen weiternavigiert

  const y = window.scrollY;
  currentView?.unmount?.({ leaving: path !== currentPath });
  currentView = view;
  currentPath = path;
  $view.onclick = null;
  $title.textContent = view.title;
  document.title = view.title === 'Heute' ? 'HippoFit' : `${view.title} · HippoFit`;
  $view.innerHTML = view.html;
  backTarget = view.back || null;
  $back.hidden = !backTarget;
  document.querySelectorAll('.tabbar a').forEach(a => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  view.mount?.($view, () => render({ keepScroll: true }));
  window.scrollTo(0, keepScroll ? y : 0);
  updateAmpel();
}

async function updateAmpel() {
  const state = await currentAmpel();
  $ampel.dataset.state = state;
  $ampel.textContent = ampelState(state).label;
  $ampel.title = 'Beckenboden-Ampel';
  $ampel.hidden = false;
}

$back.addEventListener('click', () => {
  if (backTarget === 'history' && history.length > 1) history.back();
  else location.hash = backTarget === 'history' ? '#/training' : backTarget;
});

window.addEventListener('hashchange', () => { closeSheet(); render(); });

async function start() {
  try {
    await loadContent();
    V.applyTheme((await db.getSettings()).theme);
    if (!location.hash) history.replaceState(null, '', '#/heute');
    await render();
  } catch (err) {
    console.error(err);
    $view.innerHTML = `<div class="card"><h2>HippoFit konnte nicht starten</h2>
      <p class="small muted">${esc(err.message)}</p>
      <button class="btn" onclick="location.reload()">Neu laden</button></div>`;
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service Worker:', err));
  });
  // Neue Version aktiv → einmal neu laden, damit alles aus derselben Version stammt.
  // Beim allerersten Besuch (noch kein Controller) nicht neu laden.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !hadController) return;
    reloaded = true;
    location.reload();
  });
}

start();

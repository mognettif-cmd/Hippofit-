// Kleine UI-Helfer: Escaping, Quellenverweise, Bottom-Sheet, Toast.
import { SRC } from './content.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Text escapen und Verweise wie [5] oder [5, 6] in antippbare Quellen-Knöpfe verwandeln. */
export function richText(text) {
  return esc(text).replace(/\[(\d+(?:,\s*\d+)*)\]/g, (_, list) =>
    '[' + list.split(',').map(n => n.trim())
      .map(n => `<button class="ref" type="button" data-ref="${n}" aria-label="Quelle ${n}">${n}</button>`)
      .join(', ') + ']');
}

export function sourceHtml(s, withAnchor = false) {
  const link = s.doi ? `https://doi.org/${s.doi}` : s.url;
  return `<div class="source"${withAnchor ? ` id="src-${s.n}"` : ''}>
    <span class="n">[${s.n}]</span>${esc(s.text)}
    <div class="small muted">${esc(s.type)}${s.pmid ? ` · PMID ${esc(s.pmid)}` : ''}</div>
    ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">${esc(s.doi ? 'doi.org/' + s.doi : link)}</a>` : ''}
  </div>`;
}

let sheetEl, scrimEl;
export function openSheet(html) {
  closeSheet();
  scrimEl = document.createElement('div');
  scrimEl.className = 'scrim';
  sheetEl = document.createElement('div');
  sheetEl.className = 'sheet';
  sheetEl.setAttribute('role', 'dialog');
  sheetEl.setAttribute('aria-modal', 'true');
  sheetEl.innerHTML = html + '<div class="btn-row"><button class="btn block" data-close>Schliessen</button></div>';
  scrimEl.addEventListener('click', closeSheet);
  sheetEl.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
  document.body.append(scrimEl, sheetEl);
  sheetEl.querySelector('[data-close]').focus();
}
export function closeSheet() {
  sheetEl?.remove(); scrimEl?.remove();
  sheetEl = scrimEl = null;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

// Quellen-Knöpfe überall in der App
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ref]');
  if (!b) return;
  const s = SRC.get(Number(b.dataset.ref));
  if (s) openSheet(`<h3>Quelle</h3>${sourceHtml(s)}`);
});

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

/** Jubel-Hippo nach einem gespeicherten Training. Schliesst sich selbst oder per Tipp. */
export function celebrate(title, text = '') {
  document.querySelector('.celebrate')?.remove();
  const el = document.createElement('div');
  el.className = 'celebrate';
  el.setAttribute('role', 'status');
  el.innerHTML = `<div class="cel-card">
    <img src="icons/hippo-flex.svg" alt="" width="160" height="160">
    <strong>${esc(title)}</strong>${text ? `<span>${esc(text)}</span>` : ''}
  </div>`;
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 250); };
  el.addEventListener('click', close);
  document.body.append(el);
  setTimeout(close, 2800);
}

/** Datei herunterladen (für den JSON-Export). */
export function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Kleine SVG-Diagramme ohne Bibliothek (offline-tauglich).
// Regeln aus dem Dataviz-Leitfaden: eine Y-Achse, 2px-Linien, Punkte ≥ 8px mit 2px-Ring,
// Balken ≤ 24px mit 4px runder Kappe, 2px Lücke zwischen Segmenten, Legende ab 2 Serien,
// Text nie in Serienfarbe, Tooltip beim Zeigen, Tabelle als Alternative.
import { esc } from './ui.js';

const W = 340;           // viewBox-Breite; skaliert auf Containerbreite
const PAD = { l: 34, r: 10, t: 10, b: 22 };

let uid = 0;

function niceTicks(min, max, count = 4) {
  if (min === max) { max = min + 1; min = Math.max(0, min - 1); }
  const span = max - min;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= count) || 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(6));
  return ticks;
}

const compact = v => Math.abs(v) >= 1000 ? `${+(v / 1000).toFixed(1)}K` : `${+v.toFixed(1)}`;

function table(headers, rows) {
  return `<details class="viz-table"><summary>Als Tabelle</summary>
    <table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></details>`;
}

function legend(series) {
  if (series.length < 2) return '';
  return `<div class="viz-legend">${series.map(s =>
    `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')}</div>`;
}

/**
 * Liniendiagramm, eine Serie.
 * points: [{ x: 'JJJJ-MM-TT', y: Zahl, tip: 'Text' }]
 */
export function lineChart({ points, fmt = compact, unit = '', height = 170, zeroBase = false, empty = 'Noch keine Daten.' }) {
  if (!points.length) return `<p class="muted small">${esc(empty)}</p>`;
  const id = `viz${++uid}`;
  const H = height;
  const ys = points.map(p => p.y);
  const ticks = niceTicks(zeroBase ? 0 : Math.min(...ys), Math.max(...ys));
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const t0 = new Date(points[0].x).getTime();
  const t1 = new Date(points[points.length - 1].x).getTime();
  const sx = x => points.length === 1 ? (PAD.l + W - PAD.r) / 2 : PAD.l + ((new Date(x).getTime() - t0) / (t1 - t0 || 1)) * (W - PAD.l - PAD.r);
  const sy = y => H - PAD.b - ((y - y0) / (y1 - y0 || 1)) * (H - PAD.t - PAD.b);
  const pts = points.map(p => ({ ...p, px: sx(p.x), py: sy(p.y) }));
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.px.toFixed(1)},${p.py.toFixed(1)}`).join('');
  const dateLbl = x => new Date(x).toLocaleDateString('de-CH', { day: 'numeric', month: 'short' });
  const last = pts[pts.length - 1];
  const data = pts.map(p => ({ px: +p.px.toFixed(1), py: +p.py.toFixed(1), t: p.tip || `${fmt(p.y)} ${unit}` }));
  return `<div class="viz" id="${id}" data-kind="line" data-pts="${esc(JSON.stringify(data))}">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Verlauf, letzter Wert ${esc(fmt(last.y))} ${esc(unit)}">
      ${ticks.map(t => `<line class="grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${sy(t)}" y2="${sy(t)}"/>
        <text class="tick" x="${PAD.l - 6}" y="${sy(t) + 3.5}" text-anchor="end">${esc(fmt(t))}</text>`).join('')}
      <text class="tick" x="${PAD.l}" y="${H - 6}">${esc(dateLbl(points[0].x))}</text>
      ${points.length > 1 ? `<text class="tick" x="${W - PAD.r}" y="${H - 6}" text-anchor="end">${esc(dateLbl(last.x))}</text>` : ''}
      <path class="line s1" d="${path}"/>
      ${pts.map(p => `<circle class="dot s1" cx="${p.px.toFixed(1)}" cy="${p.py.toFixed(1)}" r="4"/>`).join('')}
      <line class="xhair" y1="${PAD.t}" y2="${H - PAD.b}" x1="0" x2="0" visibility="hidden"/>
    </svg>
    <div class="viz-tip" hidden></div>
  </div>
  ${table(['Datum', unit || 'Wert'], points.map(p => [dateLbl(p.x), fmt(p.y)]))}`;
}

/**
 * Säulendiagramm, optional gestapelt.
 * bars: [{ label, parts: { key: Zahl }, tip? }]  series: [{ key, label, color }]
 */
export function barChart({ bars, series, fmt = compact, unit = '', height = 170, empty = 'Noch keine Daten.' }) {
  const totals = bars.map(b => series.reduce((a, s) => a + (b.parts[s.key] || 0), 0));
  if (!totals.some(t => t > 0)) return `<p class="muted small">${esc(empty)}</p>`;
  const id = `viz${++uid}`;
  const H = height;
  const ticks = niceTicks(0, Math.max(...totals));
  const y1 = ticks[ticks.length - 1];
  const sy = v => H - PAD.b - (v / (y1 || 1)) * (H - PAD.t - PAD.b);
  const band = (W - PAD.l - PAD.r) / bars.length;
  const bw = Math.min(24, band * 0.62);
  const GAP = 2;
  const marks = bars.map((b, i) => {
    const cx = PAD.l + band * i + band / 2;
    let acc = 0;
    const segs = series.filter(s => (b.parts[s.key] || 0) > 0);
    const rects = segs.map((s, k) => {
      const v = b.parts[s.key];
      const yTop = sy(acc + v), yBot = sy(acc);
      acc += v;
      const h = Math.max(0, yBot - yTop - (k > 0 ? GAP : 0));
      const top = k === segs.length - 1;
      const x = cx - bw / 2;
      const r = Math.min(4, h, bw / 2);
      // Nur das oberste Segment bekommt die runde Kappe; Basis bleibt eckig.
      const d = top
        ? `M${x},${yTop + h}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + bw - r}Q${x + bw},${yTop} ${x + bw},${yTop + r}V${yTop + h}Z`
        : `M${x},${yTop}h${bw}v${h}h${-bw}Z`;
      return `<path d="${d}" style="fill:${s.color}"/>`;
    }).join('');
    const tip = b.tip || [b.label, ...series.filter(s => b.parts[s.key]).map(s => `${s.label}: ${fmt(b.parts[s.key])} ${unit}`)].join('\n');
    return `<g class="bar" tabindex="0" data-tip="${esc(tip)}" data-cx="${cx}" data-cy="${sy(totals[i])}">
      <rect class="hit" x="${cx - band / 2}" y="${PAD.t}" width="${band}" height="${H - PAD.t - PAD.b}"/>${rects}</g>`;
  }).join('');
  const every = Math.ceil(bars.length / 6);
  return `<div class="viz" id="${id}" data-kind="bar">
    ${legend(series)}
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Säulendiagramm">
      ${ticks.map(t => `<line class="grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${sy(t)}" y2="${sy(t)}"/>
        <text class="tick" x="${PAD.l - 6}" y="${sy(t) + 3.5}" text-anchor="end">${esc(fmt(t))}</text>`).join('')}
      <line class="axis" x1="${PAD.l}" x2="${W - PAD.r}" y1="${sy(0)}" y2="${sy(0)}"/>
      ${marks}
      ${bars.map((b, i) => i % every === 0 || i === bars.length - 1
        ? `<text class="tick" x="${PAD.l + band * i + band / 2}" y="${H - 6}" text-anchor="middle">${esc(b.label)}</text>` : '').join('')}
    </svg>
    <div class="viz-tip" hidden></div>
  </div>
  ${table(['Woche', ...series.map(s => s.label), 'Total'], bars.map((b, i) => [b.label, ...series.map(s => fmt(b.parts[s.key] || 0)), fmt(totals[i])]))}`;
}

/**
 * Horizontale Abweichungsbalken (Veränderung in %), blau = besser, rot = schlechter.
 * rows: [{ label, value, detail }]
 */
export function changeBars({ rows, empty = 'Noch keine Vergleichswerte.' }) {
  if (!rows.length) return `<p class="muted small">${esc(empty)}</p>`;
  const id = `viz${++uid}`;
  const rowH = 30, LBL = 128, H = rows.length * rowH + 8;
  const maxAbs = Math.max(10, ...rows.map(r => Math.abs(r.value)));
  const x0 = LBL + (W - LBL - 44) / 2;
  const sx = v => x0 + (v / maxAbs) * ((W - LBL - 44) / 2);
  const marks = rows.map((r, i) => {
    const y = 4 + i * rowH + rowH / 2;
    const x = Math.min(sx(0), sx(r.value)), w = Math.abs(sx(r.value) - sx(0));
    const cls = r.value >= 0 ? 'pos' : 'neg';
    const lx = r.value >= 0 ? sx(r.value) + 4 : sx(r.value) - 4;
    return `<g class="bar" tabindex="0" data-tip="${esc(`${r.label}: ${r.value > 0 ? '+' : ''}${Math.round(r.value)} %\n${r.detail || ''}`)}" data-cx="${sx(r.value)}" data-cy="${y - 8}">
      <rect class="hit" x="0" y="${y - rowH / 2}" width="${W}" height="${rowH}"/>
      <text class="lbl" x="0" y="${y + 4}">${esc(r.label)}</text>
      <rect class="chg ${cls}" x="${x}" y="${y - 7}" width="${Math.max(1, w)}" height="14" rx="3"/>
      <text class="tick val" x="${lx}" y="${y + 4}" text-anchor="${r.value >= 0 ? 'start' : 'end'}">${r.value > 0 ? '+' : ''}${Math.round(r.value)} %</text></g>`;
  }).join('');
  return `<div class="viz" id="${id}" data-kind="bar">
    <div class="viz-legend"><span><i class="pos"></i>besser</span><span><i class="neg"></i>schlechter</span></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Veränderung seit dem ersten Test">
      <line class="axis" x1="${sx(0)}" x2="${sx(0)}" y1="0" y2="${H}"/>
      ${marks}
    </svg>
    <div class="viz-tip" hidden></div>
  </div>
  ${table(['Test', 'Veränderung', 'Werte'], rows.map(r => [r.label, `${r.value > 0 ? '+' : ''}${Math.round(r.value)} %`, r.detail || '']))}`;
}

/**
 * Punktstreifen für den Beckenboden-Check: eine Zeile pro Stufe (nein/leicht/deutlich).
 * points: [{ x: ISO-Datum, level: 0|1|2 }]
 */
export function statusStrip({ points, fromISO, toISO, empty = 'Noch keine Checks.' }) {
  if (!points.length) return `<p class="muted small">${esc(empty)}</p>`;
  const id = `viz${++uid}`;
  const LBL = 64, H = 3 * 26 + 24;
  const levels = [{ v: 2, label: 'deutlich', cls: 'crit', icon: '▲' }, { v: 1, label: 'leicht', cls: 'warn', icon: '■' }, { v: 0, label: 'nein', cls: 'good', icon: '●' }];
  const t0 = new Date(fromISO).getTime(), t1 = new Date(toISO).getTime();
  const sx = x => LBL + ((new Date(x).getTime() - t0) / (t1 - t0 || 1)) * (W - LBL - 10);
  const rowY = v => 14 + levels.findIndex(l => l.v === v) * 26;
  const dateLbl = x => new Date(x).toLocaleDateString('de-CH', { day: 'numeric', month: 'short' });
  return `<div class="viz" id="${id}" data-kind="bar">
    <div class="viz-legend">${levels.map(l => `<span><b class="st ${l.cls}">${l.icon}</b>${l.label}</span>`).join('')}</div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Beckenboden-Checks im Zeitverlauf">
      ${levels.map(l => `<line class="grid" x1="${LBL}" x2="${W - 10}" y1="${rowY(l.v)}" y2="${rowY(l.v)}"/>
        <text class="tick" x="${LBL - 8}" y="${rowY(l.v) + 3.5}" text-anchor="end">${l.label}</text>`).join('')}
      ${points.map(p => {
        const l = levels.find(x => x.v === p.level);
        return `<g class="bar" tabindex="0" data-tip="${esc(`${dateLbl(p.x)}: ${l.label}${p.tip ? '\n' + p.tip : ''}`)}" data-cx="${sx(p.x)}" data-cy="${rowY(p.level) - 6}">
          <circle class="hit" cx="${sx(p.x)}" cy="${rowY(p.level)}" r="12"/>
          <circle class="stdot ${l.cls}" cx="${sx(p.x)}" cy="${rowY(p.level)}" r="5"/></g>`;
      }).join('')}
      <text class="tick" x="${LBL}" y="${H - 4}">${esc(dateLbl(fromISO))}</text>
      <text class="tick" x="${W - 10}" y="${H - 4}" text-anchor="end">${esc(dateLbl(toISO))}</text>
    </svg>
    <div class="viz-tip" hidden></div>
  </div>
  ${table(['Datum', 'Ergebnis'], points.map(p => [dateLbl(p.x), levels.find(l => l.v === p.level).label]))}`;
}

// ---- Tooltip-Verhalten (einmal pro gerenderter Ansicht aufrufen) ----
export function wireCharts(root) {
  root.querySelectorAll('.viz').forEach(viz => {
    const svg = viz.querySelector('svg');
    const tip = viz.querySelector('.viz-tip');
    const show = (text, x, y) => {
      tip.textContent = text;  // textContent: Beschriftungen nie als HTML einsetzen
      tip.hidden = false;
      const box = svg.getBoundingClientRect(), scale = box.width / W;
      const left = Math.min(Math.max(x * scale, 50), box.width - 50);
      tip.style.left = `${left}px`;
      tip.style.top = `${Math.max(0, y * scale - 8)}px`;
    };
    const hide = () => { tip.hidden = true; };

    if (viz.dataset.kind === 'line') {
      const pts = JSON.parse(viz.dataset.pts);
      const xh = svg.querySelector('.xhair');
      const at = (clientX) => {
        const box = svg.getBoundingClientRect();
        const x = ((clientX - box.left) / box.width) * W;
        let best = pts[0];
        for (const p of pts) if (Math.abs(p.px - x) < Math.abs(best.px - x)) best = p;
        xh.setAttribute('x1', best.px); xh.setAttribute('x2', best.px); xh.setAttribute('visibility', 'visible');
        show(best.t, best.px, best.py);
      };
      svg.addEventListener('pointermove', e => at(e.clientX));
      svg.addEventListener('pointerdown', e => at(e.clientX));
      svg.addEventListener('pointerleave', () => { hide(); xh.setAttribute('visibility', 'hidden'); });
    } else {
      viz.querySelectorAll('.bar').forEach(g => {
        const on = () => show(g.dataset.tip, Number(g.dataset.cx), Number(g.dataset.cy));
        g.addEventListener('pointerenter', on);
        g.addEventListener('pointerdown', on);
        g.addEventListener('focus', on);
        g.addEventListener('blur', hide);
      });
      svg.addEventListener('pointerleave', hide);
    }
  });
}

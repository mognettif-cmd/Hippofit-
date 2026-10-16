// Lädt die Inhaltsdaten (data/*.json) und bietet Nachschlage-Funktionen.

const FILES = ['exercises', 'program', 'tests', 'sources', 'theory'];

export const C = {};          // Rohdaten nach Dateiname
export const EX = new Map();  // Übung nach id
export const BLOCK = new Map();
export const SRC = new Map(); // Quelle nach Nummer

export async function loadContent() {
  const data = await Promise.all(FILES.map(f =>
    fetch(`data/${f}.json`).then(r => {
      if (!r.ok) throw new Error(`data/${f}.json: ${r.status}`);
      return r.json();
    })));
  FILES.forEach((f, i) => { C[f] = data[i]; });
  C.exercises.exercises.forEach(e => EX.set(e.id, e));
  C.program.blocks.forEach(b => BLOCK.set(b.id, b));
  C.sources.sources.forEach(s => SRC.set(s.n, s));
}

export const phaseInfo = (id) => C.program.phases.find(p => p.id === id);
export const familyName = (id) => C.exercises.families[id] || id;
export const equipmentName = (id) => C.exercises.equipment[id] || id;
export const zone = (id) => C.program.zones.find(z => z.id === id);

/** Dosierung für einen Dosis-Typ in einer Phase (Phase 5 = Wahl-Modus nutzt Phase 4). */
export function dose(type, phase) {
  const table = C.program.doses[type];
  if (!table) return null;
  return table[String(Math.min(phase, 4))] || null;
}

/** Übung für einen Block-Slot in der gegebenen Phase. */
export function slotExercise(item, phase) {
  const p = Math.min(phase, 4);
  for (let k = p; k >= 1; k--) {
    const id = item.byPhase && item.byPhase[String(k)];
    if (id) return EX.get(id);
  }
  return EX.get(item.ex);
}

/** Plyometrie-Stufe aus den Wochen in Phase 4 (1–2 → 1, 3–4 → 2, ab 5 → 3). */
export function plyoLevel(weeksInPhase) {
  if (weeksInPhase >= 5) return 3;
  if (weeksInPhase >= 3) return 2;
  return 1;
}

/** Löst einen Block für Phase und Version in eine Liste konkreter Übungen auf. */
export function resolveBlock(block, phase, version, opts = {}) {
  const out = [];
  for (const item of block.items || []) {
    if (!item.versions.includes(version)) continue;
    if (item.ex === '@level') {
      const lvl = opts.plyoLevel || 1;
      for (const li of block.levels[String(lvl)]) {
        out.push({ ex: EX.get(li.ex), family: li.family, doseType: 'plyo', dose: { sets: li.sets, reps: li.reps }, contacts: li.contacts, level: lvl });
      }
      continue;
    }
    const ex = slotExercise(item, phase);
    let d = dose(item.dose, phase);
    if (item.dose === 'circuit' && block.circuit) {
      d = { sets: String(block.circuit.rounds), reps: `${block.circuit.workSec} s`, rest: block.circuit.restSec };
    }
    out.push({ ex, family: item.family, doseType: item.dose, dose: d });
  }
  return out;
}

export function blockMinutes(block, version) {
  return block.minutes ? block.minutes[version] : null;
}

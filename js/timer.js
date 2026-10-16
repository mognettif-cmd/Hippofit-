// Timer: Pausentimer und Intervalltimer.
// Beide rechnen mit Zeitstempeln statt mit Ticks. So bleiben sie genau,
// auch wenn der Browser den Tab drosselt oder das Handy kurz gesperrt ist.

// ---- Ton und Vibration ----
let audio;
/** Muss einmal in einem Tipp-Ereignis aufgerufen werden (Browser-Regel für Ton). */
export function unlockAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch { /* kein Ton verfügbar */ }
}
export function beep(freq = 880, ms = 160, vol = 0.25) {
  if (!audio) return;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.frequency.value = freq;
  g.gain.value = vol;
  o.connect(g).connect(audio.destination);
  const t = audio.currentTime;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
  o.start(t);
  o.stop(t + ms / 1000 + 0.02);
}
export function buzz(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// ---- Bildschirm anlassen ----
let wakeLock = null;
let wantWake = false;
export async function keepAwake(on) {
  wantWake = on;
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* z. B. Akku-Sparmodus – kein Problem */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wantWake) keepAwake(true);
});

export function fmt(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---- Pausentimer ----
// Eine Leiste unten am Bildschirm. Startet nach jedem abgehakten Satz.
let rest = null;
export function startRest(seconds, label = 'Pause') {
  stopRest();
  if (!seconds) return;
  const bar = document.createElement('div');
  bar.className = 'restbar';
  bar.innerHTML = `<div class="rb-time" aria-live="off"></div>
    <div class="rb-label">${label}</div>
    <button type="button" class="btn" data-rb="plus">+15 s</button>
    <button type="button" class="btn" data-rb="skip">Weiter</button>
    <div class="rb-progress"><span></span></div>`;
  document.body.append(bar);
  rest = { bar, total: seconds, endsAt: Date.now() + seconds * 1000, warned: false };
  bar.addEventListener('click', e => {
    const b = e.target.closest('[data-rb]');
    if (!b || !rest) return;
    if (b.dataset.rb === 'plus') { rest.endsAt += 15000; rest.total += 15; rest.warned = false; }
    else stopRest();
  });
  rest.int = setInterval(tickRest, 250);
  tickRest();
}
function tickRest() {
  if (!rest) return;
  const left = (rest.endsAt - Date.now()) / 1000;
  rest.bar.querySelector('.rb-time').textContent = fmt(Math.ceil(left));
  rest.bar.querySelector('.rb-progress span').style.width = `${Math.max(0, 100 - (left / rest.total) * 100)}%`;
  if (!rest.warned && left <= 10 && rest.total > 15) {
    rest.warned = true;
    beep(660, 120); buzz(80);
  }
  if (left <= 0) {
    beep(990, 250); setTimeout(() => beep(990, 250), 300); buzz([200, 100, 200]);
    stopRest();
  }
}
export function stopRest() {
  if (!rest) return;
  clearInterval(rest.int);
  rest.bar.remove();
  rest = null;
}

// ---- Intervalltimer ----
/**
 * Wandelt Block-Segmente in eine flache Liste von Schritten um.
 * segments: [{ min, zone, label } | { repeat, work:{sec,zone,label}, rest:{sec,zone,label} }]
 */
export function stepsFromSegments(segments) {
  const steps = [];
  for (const s of segments) {
    if (s.repeat) {
      for (let i = 1; i <= s.repeat; i++) {
        steps.push({ sec: s.work.sec, zone: s.work.zone, label: `${s.work.label} (${i}/${s.repeat})`, kind: 'work' });
        if (i < s.repeat || s.rest) steps.push({ sec: s.rest.sec, zone: s.rest.zone, label: s.rest.label, kind: 'rest' });
      }
    } else {
      steps.push({ sec: s.min * 60, zone: s.zone, label: s.label, kind: 'steady' });
    }
  }
  return steps;
}

export class IntervalTimer {
  constructor(steps, onUpdate) {
    this.steps = steps;
    this.onUpdate = onUpdate;
    this.idx = 0;
    this.running = false;
    this.remaining = steps.length ? steps[0].sec : 0; // Sekunden im aktuellen Schritt (wenn pausiert)
    this.elapsedBefore = 0;  // abgeschlossene Laufzeit in ms
    this.runStart = null;
    this.lastBeep = null;
  }
  get done() { return this.idx >= this.steps.length; }
  get totalSec() { return this.steps.reduce((a, s) => a + s.sec, 0); }
  elapsedSec() {
    return (this.elapsedBefore + (this.running ? Date.now() - this.runStart : 0)) / 1000;
  }
  start() {
    if (this.running || this.done) return;
    unlockAudio();
    this.running = true;
    this.runStart = Date.now();
    this.stepEndsAt = Date.now() + this.remaining * 1000;
    this.int = setInterval(() => this.tick(), 250);
    keepAwake(true);
    this.tick();
  }
  pause() {
    if (!this.running) return;
    this.remaining = Math.max(0, (this.stepEndsAt - Date.now()) / 1000);
    this.elapsedBefore += Date.now() - this.runStart;
    this.running = false;
    clearInterval(this.int);
    this.onUpdate(this);
  }
  skip() {
    const wasRunning = this.running;
    if (wasRunning) this.pause();
    this.next(false);
    if (wasRunning && !this.done) this.start();
    else this.onUpdate(this);
  }
  next(sound = true) {
    this.idx++;
    if (this.done) {
      this.stop();
      if (sound) { beep(990, 300); setTimeout(() => beep(1320, 400), 350); buzz([300, 100, 300]); }
      return;
    }
    this.remaining = this.steps[this.idx].sec;
    this.stepEndsAt = Date.now() + this.remaining * 1000;
    if (sound) {
      const work = this.steps[this.idx].kind === 'work';
      beep(work ? 1100 : 660, 300); buzz(work ? [150, 80, 150] : 200);
    }
  }
  tick() {
    if (!this.running) return;
    let left = (this.stepEndsAt - Date.now()) / 1000;
    // Mehrere Schritte überspringen, falls der Tab lange im Hintergrund war
    while (left <= 0 && !this.done) {
      const overshoot = -left;
      this.next(true);
      if (this.done) break;
      this.stepEndsAt -= overshoot * 1000;
      left = (this.stepEndsAt - Date.now()) / 1000;
    }
    if (!this.done) {
      this.remaining = left;
      const whole = Math.ceil(left);
      if (whole <= 3 && whole >= 1 && this.lastBeep !== `${this.idx}-${whole}`) {
        this.lastBeep = `${this.idx}-${whole}`;
        beep(520, 90, 0.18);
      }
    }
    this.onUpdate(this);
  }
  stop() {
    if (this.running) this.elapsedBefore += Date.now() - this.runStart;
    this.running = false;
    clearInterval(this.int);
    keepAwake(false);
    this.onUpdate?.(this);
  }
}

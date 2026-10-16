// Service Worker: macht HippoFit offline-fähig.
// Bei jeder Änderung an App-Dateien oder Inhalten VERSION erhöhen,
// damit die neue Version geladen und der alte Cache gelöscht wird.
const VERSION = 'hippofit-v0.5.2';

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/db.js',
  'js/content.js',
  'js/logic.js',
  'js/ui.js',
  'js/views.js',
  'js/run.js',
  'js/timer.js',
  'js/journal.js',
  'js/charts.js',
  'js/stats.js',
  'js/progress.js',
  'js/tests.js',
  'data/exercises.json',
  'data/program.json',
  'data/tests.json',
  'data/sources.json',
  'data/theory.json',
  'icons/icon.svg',
  'icons/hippo.svg',
  'icons/hippo-anim.svg',
  'icons/hippo-flex.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(ASSETS.map(a => new Request(a, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('hippofit-') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Seitenaufrufe der App → App-Hülle (Hash-Routing, es gibt nur index.html).
  // Direkt aufgerufene Dateien (z. B. ein Icon) werden normal ausgeliefert.
  const isAppPage = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  if (req.mode === 'navigate' && isAppPage) {
    event.respondWith(
      caches.match('index.html').then(hit => hit || fetch(req))
    );
    return;
  }

  // Alles andere: zuerst Cache, sonst Netz (und für später merken)
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
      }
      return res;
    }))
  );
});

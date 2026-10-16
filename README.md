# HippoFit 🦛🌼

Evidenzbasiertes Hybrid-Training für den Alltag: kräftige Beine für lange Läufe und Wanderungen bergauf und bergab, ein belastbarer Rumpf zum Tragen (Kinder, Einkäufe, Garten) und ein klarer Aufbau von der Basis bis zur Plyometrie, mit Beckenboden-Ampel.

**Installieren:** Die App-Adresse auf dem Handy im Browser öffnen, dann «Zum Home-Bildschirm» wählen (iPhone: Teilen-Menü in Safari, Android: Menü in Chrome). Die App läuft danach offline.

## Was die App kann

- **Training:** 12 frei wählbare Blöcke (Kraft, Power, Plyometrie, Ausdauer, Hybrid, tägliches Beckenboden-Häkchen) in Kurz- (~30 Min) und Normalversion. Die 5 Phasen geben den Aufbau vor.
- **Tagebuch mit einem Tipp:** Gewicht und Wiederholungen sind vorausgefüllt. ✓ heisst «wie geplant». Dazu kommt eine Bewertung «leicht / passend / hart», aus der die App den nächsten Gewichtsvorschlag ableitet.
- **Timer:**
  - Pausentimer nach jedem Satz
  - Intervalltimer für Bergintervalle, Tempo- und Bergab-Einheiten
  - Stoppuhr für Tests
- **Beckenboden-Ampel:** Ein 10-Sekunden-Check nach belastenden Einheiten. Sprünge und Laufintensität passen sich den Symptomen an.
- **Fortschritt:**
  - Kraftverlauf (geschätztes 1RM)
  - Tempo bei lockeren Läufen, Höhenmeter pro Stunde
  - km und Hm pro Woche, Wochenbelastung (sRPE)
  - Testbatterie alle 6 Wochen, Eintrittstest für die Plyometrie
- **Theorie:** 9 Kapitel mit Evidenzgraden und 40 geprüften Quellen.

## Daten und Datenschutz

Alle Trainingsdaten bleiben **nur auf dem Gerät** (IndexedDB). Es gibt kein Konto, keine Cloud und kein Tracking. Unter «Mehr» lässt sich eine Sicherung als JSON-Datei speichern und wieder laden.

## Aufbau

```
index.html, manifest.webmanifest, sw.js   App-Hülle, PWA-Manifest, Offline-Cache
css/app.css                               Gestaltung (hell/dunkel)
js/                                       App-Logik (ohne Framework, ohne Build-Schritt)
data/                                     Übungen, Programm, Tests, Theorie, Quellen (JSON)
icons/                                    Hippo und App-Icons (aus tools/build_hippo.py)
recherche/EVIDENZ.md                      Evidenzgrundlage mit Methodik und Quellen
tools/                                    Prüfskript und Icon-Generator (Python)
```

## Entwicklung

- **Lokal starten:** `python -m http.server 8765` im Projektordner, dann http://localhost:8765 öffnen.
- **Vor jeder Veröffentlichung:**
  - `python tools/validate_data.py` prüft Inhalte, Quellenverweise und den Offline-Cache.
  - `VERSION` in `sw.js` erhöhen, damit installierte Apps das Update laden.
- **Hippo-Icons neu erzeugen:** `python tools/build_hippo.py` (braucht Chrome oder Edge).

## Hinweis

HippoFit ersetzt keine medizinische Beratung. Bei Beckenboden-Beschwerden ist eine spezialisierte Beckenboden-Physiotherapie die erste Wahl.

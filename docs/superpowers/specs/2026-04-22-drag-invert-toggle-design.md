# Design: Drag-Invertierung per UI-Schalter

## Ziel

Die Test-UI soll zwei Checkboxen erhalten, mit denen sich die Maussteuerung fuer die Objektrotation getrennt invertieren laesst:

- Links/Rechts invertieren
- Oben/Unten invertieren

Beide Schalter sind standardmaessig aktiv.

## Kontext

Die aktuelle Objektrotation wird in `viewer/objectRotation.js` berechnet und im `BookViewer` per Pointer-Drag verwendet. Die UI in `index.html` und `main.js` ist ausdruecklich ein Test-Frontend und darf einfache Komfortoptionen tragen, auch wenn spaeter nur eine fest verdrahtete Runtime uebrig bleibt.

## Ansatz

Die Invertierungslogik bleibt in `viewer/objectRotation.js`, damit die Richtungsberechnung an einer Stelle liegt. `main.js` liest zwei Checkboxwerte und gibt sie als Teil der Viewer-Optionen weiter. `BookViewer` speichert diese Steuerungsoptionen und verwendet sie bei Pointer-Moves.

## Architektur

### `index.html`

- Fuegt ein kleines Fieldset fuer Maussteuerung hinzu.
- Beide Checkboxen starten auf `checked`.

### `main.js`

- Liest die zwei Checkboxen ein.
- Reagiert auf `change` sofort ohne Buch-Rebuild.
- Gibt die Werte ueber eine kleine Viewer-Methode weiter.

### `viewer/objectRotation.js`

- Erweitert `applyDragToRotation(...)` um zwei Richtungsfaktoren:
  - `invertX`
  - `invertY`

### `viewer/bookViewer.js`

- Speichert aktuelle Drag-Optionen.
- Mischt diese in die bestehende Drag-Konfiguration.

## Verifikation

- Node-Test fuer `applyDragToRotation(...)` mit invertierten Achsen.
- Syntaxcheck der bearbeiteten JS-Dateien.
- Lint-Pruefung der bearbeiteten Dateien.


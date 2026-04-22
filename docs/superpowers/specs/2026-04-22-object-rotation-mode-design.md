# Design: Objektrotation statt Kamerafahrt

## Ziel

Der Viewer soll von einem kameraorientierten Orbit-Modus auf einen objektorientierten Drehteller-Modus umgestellt werden. Das Buch rotiert im Raum, waehrend Kamera und Lichtquellen grundsaetzlich in einer festen Studio-Konfiguration verbleiben.

## Kontext

Der aktuelle Viewer nutzt `OrbitControls`, Kamera-Presets und eine lichtfeste Studioszene. Die View-Presets verschieben derzeit die Kamera um das Buch. Dadurch wirkt die Rueckseite bei Drehung dunkler, weil die Lichtquellen fest im Raum stehen und nur die Blickrichtung wechselt.

Die gewuenschte Bedienung ist:

- View-Presets drehen das Buchobjekt.
- Mausziehen dreht ebenfalls das Buchobjekt.
- Die Kamera bleibt grundsaetzlich stationaer.
- Eine leichte vertikale Neigung ist erlaubt, soll aber begrenzt bleiben.

## Empfohlener Ansatz

Es wird ein eigener Rotations-Pivot fuer das Buch eingefuehrt. Das eigentliche Buchmesh wird nicht direkt in die Szene gehaengt, sondern unter einer Container-Group gespeichert, deren Rotation die sichtbare Ansicht bestimmt.

Der bestehende Orbit-Kameraflug wird deaktiviert bzw. fuer Rotation nicht mehr verwendet. Zoom darf erhalten bleiben, solange er nur den Kamerabstand entlang der bestehenden Blickachse aendert und nicht wieder eine Orbit-Bewegung erzeugt.

## Architektur

### `viewer/bookViewer.js`

- Fuehrt eine neue Root-Group fuer die Buchrotation ein, z. B. `bookOrbitRoot`.
- Haengt das erzeugte Buchmesh unter diese Root-Group.
- Verwaltet den aktuellen Objektwinkel als internen State:
  - `rotationYaw`
  - `rotationPitch`
- Definiert feste Preset-Winkel fuer `front`, `marketing`, `spine`, `open`.
- Setzt die Kamera auf eine feste Studio-Position und richtet sie auf die Buchmitte aus.
- Ersetzt kamerabasierte Presets durch objektbasierte Presets.
- Implementiert Pointer-Interaktion fuer Drag-Rotation des Buchobjekts.
- Begrenzt `rotationPitch`, damit das Buch nicht unnatuerlich kippt.

### `main.js`

- Behaelt die bestehende View-Button-Logik bei, ruft aber weiterhin `setCameraPreset()` auf, das intern nun Objektrotation statt Kamerafahrt ausfuehrt.
- Behaelt `fitCurrentView()` als Ruecksetzung auf die feste Studio-Kamera plus aktuelles Objekt-Preset.
- Muss die bisherige Oeffnungslogik fuer `open` unveraendert weiterreichen.

### `index.html`

- Keine zwingenden UI-Aenderungen fuer die Grundumstellung.
- Bestehende View-Buttons koennen unveraendert bleiben, da ihre Bedeutung fuer den Nutzer identisch bleibt.

## Interaktionsmodell

### Presets

- `front`: Buch zeigt frontal nach vorne.
- `marketing`: Buch steht in einer attraktiven 3/4-Ansicht.
- `spine`: Ruecken zeigt nach vorne.
- `open`: nutzt dieselbe Grundausrichtung wie `marketing` oder eine leicht optimierte Objektrotation und oeffnet zusaetzlich den Deckel.

### Drag

- Horizontales Ziehen aendert `rotationYaw`.
- Vertikales Ziehen aendert `rotationPitch`.
- `rotationPitch` wird auf einen kleinen Bereich begrenzt, damit die Studioansicht glaubwuerdig bleibt.

### Zoom

- Zoom veraendert nur den Abstand der Kamera entlang ihrer Blickrichtung.
- Zoom darf keine neue Orbit-Bewegung einbringen.

## Datenfluss

1. `main.js` sammelt UI-State.
2. `viewer.update(...)` erzeugt das Buch neu.
3. Das neue Buch wird in `bookOrbitRoot` eingesetzt.
4. Die aktuell gespeicherten Objektwinkel werden erneut angewendet.
5. View-Presets setzen Zielwinkel auf der Rotations-Group statt Kameradirektionen.
6. Pointer-Drag aendert dieselben Winkel live.

## Fehlerbehandlung und Stabilitaet

- Nach jedem Buch-Rebuild muessen gespeicherte Rotationswerte erhalten bleiben.
- `fitCurrentView()` darf das Buch nicht unbeabsichtigt auf einen falschen Winkel zuruecksetzen.
- Beim Wechsel auf `open` darf nur die Deckel-Oeffnung geaendert werden; die Objektrotation bleibt deterministisch ueber das Preset.
- Pointer-Handling darf nicht mit Zoom oder UI-Klicks kollidieren.

## Test- und Verifikationsplan

Da im Projekt aktuell kein automatisches Test-Setup vorhanden ist, erfolgt die Verifikation ueber:

- Syntaxcheck der geaenderten JS-Dateien.
- Lint-Pruefung der bearbeiteten Dateien.
- Manuelle Sichtpruefung:
  - `front`, `marketing`, `spine`, `open`
  - Drag-Rotation horizontal und vertikal
  - Zoom-Verhalten
  - Schatten und Lichtwirkung bei Drehung
  - Persistenz der Objektrotation nach `Aktualisieren`

## Nicht-Ziele

- Keine Umstellung der Beleuchtungsarchitektur.
- Keine neuen UI-Elemente fuer Rotationswinkel in diesem Schritt.
- Keine Auto-Rotation oder Turntable-Animation.

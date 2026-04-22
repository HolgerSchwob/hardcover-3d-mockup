# Design: Gemeinsamer PNG/SVG-Cover-Import und reproduzierbare Ansichtswerte

## Ziel

Das Test-Frontend soll vereinfacht und praxisnaeher werden:

- ein gemeinsamer Cover-Input akzeptiert `PNG` oder `SVG`
- die Einzel-Uploads fuer `Front` und `Back` entfallen
- die aktuelle Ansicht wird als klare Zahlenwerte ausgegeben, damit sie spaeter reproduzierbar fest verdrahtet werden kann

## Kontext

Das aktuelle Mockup arbeitet bereits mit einem zentralen `coverSheet`-Input fuer den Druckbogen. Zusaetzlich existieren noch Legacy-Einzeluploads fuer `coverFront` und `coverBack`, die nicht mehr benoetigt werden. Die Objektrotation wird bereits im Viewer verwaltet, aber ihre Werte werden noch nicht sichtbar im UI ausgegeben.

Die Zielanwendung ist eine spaetere kleine 3D-Anzeige-Routine, die mit festen Parametern (Abmessungen, Details, Buchdecken-Grafik) aufgerufen wird und dem Kunden eine Vorschau liefert. Deshalb ist es sinnvoll, die Test-UI jetzt auf genau diese Eingaben und reproduzierbare Ansichtswerte auszurichten.

## Empfohlener Ansatz

Es bleibt bei einem einzigen Cover-Input. Dieser Input akzeptiert `PNG` oder `SVG`. Intern wird immer eine Three.js-Textur erzeugt, unabhaengig vom Ursprungsformat.

SVG-Dateien werden im Browser gerastert: Datei lesen, als `data:`-URL in ein Bild laden, auf ein Canvas zeichnen und anschliessend als `CanvasTexture` bzw. normale Textur verwenden. PNG-Dateien bleiben auf dem bestehenden Ladepfad.

Die aktuellen Ansichtswerte werden im bestehenden Debug-Bereich mit ausgegeben, damit keine zusaetzliche UI-Struktur noetig ist.

## Architektur

### `index.html`

- Der bestehende `coverSheet`-Input wird auf `PNG` und `SVG` erweitert.
- Die Einzeluploads `coverFront` und `coverBack` werden entfernt.
- Der optionale `paperTexture`-Upload bleibt erhalten.

### `textures/textureFactory.js`

- `loadTextureFromFile(file)` erkennt den Dateityp.
- Fuer Rasterbilder (`PNG`, `JPG`) bleibt der bestehende Pfad aktiv.
- Fuer `SVG` wird ein Browser-Rasterisierungspfad hinzugefuegt:
  - SVG lesen
  - Bildobjekt laden
  - auf Canvas in nativer oder sinnvoller Fallback-Groesse rendern
  - daraus eine Three.js-Textur erzeugen
- Beide Pfade liefern eine Textur mit konsistenten Texture-Settings zurueck.

### `main.js`

- Referenzen und Event-Wiring fuer `coverFront` und `coverBack` entfallen.
- `applyChanges()` laedt nur noch:
  - `coverSheet`
  - `paperTexture`
- Der Debug-Block wird um Ansichtswerte erweitert.
- Die Viewer-Ansichtsdaten werden ueber eine kleine Getter-Methode aus dem Viewer gelesen.

### `viewer/bookViewer.js`

- Stellt einen kompakten Getter fuer den aktuellen View-State bereit.
- Dieser Getter liefert mindestens:
  - `preset`
  - `yawRad`
  - `pitchRad`
  - `yawDeg`
  - `pitchDeg`
  - `zoomScale`
  - `cameraPosition`

## Ausgabe der Ansichtswerte

Die Ansichtswerte sollen bewusst numerisch und direkt notierbar sein. Empfohlene Ausgabe:

- Preset-Name
- `yaw` in Radiant und Grad
- `pitch` in Radiant und Grad
- `zoomScale`
- Kamera `x`, `y`, `z`

Diese Werte reichen fuer reproduzierbare Produktansichten im spaeteren System aus.

## Fehlerbehandlung

- Ungueltige oder nicht renderbare SVG-Dateien muessen wie andere Ladefehler als Statusmeldung sichtbar werden.
- Wenn SVG keine expliziten Pixelmasse enthaelt, wird eine sinnvolle Fallback-Groesse fuer die Rasterisierung verwendet.
- Wenn keine Datei geladen ist, bleibt das bestehende neutrale Cover-Verhalten erhalten.

## Verifikationsplan

Da kein grosses Test-Setup vorhanden ist, erfolgt die Verifikation ueber:

- Node-Test fuer die neue kleine Hilfslogik nur dann, wenn sie sinnvoll isolierbar ist
- Syntaxcheck der geaenderten JS-Dateien
- Lint-Pruefung der geaenderten Dateien
- manuelle Sichtpruefung:
  - PNG laden
  - SVG laden
  - Preset wechseln
  - Objekt ziehen / zoomen
  - angezeigte Ansichtswerte beobachten

## Nicht-Ziele

- Keine Backend-Pipeline fuer SVG-Konvertierung in diesem Schritt
- Keine headless Thumbnail-Erzeugung in diesem Schritt
- Keine Erweiterung auf mehrere parallele Cover-Eingaben

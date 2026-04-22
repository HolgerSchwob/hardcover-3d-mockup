# Drag-Invertierung per UI-Schalter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zwei UI-Schalter fuer Drag-Invertierung einbauen und an die bestehende Objektrotationslogik anbinden.

**Architecture:** `viewer/objectRotation.js` bekommt die eigentliche invertierbare Richtungslogik. `BookViewer` verwaltet die aktuellen Drag-Optionen zur Laufzeit. `index.html` und `main.js` liefern nur die beiden Checkboxen und deren State.

**Tech Stack:** Browser-ES-Module, Three.js, Node `--test`, Cursor Lints

---

### Task 1: Rotationslogik test-first erweitern

**Files:**
- Modify: `viewer/objectRotation.test.js`
- Modify: `viewer/objectRotation.js`

- [ ] **Step 1: Write the failing test**

```js
test("drag can invert both axes", () => {
  const result = applyDragToRotation(
    { yaw: 0, pitch: 0 },
    { deltaX: 10, deltaY: 10, yawSpeed: 0.1, pitchSpeed: 0.1, invertX: true, invertY: true, minPitch: -1, maxPitch: 1 },
  );
  assert.equal(result.yaw, 1);
  assert.equal(result.pitch, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "viewer/objectRotation.test.js"`
Expected: FAIL because invert flags are not implemented yet.

- [ ] **Step 3: Write minimal implementation**

```js
const xSign = config.invertX ? 1 : -1;
const ySign = config.invertY ? 1 : -1;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test "viewer/objectRotation.test.js"`
Expected: PASS

### Task 2: UI und Runtime-Anbindung

**Files:**
- Modify: `index.html`
- Modify: `main.js`
- Modify: `viewer/bookViewer.js`

- [ ] **Step 1: Add the checkbox UI**

```html
<fieldset>
  <legend>Maussteuerung</legend>
  <label><input id="dragInvertX" type="checkbox" checked> Links/Rechts invertieren</label>
  <label><input id="dragInvertY" type="checkbox" checked> Oben/Unten invertieren</label>
</fieldset>
```

- [ ] **Step 2: Wire runtime updates**

```js
// read checkbox values in main.js
// call viewer.updateDragOptions(...)
// in viewer/bookViewer.js merge those options into DRAG_CONFIG usage
```

- [ ] **Step 3: Run verification**

Run:
- `node --test "viewer/objectRotation.test.js"`
- `node --check "viewer/objectRotation.js"`
- `node --check "viewer/bookViewer.js"`
- `node --check "main.js"`
- ReadLints on touched files

Expected:
- All pass, no lint errors


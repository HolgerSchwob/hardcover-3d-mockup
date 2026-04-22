# Objektrotation statt Kamerafahrt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Viewer von kamerabasierter Orbit-Navigation auf einen Modus umstellen, in dem sich das Buchobjekt selbst dreht, waehrend Licht und Kamera in einer festen Studio-Konfiguration bleiben.

**Architecture:** Die Rotationslogik wird in einen kleinen, testbaren Helper ausgelagert. `BookViewer` bekommt einen Rotations-Pivot fuer das Buch, feste Kamera-/Preset-Logik und Pointer-Handling fuer Objektrotation statt Orbit. `main.js` behaelt die bestehende UI bei und delegiert weiter an dieselben Viewer-Methoden.

**Tech Stack:** Browser-ES-Module, Three.js, Node `--test` fuer kleine Logiktests, Cursor Lints

---

### Task 1: Rotations-Helper und TDD-Basis

**Files:**
- Create: `viewer/objectRotation.js`
- Create: `viewer/objectRotation.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  clampPitch,
  getObjectRotationPreset,
  applyDragToRotation,
} from "./objectRotation.js";

test("front preset looks straight ahead", () => {
  assert.deepEqual(getObjectRotationPreset("front"), { yaw: 0, pitch: 0 });
});

test("spine preset rotates to back-facing orientation", () => {
  assert.equal(getObjectRotationPreset("spine").yaw, Math.PI);
});

test("drag updates yaw and clamps pitch", () => {
  const result = applyDragToRotation(
    { yaw: 0, pitch: 0 },
    { deltaX: 100, deltaY: 1000, yawSpeed: 0.01, pitchSpeed: 0.01, minPitch: -0.35, maxPitch: 0.35 },
  );
  assert.equal(result.yaw, -1);
  assert.equal(result.pitch, 0.35);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "viewer/objectRotation.test.js"`
Expected: FAIL because `viewer/objectRotation.js` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
const PRESETS = {
  front: { yaw: 0, pitch: 0 },
  marketing: { yaw: -0.78, pitch: -0.12 },
  spine: { yaw: Math.PI, pitch: -0.02 },
  open: { yaw: -0.92, pitch: -0.16 },
};

export function clampPitch(pitch, minPitch = -0.35, maxPitch = 0.35) {
  return Math.min(maxPitch, Math.max(minPitch, pitch));
}

export function getObjectRotationPreset(name) {
  return { ...(PRESETS[name] ?? PRESETS.marketing) };
}

export function applyDragToRotation(rotation, config) {
  return {
    yaw: rotation.yaw - config.deltaX * config.yawSpeed,
    pitch: clampPitch(rotation.pitch - config.deltaY * config.pitchSpeed, config.minPitch, config.maxPitch),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test "viewer/objectRotation.test.js"`
Expected: PASS

### Task 2: Viewer auf Objektrotation umstellen

**Files:**
- Modify: `viewer/bookViewer.js`
- Use helper: `viewer/objectRotation.js`

- [ ] **Step 1: Write the failing test**

No additional automated browser test. Use Task 1 helper tests as regression safety for preset and clamp logic.

- [ ] **Step 2: Implement minimal viewer changes**

```js
// Sketch:
// - create this.bookOrbitRoot and add it to scene once
// - add/remove this.book under bookOrbitRoot instead of scene
// - store this.objectRotation = { yaw, pitch }
// - set fixed camera position
// - replace OrbitControls rotation with pointer drag handlers
// - keep zoom as camera distance along fixed direction
// - setCameraPreset() applies preset yaw/pitch to bookOrbitRoot
```

- [ ] **Step 3: Run focused verification**

Run:
- `node --check "viewer/bookViewer.js"`
- Manual smoke test in browser for `front`, `marketing`, `spine`, `open`, drag and zoom

Expected:
- Syntax ok
- Presets rotate object, not camera
- Drag rotates object
- Zoom still works

### Task 3: Main-Integration und final verification

**Files:**
- Modify: `main.js`
- Test: `viewer/objectRotation.test.js`

- [ ] **Step 1: Keep UI wiring stable**

```js
// Sketch:
// - retain existing button handlers
// - continue calling viewer.setCameraPreset(...)
// - rely on viewer implementation now rotating the object
// - ensure rebuild path preserves current preset/object rotation
```

- [ ] **Step 2: Run verification**

Run:
- `node --test "viewer/objectRotation.test.js"`
- `node --check "main.js"`
- `node --check "viewer/bookViewer.js"`
- ReadLints on touched files

Expected:
- All pass, no lint errors


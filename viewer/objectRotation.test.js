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

test("spine preset rotates to the back-facing orientation", () => {
  assert.equal(getObjectRotationPreset("spine").yaw, Math.PI);
});

test("clampPitch keeps the tilt within limits", () => {
  assert.equal(clampPitch(0.9, -0.35, 0.35), 0.35);
  assert.equal(clampPitch(-0.9, -0.35, 0.35), -0.35);
});

test("drag updates yaw and clamps pitch", () => {
  const result = applyDragToRotation(
    { yaw: 0, pitch: 0 },
    {
      deltaX: 100,
      deltaY: 1000,
      yawSpeed: 0.01,
      pitchSpeed: 0.01,
      minPitch: -0.35,
      maxPitch: 0.35,
    },
  );
  assert.equal(result.yaw, -1);
  assert.equal(result.pitch, -0.35);
});

test("drag can invert both axes", () => {
  const result = applyDragToRotation(
    { yaw: 0, pitch: 0 },
    {
      deltaX: 10,
      deltaY: 10,
      yawSpeed: 0.1,
      pitchSpeed: 0.1,
      invertX: true,
      invertY: true,
      minPitch: -1,
      maxPitch: 1,
    },
  );
  assert.equal(result.yaw, 1);
  assert.equal(result.pitch, 1);
});

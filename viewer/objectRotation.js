const DEFAULT_MIN_PITCH = -0.35;
const DEFAULT_MAX_PITCH = 0.35;

const PRESETS = Object.freeze({
  front: Object.freeze({ yaw: 0, pitch: 0 }),
  marketing: Object.freeze({ yaw: -0.78, pitch: -0.12 }),
  spine: Object.freeze({ yaw: Math.PI, pitch: -0.02 }),
  open: Object.freeze({ yaw: -0.92, pitch: -0.16 }),
});

export function clampPitch(pitch, minPitch = DEFAULT_MIN_PITCH, maxPitch = DEFAULT_MAX_PITCH) {
  return Math.min(maxPitch, Math.max(minPitch, pitch));
}

export function getObjectRotationPreset(name) {
  const preset = PRESETS[name] ?? PRESETS.marketing;
  return { ...preset };
}

export function applyDragToRotation(rotation, config = {}) {
  const xSign = config.invertX ? 1 : -1;
  const ySign = config.invertY ? 1 : -1;
  const nextYaw = rotation.yaw + xSign * (config.deltaX ?? 0) * (config.yawSpeed ?? 0.01);
  const nextPitch = rotation.pitch + ySign * (config.deltaY ?? 0) * (config.pitchSpeed ?? 0.01);
  return {
    yaw: nextYaw,
    pitch: clampPitch(
      nextPitch,
      config.minPitch ?? DEFAULT_MIN_PITCH,
      config.maxPitch ?? DEFAULT_MAX_PITCH,
    ),
  };
}

import * as THREE from "https://esm.sh/three@0.160.0";
import { GLTFExporter } from "https://esm.sh/three@0.160.0/examples/jsm/exporters/GLTFExporter.js";
import { RoomEnvironment } from "https://esm.sh/three@0.160.0/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "https://esm.sh/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://esm.sh/three@0.160.0/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://esm.sh/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js";
import { createHardcoverBook } from "../geometry/hardcoverBook.js";
import { createBookMaterials } from "../materials/bookMaterials.js";
import { createPrintTemplateDimensions } from "../uv-mapping/uvTemplate.js";
import { applyDragToRotation, getObjectRotationPreset } from "./objectRotation.js";

const DEFAULT_LIGHTING = Object.freeze({
  exposure: 0.98,
  environmentIntensity: 0.92,
  hemisphereIntensity: 0.3,
  keyIntensity: 1.55,
  keyAngleDeg: 30,
  keyPenumbra: 0.72,
  fillIntensity: 0.28,
  rimIntensity: 0.62,
  shadowOpacity: 0.14,
  bloomStrength: 0.035,
});

const FIXED_CAMERA_DIRECTION = new THREE.Vector3(0.75, 0.32, 1.25).normalize();
const FIXED_CAMERA_FIT = 1.22;
const MIN_ZOOM_SCALE = 0.55;
const MAX_ZOOM_SCALE = 2.4;
const DRAG_CONFIG = Object.freeze({
  yawSpeed: 0.01,
  pitchSpeed: 0.008,
  minPitch: -0.35,
  maxPitch: 0.35,
  invertX: true,
  invertY: true,
});

export class BookViewer {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = null;

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.01, 50);
    this.camera.position.set(0.35, 0.18, 0.72);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = DEFAULT_LIGHTING.exposure;
    this.renderer.setClearColor(0xf1f5fb, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.touchAction = "none";
    this.container.appendChild(this.renderer.domElement);

    this.initSceneEnvironment();

    this.book = null;
    this.bookOrbitRoot = new THREE.Group();
    this.scene.add(this.bookOrbitRoot);
    this.lastParams = null;
    this.openAmount = 0;
    this.activePreset = "marketing";
    this.objectRotation = getObjectRotationPreset(this.activePreset);
    this.zoomScale = 1;
    this.dragState = null;
    this.dragOptions = {
      invertX: DRAG_CONFIG.invertX,
      invertY: DRAG_CONFIG.invertY,
    };
    this.resizeObserver = null;
    this.composer = null;
    this.bloomPass = null;
    this.initLights();
    this.initGround();
    this.initPostProcessing();
    this.applyLighting({});
    this.initObjectRotationInteraction();
    this.initResizeHandling();
    this.resize();
    this.fitCurrentView();
    this.animate();
  }

  update(params, textures, options = {}) {
    this.lastParams = params;
    this.openAmount = options.openAmount ?? this.openAmount;
    const dims = createPrintTemplateDimensions(params);
    const materials = createBookMaterials(textures, dims, options.surfaceMaterial ?? {});
    const nextBook = createHardcoverBook(params, materials, {
      openAmount: this.openAmount,
      textBlockStyle: options.textBlockStyle ?? {},
    });
    nextBook.castShadow = true;
    nextBook.receiveShadow = true;

    if (this.book) {
      this.bookOrbitRoot.remove(this.book);
      this.disposeObject(this.book);
    }
    this.book = nextBook;
    this.bookOrbitRoot.add(this.book);
    this.applyObjectRotation();
    this.syncCameraToCurrentView();
    this.applyLighting(options.lighting ?? {});
    this.updateDragOptions(options.dragOptions ?? {});
  }

  updateLighting(lighting = {}) {
    this.applyLighting(lighting);
  }

  updateDragOptions(dragOptions = {}) {
    this.dragOptions = {
      ...this.dragOptions,
      ...dragOptions,
    };
  }

  setCameraPreset(presetName) {
    this.activePreset = presetName;
    this.objectRotation = getObjectRotationPreset(presetName);
    this.zoomScale = 1;
    this.applyObjectRotation();
    this.syncCameraToCurrentView();
  }

  fitCurrentView() {
    this.zoomScale = 1;
    this.syncCameraToCurrentView();
  }

  zoomBy(multiplier) {
    this.zoomScale = THREE.MathUtils.clamp(
      this.zoomScale * multiplier,
      MIN_ZOOM_SCALE,
      MAX_ZOOM_SCALE,
    );
    this.syncCameraToCurrentView();
  }

  setOpenAmount(amount) {
    this.openAmount = THREE.MathUtils.clamp(amount, 0, 1);
  }

  exportGLTF(filename = "hardcover-mockup.gltf") {
    if (!this.book) {
      return;
    }

    const exporter = new GLTFExporter();
    exporter.parse(
      this.book,
      (gltf) => {
        const blob = new Blob([JSON.stringify(gltf, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
      },
      (error) => {
        throw error;
      },
      { binary: false },
    );
  }

  resize() {
    // getBoundingClientRect liefert auch dann korrekte Pixelwerte, wenn
    // das Layout noch nicht final ist; damit setzt der erste Frame eine
    // valide Aspect-Ratio und das Buch sitzt zentriert.
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || this.container.clientWidth));
    const height = Math.max(1, Math.round(rect.height || this.container.clientHeight));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    if (this.composer) {
      this.composer.setSize(width, height);
    }
    if (this.bloomPass?.setSize) {
      this.bloomPass.setSize(width, height);
    }
  }

  initResizeHandling() {
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        this.resize();
        this.fitCurrentView();
      });
      this.resizeObserver.observe(this.container);
    }
  }

  initObjectRotationInteraction() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }
      this.dragState = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      canvas.setPointerCapture?.(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
        return;
      }
      const deltaX = event.clientX - this.dragState.x;
      const deltaY = event.clientY - this.dragState.y;
      this.dragState.x = event.clientX;
      this.dragState.y = event.clientY;
      this.objectRotation = applyDragToRotation(this.objectRotation, {
        ...DRAG_CONFIG,
        ...this.dragOptions,
        deltaX,
        deltaY,
      });
      this.applyObjectRotation();
      this.syncCameraToCurrentView();
    });
    const clearDrag = (event) => {
      if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
        return;
      }
      canvas.releasePointerCapture?.(event.pointerId);
      this.dragState = null;
    };
    canvas.addEventListener("pointerup", clearDrag);
    canvas.addEventListener("pointercancel", clearDrag);
    canvas.addEventListener("lostpointercapture", () => {
      this.dragState = null;
    });
  }

  applyObjectRotation() {
    this.bookOrbitRoot.rotation.x = this.objectRotation.pitch;
    this.bookOrbitRoot.rotation.y = this.objectRotation.yaw;
  }

  syncCameraToCurrentView() {
    const { center, radius } = this.getBookBounds();
    const fovY = THREE.MathUtils.degToRad(this.camera.fov);
    const fovX = 2 * Math.atan(Math.tan(fovY * 0.5) * this.camera.aspect);
    const limitingFov = Math.min(fovY, fovX);
    const baseDistance = (radius / Math.sin(limitingFov * 0.5)) * FIXED_CAMERA_FIT;
    const distance = baseDistance * this.zoomScale;
    const position = center.clone().add(FIXED_CAMERA_DIRECTION.clone().multiplyScalar(distance));
    this.camera.position.copy(position);
    this.camera.lookAt(center);
  }

  getBookBounds() {
    if (!this.book) {
      return {
        center: new THREE.Vector3(0, 0, 0),
        radius: 0.25,
      };
    }

    const box = new THREE.Box3().setFromObject(this.book);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const center = sphere.center.clone();
    const fc = this.book.userData?.framingCenterWorld;
    if (fc) {
      if (Number.isFinite(fc.x)) {
        center.x = fc.x;
      }
      if (Number.isFinite(fc.y)) {
        center.y = fc.y;
      }
      if (Number.isFinite(fc.z)) {
        center.z = fc.z;
      }
    }
    return {
      center,
      radius: Math.max(0.03, sphere.radius),
    };
  }

  initSceneEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = new RoomEnvironment();
    const rt = pmrem.fromScene(env, 0.08);
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = DEFAULT_LIGHTING.environmentIntensity;
    this.scene.background = new THREE.Color(0xf1f5fb);
    pmrem.dispose();
  }

  initLights() {
    // Soft-Studio-Look: neutraler Fill + weicher Kontaktschatten.
    this.hemi = new THREE.HemisphereLight(
      0xf6f8ff,
      0xcfd6e1,
      DEFAULT_LIGHTING.hemisphereIntensity,
    );
    this.scene.add(this.hemi);

    this.key = new THREE.SpotLight(
      0xffffff,
      DEFAULT_LIGHTING.keyIntensity,
      0,
      THREE.MathUtils.degToRad(DEFAULT_LIGHTING.keyAngleDeg),
      DEFAULT_LIGHTING.keyPenumbra,
      1.4,
    );
    this.key.position.set(1.15, 1.6, 1.25);
    this.key.target.position.set(0.02, 0.02, 0.06);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.00009;
    this.key.shadow.normalBias = 0.018;
    this.key.shadow.camera.near = 0.1;
    this.key.shadow.camera.far = 7;
    this.scene.add(this.key);
    this.scene.add(this.key.target);

    this.fill = new THREE.DirectionalLight(0xe8eeff, DEFAULT_LIGHTING.fillIntensity);
    this.fill.position.set(-1.35, 0.8, 0.8);
    this.scene.add(this.fill);

    this.rim = new THREE.SpotLight(
      0xf1f5ff,
      DEFAULT_LIGHTING.rimIntensity,
      0,
      THREE.MathUtils.degToRad(34),
      0.62,
      1.4,
    );
    this.rim.position.set(-0.92, 0.98, -1.3);
    this.rim.target.position.set(-0.05, 0.18, -0.05);
    this.scene.add(this.rim);
    this.scene.add(this.rim.target);

    this.kicker = new THREE.DirectionalLight(0xffffff, 0.08);
    this.kicker.position.set(0.2, 1.7, -0.25);
    this.scene.add(this.kicker);
  }

  initGround() {
    // Nur Schattenfaenger (ohne sichtbare Studioflaeche).
    this.shadowCatcher = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 5.2),
      new THREE.ShadowMaterial({ color: 0x000000, opacity: DEFAULT_LIGHTING.shadowOpacity }),
    );
    this.shadowCatcher.rotation.x = -Math.PI * 0.5;
    this.shadowCatcher.position.y = -0.2;
    this.shadowCatcher.receiveShadow = true;
    this.scene.add(this.shadowCatcher);
  }

  initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), DEFAULT_LIGHTING.bloomStrength, 0.24, 0.9);
    this.composer.addPass(this.bloomPass);
  }

  applyLighting(lighting = {}) {
    const l = { ...DEFAULT_LIGHTING, ...lighting };
    this.renderer.toneMappingExposure = l.exposure;
    this.scene.environmentIntensity = l.environmentIntensity;

    if (this.hemi) {
      this.hemi.intensity = l.hemisphereIntensity;
    }
    if (this.key) {
      this.key.intensity = l.keyIntensity;
      this.key.angle = THREE.MathUtils.degToRad(l.keyAngleDeg);
      this.key.penumbra = l.keyPenumbra;
    }
    if (this.fill) {
      this.fill.intensity = l.fillIntensity;
    }
    if (this.rim) {
      this.rim.intensity = l.rimIntensity;
    }
    if (this.shadowCatcher?.material) {
      this.shadowCatcher.material.opacity = l.shadowOpacity;
      this.shadowCatcher.material.needsUpdate = true;
    }
    if (this.bloomPass) {
      this.bloomPass.strength = l.bloomStrength;
    }
  }

  animate = () => {
    requestAnimationFrame(this.animate);
    if (this.composer) {
      this.composer.render();
      return;
    }
    this.renderer.render(this.scene, this.camera);
  };

  disposeObject(object) {
    object.traverse((child) => {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (Array.isArray(child.material)) {
        for (const mat of child.material) {
          disposeMaterial(mat);
        }
      } else if (child.material) {
        disposeMaterial(child.material);
      }
    });
  }
}

function disposeMaterial(material) {
  // Texturen werden von main.js in runtimeState verwaltet und ueber
  // mehrere Book-Rebuilds hinweg wiederverwendet - nicht hier entsorgen.
  material.dispose();
}

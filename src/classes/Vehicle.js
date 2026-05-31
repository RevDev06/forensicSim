import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export class Vehicle {
  constructor({
    tipo = "Sedan",
    masa = 1200,
    x = 0,
    z = 0,
    vx = 0,
    vz = 0,
    radio = 1.2,
  } = {}) {
    this.tipo = tipo;
    this.masa = masa;
    this.x = x;
    this.z = z;
    this.vx = vx;
    this.vz = vz;
    this.radio = radio;

    const modelConfig =
      tipo === "Moto"
        ? { scale: 0.016, yawOffset: -Math.PI / 2 }
        : { scale: 1, yawOffset: Math.PI / 2 };
    this.modelScale = modelConfig.scale;
    this.headingOffset = modelConfig.yawOffset;
    this.heading = 0;
    this.impactHeading = null;
    this.headingLocked = false;
    this.lockedHeading = 0;

    this.mesh = new THREE.Group();
    this.mesh.position.set(this.x, 0, this.z);
  }

  async loadModel(path, colorFallback) {
    const loader = new GLTFLoader();
    return new Promise((resolve) => {
      loader.load(
        path,
        (gltf) => {
          this._clearMesh();
          const model = gltf.scene;
          model.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          model.scale.set(this.modelScale, this.modelScale, this.modelScale);
          this.mesh.add(model);
          resolve(true);
        },
        undefined,
        () => {
          this._createFallback(colorFallback);
          resolve(false);
        },
      );
    });
  }

  _clearMesh() {
    while (this.mesh.children.length > 0) {
      this.mesh.remove(this.mesh.children[0]);
    }
  }

  _createFallback(colorFallback) {
    this._clearMesh();
    const length = this.radio * 2.6;
    const width = this.radio * 1.4;
    const height = this.radio * 0.8;
    const geometry = new THREE.BoxGeometry(length, height, width);
    const material = new THREE.MeshStandardMaterial({
      color: colorFallback,
      roughness: 0.6,
      metalness: 0.1,
    });
    const body = new THREE.Mesh(geometry, material);
    body.castShadow = true;
    body.receiveShadow = true;
    body.position.y = height * 0.5;
    this.mesh.add(body);
  }

  setVelocity(vx, vz) {
    this.vx = vx;
    this.vz = vz;
  }

  captureImpactHeading() {
    this.impactHeading = this.heading;
  }

  lockHeading() {
    this.headingLocked = true;
    this.lockedHeading = this.heading;
  }

  unlockHeading() {
    this.headingLocked = false;
  }

  getSlipAngle() {
    const speed = this.getSpeed();
    if (speed <= 0.001 || this.impactHeading === null) {
      return 0;
    }
    const velocityHeading = Math.atan2(this.vz, this.vx);
    return this._normalizeAngle(velocityHeading - this.impactHeading);
  }

  createSkidMark({ position, direction }) {
    const group = new THREE.Group();
    const stripGeometry = new THREE.PlaneGeometry(0.12, 1.4);
    const material = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.78,
    });

    const left = new THREE.Mesh(stripGeometry, material.clone());
    const right = new THREE.Mesh(stripGeometry, material.clone());
    left.rotation.x = -Math.PI / 2;
    right.rotation.x = -Math.PI / 2;
    left.position.x = -0.18;
    right.position.x = 0.18;

    group.add(left, right);
    group.position.set(position.x, 0.02, position.z);

    const angle = Math.atan2(direction.z, direction.x);
    group.rotation.y = -angle + Math.PI / 2;
    return group;
  }

  createYawMark({ position, direction, intensity = 1 }) {
    const group = new THREE.Group();
    const stripGeometry = new THREE.PlaneGeometry(0.08, 0.8);
    const opacity = 0.55 + Math.min(0.35, intensity * 0.15);
    const material = new THREE.MeshStandardMaterial({
      color: 0x151515,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity,
    });

    const offsets = [-0.16, 0, 0.16];
    offsets.forEach((offset, index) => {
      const strip = new THREE.Mesh(stripGeometry, material.clone());
      strip.rotation.x = -Math.PI / 2;
      strip.position.x = offset;
      strip.position.y = 0.001 * index;
      strip.scale.y = 0.85 + intensity * 0.2;
      group.add(strip);
    });

    group.position.set(position.x, 0.02, position.z);
    const angle = Math.atan2(direction.z, direction.x);
    group.rotation.y = -angle + Math.PI / 2;
    return group;
  }

  getSpeed() {
    return Math.hypot(this.vx, this.vz);
  }

  update(dt) {
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.mesh.position.set(this.x, 0, this.z);

    const speed = this.getSpeed();
    if (speed > 0.001 && !this.headingLocked) {
      this.heading = Math.atan2(this.vz, this.vx);
    }

    const heading = this.headingLocked ? this.lockedHeading : this.heading;
    this.mesh.rotation.y = -heading + this.headingOffset;
  }

  _normalizeAngle(angle) {
    let wrapped = angle;
    while (wrapped > Math.PI) {
      wrapped -= Math.PI * 2;
    }
    while (wrapped < -Math.PI) {
      wrapped += Math.PI * 2;
    }
    return wrapped;
  }
}

export class PhysicsEngine {
  constructor({
    mu = 0.75,
    noBrake = false,
    slopeDeg = 0,
    restitution = 0,
    collisionAxis = null,
    logger = null,
  } = {}) {
    this.g = 9.81;
    this.mu = mu;
    this.noBrake = noBrake;
    this.slopeDeg = slopeDeg;
    this.restitution = this._clamp(restitution, 0, 1);
    this.collisionAxis = collisionAxis;
    this.logger = logger;
    this.reset();
  }

  reset() {
    this.phase = 0;
    this.hasCollided = false;
    this.stopped = false;
    this.initialVelocityA = { x: 0, z: 0 };
    this.initialVelocityB = { x: 0, z: 0 };
    this.resultVelocity = { x: 0, z: 0 };
    this.resultSpeed = 0;
    this.resultAngleDeg = 0;
    this.collisionPoint = { x: 0, z: 0 };
    this.postImpactInertiaFactor = 1;
  }

  setFriction(mu) {
    this.mu = mu;
  }

  setNoBrake(noBrake) {
    this.noBrake = noBrake;
  }

  setSlopeDeg(slopeDeg) {
    this.slopeDeg = slopeDeg;
  }

  setRestitution(restitution) {
    this.restitution = this._clamp(restitution, 0, 1);
  }

  setLogger(logger) {
    this.logger = logger;
  }

  setCollisionAxis(collisionAxis) {
    this.collisionAxis = collisionAxis;
  }

  computeSpeedFromSkid(distance, slopeDeg = this.slopeDeg) {
    if (!Number.isFinite(distance) || distance <= 0) {
      return 0;
    }

    const effectiveMu = this._effectiveMu(slopeDeg);
    if (effectiveMu <= 0) {
      return 0;
    }

    const speed = Math.sqrt(2 * this.g * distance * effectiveMu);
    this._log("skid_speed", {
      distance,
      mu: this.mu,
      slopeDeg,
      effectiveMu,
      speed,
    });
    return speed;
  }

  computeSpeedFromPostImpactDistance(distance, slopeDeg = this.slopeDeg) {
    if (!Number.isFinite(distance) || distance <= 0) {
      return 0;
    }

    const effectiveMu = this._effectiveMu(slopeDeg);
    if (effectiveMu <= 0) {
      return 0;
    }

    const speed = Math.sqrt(2 * this.g * distance * effectiveMu);
    this._log("post_impact_speed", {
      distance,
      mu: this.mu,
      slopeDeg,
      effectiveMu,
      speed,
    });
    return speed;
  }

  computeSpeedBeforeBraking(impactSpeed, distance, slopeDeg = this.slopeDeg) {
    const baseSpeed = Number.isFinite(impactSpeed)
      ? Math.max(impactSpeed, 0)
      : 0;
    if (!Number.isFinite(distance) || distance <= 0) {
      return baseSpeed;
    }

    const effectiveMu = this._effectiveMu(slopeDeg);
    if (effectiveMu <= 0) {
      return baseSpeed;
    }

    const delta = 2 * this.g * distance * effectiveMu;
    const speed = Math.sqrt(baseSpeed * baseSpeed + delta);
    this._log("pre_brake_speed", {
      impactSpeed: baseSpeed,
      distance,
      mu: this.mu,
      slopeDeg,
      effectiveMu,
      speed,
    });
    return speed;
  }

  initialize(vehicleA, vehicleB) {
    this.reset();
    this.phase = 1;
    this.initialVelocityA = { x: vehicleA.vx, z: vehicleA.vz };
    this.initialVelocityB = { x: vehicleB.vx, z: vehicleB.vz };
    this._log("initial_velocities", {
      vehicleA: { ...this.initialVelocityA },
      vehicleB: { ...this.initialVelocityB },
    });
  }

  update(dt, vehicleA, vehicleB) {
    if (this.stopped) {
      return this.phase;
    }

    if (this.phase === 2) {
      this.phase = 3;
    }

    if (this.phase === 1) {
      if (!this.noBrake) {
        this._applyBraking(dt, vehicleA);
      }

      if (this._detectCollision(vehicleA, vehicleB)) {
        this.phase = 2;
      }

      if (
        !this.hasCollided &&
        vehicleA.getSpeed() <= 0.01 &&
        vehicleB.getSpeed() <= 0.01
      ) {
        this.phase = 4;
        this.stopped = true;
      }
    } else if (this.phase === 3) {
      this._applyPostFriction(dt, vehicleA, vehicleB);
    }

    return this.phase;
  }

  _applyBraking(dt, vehicle) {
    const speed = vehicle.getSpeed();
    if (speed <= 0) {
      return;
    }

    const effectiveMu = this._effectiveMu(this.slopeDeg);
    const decel = effectiveMu * this.g;
    const next = Math.max(0, speed - decel * dt);
    const scale = next / speed;

    const before = { vx: vehicle.vx, vz: vehicle.vz, speed };
    vehicle.vx *= scale;
    vehicle.vz *= scale;

    this._log("braking", {
      dt,
      effectiveMu,
      before,
      after: {
        vx: vehicle.vx,
        vz: vehicle.vz,
        speed: next,
      },
    });
  }

  _detectCollision(vehicleA, vehicleB) {
    const dx = vehicleA.x - vehicleB.x;
    const dz = vehicleA.z - vehicleB.z;
    const distance = Math.hypot(dx, dz);
    if (distance > vehicleA.radio + vehicleB.radio) {
      return false;
    }

    const axisOverride = this._normalizeAxis(this.collisionAxis);
    const normal = axisOverride
      ? axisOverride
      : distance > 0.0001
        ? { x: dx / distance, z: dz / distance }
        : { x: 1, z: 0 };
    const tangent = { x: -normal.z, z: normal.x };

    const v1n = vehicleA.vx * normal.x + vehicleA.vz * normal.z;
    const v1t = vehicleA.vx * tangent.x + vehicleA.vz * tangent.z;
    const v2n = vehicleB.vx * normal.x + vehicleB.vz * normal.z;
    const v2t = vehicleB.vx * tangent.x + vehicleB.vz * tangent.z;

    const m1 = vehicleA.masa;
    const m2 = vehicleB.masa;
    const totalMass = m1 + m2;

    let v1nPrime = v1n;
    let v2nPrime = v2n;
    if (totalMass > 0) {
      v1nPrime =
        (m1 * v1n + m2 * v2n - m2 * this.restitution * (v1n - v2n)) / totalMass;
      v2nPrime =
        (m1 * v1n + m2 * v2n + m1 * this.restitution * (v1n - v2n)) / totalMass;
    }

    let v1x = v1nPrime * normal.x + v1t * tangent.x;
    let v1z = v1nPrime * normal.z + v1t * tangent.z;
    let v2x = v2nPrime * normal.x + v2t * tangent.x;
    let v2z = v2nPrime * normal.z + v2t * tangent.z;

    const inertiaA = this._getInertiaFactor(vehicleA.tipo);
    const inertiaB = this._getInertiaFactor(vehicleB.tipo);
    v1x /= inertiaA;
    v1z /= inertiaA;
    v2x /= inertiaB;
    v2z /= inertiaB;

    vehicleA.vx = v1x;
    vehicleA.vz = v1z;
    vehicleB.vx = v2x;
    vehicleB.vz = v2z;

    this.hasCollided = true;
    this.collisionPoint = {
      x: (vehicleA.x + vehicleB.x) * 0.5,
      z: (vehicleA.z + vehicleB.z) * 0.5,
    };
    this.postImpactInertiaFactor = (inertiaA + inertiaB) * 0.5;
    this._updateResultVector(vehicleA, vehicleB);

    this._log("collision", {
      restitution: this.restitution,
      inertiaA,
      inertiaB,
      normal,
      tangent,
      vehicleA: { vx: vehicleA.vx, vz: vehicleA.vz },
      vehicleB: { vx: vehicleB.vx, vz: vehicleB.vz },
      resultVelocity: { ...this.resultVelocity },
      resultSpeed: this.resultSpeed,
      resultAngleDeg: this.resultAngleDeg,
    });

    return true;
  }

  _applyPostFriction(dt, vehicleA, vehicleB) {
    const speedA = vehicleA.getSpeed();
    const speedB = vehicleB.getSpeed();
    if (Math.max(speedA, speedB) <= 0.001) {
      vehicleA.setVelocity(0, 0);
      vehicleB.setVelocity(0, 0);
      this.stopped = true;
      this.phase = 4;
      this._updateResultVector(vehicleA, vehicleB);
      return;
    }

    this._applyVehicleFriction(dt, vehicleA);
    this._applyVehicleFriction(dt, vehicleB);
    this._updateResultVector(vehicleA, vehicleB);

    if (vehicleA.getSpeed() <= 0.001 && vehicleB.getSpeed() <= 0.001) {
      vehicleA.setVelocity(0, 0);
      vehicleB.setVelocity(0, 0);
      this.stopped = true;
      this.phase = 4;
    }
  }

  _applyVehicleFriction(dt, vehicle) {
    const speed = vehicle.getSpeed();
    if (speed <= 0) {
      return;
    }

    const effectiveMu = this._effectiveMu(this.slopeDeg);
    const inertiaFactor = this._getInertiaFactor(vehicle.tipo);
    const decel = effectiveMu * this.g * inertiaFactor;
    const next = Math.max(0, speed - decel * dt);
    const scale = next / speed;

    const before = { vx: vehicle.vx, vz: vehicle.vz, speed };
    vehicle.vx *= scale;
    vehicle.vz *= scale;

    this._log("post_friction", {
      dt,
      effectiveMu,
      inertiaFactor,
      before,
      after: {
        vx: vehicle.vx,
        vz: vehicle.vz,
        speed: next,
      },
    });
  }

  _updateResultVector(vehicleA, vehicleB) {
    const totalMass = vehicleA.masa + vehicleB.masa;
    if (totalMass > 0) {
      this.resultVelocity = {
        x:
          (vehicleA.masa * vehicleA.vx + vehicleB.masa * vehicleB.vx) /
          totalMass,
        z:
          (vehicleA.masa * vehicleA.vz + vehicleB.masa * vehicleB.vz) /
          totalMass,
      };
    } else {
      this.resultVelocity = { x: 0, z: 0 };
    }

    this.resultSpeed = Math.hypot(this.resultVelocity.x, this.resultVelocity.z);
    this.resultAngleDeg = this._angleFromVector(
      this.resultVelocity.x,
      this.resultVelocity.z,
    );
  }

  _getInertiaFactor(tipo) {
    if (tipo === "Moto") {
      return 1.12;
    }
    return 1;
  }

  _effectiveMu(slopeDeg) {
    if (!Number.isFinite(slopeDeg)) {
      return Math.max(0, this.mu);
    }
    const radians = slopeDeg * (Math.PI / 180);
    const effectiveMu = this.mu * Math.cos(radians) - Math.sin(radians);
    return Math.max(0, effectiveMu);
  }

  _angleFromVector(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      return 0;
    }
    return (Math.atan2(z, x) * 180) / Math.PI;
  }

  _log(type, payload) {
    if (this.logger && typeof this.logger.log === "function") {
      this.logger.log(type, payload);
    }
  }

  _clamp(value, min, max) {
    if (!Number.isFinite(value)) {
      return min;
    }
    return Math.min(Math.max(value, min), max);
  }

  _normalizeAxis(axis) {
    if (!axis || !Number.isFinite(axis.x) || !Number.isFinite(axis.z)) {
      return null;
    }
    const length = Math.hypot(axis.x, axis.z);
    if (length <= 0.0001) {
      return null;
    }
    return { x: axis.x / length, z: axis.z / length };
  }

  getPhaseLabel() {
    if (this.phase === 1) {
      return this.hasCollided ? "Post-colision" : "Pre-colision";
    }
    if (this.phase === 2) {
      return "Colision";
    }
    if (this.phase === 3) {
      return "Post-colision";
    }
    if (this.phase === 4) {
      return "Detenido";
    }
    return "En espera";
  }
}

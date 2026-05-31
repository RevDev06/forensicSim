export class DataLogger {
  constructor() {
    this.entries = [];
    this.inputs = null;
    this.outputs = null;
    this.hash = "";
  }

  log(type, payload) {
    this.entries.push({
      timestamp: new Date().toISOString(),
      type,
      payload,
    });
  }

  sanitizeInputs(raw) {
    const scenario = this._requireOneOf("Escenario", raw.scenario, [
      "perpendicular",
      "frontal",
      "muro",
      "atropello",
    ]);

    const sanitized = {
      scenario,
      mu: this._requireRange("Friccion (mu)", raw.mu, 0.1, 1.2),
      slopeDeg: this._requireRange(
        "Inclinacion de calle",
        raw.slopeDeg,
        -15,
        15,
      ),
      restitution: this._requireRange(
        "Coeficiente de restitucion",
        raw.restitution,
        0,
        1,
      ),
      massA: this._requireRange("Masa vehiculo A", raw.massA, 50, 50000),
      massB: this._requireRange("Masa vehiculo B", raw.massB, 50, 50000),
      speedAInputKmh: this._requireRange(
        "Velocidad A",
        raw.speedAInputKmh,
        0,
        300,
      ),
      speedBInputKmh: this._requireRange(
        "Velocidad B",
        raw.speedBInputKmh,
        0,
        300,
      ),
      skidA: this._requireRange("Huella frenado A", raw.skidA, 0, 200),
      distanceA: this._requireRange(
        "Distancia inicial A",
        raw.distanceA,
        0,
        200,
      ),
      distanceB: this._requireRange(
        "Distancia inicial B",
        raw.distanceB,
        0,
        200,
      ),
      noBrake: Boolean(raw.noBrake),
    };

    this.log("sanitize_inputs", sanitized);
    return sanitized;
  }

  setInputs(inputs) {
    this.inputs = inputs;
    this.log("inputs", inputs);
  }

  setOutputs(outputs) {
    this.outputs = outputs;
    this.log("outputs", outputs);
  }

  getHash() {
    return this.hash;
  }

  async finalizeHash() {
    if (!this.inputs || !this.outputs) {
      return "";
    }

    const payload = {
      inputs: this.inputs,
      outputs: this.outputs,
    };
    const json = this._stableStringify(payload);
    const hash = await this._sha256(json);
    this.hash = hash;
    if (hash) {
      this.log("hash", { hash });
    }
    return hash;
  }

  _requireOneOf(label, value, options) {
    if (!options.includes(value)) {
      throw new Error(`${label} invalido.`);
    }
    return value;
  }

  _requireRange(label, value, min, max) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      throw new Error(`${label} invalido.`);
    }
    if (numericValue < min || numericValue > max) {
      throw new Error(`${label} fuera de rango (${min} a ${max}).`);
    }
    return numericValue;
  }

  _stableStringify(value) {
    return JSON.stringify(this._sortValue(value));
  }

  _sortValue(value) {
    if (Array.isArray(value)) {
      return value.map((item) => this._sortValue(item));
    }
    if (value && typeof value === "object") {
      return Object.keys(value)
        .sort()
        .reduce((acc, key) => {
          acc[key] = this._sortValue(value[key]);
          return acc;
        }, {});
    }
    return value;
  }

  async _sha256(message) {
    if (!globalThis.crypto || !globalThis.crypto.subtle) {
      return "";
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
}

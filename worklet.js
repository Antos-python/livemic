// Procesory DSP Live MIC (AudioWorklet)

// Bramka szumów: przepuszcza dźwięk dopiero powyżej progu (dBFS)
class NoiseGate extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: -48, minValue: -90, maxValue: 0, automationRate: 'k-rate' },
      { name: 'enabled', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.env = 0; this.g = 0; this.hold = 0; this.tick = 0;
    this.envRel = Math.exp(-1 / (0.05 * sampleRate));
    this.atk = 1 - Math.exp(-1 / (0.002 * sampleRate));
    this.rel = 1 - Math.exp(-1 / (0.08 * sampleRate));
    this.holdLen = Math.floor(0.15 * sampleRate);
  }
  process(inputs, outputs, params) {
    const inp = inputs[0][0], out = outputs[0];
    if (!out[0]) return true;
    const on = params.enabled[0] > 0.5;
    const thr = Math.pow(10, params.threshold[0] / 20);
    for (let i = 0; i < out[0].length; i++) {
      const x = inp ? inp[i] : 0;
      const a = Math.abs(x);
      this.env = a > this.env ? a : this.env * this.envRel;
      let target = 1;
      if (on) {
        if (this.env > thr) this.hold = this.holdLen;
        else if (this.hold > 0) this.hold--;
        else target = 0;
      }
      this.g += (target - this.g) * (target > this.g ? this.atk : this.rel);
      const y = x * this.g;
      for (let c = 0; c < out.length; c++) out[c][i] = y;
    }
    if (++this.tick % 8 === 0) this.port.postMessage(this.g > 0.5);
    return true;
  }
}

// Zmiana wysokości głosu w czasie rzeczywistym (dwie głowice odczytu z przenikaniem)
class PitchShifter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'ratio', defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' }];
  }
  constructor() {
    super();
    this.N = 8192;
    this.buf = new Float32Array(this.N);
    this.W = Math.floor(0.045 * sampleRate);
    this.w = 0; this.p = 0;
  }
  tap(d) {
    const N = this.N;
    let pos = this.w - d - 2;
    while (pos < 0) pos += N;
    const i0 = Math.floor(pos), f = pos - i0;
    return this.buf[i0] * (1 - f) + this.buf[(i0 + 1) % N] * f;
  }
  process(inputs, outputs, params) {
    const inp = inputs[0][0], out = outputs[0];
    if (!out[0]) return true;
    const ratio = params.ratio[0], W = this.W, step = (1 - ratio) / W;
    for (let i = 0; i < out[0].length; i++) {
      this.buf[this.w] = inp ? inp[i] : 0;
      const p1 = this.p, p2 = (p1 + 0.5) % 1;
      const y = this.tap(p1 * W) * Math.sin(Math.PI * p1) + this.tap(p2 * W) * Math.sin(Math.PI * p2);
      for (let c = 0; c < out.length; c++) out[c][i] = y;
      this.p = p1 + step; this.p -= Math.floor(this.p);
      this.w = (this.w + 1) % this.N;
    }
    return true;
  }
}

// Odczep sygnału do nagrywania: wysyła paczki próbek do wątku głównego, gdy włączony
class Tap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = false; this.buf = new Float32Array(4096); this.n = 0;
    this.port.onmessage = (e) => {
      this.on = e.data;
      if (!this.on && this.n) { this.port.postMessage(this.buf.slice(0, this.n)); this.n = 0; }
    };
  }
  process(inputs) {
    const x = inputs[0][0];
    if (this.on && x) {
      this.buf.set(x, this.n); this.n += x.length;
      if (this.n + 128 > this.buf.length) { this.port.postMessage(this.buf.slice(0, this.n)); this.n = 0; }
    }
    return true;
  }
}

registerProcessor('tap', Tap);
registerProcessor('noise-gate', NoiseGate);
registerProcessor('pitch-shifter', PitchShifter);

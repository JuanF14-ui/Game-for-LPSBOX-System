// js/audio.js — Síntesis de audio Web Audio API + Voz de indicaciones del Sniffer LPSBOX

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.rumbleGain = null;
    this.rumbleOsc = null;
    this.noiseSource = null;
    this.noiseGain = null;
    this.alarmTimer = null;
  }

  ensureContext() {
    if (this.muted) return false;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      this.ctx = new AudioCtx();
      this._setupContinuousRumble();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return true;
  }

  _setupContinuousRumble() {
    if (!this.ctx) return;
    // Sub-bass seismic rumble + filtered brown noise
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 34;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 85;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.0;

    osc.connect(lp);
    lp.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();

    // Filtered noise for ground/structural rattle
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + 0.03 * white) / 1.03;
      lastOut = output[i];
      output[i] *= 3.2;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 110;
    noiseFilter.Q.value = 0.9;

    const nGain = this.ctx.createGain();
    nGain.gain.value = 0.0;

    noise.connect(noiseFilter);
    noiseFilter.connect(nGain);
    nGain.connect(this.ctx.destination);
    noise.start();

    this.rumbleOsc = osc;
    this.rumbleGain = gain;
    this.noiseSource = noise;
    this.noiseGain = nGain;
  }

  setMuted(muted) {
    this.muted = muted;
    if (muted) {
      if (this.rumbleGain && this.ctx) {
        this.rumbleGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
        this.noiseGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      this.stopAlarmLoop();
    }
  }

  updateSeismicRumble(accelG) {
    if (!this.ctx || !this.rumbleGain || this.muted) return;
    const intensity = Math.min(1, Math.max(0, (accelG - 0.015) / 0.65));
    const now = this.ctx.currentTime;
    this.rumbleGain.gain.setTargetAtTime(intensity * 0.24, now, 0.06);
    this.noiseGain.gain.setTargetAtTime(intensity * 0.28, now, 0.06);
    this.rumbleOsc.frequency.setTargetAtTime(28 + intensity * 26, now, 0.08);
  }

  playPacketBlip() {
    if (!this.ensureContext()) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1320, now);
    osc.frequency.exponentialRampToValueAtTime(1760, now + 0.045);
    g.gain.setValueAtTime(0.035, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  playTableShockwave() {
    if (!this.ensureContext()) return;
    const now = this.ctx.currentTime;
    // Physical thud + MR EMP sweep
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.38);
    g.gain.setValueAtTime(0.36, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.44);

    const sweep = this.ctx.createOscillator();
    const sg = this.ctx.createGain();
    sweep.type = 'sine';
    sweep.frequency.setValueAtTime(320, now + 0.04);
    sweep.frequency.exponentialRampToValueAtTime(1180, now + 0.48);
    sg.gain.setValueAtTime(0.08, now + 0.04);
    sg.gain.exponentialRampToValueAtTime(0.0005, now + 0.52);
    sweep.connect(sg);
    sg.connect(this.ctx.destination);
    sweep.start(now + 0.04);
    sweep.stop(now + 0.55);
  }

  playUsbConnect() {
    if (!this.ensureContext()) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 987.77].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + idx * 0.065;
      g.gain.setValueAtTime(0.07, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.16);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.17);
    });
  }

  startSnifferAlarm(severity = 'major') {
    this.stopAlarmLoop();
    if (!this.ensureContext()) return;

    const pulse = () => {
      if (this.muted || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = severity === 'major' ? 'square' : 'triangle';
      const f1 = severity === 'major' ? 880 : 660;
      const f2 = severity === 'major' ? 1240 : 780;
      osc.frequency.setValueAtTime(f1, now);
      osc.frequency.setValueAtTime(f2, now + 0.14);
      g.gain.setValueAtTime(severity === 'major' ? 0.07 : 0.045, now);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 0.30);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.32);
    };

    pulse();
    let count = 0;
    const maxPulses = severity === 'major' ? 11 : 4;
    this.alarmTimer = setInterval(() => {
      count++;
      if (count >= maxPulses) {
        this.stopAlarmLoop();
        return;
      }
      pulse();
    }, severity === 'major' ? 680 : 950);
  }

  stopAlarmLoop() {
    if (this.alarmTimer) {
      clearInterval(this.alarmTimer);
      this.alarmTimer = null;
    }
  }

  speakSnifferVoice(text) {
    if (this.muted || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'es-CO';
      utter.rate = 1.03;
      utter.pitch = 0.98;
      utter.volume = 0.85;
      window.speechSynthesis.speak(utter);
    } catch (_) {
      // Ignore speech synthesis errors on restricted browsers
    }
  }
}

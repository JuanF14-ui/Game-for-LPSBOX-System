// js/audio.js — Motor de Audio Web Audio API + Voces Habladas para NPCs y Sniffer LPSBOX (v3)

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.npcVoicesEnabled = true;
    this.rumbleGain = null;
    this.rumbleOsc = null;
    this.noiseSource = null;
    this.noiseGain = null;
    this.alarmTimer = null;

    this._cachedSpanishVoices = [];
    this._snifferSpeakingUntil = 0;
    this._lastNpcVoiceAt = 0;
    this._stepCooldown = 0;

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this._refreshVoices();
      if (typeof window.speechSynthesis.addEventListener === 'function') {
        window.speechSynthesis.addEventListener('voiceschanged', () => this._refreshVoices());
      }
    }
  }

  _refreshVoices() {
    if (!('speechSynthesis' in window)) return;
    try {
      const all = window.speechSynthesis.getVoices() || [];
      const es = all.filter((v) => /^es([-_]|$)/i.test(v.lang));
      this._cachedSpanishVoices = es.length > 0 ? es : all.slice(0, 6);
    } catch (_) {
      this._cachedSpanishVoices = [];
    }
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
    if (this._cachedSpanishVoices.length === 0) {
      this._refreshVoices();
    }
    return true;
  }

  _setupContinuousRumble() {
    if (!this.ctx) return;
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
        try {
          window.speechSynthesis.cancel();
        } catch (_) {}
      }
      this.stopAlarmLoop();
    }
  }

  updateSeismicRumble(accelG) {
    if (!this.ctx || !this.rumbleGain || this.muted) return;
    const intensity = Math.min(1.25, Math.max(0, (accelG - 0.015) / 0.65));
    const now = this.ctx.currentTime;
    this.rumbleGain.gain.setTargetAtTime(intensity * 0.25, now, 0.06);
    this.noiseGain.gain.setTargetAtTime(intensity * 0.3, now, 0.06);
    this.rumbleOsc.frequency.setTargetAtTime(26 + intensity * 28, now, 0.08);
  }

  playPacketBlip() {
    if (!this.ensureContext()) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1320, now);
    osc.frequency.exponentialRampToValueAtTime(1760, now + 0.045);
    g.gain.setValueAtTime(0.032, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  playTableShockwave() {
    if (!this.ensureContext()) return;
    const now = this.ctx.currentTime;
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

    const isSevere = severity === 'major' || severity === 'catastrophic';
    const isCatastrophic = severity === 'catastrophic';

    const pulse = () => {
      if (this.muted || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = isSevere ? 'square' : 'triangle';
      const f1 = isCatastrophic ? 940 : isSevere ? 880 : 660;
      const f2 = isCatastrophic ? 1380 : isSevere ? 1240 : 780;
      osc.frequency.setValueAtTime(f1, now);
      osc.frequency.setValueAtTime(f2, now + 0.14);
      g.gain.setValueAtTime(isSevere ? 0.07 : 0.045, now);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 0.3);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.32);
    };

    pulse();
    let count = 0;
    const maxPulses = isCatastrophic ? 12 : isSevere ? 18 : 6;
    this.alarmTimer = setInterval(() => {
      count++;
      if (count >= maxPulses) {
        this.stopAlarmLoop();
        return;
      }
      pulse();
    }, isCatastrophic ? 580 : isSevere ? 720 : 980);
  }

  playPoleWinch(direction = 'down') {
    if (!this.ensureContext()) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    const startF = direction === 'down' ? 210 : 145;
    const endF = direction === 'down' ? 135 : 225;
    osc.frequency.setValueAtTime(startF, now);
    osc.frequency.linearRampToValueAtTime(endF, now + 1.35);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;

    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.055, now + 0.12);
    g.gain.setValueAtTime(0.05, now + 1.15);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 1.45);

    osc.connect(lp);
    lp.connect(g);
    g.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 1.48);

    const clickOsc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(direction === 'down' ? 540 : 680, now + 1.42);
    clickOsc.frequency.exponentialRampToValueAtTime(190, now + 1.54);
    clickGain.gain.setValueAtTime(0.09, now + 1.42);
    clickGain.gain.exponentialRampToValueAtTime(0.0008, now + 1.56);
    clickOsc.connect(clickGain);
    clickGain.connect(this.ctx.destination);
    clickOsc.start(now + 1.42);
    clickOsc.stop(now + 1.58);
  }

  playLockedBeep() {
    if (!this.ensureContext()) return;
    const now = this.ctx.currentTime;
    [260, 210].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      const t = now + idx * 0.11;
      g.gain.setValueAtTime(0.045, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.09);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.1);
    });
  }

  playPropCrash(intensity = 0.6) {
    if (!this.ensureContext()) return;
    const now = this.ctx.currentTime;
    const amp = Math.min(1, Math.max(0.15, intensity));

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(115 + Math.random() * 45, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.24);
    g.gain.setValueAtTime(0.14 * amp, now);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 0.27);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.28);

    const len = Math.floor(this.ctx.sampleRate * 0.16);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.35));
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 950 + Math.random() * 900;
    bp.Q.value = 1.4;
    const ng = this.ctx.createGain();
    ng.gain.value = 0.09 * amp;
    src.connect(bp);
    bp.connect(ng);
    ng.connect(this.ctx.destination);
    src.start(now);
  }

  playStructuralCollapse(intensity = 1.0) {
    if (!this.ensureContext()) return;
    const now = this.ctx.currentTime;
    const amp = Math.min(1.2, Math.max(0.4, intensity));

    // Heavy concrete slab fracture boom
    const boom = this.ctx.createOscillator();
    const bg = this.ctx.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(78, now);
    boom.frequency.exponentialRampToValueAtTime(19, now + 0.85);
    bg.gain.setValueAtTime(0.34 * amp, now);
    bg.gain.exponentialRampToValueAtTime(0.001, now + 0.92);
    boom.connect(bg);
    bg.connect(this.ctx.destination);
    boom.start(now);
    boom.stop(now + 0.95);

    // Crushing masonry & rebar roar
    const len = Math.floor(this.ctx.sampleRate * 0.88);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = Math.sin(Math.min(1, i / (len * 0.12)) * (Math.PI * 0.5)) * Math.exp(-i / (len * 0.48));
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 460;
    const ng = this.ctx.createGain();
    ng.gain.value = 0.26 * amp;
    src.connect(lp);
    lp.connect(ng);
    ng.connect(this.ctx.destination);
    src.start(now);
  }

  playSnifferDamage() {
    this.stopAlarmLoop();
    if (!this.ensureContext()) return;
    const now = this.ctx.currentTime;

    // Dying digital power-down + glass crack + arc static
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1120, now);
    osc.frequency.exponentialRampToValueAtTime(62, now + 0.55);
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 0.58);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.6);

    this.playElectricSpark();
    this.playStructuralCollapse(1.1);
  }

  playFootstep(isStair = false) {
    if (!this.ensureContext()) return;
    const nowMs = performance.now();
    if (nowMs - this._stepCooldown < 270) return;
    this._stepCooldown = nowMs;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isStair ? 155 : 108, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.065);
    g.gain.setValueAtTime(0.045, now);
    g.gain.exponentialRampToValueAtTime(0.0005, now + 0.075);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  playShoveImpulse() {
    if (!this.ensureContext()) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(165, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.14);
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 0.16);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  playElectricSpark() {
    if (!this.ensureContext()) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(2400, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.08);
    g.gain.setValueAtTime(0.04, now);
    g.gain.exponentialRampToValueAtTime(0.0005, now + 0.09);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.095);
  }

  stopAlarmLoop() {
    if (this.alarmTimer) {
      clearInterval(this.alarmTimer);
      this.alarmTimer = null;
    }
  }

  // Subtle formant-filtered vocal inflection so NPCs always have audible vocal presence
  _playVocalInflection(isFeminine = false, urgency = 'normal', volumeScale = 0.5) {
    if (!this.ensureContext()) return;
    const now = this.ctx.currentTime;
    const baseF0 = isFeminine ? 225 : 132;
    const urgentBoost = urgency === 'major' || urgency === 'trapped' || urgency === 'catastrophic' ? 1.32 : urgency === 'mild' ? 1.12 : 1.0;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(baseF0 * urgentBoost, now);
    osc.frequency.linearRampToValueAtTime(baseF0 * urgentBoost * 1.14, now + 0.08);
    osc.frequency.linearRampToValueAtTime(baseF0 * urgentBoost * 0.94, now + 0.2);

    const formant = this.ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = isFeminine ? 760 : 580;
    formant.Q.value = 3.2;

    const g = this.ctx.createGain();
    const peak = 0.032 * Math.min(1, Math.max(0.15, volumeScale));
    g.gain.setValueAtTime(0.0005, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.035);
    g.gain.exponentialRampToValueAtTime(0.0005, now + 0.22);

    osc.connect(formant);
    formant.connect(g);
    g.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.23);
  }

  speakSnifferVoice(text) {
    if (this.muted || !('speechSynthesis' in window)) return;
    try {
      this._snifferSpeakingUntil = performance.now() + 4800;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'es-CO';
      utter.rate = 1.04;
      utter.pitch = 0.96;
      utter.volume = 0.92;
      utter.onend = () => {
        this._snifferSpeakingUntil = 0;
      };
      window.speechSynthesis.speak(utter);
    } catch (_) {}
  }

  speakNpcDialogue(person, rawText, urgency = 'normal', distanceMeters = 10) {
    if (this.muted || !this.npcVoicesEnabled) return;
    const nowMs = performance.now();

    // Never interrupt Sniffer hardware voice alerts
    if (nowMs < this._snifferSpeakingUntil) return;

    const minGapMs = urgency === 'normal' ? 4200 : urgency === 'mild' ? 2900 : 2300;
    if (nowMs - this._lastNpcVoiceAt < minGapMs) return;

    const isFeminine = (person?.id || 1) % 2 === 0;
    const distAtten = Math.max(0.28, Math.min(1.0, 1.0 - (distanceMeters - 5) / 34));

    // Clean emojis / symbols for crisp TTS pronunciation
    const cleanText = String(rawText || '')
      .replace(/[^\p{L}\p{N}\s,.;:¡!¿?-]/gu, '')
      .trim();
    if (!cleanText) return;

    this._lastNpcVoiceAt = nowMs;

    // Expressive micro-inflection cue
    this._playVocalInflection(isFeminine, urgency, distAtten * 0.65);

    if (!('speechSynthesis' in window)) return;
    try {
      if (window.speechSynthesis.speaking) {
        // Only preempt calm chatter with urgent earthquake/trapped cries
        if (urgency === 'normal' || urgency === 'mild') return;
        window.speechSynthesis.cancel();
      }

      const utter = new SpeechSynthesisUtterance(cleanText);
      utter.lang = 'es-CO';

      if (this._cachedSpanishVoices.length > 0) {
        const idx = (person?.id || 0) % this._cachedSpanishVoices.length;
        utter.voice = this._cachedSpanishVoices[idx];
      }

      const idJitter = (((person?.id || 1) * 37) % 10 - 5) * 0.025;
      const basePitch = (isFeminine ? 1.24 : 0.86) + idJitter;
      const urgentPitch =
        urgency === 'trapped' || urgency === 'catastrophic'
          ? 1.14
          : urgency === 'major'
            ? 1.09
            : urgency === 'mild'
              ? 1.03
              : 1.0;

      utter.pitch = Math.max(0.65, Math.min(1.65, basePitch * urgentPitch));
      utter.rate =
        urgency === 'trapped' || urgency === 'catastrophic'
          ? 1.18
          : urgency === 'major'
            ? 1.15
            : urgency === 'mild'
              ? 1.05
              : 0.99;
      utter.volume = Math.max(0.3, Math.min(0.95, distAtten * (urgency === 'normal' ? 0.62 : 0.9)));

      window.speechSynthesis.speak(utter);
    } catch (_) {}
  }
}

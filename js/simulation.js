// js/simulation.js — Motor IoT LPSBOX v2:
// - Edificio de 4 Pisos (P1..P4) con escalera de emergencia multinivel
// - Sniffer en interior sobre Raspberry Pi 5 + MPU6050 (STA/LTA) + WiFi/BLE Probe Requests (10s)
// - Gateway exterior sin pantalla montado en Poste de Luz (con mecánica de descenso para extracción USB-C)
// - Grabadora persistente del sismograma completo del evento (pre-evento, Onda P, Onda S, réplica y coda)

export const FLOOR_HEIGHT = 3.2;

export const ZONES = [
  {
    id: 'A',
    floor: 1,
    yBase: 0.0,
    code: 'Piso 1',
    name: 'Piso 1 — Lobby y Cafetería',
    shortName: 'Piso 1 · Cafetería',
    color: '#10b981',
    bounds: { xMin: -8.4, xMax: 5.4, zMin: -4.1, zMax: 3.3 },
    sensorPos: { x: -1.5, y: 2.6, z: -0.4 },
    coverSpots: [
      { x: -6.2, z: -2.2 }, { x: -2.0, z: -2.2 },
      { x: 2.4, z: -1.8 }, { x: -4.8, z: 1.5 }, { x: 1.8, z: 1.6 }
    ]
  },
  {
    id: 'B',
    floor: 2,
    yBase: FLOOR_HEIGHT,
    code: 'Piso 2',
    name: 'Piso 2 — Lab. Electrónica y Sniffer RPi5',
    shortName: 'Piso 2 · Lab / RPi5',
    color: '#38bdf8',
    bounds: { xMin: -8.4, xMax: 5.4, zMin: -4.1, zMax: 3.3 },
    sensorPos: { x: -0.8, y: FLOOR_HEIGHT + 1.35, z: -3.5 },
    coverSpots: [
      { x: -6.4, z: -2.0 }, { x: -2.2, z: -1.6 },
      { x: 2.6, z: -2.0 }, { x: -5.2, z: 1.4 }, { x: 2.2, z: 1.4 }
    ]
  },
  {
    id: 'C',
    floor: 3,
    yBase: FLOOR_HEIGHT * 2,
    code: 'Piso 3',
    name: 'Piso 3 — Sala de Servidores y Telecom',
    shortName: 'Piso 3 · Servidores',
    color: '#a855f7',
    bounds: { xMin: -8.4, xMax: 5.4, zMin: -4.1, zMax: 3.3 },
    sensorPos: { x: -1.2, y: FLOOR_HEIGHT * 2 + 2.6, z: -0.4 },
    coverSpots: [
      { x: -6.0, z: -2.3 }, { x: -1.8, z: -2.3 },
      { x: 2.5, z: -2.1 }, { x: -4.5, z: 1.5 }, { x: 2.0, z: 1.5 }
    ]
  },
  {
    id: 'D',
    floor: 4,
    yBase: FLOOR_HEIGHT * 3,
    code: 'Piso 4',
    name: 'Piso 4 — Auditorio y Sala de Proyectos',
    shortName: 'Piso 4 · Auditorio',
    color: '#f59e0b',
    bounds: { xMin: -8.4, xMax: 5.4, zMin: -4.1, zMax: 3.3 },
    sensorPos: { x: -1.5, y: FLOOR_HEIGHT * 3 + 2.6, z: -0.4 },
    coverSpots: [
      { x: -6.4, z: -2.1 }, { x: -2.4, z: -2.1 },
      { x: 2.2, z: -2.1 }, { x: -5.0, z: 1.6 }, { x: 1.8, z: 1.6 }
    ]
  }
];

export const ASSEMBLY_POINT = { x: -7.4, z: 9.4, radius: 3.0 };

// Sniffer (Raspberry Pi 5 + MPU6050 + WiFi/BLE) montado en columna estructural central del Piso 2
export const SNIFFER_WORLD_POS = { x: -0.8, y: FLOOR_HEIGHT + 1.15, z: -3.55 };

// Gateway sin pantalla montado afuera en un Poste de Luz (a 4.65m de altura; baja a 1.18m para el operario)
export const POLE_WORLD_POS = { x: 7.5, y: 0.0, z: 9.2 };
export const GATEWAY_HEIGHT_UP = 4.65;
export const GATEWAY_HEIGHT_DOWN = 1.18;
export const GATEWAY_WORLD_POS = { x: POLE_WORLD_POS.x - 0.32, y: GATEWAY_HEIGHT_UP, z: POLE_WORLD_POS.z };

const VENDOR_OUIS = [
  { prefix: 'F4:5C:89', vendor: 'Samsung Electronics' },
  { prefix: '3C:22:FB', vendor: 'Apple Inc.' },
  { prefix: 'A4:50:46', vendor: 'Xiaomi Comm.' },
  { prefix: '88:B4:A6', vendor: 'Motorola Mobility' },
  { prefix: 'DC:A6:32', vendor: 'Huawei Tech.' },
  { prefix: '70:85:C2', vendor: 'Google Pixel' }
];

const NORMAL_PHRASES_BY_FLOOR = {
  A: [
    'El café del Piso 1 quedó genial ☕',
    'Esperando reunión en el lobby',
    'Conectado al WiFi del edificio',
    'Revisando mensajes en cafetería',
    'Todo tranquilo en planta baja'
  ],
  B: [
    'Calibrando el Sniffer en la RPi5',
    'Midiendo ruido base del MPU6050',
    'Probando antenas en el Piso 2',
    'Compilando script Python MQTT',
    'Osciloscopio estable en laboratorio'
  ],
  C: [
    'Racks del Piso 3 a 21 °C',
    'Verificando respaldo UPS',
    'Latencia de red en 2 ms',
    'Haciendo backup en servidores',
    'Revisando switches de fibra'
  ],
  D: [
    'Preparando diapositivas en Piso 4',
    'Qué buena vista desde el cuarto piso',
    'Revisando audio del auditorio',
    'En sesión de diseño de proyectos',
    'Tomando notas desde el celular'
  ]
};

const MILD_PHRASES = [
  '¿Sintieron eso? ¡Está temblando suave!',
  'Tranquilos, es un sismo pequeño...',
  'Miren cómo se mueven las lámparas',
  'Aléjense de los estantes por precaución',
  'Mantengan la calma, no corran',
  'Me resguardo junto al escritorio un momento',
  'Bajemos con calma por la escalera',
  'Solo es un temblor leve, respiren'
];

const MILD_AFTER_PHRASES = [
  'Uf, ya pasó... fue solo un susto',
  'Todo bien por aquí tras el sismo leve',
  'El Sniffer RPi5 registró toda la onda',
  'Revisemos que no haya caído nada'
];

const MAJOR_COVER_PHRASES = [
  '¡¡TERREMOTO!! ¡Cúbranse la cabeza!',
  '¡Bajo las mesas rápido, tiembla muy fuerte!',
  '¡Cuidado, se están cayendo los estantes!',
  '¡Agárrense de las columnas!',
  '¡Se caen las lámparas del techo!'
];

const MAJOR_EVAC_PHRASES = [
  '¡Rápido por la escalera de emergencia!',
  '¡No usen ascensor, bajen al Piso 1!',
  '¡Cuidado con los vidrios y escombros!',
  '¡Salgan hacia el punto de encuentro!',
  '¡Sigan bajando, ya casi llegamos a calle!'
];

const TRAPPED_PHRASES = [
  '¡Ayuda aquí arriba, cayó un estante en la puerta!',
  '¡Estamos atrapados, no podemos pasar a la escalera!',
  '¡Auxilio! ¡Mi celular casi no tiene señal!',
  '¡Aquí en el piso superior, escúchennos!'
];

const SAFE_PHRASES = [
  '¡Salimos a salvo! ¿Quedó alguien arriba?',
  '¡Operario, baja el Gateway del poste de luz!',
  '¡Revisen cuántos celulares había en cada piso!',
  '¡Estamos bien en el punto de encuentro!'
];

const SKIN_TONES = ['#f5d0b5', '#eab68c', '#d69464', '#b87648', '#8d5531', '#f9dcc4'];

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function randHexByte() {
  return Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
}

function makeRealMac(idx) {
  const oui = VENDOR_OUIS[idx % VENDOR_OUIS.length];
  return {
    mac: `${oui.prefix}:${randHexByte()}:${randHexByte()}:${randHexByte()}`,
    vendor: oui.vendor
  };
}

function makeRandomizedMac() {
  const laaNibbles = ['2', '6', 'A', 'E'];
  const firstNibble = Math.floor(Math.random() * 16).toString(16).toUpperCase();
  const secondNibble = laaNibbles[Math.floor(Math.random() * laaNibbles.length)];
  return `${firstNibble}${secondNibble}:${randHexByte()}:${randHexByte()}:${randHexByte()}:${randHexByte()}:${randHexByte()}`;
}

export class LPSBoxSimulation {
  constructor(callbacks = {}) {
    this.cb = callbacks;
    this.time = 0;

    // Mode & configuration
    this.challengeMode = true;
    this.targetPeopleCount = 18;
    this.macNoiseLevel = 'medium';
    this.customMagnitude = 6.9;

    // Active seismic state
    this.scenario = 'normal'; // 'normal' | 'mild' | 'major' | 'custom'
    this.quakeActive = false;
    this.quakeElapsed = 0;
    this.quakeDuration = 0;
    this.quakeMagnitude = 0;
    this.collapseOccurred = false;
    this.collapsedZones = new Set();

    // Outdoor Street Light Pole Gateway mechanic
    // 'up' (at 4.65m on pole) | 'lowering' | 'down' (at 1.18m accessible to operator) | 'raising'
    this.gatewayPoleState = 'up';
    this.gatewayHeight = GATEWAY_HEIGHT_UP;

    // Physical table / sensor impact state (Mechanic 2)
    this.tableShockTimer = 0;
    this.shockwaves = [];

    // MPU6050 + STA/LTA state on Sniffer RPi5
    const baseEnergy = 3.2e-5;
    this.accel = { x: 0, y: 0, z: 1.0, dynamicG: 0.004 };
    this.sta = baseEnergy;
    this.lta = baseEnergy;
    this.staLtaRatio = 1.0;
    this.staLtaThreshold = 3.0;

    // Live rolling seismogram buffer (~10s)
    this.seismoHistory = [];
    for (let i = 0; i < 220; i++) {
      this.seismoHistory.push({ t: -3.5 + i * 0.016, accelG: 0.004, ratio: 1.0, triggered: false });
    }

    // Persistent Full-Event Seismogram Recorder (retains entire mild/major/impact wave after it ends!)
    this.currentEventRecord = null;
    this.completedEventRecord = null;
    this._eventSampleAccum = 0;
    this._eventPostTailTimer = 0;

    // Sniffer 10-second sliding Probe Request buffer
    this.rollingProbes = [];
    this.batchSyncTimer = 0;

    // Gateway 3 Physical LEDs (Mechanic 3)
    this.gatewayLeds = {
      blue: true,
      blink: false,
      yellow: false
    };
    this.blinkPulseTimer = 0;
    this.blinkRapidTimer = 0;

    // Pre-Quake Snapshot transmitted from RPi5 Sniffer -> Outdoor Pole Gateway
    this.frozenSnapshot = null;
    this.dataExtractedByOperator = false;
    this.reportSubmitted = false;
    this.showPreQuakeHologram = false;
    this.userMapPins = []; // { x, yFloor, z, zone }

    this.externalHardwareConnected = false;

    this.people = [];
    this.rfPulses = [];
    this._speechCycleTimer = 0;

    this.spawnMissionRandom(true);
  }

  logEvent(text, level = 'info') {
    if (this.cb.onLog) {
      this.cb.onLog({ time: this.time, text, level });
    }
  }

  // ================= POLE GATEWAY MECHANIC =================
  canExtractGateway() {
    return this.gatewayPoleState === 'down';
  }

  lowerGatewayFromPole() {
    if (this.gatewayPoleState === 'down' || this.gatewayPoleState === 'lowering') return;
    this.gatewayPoleState = 'lowering';
    this.logEvent(
      '🪜 Accionando polea de servicio en el Poste de Luz: descendiendo LPSBOX Gateway desde 4.65 m...',
      'info'
    );
    if (this.cb.onGatewayPoleChange) this.cb.onGatewayPoleChange(this.gatewayPoleState, this.gatewayHeight);
  }

  raiseGatewayToPole() {
    if (this.gatewayPoleState === 'up' || this.gatewayPoleState === 'raising') return;
    this.gatewayPoleState = 'raising';
    this.logEvent(
      '⬆️ Izando LPSBOX Gateway de vuelta a 4.65 m en el Poste de Luz exterior...',
      'info'
    );
    if (this.cb.onGatewayPoleChange) this.cb.onGatewayPoleChange(this.gatewayPoleState, this.gatewayHeight);
  }

  toggleGatewayPole() {
    if (this.gatewayPoleState === 'up' || this.gatewayPoleState === 'raising') {
      this.lowerGatewayFromPole();
    } else {
      this.raiseGatewayToPole();
    }
  }

  // ================= EVENT SEISMOGRAM RECORDER =================
  _startEventRecording(label, scenarioType, magnitude) {
    // Seed with the last ~2.4s of calm pre-event history so onset contrast is clearly visible
    const tail = this.seismoHistory.slice(-90);
    const tStart = this.time;
    const preSamples = [];
    for (let i = 0; i < tail.length; i += 3) {
      const pt = tail[i];
      preSamples.push({
        tRel: Math.max(-2.6, pt.t - tStart),
        accelG: pt.accelG,
        ratio: pt.ratio,
        triggered: pt.triggered
      });
    }

    this.currentEventRecord = {
      id: Math.floor(tStart * 100),
      label,
      scenario: scenarioType,
      magnitude,
      startTime: tStart,
      expectedDuration: this.quakeDuration || 3.5,
      triggerRelTime: null,
      collapseRelTime: null,
      peakG: 0.005,
      peakRelTime: 0,
      peakStaLta: 1.0,
      active: true,
      samples: preSamples
    };
    this._eventSampleAccum = 0;
    this._eventPostTailTimer = 0;
    if (this.cb.onEventRecordUpdate) this.cb.onEventRecordUpdate(this.currentEventRecord);
  }

  getEventSeismogram() {
    return this.currentEventRecord || this.completedEventRecord;
  }

  // ================= POPULATION & SCENARIOS =================
  spawnPopulation(zoneCounts) {
    this.people = [];
    let idCounter = 1;
    const outfitPalette = [
      '#38bdf8', '#fb7185', '#34d399', '#fbbf24',
      '#a78bfa', '#f97316', '#2dd4bf', '#60a5fa', '#e879f9'
    ];
    const pantsPalette = ['#1e293b', '#334155', '#1f2937', '#0f172a', '#374151'];

    ZONES.forEach((zone) => {
      const count = zoneCounts[zone.id] || 0;
      const phrases = NORMAL_PHRASES_BY_FLOOR[zone.id] || NORMAL_PHRASES_BY_FLOOR.A;
      for (let i = 0; i < count; i++) {
        const { mac, vendor } = makeRealMac(idCounter);
        const x = randRange(zone.bounds.xMin + 0.9, zone.bounds.xMax - 0.9);
        const z = randRange(zone.bounds.zMin + 0.85, zone.bounds.zMax - 0.85);
        const y = zone.yBase;

        this.people.push({
          id: idCounter,
          deviceHash: `DEV-${String(idCounter).padStart(2, '0')}-${mac.slice(9, 14).replace(':', '')}`,
          realMac: mac,
          currentRandomMac: makeRandomizedMac(),
          usesRandomMac: Math.random() < 0.58,
          vendor,
          channel: [1, 6, 11, 37, 38, 39][idCounter % 6],
          proto: idCounter % 3 === 0 ? 'BLE Adv' : 'WiFi 802.11 Probe',
          homeZone: zone.id,
          floor: zone.floor,
          currentZone: zone.id,
          x,
          y,
          z,
          vx: 0,
          vz: 0,
          facing: randRange(-Math.PI, Math.PI),
          targetX: x,
          targetZ: z,
          waitTimer: randRange(0.4, 3.2),
          probeTimer: randRange(0.2, 2.4),
          randomBurstTimer: randRange(1.0, 4.2),
          state: 'working', // 'working' | 'mild_react' | 'crouching' | 'duck_cover' | 'evacuating_calm' | 'evacuating_panic' | 'evacuated' | 'trapped'
          pose: 'stand',    // 'stand' | 'look_up' | 'crouch' | 'cover_head' | 'run' | 'wave_help'
          reactionDelay: randRange(0.35, 1.35),
          coverHoldTimer: 0,
          willEvacuateMild: idCounter % 3 === 0,
          phoneOnline: true,
          phrase: phrases[idCounter % phrases.length],
          speechVisible: idCounter <= 4,
          speechUrgency: 'normal', // 'normal' | 'mild' | 'major' | 'trapped' | 'safe'
          speechTimer: randRange(1.2, 4.5),
          color: outfitPalette[idCounter % outfitPalette.length],
          pantsColor: pantsPalette[idCounter % pantsPalette.length],
          skinColor: SKIN_TONES[idCounter % SKIN_TONES.length],
          hairStyle: idCounter % 4, // 0: short, 1: ponytail/long, 2: safety helmet, 3: cap/curly
          hasLabCoat: zone.id === 'B' && idCounter % 2 === 0,
          walkPhase: Math.random() * Math.PI * 2,
          preQuakePos: { x, y, z, zone: zone.id, floor: zone.floor }
        });
        idCounter++;
      }
    });

    this.targetPeopleCount = this.people.length;
    this.rollingProbes = [];
    this._seedInitialProbes();
  }

  _seedInitialProbes() {
    const now = this.time;
    this.people.forEach((p) => {
      this._emitProbePacket(p, false, now - randRange(0.5, 6.0));
      if (p.usesRandomMac && this.macNoiseLevel !== 'low') {
        this._emitProbePacket(p, true, now - randRange(0.3, 5.5));
      }
    });
  }

  spawnMissionRandom(silent = false) {
    // 4-story distribution (total ~13..26 people across Pisos 1–4)
    const counts = {
      A: Math.floor(randRange(3, 7)), // Piso 1
      B: Math.floor(randRange(2, 6)), // Piso 2
      C: Math.floor(randRange(2, 6)), // Piso 3
      D: Math.floor(randRange(3, 8))  // Piso 4
    };
    this.resetEnvironmentState(true);
    this.spawnPopulation(counts);
    if (!silent) {
      this.logEvent(
        this.challengeMode
          ? 'Nueva misión en Edificio de 4 Pisos: conteo real oculto. Dispara un sismo, baja el Gateway del poste y extrae los datos.'
          : `Edificio reiniciado con ${this.people.length} personas distribuidas en los Pisos 1 a 4.`,
        'info'
      );
    }
  }

  spawnWithTotalCount(total) {
    const clamped = Math.max(4, Math.min(36, Math.round(total)));
    const weights = [0.26, 0.22, 0.22, 0.30];
    const counts = { A: 0, B: 0, C: 0, D: 0 };
    const keys = ['A', 'B', 'C', 'D'];
    let assigned = 0;
    keys.forEach((k, idx) => {
      if (idx === 3) {
        counts[k] = Math.max(0, clamped - assigned);
      } else {
        const c = Math.round(clamped * weights[idx]);
        counts[k] = c;
        assigned += c;
      }
    });
    this.resetEnvironmentState(true);
    this.spawnPopulation(counts);
  }

  resetEnvironmentState(raisePole = false) {
    this.scenario = 'normal';
    this.quakeActive = false;
    this.quakeElapsed = 0;
    this.quakeMagnitude = 0;
    this.collapseOccurred = false;
    this.collapsedZones.clear();
    this.frozenSnapshot = null;
    this.dataExtractedByOperator = false;
    this.reportSubmitted = false;
    this.showPreQuakeHologram = false;
    this.userMapPins = [];
    this.gatewayLeds = { blue: true, blink: false, yellow: false };
    this.sta = 3.2e-5;
    this.lta = 3.2e-5;
    this.staLtaRatio = 1.0;
    if (raisePole) {
      this.gatewayPoleState = 'up';
      this.gatewayHeight = GATEWAY_HEIGHT_UP;
      if (this.cb.onGatewayPoleChange) this.cb.onGatewayPoleChange('up', this.gatewayHeight);
    }
    if (this.cb.onPropsReset) this.cb.onPropsReset();
    if (this.cb.onScenarioChange) this.cb.onScenarioChange('normal');
  }

  setNormalMonitoring() {
    this.scenario = 'normal';
    this.quakeActive = false;
    this.quakeElapsed = 0;
    this.quakeMagnitude = 0;
    this.collapseOccurred = false;
    this.collapsedZones.clear();
    this.frozenSnapshot = null;
    this.dataExtractedByOperator = false;
    this.reportSubmitted = false;
    this.showPreQuakeHologram = false;
    this.gatewayLeds = { blue: true, blink: false, yellow: false };
    this.sta = 3.2e-5;
    this.lta = 3.2e-5;
    this.staLtaRatio = 1.0;

    this.people.forEach((p, idx) => {
      const zone = ZONES.find((z) => z.id === p.homeZone) || ZONES[0];
      p.x = randRange(zone.bounds.xMin + 0.9, zone.bounds.xMax - 0.9);
      p.y = zone.yBase;
      p.z = randRange(zone.bounds.zMin + 0.85, zone.bounds.zMax - 0.85);
      p.targetX = p.x;
      p.targetZ = p.z;
      p.floor = zone.floor;
      p.currentZone = zone.id;
      p.state = 'working';
      p.pose = 'stand';
      p.phoneOnline = true;
      const phrases = NORMAL_PHRASES_BY_FLOOR[zone.id] || NORMAL_PHRASES_BY_FLOOR.A;
      p.phrase = phrases[p.id % phrases.length];
      p.speechUrgency = 'normal';
      p.speechVisible = idx < 4;
    });

    this.rollingProbes = [];
    this._seedInitialProbes();
    if (this.cb.onPropsReset) this.cb.onPropsReset();
    this.logEvent(
      'Modo Monitoreo Normal activo en los 4 pisos. Sniffer (RPi5) escaneando y Gateway en poste con LED Azul.',
      'ok'
    );
    if (this.cb.onScenarioChange) this.cb.onScenarioChange('normal');
  }

  triggerSeismicScenario(type, customMag = null) {
    // Archive any ongoing event record before starting a fresh one
    if (this.currentEventRecord) {
      this.currentEventRecord.active = false;
      this.completedEventRecord = this.currentEventRecord;
      this.currentEventRecord = null;
    }

    const anyDisplaced = this.people.some(
      (p) => p.state === 'evacuated' || p.state === 'trapped' || Math.abs(p.y - (ZONES.find((z) => z.id === p.homeZone)?.yBase || 0)) > 0.4
    );
    if (anyDisplaced) {
      if (this.challengeMode) {
        this.spawnMissionRandom(true);
      } else {
        this.setNormalMonitoring();
      }
    } else {
      this.frozenSnapshot = null;
      this.dataExtractedByOperator = false;
      this.reportSubmitted = false;
      this.showPreQuakeHologram = false;
      this.collapsedZones.clear();
      this.collapseOccurred = false;
      this.gatewayLeds = { blue: true, blink: false, yellow: false };
      this.sta = 3.2e-5;
      this.lta = 3.2e-5;
      this.staLtaRatio = 1.0;
      if (this.cb.onPropsReset) this.cb.onPropsReset();
    }

    // Record exact ground-truth pre-quake floor & 3D coordinates at t0
    this.people.forEach((p) => {
      const zId = this._detectZone3D(p.x, p.y, p.z) || p.homeZone;
      const zObj = ZONES.find((z) => z.id === zId) || ZONES[0];
      p.preQuakePos = { x: p.x, y: p.y, z: p.z, zone: zId, floor: zObj.floor };
      p.reactionDelay = randRange(0.25, 1.15);
      p.coverHoldTimer = randRange(1.8, 3.6);
    });

    if (type === 'mild') {
      this.scenario = 'mild';
      this.quakeActive = true;
      this.quakeElapsed = 0;
      this.quakeDuration = 14.0;
      this.quakeMagnitude = 4.2;
      this._startEventRecording('Sismo Leve (4.2 Mw)', 'mild', 4.2);
      this.logEvent(
        '🟡 Escenario iniciado: SISMO PEQUEÑO (4.2 Mw · 14 s). El MPU6050 en la RPi5 detecta las primeras ondas P...',
        'warn'
      );
    } else if (type === 'major') {
      this.scenario = 'major';
      this.quakeActive = true;
      this.quakeElapsed = 0;
      this.quakeDuration = 22.5;
      this.quakeMagnitude = 6.9;
      this._startEventRecording('Terremoto Fuerte (6.9 Mw)', 'major', 6.9);
      this.logEvent(
        '🔴 ¡ALERTA SÍSMICA! TERREMOTO FUERTE (6.9 Mw · 22.5 s). Monitoreando disparo STA/LTA en Sniffer RPi5...',
        'crit'
      );
    } else {
      const mag = customMag ?? this.customMagnitude;
      this.scenario = mag >= 5.5 ? 'major' : 'mild';
      this.quakeActive = true;
      this.quakeElapsed = 0;
      this.quakeDuration = mag >= 5.5 ? 21.0 : 13.5;
      this.quakeMagnitude = mag;
      this._startEventRecording(`Sismo Manual (${mag.toFixed(1)} Mw)`, this.scenario, mag);
      this.logEvent(
        `Sismo personalizado disparado (${mag.toFixed(1)} Mw · ${this.quakeDuration.toFixed(0)} s).`,
        mag >= 5.5 ? 'crit' : 'warn'
      );
    }

    if (this.cb.onScenarioChange) this.cb.onScenarioChange(this.scenario);
  }

  triggerPhysicalTableHit() {
    this.tableShockTimer = 0.55;
    this.blinkRapidTimer = 1.6;
    if (!this.quakeActive && !this.currentEventRecord) {
      this.quakeDuration = 2.2;
      this._startEventRecording('Impacto Físico MPU6050', 'hit', 3.1);
      this._eventPostTailTimer = 2.2;
    }

    this.shockwaves.push({
      x: SNIFFER_WORLD_POS.x,
      y: SNIFFER_WORLD_POS.y - 1.1,
      z: SNIFFER_WORLD_POS.z + 2.0,
      radius: 0.3,
      maxRadius: 18.0,
      color: '#38bdf8',
      alpha: 0.95
    });
    this.shockwaves.push({
      x: POLE_WORLD_POS.x,
      y: 0.1,
      z: POLE_WORLD_POS.z,
      radius: 0.3,
      maxRadius: 14.0,
      color: '#a855f7',
      alpha: 0.85
    });

    this.people.forEach((p, idx) => {
      if (p.phoneOnline) {
        this._emitProbePacket(p, false, this.time);
      }
      if (!this.quakeActive && idx % 4 === 0 && p.state === 'working') {
        p.phrase = '¿Escucharon esa vibración en el Piso 2?';
        p.speechUrgency = 'mild';
        p.speechVisible = true;
        p.speechTimer = 3.0;
      }
    });

    this.logEvent(
      '🟠 Impacto mecánico detectado por el MPU6050 (Sniffer RPi5): pulso de escaneo MR emitido en los 4 pisos.',
      'warn'
    );
    if (this.cb.onTableHit) this.cb.onTableHit();
  }

  ingestExternalTelemetry(payload) {
    this.externalHardwareConnected = true;
    if (typeof payload.sta_lta === 'number') {
      this.staLtaRatio = payload.sta_lta;
    }
    if (typeof payload.accel_g === 'number') {
      this.accel.dynamicG = payload.accel_g;
      if (payload.accel_g > 0.25 && !this.quakeActive) {
        this.triggerPhysicalTableHit();
      }
    }
    if (typeof payload.phone_count === 'number' && !this.quakeActive) {
      const clamped = Math.max(1, Math.min(36, Math.round(payload.phone_count)));
      if (clamped !== this.people.length) {
        this.spawnWithTotalCount(clamped);
        this.logEvent(`[Sniffer RPi5 En Vivo] ${clamped} smartphones reales detectados.`, 'ok');
      }
    }
    this.blinkRapidTimer = 0.8;
  }

  _detectZone3D(x, y, z) {
    if (z > 4.2 || x > 5.8) {
      if (z > 4.2) return 'EXT';
    }
    // Match closest floor by height y
    let bestZone = ZONES[0];
    let bestDy = Infinity;
    for (const zone of ZONES) {
      const dy = Math.abs(y - zone.yBase);
      if (dy < bestDy) {
        bestDy = dy;
        bestZone = zone;
      }
    }
    return bestZone.id;
  }

  _computeRssiByZone(x, y, z) {
    const rssiMap = {};
    ZONES.forEach((zone) => {
      const dx = x - zone.sensorPos.x;
      const dy = y - zone.yBase;
      const dz = z - zone.sensorPos.z;
      const dist = Math.max(0.9, Math.hypot(dx, dy, dz));
      // Concrete floor slabs introduce ~12 dB attenuation per floor difference!
      const floorDiff = Math.abs(y - zone.yBase) / FLOOR_HEIGHT;
      const slabAttenuation = floorDiff * 12.5;
      const noise = randRange(-1.9, 1.9);
      rssiMap[zone.id] = Math.round(-36 - 19.5 * Math.log10(dist) - slabAttenuation + noise);
    });
    return rssiMap;
  }

  _emitProbePacket(person, isRandomBurst = false, customTime = null) {
    const ts = customTime !== null ? customTime : this.time;
    const rssiByZone = this._computeRssiByZone(person.x, person.y, person.z);

    let bestZone = 'A';
    let bestRssi = -999;
    for (const [zid, val] of Object.entries(rssiByZone)) {
      if (val > bestRssi) {
        bestRssi = val;
        bestZone = zid;
      }
    }

    const estZoneObj = ZONES.find((z) => z.id === bestZone) || ZONES[0];
    const estX = person.x + randRange(-0.45, 0.45);
    const estZ = person.z + randRange(-0.42, 0.42);
    const estY = estZoneObj.yBase;

    const macShown = isRandomBurst
      ? makeRandomizedMac()
      : (person.usesRandomMac ? person.currentRandomMac : person.realMac);

    const isLaaRandom = isRandomBurst || person.usesRandomMac;

    const pkt = {
      timestamp: ts,
      personId: person.id,
      deviceHash: person.deviceHash,
      mac: macShown,
      isLaaRandom,
      isDuplicateRandomBurst: isRandomBurst,
      vendor: isLaaRandom ? 'MAC Aleatoria (LAA)' : person.vendor,
      proto: person.proto,
      channel: person.channel,
      rssiByZone,
      peakRssi: bestRssi,
      estimatedZone: bestZone,
      estimatedFloor: estZoneObj.floor,
      estX,
      estY,
      estZ
    };

    this.rollingProbes.push(pkt);

    if (customTime === null) {
      this.rfPulses.push({
        x: person.x,
        y: person.y + 0.08,
        z: person.z,
        radius: 0.15,
        maxRadius: 2.1,
        alpha: 0.85,
        isRandom: isRandomBurst
      });
    }
  }

  _capturePreQuakeSnapshot() {
    if (this.frozenSnapshot) return;

    const seenIds = new Set(
      this.rollingProbes
        .filter((pkt) => !pkt.isDuplicateRandomBurst && this.time - pkt.timestamp <= 10.0)
        .map((pkt) => pkt.personId)
    );
    this.people.forEach((p) => {
      if (p.phoneOnline && !seenIds.has(p.id)) {
        this._emitProbePacket(p, false, this.time - randRange(0.1, 1.8));
      }
    });

    const windowPackets = this.rollingProbes
      .filter((pkt) => this.time - pkt.timestamp <= 10.0)
      .map((pkt) => ({ ...pkt, rssiByZone: { ...pkt.rssiByZone } }));

    const uniqueDevicesMap = new Map();
    windowPackets.forEach((pkt) => {
      if (!pkt.isDuplicateRandomBurst) {
        uniqueDevicesMap.set(pkt.deviceHash, pkt);
      }
    });
    const uniqueDevices = Array.from(uniqueDevicesMap.values());

    const groundTruthByZone = { A: 0, B: 0, C: 0, D: 0 };
    const groundTruthPositions = [];
    this.people.forEach((p) => {
      const z = p.preQuakePos?.zone || p.homeZone;
      if (groundTruthByZone[z] !== undefined) groundTruthByZone[z]++;
      groundTruthPositions.push({
        id: p.id,
        x: p.preQuakePos.x,
        y: p.preQuakePos.y,
        z: p.preQuakePos.z,
        zone: z,
        floor: p.preQuakePos.floor,
        deviceHash: p.deviceHash
      });
    });

    const snifferZoneCounts = { A: 0, B: 0, C: 0, D: 0 };
    uniqueDevices.forEach((d) => {
      if (snifferZoneCounts[d.estimatedZone] !== undefined) {
        snifferZoneCounts[d.estimatedZone]++;
      }
    });

    this.frozenSnapshot = {
      triggerTime: this.time,
      magnitude: this.quakeMagnitude,
      scenario: this.scenario,
      triggerStaLta: this.staLtaRatio,
      peakAccelG: this.accel.dynamicG,
      rawPackets: windowPackets,
      uniqueDevices,
      rawPacketCount: windowPackets.length,
      filteredUniqueCount: uniqueDevices.length,
      snifferZoneCounts,
      groundTruthTotal: this.people.length,
      groundTruthByZone,
      groundTruthPositions
    };

    if (this.currentEventRecord && this.currentEventRecord.triggerRelTime === null) {
      this.currentEventRecord.triggerRelTime = Math.max(0.05, this.time - this.currentEventRecord.startTime);
    }

    // Hardware Sync: Sniffer RPi5 transmits emergency packet to Outdoor Pole Gateway -> LED Yellow ON!
    this.gatewayLeds.blue = false;
    this.gatewayLeds.yellow = true;
    this.blinkRapidTimer = 4.0;

    this.shockwaves.push({
      x: SNIFFER_WORLD_POS.x,
      y: 0.12,
      z: SNIFFER_WORLD_POS.z + 2.0,
      radius: 0.4,
      maxRadius: 24.0,
      color: this.scenario === 'major' ? '#ef4444' : '#f59e0b',
      alpha: 0.95
    });

    const poleHint =
      this.gatewayPoleState === 'down'
        ? '¡Gateway abajo y listo para extracción USB-C!'
        : '¡Baja el Gateway del poste de luz exterior para extraer los datos!';

    this.logEvent(
      `📡 [Sniffer RPi5 → Gateway Poste] STA/LTA = ${this.staLtaRatio.toFixed(2)} ≥ 3.0. Snapshot Pre-Sismo (t₀) transmitido al Gateway exterior (LED Amarillo ON). ${poleHint}`,
      this.scenario === 'major' ? 'crit' : 'warn'
    );

    if (this.cb.onSnapshotCaptured) {
      this.cb.onSnapshotCaptured(this.frozenSnapshot);
    }
  }

  _triggerInteriorCollapse() {
    if (this.collapseOccurred) return;
    this.collapseOccurred = true;

    // Upper floors suffer highest seismic drift; pick top 2 upper/occupied floors (preferring Pisos 3 & 4 / most populated)
    const sortedZones = ['D', 'C', 'B', 'A'].sort((z1, z2) => {
      const fBonus1 = z1 === 'D' || z1 === 'C' ? 1.5 : 0;
      const fBonus2 = z2 === 'D' || z2 === 'C' ? 1.5 : 0;
      const c1 = this.people.filter((p) => p.preQuakePos.zone === z1).length + fBonus1;
      const c2 = this.people.filter((p) => p.preQuakePos.zone === z2).length + fBonus2;
      return c2 - c1;
    });
    this.collapsedZones.add(sortedZones[0]);
    this.collapsedZones.add(sortedZones[1]);

    if (this.currentEventRecord) {
      this.currentEventRecord.collapseRelTime = Math.max(0.2, this.time - this.currentEventRecord.startTime);
    }

    let trappedCount = 0;
    this.people.forEach((p, idx) => {
      const inCollapsed = this.collapsedZones.has(p.homeZone) && p.y > 0.2;
      if (inCollapsed && p.x < 5.0 && idx % 2 === 0) {
        p.state = 'trapped';
        p.pose = 'wave_help';
        p.currentZone = p.homeZone;
        p.phoneOnline = Math.random() < 0.35;
        p.phrase = TRAPPED_PHRASES[trappedCount % TRAPPED_PHRASES.length];
        p.speechUrgency = 'trapped';
        p.speechVisible = true;
        p.speechTimer = 8.0;
        trappedCount++;
      }
    });

    const zName0 = ZONES.find((z) => z.id === sortedZones[0])?.code || sortedZones[0];
    const zName1 = ZONES.find((z) => z.id === sortedZones[1])?.code || sortedZones[1];

    this.logEvent(
      `💥 Caída severa de estanterías, lámparas y bloqueo parcial en ${zName0} y ${zName1} (${trappedCount} personas atrapadas arriba con pérdida de señal celular).`,
      'crit'
    );
    if (this.cb.onCollapse) {
      this.cb.onCollapse(Array.from(this.collapsedZones));
    }
  }

  update(dt) {
    const clampedDt = Math.min(dt, 0.05);
    this.time += clampedDt;

    // 0. Animate Outdoor Street Light Pole Gateway Hoist
    if (this.gatewayPoleState === 'lowering') {
      this.gatewayHeight = Math.max(GATEWAY_HEIGHT_DOWN, this.gatewayHeight - clampedDt * 2.35);
      if (this.gatewayHeight <= GATEWAY_HEIGHT_DOWN + 0.005) {
        this.gatewayHeight = GATEWAY_HEIGHT_DOWN;
        this.gatewayPoleState = 'down';
        this.logEvent(
          '✅ LPSBOX Gateway abajo (1.18 m) al pie del poste de luz. Ya puedes conectar el cable USB-C y extraer los datos.',
          'ok'
        );
        if (this.cb.onGatewayPoleChange) this.cb.onGatewayPoleChange('down', this.gatewayHeight);
      }
    } else if (this.gatewayPoleState === 'raising') {
      this.gatewayHeight = Math.min(GATEWAY_HEIGHT_UP, this.gatewayHeight + clampedDt * 2.35);
      if (this.gatewayHeight >= GATEWAY_HEIGHT_UP - 0.005) {
        this.gatewayHeight = GATEWAY_HEIGHT_UP;
        this.gatewayPoleState = 'up';
        this.logEvent('🔒 LPSBOX Gateway asegurado a 4.65 m en el poste de luz exterior.', 'info');
        if (this.cb.onGatewayPoleChange) this.cb.onGatewayPoleChange('up', this.gatewayHeight);
      }
    }

    // 1. Update Seismic Waveform & MPU6050 STA/LTA on RPi5 Sniffer
    let envAccel = 0.004 + Math.random() * 0.003;

    if (this.quakeActive) {
      this.quakeElapsed += clampedDt;
      const t = this.quakeElapsed;
      const dur = this.quakeDuration;

      if (t <= dur) {
        if (this.scenario === 'mild') {
          // 14.0s Mild Tremor: P-wave (0..2.2s), gentle swaying S-wave (1.8..10.5s), coda (10.5..14.0s)
          const pEnv = t < 2.2 ? Math.sin((t / 2.2) * Math.PI) * 0.045 : 0;
          const sEnv1 = t >= 1.6 ? Math.exp(-Math.pow((t - 4.8) / 2.6, 2)) * 0.098 : 0;
          const sEnv2 = t >= 5.0 ? Math.exp(-Math.pow((t - 8.6) / 2.3, 2)) * 0.068 : 0;
          const mod = 0.72 + 0.28 * Math.sin(t * 6.5) + 0.35 * Math.random();
          envAccel += (pEnv + sEnv1 + sEnv2) * mod;
        } else {
          // 22.5s Major Earthquake: P-wave (0..2.8s), sustained multi-pulse S-wave (2.2..15.5s), surface/aftershock (15.5..22.5s)
          const magScale = Math.max(0.55, (this.quakeMagnitude - 4.5) / 2.4);
          const pEnv = t < 2.8 ? Math.sin((t / 2.8) * Math.PI) * 0.15 * magScale : 0;
          const sPulse1 = t >= 2.0 ? Math.exp(-Math.pow((t - 5.4) / 2.7, 2)) * 0.68 * magScale : 0;
          const sPulse2 = t >= 5.5 ? Math.exp(-Math.pow((t - 10.2) / 2.8, 2)) * 0.62 * magScale : 0;
          const sPulse3 = t >= 10.0 ? Math.exp(-Math.pow((t - 14.2) / 2.4, 2)) * 0.44 * magScale : 0;
          const replica = t >= 15.0 ? Math.exp(-Math.pow((t - 17.8) / 1.7, 2)) * 0.26 * magScale : 0;
          const coda = t >= 14.0 ? Math.max(0, (1 - (t - 14.0) / 8.5)) * 0.08 * magScale : 0;
          const mod = 0.68 + 0.25 * Math.sin(t * 9.2) + 0.52 * Math.random();
          envAccel += (pEnv + sPulse1 + sPulse2 + sPulse3 + replica + coda) * mod;

          if (t >= 3.4 && !this.collapseOccurred) {
            this._triggerInteriorCollapse();
          }
        }
      } else {
        this.quakeActive = false;
        this._eventPostTailTimer = 2.6; // record 2.6s of calm post-event tail before sealing record
        this.logEvent(
          '📉 Movimiento sísmico finalizado. El registro completo de las ondas quedó guardado en el sismograma y el Gateway del poste tiene los datos t₀.',
          'info'
        );
      }
    }

    if (this.tableShockTimer > 0) {
      this.tableShockTimer -= clampedDt;
      envAccel += 0.44 * Math.max(0, this.tableShockTimer / 0.55);
    }

    this.accel.dynamicG = envAccel;
    const freq = this.scenario === 'major' ? 18.5 : 12.5;
    this.accel.x = Math.sin(this.time * freq) * envAccel;
    this.accel.y = Math.cos(this.time * (freq * 1.23)) * envAccel * 0.85;
    this.accel.z = 1.0 + Math.sin(this.time * (freq * 1.67)) * envAccel * 0.6;

    // Recursive STA/LTA energy detector
    const energy = envAccel * envAccel + 1e-6;
    const alphaSta = Math.min(1, clampedDt / 0.35);
    const alphaLta = Math.min(1, clampedDt / 8.0);
    this.sta += alphaSta * (energy - this.sta);
    const ltaRate = this.sta / Math.max(this.lta, 1e-7) > 2.4 ? alphaLta * 0.09 : alphaLta;
    this.lta += ltaRate * (energy - this.lta);
    this.staLtaRatio = Math.min(14.0, Math.sqrt(this.sta / Math.max(this.lta, 1e-7)));

    if (this.frozenSnapshot && envAccel > this.frozenSnapshot.peakAccelG) {
      this.frozenSnapshot.peakAccelG = envAccel;
    }

    // Trigger Pre-Quake Snapshot when STA/LTA crosses threshold during seismic scenario
    if (this.quakeActive && !this.frozenSnapshot && this.staLtaRatio >= this.staLtaThreshold) {
      this._capturePreQuakeSnapshot();
    }

    // Live rolling seismogram buffer
    this.seismoHistory.push({
      t: this.time,
      accelG: envAccel,
      ratio: this.staLtaRatio,
      triggered: this.staLtaRatio >= this.staLtaThreshold
    });
    if (this.seismoHistory.length > 240) {
      this.seismoHistory.shift();
    }

    // Full-Event Seismogram Recording (persists complete earthquake wave!)
    if (this.currentEventRecord) {
      this._eventSampleAccum += clampedDt;
      if (envAccel > this.currentEventRecord.peakG) {
        this.currentEventRecord.peakG = envAccel;
        this.currentEventRecord.peakRelTime = Math.max(0, this.time - this.currentEventRecord.startTime);
      }
      if (this.staLtaRatio > this.currentEventRecord.peakStaLta) {
        this.currentEventRecord.peakStaLta = this.staLtaRatio;
      }

      if (this._eventSampleAccum >= 0.05) {
        this._eventSampleAccum = 0;
        this.currentEventRecord.samples.push({
          tRel: this.time - this.currentEventRecord.startTime,
          accelG: envAccel,
          ratio: this.staLtaRatio,
          triggered: this.staLtaRatio >= this.staLtaThreshold
        });
      }

      if (!this.quakeActive && this.tableShockTimer <= 0) {
        this._eventPostTailTimer -= clampedDt;
        if (this._eventPostTailTimer <= 0) {
          this.currentEventRecord.active = false;
          this.completedEventRecord = this.currentEventRecord;
          this.currentEventRecord = null;
          if (this.cb.onEventRecordUpdate) this.cb.onEventRecordUpdate(this.completedEventRecord);
        }
      }
    }

    // 2. Update People Movement, Stairwell Descent, Dialogues & Probe Emissions
    this._updatePeople(clampedDt);

    // Prune rolling 10s probe window
    const cutoff = this.time - 10.0;
    while (this.rollingProbes.length > 0 && this.rollingProbes[0].timestamp < cutoff) {
      this.rollingProbes.shift();
    }

    // Periodic Sniffer RPi5 -> Outdoor Pole Gateway wireless heartbeat
    this.batchSyncTimer += clampedDt;
    if (this.batchSyncTimer >= 3.2) {
      this.batchSyncTimer = 0;
      this.blinkPulseTimer = 0.55;
      if (this.cb.onPacketHeartbeat) this.cb.onPacketHeartbeat();
    }

    // 3. Update Gateway 3 LEDs on Outdoor Pole
    if (this.blinkRapidTimer > 0) {
      this.blinkRapidTimer -= clampedDt;
      this.gatewayLeds.blink = Math.floor(this.time * 14) % 2 === 0;
    } else if (this.blinkPulseTimer > 0) {
      this.blinkPulseTimer -= clampedDt;
      this.gatewayLeds.blink = Math.floor(this.time * 10) % 2 === 0;
    } else {
      this.gatewayLeds.blink = false;
    }

    this.gatewayLeds.yellow = Boolean(this.frozenSnapshot);
    this.gatewayLeds.blue = !this.frozenSnapshot;

    // 4. Update visual RF pulses & MR shockwaves
    for (let i = this.rfPulses.length - 1; i >= 0; i--) {
      const p = this.rfPulses[i];
      p.radius += clampedDt * 2.5;
      p.alpha -= clampedDt * 0.95;
      if (p.alpha <= 0 || p.radius >= p.maxRadius) {
        this.rfPulses.splice(i, 1);
      }
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.radius += clampedDt * 13.5;
      sw.alpha -= clampedDt * 0.62;
      if (sw.alpha <= 0 || sw.radius >= sw.maxRadius) {
        this.shockwaves.splice(i, 1);
      }
    }
  }

  _updatePeople(dt) {
    const noiseMultiplier = this.macNoiseLevel === 'high' ? 1.8 : this.macNoiseLevel === 'medium' ? 1.0 : 0.25;

    // Rotate active speech bubbles cleanly so ~5-7 NPCs speak at once without visual clutter
    this._speechCycleTimer -= dt;
    if (this._speechCycleTimer <= 0) {
      this._speechCycleTimer = this.quakeActive ? 1.4 : 2.6;
      const maxVisible = this.quakeActive ? 7 : 4;
      const candidates = [...this.people].sort(() => Math.random() - 0.5);
      let shown = 0;
      candidates.forEach((p) => {
        if (p.state === 'trapped' && shown < maxVisible) {
          p.speechVisible = true;
          p.phrase = TRAPPED_PHRASES[(p.id + Math.floor(this.time / 3)) % TRAPPED_PHRASES.length];
          shown++;
        } else if (shown < maxVisible && Math.random() < (this.quakeActive ? 0.75 : 0.45)) {
          p.speechVisible = true;
          shown++;
        } else {
          p.speechVisible = false;
        }
      });
    }

    this.people.forEach((p) => {
      const homeZone = ZONES.find((z) => z.id === p.homeZone) || ZONES[0];

      // Transitions during active seismic scenarios
      if (this.quakeActive && this.quakeElapsed >= p.reactionDelay) {
        if (this.scenario === 'mild') {
          if (p.state === 'working') {
            if (p.willEvacuateMild && this.quakeElapsed > 4.2) {
              p.state = 'evacuating_calm';
              p.pose = 'stand';
              p.phrase = MILD_PHRASES[(p.id + 5) % MILD_PHRASES.length];
              p.speechUrgency = 'mild';
            } else if (p.id % 2 === 0) {
              p.state = 'crouching';
              p.pose = 'crouch';
              const cover = homeZone.coverSpots[p.id % homeZone.coverSpots.length];
              p.targetX = cover.x + randRange(-0.35, 0.35);
              p.targetZ = cover.z + randRange(-0.35, 0.35);
              p.phrase = MILD_PHRASES[p.id % MILD_PHRASES.length];
              p.speechUrgency = 'mild';
            } else {
              p.state = 'mild_react';
              p.pose = 'look_up';
              p.phrase = MILD_PHRASES[(p.id + 2) % MILD_PHRASES.length];
              p.speechUrgency = 'mild';
            }
          } else if (p.state === 'mild_react' && p.willEvacuateMild && this.quakeElapsed > 4.5) {
            p.state = 'evacuating_calm';
            p.pose = 'stand';
            p.phrase = 'Bajemos en orden por la escalera preventiva';
            p.speechUrgency = 'mild';
          }
        } else if (this.scenario === 'major') {
          if (p.state === 'working' || p.state === 'mild_react' || p.state === 'crouching') {
            p.state = 'duck_cover';
            p.pose = 'cover_head';
            const cover = homeZone.coverSpots[p.id % homeZone.coverSpots.length];
            p.targetX = cover.x;
            p.targetZ = cover.z;
            p.phrase = MAJOR_COVER_PHRASES[p.id % MAJOR_COVER_PHRASES.length];
            p.speechUrgency = 'major';
            p.speechVisible = p.id % 3 === 0;
          } else if (p.state === 'duck_cover') {
            p.coverHoldTimer -= dt;
            if (p.coverHoldTimer <= 0) {
              p.state = 'evacuating_panic';
              p.pose = 'run';
              p.phrase = MAJOR_EVAC_PHRASES[p.id % MAJOR_EVAC_PHRASES.length];
              p.speechUrgency = 'major';
            }
          }
        }
      } else if (!this.quakeActive && this.scenario === 'mild') {
        if (p.state === 'crouching' || p.state === 'mild_react') {
          p.state = 'working';
          p.pose = 'stand';
          p.phrase = MILD_AFTER_PHRASES[p.id % MILD_AFTER_PHRASES.length];
          p.speechUrgency = 'normal';
        }
      }

      // Locomotion & 4-Story Stairwell Pathfinding
      let speed = 1.05;
      if (p.state === 'working') {
        p.pose = 'stand';
        p.waitTimer -= dt;
        if (p.waitTimer <= 0) {
          p.targetX = randRange(homeZone.bounds.xMin + 0.9, homeZone.bounds.xMax - 0.9);
          p.targetZ = randRange(homeZone.bounds.zMin + 0.85, homeZone.bounds.zMax - 0.85);
          p.waitTimer = randRange(2.8, 6.8);
        }
      } else if (p.state === 'mild_react') {
        speed = 0.25;
        p.pose = 'look_up';
      } else if (p.state === 'crouching') {
        speed = 1.75;
        p.pose = 'crouch';
      } else if (p.state === 'duck_cover') {
        speed = 2.4;
        p.pose = 'cover_head';
      } else if (p.state === 'evacuating_calm' || p.state === 'evacuating_panic') {
        const isPanic = p.state === 'evacuating_panic';
        speed = isPanic ? 3.4 : 1.85;
        p.pose = isPanic ? 'run' : 'stand';

        if (p.y > 0.12) {
          // Upper floor (Pisos 2, 3, 4): head right to stairwell doorway (x ~ 5.5, z ~ -0.8), then descend stairwell!
          if (p.x < 5.55) {
            p.targetX = 5.85;
            p.targetZ = -1.2 + ((p.id % 3) - 1) * 0.55;
          } else {
            // Inside stairwell tower (x in [6.0..8.6]): descend vertically while switchbacking along Z!
            const stairDescentSpeed = isPanic ? 2.35 : 1.45;
            p.y = Math.max(0, p.y - stairDescentSpeed * dt);
            const flightProgress = (p.y % FLOOR_HEIGHT) / FLOOR_HEIGHT; // 1.0 -> 0.0 per floor
            const laneOffset = ((p.id % 3) - 1) * 0.25;
            p.targetX = (flightProgress > 0.5 ? 6.55 : 7.85) + laneOffset;
            p.targetZ = flightProgress > 0.5
              ? -2.4 + (1.0 - flightProgress) * 9.0
              : 2.1 - (0.5 - flightProgress) * 9.0;
          }
        } else {
          p.y = 0;
          // Ground floor (Piso 1): exit via stairwell street door (x > 5.2) or main lobby front door (x ~ -0.8, z = 4.0)
          if (p.z < 3.9) {
            if (p.x > 4.6) {
              p.targetX = 7.1 + ((p.id % 2) - 0.5) * 0.4;
              p.targetZ = 4.5;
            } else {
              p.targetX = -1.2 + ((p.id % 3) - 1) * 0.55;
              p.targetZ = 4.5;
            }
          } else {
            // Outside on sidewalk/plaza -> gather at Safe Assembly Point!
            const angle = (p.id * 1.39) % (Math.PI * 2);
            const rad = 0.65 + (p.id % 4) * 0.58;
            p.targetX = ASSEMBLY_POINT.x + Math.cos(angle) * rad;
            p.targetZ = ASSEMBLY_POINT.z + Math.sin(angle) * rad;
            if (Math.hypot(p.x - p.targetX, p.z - p.targetZ) < 0.55) {
              p.state = 'evacuated';
              p.pose = 'stand';
              p.phrase = SAFE_PHRASES[p.id % SAFE_PHRASES.length];
              p.speechUrgency = 'safe';
            }
          }
        }
      } else if (p.state === 'trapped') {
        speed = 0;
        p.pose = 'wave_help';
      } else if (p.state === 'evacuated') {
        speed = 0.55;
        p.pose = 'stand';
      }

      const dx = p.targetX - p.x;
      const dz = p.targetZ - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.08 && speed > 0) {
        const step = Math.min(dist, speed * dt);
        p.vx = (dx / dist) * speed;
        p.vz = (dz / dist) * speed;
        p.x += (dx / dist) * step;
        p.z += (dz / dist) * step;
        p.facing = Math.atan2(p.vx, p.vz);
        p.walkPhase += dt * speed * 4.8;
      } else {
        p.vx = 0;
        p.vz = 0;
        if (p.state === 'evacuated') {
          // Look back toward the 4-story building
          p.facing = Math.atan2(-1.0 - p.x, -0.5 - p.z);
        }
      }

      p.currentZone = this._detectZone3D(p.x, p.y, p.z) || p.currentZone;
      p.floor = Math.max(1, Math.min(4, Math.round(p.y / FLOOR_HEIGHT) + 1));

      // Smartphone WiFi/BLE Probe Request emission
      if (p.phoneOnline) {
        p.probeTimer -= dt;
        if (p.probeTimer <= 0) {
          p.probeTimer = randRange(2.1, 4.3);
          this._emitProbePacket(p, false);
        }

        if (p.usesRandomMac && noiseMultiplier > 0.3) {
          p.randomBurstTimer -= dt * noiseMultiplier;
          if (p.randomBurstTimer <= 0) {
            p.randomBurstTimer = randRange(3.2, 6.8);
            this._emitProbePacket(p, true);
          }
        }
      }
    });
  }

  getPostQuakeZoneStatus() {
    const postInside = { A: 0, B: 0, C: 0, D: 0, evacuated: 0, trapped: 0 };
    this.people.forEach((p) => {
      if (p.state === 'evacuated' || p.z > 4.1) {
        postInside.evacuated++;
      } else {
        if (postInside[p.currentZone] !== undefined) postInside[p.currentZone]++;
        if (p.state === 'trapped') postInside.trapped++;
      }
    });
    return postInside;
  }

  evaluateOperatorReport({ totalGuess, zoneGuesses, priorityZoneGuess }) {
    const snap = this.frozenSnapshot;
    const truthTotal = snap ? snap.groundTruthTotal : this.people.length;
    const truthZones = snap
      ? snap.groundTruthByZone
      : ZONES.reduce((acc, z) => {
          acc[z.id] = this.people.filter((p) => p.homeZone === z.id).length;
          return acc;
        }, {});

    const totalError = Math.abs(totalGuess - truthTotal);
    const totalPoints = Math.max(0, 40 - totalError * 8);

    let zoneErrorSum = 0;
    const zoneDetails = {};
    ['A', 'B', 'C', 'D'].forEach((zid) => {
      const zObj = ZONES.find((z) => z.id === zid);
      const g = Number(zoneGuesses[zid] || 0);
      const t = truthZones[zid] || 0;
      const err = Math.abs(g - t);
      zoneErrorSum += err;
      zoneDetails[zid] = {
        code: zObj ? zObj.code : zid,
        guess: g,
        truth: t,
        exact: err === 0
      };
    });
    const zonePoints = Math.max(0, Math.round(45 - zoneErrorSum * 5.5));

    let bestZone = 'D';
    let bestMetric = -1;
    ['A', 'B', 'C', 'D'].forEach((zid) => {
      const trappedHere = this.people.filter((p) => p.state === 'trapped' && p.currentZone === zid).length;
      const metric = trappedHere > 0 ? 100 + trappedHere : truthZones[zid];
      if (metric > bestMetric) {
        bestMetric = metric;
        bestZone = zid;
      }
    });
    const bestZoneCode = ZONES.find((z) => z.id === bestZone)?.code || bestZone;
    const priorityCorrect = priorityZoneGuess === bestZone || truthZones[priorityZoneGuess] === truthZones[bestZone];
    const priorityPoints = priorityCorrect ? 15 : 5;

    const finalScore = Math.min(100, totalPoints + zonePoints + priorityPoints);
    const usedUnfilteredRaw =
      snap && totalError > 0 && Math.abs(totalGuess - snap.rawPacketCount) <= 1 && snap.rawPacketCount > truthTotal;

    this.reportSubmitted = true;
    this.showPreQuakeHologram = true;

    return {
      score: finalScore,
      truthTotal,
      totalGuess,
      totalError,
      zoneDetails,
      bestPriorityZone: bestZone,
      bestPriorityZoneCode: bestZoneCode,
      priorityCorrect,
      usedUnfilteredRaw,
      rawPacketCount: snap ? snap.rawPacketCount : truthTotal
    };
  }
}

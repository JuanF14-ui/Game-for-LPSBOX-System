// js/simulation.js — Motor IoT LPSBOX v3:
// - Edificio de 4 Pisos (P1..P4) con escalera de emergencia en U transitable
// - Escenarios: Monitoreo Base, Sismo Pequeño (4.2 Mw), Terremoto Fuerte (6.9 Mw),
//   Terremoto Catastrófico (7.8 Mw con colapso estructural por etapas y Sniffer sepultado bajo escombros) y Golpe MPU6050
// - Sniffer en interior sobre Raspberry Pi 5 + MPU6050 (STA/LTA) -> transmite t0 al Gateway exterior en Poste de Luz
// - Voces habladas y diálogos reactivos para NPCs + Grabadora persistente del sismograma completo

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
    bounds: { xMin: -8.3, xMax: 5.2, zMin: -4.0, zMax: 3.2 },
    sensorPos: { x: -1.5, y: 2.6, z: -0.4 },
    coverSpots: [
      { x: -6.2, z: -1.8 }, { x: -2.0, z: -2.0 },
      { x: 2.4, z: -1.8 }, { x: -4.6, z: 1.5 }, { x: 1.8, z: 1.6 }
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
    bounds: { xMin: -8.3, xMax: 5.2, zMin: -4.0, zMax: 3.2 },
    sensorPos: { x: -0.8, y: FLOOR_HEIGHT + 1.35, z: -3.5 },
    coverSpots: [
      { x: -6.0, z: 1.4 }, { x: -3.2, z: -1.4 },
      { x: 2.6, z: -1.8 }, { x: 2.4, z: 1.4 }, { x: -5.2, z: -1.6 }
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
    bounds: { xMin: -8.3, xMax: 5.2, zMin: -4.0, zMax: 3.2 },
    sensorPos: { x: -1.2, y: FLOOR_HEIGHT * 2 + 2.6, z: -0.4 },
    coverSpots: [
      { x: -5.8, z: 1.4 }, { x: -1.8, z: -2.1 },
      { x: 2.5, z: -2.0 }, { x: 2.2, z: 1.5 }, { x: -3.8, z: 1.5 }
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
    bounds: { xMin: -8.3, xMax: 5.2, zMin: -4.0, zMax: 3.2 },
    sensorPos: { x: -1.5, y: FLOOR_HEIGHT * 3 + 2.6, z: -0.4 },
    coverSpots: [
      { x: -3.8, z: 1.4 }, { x: -1.2, z: -2.0 },
      { x: 2.2, z: -2.0 }, { x: 1.8, z: 1.5 }, { x: -1.2, z: 1.4 }
    ]
  }
];

export const ASSEMBLY_POINT = { x: -7.4, z: 9.4, radius: 3.0 };

// Sniffer (Raspberry Pi 5 + MPU6050 + WiFi/BLE) en columna central del Piso 2
export const SNIFFER_WORLD_POS = { x: -0.8, y: FLOOR_HEIGHT + 1.15, z: -3.55 };

// Gateway sin pantalla montado afuera en el Poste de Luz (4.65m arriba -> 1.18m abajo)
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
    'El café del primer piso quedó muy bueno',
    'Esperando la reunión aquí en el lobby',
    'Conectado a la red inalámbrica del edificio',
    'Revisando correos en la cafetería',
    'Todo muy tranquilo en planta baja'
  ],
  B: [
    'Calibrando el Sniffer en la Raspberry Pi cinco',
    'Midiendo el ruido base del sensor sísmico',
    'Probando antenas aquí en el segundo piso',
    'Compilando el puente Python de telemetría',
    'Osciloscopio estable en el laboratorio'
  ],
  C: [
    'Los servidores del tercer piso están a veintiún grados',
    'Verificando las baterías de respaldo',
    'Latencia de red estable en dos milisegundos',
    'Haciendo copia de seguridad en los racks',
    'Revisando enlaces de fibra óptica'
  ],
  D: [
    'Preparando la presentación en el cuarto piso',
    'Qué buena vista desde el auditorio superior',
    'Probando el sonido del auditorio',
    'En sesión de diseño de proyectos',
    'Tomando apuntes desde el celular'
  ]
};

const MILD_PHRASES = [
  '¿Sintieron eso? ¡Está temblando suave!',
  'Tranquilos todos, es un sismo pequeño',
  'Miren cómo se mueven las lámparas del techo',
  'Aléjense de los estantes por precaución',
  'Mantengan la calma, no corran',
  'Resguardémonos junto al escritorio un momento',
  'Bajemos con calma por la escalera',
  'Solo es un temblor leve, respiren tranquilos'
];

const MILD_AFTER_PHRASES = [
  'Ya pasó el temblor, fue solo un susto',
  'Todo bien por aquí tras el sismo leve',
  'La Raspberry Pi cinco registró toda la onda',
  'Revisemos que todo esté en orden'
];

const MAJOR_COVER_PHRASES = [
  '¡Terremoto! ¡Cúbranse la cabeza ahora!',
  '¡Bajo las mesas rápido, sacude muy fuerte!',
  '¡Cuidado, se están cayendo los estantes!',
  '¡Agárrense firme de las columnas!',
  '¡Se desprenden las lámparas del techo!'
];

const CATASTROPHIC_COVER_PHRASES = [
  '¡Terremoto destructivo! ¡Se está partiendo el techo!',
  '¡A los triángulos de vida junto a las columnas!',
  '¡Cuidado, está colapsando el ala oeste!',
  '¡Se caen las vigas del edificio, cúbranse!',
  '¡Dios mío, está cediendo la losa superior!'
];

const MAJOR_EVAC_PHRASES = [
  '¡Rápido, salgan por la escalera de emergencia!',
  '¡Bajen hacia el primer piso con cuidado!',
  '¡Cuidado con los vidrios y los escombros!',
  '¡Todos hacia el punto de encuentro exterior!',
  '¡Sigan bajando, ya casi salimos a la calle!'
];

const TRAPPED_PHRASES = [
  '¡Auxilio! ¡Cayó una losa y estamos atrapados aquí arriba!',
  '¡Ayuda por favor, las vigas bloquearon la salida!',
  '¡Socorro! ¡Estamos vivos bajo los escombros, escúchennos!',
  '¡Aquí en el edificio, no podemos mover el concreto!',
  '¡Rescate por favor, quedamos encerrados en este piso!'
];

const SAFE_PHRASES = [
  '¡Logramos salir! ¿Quedó gente atrapada adentro?',
  '¡Operario, baja el Gateway del poste para ver quién falta!',
  '¡Revisen cuántos celulares había en cada piso antes del colapso!',
  '¡Estamos a salvo en el punto de encuentro!'
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
    // 'normal' | 'mild' | 'major' | 'catastrophic'
    this.scenario = 'normal';
    this.quakeActive = false;
    this.quakeElapsed = 0;
    this.quakeDuration = 0;
    this.quakeMagnitude = 0;
    this.collapseOccurred = false;
    this.collapsedZones = new Set();

    // Catastrophic structural collapse & Sniffer RPi5 burial state
    this.structuralCollapseStage = 0; // 0 = intact, 1 = west slabs, 2 = central beam crushes Sniffer, 3 = stair/parapet rubble
    this.snifferDamaged = false;
    this.snifferDamageTime = null;

    // Outdoor Street Light Pole Gateway mechanic
    this.gatewayPoleState = 'up';
    this.gatewayHeight = GATEWAY_HEIGHT_UP;

    // Physical table / sensor impact state
    this.tableShockTimer = 0;
    this.shockwaves = [];

    // Ground seismic motion vs MPU6050 reading (MPU6050 drops to 0 if Sniffer is crushed under rubble!)
    const baseEnergy = 3.2e-5;
    this.groundAccel = { x: 0, y: 0, z: 1.0, dynamicG: 0.004 };
    this.accel = { x: 0, y: 0, z: 1.0, dynamicG: 0.004 };
    this.sta = baseEnergy;
    this.lta = baseEnergy;
    this.staLtaRatio = 1.0;
    this.staLtaThreshold = 3.0;

    // Live rolling seismogram buffer (~10s)
    this.seismoHistory = [];
    for (let i = 0; i < 220; i++) {
      this.seismoHistory.push({
        t: -3.5 + i * 0.016,
        accelG: 0.004,
        groundG: 0.004,
        ratio: 1.0,
        triggered: false,
        snifferOffline: false
      });
    }

    // Persistent Full-Event Seismogram Recorder
    this.currentEventRecord = null;
    this.completedEventRecord = null;
    this._eventSampleAccum = 0;
    this._eventPostTailTimer = 0;

    // Sniffer 10-second sliding Probe Request buffer
    this.rollingProbes = [];
    this.batchSyncTimer = 0;

    // Gateway 3 Physical LEDs (Outdoor Pole)
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
    this.userMapPins = [];

    this.externalHardwareConnected = false;

    this.people = [];
    this.rfPulses = [];
    this._speechCycleTimer = 1.6;

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
    const tail = this.seismoHistory.slice(-90);
    const tStart = this.time;
    const preSamples = [];
    for (let i = 0; i < tail.length; i += 3) {
      const pt = tail[i];
      preSamples.push({
        tRel: Math.max(-2.6, pt.t - tStart),
        accelG: pt.accelG,
        groundG: pt.groundG ?? pt.accelG,
        ratio: pt.ratio,
        triggered: pt.triggered,
        snifferOffline: false
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
      snifferDamagedRelTime: null,
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
          state: 'working',
          pose: 'stand',
          reactionDelay: randRange(0.3, 1.25),
          coverHoldTimer: 0,
          willEvacuateMild: idCounter % 3 === 0,
          phoneOnline: true,
          phrase: phrases[idCounter % phrases.length],
          speechVisible: idCounter <= 4,
          speechUrgency: 'normal',
          speechTimer: randRange(1.2, 4.5),
          color: outfitPalette[idCounter % outfitPalette.length],
          pantsColor: pantsPalette[idCounter % pantsPalette.length],
          skinColor: SKIN_TONES[idCounter % SKIN_TONES.length],
          hairStyle: idCounter % 4,
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
    const counts = {
      A: Math.floor(randRange(3, 7)),
      B: Math.floor(randRange(3, 6)),
      C: Math.floor(randRange(3, 6)),
      D: Math.floor(randRange(3, 8))
    };
    this.resetEnvironmentState(true);
    this.spawnPopulation(counts);
    if (!silent) {
      this.logEvent(
        this.challengeMode
          ? 'Nueva misión en Edificio de 4 Pisos: conteo oculto. Dispara un escenario sísmico, explora o baja el Gateway del poste.'
          : `Edificio reiniciado con ${this.people.length} personas distribuidas en los Pisos 1 a 4.`,
        'info'
      );
    }
  }

  spawnWithTotalCount(total) {
    const clamped = Math.max(4, Math.min(36, Math.round(total)));
    const weights = [0.25, 0.23, 0.22, 0.3];
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
    this.structuralCollapseStage = 0;
    this.snifferDamaged = false;
    this.snifferDamageTime = null;
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
    this.structuralCollapseStage = 0;
    this.snifferDamaged = false;
    this.snifferDamageTime = null;
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
      'Modo Monitoreo Normal restaurado: estructura íntegra, Sniffer RPi5 en línea y Gateway en poste con LED Azul.',
      'ok'
    );
    if (this.cb.onScenarioChange) this.cb.onScenarioChange('normal');
  }

  triggerSeismicScenario(type, customMag = null) {
    if (this.currentEventRecord) {
      this.currentEventRecord.active = false;
      this.completedEventRecord = this.currentEventRecord;
      this.currentEventRecord = null;
    }

    const needsReset =
      this.snifferDamaged ||
      this.structuralCollapseStage > 0 ||
      this.people.some(
        (p) =>
          p.state === 'evacuated' ||
          p.state === 'trapped' ||
          Math.abs(p.y - (ZONES.find((z) => z.id === p.homeZone)?.yBase || 0)) > 0.4
      );

    if (needsReset) {
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
      this.structuralCollapseStage = 0;
      this.snifferDamaged = false;
      this.snifferDamageTime = null;
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
      p.reactionDelay = randRange(0.22, 1.05);
      p.coverHoldTimer = type === 'catastrophic' ? randRange(1.2, 2.6) : randRange(1.8, 3.6);
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
    } else if (type === 'catastrophic') {
      this.scenario = 'catastrophic';
      this.quakeActive = true;
      this.quakeElapsed = 0;
      this.quakeDuration = 27.5;
      this.quakeMagnitude = 7.8;
      this._startEventRecording('Colapso Catastrófico (7.8 Mw)', 'catastrophic', 7.8);
      this.logEvent(
        '🟣 ¡EMERGENCIA EXTREMA! TERREMOTO CATASTRÓFICO (7.8 Mw · 27.5 s). Riesgo inminente de colapso estructural y pérdida del Sniffer interior...',
        'crit'
      );
    } else {
      const mag = customMag ?? this.customMagnitude;
      this.scenario = mag >= 7.3 ? 'catastrophic' : mag >= 5.5 ? 'major' : 'mild';
      this.quakeActive = true;
      this.quakeElapsed = 0;
      this.quakeDuration = this.scenario === 'catastrophic' ? 27.0 : this.scenario === 'major' ? 21.5 : 13.5;
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
    if (this.snifferDamaged) {
      this.logEvent(
        '⚠️ El Nodo Sniffer RPi5 está sepultado y dañado bajo los escombros del Piso 2; no responde a estímulos locales.',
        'warn'
      );
      return;
    }

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
        p.phrase = '¿Escucharon esa vibración en el segundo piso?';
        p.speechUrgency = 'mild';
        p.speechVisible = true;
        p.speechTimer = 3.0;
        if (idx === 0 && this.cb.onNpcSpeak) {
          this.cb.onNpcSpeak(p, p.phrase, 'mild');
        }
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
    if (typeof payload.sta_lta === 'number' && !this.snifferDamaged) {
      this.staLtaRatio = payload.sta_lta;
    }
    if (typeof payload.accel_g === 'number' && !this.snifferDamaged) {
      this.accel.dynamicG = payload.accel_g;
      this.groundAccel.dynamicG = payload.accel_g;
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
    if (z > 4.2) return 'EXT';
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
      const floorDiff = Math.abs(y - zone.yBase) / FLOOR_HEIGHT;
      const slabAttenuation = floorDiff * 12.5;
      const noise = randRange(-1.9, 1.9);
      rssiMap[zone.id] = Math.round(-36 - 19.5 * Math.log10(dist) - slabAttenuation + noise);
    });
    return rssiMap;
  }

  _emitProbePacket(person, isRandomBurst = false, customTime = null) {
    if (this.snifferDamaged && customTime === null) return;

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
    if (this.frozenSnapshot || this.snifferDamaged) return;

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
      peakAccelG: this.groundAccel.dynamicG,
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

    this.gatewayLeds.blue = false;
    this.gatewayLeds.yellow = true;
    this.blinkRapidTimer = 4.0;

    this.shockwaves.push({
      x: SNIFFER_WORLD_POS.x,
      y: 0.12,
      z: SNIFFER_WORLD_POS.z + 2.0,
      radius: 0.4,
      maxRadius: 24.0,
      color: this.scenario === 'catastrophic' ? '#a855f7' : this.scenario === 'major' ? '#ef4444' : '#f59e0b',
      alpha: 0.95
    });

    const poleHint =
      this.gatewayPoleState === 'down'
        ? '¡Gateway abajo y listo para extracción USB-C!'
        : '¡Baja el Gateway del poste de luz exterior para extraer los datos!';

    this.logEvent(
      `📡 [Sniffer RPi5 → Gateway Poste] STA/LTA = ${this.staLtaRatio.toFixed(2)} ≥ 3.0. Snapshot Pre-Sismo (t₀) salvado en el Gateway del poste exterior (LED Amarillo ON). ${poleHint}`,
      this.scenario === 'mild' ? 'warn' : 'crit'
    );

    if (this.cb.onSnapshotCaptured) {
      this.cb.onSnapshotCaptured(this.frozenSnapshot);
    }
  }

  _triggerInteriorCollapse() {
    if (this.collapseOccurred) return;
    this.collapseOccurred = true;

    const sortedZones = ['D', 'C', 'B', 'A'].sort((z1, z2) => {
      const fBonus1 = z1 === 'D' || z1 === 'C' ? 1.5 : 0;
      const fBonus2 = z2 === 'D' || z2 === 'C' ? 1.5 : 0;
      const c1 = this.people.filter((p) => p.preQuakePos.zone === z1).length + fBonus1;
      const c2 = this.people.filter((p) => p.preQuakePos.zone === z2).length + fBonus2;
      return c2 - c1;
    });
    this.collapsedZones.add(sortedZones[0]);
    this.collapsedZones.add(sortedZones[1]);

    if (this.currentEventRecord && this.currentEventRecord.collapseRelTime === null) {
      this.currentEventRecord.collapseRelTime = Math.max(0.2, this.time - this.currentEventRecord.startTime);
    }

    let trappedCount = 0;
    let firstSpeaker = null;
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
        if (!firstSpeaker) firstSpeaker = p;
        trappedCount++;
      }
    });

    if (firstSpeaker && this.cb.onNpcSpeak) {
      this.cb.onNpcSpeak(firstSpeaker, firstSpeaker.phrase, 'trapped');
    }

    const zName0 = ZONES.find((z) => z.id === sortedZones[0])?.code || sortedZones[0];
    const zName1 = ZONES.find((z) => z.id === sortedZones[1])?.code || sortedZones[1];

    this.logEvent(
      `💥 Caída severa de estanterías y bloqueo parcial en ${zName0} y ${zName1} (${trappedCount} personas atrapadas pidiendo auxilio).`,
      'crit'
    );
    if (this.cb.onCollapse) {
      this.cb.onCollapse(Array.from(this.collapsedZones));
    }
  }

  _advanceCatastrophicStage(stage) {
    if (this.structuralCollapseStage >= stage) return;
    this.structuralCollapseStage = stage;

    if (stage === 1) {
      this.collapseOccurred = true;
      this.collapsedZones.add('D');
      this.collapsedZones.add('C');
      if (this.currentEventRecord && this.currentEventRecord.collapseRelTime === null) {
        this.currentEventRecord.collapseRelTime = Math.max(0.2, this.time - this.currentEventRecord.startTime);
      }

      // Trap occupants in West Wing of Pisos 3 & 4 behind fallen concrete slabs
      let trappedNow = 0;
      let speaker = null;
      this.people.forEach((p) => {
        if ((p.homeZone === 'D' || p.homeZone === 'C') && p.x < 3.5) {
          p.state = 'trapped';
          p.pose = 'wave_help';
          p.phoneOnline = Math.random() < 0.25;
          p.phrase = TRAPPED_PHRASES[(p.id + trappedNow) % TRAPPED_PHRASES.length];
          p.speechUrgency = 'trapped';
          p.speechVisible = true;
          if (!speaker) speaker = p;
          trappedNow++;
        }
      });
      if (speaker && this.cb.onNpcSpeak) {
        this.cb.onNpcSpeak(speaker, speaker.phrase, 'trapped');
      }

      this.logEvent(
        `💥 [COLAPSO FASE 1] ¡Se desplomaron secciones de losa y fachada oeste en Piso 4 y Piso 3! Personas atrapadas en triángulos de vida.`,
        'crit'
      );
      if (this.cb.onStructuralCollapseStage) this.cb.onStructuralCollapseStage(1);
      if (this.cb.onCollapse) this.cb.onCollapse(Array.from(this.collapsedZones));
    } else if (stage === 2) {
      // Stage 2: Heavy concrete beam collapses onto Piso 2 Lab -> CRUSHES & BURIES THE SNIFFER RPi 5!
      this.collapsedZones.add('B');
      this.snifferDamaged = true;
      this.snifferDamageTime = this.time;
      if (this.currentEventRecord) {
        this.currentEventRecord.snifferDamagedRelTime = Math.max(
          0.5,
          this.time - this.currentEventRecord.startTime
        );
      }

      // Trap several occupants in Piso 2 Lab as well
      let speaker = null;
      this.people.forEach((p) => {
        if (p.homeZone === 'B' && p.x < 2.2 && p.state !== 'evacuated') {
          p.state = 'trapped';
          p.pose = 'wave_help';
          p.phoneOnline = false;
          p.phrase = '¡Cayó la viga central sobre el laboratorio del Piso 2, ayúdennos!';
          p.speechUrgency = 'trapped';
          p.speechVisible = true;
          if (!speaker) speaker = p;
        }
      });
      if (speaker && this.cb.onNpcSpeak) {
        this.cb.onNpcSpeak(speaker, speaker.phrase, 'trapped');
      }

      this.logEvent(
        '⚡💥 [SNIFFER RPi5 SEPULTADO] ¡Una viga y losa del Piso 3 cayeron sobre el Nodo Sniffer RPi5 dejándolo dañado bajo escombros! Enlace en vivo cortado — pero el snapshot t₀ YA FUE SALVADO afuera en el Gateway del poste de luz.',
        'crit'
      );
      if (this.cb.onSnifferDamaged) this.cb.onSnifferDamaged();
      if (this.cb.onStructuralCollapseStage) this.cb.onStructuralCollapseStage(2);
      if (this.cb.onCollapse) this.cb.onCollapse(Array.from(this.collapsedZones));
    } else if (stage === 3) {
      // Stage 3: Upper stairwell lintel & front masonry debris fall
      let totalTrapped = 0;
      this.people.forEach((p) => {
        if (p.y > FLOOR_HEIGHT * 1.4 && p.x < 5.4 && p.state !== 'trapped') {
          p.state = 'trapped';
          p.pose = 'wave_help';
          p.phoneOnline = false;
          p.phrase = TRAPPED_PHRASES[p.id % TRAPPED_PHRASES.length];
          p.speechUrgency = 'trapped';
          p.speechVisible = true;
        }
        if (p.state === 'trapped') totalTrapped++;
      });

      this.logEvent(
        `🧱 [COLAPSO FASE 3] Caída de mampostería y bloqueo de accesos altos: ${totalTrapped} personas atrapadas dentro de la estructura. ¡Usa el Gateway del poste exterior para ubicarlas!`,
        'crit'
      );
      if (this.cb.onStructuralCollapseStage) this.cb.onStructuralCollapseStage(3);
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

    // 1. Update Ground Seismic Waveform
    let envAccel = 0.004 + Math.random() * 0.003;

    if (this.quakeActive) {
      this.quakeElapsed += clampedDt;
      const t = this.quakeElapsed;
      const dur = this.quakeDuration;

      if (t <= dur) {
        if (this.scenario === 'mild') {
          const pEnv = t < 2.2 ? Math.sin((t / 2.2) * Math.PI) * 0.045 : 0;
          const sEnv1 = t >= 1.6 ? Math.exp(-Math.pow((t - 4.8) / 2.6, 2)) * 0.098 : 0;
          const sEnv2 = t >= 5.0 ? Math.exp(-Math.pow((t - 8.6) / 2.3, 2)) * 0.068 : 0;
          const mod = 0.72 + 0.28 * Math.sin(t * 6.5) + 0.35 * Math.random();
          envAccel += (pEnv + sEnv1 + sEnv2) * mod;
        } else if (this.scenario === 'catastrophic') {
          // 27.5s Catastrophic 7.8 Mw Earthquake + Staged Structural Collapse!
          const pEnv = t < 2.6 ? Math.sin((t / 2.6) * Math.PI) * 0.26 : 0;
          const sPulse1 = t >= 1.8 ? Math.exp(-Math.pow((t - 5.0) / 2.5, 2)) * 1.02 : 0;
          const sPulse2 = t >= 4.8 ? Math.exp(-Math.pow((t - 9.2) / 3.0, 2)) * 1.15 : 0;
          const sPulse3 = t >= 9.0 ? Math.exp(-Math.pow((t - 14.5) / 2.8, 2)) * 0.86 : 0;
          const replica = t >= 17.0 ? Math.exp(-Math.pow((t - 20.4) / 2.1, 2)) * 0.52 : 0;
          const coda = t >= 18.0 ? Math.max(0, (1 - (t - 18.0) / 9.5)) * 0.14 : 0;
          const mod = 0.72 + 0.28 * Math.sin(t * 10.4) + 0.55 * Math.random();
          envAccel += (pEnv + sPulse1 + sPulse2 + sPulse3 + replica + coda) * mod;

          if (t >= 4.2 && this.structuralCollapseStage < 1) {
            this._advanceCatastrophicStage(1);
          }
          if (t >= 7.4 && this.structuralCollapseStage < 2) {
            // Ensure pre-quake snapshot transferred right before beam hits if not already
            if (!this.frozenSnapshot) this._capturePreQuakeSnapshot();
            this._advanceCatastrophicStage(2);
          }
          if (t >= 10.6 && this.structuralCollapseStage < 3) {
            this._advanceCatastrophicStage(3);
          }
        } else {
          // 22.5s Major Earthquake (6.9 Mw)
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
        this._eventPostTailTimer = 2.6;
        this.logEvent(
          this.snifferDamaged
            ? '📉 Terremoto catastrófico finalizado. El Sniffer interior quedó destruido bajo escombros, pero el Gateway en el poste exterior conserva intacta la caja negra t₀.'
            : '📉 Movimiento sísmico finalizado. El registro completo de ondas quedó guardado y el Gateway del poste tiene los datos t₀.',
          'info'
        );
      }
    }

    if (this.tableShockTimer > 0 && !this.snifferDamaged) {
      this.tableShockTimer -= clampedDt;
      envAccel += 0.44 * Math.max(0, this.tableShockTimer / 0.55);
    }

    // Physical ground acceleration continues shaking the 4-story structure regardless of Sniffer damage!
    const freq = this.scenario === 'catastrophic' ? 20.5 : this.scenario === 'major' ? 18.5 : 12.5;
    this.groundAccel.dynamicG = envAccel;
    this.groundAccel.x = Math.sin(this.time * freq) * envAccel;
    this.groundAccel.y = Math.cos(this.time * (freq * 1.23)) * envAccel * 0.85;
    this.groundAccel.z = 1.0 + Math.sin(this.time * (freq * 1.67)) * envAccel * 0.6;

    // Sniffer MPU6050 reading (cuts out to 0.000g once buried under rubble!)
    if (this.snifferDamaged) {
      this.accel.dynamicG = 0;
      this.accel.x = 0;
      this.accel.y = 0;
      this.accel.z = 0;
      this.staLtaRatio = 0;
    } else {
      this.accel.dynamicG = envAccel;
      this.accel.x = this.groundAccel.x;
      this.accel.y = this.groundAccel.y;
      this.accel.z = this.groundAccel.z;

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

      if (this.quakeActive && !this.frozenSnapshot && this.staLtaRatio >= this.staLtaThreshold) {
        this._capturePreQuakeSnapshot();
      }
    }

    // Live rolling seismogram buffer
    this.seismoHistory.push({
      t: this.time,
      accelG: this.snifferDamaged ? 0 : envAccel,
      groundG: envAccel,
      ratio: this.staLtaRatio,
      triggered: !this.snifferDamaged && this.staLtaRatio >= this.staLtaThreshold,
      snifferOffline: this.snifferDamaged
    });
    if (this.seismoHistory.length > 240) {
      this.seismoHistory.shift();
    }

    // Full-Event Seismogram Recording
    if (this.currentEventRecord) {
      this._eventSampleAccum += clampedDt;
      if (envAccel > this.currentEventRecord.peakG) {
        this.currentEventRecord.peakG = envAccel;
        this.currentEventRecord.peakRelTime = Math.max(0, this.time - this.currentEventRecord.startTime);
      }
      if (!this.snifferDamaged && this.staLtaRatio > this.currentEventRecord.peakStaLta) {
        this.currentEventRecord.peakStaLta = this.staLtaRatio;
      }

      if (this._eventSampleAccum >= 0.05) {
        this._eventSampleAccum = 0;
        this.currentEventRecord.samples.push({
          tRel: this.time - this.currentEventRecord.startTime,
          accelG: this.snifferDamaged ? 0 : envAccel,
          groundG: envAccel,
          ratio: this.staLtaRatio,
          triggered: !this.snifferDamaged && this.staLtaRatio >= this.staLtaThreshold,
          snifferOffline: this.snifferDamaged
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

    // 2. Update People Movement, Stairwell Descent, Dialogues & Spoken Voices
    this._updatePeople(clampedDt);

    // Prune rolling 10s probe window
    const cutoff = this.time - 10.0;
    while (this.rollingProbes.length > 0 && this.rollingProbes[0].timestamp < cutoff) {
      this.rollingProbes.shift();
    }

    // Periodic Sniffer RPi5 -> Outdoor Pole Gateway wireless heartbeat (only while Sniffer is alive!)
    if (!this.snifferDamaged) {
      this.batchSyncTimer += clampedDt;
      if (this.batchSyncTimer >= 3.2) {
        this.batchSyncTimer = 0;
        this.blinkPulseTimer = 0.55;
        if (this.cb.onPacketHeartbeat) this.cb.onPacketHeartbeat();
      }
    }

    // 3. Update Gateway 3 LEDs on Outdoor Pole
    if (!this.snifferDamaged && this.blinkRapidTimer > 0) {
      this.blinkRapidTimer -= clampedDt;
      this.gatewayLeds.blink = Math.floor(this.time * 14) % 2 === 0;
    } else if (!this.snifferDamaged && this.blinkPulseTimer > 0) {
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
    const isSevere = this.scenario === 'major' || this.scenario === 'catastrophic';

    // Rotate active speech bubbles + emit spoken voice line for the featured speaker!
    this._speechCycleTimer -= dt;
    if (this._speechCycleTimer <= 0) {
      this._speechCycleTimer = this.quakeActive ? 1.5 : 3.1;
      const maxVisible = this.quakeActive ? 7 : 4;
      const candidates = [...this.people].sort(() => Math.random() - 0.5);
      let shown = 0;
      let chosenVoiceSpeaker = null;

      candidates.forEach((p) => {
        if (p.state === 'trapped' && shown < maxVisible) {
          p.speechVisible = true;
          p.phrase = TRAPPED_PHRASES[(p.id + Math.floor(this.time / 3)) % TRAPPED_PHRASES.length];
          p.speechUrgency = 'trapped';
          if (!chosenVoiceSpeaker) chosenVoiceSpeaker = p;
          shown++;
        } else if (shown < maxVisible && Math.random() < (this.quakeActive ? 0.78 : 0.48)) {
          p.speechVisible = true;
          if (!chosenVoiceSpeaker) chosenVoiceSpeaker = p;
          shown++;
        } else {
          p.speechVisible = false;
        }
      });

      if (chosenVoiceSpeaker && this.cb.onNpcSpeak) {
        this.cb.onNpcSpeak(
          chosenVoiceSpeaker,
          chosenVoiceSpeaker.phrase,
          chosenVoiceSpeaker.speechUrgency || 'normal'
        );
      }
    }

    this.people.forEach((p) => {
      const homeZone = ZONES.find((z) => z.id === p.homeZone) || ZONES[0];

      if (this.quakeActive && this.quakeElapsed >= p.reactionDelay && p.state !== 'trapped') {
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
        } else if (isSevere) {
          if (p.state === 'working' || p.state === 'mild_react' || p.state === 'crouching') {
            p.state = 'duck_cover';
            p.pose = 'cover_head';
            const cover = homeZone.coverSpots[p.id % homeZone.coverSpots.length];
            p.targetX = cover.x;
            p.targetZ = cover.z;
            const pool =
              this.scenario === 'catastrophic' ? CATASTROPHIC_COVER_PHRASES : MAJOR_COVER_PHRASES;
            p.phrase = pool[p.id % pool.length];
            p.speechUrgency = this.scenario === 'catastrophic' ? 'catastrophic' : 'major';
            p.speechVisible = p.id % 3 === 0;
          } else if (p.state === 'duck_cover') {
            p.coverHoldTimer -= dt;
            if (p.coverHoldTimer <= 0) {
              p.state = 'evacuating_panic';
              p.pose = 'run';
              p.phrase = MAJOR_EVAC_PHRASES[p.id % MAJOR_EVAC_PHRASES.length];
              p.speechUrgency = this.scenario === 'catastrophic' ? 'catastrophic' : 'major';
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

      // Locomotion & Aligned U-Turn Stairwell Descent
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
        speed = isPanic ? 3.45 : 1.85;
        p.pose = isPanic ? 'run' : 'stand';

        if (p.y > 0.12) {
          // Upper floors: head to South Stairwell Doorway at x = 5.55, z = 2.45
          if (p.x < 5.55) {
            p.targetX = 5.85;
            p.targetZ = 2.35 + ((p.id % 3) - 1) * 0.35;
          } else {
            // Inside U-turn stairwell (South Floor Landing z=+2.4 <-> North Mid-Landing z=-2.8)
            const stairDescentSpeed = isPanic ? 2.4 : 1.48;
            p.y = Math.max(0, p.y - stairDescentSpeed * dt);
            const flightProgress = (p.y % FLOOR_HEIGHT) / FLOOR_HEIGHT; // 1.0 -> 0.5 -> 0.0
            const laneOffset = ((p.id % 3) - 1) * 0.2;
            if (flightProgress > 0.5) {
              // Outer flight descending from South (+2.2) to North (-2.8) along x ~ 7.95
              p.targetX = 7.95 + laneOffset;
              p.targetZ = 2.2 - ((1.0 - flightProgress) / 0.5) * 5.0;
            } else {
              // Inner flight descending from North (-2.8) to South (+2.2) along x ~ 6.45
              p.targetX = 6.45 + laneOffset;
              p.targetZ = -2.8 + ((0.5 - flightProgress) / 0.5) * 5.0;
            }
          }
        } else {
          p.y = 0;
          // Ground floor: exit via stairwell front doorway (x=7.2, z=4.5) or main lobby portal (x=-1.2, z=4.5)
          if (p.z < 3.9) {
            if (p.x > 4.6) {
              p.targetX = 7.2 + ((p.id % 2) - 0.5) * 0.4;
              p.targetZ = 4.6;
            } else {
              p.targetX = -1.2 + ((p.id % 3) - 1) * 0.5;
              p.targetZ = 4.6;
            }
          } else {
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
          p.facing = Math.atan2(-1.0 - p.x, -0.5 - p.z);
        }
      }

      p.currentZone = this._detectZone3D(p.x, p.y, p.z) || p.currentZone;
      p.floor = Math.max(1, Math.min(4, Math.round(p.y / FLOOR_HEIGHT) + 1));

      // Smartphone WiFi/BLE Probe Request emission (captured only while Sniffer RPi5 is intact)
      if (p.phoneOnline && !this.snifferDamaged) {
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
    const trappedByZone = { A: 0, B: 0, C: 0, D: 0 };
    ['A', 'B', 'C', 'D'].forEach((zid) => {
      const trappedHere = this.people.filter((p) => p.state === 'trapped' && p.currentZone === zid).length;
      trappedByZone[zid] = trappedHere;
      const metric = trappedHere > 0 ? 100 + trappedHere * 10 + (truthZones[zid] || 0) : truthZones[zid];
      if (metric > bestMetric) {
        bestMetric = metric;
        bestZone = zid;
      }
    });
    const bestZoneCode = ZONES.find((z) => z.id === bestZone)?.code || bestZone;
    const priorityCorrect =
      priorityZoneGuess === bestZone ||
      (trappedByZone[bestZone] > 0 && trappedByZone[priorityZoneGuess] > 0 && this.collapsedZones.has(priorityZoneGuess)) ||
      (trappedByZone[bestZone] === 0 && truthZones[priorityZoneGuess] === truthZones[bestZone]);
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

// js/simulation.js — Motor IoT LPSBOX (Sniffer WiFi/BLE 10s + MPU6050 STA/LTA + Gateway 3 LEDs + Agentes)

export const ZONES = [
  {
    id: 'A',
    code: 'Zona A',
    name: 'Zona A — Laboratorio de Electrónica',
    shortName: 'Laboratorio (A)',
    color: '#38bdf8',
    bounds: { xMin: -10.4, xMax: -0.8, zMin: -8.4, zMax: -2.3 },
    sensorPos: { x: -5.6, z: -5.4 },
    coverSpots: [
      { x: -7.8, z: -6.5 }, { x: -3.4, z: -6.5 },
      { x: -7.8, z: -3.8 }, { x: -3.4, z: -3.8 }
    ]
  },
  {
    id: 'B',
    code: 'Zona B',
    name: 'Zona B — Servidores y Oficinas',
    shortName: 'Servidores/Ofic. (B)',
    color: '#a855f7',
    bounds: { xMin: 0.8, xMax: 10.4, zMin: -8.4, zMax: -2.3 },
    sensorPos: { x: 5.6, z: -5.4 },
    coverSpots: [
      { x: 3.2, z: -6.6 }, { x: 7.8, z: -6.6 },
      { x: 3.5, z: -3.7 }, { x: 8.0, z: -3.7 }
    ]
  },
  {
    id: 'C',
    code: 'Zona C',
    name: 'Zona C — Auditorio Principal',
    shortName: 'Auditorio (C)',
    color: '#f59e0b',
    bounds: { xMin: -10.4, xMax: -0.8, zMin: -1.4, zMax: 4.3 },
    sensorPos: { x: -5.6, z: 1.5 },
    coverSpots: [
      { x: -8.2, z: 0.4 }, { x: -5.5, z: 0.4 },
      { x: -8.2, z: 2.8 }, { x: -3.2, z: 2.6 }
    ]
  },
  {
    id: 'D',
    code: 'Zona D',
    name: 'Zona D — Cafetería y Pasillo',
    shortName: 'Cafetería (D)',
    color: '#10b981',
    bounds: { xMin: 0.8, xMax: 10.4, zMin: -1.4, zMax: 4.3 },
    sensorPos: { x: 5.6, z: 1.5 },
    coverSpots: [
      { x: 3.2, z: 0.5 }, { x: 7.5, z: 0.5 },
      { x: 3.5, z: 2.9 }, { x: 7.8, z: 2.9 }
    ]
  }
];

export const ASSEMBLY_POINT = { x: -6.2, z: 9.8, radius: 2.8 };
export const GATEWAY_WORLD_POS = { x: 4.5, y: 0.92, z: 9.3 };
export const SNIFFER_WORLD_POS = { x: 0.0, y: 1.55, z: -1.85 };

const VENDOR_OUIS = [
  { prefix: 'F4:5C:89', vendor: 'Samsung Electronics' },
  { prefix: '3C:22:FB', vendor: 'Apple Inc.' },
  { prefix: 'A4:50:46', vendor: 'Xiaomi Comm.' },
  { prefix: '88:B4:A6', vendor: 'Motorola Mobility' },
  { prefix: 'DC:A6:32', vendor: 'Huawei Tech.' },
  { prefix: '70:85:C2', vendor: 'Google Pixel' }
];

const NORMAL_PHRASES = [
  'Revisando osciloscopio...',
  'Compilando firmware ESP32',
  'Tomando café antes de clase',
  'Conectado a WiFi UNAL',
  'Analizando red de sensores',
  'En clase magistral'
];

const MILD_PHRASES = [
  '¡Está temblando suave!',
  'Mantengan la calma, es leve',
  'Agacharse junto al escritorio',
  'Salgamos con calma por favor',
  '¿Sintieron ese sismo tranqui?'
];

const MAJOR_PHRASES = [
  '¡TERREMOTO FUERTE! ¡Evacúen!',
  '¡Cúbranse bajo las mesas!',
  '¡Se fue la luz en el bloque!',
  '¡Puerta bloqueada, ayuda aquí!',
  '¡Al punto de encuentro rápido!'
];

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
  // Locally Administered Unicast MAC: second hex nibble is 2, 6, A, or E
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
    this.challengeMode = true; // Hides exact ground-truth count until report is graded
    this.targetPeopleCount = 16;
    this.macNoiseLevel = 'medium'; // 'low' | 'medium' | 'high'
    this.customMagnitude = 6.9;

    // Active seismic state
    this.scenario = 'normal'; // 'normal' | 'mild' | 'major' | 'custom'
    this.quakeActive = false;
    this.quakeElapsed = 0;
    this.quakeDuration = 0;
    this.quakeMagnitude = 0;
    this.collapseOccurred = false;
    this.collapsedZones = new Set();

    // Physical table impact state (Mechanic 2)
    this.tableShockTimer = 0;
    this.shockwaves = []; // Visual MR shockwaves { x, z, radius, maxRadius, color, alpha }

    // MPU6050 + STA/LTA state (60 Hz)
    const baseEnergy = 3.2e-5; // ~(0.0056g)^2 baseline vibration energy
    this.accel = { x: 0, y: 0, z: 1.0, dynamicG: 0.004 };
    this.sta = baseEnergy;
    this.lta = baseEnergy;
    this.staLtaRatio = 1.0;
    this.staLtaThreshold = 3.0;
    this.seismoHistory = []; // { t, accelG, ratio, triggered }
    for (let i = 0; i < 180; i++) {
      this.seismoHistory.push({ t: -3 + i * 0.016, accelG: 0.004, ratio: 1.0, triggered: false });
    }

    // Sniffer 10-second sliding Probe Request buffer
    this.rollingProbes = []; // Last 10s of packets
    this.batchSyncTimer = 0;

    // Gateway 3 Physical LEDs (Mechanic 3)
    // blue: Sin información | blink: Recibiendo/Procesando | yellow: Hay información lista
    this.gatewayLeds = {
      blue: true,
      blink: false,
      yellow: false
    };
    this.blinkPulseTimer = 0;
    this.blinkRapidTimer = 0;

    // Frozen Pre-Quake Snapshot stored in Gateway (Raspberry Pi 5 SD / SQLite)
    this.frozenSnapshot = null;
    this.dataExtractedByOperator = false;
    this.reportSubmitted = false;
    this.showPreQuakeHologram = false;
    this.userMapPins = []; // { x, z } placed by operator on tactical map

    // Live external hardware override (WebSocket from real Raspberry Pi 5)
    this.externalHardwareConnected = false;

    this.people = [];
    this.rfPulses = []; // 3D visual probe request pulses

    this.spawnMissionRandom(true);
  }

  logEvent(text, level = 'info') {
    if (this.cb.onLog) {
      this.cb.onLog({ time: this.time, text, level });
    }
  }

  spawnPopulation(zoneCounts) {
    this.people = [];
    let idCounter = 1;

    ZONES.forEach((zone) => {
      const count = zoneCounts[zone.id] || 0;
      for (let i = 0; i < count; i++) {
        const { mac, vendor } = makeRealMac(idCounter);
        const x = randRange(zone.bounds.xMin + 0.9, zone.bounds.xMax - 0.9);
        const z = randRange(zone.bounds.zMin + 0.9, zone.bounds.zMax - 0.9);
        const shirtPalette = ['#38bdf8', '#fb7185', '#34d399', '#fbbf24', '#a78bfa', '#f97316', '#2dd4bf'];
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
          currentZone: zone.id,
          x,
          z,
          vx: 0,
          vz: 0,
          targetX: x,
          targetZ: z,
          waitTimer: randRange(0.5, 3.5),
          probeTimer: randRange(0.2, 2.6),
          randomBurstTimer: randRange(1.0, 4.5),
          state: 'working', // 'working' | 'crouching' | 'evacuating_calm' | 'evacuating_panic' | 'evacuated' | 'trapped'
          phoneOnline: true,
          phrase: NORMAL_PHRASES[idCounter % NORMAL_PHRASES.length],
          phraseTimer: randRange(1, 5),
          color: shirtPalette[idCounter % shirtPalette.length],
          walkPhase: Math.random() * Math.PI * 2,
          preQuakePos: { x, z, zone: zone.id }
        });
        idCounter++;
      }
    });

    this.targetPeopleCount = this.people.length;
    this.rollingProbes = [];
    // Seed initial 10s probe window so live buffer has realistic packets immediately
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
    // Generate realistic uneven distribution across the 4 zones (total 11..25 people)
    const counts = {
      A: Math.floor(randRange(2, 7)),
      B: Math.floor(randRange(1, 6)),
      C: Math.floor(randRange(3, 9)),
      D: Math.floor(randRange(2, 7))
    };
    this.resetEnvironmentState();
    this.spawnPopulation(counts);
    if (!silent) {
      this.logEvent(
        this.challengeMode
          ? 'Nueva misión generada: conteo real oculto. Dispara un sismo y analiza el Gateway.'
          : `Escenario reiniciado con ${this.people.length} personas distribuidas en Zonas A–D.`,
        'info'
      );
    }
  }

  spawnWithTotalCount(total) {
    const clamped = Math.max(4, Math.min(32, Math.round(total)));
    const weights = [0.26, 0.20, 0.32, 0.22];
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
    this.resetEnvironmentState();
    this.spawnPopulation(counts);
  }

  resetEnvironmentState() {
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
    if (this.cb.onScenarioChange) this.cb.onScenarioChange('normal');
  }

  setNormalMonitoring() {
    // Restore calm state while keeping current population (returning evacuated/trapped people to their home zones)
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

    this.people.forEach((p) => {
      const zone = ZONES.find((z) => z.id === p.homeZone) || ZONES[0];
      p.x = randRange(zone.bounds.xMin + 0.9, zone.bounds.xMax - 0.9);
      p.z = randRange(zone.bounds.zMin + 0.9, zone.bounds.zMax - 0.9);
      p.targetX = p.x;
      p.targetZ = p.z;
      p.currentZone = zone.id;
      p.state = 'working';
      p.phoneOnline = true;
      p.phrase = NORMAL_PHRASES[p.id % NORMAL_PHRASES.length];
    });

    this.rollingProbes = [];
    this._seedInitialProbes();
    this.logEvent('Modo Monitoreo Normal activo. Gateway LED Azul encendido (sin alerta sísmica).', 'ok');
    if (this.cb.onScenarioChange) this.cb.onScenarioChange('normal');
  }

  triggerSeismicScenario(type, customMag = null) {
    // First ensure everyone is inside the building if previous quake already evacuated them
    const anyOutsideOrTrapped = this.people.some((p) => p.state === 'evacuated' || p.state === 'trapped');
    if (anyOutsideOrTrapped) {
      if (this.challengeMode) {
        this.spawnMissionRandom(true);
      } else {
        this.setNormalMonitoring();
      }
    } else {
      // Reset snapshot so this fresh seismic event captures a clean t0
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
    }

    // Record exact ground-truth pre-quake coordinates for every person right as event starts
    this.people.forEach((p) => {
      p.preQuakePos = { x: p.x, z: p.z, zone: this._detectZone(p.x, p.z) || p.homeZone };
    });

    if (type === 'mild') {
      this.scenario = 'mild';
      this.quakeActive = true;
      this.quakeElapsed = 0;
      this.quakeDuration = 9.5;
      this.quakeMagnitude = 4.2;
      this.logEvent(' Escenario iniciado: SISMO TRANQUI (4.2 Mw). Ondas P llegando al MPU6050...', 'warn');
    } else if (type === 'major') {
      this.scenario = 'major';
      this.quakeActive = true;
      this.quakeElapsed = 0;
      this.quakeDuration = 14.0;
      this.quakeMagnitude = 6.9;
      this.logEvent('¡ALERTA! Escenario iniciado: TERREMOTO SEVERO (6.9 Mw). Monitoreando disparo STA/LTA...', 'crit');
    } else {
      const mag = customMag ?? this.customMagnitude;
      this.scenario = mag >= 5.5 ? 'major' : 'mild';
      this.quakeActive = true;
      this.quakeElapsed = 0;
      this.quakeDuration = mag >= 5.5 ? 13.5 : 9.0;
      this.quakeMagnitude = mag;
      this.logEvent(`Sismo personalizado disparado (${mag.toFixed(1)} Mw).`, mag >= 5.5 ? 'crit' : 'warn');
    }

    if (this.cb.onScenarioChange) this.cb.onScenarioChange(this.scenario);
  }

  triggerPhysicalTableHit() {
    this.tableShockTimer = 0.45;
    this.blinkRapidTimer = 1.4;
    // Launch MR shockwaves from both Gateway table and Sniffer MPU6050!
    this.shockwaves.push({
      x: GATEWAY_WORLD_POS.x,
      z: GATEWAY_WORLD_POS.z,
      radius: 0.3,
      maxRadius: 19.0,
      color: '#a855f7',
      alpha: 0.95
    });
    this.shockwaves.push({
      x: SNIFFER_WORLD_POS.x,
      z: SNIFFER_WORLD_POS.z,
      radius: 0.3,
      maxRadius: 14.0,
      color: '#38bdf8',
      alpha: 0.85
    });

    // Force immediate probe sweep ping in MR
    this.people.forEach((p) => {
      if (p.phoneOnline) {
        this._emitProbePacket(p, false, this.time);
      }
    });

    this.logEvent(
      'Golpe físico detectado en MPU6050 (Pico de impacto -> Onda MR de escaneo activada).',
      'warn'
    );
    if (this.cb.onTableHit) this.cb.onTableHit();
  }

  // Called if a real Raspberry Pi 5 pushes live JSON telemetry via WebSocket
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
      const clamped = Math.max(1, Math.min(32, Math.round(payload.phone_count)));
      if (clamped !== this.people.length) {
        this.spawnWithTotalCount(clamped);
        this.logEvent(`[RPi5 Live] Sniffer reporta ${clamped} smartphones reales cercanos.`, 'ok');
      }
    }
    this.blinkRapidTimer = 0.8;
  }

  _detectZone(x, z) {
    for (const zone of ZONES) {
      if (
        x >= zone.bounds.xMin - 0.5 &&
        x <= zone.bounds.xMax + 0.5 &&
        z >= zone.bounds.zMin - 0.5 &&
        z <= zone.bounds.zMax + 0.5
      ) {
        return zone.id;
      }
    }
    return z > 4.8 ? 'EXT' : null;
  }

  _computeRssiByZone(x, z) {
    const rssiMap = {};
    ZONES.forEach((zone) => {
      const dx = x - zone.sensorPos.x;
      const dz = z - zone.sensorPos.z;
      const dist = Math.max(0.8, Math.hypot(dx, dz));
      // Log-distance path loss indoor model + wall attenuation
      const sameZone = this._detectZone(x, z) === zone.id;
      const wallLoss = sameZone ? 0 : 9.5;
      const noise = randRange(-2.2, 2.2);
      rssiMap[zone.id] = Math.round(-37 - 21 * Math.log10(dist) - wallLoss + noise);
    });
    return rssiMap;
  }

  _emitProbePacket(person, isRandomBurst = false, customTime = null) {
    const ts = customTime !== null ? customTime : this.time;
    const rssiByZone = this._computeRssiByZone(person.x, person.z);

    // Pick strongest RSSI sector as triangulated zone
    let bestZone = 'A';
    let bestRssi = -999;
    for (const [zid, val] of Object.entries(rssiByZone)) {
      if (val > bestRssi) {
        bestRssi = val;
        bestZone = zid;
      }
    }

    // Add realistic small RSSI triangulation jitter (~0.45m)
    const estX = person.x + randRange(-0.42, 0.42);
    const estZ = person.z + randRange(-0.42, 0.42);

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
      isDuplicateRandomBurst: isRandomBurst, // Flagged by Sniffer's 10s sequence/IE/RSSI deduplicator
      vendor: isLaaRandom ? 'MAC Aleatoria (LAA)' : person.vendor,
      proto: person.proto,
      channel: person.channel,
      rssiByZone,
      peakRssi: bestRssi,
      estimatedZone: bestZone,
      estX,
      estZ
    };

    this.rollingProbes.push(pkt);

    if (customTime === null) {
      this.rfPulses.push({
        x: person.x,
        z: person.z,
        radius: 0.15,
        maxRadius: 2.3,
        alpha: 0.85,
        isRandom: isRandomBurst
      });
    }
  }

  _capturePreQuakeSnapshot() {
    if (this.frozenSnapshot) return;

    // Ensure every active smartphone inside the 10s window has a clean representation in rollingProbes
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

    // Deduplicate unique devices in the 10s window (keeping latest non-burst frame per deviceHash)
    const uniqueDevicesMap = new Map();
    windowPackets.forEach((pkt) => {
      if (!pkt.isDuplicateRandomBurst) {
        uniqueDevicesMap.set(pkt.deviceHash, pkt);
      }
    });
    const uniqueDevices = Array.from(uniqueDevicesMap.values());

    // Ground truth zone counts at t0
    const groundTruthByZone = { A: 0, B: 0, C: 0, D: 0 };
    const groundTruthPositions = [];
    this.people.forEach((p) => {
      const z = p.preQuakePos?.zone || p.homeZone;
      if (groundTruthByZone[z] !== undefined) groundTruthByZone[z]++;
      groundTruthPositions.push({
        id: p.id,
        x: p.preQuakePos.x,
        z: p.preQuakePos.z,
        zone: z,
        deviceHash: p.deviceHash
      });
    });

    // Sniffer triangulated zone counts
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

    // Hardware Sync (Mechanic 3): Blue OFF, Rapid Blink ON, Yellow ON!
    this.gatewayLeds.blue = false;
    this.gatewayLeds.yellow = true;
    this.blinkRapidTimer = 3.2;

    // Launch visual shockwave from Sniffer
    this.shockwaves.push({
      x: SNIFFER_WORLD_POS.x,
      z: SNIFFER_WORLD_POS.z,
      radius: 0.4,
      maxRadius: 22.0,
      color: this.scenario === 'major' ? '#ef4444' : '#f59e0b',
      alpha: 0.95
    });

    this.logEvent(
      `[Sniffer -> Gateway] STA/LTA = ${this.staLtaRatio.toFixed(2)} ≥ 3.0. Snapshot Pre-Sismo (t₀) guardado en RPi5. ¡LED Amarillo ACTIVO!`,
      this.scenario === 'major' ? 'crit' : 'warn'
    );

    if (this.cb.onSnapshotCaptured) {
      this.cb.onSnapshotCaptured(this.frozenSnapshot);
    }
  }

  _triggerInteriorCollapse() {
    if (this.collapseOccurred) return;
    this.collapseOccurred = true;

    // Pick 2 zones with the highest occupancy (or A & C) to suffer partial structural blockage
    const sortedZones = ['A', 'B', 'C', 'D'].sort((z1, z2) => {
      const c1 = this.people.filter((p) => p.preQuakePos.zone === z1).length;
      const c2 = this.people.filter((p) => p.preQuakePos.zone === z2).length;
      return c2 - c1;
    });
    this.collapsedZones.add(sortedZones[0]);
    this.collapsedZones.add(sortedZones[1]);

    let trappedCount = 0;
    this.people.forEach((p, idx) => {
      const zoneNow = this._detectZone(p.x, p.z) || p.homeZone;
      const inCollapsed = this.collapsedZones.has(zoneNow) || this.collapsedZones.has(p.homeZone);
      // People still inside collapsed zones when S-wave strikes get blocked by debris; ~65% lose phone signal
      if (inCollapsed && p.z < 4.2 && idx % 2 === 0) {
        p.state = 'trapped';
        p.currentZone = p.homeZone;
        p.phoneOnline = Math.random() < 0.35;
        p.phrase = '¡Salida bloqueada! ¡Ayuda!';
        trappedCount++;
      }
    });

    this.logEvent(
      `Corte eléctrico y caída de escombros en Zona ${sortedZones[0]} y Zona ${sortedZones[1]}. Señales celulares post-sismo degradadas (${trappedCount} personas incomunicadas).`,
      'crit'
    );
    if (this.cb.onCollapse) {
      this.cb.onCollapse(Array.from(this.collapsedZones));
    }
  }

  update(dt) {
    const clampedDt = Math.min(dt, 0.05);
    this.time += clampedDt;

    // 1. Update Seismic Waveform & MPU6050 STA/LTA
    let envAccel = 0.004 + Math.random() * 0.003; // baseline noise

    if (this.quakeActive) {
      this.quakeElapsed += clampedDt;
      const t = this.quakeElapsed;
      const dur = this.quakeDuration;

      if (t <= dur) {
        if (this.scenario === 'mild') {
          // P-wave (0..1.4s), gentle S-wave (1.4..7.5s), coda (7.5..9.5s)
          const pEnv = t < 1.4 ? Math.sin((t / 1.4) * Math.PI) * 0.042 : 0;
          const sEnv = t >= 1.1 ? Math.exp(-Math.pow((t - 3.6) / 2.4, 2)) * 0.095 : 0;
          envAccel += (pEnv + sEnv) * (0.75 + 0.5 * Math.random());
        } else {
          // Major earthquake: sharp P-wave (0..1.8s), violent S-wave (1.8..10.5s), decay
          const magScale = Math.max(0.5, (this.quakeMagnitude - 4.5) / 2.4);
          const pEnv = t < 2.0 ? Math.sin((t / 2.0) * Math.PI) * 0.14 * magScale : 0;
          const sEnv = t >= 1.5 ? Math.exp(-Math.pow((t - 5.4) / 3.4, 2)) * 0.68 * magScale : 0;
          envAccel += (pEnv + sEnv) * (0.7 + 0.6 * Math.random());

          if (t >= 2.2 && !this.collapseOccurred) {
            this._triggerInteriorCollapse();
          }
        }
      } else {
        this.quakeActive = false;
        this.logEvent(
          'Movimiento sísmico finalizado. Revisa el Gateway (LED Amarillo) para extraer el conteo y ubicación pre-sismo.',
          'info'
        );
      }
    }

    if (this.tableShockTimer > 0) {
      this.tableShockTimer -= clampedDt;
      envAccel += 0.42 * (this.tableShockTimer / 0.45);
    }

    this.accel.dynamicG = envAccel;
    const freq = this.scenario === 'major' ? 19 : 13;
    this.accel.x = Math.sin(this.time * freq) * envAccel;
    this.accel.y = Math.cos(this.time * (freq * 1.27)) * envAccel * 0.85;
    this.accel.z = 1.0 + Math.sin(this.time * (freq * 1.7)) * envAccel * 0.6;

    // Recursive STA/LTA energy detector
    const energy = envAccel * envAccel + 1e-6;
    const alphaSta = Math.min(1, clampedDt / 0.35);  // 0.35s short-term window
    const alphaLta = Math.min(1, clampedDt / 7.5);   // 7.5s long-term window
    this.sta += alphaSta * (energy - this.sta);
    // Freeze LTA growth slightly when already triggered so STA/LTA captures true ratio
    const ltaRate = this.sta / Math.max(this.lta, 1e-7) > 2.5 ? alphaLta * 0.12 : alphaLta;
    this.lta += ltaRate * (energy - this.lta);
    this.staLtaRatio = Math.min(14.0, Math.sqrt(this.sta / Math.max(this.lta, 1e-7)));

    if (this.frozenSnapshot && envAccel > this.frozenSnapshot.peakAccelG) {
      this.frozenSnapshot.peakAccelG = envAccel;
    }

    // Trigger Pre-Quake Snapshot when STA/LTA crosses threshold during a seismic scenario!
    if (this.quakeActive && !this.frozenSnapshot && this.staLtaRatio >= this.staLtaThreshold) {
      this._capturePreQuakeSnapshot();
    }

    this.seismoHistory.push({
      t: this.time,
      accelG: envAccel,
      ratio: this.staLtaRatio,
      triggered: this.staLtaRatio >= this.staLtaThreshold
    });
    if (this.seismoHistory.length > 200) {
      this.seismoHistory.shift();
    }

    // 2. Update People Movement, Reactions & Probe Request Emissions
    this._updatePeople(clampedDt);

    // Prune rolling 10s probe window
    const cutoff = this.time - 10.0;
    while (this.rollingProbes.length > 0 && this.rollingProbes[0].timestamp < cutoff) {
      this.rollingProbes.shift();
    }

    // Periodic 10s Sniffer -> Gateway packet heartbeat
    this.batchSyncTimer += clampedDt;
    if (this.batchSyncTimer >= 3.2) {
      this.batchSyncTimer = 0;
      this.blinkPulseTimer = 0.55;
      if (this.cb.onPacketHeartbeat) this.cb.onPacketHeartbeat();
    }

    // 3. Update Gateway 3 LEDs (Mechanic 3 Hardware Sync)
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
      p.radius += clampedDt * 2.6;
      p.alpha -= clampedDt * 0.95;
      if (p.alpha <= 0 || p.radius >= p.maxRadius) {
        this.rfPulses.splice(i, 1);
      }
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.radius += clampedDt * 13.5;
      sw.alpha -= clampedDt * 0.65;
      if (sw.alpha <= 0 || sw.radius >= sw.maxRadius) {
        this.shockwaves.splice(i, 1);
      }
    }
  }

  _updatePeople(dt) {
    const noiseMultiplier = this.macNoiseLevel === 'high' ? 1.8 : this.macNoiseLevel === 'medium' ? 1.0 : 0.25;

    this.people.forEach((p) => {
      // Reaction transitions during seismic scenarios
      if (this.quakeActive && this.quakeElapsed > 0.85) {
        if (this.scenario === 'mild') {
          if (p.state === 'working') {
            if (p.id % 2 === 0) {
              p.state = 'crouching';
              const zone = ZONES.find((z) => z.id === p.homeZone) || ZONES[0];
              const cover = zone.coverSpots[p.id % zone.coverSpots.length];
              p.targetX = cover.x + randRange(-0.4, 0.4);
              p.targetZ = cover.z + randRange(-0.4, 0.4);
              p.phrase = MILD_PHRASES[p.id % MILD_PHRASES.length];
            } else {
              p.state = 'evacuating_calm';
              p.phrase = MILD_PHRASES[(p.id + 1) % MILD_PHRASES.length];
            }
          }
        } else if (this.scenario === 'major') {
          if (p.state === 'working' || p.state === 'crouching') {
            p.state = 'evacuating_panic';
            p.phrase = MAJOR_PHRASES[p.id % MAJOR_PHRASES.length];
          }
        }
      } else if (!this.quakeActive && this.scenario === 'mild' && p.state === 'crouching') {
        // After mild quake finishes, crouched people stand back up calmly
        p.state = 'working';
        p.phrase = 'Todo en orden tras el sismo leve';
      }

      // Locomotion by state
      let speed = 1.15;
      if (p.state === 'working') {
        p.waitTimer -= dt;
        if (p.waitTimer <= 0) {
          const zone = ZONES.find((z) => z.id === p.homeZone) || ZONES[0];
          p.targetX = randRange(zone.bounds.xMin + 0.9, zone.bounds.xMax - 0.9);
          p.targetZ = randRange(zone.bounds.zMin + 0.9, zone.bounds.zMax - 0.9);
          p.waitTimer = randRange(2.8, 6.5);
        }
      } else if (p.state === 'crouching') {
        speed = 2.0;
      } else if (p.state === 'evacuating_calm' || p.state === 'evacuating_panic') {
        speed = p.state === 'evacuating_panic' ? 3.55 : 1.95;
        // Navigate first through central aisle (x ~ 0), then out main door (0, 5.2), then to ASSEMBLY_POINT
        if (p.z < 4.7) {
          if (Math.abs(p.x) > 1.3 && p.z < -1.8) {
            p.targetX = p.x > 0 ? 0.35 : -0.35;
            p.targetZ = -1.8;
          } else {
            p.targetX = (p.id % 3 - 1) * 0.45;
            p.targetZ = 5.4;
          }
        } else {
          const angle = (p.id * 1.37) % (Math.PI * 2);
          const rad = 0.7 + (p.id % 4) * 0.55;
          p.targetX = ASSEMBLY_POINT.x + Math.cos(angle) * rad;
          p.targetZ = ASSEMBLY_POINT.z + Math.sin(angle) * rad;
          if (Math.hypot(p.x - p.targetX, p.z - p.targetZ) < 0.55) {
            p.state = 'evacuated';
            p.phrase = 'A salvo en Punto de Encuentro';
          }
        }
      } else if (p.state === 'trapped') {
        speed = 0;
      } else if (p.state === 'evacuated') {
        speed = 0.6;
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
        p.walkPhase += dt * speed * 4.8;
      } else {
        p.vx = 0;
        p.vz = 0;
      }

      p.currentZone = this._detectZone(p.x, p.z) || p.currentZone;

      // Smartphone WiFi/BLE Probe Request emission
      if (p.phoneOnline) {
        p.probeTimer -= dt;
        if (p.probeTimer <= 0) {
          p.probeTimer = randRange(2.1, 4.4);
          this._emitProbePacket(p, false);
        }

        if (p.usesRandomMac && noiseMultiplier > 0.3) {
          p.randomBurstTimer -= dt * noiseMultiplier;
          if (p.randomBurstTimer <= 0) {
            p.randomBurstTimer = randRange(3.2, 7.0);
            this._emitProbePacket(p, true);
          }
        }
      }
    });
  }

  getPostQuakeZoneStatus() {
    const postInside = { A: 0, B: 0, C: 0, D: 0, evacuated: 0, trapped: 0 };
    this.people.forEach((p) => {
      if (p.state === 'evacuated' || p.z > 4.8) {
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

    // Score total count (40 pts)
    const totalError = Math.abs(totalGuess - truthTotal);
    const totalPoints = Math.max(0, 40 - totalError * 8);

    // Score zone breakdown (45 pts -> 11.25 per zone)
    let zoneErrorSum = 0;
    const zoneDetails = {};
    ['A', 'B', 'C', 'D'].forEach((zid) => {
      const g = Number(zoneGuesses[zid] || 0);
      const t = truthZones[zid] || 0;
      const err = Math.abs(g - t);
      zoneErrorSum += err;
      zoneDetails[zid] = { guess: g, truth: t, exact: err === 0 };
    });
    const zonePoints = Math.max(0, Math.round(45 - zoneErrorSum * 5.5));

    // Score priority zone (15 pts)
    // Priority zone = collapsed zone with most trapped, or zone with highest pre-quake people
    let bestZone = 'A';
    let bestMetric = -1;
    ['A', 'B', 'C', 'D'].forEach((zid) => {
      const trappedHere = this.people.filter((p) => p.state === 'trapped' && p.currentZone === zid).length;
      const metric = trappedHere > 0 ? 100 + trappedHere : truthZones[zid];
      if (metric > bestMetric) {
        bestMetric = metric;
        bestZone = zid;
      }
    });
    const priorityCorrect = priorityZoneGuess === bestZone || truthZones[priorityZoneGuess] === truthZones[bestZone];
    const priorityPoints = priorityCorrect ? 15 : 5;

    const finalScore = Math.min(100, totalPoints + zonePoints + priorityPoints);

    // Check if operator accidentally submitted the unfiltered raw packet count!
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
      priorityCorrect,
      usedUnfilteredRaw,
      rawPacketCount: snap ? snap.rawPacketCount : truthTotal
    };
  }
}

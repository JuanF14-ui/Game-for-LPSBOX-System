// js/simulation.js — Motor Sísmico, IoT y Comportamiento Humano LPSBOX (v5 — Edificio 454 CyT UNAL Bogotá)
// - Réplica arquitectónica y funcional del Edificio 454 "Luis Carlos Sarmiento Angulo" (Ciencia y Tecnología, UNAL Bogotá):
//   Sótano (-1 Gran Auditorio), Piso 1 (Acceso, Pilotis, Hemeroteca, TI, Baños),
//   Pisos 2–4 (Biblioteca en ala oeste con rampas exteriores + Salones, Salas TI y Baños en ala norte),
//   Último Piso / Piso 5 (Cafetería con cubierta reticulada + Gran Terraza descubierta).
// - NPCs sin voz hablada TTS: gestos corporales expresivos, gritos/exclamaciones no verbales y conversaciones
//   universitarias naturales e inteligentes en globos de texto (sin romper la cuarta pared ni mencionar el Gateway).
// - Víctimas atrapadas bajo escombros 3D reales en sismos fuertes/catastróficos + Sniffer RPi5 sepultado en 7.8 Mw.

export const FLOOR_HEIGHT = 3.4;

export const ZONES = [
  {
    id: 'S',
    floor: 0,
    yBase: -3.4,
    code: 'Auditorio (-1)',
    name: 'Sótano (-1) — Gran Auditorio Subterráneo (Entrada Principal)',
    shortName: 'Auditorio (-1)',
    color: '#f43f5e',
    areas: [{ xMin: -9.4, xMax: 2.2, zMin: 1.0, zMax: 8.2, role: 'auditorium' }],
    sensorPos: { x: -3.6, y: -1.1, z: 4.5 },
    coverSpots: [
      { x: -7.2, z: 3.4 }, { x: -4.2, z: 5.2 },
      { x: -1.0, z: 4.8 }, { x: 1.1, z: 3.2 }
    ]
  },
  {
    id: 'A',
    floor: 1,
    yBase: 0.12,
    code: 'Piso 1',
    name: 'Piso 1 — Acceso Principal, Sala Estudio, Nodo TI y Baños',
    shortName: 'Piso 1 · Acceso / TI',
    color: '#10b981',
    areas: [
      { xMin: -21.2, xMax: -13.4, zMin: -9.8, zMax: 9.8, role: 'study' },
      { xMin: -12.0, xMax: -4.2, zMin: -10.4, zMax: -4.2, role: 'it_room' },
      { xMin: -2.8, xMax: 12.5, zMin: -9.8, zMax: -4.0, role: 'portico' }
    ],
    sensorPos: { x: -8.5, y: 2.7, z: -6.2 },
    coverSpots: [
      { x: -18.5, z: -3.5 }, { x: -16.8, z: 4.6 },
      { x: -7.8, z: -8.2 }, { x: 4.2, z: -6.8 }
    ]
  },
  {
    id: 'B',
    floor: 2,
    yBase: 3.52,
    code: 'Piso 2',
    name: 'Piso 2 — Biblioteca N1, Salones 201–202 y Lab TI (Sniffer RPi5)',
    shortName: 'Piso 2 · Biblio / Sniffer',
    color: '#38bdf8',
    areas: [
      { xMin: -21.2, xMax: -13.4, zMin: -9.8, zMax: 9.8, role: 'library' },
      { xMin: -11.2, xMax: 2.8, zMin: -10.5, zMax: -4.8, role: 'classroom' },
      { xMin: 3.8, xMax: 10.8, zMin: -10.5, zMax: -4.8, role: 'it_room' }
    ],
    sensorPos: { x: 7.2, y: 4.75, z: -10.45 },
    coverSpots: [
      { x: -19.2, z: -4.2 }, { x: -15.6, z: 5.4 },
      { x: -6.5, z: -7.8 }, { x: 6.4, z: -7.5 }
    ]
  },
  {
    id: 'C',
    floor: 3,
    yBase: 6.92,
    code: 'Piso 3',
    name: 'Piso 3 — Biblioteca N2 (Vacío Central), Salones 301–302 y TI',
    shortName: 'Piso 3 · Biblio / 30x',
    color: '#a855f7',
    areas: [
      { xMin: -21.4, xMax: -19.5, zMin: -9.5, zMax: 9.5, role: 'library' },
      { xMin: -15.2, xMax: -13.3, zMin: -9.5, zMax: 9.5, role: 'library' },
      { xMin: -11.2, xMax: 3.0, zMin: -10.5, zMax: -4.8, role: 'classroom' },
      { xMin: 3.8, xMax: 10.8, zMin: -10.5, zMax: -4.8, role: 'it_room' }
    ],
    sensorPos: { x: -4.0, y: 9.5, z: -6.5 },
    coverSpots: [
      { x: -20.4, z: -2.5 }, { x: -14.2, z: 3.5 },
      { x: -7.2, z: -8.0 }, { x: 6.8, z: -8.0 }
    ]
  },
  {
    id: 'D',
    floor: 4,
    yBase: 10.32,
    code: 'Piso 4',
    name: 'Piso 4 — Salas de Cómputo TI 401–402, Salón 403 y Biblioteca N3',
    shortName: 'Piso 4 · Cómputo TI',
    color: '#f59e0b',
    areas: [
      { xMin: -21.4, xMax: -19.5, zMin: -9.5, zMax: 9.5, role: 'library' },
      { xMin: -11.2, xMax: 3.2, zMin: -10.5, zMax: -4.8, role: 'it_room' },
      { xMin: 3.8, xMax: 10.8, zMin: -10.5, zMax: -4.8, role: 'classroom' }
    ],
    sensorPos: { x: -2.0, y: 12.8, z: -7.2 },
    coverSpots: [
      { x: -20.3, z: 2.0 }, { x: -7.4, z: -8.2 },
      { x: -0.8, z: -8.0 }, { x: 7.2, z: -7.8 }
    ]
  },
  {
    id: 'E',
    floor: 5,
    yBase: 13.72,
    code: 'Piso 5 · Cafetería',
    name: 'Último Piso — Cafetería Techada CyT y Terraza Descubierta',
    shortName: 'Piso 5 · Cafetería',
    color: '#ec4899',
    areas: [
      { xMin: -1.6, xMax: 13.8, zMin: -10.2, zMax: -4.2, role: 'cafeteria' },
      { xMin: -20.5, xMax: -4.5, zMin: -8.5, zMax: 8.2, role: 'terrace' }
    ],
    sensorPos: { x: 5.5, y: 16.0, z: -6.8 },
    coverSpots: [
      { x: 2.2, z: -7.6 }, { x: 7.8, z: -7.4 },
      { x: 11.4, z: -6.8 }, { x: -12.5, z: 1.5 }
    ]
  }
];

export const ZONE_KEYS = ZONES.map((z) => z.id);

// Punto de Encuentro en la gran Plazoleta CyT frente al edificio
export const ASSEMBLY_POINT = { x: -2.2, z: 15.2, radius: 4.2 };

// Nodo Sniffer (Raspberry Pi 5 + MPU6050 + modelo3d.stl) en Laboratorio TI 203 del Piso 2 (Ala Norte)
export const SNIFFER_WORLD_POS = { x: 7.2, y: 3.52 + 1.12, z: -10.42 };

// Poste de Iluminación Icónico de la Plazoleta CyT con el LPSBOX Gateway (4.65 m arriba -> 1.18 m abajo)
export const POLE_WORLD_POS = { x: 6.5, y: 0.08, z: 9.5 };
export const GATEWAY_HEIGHT_UP = 4.65;
export const GATEWAY_HEIGHT_DOWN = 1.18;
export const GATEWAY_WORLD_POS = {
  x: POLE_WORLD_POS.x - 0.34,
  y: GATEWAY_HEIGHT_UP,
  z: POLE_WORLD_POS.z
};

// Puntos exactos de derrumbe donde quedan personas atrapadas bajo escombros 3D visibles
export const RUBBLE_POCKETS = [
  {
    id: 'rubble_p2_ti',
    zone: 'B',
    x: 5.3,
    y: 3.52,
    z: -8.1,
    label: 'Salón TI 203 (Piso 2)',
    phrase: '¡Estamos atrapados bajo la viga caída del laboratorio 203, no puedo sacar la pierna!'
  },
  {
    id: 'rubble_p2_cls',
    zone: 'B',
    x: -2.4,
    y: 3.52,
    z: -8.4,
    label: 'Salón 202 (Piso 2)',
    phrase: '¡Se desplomó el cielo raso sobre los pupitres del 202, golpeen el tubo para que nos oigan!'
  },
  {
    id: 'rubble_p3_lib',
    zone: 'C',
    x: -14.3,
    y: 6.92,
    z: 2.2,
    label: 'Biblioteca Nivel 2 (Piso 3)',
    phrase: '¡Cayeron las estanterías y parte de la placa en el tercer piso de la biblioteca, ayuda!'
  },
  {
    id: 'rubble_p4_it',
    zone: 'D',
    x: -6.8,
    y: 10.32,
    z: -8.2,
    label: 'Sala de Cómputo 401 (Piso 4)',
    phrase: '¡Quedamos encerrados bajo la losa fracturada en la sala de cómputo del cuarto piso!'
  },
  {
    id: 'rubble_sub_aud',
    zone: 'S',
    x: -3.2,
    y: -3.4,
    z: 2.4,
    label: 'Acceso Auditorio Subterráneo (-1)',
    phrase: '¡Cayó concreto en la escalera del auditorio subterráneo, tenemos aire pero no podemos salir!'
  }
];

const VENDOR_OUIS = [
  { prefix: 'F4:5C:89', vendor: 'Samsung Electronics' },
  { prefix: '3C:22:FB', vendor: 'Apple Inc.' },
  { prefix: 'A4:50:46', vendor: 'Xiaomi Comm.' },
  { prefix: '88:B4:A6', vendor: 'Motorola Mobility' },
  { prefix: 'DC:A6:32', vendor: 'Huawei Tech.' },
  { prefix: '70:85:C2', vendor: 'Google Pixel' }
];

// Conversaciones universitarias inteligentes y naturales por espacio del CyT (CERO menciones al operador o al Gateway)
const DIALOGUES_BY_ROLE = {
  auditorium: [
    ['En la proyección se ve clarísimo el espectro modal del pórtico.', 'Sí, anota la frecuencia natural que el profe dijo que entra en el taller.'],
    ['¿Alcanzaste puesto con conector acá abajo en el auditorio?', 'Casi no, este auditorio del CyT siempre se llena en cátedra de facultad.'],
    ['La acústica de madera de este auditorio subterráneo aísla todo el ruido de afuera.', 'Total, ni se siente cuando pasa gente por la plazoleta.']
  ],
  library: [
    ['¿Conseguiste el libro de ecuaciones diferenciales en la colección general?', 'Estaba prestado, pero descargué el artículo desde las bases del SINAB.'],
    ['Me encanta estudiar junto al vacío central de la biblioteca, entra mucha luz.', 'Sí, aunque toca hablar bajito porque hoy están preparando tesis en todas las mesas.'],
    ['¿Probaste la simulación numérica en los computadores del costado occidental?', 'Ya corrió, convergió en cuarenta iteraciones sin desbordar memoria.']
  ],
  classroom: [
    ['El parcial de Algoritmos estuvo exigente con la parte de programación dinámica.', 'Menos mal repasamos complejidad asintótica antes de subir al salón.'],
    ['¿A qué hora nos toca laboratorio después de esta clase?', 'A las cuatro, apenas salgamos subimos al quinto por un tinto rápido.'],
    ['Mira cómo planteó el tensor de esfuerzos en el tablero.', 'Tómale foto antes de que borre esa demostración.']
  ],
  it_room: [
    ['El clúster de Linux de esta sala compila muchísimo más rápido que mi portátil.', 'Obvio, tiene todos los núcleos libres y conexión cableada al nodo de red.'],
    ['Me está dando conflicto de paquetes en el entorno virtual de Python.', 'Limpia el caché y vuelve a correr el script de entrenamiento.'],
    ['El aire acondicionado del cuarto de servidores siempre está helado.', 'Mejor así, ayer los switches de distribución estaban a tope de tráfico.']
  ],
  cafeteria: [
    ['Qué buena vista del campus se tiene desde la cafetería del último piso.', 'Es el mejor parche del CyT, sobre todo acá bajo la pérgola cubierta.'],
    ['¿Pedimos dos cafés y unas empanadas mientras compilamos el informe?', 'De una, que todavía nos quedan dos horas de proyecto integrador.'],
    ['Menos mal esta parte de la terraza tiene techo, parecía que iba a llover hacia los cerros.', 'Típico clima de Bogotá: sol en la plazoleta y nubes en Monserrate.']
  ],
  terrace: [
    ['Salir a tomar aire acá en la terraza abierta despeja la mente después de cálculo.', 'Total, desde aquí se alcanza a ver toda la arboleda hacia Química e Ingeniería.'],
    ['¿Repasamos las diapositivas de la sustentación aquí afuera?', 'Dale, tú empiezas con el marco teórico y yo explico los resultados experimentales.']
  ],
  study: [
    ['Revisemos los planos del circuito antes de subir por la rampa al segundo piso.', 'Listo, ya verifiqué las tierras y el regulador de voltaje.'],
    ['¿Nos vemos en las mesas de primer piso o subimos a biblioteca?', 'Terminemos el resumen acá abajo y ahorita subimos por la rampa exterior.']
  ],
  portico: [
    ['¿Vas para las aulas del tercer piso o para el auditorio subterráneo?', 'Voy bajando al auditorio que en cinco minutos empieza el seminario.'],
    ['Qué fresco corre el viento aquí debajo de las columnas del primer piso.', 'Sí, el diseño abierto hacia la plazoleta funciona súper bien.']
  ]
};

const MILD_PHRASES = [
  '¿Sintieron ese movimiento? Se están meciendo las lámparas.',
  'Tranquilos, parece un temblor leve... aléjense de los ventanales.',
  'Sí está temblando suave, sostengan los monitores un momento.',
  'Mantengamos la calma, esperemos junto a las columnas estructurales.',
  'Cuidado cerca de la baranda del vacío de la biblioteca.',
  'Bajemos en orden por la rampa exterior por prevención.'
];

const MILD_AFTER_PHRASES = [
  'Uf, ya pasó... fue corto pero acá en los pisos altos se sintió claro.',
  'Todo en orden en el salón, ningún equipo se cayó de las mesas.',
  'Qué susto tan leve, menos mal la estructura respondió suave.',
  'Revisemos que las estanterías de libros hayan quedado firmes.'
];

const MAJOR_COVER_PHRASES = [
  '¡Está temblando fortísimo! ¡Debajo de las mesas resistentes ya!',
  '¡Cúbranse la cabeza y aléjense de los vidrios de la fachada!',
  '¡Sujétense de la estructura, se están cayendo los libros y pantallas!',
  '¡Agáchense junto a los muros portantes, no corran todavía!'
];

const CATASTROPHIC_COVER_PHRASES = [
  '¡Terremoto violento! ¡Están crujiendo las placas de concreto!',
  '¡Cúbranse junto a las columnas principales, está cayendo mampostería!',
  '¡Cúbranse la cabeza y aléjense de vidrios y objetos que caen!',
  '¡No se acerquen al borde, está colapsando parte del cielo falso!'
];

const MAJOR_EVAC_PHRASES = [
  '¡Evacúen rápido por las rampas exteriores hacia la plazoleta!',
  '¡Salgan del auditorio con calma por la escalera ancha, sin empujar!',
  '¡Bajen por la escalera oriental y las rampas, prohibido usar ascensor!',
  '¡Cuidado con los vidrios rotos en el corredor, sigan hacia afuera!'
];

const EVACUATED_PLAZA_PHRASES = [
  '¡Llegamos a la plazoleta! ¿Viste si salieron los de la sala de cómputo?',
  '¡Faltan compañeros que estaban estudiando en el tercer piso de la biblioteca!',
  '¡Alguien dijo que cayó concreto cerca de la escalera del auditorio subterráneo!',
  '¡Quédate aquí en la plazoleta lejos de las fachadas por si hay réplica!',
  '¡No veo a mi grupo de laboratorio del segundo piso, ojalá estén bien!'
];

const SKIN_TONES = ['#f5d0b5', '#eab68c', '#d69464', '#b87648', '#8d5531', '#f9dcc4'];

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function makeHexByte() {
  return Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
}

function makeRealMac(idx) {
  const oui = VENDOR_OUIS[idx % VENDOR_OUIS.length];
  return {
    mac: `${oui.prefix}:${makeHexByte()}:${makeHexByte()}:${makeHexByte()}`,
    vendor: oui.vendor
  };
}

function makeRandomizedMac() {
  const laaNibbles = ['2', '6', 'A', 'E'];
  const firstNibble = Math.floor(Math.random() * 16).toString(16).toUpperCase();
  const secondNibble = laaNibbles[Math.floor(Math.random() * laaNibbles.length)];
  return `${firstNibble}${secondNibble}:${makeHexByte()}:${makeHexByte()}:${makeHexByte()}:${makeHexByte()}:${makeHexByte()}`;
}

export class LPSBoxSimulation {
  constructor(callbacks = {}) {
    this.cb = callbacks;
    this.time = 0;

    this.challengeMode = true;
    this.targetPeopleCount = 24;
    this.macNoiseLevel = 'medium';
    this.customMagnitude = 6.9;

    this.scenario = 'normal';
    this.quakeActive = false;
    this.quakeElapsed = 0;
    this.quakeDuration = 0;
    this.quakeMagnitude = 0;
    this.collapseOccurred = false;
    this.collapsedZones = new Set();

    this.structuralCollapseStage = 0;
    this.snifferDamaged = false;
    this.snifferDamageTime = null;

    this.gatewayPoleState = 'up';
    this.gatewayHeight = GATEWAY_HEIGHT_UP;

    this.tableShockTimer = 0;
    this.shockwaves = [];

    const baseEnergy = 3.2e-5;
    this.groundAccel = { x: 0, y: 0, z: 1.0, dynamicG: 0.004 };
    this.accel = { x: 0, y: 0, z: 1.0, dynamicG: 0.004 };
    this.sta = baseEnergy;
    this.lta = baseEnergy;
    this.staLtaRatio = 1.0;
    this.staLtaThreshold = 3.0;

    this.seismoHistory = [];
    for (let i = 0; i < 200; i++) {
      this.seismoHistory.push({
        t: -3.2 + i * 0.016,
        accelG: 0.004,
        groundG: 0.004,
        ratio: 1.0,
        triggered: false,
        snifferOffline: false
      });
    }

    this.currentEventRecord = null;
    this.completedEventRecord = null;
    this._eventSampleAccum = 0;
    this._eventPostTailTimer = 0;

    this.rollingProbes = [];
    this.batchSyncTimer = 0;

    this.gatewayLeds = {
      blue: true,
      blink: false,
      yellow: false
    };
    this.blinkPulseTimer = 0;
    this.blinkRapidTimer = 0;

    this.frozenSnapshot = null;
    this.dataExtractedByOperator = false;
    this.reportSubmitted = false;
    this.lastEvaluationResult = null;
    this.showPreQuakeHologram = false;
    this.userMapPins = [];

    // Borrador interactivo de conteo por nivel (compartido entre PC y Consola VR 3D!)
    this.vrDraftGuesses = { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0 };
    this.vrPriorityZone = 'B';

    this.externalHardwareConnected = false;

    this.people = [];
    this.rfPulses = [];
    this._speechCycleTimer = 1.8;
    this._dialogueTurnIndex = 0;

    this.spawnMissionRandom(true);
  }

  logEvent(text, level = 'info') {
    if (this.cb.onLog) {
      this.cb.onLog({ time: this.time, text, level });
    }
  }

  canExtractGateway() {
    return this.gatewayPoleState === 'down';
  }

  lowerGatewayFromPole() {
    if (this.gatewayPoleState === 'down' || this.gatewayPoleState === 'lowering') return;
    this.gatewayPoleState = 'lowering';
    this.logEvent(
      '🪜 Descendiendo LPSBOX Gateway por el poste de la Plazoleta CyT (4.65 m → 1.18 m)...',
      'info'
    );
    if (this.cb.onGatewayPoleChange) this.cb.onGatewayPoleChange(this.gatewayPoleState, this.gatewayHeight);
  }

  raiseGatewayToPole() {
    if (this.gatewayPoleState === 'up' || this.gatewayPoleState === 'raising') return;
    this.gatewayPoleState = 'raising';
    this.logEvent(
      '⬆️ Asegurando LPSBOX Gateway a 4.65 m en el poste de iluminación de la Plazoleta CyT...',
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

  _startEventRecording(label, scenarioType, magnitude) {
    const tail = this.seismoHistory.slice(-84);
    const tStart = this.time;
    const preSamples = [];
    for (let i = 0; i < tail.length; i += 3) {
      const pt = tail[i];
      preSamples.push({
        tRel: Math.max(-2.5, pt.t - tStart),
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

  _pickAreaInZone(zone, index) {
    const areas = zone.areas || [];
    return areas[index % areas.length];
  }

  spawnPopulation(zoneCounts) {
    this.people = [];
    let idCounter = 1;
    const outfitPalette = [
      '#2563eb', '#e11d48', '#059669', '#d97706',
      '#7c3aed', '#0284c7', '#dc2626', '#4f46e5', '#0d9488', '#ea580c'
    ];
    const pantsPalette = ['#1e293b', '#334155', '#1f2937', '#0f172a', '#27272a'];

    ZONES.forEach((zone) => {
      const count = zoneCounts[zone.id] || 0;
      let pendingPartner = null;

      for (let i = 0; i < count; i++) {
        const { mac, vendor } = makeRealMac(idCounter);
        const area = this._pickAreaInZone(zone, Math.floor(i / 2));
        const role = area.role || 'study';
        const dialogues = DIALOGUES_BY_ROLE[role] || DIALOGUES_BY_ROLE.study;
        const pairSet = dialogues[Math.floor(i / 2) % dialogues.length];

        let x = randRange(area.xMin + 0.8, area.xMax - 0.8);
        let z = randRange(area.zMin + 0.8, area.zMax - 0.8);
        let facing = randRange(-Math.PI, Math.PI);
        let gesture = role === 'it_room' ? 'typing' : role === 'library' ? 'reading' : role === 'cafeteria' ? 'coffee' : 'notes';
        let partnerId = null;
        let lineA = pairSet[0];

        // Emparejar algunos estudiantes conversando frente a frente con gestos naturales
        if (!pendingPartner && i + 1 < count && i % 2 === 0) {
          gesture = 'talk_pair';
          facing = 0.45;
          lineA = pairSet[0];
        } else if (pendingPartner) {
          x = Math.min(area.xMax - 0.5, pendingPartner.x + 0.95);
          z = Math.min(area.zMax - 0.5, pendingPartner.z + 0.42);
          facing = Math.atan2(pendingPartner.x - x, pendingPartner.z - z);
          pendingPartner.facing = Math.atan2(x - pendingPartner.x, z - pendingPartner.z);
          gesture = 'talk_pair';
          partnerId = pendingPartner.id;
          pendingPartner.partnerId = idCounter;
          lineA = pairSet[1];
          pendingPartner = null;
        }

        const personObj = {
          id: idCounter,
          deviceHash: `CYT-${String(idCounter).padStart(2, '0')}-${mac.slice(9, 14).replace(':', '')}`,
          realMac: mac,
          currentRandomMac: makeRandomizedMac(),
          usesRandomMac: Math.random() < 0.56,
          vendor,
          channel: [1, 6, 11, 37, 38, 39][idCounter % 6],
          proto: idCounter % 3 === 0 ? 'BLE Adv' : 'WiFi 802.11 Probe',
          homeZone: zone.id,
          role,
          areaBounds: area,
          floor: zone.floor,
          currentZone: zone.id,
          x,
          y: zone.yBase,
          z,
          vx: 0,
          vz: 0,
          facing,
          targetX: x,
          targetZ: z,
          waitTimer: randRange(2.0, 6.5),
          probeTimer: randRange(0.2, 2.2),
          randomBurstTimer: randRange(1.2, 4.5),
          state: 'working',
          pose: 'stand',
          gesture,
          partnerId,
          rubblePocketId: null,
          reactionDelay: randRange(0.25, 1.15),
          coverHoldTimer: 0,
          willEvacuateMild: idCounter % 3 === 0,
          phoneOnline: true,
          basePhrase: lineA,
          phrase: lineA,
          speechVisible: idCounter <= 5,
          speechUrgency: 'normal',
          speechTimer: randRange(1.5, 4.5),
          color: outfitPalette[idCounter % outfitPalette.length],
          pantsColor: pantsPalette[idCounter % pantsPalette.length],
          skinColor: SKIN_TONES[idCounter % SKIN_TONES.length],
          hairStyle: idCounter % 4,
          hasLabCoat: role === 'it_room' && idCounter % 3 === 0,
          hasBackpack: idCounter % 2 === 0,
          walkPhase: Math.random() * Math.PI * 2,
          gesturePhase: Math.random() * Math.PI * 2,
          preQuakePos: { x, y: zone.yBase, z, zone: zone.id, floor: zone.floor }
        };

        if (gesture === 'talk_pair' && !partnerId && i + 1 < count) {
          pendingPartner = personObj;
        }

        this.people.push(personObj);
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
      this._emitProbePacket(p, false, now - randRange(0.4, 5.8));
      if (p.usesRandomMac && this.macNoiseLevel !== 'low') {
        this._emitProbePacket(p, true, now - randRange(0.3, 5.2));
      }
    });
  }

  spawnMissionRandom(silent = false) {
    const counts = {
      S: Math.floor(randRange(3, 6)),
      A: Math.floor(randRange(3, 6)),
      B: Math.floor(randRange(4, 7)),
      C: Math.floor(randRange(3, 6)),
      D: Math.floor(randRange(3, 6)),
      E: Math.floor(randRange(3, 6))
    };
    this.resetEnvironmentState(true);
    this.spawnPopulation(counts);
    if (!silent) {
      this.logEvent(
        this.challengeMode
          ? 'Nueva misión en Edificio 454 CyT UNAL: aforo real oculto. Simula un evento sísmico e inspecciona el Gateway exterior.'
          : `Edificio 454 CyT poblado con ${this.people.length} estudiantes y docentes (Auditorio -1 a Cafetería P5).`,
        'info'
      );
    }
  }

  spawnWithTotalCount(total) {
    const clamped = Math.max(6, Math.min(42, Math.round(total)));
    const weights = [0.16, 0.15, 0.2, 0.17, 0.16, 0.16];
    const counts = { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0 };
    let assigned = 0;
    ZONE_KEYS.forEach((k, idx) => {
      if (idx === ZONE_KEYS.length - 1) {
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
    this.lastEvaluationResult = null;
    this.showPreQuakeHologram = false;
    this.userMapPins = [];
    this.vrDraftGuesses = { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0 };
    this.vrPriorityZone = 'B';
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
    this.lastEvaluationResult = null;
    this.showPreQuakeHologram = false;
    this.gatewayLeds = { blue: true, blink: false, yellow: false };
    this.sta = 3.2e-5;
    this.lta = 3.2e-5;
    this.staLtaRatio = 1.0;

    this.people.forEach((p, idx) => {
      const zone = ZONES.find((z) => z.id === p.homeZone) || ZONES[1];
      const area = p.areaBounds || zone.areas[0];
      p.x = randRange(area.xMin + 0.8, area.xMax - 0.8);
      p.y = zone.yBase;
      p.z = randRange(area.zMin + 0.8, area.zMax - 0.8);
      p.targetX = p.x;
      p.targetZ = p.z;
      p.floor = zone.floor;
      p.currentZone = zone.id;
      p.state = 'working';
      p.pose = 'stand';
      p.rubblePocketId = null;
      p.phoneOnline = true;
      p.phrase = p.basePhrase;
      p.speechUrgency = 'normal';
      p.speechVisible = idx < 5;
    });

    this.rollingProbes = [];
    this._seedInitialProbes();
    if (this.cb.onPropsReset) this.cb.onPropsReset();
    this.logEvent(
      'Monitoreo sísmico normal en Edificio 454 CyT UNAL: todos los espacios operativos.',
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
          Math.abs(p.y - (ZONES.find((z) => z.id === p.homeZone)?.yBase || 0)) > 0.45
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
      this.lastEvaluationResult = null;
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

    this.people.forEach((p) => {
      const zId = this._detectZone3D(p.x, p.y, p.z) || p.homeZone;
      const zObj = ZONES.find((z) => z.id === zId) || ZONES[1];
      p.preQuakePos = { x: p.x, y: p.y, z: p.z, zone: zId, floor: zObj.floor };
      p.reactionDelay = randRange(0.2, 1.0);
      p.coverHoldTimer = type === 'catastrophic' ? randRange(1.2, 2.4) : randRange(1.8, 3.4);
    });

    if (type === 'mild') {
      this.scenario = 'mild';
      this.quakeActive = true;
      this.quakeElapsed = 0;
      this.quakeDuration = 13.5;
      this.quakeMagnitude = 4.2;
      this._startEventRecording('Sismo Leve CyT (4.2 Mw)', 'mild', 4.2);
      this.logEvent(
        '🟡 Sismo leve (4.2 Mw) detectado en Ciudad Universitaria. Monitoreando respuesta estructural del Edificio 454.',
        'warn'
      );
    } else if (type === 'major') {
      this.scenario = 'major';
      this.quakeActive = true;
      this.quakeElapsed = 0;
      this.quakeDuration = 21.5;
      this.quakeMagnitude = 6.9;
      this._startEventRecording('Terremoto Fuerte CyT (6.9 Mw)', 'major', 6.9);
      this.logEvent(
        '🔴 ¡Terremoto fuerte (6.9 Mw)! Evacuación por rampas exteriores y escaleras del Edificio CyT.',
        'crit'
      );
    } else if (type === 'catastrophic') {
      this.scenario = 'catastrophic';
      this.quakeActive = true;
      this.quakeElapsed = 0;
      this.quakeDuration = 26.5;
      this.quakeMagnitude = 7.8;
      this._startEventRecording('Colapso Severo CyT (7.8 Mw)', 'catastrophic', 7.8);
      this.logEvent(
        '🟣 ¡Terremoto catastrófico (7.8 Mw)! Riesgo de colapso parcial, personas atrapadas bajo escombros y daño del Sniffer.',
        'crit'
      );
    } else {
      const mag = customMag ?? this.customMagnitude;
      this.scenario = mag >= 7.3 ? 'catastrophic' : mag >= 5.5 ? 'major' : 'mild';
      this.quakeActive = true;
      this.quakeElapsed = 0;
      this.quakeDuration = this.scenario === 'catastrophic' ? 26.0 : this.scenario === 'major' ? 21.0 : 13.0;
      this.quakeMagnitude = mag;
      this._startEventRecording(`Evento Sísmico (${mag.toFixed(1)} Mw)`, this.scenario, mag);
      this.logEvent(`Evento sísmico manual iniciado (${mag.toFixed(1)} Mw).`, mag >= 5.5 ? 'crit' : 'warn');
    }

    if (this.cb.onScenarioChange) this.cb.onScenarioChange(this.scenario);
  }

  triggerPhysicalTableHit() {
    if (this.snifferDamaged) {
      this.logEvent(
        '⚠️ El Sniffer RPi5 del salón 203 está sepultado bajo escombros y sin alimentación.',
        'warn'
      );
      return;
    }

    this.tableShockTimer = 0.55;
    this.blinkRapidTimer = 1.6;
    if (!this.quakeActive && !this.currentEventRecord) {
      this.quakeDuration = 2.2;
      this._startEventRecording(' Estímulo Mecánico MPU6050', 'hit', 3.1);
      this._eventPostTailTimer = 2.2;
    }

    this.shockwaves.push({
      x: SNIFFER_WORLD_POS.x,
      y: SNIFFER_WORLD_POS.y - 1.0,
      z: SNIFFER_WORLD_POS.z + 1.5,
      radius: 0.3,
      maxRadius: 22.0,
      color: '#38bdf8',
      alpha: 0.92
    });
    this.shockwaves.push({
      x: POLE_WORLD_POS.x,
      y: 0.14,
      z: POLE_WORLD_POS.z,
      radius: 0.3,
      maxRadius: 15.0,
      color: '#a855f7',
      alpha: 0.82
    });

    this.people.forEach((p, idx) => {
      if (p.phoneOnline) this._emitProbePacket(p, false, this.time);
      if (!this.quakeActive && idx % 5 === 0 && p.state === 'working' && p.homeZone === 'B') {
        p.phrase = '¿Sintieron ese golpe seco en la mesa de instrumentación del 203?';
        p.speechUrgency = 'mild';
        p.speechVisible = true;
        p.speechTimer = 3.0;
      }
    });

    this.logEvent('🟠 Impacto local registrado por el acelerómetro MPU6050 en el Laboratorio TI 203.', 'warn');
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
      const clamped = Math.max(6, Math.min(42, Math.round(payload.phone_count)));
      if (clamped !== this.people.length) {
        this.spawnWithTotalCount(clamped);
      }
    }
    this.blinkRapidTimer = 0.8;
  }

  _detectZone3D(x, y, z) {
    if (y > -1.2 && z > 10.6 && x > -11.5) return 'EXT';
    let bestZone = ZONES[1];
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
      const dist = Math.max(1.0, Math.hypot(dx, dy, dz));
      const floorDiff = Math.abs(y - zone.yBase) / FLOOR_HEIGHT;
      const slabAttenuation = floorDiff * 13.0;
      const noise = randRange(-1.8, 1.8);
      rssiMap[zone.id] = Math.round(-35 - 19.0 * Math.log10(dist) - slabAttenuation + noise);
    });
    return rssiMap;
  }

  _emitProbePacket(person, isRandomBurst = false, customTime = null) {
    if (this.snifferDamaged && customTime === null) return;

    const ts = customTime !== null ? customTime : this.time;
    const rssiByZone = this._computeRssiByZone(person.x, person.y, person.z);

    let bestZone = person.homeZone || 'B';
    let bestRssi = -999;
    for (const [zid, val] of Object.entries(rssiByZone)) {
      if (val > bestRssi) {
        bestRssi = val;
        bestZone = zid;
      }
    }

    const estZoneObj = ZONES.find((z) => z.id === bestZone) || ZONES[1];
    const macShown = isRandomBurst
      ? makeRandomizedMac()
      : (person.usesRandomMac ? person.currentRandomMac : person.realMac);
    const isLaaRandom = isRandomBurst || person.usesRandomMac;

    this.rollingProbes.push({
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
      estX: person.x + randRange(-0.4, 0.4),
      estY: estZoneObj.yBase,
      estZ: person.z + randRange(-0.4, 0.4)
    });

    if (customTime === null && this.rfPulses.length < 28) {
      this.rfPulses.push({
        x: person.x,
        y: person.y + 0.08,
        z: person.z,
        radius: 0.15,
        maxRadius: 2.0,
        alpha: 0.8,
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
        this._emitProbePacket(p, false, this.time - randRange(0.1, 1.6));
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

    const groundTruthByZone = { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0 };
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

    const snifferZoneCounts = { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0 };
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

    // Pre-cargar borrador inicial VR en ceros (o auto-llenado cuando el usuario pulse "Auto-Cargar Filtro MAC")
    ZONE_KEYS.forEach((k) => {
      this.vrDraftGuesses[k] = snifferZoneCounts[k] || 0;
    });

    if (this.currentEventRecord && this.currentEventRecord.triggerRelTime === null) {
      this.currentEventRecord.triggerRelTime = Math.max(0.05, this.time - this.currentEventRecord.startTime);
    }

    this.gatewayLeds.blue = false;
    this.gatewayLeds.yellow = true;
    this.blinkRapidTimer = 4.0;

    this.shockwaves.push({
      x: SNIFFER_WORLD_POS.x,
      y: 0.14,
      z: SNIFFER_WORLD_POS.z + 2.0,
      radius: 0.4,
      maxRadius: 28.0,
      color: this.scenario === 'catastrophic' ? '#a855f7' : this.scenario === 'major' ? '#ef4444' : '#f59e0b',
      alpha: 0.92
    });

    this.logEvent(
      `📡 [Sniffer RPi5 → Poste Plazoleta] STA/LTA = ${this.staLtaRatio.toFixed(2)} ≥ 3.0. Snapshot Pre-Sismo (t₀) recibido en el Gateway exterior (LED Amarillo ON).`,
      this.scenario === 'mild' ? 'warn' : 'crit'
    );

    if (this.cb.onSnapshotCaptured) {
      this.cb.onSnapshotCaptured(this.frozenSnapshot);
    }
  }

  _assignPersonToRubblePocket(person, pocket) {
    person.state = 'trapped';
    person.pose = 'pinned_rubble';
    person.gesture = 'pinned_rubble';
    person.rubblePocketId = pocket.id;
    person.currentZone = pocket.zone;
    person.x = pocket.x + randRange(-0.28, 0.28);
    person.y = pocket.y;
    person.z = pocket.z + randRange(-0.25, 0.25);
    person.targetX = person.x;
    person.targetZ = person.z;
    person.phoneOnline = Math.random() < 0.3;
    person.phrase = pocket.phrase;
    person.speechUrgency = 'trapped';
    person.speechVisible = true;
  }

  _triggerInteriorCollapse() {
    if (this.collapseOccurred) return;
    this.collapseOccurred = true;

    const targetPockets = [RUBBLE_POCKETS[1], RUBBLE_POCKETS[2]]; // Salón 202 + Biblioteca P3
    targetPockets.forEach((pk) => this.collapsedZones.add(pk.zone));

    if (this.currentEventRecord && this.currentEventRecord.collapseRelTime === null) {
      this.currentEventRecord.collapseRelTime = Math.max(0.2, this.time - this.currentEventRecord.startTime);
    }

    let trappedCount = 0;
    targetPockets.forEach((pocket) => {
      const candidate = this.people.find(
        (p) => p.homeZone === pocket.zone && p.state !== 'trapped' && p.state !== 'evacuated'
      );
      if (candidate) {
        this._assignPersonToRubblePocket(candidate, pocket);
        trappedCount++;
      }
    });

    if (trappedCount > 0 && this.cb.onNpcVocalAlert) {
      this.cb.onNpcVocalAlert('trapped', 1);
    }

    this.logEvent(
      `💥 Caída de cielo raso y estanterías en Piso 2 y Biblioteca Piso 3 (${trappedCount} personas atrapadas bajo escombros).`,
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
      [RUBBLE_POCKETS[2], RUBBLE_POCKETS[3]].forEach((pk) => {
        this.collapsedZones.add(pk.zone);
        const victims = this.people.filter((p) => p.homeZone === pk.zone && p.state !== 'trapped').slice(0, 2);
        victims.forEach((v) => this._assignPersonToRubblePocket(v, pk));
      });
      if (this.currentEventRecord && this.currentEventRecord.collapseRelTime === null) {
        this.currentEventRecord.collapseRelTime = Math.max(0.2, this.time - this.currentEventRecord.startTime);
      }
      if (this.cb.onNpcVocalAlert) this.cb.onNpcVocalAlert('catastrophic', 2);

      this.logEvent(
        '💥 [COLAPSO FASE 1] Fractura de losas en Sala Cómputo 401 (P4) y Biblioteca Nivel 2 (P3): ocupantes atrapados bajo concreto.',
        'crit'
      );
      if (this.cb.onStructuralCollapseStage) this.cb.onStructuralCollapseStage(1);
      if (this.cb.onCollapse) this.cb.onCollapse(Array.from(this.collapsedZones));
    } else if (stage === 2) {
      // Fase 2: Colapso sobre Lab TI 203 -> sepulta el Sniffer RPi5 y atrapa ocupantes en Piso 2!
      this.collapsedZones.add('B');
      this.snifferDamaged = true;
      this.snifferDamageTime = this.time;
      if (this.currentEventRecord) {
        this.currentEventRecord.snifferDamagedRelTime = Math.max(0.5, this.time - this.currentEventRecord.startTime);
      }

      [RUBBLE_POCKETS[0], RUBBLE_POCKETS[1]].forEach((pk) => {
        const victim = this.people.find((p) => p.homeZone === 'B' && p.state !== 'trapped' && p.state !== 'evacuated');
        if (victim) this._assignPersonToRubblePocket(victim, pk);
      });

      if (this.cb.onNpcVocalAlert) this.cb.onNpcVocalAlert('trapped', 3);

      this.logEvent(
        '⚡💥 [SNIFFER RPi5 SEPULTADO] Viga colapsada en Salón TI 203 dañó el Sniffer interior; el snapshot t₀ permanece a salvo en el Gateway del poste exterior.',
        'crit'
      );
      if (this.cb.onSnifferDamaged) this.cb.onSnifferDamaged();
      if (this.cb.onStructuralCollapseStage) this.cb.onStructuralCollapseStage(2);
      if (this.cb.onCollapse) this.cb.onCollapse(Array.from(this.collapsedZones));
    } else if (stage === 3) {
      // Fase 3: Derrumbe parcial en acceso al Auditorio Subterráneo (-1)
      this.collapsedZones.add('S');
      const audPocket = RUBBLE_POCKETS[4];
      const audVictims = this.people.filter((p) => p.homeZone === 'S' && p.state !== 'trapped' && p.state !== 'evacuated').slice(0, 2);
      audVictims.forEach((v) => this._assignPersonToRubblePocket(v, audPocket));

      const totalTrapped = this.people.filter((p) => p.state === 'trapped').length;
      if (this.cb.onNpcVocalAlert) this.cb.onNpcVocalAlert('trapped', 4);

      this.logEvent(
        `🧱 [COLAPSO FASE 3] Escombros en acceso al Auditorio Subterráneo (-1): ${totalTrapped} personas atrapadas bajo escombros en el Edificio CyT.`,
        'crit'
      );
      if (this.cb.onStructuralCollapseStage) this.cb.onStructuralCollapseStage(3);
      if (this.cb.onCollapse) this.cb.onCollapse(Array.from(this.collapsedZones));
    }
  }

  update(dt) {
    const clampedDt = Math.min(dt, 0.05);
    this.time += clampedDt;

    // 0. Pole Gateway Hoist
    if (this.gatewayPoleState === 'lowering') {
      this.gatewayHeight = Math.max(GATEWAY_HEIGHT_DOWN, this.gatewayHeight - clampedDt * 2.5);
      if (this.gatewayHeight <= GATEWAY_HEIGHT_DOWN + 0.005) {
        this.gatewayHeight = GATEWAY_HEIGHT_DOWN;
        this.gatewayPoleState = 'down';
        this.logEvent(
          '✅ LPSBOX Gateway a nivel de operario (1.18 m). Puerto USB-C habilitado en PC y en Realidad Virtual.',
          'ok'
        );
        if (this.cb.onGatewayPoleChange) this.cb.onGatewayPoleChange('down', this.gatewayHeight);
      }
    } else if (this.gatewayPoleState === 'raising') {
      this.gatewayHeight = Math.min(GATEWAY_HEIGHT_UP, this.gatewayHeight + clampedDt * 2.5);
      if (this.gatewayHeight >= GATEWAY_HEIGHT_UP - 0.005) {
        this.gatewayHeight = GATEWAY_HEIGHT_UP;
        this.gatewayPoleState = 'up';
        this.logEvent('🔒 LPSBOX Gateway izado a 4.65 m en el poste de la Plazoleta CyT.', 'info');
        if (this.cb.onGatewayPoleChange) this.cb.onGatewayPoleChange('up', this.gatewayHeight);
      }
    }

    // 1. Ground Seismic Waveform
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
          const pEnv = t < 2.5 ? Math.sin((t / 2.5) * Math.PI) * 0.26 : 0;
          const sPulse1 = t >= 1.8 ? Math.exp(-Math.pow((t - 5.0) / 2.5, 2)) * 1.02 : 0;
          const sPulse2 = t >= 4.8 ? Math.exp(-Math.pow((t - 9.0) / 2.9, 2)) * 1.15 : 0;
          const sPulse3 = t >= 8.8 ? Math.exp(-Math.pow((t - 14.2) / 2.8, 2)) * 0.85 : 0;
          const replica = t >= 16.5 ? Math.exp(-Math.pow((t - 19.8) / 2.1, 2)) * 0.50 : 0;
          const coda = t >= 17.5 ? Math.max(0, (1 - (t - 17.5) / 9.0)) * 0.14 : 0;
          const mod = 0.72 + 0.28 * Math.sin(t * 10.4) + 0.54 * Math.random();
          envAccel += (pEnv + sPulse1 + sPulse2 + sPulse3 + replica + coda) * mod;

          if (t >= 4.0 && this.structuralCollapseStage < 1) {
            this._advanceCatastrophicStage(1);
          }
          if (t >= 7.2 && this.structuralCollapseStage < 2) {
            if (!this.frozenSnapshot) this._capturePreQuakeSnapshot();
            this._advanceCatastrophicStage(2);
          }
          if (t >= 10.4 && this.structuralCollapseStage < 3) {
            this._advanceCatastrophicStage(3);
          }
        } else {
          const magScale = Math.max(0.55, (this.quakeMagnitude - 4.5) / 2.4);
          const pEnv = t < 2.8 ? Math.sin((t / 2.8) * Math.PI) * 0.15 * magScale : 0;
          const sPulse1 = t >= 2.0 ? Math.exp(-Math.pow((t - 5.4) / 2.7, 2)) * 0.68 * magScale : 0;
          const sPulse2 = t >= 5.5 ? Math.exp(-Math.pow((t - 10.2) / 2.8, 2)) * 0.62 * magScale : 0;
          const sPulse3 = t >= 10.0 ? Math.exp(-Math.pow((t - 14.2) / 2.4, 2)) * 0.44 * magScale : 0;
          const replica = t >= 15.0 ? Math.exp(-Math.pow((t - 17.6) / 1.7, 2)) * 0.26 * magScale : 0;
          const coda = t >= 14.0 ? Math.max(0, (1 - (t - 14.0) / 7.5)) * 0.08 * magScale : 0;
          const mod = 0.68 + 0.25 * Math.sin(t * 9.2) + 0.52 * Math.random();
          envAccel += (pEnv + sPulse1 + sPulse2 + sPulse3 + replica + coda) * mod;

          if (t >= 3.4 && !this.collapseOccurred) {
            this._triggerInteriorCollapse();
          }
        }
      } else {
        this.quakeActive = false;
        this._eventPostTailTimer = 2.5;
        if (this.cb.onQuakeEnded) this.cb.onQuakeEnded({ scenario: this.scenario, magnitude: this.quakeMagnitude });
        this.logEvent(
          this.snifferDamaged
            ? '📉 Sismo finalizado. Sniffer sepultado en Salón 203; datos pre-sismo t₀ listos en el Gateway de la Plazoleta.'
            : '📉 Movimiento sísmico finalizado. Sismograma completo y datos t₀ disponibles en el Gateway.',
          'info'
        );
      }
    }

    if (this.tableShockTimer > 0 && !this.snifferDamaged) {
      this.tableShockTimer -= clampedDt;
      envAccel += 0.44 * Math.max(0, this.tableShockTimer / 0.55);
    }

    const freq = this.scenario === 'catastrophic' ? 20.5 : this.scenario === 'major' ? 18.5 : 12.5;
    this.groundAccel.dynamicG = envAccel;
    this.groundAccel.x = Math.sin(this.time * freq) * envAccel;
    this.groundAccel.y = Math.cos(this.time * (freq * 1.23)) * envAccel * 0.85;
    this.groundAccel.z = 1.0 + Math.sin(this.time * (freq * 1.67)) * envAccel * 0.6;

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

    this.seismoHistory.push({
      t: this.time,
      accelG: this.snifferDamaged ? 0 : envAccel,
      groundG: envAccel,
      ratio: this.staLtaRatio,
      triggered: !this.snifferDamaged && this.staLtaRatio >= this.staLtaThreshold,
      snifferOffline: this.snifferDamaged
    });
    if (this.seismoHistory.length > 220) {
      this.seismoHistory.shift();
    }

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

    this._updatePeople(clampedDt);

    const cutoff = this.time - 10.0;
    while (this.rollingProbes.length > 0 && this.rollingProbes[0].timestamp < cutoff) {
      this.rollingProbes.shift();
    }

    if (!this.snifferDamaged) {
      this.batchSyncTimer += clampedDt;
      if (this.batchSyncTimer >= 3.4) {
        this.batchSyncTimer = 0;
        this.blinkPulseTimer = 0.5;
        if (this.cb.onPacketHeartbeat) this.cb.onPacketHeartbeat();
      }
    }

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

    for (let i = this.rfPulses.length - 1; i >= 0; i--) {
      const p = this.rfPulses[i];
      p.radius += clampedDt * 2.5;
      p.alpha -= clampedDt * 0.95;
      if (p.alpha <= 0 || p.radius >= p.maxRadius) this.rfPulses.splice(i, 1);
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.radius += clampedDt * 14.0;
      sw.alpha -= clampedDt * 0.62;
      if (sw.alpha <= 0 || sw.radius >= sw.maxRadius) this.shockwaves.splice(i, 1);
    }
  }

  _updatePeople(dt) {
    const noiseMultiplier = this.macNoiseLevel === 'high' ? 1.8 : this.macNoiseLevel === 'medium' ? 1.0 : 0.25;
    const isSevere = this.scenario === 'major' || this.scenario === 'catastrophic';

    // Rotar globos de conversación inteligente + disparar gritos/golpes no verbales cuando aplica
    this._speechCycleTimer -= dt;
    if (this._speechCycleTimer <= 0) {
      this._speechCycleTimer = this.quakeActive ? 1.55 : 3.4;
      this._dialogueTurnIndex++;
      const maxVisible = this.quakeActive ? 7 : 5;
      const candidates = [...this.people].sort(() => Math.random() - 0.5);
      let shown = 0;
      let alertUrgency = null;
      let alertSeed = 0;

      // Mantener conversaciones de pareja alternando pregunta y respuesta en modo normal
      if (!this.quakeActive && this.scenario === 'normal') {
        this.people.forEach((p) => { p.speechVisible = false; });
        for (const p of candidates) {
          if (shown >= maxVisible) break;
          if (p.partnerId) {
            const partner = this.people.find((x) => x.id === p.partnerId);
            const speaker = this._dialogueTurnIndex % 2 === 0 ? p : (partner || p);
            speaker.speechVisible = true;
            speaker.phrase = speaker.basePhrase;
            speaker.speechUrgency = 'normal';
            shown++;
          } else if (Math.random() < 0.45) {
            p.speechVisible = true;
            p.phrase = p.basePhrase;
            p.speechUrgency = 'normal';
            shown++;
          }
        }
      } else {
        candidates.forEach((p) => {
          if (p.state === 'trapped' && shown < maxVisible) {
            p.speechVisible = true;
            p.speechUrgency = 'trapped';
            if (!alertUrgency) {
              alertUrgency = 'trapped';
              alertSeed = p.id;
            }
            shown++;
          } else if (shown < maxVisible && Math.random() < (this.quakeActive ? 0.78 : 0.45)) {
            p.speechVisible = true;
            if (this.quakeActive && !alertUrgency && (p.speechUrgency === 'major' || p.speechUrgency === 'catastrophic' || p.speechUrgency === 'mild')) {
              alertUrgency = p.speechUrgency;
              alertSeed = p.id;
            }
            shown++;
          } else {
            p.speechVisible = false;
          }
        });

        if (alertUrgency && this.cb.onNpcVocalAlert) {
          this.cb.onNpcVocalAlert(alertUrgency, alertSeed);
        }
      }
    }

    this.people.forEach((p) => {
      const homeZone = ZONES.find((z) => z.id === p.homeZone) || ZONES[1];
      p.gesturePhase += dt * (this.quakeActive ? 5.5 : 2.3);

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
              p.targetX = cover.x;
              p.targetZ = cover.z;
              p.phrase = MILD_PHRASES[p.id % MILD_PHRASES.length];
              p.speechUrgency = 'mild';
            } else {
              p.state = 'mild_react';
              p.pose = 'look_up';
              p.phrase = MILD_PHRASES[(p.id + 2) % MILD_PHRASES.length];
              p.speechUrgency = 'mild';
            }
          }
        } else if (isSevere) {
          if (p.state === 'working' || p.state === 'mild_react' || p.state === 'crouching') {
            p.state = 'duck_cover';
            p.pose = 'cover_head';
            const cover = homeZone.coverSpots[p.id % homeZone.coverSpots.length];
            p.targetX = cover.x;
            p.targetZ = cover.z;
            const pool = this.scenario === 'catastrophic' ? CATASTROPHIC_COVER_PHRASES : MAJOR_COVER_PHRASES;
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

      // Movimiento por los espacios reales del Edificio 454 CyT (Rampas Exteriores, Escalera Oriental y Escalera Auditorio)
      let speed = 0.95;
      if (p.state === 'working') {
        p.pose = 'stand';
        if (p.gesture !== 'talk_pair') {
          p.waitTimer -= dt;
          if (p.waitTimer <= 0) {
            const area = p.areaBounds || homeZone.areas[0];
            p.targetX = randRange(area.xMin + 0.8, area.xMax - 0.8);
            p.targetZ = randRange(area.zMin + 0.8, area.zMax - 0.8);
            p.waitTimer = randRange(3.5, 8.0);
          }
        }
      } else if (p.state === 'mild_react') {
        speed = 0.2;
        p.pose = 'look_up';
      } else if (p.state === 'crouching') {
        speed = 1.65;
        p.pose = 'crouch';
      } else if (p.state === 'duck_cover') {
        speed = 2.35;
        p.pose = 'cover_head';
      } else if (p.state === 'evacuating_calm' || p.state === 'evacuating_panic') {
        const isPanic = p.state === 'evacuating_panic';
        speed = isPanic ? 3.5 : 1.9;
        p.pose = isPanic ? 'run' : 'stand';

        if (p.y < -0.1) {
          // Sótano Auditorio (-3.40 m) -> subir por escalera ancha junto a entrada principal (x = -3.6, z: 3.2 -> -1.5)
          if (Math.hypot(p.x - (-3.6), p.z - 3.0) > 1.3 && p.y < -3.0) {
            p.targetX = -3.6 + ((p.id % 3) - 1) * 0.35;
            p.targetZ = 3.0;
          } else {
            p.y = Math.min(0.12, p.y + (isPanic ? 2.1 : 1.3) * dt);
            const prog = (p.y - (-3.4)) / 3.52;
            p.targetX = -3.6 + ((p.id % 3) - 1) * 0.35;
            p.targetZ = 3.0 - prog * 3.8;
          }
        } else if (p.y > 0.28) {
          // Pisos superiores (P2..P5): Ala Oeste baja por Rampas Exteriores (x = -11.1), Ala Norte por Escalera Oriental (x = 15.8)
          const useWestRamp = p.x < -3.5 && p.y <= 10.6;
          if (useWestRamp) {
            if (p.x < -11.8) {
              p.targetX = -11.1;
              p.targetZ = p.z;
            } else {
              p.y = Math.max(0.12, p.y - (isPanic ? 2.2 : 1.35) * dt);
              const levelFloat = (p.y - 0.12) / FLOOR_HEIGHT;
              const seg = Math.floor(levelFloat);
              const frac = levelFloat - seg;
              p.targetX = -11.1 + ((p.id % 2) - 0.5) * 0.45;
              p.targetZ = seg % 2 === 0 ? 8.5 - frac * 16.5 : -8.0 + frac * 16.5;
            }
          } else {
            // Ir por el corredor exterior del Ala Norte hacia la Escalera Oriental (x = 15.8, z = -3.5)
            if (p.x < 14.8) {
              p.targetX = 15.6;
              p.targetZ = -3.5 + ((p.id % 3) - 1) * 0.25;
            } else {
              p.y = Math.max(0.12, p.y - (isPanic ? 2.45 : 1.45) * dt);
              const frac = ((p.y - 0.12) % FLOOR_HEIGHT) / FLOOR_HEIGHT;
              p.targetX = 15.8 + (frac > 0.5 ? 0.55 : -0.45);
              p.targetZ = -9.5 + Math.abs(frac - 0.5) * 11.0;
            }
          }
        } else {
          // Nivel Plazoleta (y = 0.12 m) -> dirigirse al Punto de Encuentro en la Plazoleta CyT
          p.y = 0.12;
          if (p.z < 2.0) {
            p.targetX = p.x > 6 ? 12.5 : -2.5;
            p.targetZ = 4.5;
          } else {
            const angle = (p.id * 1.37) % (Math.PI * 2);
            const rad = 0.8 + (p.id % 5) * 0.68;
            p.targetX = ASSEMBLY_POINT.x + Math.cos(angle) * rad;
            p.targetZ = ASSEMBLY_POINT.z + Math.sin(angle) * rad;
            if (Math.hypot(p.x - p.targetX, p.z - p.targetZ) < 0.6) {
              p.state = 'evacuated';
              p.pose = 'stand';
              p.phrase = EVACUATED_PLAZA_PHRASES[p.id % EVACUATED_PLAZA_PHRASES.length];
              p.speechUrgency = 'safe';
            }
          }
        }
      } else if (p.state === 'trapped') {
        speed = 0;
        p.pose = 'pinned_rubble';
      } else if (p.state === 'evacuated') {
        speed = 0.45;
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
        p.walkPhase += dt * speed * 4.6;
      } else {
        p.vx = 0;
        p.vz = 0;
        if (p.state === 'evacuated') {
          p.facing = Math.atan2(-2.0 - p.x, -4.0 - p.z);
        }
      }

      p.currentZone = this._detectZone3D(p.x, p.y, p.z) || p.currentZone;
      const zMatch = ZONES.find((z) => z.id === p.currentZone);
      if (zMatch) p.floor = zMatch.floor;

      if (p.phoneOnline && !this.snifferDamaged) {
        p.probeTimer -= dt;
        if (p.probeTimer <= 0) {
          p.probeTimer = randRange(2.2, 4.4);
          this._emitProbePacket(p, false);
        }
        if (p.usesRandomMac && noiseMultiplier > 0.3) {
          p.randomBurstTimer -= dt * noiseMultiplier;
          if (p.randomBurstTimer <= 0) {
            p.randomBurstTimer = randRange(3.4, 6.8);
            this._emitProbePacket(p, true);
          }
        }
      }
    });
  }

  getPostQuakeZoneStatus() {
    const postInside = { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0, evacuated: 0, trapped: 0, trappedByZone: { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0 } };
    this.people.forEach((p) => {
      if (p.state === 'evacuated' || (p.y > -0.5 && p.z > 10.6 && p.x > -11.5)) {
        postInside.evacuated++;
      } else {
        if (postInside[p.currentZone] !== undefined) postInside[p.currentZone]++;
        if (p.state === 'trapped') {
          postInside.trapped++;
          if (postInside.trappedByZone[p.currentZone] !== undefined) {
            postInside.trappedByZone[p.currentZone]++;
          }
        }
      }
    });
    return postInside;
  }

  _findBestPriorityZone() {
    const snap = this.frozenSnapshot;
    const truthZones = snap
      ? snap.groundTruthByZone
      : ZONES.reduce((acc, z) => {
          acc[z.id] = this.people.filter((p) => p.homeZone === z.id).length;
          return acc;
        }, {});

    let bestZone = 'B';
    let bestMetric = -1;
    ZONE_KEYS.forEach((zid) => {
      const trappedHere = this.people.filter((p) => p.state === 'trapped' && p.currentZone === zid).length;
      const metric = trappedHere > 0 ? 100 + trappedHere * 15 + (truthZones[zid] || 0) : (truthZones[zid] || 0);
      if (metric > bestMetric) {
        bestMetric = metric;
        bestZone = zid;
      }
    });
    return bestZone;
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
    const totalPoints = Math.max(0, 40 - totalError * 7);

    let zoneErrorSum = 0;
    const zoneDetails = {};
    const trappedByZone = {};
    ZONE_KEYS.forEach((zid) => {
      const zObj = ZONES.find((z) => z.id === zid);
      const g = Number(zoneGuesses[zid] || 0);
      const t = truthZones[zid] || 0;
      const err = Math.abs(g - t);
      zoneErrorSum += err;
      const trappedHere = this.people.filter((p) => p.state === 'trapped' && p.currentZone === zid).length;
      trappedByZone[zid] = trappedHere;
      zoneDetails[zid] = {
        code: zObj ? zObj.code : zid,
        guess: g,
        truth: t,
        trapped: trappedHere,
        exact: err === 0
      };
    });
    const zonePoints = Math.max(0, Math.round(45 - zoneErrorSum * 4.5));

    const bestZone = this._findBestPriorityZone();
    const bestZoneCode = ZONES.find((z) => z.id === bestZone)?.code || bestZone;
    const priorityCorrect =
      priorityZoneGuess === bestZone ||
      (trappedByZone[bestZone] > 0 && trappedByZone[priorityZoneGuess] > 0) ||
      (trappedByZone[bestZone] === 0 && truthZones[priorityZoneGuess] === truthZones[bestZone]);
    const priorityPoints = priorityCorrect ? 15 : 5;

    const finalScore = Math.min(100, totalPoints + zonePoints + priorityPoints);
    const usedUnfilteredRaw =
      snap && totalError > 0 && Math.abs(totalGuess - snap.rawPacketCount) <= 1 && snap.rawPacketCount > truthTotal;

    this.reportSubmitted = true;
    this.showPreQuakeHologram = true;

    const result = {
      score: finalScore,
      truthTotal,
      totalGuess,
      totalError,
      trappedTotal: this.people.filter((p) => p.state === 'trapped').length,
      zoneDetails,
      bestPriorityZone: bestZone,
      bestPriorityZoneCode: bestZoneCode,
      priorityCorrect,
      usedUnfilteredRaw,
      rawPacketCount: snap ? snap.rawPacketCount : truthTotal
    };
    this.lastEvaluationResult = result;
    return result;
  }
}

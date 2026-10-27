// js/main.js — Controlador principal UI + WebXR + Consola Gateway en Poste + Sismograma Completo Persistente

import { FLOOR_HEIGHT, ZONES, LPSBoxSimulation } from './simulation.js';
import { LPSBoxScene3D } from './scene3d.js';
import { SoundEngine } from './audio.js';
import { StlCadInspector } from './stlViewer.js';

// ================= 0. REFERENCIAS DOM Y ESTADO GLOBAL (DECLARADOS ANTES DE INICIALIZAR) =================
const canvasContainer = document.getElementById('sim-canvas-wrap');
const startOverlay = document.getElementById('start-experience-overlay');
const btnStartExperience = document.getElementById('btn-start-experience');
const btnStartMild = document.getElementById('btn-start-mild');
const btnStartMajor = document.getElementById('btn-start-major');
const startStlStatus = document.getElementById('start-stl-status');

const stlBanner = document.getElementById('stl-loading-banner');
const stlText = document.getElementById('stl-loading-text');

const navTabs = document.querySelectorAll('.nav-tab');
const simHud = document.getElementById('sim-hud');
const bottomTicker = document.getElementById('bottom-ticker');
const viewConsole = document.getElementById('view-console');
const viewDocs = document.getElementById('view-docs');
const viewGallery = document.getElementById('view-gallery');

const tickerLog = document.getElementById('ticker-log');
const tickerClock = document.getElementById('ticker-clock');

const btnAudio = document.getElementById('btn-audio');
const btnXr = document.getElementById('btn-xr');

const btnScNormal = document.getElementById('btn-sc-normal');
const btnScMild = document.getElementById('btn-sc-mild');
const btnScMajor = document.getElementById('btn-sc-major');
const btnScHit = document.getElementById('btn-sc-hit');

const pillChallenge = document.getElementById('pill-challenge');
const pillSandbox = document.getElementById('pill-sandbox');
const sandboxControls = document.getElementById('sandbox-controls');
const sliderPeople = document.getElementById('slider-people');
const valPeople = document.getElementById('val-people');
const sliderMag = document.getElementById('slider-mag');
const valMag = document.getElementById('val-mag');
const selectNoise = document.getElementById('select-mac-noise');
const valNoise = document.getElementById('val-noise');

const camButtons = document.querySelectorAll('.cam-btn');
const chkMrVision = document.getElementById('chk-mr-vision');

const elLedBlue = document.getElementById('led-blue');
const elLedBlink = document.getElementById('led-blink');
const elLedYellow = document.getElementById('led-yellow');
const elNavDot = document.getElementById('nav-gateway-dot');
const elBtnExtract = document.getElementById('btn-extract-gateway');
const elBtnToggleHolo = document.getElementById('btn-toggle-holo');

const elPoleHeightVal = document.getElementById('pole-height-val');
const elPoleStatePill = document.getElementById('pole-state-pill');
const elBtnLowerPole = document.getElementById('btn-lower-pole');
const elConsolePoleLock = document.getElementById('console-pole-lock');
const elBtnConsoleLowerPole = document.getElementById('btn-console-lower-pole');

const elOledBox = document.getElementById('hud-sniffer-oled');
const elOledSta = document.getElementById('oled-sta');
const elOledTitle = document.getElementById('oled-title');
const elOledSub = document.getElementById('oled-sub');
const elStatAccel = document.getElementById('stat-accel');
const elStatStaLta = document.getElementById('stat-stalta');

const btnSeismoEvent = document.getElementById('btn-seismo-event');
const btnSeismoLive = document.getElementById('btn-seismo-live');
const btnConsoleSeismoEvent = document.getElementById('btn-console-seismo-event');
const btnConsoleSeismoLive = document.getElementById('btn-console-seismo-live');
const elHudSeismoTag = document.getElementById('hud-seismo-tag');
const elSeismoHoverReadout = document.getElementById('seismo-hover-readout');

const miniSeismoCanvas = document.getElementById('mini-seismo-canvas');
const miniSeismoCtx = miniSeismoCanvas ? miniSeismoCanvas.getContext('2d') : null;
const fullSeismoCanvas = document.getElementById('full-seismo-canvas');
const fullSeismoCtx = fullSeismoCanvas ? fullSeismoCanvas.getContext('2d') : null;

const chkMacFilter = document.getElementById('chk-mac-filter');
const rssiCanvas = document.getElementById('rssi-map-canvas');
const rssiCtx = rssiCanvas ? rssiCanvas.getContext('2d') : null;

const zoneInputs = ['a', 'b', 'c', 'd'].map((k) => document.getElementById(`inp-zone-${k}`));
const zoneSumHelper = document.getElementById('zone-sum-helper');
const lightbox = document.getElementById('img-lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const wsInput = document.getElementById('ws-url-input');
const wsBtn = document.getElementById('btn-ws-connect');
const wsStatus = document.getElementById('ws-status');

let activeView = 'sim';
let experienceStarted = false;
let xrSession = null;
let wsClient = null;
let consoleRefreshTimer = 0;

// Seismogram display mode: 'live' | 'event' (auto-switches to 'event' when a quake/hit occurs!)
let seismoViewMode = 'live';
let seismoHoverNormX = null; // 0..1 when hovering full-seismo-canvas

function appendLogEntry({ time, text, level }) {
  if (!tickerLog) return;
  const div = document.createElement('div');
  div.className = `ticker-entry ${level || 'info'}`;
  div.innerHTML = `<span class="ts">[${time.toFixed(1)}s]</span>${text}`;
  tickerLog.prepend(div);
  while (tickerLog.children.length > 28) {
    tickerLog.removeChild(tickerLog.lastChild);
  }
}

function setSeismoMode(mode) {
  seismoViewMode = mode;
  const isEvent = mode === 'event';
  btnSeismoEvent?.classList.toggle('active', isEvent);
  btnSeismoLive?.classList.toggle('active', !isEvent);
  btnConsoleSeismoEvent?.classList.toggle('active', isEvent);
  btnConsoleSeismoLive?.classList.toggle('active', !isEvent);
}

// ================= 1. INSTANCIACIÓN DE MOTORES =================
const sound = new SoundEngine();
let scene3d = null;
let sim = null;

sim = new LPSBoxSimulation({
  onLog: (entry) => appendLogEntry(entry),
  onScenarioChange: (sc) => updateScenarioButtonsUI(sc),
  onSnapshotCaptured: (snap) => {
    if (experienceStarted) {
      sound.startSnifferAlarm(snap.scenario === 'major' ? 'major' : 'mild');
      if (snap.scenario === 'major') {
        sound.speakSnifferVoice(
          'Alerta sísmica severa en edificio. Enviando conteo de los cuatro pisos al Gateway del poste exterior. Evacúen por la escalera.'
        );
      } else {
        sound.speakSnifferVoice(
          'Sismo leve detectado por Raspberry Pi cinco. Mantengan la calma, enviando registro preventivo al poste.'
        );
      }
    }
    if (elBtnToggleHolo) elBtnToggleHolo.style.display = 'inline-flex';
    setSeismoMode('event');
    refreshConsoleData();
  },
  onPacketHeartbeat: () => {
    if (sim && activeView === 'sim' && experienceStarted && !sim.quakeActive) {
      sound.playPacketBlip();
    }
  },
  onTableHit: () => {
    if (experienceStarted) {
      sound.playTableShockwave();
    }
    setSeismoMode('event');
  },
  onGatewayPoleChange: (poleState) => {
    syncPoleUI();
    if (sim && activeView === 'console' && poleState === 'down') {
      sim.dataExtractedByOperator = true;
      if (experienceStarted) sound.playUsbConnect();
      refreshConsoleData();
    }
  },
  onEventRecordUpdate: () => {
    setSeismoMode('event');
    if (activeView === 'console') refreshConsoleData();
  },
  onPropsReset: () => {
    scene3d?.resetDynamicProps();
  },
  onCollapse: () => {
    refreshConsoleData();
  }
});
syncPoleUI();

try {
  scene3d = new LPSBoxScene3D(canvasContainer, sim, {
    onGatewayClick: () => openGatewayExtraction(),
    onPoleClick: () => handlePoleToggleAction(),
    onSnifferClick: () => {
      scene3d.setCameraMode('sniffer');
      syncCameraButtons('sniffer');
      appendLogEntry({
        time: sim.time,
        text: 'Inspeccionando Nodo Sniffer (modelo3d.stl + Raspberry Pi 5 + MPU6050) en Piso 2.',
        level: 'info'
      });
    },
    onPropImpact: (intensity) => {
      if (experienceStarted) sound.playPropCrash(intensity);
    },
    onElectricSpark: () => {
      if (experienceStarted) sound.playElectricSpark();
    },
    onStlReady: () => {
      if (stlText) {
        stlText.textContent = '✓ Malla ./modelo3d.stl cargada (50,000 tris) + Pantalla calibrada al 100%';
      }
      if (startStlStatus) {
        startStlStatus.textContent = '● MODELO 3D ./modelo3d.stl LISTO · EDIFICIO 4 PISOS ACTIVO';
      }
      setTimeout(() => {
        stlBanner?.classList.add('hidden');
      }, 1500);
    }
  });
} catch (err) {
  console.error('Error inicializando escena 3D WebGL:', err);
  if (stlText) stlText.textContent = 'Aviso: WebGL limitado en este navegador; consola operativa.';
}

const cadInspector = new StlCadInspector(document.getElementById('cad-canvas-wrap'));

// ================= 2. PANTALLA DE INICIO ("INICIAR EXPERIENCIA") =================
function startExperience(initialScenario = null) {
  experienceStarted = true;
  sound.ensureContext();
  sound.playUsbConnect();

  if (startOverlay) {
    startOverlay.classList.add('dismissed');
  }
  if (scene3d) {
    scene3d.stopIntroOrbit();
    scene3d.setCameraMode('tactical');
    syncCameraButtons('tactical');
  }

  appendLogEntry({
    time: sim.time,
    text: 'Experiencia iniciada: Edificio de 4 pisos en monitoreo. Recuerda bajar el Gateway del poste de luz [B] tras un sismo.',
    level: 'ok'
  });

  if (initialScenario === 'mild') {
    setSeismoMode('event');
    sim.triggerSeismicScenario('mild');
  } else if (initialScenario === 'major') {
    setSeismoMode('event');
    sim.triggerSeismicScenario('major');
  }
}

btnStartExperience?.addEventListener('click', () => startExperience(null));
btnStartMild?.addEventListener('click', () => startExperience('mild'));
btnStartMajor?.addEventListener('click', () => startExperience('major'));

// ================= 3. NAVEGACIÓN DE VISTAS Y POLEA DEL POSTE DE LUZ =================
function switchView(view) {
  activeView = view;
  navTabs.forEach((t) => t.classList.toggle('active', t.dataset.view === view));

  const isSim = view === 'sim';
  if (simHud) simHud.style.display = isSim ? 'flex' : 'none';
  if (bottomTicker) bottomTicker.style.display = isSim ? '' : 'none';

  viewConsole?.classList.toggle('active', view === 'console');
  viewDocs?.classList.toggle('active', view === 'docs');
  viewGallery?.classList.toggle('active', view === 'gallery');

  if (view === 'console') {
    if (sim.canExtractGateway()) {
      sim.dataExtractedByOperator = true;
    }
    syncPoleUI();
    refreshConsoleData();
  } else if (view === 'gallery') {
    cadInspector.initIfNeeded();
  }
}

navTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    sound.ensureContext();
    if (!experienceStarted && startOverlay) {
      experienceStarted = true;
      startOverlay.classList.add('dismissed');
      scene3d?.stopIntroOrbit();
    }
    switchView(tab.dataset.view);
  });
});

document.getElementById('btn-back-sim')?.addEventListener('click', () => switchView('sim'));
document.querySelectorAll('[data-goto-sim]').forEach((btn) => {
  btn.addEventListener('click', () => switchView('sim'));
});

function syncPoleUI() {
  if (!sim) return;
  const st = sim.gatewayPoleState;
  if (elPoleHeightVal) {
    elPoleHeightVal.textContent = `${sim.gatewayHeight.toFixed(2)} m`;
  }
  if (elPoleStatePill) {
    elPoleStatePill.classList.remove('is-down', 'is-moving');
    if (st === 'down') {
      elPoleStatePill.textContent = '✅ ABAJO (USB-C)';
      elPoleStatePill.classList.add('is-down');
    } else if (st === 'lowering') {
      elPoleStatePill.textContent = '⏳ BAJANDO...';
      elPoleStatePill.classList.add('is-moving');
    } else if (st === 'raising') {
      elPoleStatePill.textContent = '⏳ SUBIENDO...';
      elPoleStatePill.classList.add('is-moving');
    } else {
      elPoleStatePill.textContent = '⬆️ EN POSTE';
    }
  }
  if (elBtnLowerPole) {
    if (st === 'down') {
      elBtnLowerPole.textContent = '⬆️ Subir Gateway al Poste [B]';
      elBtnLowerPole.classList.remove('btn-pulse-attention');
    } else if (st === 'lowering') {
      elBtnLowerPole.textContent = '⏳ Descendiendo del poste...';
      elBtnLowerPole.classList.remove('btn-pulse-attention');
    } else if (st === 'raising') {
      elBtnLowerPole.textContent = '⏳ Subiendo al poste...';
    } else {
      elBtnLowerPole.textContent = '🪜 Bajar Gateway del Poste de Luz [B]';
    }
  }
  if (elConsolePoleLock) {
    elConsolePoleLock.classList.toggle('visible', st !== 'down');
  }
}

function handlePoleToggleAction(forceLower = false) {
  sound.ensureContext();
  if (forceLower || sim.gatewayPoleState === 'up' || sim.gatewayPoleState === 'raising') {
    sound.playPoleWinch('down');
    sim.lowerGatewayFromPole();
  } else {
    sound.playPoleWinch('up');
    sim.raiseGatewayToPole();
  }
  syncPoleUI();
}

elBtnLowerPole?.addEventListener('click', () => handlePoleToggleAction(false));
elBtnConsoleLowerPole?.addEventListener('click', () => handlePoleToggleAction(true));

function openGatewayExtraction() {
  sound.ensureContext();
  if (!sim.canExtractGateway()) {
    sound.playLockedBeep();
    elBtnLowerPole?.classList.add('btn-pulse-attention');
    if (scene3d && activeView === 'sim') {
      scene3d.setCameraMode('gateway');
      syncCameraButtons('gateway');
    }
    appendLogEntry({
      time: sim.time,
      text: '🔒 El Gateway está a 4.65 m en el poste de luz exterior. Bájalo primero con [🪜 Bajar Gateway del Poste] o tecla [B] antes de extraer los datos.',
      level: 'warn'
    });
    return;
  }

  sound.playUsbConnect();
  sim.dataExtractedByOperator = true;
  switchView('console');
  appendLogEntry({
    time: sim.time,
    text: 'Cable USB-C conectado al Gateway (1.18 m al pie del poste): registros descargados con éxito.',
    level: 'ok'
  });
}

elBtnExtract?.addEventListener('click', openGatewayExtraction);

window.addEventListener('keydown', (e) => {
  if (document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    return;
  }
  const k = e.key.toLowerCase();
  if (k === 'b') {
    handlePoleToggleAction(false);
  } else if (k === 'e') {
    openGatewayExtraction();
  } else if (k === 'g') {
    sound.ensureContext();
    sim.triggerPhysicalTableHit();
  }
});

// ================= 4. COLAPSABLES DEL HUD =================
document.querySelectorAll('[data-collapse]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const card = document.getElementById(btn.dataset.collapse);
    if (!card) return;
    const collapsed = card.classList.toggle('collapsed');
    btn.textContent = collapsed ? '+' : '−';
  });
});

// ================= 5. AUDIO Y SESIÓN WEBXR (VR / MR) =================
btnAudio?.addEventListener('click', () => {
  sound.ensureContext();
  sound.setMuted(!sound.muted);
  btnAudio.textContent = sound.muted ? '🔇 Silenciado' : '🔊 Audio';
});

async function toggleWebXR() {
  if (!scene3d) return;
  if (!('xr' in navigator)) {
    alert(
      'WebXR nativo requiere un navegador compatible (ej. Meta Quest Browser en Quest 2/3/Pro o Chrome Android AR). El modo 3D interactivo de escritorio está completamente activo.'
    );
    return;
  }
  try {
    if (xrSession) {
      await xrSession.end();
      return;
    }
    const arSupported = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
    const vrSupported = await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
    const mode = arSupported ? 'immersive-ar' : vrSupported ? 'immersive-vr' : null;
    if (!mode) {
      alert('No se detectó un visor VR/MR conectado en este dispositivo.');
      return;
    }

    const session = await navigator.xr.requestSession(mode, {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
    });
    xrSession = session;
    if (mode === 'immersive-ar') {
      scene3d.scene.background = null;
    }
    await scene3d.renderer.xr.setSession(session);
    if (btnXr) btnXr.textContent = '⏹ Salir XR';
    session.addEventListener('end', () => {
      xrSession = null;
      scene3d.restoreBackground();
      if (btnXr) btnXr.textContent = '🥽 Entrar VR / MR';
    });
  } catch (err) {
    alert(`No fue posible iniciar sesión WebXR: ${err.message}`);
  }
}

btnXr?.addEventListener('click', toggleWebXR);

// ================= 6. CONTROL DE ESCENARIOS Y PARÁMETROS =================
function updateScenarioButtonsUI(sc) {
  btnScNormal?.classList.toggle('active', sc === 'normal');
  btnScMild?.classList.toggle('active', sc === 'mild');
  btnScMajor?.classList.toggle('active', sc === 'major');
}

btnScNormal?.addEventListener('click', () => {
  sound.ensureContext();
  sound.stopAlarmLoop();
  sim.setNormalMonitoring();
});

btnScMild?.addEventListener('click', () => {
  sound.ensureContext();
  setSeismoMode('event');
  sim.triggerSeismicScenario('mild');
});

btnScMajor?.addEventListener('click', () => {
  sound.ensureContext();
  setSeismoMode('event');
  sim.triggerSeismicScenario('major');
});

btnScHit?.addEventListener('click', () => {
  sound.ensureContext();
  setSeismoMode('event');
  sim.triggerPhysicalTableHit();
});

document.getElementById('btn-console-mild')?.addEventListener('click', () => {
  sound.ensureContext();
  setSeismoMode('event');
  sim.triggerSeismicScenario('mild');
  switchView('sim');
});

document.getElementById('btn-console-major')?.addEventListener('click', () => {
  sound.ensureContext();
  setSeismoMode('event');
  sim.triggerSeismicScenario('major');
  switchView('sim');
});

pillChallenge?.addEventListener('click', () => {
  sim.challengeMode = true;
  pillChallenge.classList.add('active');
  pillSandbox?.classList.remove('active');
  if (sandboxControls) sandboxControls.style.display = 'none';
  sim.spawnMissionRandom();
});

pillSandbox?.addEventListener('click', () => {
  sim.challengeMode = false;
  pillSandbox.classList.add('active');
  pillChallenge?.classList.remove('active');
  if (sandboxControls) sandboxControls.style.display = 'block';
  sim.spawnWithTotalCount(Number(sliderPeople?.value || 18));
});

sliderPeople?.addEventListener('input', () => {
  if (valPeople) valPeople.textContent = sliderPeople.value;
  if (!sim.challengeMode) {
    sim.spawnWithTotalCount(Number(sliderPeople.value));
  }
});

sliderMag?.addEventListener('input', () => {
  sim.customMagnitude = Number(sliderMag.value);
  if (valMag) valMag.textContent = `${sim.customMagnitude.toFixed(1)} Mw`;
});

document.getElementById('btn-trigger-custom')?.addEventListener('click', () => {
  sound.ensureContext();
  setSeismoMode('event');
  sim.triggerSeismicScenario('custom', Number(sliderMag?.value || 6.5));
});

selectNoise?.addEventListener('change', () => {
  sim.macNoiseLevel = selectNoise.value;
  const labels = { low: 'Bajo', medium: 'Medio', high: 'Alto' };
  if (valNoise) valNoise.textContent = labels[selectNoise.value] || 'Medio';
});

document.getElementById('btn-new-mission')?.addEventListener('click', () => {
  sound.stopAlarmLoop();
  sim.spawnMissionRandom();
  syncPoleUI();
  document.getElementById('report-result')?.classList.remove('visible');
});

// ================= 7. CÁMARAS Y VISIÓN MR =================
function syncCameraButtons(mode) {
  camButtons.forEach((b) => b.classList.toggle('active', b.dataset.cam === mode));
}

camButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.cam;
    scene3d?.setCameraMode(mode);
    syncCameraButtons(mode);
  });
});

chkMrVision?.addEventListener('change', () => {
  if (scene3d) scene3d.mrVisionEnabled = chkMrVision.checked;
});

elBtnToggleHolo?.addEventListener('click', () => {
  sim.showPreQuakeHologram = !sim.showPreQuakeHologram;
});

// ================= 8. SISMOGRAMA PERSISTENTE DEL EVENTO + MODO EN VIVO =================
btnSeismoEvent?.addEventListener('click', () => setSeismoMode('event'));
btnSeismoLive?.addEventListener('click', () => setSeismoMode('live'));
btnConsoleSeismoEvent?.addEventListener('click', () => {
  setSeismoMode('event');
  refreshConsoleData();
});
btnConsoleSeismoLive?.addEventListener('click', () => {
  setSeismoMode('live');
  refreshConsoleData();
});

fullSeismoCanvas?.addEventListener('mousemove', (e) => {
  const rect = fullSeismoCanvas.getBoundingClientRect();
  seismoHoverNormX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  if (activeView === 'console') {
    drawSeismogram(fullSeismoCtx, fullSeismoCanvas.width, fullSeismoCanvas.height, true);
  }
});

fullSeismoCanvas?.addEventListener('mouseleave', () => {
  seismoHoverNormX = null;
  if (elSeismoHoverReadout) {
    elSeismoHoverReadout.textContent =
      'Pasa el cursor sobre la gráfica para inspeccionar aceleración (g) y relación STA/LTA segundo a segundo.';
  }
  if (activeView === 'console') {
    drawSeismogram(fullSeismoCtx, fullSeismoCanvas.width, fullSeismoCanvas.height, true);
  }
});

function drawSeismogram(ctx, w, h, detailed = false) {
  if (!ctx) return;
  ctx.fillStyle = '#050a12';
  ctx.fillRect(0, 0, w, h);

  const eventRec = sim.getEventSeismogram();
  const useEventMode = seismoViewMode === 'event' && Boolean(eventRec) && eventRec.samples.length >= 2;

  const padTop = detailed ? 24 : 8;
  const padBottom = detailed ? 22 : 13;
  const plotH = h - padTop - padBottom;

  // Subtle horizontal grid
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const gy = padTop + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(w, gy);
    ctx.stroke();
  }

  // STA/LTA = 3.0 trigger threshold line
  const maxRatioScale = 10.5;
  const threshY = padTop + plotH * (1 - 3.0 / maxRatioScale);
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, threshY);
  ctx.lineTo(w, threshY);
  ctx.stroke();
  ctx.setLineDash([]);

  if (useEventMode) {
    const samples = eventRec.samples;
    const minT = samples[0].tRel;
    const lastSampleT = samples[samples.length - 1].tRel;
    const maxT = Math.max(eventRec.expectedDuration + 1.5, lastSampleT, 4.0);
    const spanT = Math.max(1.0, maxT - minT);

    // Auto-scale acceleration cleanly so both mild (0.11g) and major (0.78g) quakes show rich wave detail!
    const maxScaleG = Math.max(0.16, eventRec.peakG * 1.18);

    const tToX = (tRel) => ((tRel - minT) / spanT) * w;

    // Shade pre-event baseline region (t < 0)
    const xZero = tToX(0);
    if (xZero > 0) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.045)';
      ctx.fillRect(0, padTop, xZero, plotH);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.beginPath();
      ctx.moveTo(xZero, padTop);
      ctx.lineTo(xZero, padTop + plotH);
      ctx.stroke();
    }

    // Time ticks along bottom axis
    ctx.fillStyle = '#64748b';
    ctx.font = detailed ? '10.5px monospace' : '9px monospace';
    const stepSec = spanT > 18 ? 5 : 2;
    for (let s = 0; s <= Math.floor(maxT); s += stepSec) {
      const tx = tToX(s);
      ctx.fillText(`${s}s`, Math.min(w - 22, Math.max(2, tx - 6)), h - 4);
    }

    // Trigger vertical marker (t0 Snapshot)
    if (eventRec.triggerRelTime !== null) {
      const trigX = tToX(eventRec.triggerRelTime);
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.75)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(trigX, padTop);
      ctx.lineTo(trigX, padTop + plotH);
      ctx.stroke();
      if (detailed) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 10.5px monospace';
        ctx.fillText(`⚡ Disparo t₀ (${eventRec.triggerRelTime.toFixed(1)}s)`, trigX + 4, padTop + 12);
      }
    }

    // Collapse marker (major quake)
    if (detailed && eventRec.collapseRelTime !== null) {
      const colX = tToX(eventRec.collapseRelTime);
      ctx.strokeStyle = 'rgba(248, 113, 113, 0.75)';
      ctx.beginPath();
      ctx.moveTo(colX, padTop);
      ctx.lineTo(colX, padTop + plotH);
      ctx.stroke();
      ctx.fillStyle = '#fca5a5';
      ctx.font = '10px monospace';
      ctx.fillText('💥 Caída/Colapso', colX + 4, padTop + 26);
    }

    // Filled acceleration envelope + crisp stroke (Cyan)
    ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
    ctx.beginPath();
    samples.forEach((pt, idx) => {
      const x = tToX(pt.tRel);
      const normA = Math.min(1, pt.accelG / maxScaleG);
      const y = padTop + plotH * (1 - normA);
      if (idx === 0) ctx.moveTo(x, padTop + plotH);
      ctx.lineTo(x, y);
    });
    ctx.lineTo(tToX(lastSampleT), padTop + plotH);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = detailed ? 1.8 : 1.35;
    ctx.beginPath();
    samples.forEach((pt, idx) => {
      const x = tToX(pt.tRel);
      const normA = Math.min(1, pt.accelG / maxScaleG);
      const y = padTop + plotH * (1 - normA);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // STA/LTA ratio curve (Amber)
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = detailed ? 2.1 : 1.5;
    ctx.beginPath();
    samples.forEach((pt, idx) => {
      const x = tToX(pt.tRel);
      const normR = Math.min(1, pt.ratio / maxRatioScale);
      const y = padTop + plotH * (1 - normR);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Peak PGA dot & header summary
    const peakX = tToX(eventRec.peakRelTime);
    const peakY = padTop + plotH * (1 - Math.min(1, eventRec.peakG / maxScaleG));
    ctx.fillStyle = '#f87171';
    ctx.beginPath();
    ctx.arc(peakX, peakY, detailed ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();

    if (detailed) {
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 11.5px monospace';
      const stateStr = eventRec.active ? '● GRABANDO EN VIVO' : '✓ REGISTRO COMPLETO GUARDADO';
      ctx.fillText(
        `${eventRec.label} · PGA máx: ${eventRec.peakG.toFixed(3)}g · STA/LTA máx: ${eventRec.peakStaLta.toFixed(2)} · ${stateStr}`,
        8,
        15
      );

      // Interactive cursor hover inspection
      if (seismoHoverNormX !== null) {
        const hoverT = minT + seismoHoverNormX * spanT;
        let nearest = samples[0];
        let bestDiff = Infinity;
        for (const s of samples) {
          const d = Math.abs(s.tRel - hoverT);
          if (d < bestDiff) {
            bestDiff = d;
            nearest = s;
          }
        }
        const hx = tToX(nearest.tRel);
        ctx.strokeStyle = 'rgba(248, 250, 252, 0.65)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hx, padTop);
        ctx.lineTo(hx, padTop + plotH);
        ctx.stroke();

        if (elSeismoHoverReadout) {
          elSeismoHoverReadout.innerHTML =
            `Cursor en <strong>t = ${nearest.tRel >= 0 ? '+' : ''}${nearest.tRel.toFixed(2)} s</strong> · Aceleración MPU6050: <strong style="color:#38bdf8">${nearest.accelG.toFixed(3)} g</strong> · STA/LTA: <strong style="color:#fbbf24">${nearest.ratio.toFixed(2)}</strong> ${nearest.triggered ? '<span style="color:#f87171">(≥ 3.0 DISPARADO)</span>' : ''}`;
        }
      }
    }

    if (elHudSeismoTag) {
      elHudSeismoTag.textContent = eventRec.active
        ? `Grabando (${lastSampleT.toFixed(1)}s)`
        : `${eventRec.label} (${eventRec.peakG.toFixed(2)}g)`;
    }
    return;
  }

  // LIVE ROLLING STREAM MODE
  if (elHudSeismoTag) {
    elHudSeismoTag.textContent = eventRec ? 'En vivo (hay evento guardado)' : 'Tiempo real';
  }
  if (detailed) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px monospace';
    ctx.fillText('Señal MPU6050 en Tiempo Real (Ventana deslizante) — Umbral STA/LTA = 3.0', 8, 15);
  }

  const hist = sim.seismoHistory;
  if (hist.length < 2) return;

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  hist.forEach((pt, idx) => {
    const x = (idx / (hist.length - 1)) * w;
    const normA = Math.min(1, pt.accelG / 0.75);
    const y = padTop + plotH * (1 - normA);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = detailed ? 2.1 : 1.6;
  ctx.beginPath();
  hist.forEach((pt, idx) => {
    const x = (idx / (hist.length - 1)) * w;
    const normR = Math.min(1, pt.ratio / maxRatioScale);
    const y = padTop + plotH * (1 - normR);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function updateHudTelemetry() {
  elLedBlue?.classList.toggle('blue-on', sim.gatewayLeds.blue);
  elLedBlink?.classList.toggle('blink-on', sim.gatewayLeds.blink);
  elLedYellow?.classList.toggle('yellow-on', sim.gatewayLeds.yellow);
  elNavDot?.classList.toggle('has-data', sim.gatewayLeds.yellow);

  const readyToExtract = sim.gatewayLeds.yellow && sim.canExtractGateway() && !sim.dataExtractedByOperator;
  elBtnExtract?.classList.toggle('glow-ready', readyToExtract);

  // Highlight Pole Lower button when Gateway has data (Yellow LED) and is still up on the pole!
  if (sim.gatewayLeds.yellow && sim.gatewayPoleState === 'up' && !sim.dataExtractedByOperator) {
    elBtnLowerPole?.classList.add('btn-pulse-attention');
  }

  syncPoleUI();

  const s1 = document.getElementById('mstep-1');
  const s2 = document.getElementById('mstep-2');
  const s3 = document.getElementById('mstep-3');
  const s4 = document.getElementById('mstep-4');

  const hasEventStarted = sim.quakeActive || Boolean(sim.frozenSnapshot);
  const hasSnapshot = Boolean(sim.frozenSnapshot);
  const hasLoweredAndExtracted = sim.canExtractGateway() && sim.dataExtractedByOperator && hasSnapshot;
  const hasReported = sim.reportSubmitted;

  if (s1) s1.className = `mission-step ${hasEventStarted ? 'done' : 'current'}`;
  if (s2) s2.className = `mission-step ${hasSnapshot ? 'done' : hasEventStarted ? 'current' : ''}`;
  if (s3) s3.className = `mission-step ${hasLoweredAndExtracted ? 'done' : hasSnapshot ? 'current' : ''}`;
  if (s4) s4.className = `mission-step ${hasReported ? 'done' : hasLoweredAndExtracted ? 'current' : ''}`;

  if (elOledSta) elOledSta.textContent = `STA/LTA: ${sim.staLtaRatio.toFixed(2)}`;
  if (elOledBox && elOledTitle && elOledSub) {
    if (sim.scenario === 'major' && hasEventStarted) {
      elOledBox.className = 'sniffer-oled state-major';
      elOledTitle.textContent = 'ALERTA SÍSMICA';
      elOledSub.textContent = 'RPi5 enviando t₀ → Poste Exterior';
    } else if (sim.scenario === 'mild' && hasEventStarted) {
      elOledBox.className = 'sniffer-oled state-mild';
      elOledTitle.textContent = 'SISMO LEVE';
      elOledSub.textContent = 'Enviando datos preventivos → Poste';
    } else {
      elOledBox.className = 'sniffer-oled state-normal';
      elOledTitle.textContent = 'MONITOREO';
      elOledSub.textContent = `4 Pisos · Ventana 10s: ${sim.rollingProbes.length} tramas`;
    }
  }

  if (elStatAccel) elStatAccel.textContent = `${sim.accel.dynamicG.toFixed(3)}g`;
  if (elStatStaLta) {
    elStatStaLta.textContent = sim.staLtaRatio.toFixed(2);
    elStatStaLta.classList.toggle('triggered', sim.staLtaRatio >= sim.staLtaThreshold);
  }
  if (tickerClock) tickerClock.textContent = `t = ${sim.time.toFixed(1)}s`;

  if (miniSeismoCtx && miniSeismoCanvas) {
    drawSeismogram(miniSeismoCtx, miniSeismoCanvas.width, miniSeismoCanvas.height, false);
  }
}

// ================= 9. CONSOLA DE EXTRACCIÓN DEL GATEWAY Y MAPA DE 4 PISOS =================
document.querySelectorAll('.subtab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.subtab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.subtab-pane').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.subtab)?.classList.add('active');
    refreshConsoleData();
  });
});

chkMacFilter?.addEventListener('change', refreshConsoleData);

// 4-Story Cross-Section Elevation Coordinate Helpers
function getFloorBandRect(floorNum, w, h) {
  // floorNum: 4 (top) .. 1 (bottom)
  const topMargin = 42;
  const bottomGround = h - 46;
  const totalBldgH = bottomGround - topMargin;
  const bandH = totalBldgH / 4;
  const idxFromTop = 4 - floorNum;
  return {
    x: 56,
    y: topMargin + idxFromTop * bandH,
    w: w - 235,
    h: bandH - 6
  };
}

function worldToElevationMap(wx, floorNum, w, h) {
  const rect = getFloorBandRect(floorNum, w, h);
  const normX = Math.max(0.04, Math.min(0.96, (wx - -8.5) / (5.5 - -8.5)));
  return {
    x: rect.x + normX * rect.w,
    y: rect.y + rect.h * 0.56
  };
}

rssiCanvas?.addEventListener('click', (e) => {
  const rect = rssiCanvas.getBoundingClientRect();
  const cx = ((e.clientX - rect.left) / rect.width) * rssiCanvas.width;
  const cy = ((e.clientY - rect.top) / rect.height) * rssiCanvas.height;
  sim.userMapPins.push({ cx, cy });
  refreshConsoleData();
});

document.getElementById('btn-clear-pins')?.addEventListener('click', () => {
  sim.userMapPins = [];
  refreshConsoleData();
});

function drawTacticalRssiMap(packets) {
  if (!rssiCtx || !rssiCanvas) return;
  const w = rssiCanvas.width;
  const h = rssiCanvas.height;
  rssiCtx.fillStyle = '#060c16';
  rssiCtx.fillRect(0, 0, w, h);

  // Subtle blueprint grid
  rssiCtx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
  rssiCtx.lineWidth = 1;
  for (let gx = 0; gx < w; gx += 36) {
    rssiCtx.beginPath();
    rssiCtx.moveTo(gx, 0);
    rssiCtx.lineTo(gx, h);
    rssiCtx.stroke();
  }
  for (let gy = 0; gy < h; gy += 36) {
    rssiCtx.beginPath();
    rssiCtx.moveTo(0, gy);
    rssiCtx.lineTo(w, gy);
    rssiCtx.stroke();
  }

  rssiCtx.fillStyle = '#94a3b8';
  rssiCtx.font = 'bold 12px monospace';
  rssiCtx.fillText('CORTE ARQUITECTÓNICO DE 4 PISOS — TRIANGULACIÓN PRE-SISMO (t₀)', 56, 24);

  // Ground street line
  const groundY = h - 42;
  rssiCtx.strokeStyle = '#334155';
  rssiCtx.lineWidth = 2;
  rssiCtx.beginPath();
  rssiCtx.moveTo(20, groundY);
  rssiCtx.lineTo(w - 20, groundY);
  rssiCtx.stroke();

  // Draw the 4 Floor Slabs (Piso 4 down to Piso 1)
  ZONES.forEach((zone) => {
    const r = getFloorBandRect(zone.floor, w, h);
    const isCollapsed = sim.collapsedZones.has(zone.id);

    rssiCtx.fillStyle = isCollapsed ? 'rgba(239, 68, 68, 0.15)' : 'rgba(17, 29, 48, 0.78)';
    rssiCtx.fillRect(r.x, r.y, r.w, r.h);

    rssiCtx.strokeStyle = zone.color;
    rssiCtx.lineWidth = 2;
    rssiCtx.strokeRect(r.x, r.y, r.w, r.h);

    rssiCtx.fillStyle = zone.color;
    rssiCtx.font = 'bold 12.5px monospace';
    rssiCtx.fillText(
      `${zone.name}${isCollapsed ? '  [⚠ CAÍDA / BLOQUEO PARCIAL]' : ''}`,
      r.x + 10,
      r.y + 18
    );

    // Sniffer RPi5 icon on Piso 2
    if (zone.floor === 2) {
      const sx = r.x + r.w * 0.54;
      const sy = r.y + r.h * 0.56;
      rssiCtx.fillStyle = '#38bdf8';
      rssiCtx.fillRect(sx - 8, sy - 8, 16, 16);
      rssiCtx.fillStyle = '#e0f2fe';
      rssiCtx.font = '10.5px monospace';
      rssiCtx.fillText('SNIFFER RPi5+MPU6050', sx + 12, sy + 4);
    }
  });

  // Right-side Emergency Stairwell column
  const topR = getFloorBandRect(4, w, h);
  const botR = getFloorBandRect(1, w, h);
  const stairX = topR.x + topR.w + 6;
  const stairH = botR.y + botR.h - topR.y;
  rssiCtx.fillStyle = 'rgba(30, 41, 59, 0.65)';
  rssiCtx.strokeStyle = '#fbbf24';
  rssiCtx.lineWidth = 1.5;
  rssiCtx.fillRect(stairX, topR.y, 52, stairH);
  rssiCtx.strokeRect(stairX, topR.y, 52, stairH);
  rssiCtx.fillStyle = '#fcd34d';
  rssiCtx.font = '10px monospace';
  rssiCtx.fillText('ESCALERA', stairX + 3, topR.y + 15);

  // Outdoor Street Light Pole + Gateway on far right
  const poleX = w - 68;
  rssiCtx.strokeStyle = '#94a3b8';
  rssiCtx.lineWidth = 4;
  rssiCtx.beginPath();
  rssiCtx.moveTo(poleX, groundY);
  rssiCtx.lineTo(poleX, groundY - 190);
  rssiCtx.lineTo(poleX - 24, groundY - 202);
  rssiCtx.stroke();

  const gwNorm = (sim.gatewayHeight - 1.18) / (4.65 - 1.18);
  const gwY = groundY - 38 - gwNorm * 125;
  rssiCtx.fillStyle = sim.gatewayLeds.yellow ? '#fbbf24' : '#3b82f6';
  rssiCtx.fillRect(poleX - 18, gwY - 10, 16, 20);
  rssiCtx.fillStyle = '#f8fafc';
  rssiCtx.font = '10px monospace';
  rssiCtx.fillText('POSTE LUZ', poleX - 28, groundY + 15);
  rssiCtx.fillText(`GW ${sim.gatewayHeight.toFixed(1)}m`, poleX - 28, groundY + 28);

  // Plot detected smartphones per floor in t0
  packets.forEach((pkt) => {
    const floorNum = pkt.estimatedFloor || ZONES.find((z) => z.id === pkt.estimatedZone)?.floor || 1;
    const jitY = ((pkt.personId % 5) - 2) * 6;
    const pt = worldToElevationMap(pkt.estX, floorNum, w, h);
    const py = pt.y + jitY;

    const livePerson = sim.people.find((p) => p.id === pkt.personId);
    const isTrappedOrOffline = livePerson && (!livePerson.phoneOnline || livePerson.state === 'trapped');
    const isEvacuated = livePerson && livePerson.state === 'evacuated';

    rssiCtx.fillStyle = 'rgba(56, 189, 248, 0.2)';
    rssiCtx.beginPath();
    rssiCtx.arc(pt.x, py, 12, 0, Math.PI * 2);
    rssiCtx.fill();

    rssiCtx.fillStyle = '#38bdf8';
    rssiCtx.beginPath();
    rssiCtx.arc(pt.x, py, 5, 0, Math.PI * 2);
    rssiCtx.fill();

    if (sim.frozenSnapshot) {
      rssiCtx.strokeStyle = isTrappedOrOffline ? '#ef4444' : isEvacuated ? '#10b981' : '#fbbf24';
      rssiCtx.lineWidth = 2;
      rssiCtx.beginPath();
      rssiCtx.arc(pt.x, py, 8.5, 0, Math.PI * 2);
      rssiCtx.stroke();
    }

    rssiCtx.fillStyle = '#e2e8f0';
    rssiCtx.font = '10px monospace';
    rssiCtx.fillText(pkt.deviceHash.slice(0, 6), pt.x + 9, py + 3);
  });

  // Draw USAR Rescue Pins placed by Operator
  sim.userMapPins.forEach((pin, idx) => {
    rssiCtx.strokeStyle = '#fbbf24';
    rssiCtx.lineWidth = 2;
    rssiCtx.beginPath();
    rssiCtx.arc(pin.cx, pin.cy, 10, 0, Math.PI * 2);
    rssiCtx.stroke();
    rssiCtx.fillStyle = '#fbbf24';
    rssiCtx.font = 'bold 11px sans-serif';
    rssiCtx.fillText(`USAR-${idx + 1}`, pin.cx + 12, pin.cy + 4);
  });
}

function refreshConsoleData() {
  if (!sim) return;
  syncPoleUI();
  const snap = sim.frozenSnapshot;
  const applyFilter = chkMacFilter ? chkMacFilter.checked : true;

  const banner = document.getElementById('console-snapshot-banner');
  const bannerText = document.getElementById('console-banner-text');

  if (snap && banner && bannerText) {
    banner.classList.remove('no-event');
    bannerText.innerHTML =
      `<strong>🟡 LED Amarillo Activo — Snapshot Pre-Sismo (<code>t₀ = ${snap.triggerTime.toFixed(1)}s</code>) recibido desde Sniffer RPi5:</strong> ` +
      `Magnitud <strong>${snap.magnitude.toFixed(1)} Mw</strong> · Disparo <code>STA/LTA = ${snap.triggerStaLta.toFixed(2)}</code> · ` +
      `Estado en Poste: <strong>${sim.canExtractGateway() ? 'Abajo (1.18 m — Conectado USB-C)' : 'Arriba en Poste (4.65 m — Bájalo para validar extracción)'}</strong>.`;
  } else if (banner && bannerText) {
    banner.classList.add('no-event');
    bannerText.innerHTML =
      `<strong>🔵 LED Azul Activo (Sin evento sísmico registrado):</strong> Mostrando buffer circular de los últimos 10 s enviado por la Raspberry Pi 5 (Piso 2). Dispara un <em>Sismo Pequeño</em> o un <em>Terremoto Fuerte</em> para congelar la captura <code>t₀</code>.`;
  }

  let rawList = [];
  if (snap) {
    rawList = snap.rawPackets;
  } else {
    rawList = sim.rollingProbes.filter((p) => sim.time - p.timestamp <= 10.0);
  }

  const randomDuplicateCount = rawList.filter((p) => p.isDuplicateRandomBurst).length;

  let displayPackets = [];
  if (applyFilter) {
    const map = new Map();
    rawList.forEach((pkt) => {
      if (!pkt.isDuplicateRandomBurst) {
        map.set(pkt.deviceHash, pkt);
      }
    });
    displayPackets = Array.from(map.values());
  } else {
    displayPackets = rawList.slice().reverse();
  }

  const elRaw = document.getElementById('kpi-raw');
  const elRand = document.getElementById('kpi-rand');
  const elUnique = document.getElementById('kpi-unique');
  const elSta = document.getElementById('kpi-stalta');

  if (elRaw) elRaw.textContent = String(rawList.length);
  if (elRand) elRand.textContent = String(randomDuplicateCount);
  if (elUnique) elUnique.textContent = String(displayPackets.length);
  if (elSta) elSta.textContent = snap ? snap.triggerStaLta.toFixed(2) : sim.staLtaRatio.toFixed(2);

  const zCounts = { A: 0, B: 0, C: 0, D: 0 };
  displayPackets.forEach((pkt) => {
    if (zCounts[pkt.estimatedZone] !== undefined) zCounts[pkt.estimatedZone]++;
  });
  const summaryEl = document.getElementById('zone-rssi-summary');
  if (summaryEl) {
    summaryEl.innerHTML =
      `<span><strong>Triangulación por Piso (${applyFilter ? 'Filtrada' : 'Sin filtrar'}):</strong></span>` +
      `<span style="color:#10b981">Piso 1 (Cafetería): <strong>${zCounts.A}</strong></span>` +
      `<span style="color:#38bdf8">Piso 2 (Lab/RPi5): <strong>${zCounts.B}</strong></span>` +
      `<span style="color:#a855f7">Piso 3 (Servidores): <strong>${zCounts.C}</strong></span>` +
      `<span style="color:#f59e0b">Piso 4 (Auditorio): <strong>${zCounts.D}</strong></span>`;
  }

  const tbody = document.getElementById('probe-tbody');
  if (tbody) {
    tbody.innerHTML = '';
    displayPackets.forEach((pkt) => {
      const tr = document.createElement('tr');
      const liveP = sim.people.find((p) => p.id === pkt.personId);
      const postStatus = !snap
        ? '<span class="tag tag-real">En monitoreo</span>'
        : liveP?.state === 'evacuated'
          ? '<span class="tag tag-real">Evacuado (Exterior)</span>'
          : !liveP?.phoneOnline || liveP?.state === 'trapped'
            ? '<span class="tag tag-lost">Señal perdida / Atrapado</span>'
            : '<span class="tag tag-rand">Evacuando escalera</span>';

      const zoneInfo = ZONES.find((z) => z.id === pkt.estimatedZone);
      const rssiStr = `${pkt.rssiByZone.A} / ${pkt.rssiByZone.B} / ${pkt.rssiByZone.C} / ${pkt.rssiByZone.D} dBm`;

      tr.innerHTML = `
        <td><strong>${pkt.deviceHash}</strong></td>
        <td>${pkt.mac}</td>
        <td>
          ${pkt.proto} (CH ${pkt.channel})
          ${pkt.isDuplicateRandomBurst ? '<span class="tag tag-rand">Ráfaga LAA</span>' : pkt.isLaaRandom ? '<span class="tag tag-rand">MAC Privada</span>' : '<span class="tag tag-real">OUI Fijo</span>'}
        </td>
        <td>${rssiStr}</td>
        <td style="color:${zoneInfo?.color || '#fff'}; font-weight:700;">${zoneInfo?.shortName || pkt.estimatedZone}</td>
        <td>${postStatus}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  drawTacticalRssiMap(displayPackets);
  if (fullSeismoCtx && fullSeismoCanvas) {
    drawSeismogram(fullSeismoCtx, fullSeismoCanvas.width, fullSeismoCanvas.height, true);
  }

  const mqttPre = document.getElementById('mqtt-json-preview');
  if (mqttPre) {
    const eventRec = sim.getEventSeismogram();
    const payloadExample = {
      sniffer_node: 'LPSBOX-SNIFFER-RPI5-PISO2',
      outdoor_gateway: {
        id: 'LPSBOX-GW-POSTE-EXT-01',
        pole_height_m: Number(sim.gatewayHeight.toFixed(2)),
        pole_state: sim.gatewayPoleState,
        leds: sim.gatewayLeds
      },
      timestamp_s: Number((snap ? snap.triggerTime : sim.time).toFixed(2)),
      mpu6050_rpi5: {
        accel_dynamic_g: Number((snap ? snap.peakAccelG : sim.accel.dynamicG).toFixed(4)),
        sta_lta_ratio: Number((snap ? snap.triggerStaLta : sim.staLtaRatio).toFixed(2)),
        threshold: sim.staLtaThreshold,
        triggered: Boolean(snap),
        recorded_waveform_samples: eventRec ? eventRec.samples.length : 0
      },
      crowd_sniffer_10s_window: {
        raw_probe_requests: rawList.length,
        filtered_randomized_macs: randomDuplicateCount,
        unique_smartphones_t0: displayPackets.length,
        floors_t0: {
          piso_1_cafeteria: zCounts.A,
          piso_2_lab_rpi5: zCounts.B,
          piso_3_servidores: zCounts.C,
          piso_4_auditorio: zCounts.D
        }
      }
    };
    mqttPre.textContent = JSON.stringify(payloadExample, null, 2);
  }
}

// ================= 10. FORMULARIO Y EVALUACIÓN DEL OPERARIO =================
function updateZoneSumHelper() {
  const sum = zoneInputs.reduce((acc, inp) => acc + Number(inp?.value || 0), 0);
  if (zoneSumHelper) {
    zoneSumHelper.textContent = `Suma actual ingresada por pisos (P1+P2+P3+P4): ${sum} personas`;
  }
}
zoneInputs.forEach((inp) => inp?.addEventListener('input', updateZoneSumHelper));

document.getElementById('operator-report-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  sound.ensureContext();
  sound.playUsbConnect();

  const totalGuess = Number(document.getElementById('inp-total')?.value || 0);
  const zoneGuesses = {
    A: Number(document.getElementById('inp-zone-a')?.value || 0),
    B: Number(document.getElementById('inp-zone-b')?.value || 0),
    C: Number(document.getElementById('inp-zone-c')?.value || 0),
    D: Number(document.getElementById('inp-zone-d')?.value || 0)
  };
  const priorityZoneGuess = document.getElementById('inp-priority-zone')?.value || 'D';

  const evalRes = sim.evaluateOperatorReport({ totalGuess, zoneGuesses, priorityZoneGuess });

  const resultBox = document.getElementById('report-result');
  const scoreEl = document.getElementById('res-score');
  const fbEl = document.getElementById('res-feedback');

  if (scoreEl) {
    scoreEl.textContent = `${evalRes.score}/100`;
    scoreEl.style.color =
      evalRes.score >= 85 ? '#34d399' : evalRes.score >= 60 ? '#fbbf24' : '#f87171';
  }

  const zRows = ['A', 'B', 'C', 'D']
    .map((z) => {
      const d = evalRes.zoneDetails[z];
      const mark = d.exact ? '✓' : '≠';
      return `${d.code}: reportaste <strong>${d.guess}</strong> / real <strong>${d.truth}</strong> (${mark})`;
    })
    .join('<br/>');

  let extraNote = '';
  if (evalRes.usedUnfilteredRaw) {
    extraNote =
      `<p style="color:#fcd34d; margin-top:6px;">⚠️ <strong>Nota de Ingeniería:</strong> Ingresaste el conteo bruto (${evalRes.rawPacketCount}) sin filtrar las MACs aleatorias en la ventana de 10 s.</p>`;
  }

  if (fbEl) {
    fbEl.innerHTML = `
      <p><strong>Total en el edificio antes del sismo (t₀):</strong> Reportaste <strong>${evalRes.totalGuess}</strong> personas · Realidad: <strong>${evalRes.truthTotal}</strong> personas.</p>
      <div style="margin: 6px 0; font-family: var(--font-mono); font-size: 11.5px;">${zRows}</div>
      <p><strong>Prioridad USAR:</strong> Nivel prioritario <strong>${evalRes.bestPriorityZoneCode}</strong> ${evalRes.priorityCorrect ? '(¡Acertaste!)' : ''}.</p>
      ${extraNote}
    `;
  }

  resultBox?.classList.add('visible');
  if (elBtnToggleHolo) elBtnToggleHolo.style.display = 'inline-flex';
  appendLogEntry({
    time: sim.time,
    text: `Reporte de Operario calificado: ${evalRes.score}/100 pts. Hologramas 3D pre-sismo (t₀) activados en los 4 pisos.`,
    level: evalRes.score >= 80 ? 'ok' : 'warn'
  });
});

document.getElementById('btn-view-hologram')?.addEventListener('click', () => {
  sim.showPreQuakeHologram = true;
  switchView('sim');
  scene3d?.setCameraMode('tactical');
  syncCameraButtons('tactical');
});

// ================= 11. GALERÍA HARDWARE Y VISOR STL =================
document.getElementById('btn-cad-wire')?.addEventListener('click', (e) => {
  const on = cadInspector.toggleWireframe();
  e.currentTarget.textContent = on ? '🧊 Vista Sólida' : '🕸️ Malla Wireframe';
});

document.getElementById('btn-cad-rot')?.addEventListener('click', (e) => {
  const on = cadInspector.toggleAutoRotate();
  e.currentTarget.textContent = on ? '⏸ Pausar Giro' : '🔄 Auto-Rotar';
});

document.getElementById('btn-cad-reset')?.addEventListener('click', () => {
  cadInspector.resetCamera();
});

document.querySelectorAll('.gallery-item img').forEach((img) => {
  img.addEventListener('click', () => {
    if (!lightbox || !lightboxImg) return;
    lightboxImg.src = img.src;
    lightboxImg.alt = img.alt;
    lightbox.classList.add('open');
  });
});
lightbox?.addEventListener('click', () => lightbox.classList.remove('open'));

// ================= 12. PUENTE EN VIVO WEBSOCKET CON SNIFFER RASPBERRY PI 5 =================
wsBtn?.addEventListener('click', () => {
  const url = wsInput?.value.trim();
  if (!url) return;
  try {
    if (wsClient) wsClient.close();
    if (wsStatus) {
      wsStatus.textContent = `Conectando a ${url}...`;
      wsStatus.style.color = '#fbbf24';
    }
    wsClient = new WebSocket(url);
    wsClient.onopen = () => {
      if (wsStatus) {
        wsStatus.textContent = `✓ Conectado en vivo a Sniffer RPi 5 (${url})`;
        wsStatus.style.color = '#34d399';
      }
      const badge = document.getElementById('gw-link-badge');
      if (badge) badge.textContent = 'RPi5 LIVE WS';
    };
    wsClient.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        sim.ingestExternalTelemetry(data);
      } catch (_) {}
    };
    wsClient.onerror = () => {
      if (wsStatus) {
        wsStatus.textContent = 'No se detectó servidor WS local (usando motor de simulación interno).';
        wsStatus.style.color = '#f87171';
      }
    };
    wsClient.onclose = () => {
      sim.externalHardwareConnected = false;
      const badge = document.getElementById('gw-link-badge');
      if (badge) badge.textContent = 'ESP32 RX';
    };
  } catch (err) {
    if (wsStatus) {
      wsStatus.textContent = `Error URL WebSocket: ${err.message}`;
      wsStatus.style.color = '#f87171';
    }
  }
});

// ================= 13. BUCLE PRINCIPAL DE ANIMACIÓN Y RENDERIZADO =================
let lastFrameTime = null;

function stepFrame(now) {
  const ts = typeof now === 'number' ? now : performance.now();
  const rawDt = lastFrameTime === null ? 0.016 : (ts - lastFrameTime) / 1000;
  const dt = rawDt > 0 ? Math.min(0.05, Math.max(0.001, rawDt)) : 0.016;
  lastFrameTime = ts;

  sim.update(dt);
  if (experienceStarted) {
    sound.updateSeismicRumble(sim.accel.dynamicG);
  }

  if (scene3d) {
    scene3d.update(dt);
  }
  updateHudTelemetry();

  if (activeView === 'gallery') {
    cadInspector.render();
  } else if (activeView === 'console') {
    consoleRefreshTimer += dt;
    if (consoleRefreshTimer >= (sim.quakeActive ? 0.25 : 1.0)) {
      consoleRefreshTimer = 0;
      refreshConsoleData();
    }
  }
}

if (scene3d) {
  scene3d.renderer.setAnimationLoop(stepFrame);
} else {
  const fallbackLoop = (t) => {
    stepFrame(t);
    requestAnimationFrame(fallbackLoop);
  };
  requestAnimationFrame(fallbackLoop);
}

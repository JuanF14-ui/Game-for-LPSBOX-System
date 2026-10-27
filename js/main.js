// js/main.js — Controlador principal UI, Pantalla de Inicio, Consola Gateway RPi5, Mapa RSSI y WebXR

import { SoundEngine } from './audio.js';
import { LPSBoxSimulation, ZONES, ASSEMBLY_POINT, GATEWAY_WORLD_POS } from './simulation.js';
import { LPSBoxScene3D } from './scene3d.js';
import { StlCadInspector } from './stlViewer.js';

// ================= 1. REFERENCIAS DOM (DECLARADAS ARRIBA SIN TDZ) =================
const simCanvasWrap = document.getElementById('sim-canvas-wrap');
const cadCanvasWrap = document.getElementById('cad-canvas-wrap');
const stlBanner = document.getElementById('stl-loading-banner');
const stlText = document.getElementById('stl-loading-text');

const startOverlay = document.getElementById('start-experience-overlay');
const startStlStatus = document.getElementById('start-stl-status');
const btnStartExp = document.getElementById('btn-start-experience');
const btnStartMild = document.getElementById('btn-start-mild');
const btnStartMajor = document.getElementById('btn-start-major');

const navTabs = document.querySelectorAll('.nav-tab');
const panelViews = {
  console: document.getElementById('view-console'),
  docs: document.getElementById('view-docs'),
  gallery: document.getElementById('view-gallery')
};

const tickerLog = document.getElementById('ticker-log');
const tickerClock = document.getElementById('ticker-clock');

const elLedBlue = document.getElementById('led-blue');
const elLedBlink = document.getElementById('led-blink');
const elLedYellow = document.getElementById('led-yellow');
const elNavDot = document.getElementById('nav-gateway-dot');
const elBtnExtract = document.getElementById('btn-extract-gateway');
const elBtnToggleHolo = document.getElementById('btn-toggle-holo');

const elOledBox = document.getElementById('hud-sniffer-oled');
const elOledSta = document.getElementById('oled-sta');
const elOledTitle = document.getElementById('oled-title');
const elOledSub = document.getElementById('oled-sub');
const elStatAccel = document.getElementById('stat-accel');
const elStatStaLta = document.getElementById('stat-stalta');
const miniSeismoCanvas = document.getElementById('mini-seismo-canvas');
const miniSeismoCtx = miniSeismoCanvas ? miniSeismoCanvas.getContext('2d') : null;

const pillChallenge = document.getElementById('pill-challenge');
const pillSandbox = document.getElementById('pill-sandbox');
const sandboxControls = document.getElementById('sandbox-controls');
const sliderPeople = document.getElementById('slider-people');
const valPeople = document.getElementById('val-people');
const sliderMag = document.getElementById('slider-mag');
const valMag = document.getElementById('val-mag');
const selectNoise = document.getElementById('select-mac-noise');
const valNoise = document.getElementById('val-noise');

const chkMacFilter = document.getElementById('chk-mac-filter');
const rssiCanvas = document.getElementById('rssi-map-canvas');
const rssiCtx = rssiCanvas ? rssiCanvas.getContext('2d') : null;

const zoneInputs = ['a', 'b', 'c', 'd'].map((k) => document.getElementById(`inp-zone-${k}`));
const zoneSumHelper = document.getElementById('zone-sum-helper');

const lightbox = document.getElementById('img-lightbox');
const lightboxImg = document.getElementById('lightbox-img');

const btnAudio = document.getElementById('btn-audio');
const btnXr = document.getElementById('btn-xr');
const btnWs = document.getElementById('btn-ws-connect');
const wsInput = document.getElementById('ws-url-input');
const wsStatus = document.getElementById('ws-status');

// ================= 2. ESTADO GLOBAL DE APLICACIÓN =================
const sound = new SoundEngine();
let activeView = 'sim';
let experienceStarted = false;
let consoleRefreshTimer = 0;
let wsClient = null;
let currentXrSession = null;

function appendLogEntry({ time = 0, text = '', level = 'info' }) {
  if (!tickerLog) return;
  const div = document.createElement('div');
  div.className = `ticker-entry ${level}`;
  div.innerHTML = `<span class="ts">[${Number(time).toFixed(1)}s]</span>${text}`;
  tickerLog.prepend(div);
  while (tickerLog.children.length > 24) {
    tickerLog.removeChild(tickerLog.lastChild);
  }
}

function syncScenarioButtons(sc) {
  const bNorm = document.getElementById('btn-sc-normal');
  const bMild = document.getElementById('btn-sc-mild');
  const bMajor = document.getElementById('btn-sc-major');
  if (bNorm) bNorm.classList.toggle('active', sc === 'normal');
  if (bMild) bMild.classList.toggle('active', sc === 'mild');
  if (bMajor) bMajor.classList.toggle('active', sc === 'major');
}

function syncCameraButtons(mode) {
  document.querySelectorAll('.cam-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.cam === mode);
  });
}

// ================= 3. INICIALIZACIÓN MOTOR SIMULACIÓN Y ESCENA 3D =================
const sim = new LPSBoxSimulation({
  onLog: (entry) => appendLogEntry(entry),
  onScenarioChange: (sc) => syncScenarioButtons(sc),
  onSnapshotCaptured: (snap) => {
    if (experienceStarted) {
      if (snap.scenario === 'major') {
        sound.startSnifferAlarm('major');
        sound.speakSnifferVoice(
          'Alerta sísmica severa detectada. Enviando datos de ocupación al Gateway. Evacúe de inmediato.'
        );
      } else {
        sound.startSnifferAlarm('mild');
        sound.speakSnifferVoice(
          'Sismo leve detectado. Enviando datos preventivos al Gateway. Mantenga la calma.'
        );
      }
    }
    refreshConsoleData();
  },
  onTableHit: () => {
    sound.playTableShockwave();
  },
  onPacketHeartbeat: () => {
    if (experienceStarted && activeView === 'sim' && !sim.quakeActive) {
      if (sound.ctx && !sound.muted) sound.playPacketBlip();
    }
  }
});

let scene3d = null;
try {
  scene3d = new LPSBoxScene3D(simCanvasWrap, sim, {
    onStlReady: () => {
      if (stlText) stlText.textContent = '✓ modelo3d.stl cargado en el Nodo Sniffer 3D';
      if (startStlStatus) {
        startStlStatus.textContent = '✓ ESCENA 3D ACTIVA · MODELO3D.STL LISTO (50,000 TRIÁNGULOS)';
      }
      setTimeout(() => stlBanner?.classList.add('hidden'), 1400);
    },
    onStlError: () => {
      stlBanner?.classList.add('hidden');
    },
    onExtractGateway: () => openGatewayConsole(),
    onHitDesk: () => {
      sound.ensureContext();
      sim.triggerPhysicalTableHit();
    },
    onCameraModeChanged: (camMode) => syncCameraButtons(camMode)
  });
} catch (err) {
  stlBanner?.classList.add('hidden');
  appendLogEntry({
    time: 0,
    text: `Aviso WebGL: ${err.message || 'Renderizador limitado en este navegador'}. Consola de telemetría disponible.`,
    level: 'warn'
  });
}

const cadInspector = new StlCadInspector(cadCanvasWrap);

appendLogEntry({
  time: 0,
  text: 'Sistema LPSBOX en línea. Pulsa «Iniciar Experiencia» para tomar el mando como Operario.',
  level: 'ok'
});

// ================= 4. BOTÓN DE INICIO DE LA EXPERIENCIA =================
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

  if (initialScenario === 'mild') {
    sim.triggerSeismicScenario('mild');
  } else if (initialScenario === 'major') {
    sim.triggerSeismicScenario('major');
  } else {
    appendLogEntry({
      time: sim.time,
      text: 'Turno de Operario iniciado. Selecciona «Sismo Tranqui» o «Terremoto Severo» en el panel izquierdo.',
      level: 'ok'
    });
  }
}

btnStartExp?.addEventListener('click', () => startExperience(null));
btnStartMild?.addEventListener('click', () => startExperience('mild'));
btnStartMajor?.addEventListener('click', () => startExperience('major'));

// ================= 5. NAVEGACIÓN ENTRE VISTAS =================
function switchView(viewName) {
  if (!experienceStarted && startOverlay) {
    experienceStarted = true;
    startOverlay.classList.add('dismissed');
    scene3d?.stopIntroOrbit();
  }
  activeView = viewName;
  navTabs.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });
  Object.entries(panelViews).forEach(([k, el]) => {
    if (el) el.classList.toggle('active', k === viewName);
  });

  if (viewName === 'console') {
    sim.dataExtractedByOperator = true;
    refreshConsoleData();
  } else if (viewName === 'gallery') {
    cadInspector.initIfNeeded();
  }
}

navTabs.forEach((btn) => {
  btn.addEventListener('click', () => {
    sound.ensureContext();
    if (btn.dataset.view === 'console') {
      sound.playUsbConnect();
    }
    switchView(btn.dataset.view);
  });
});

document.getElementById('btn-back-sim')?.addEventListener('click', () => switchView('sim'));
document.querySelectorAll('[data-goto-sim]').forEach((b) => {
  b.addEventListener('click', () => switchView('sim'));
});

function openGatewayConsole() {
  sound.ensureContext();
  sound.playUsbConnect();
  switchView('console');
}

elBtnExtract?.addEventListener('click', openGatewayConsole);

document.querySelectorAll('[data-collapse]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const card = document.getElementById(btn.dataset.collapse);
    if (!card) return;
    const collapsed = card.classList.toggle('collapsed');
    btn.textContent = collapsed ? '+' : '−';
  });
});

// ================= 6. AUDIO Y MODO VR / MR (WebXR) =================
btnAudio?.addEventListener('click', () => {
  sound.ensureContext();
  sound.setMuted(!sound.muted);
  btnAudio.textContent = sound.muted ? '🔇 Silencio' : '🔊 Audio';
});

btnXr?.addEventListener('click', async () => {
  if (!experienceStarted) startExperience(null);
  sound.ensureContext();
  if (!scene3d || !('xr' in navigator)) {
    appendLogEntry({
      time: sim.time,
      text: 'WebXR requiere Meta Quest Browser o visor XR compatible. Activando cámara Operario en 1ra Persona (WASD).',
      level: 'warn'
    });
    scene3d?.setCameraMode('firstperson');
    syncCameraButtons('firstperson');
    return;
  }

  try {
    if (currentXrSession) {
      await currentXrSession.end();
      return;
    }
    const arOk = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
    const vrOk = await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
    const mode = arOk ? 'immersive-ar' : vrOk ? 'immersive-vr' : null;

    if (!mode) {
      appendLogEntry({
        time: sim.time,
        text: 'No se detectó casco VR/MR conectado. Activando modo Operario en 1ra Persona (WASD).',
        level: 'info'
      });
      scene3d.setCameraMode('firstperson');
      syncCameraButtons('firstperson');
      return;
    }

    const session = await navigator.xr.requestSession(mode, {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
    });
    currentXrSession = session;
    btnXr.classList.add('active-xr');
    btnXr.textContent = '⏹ Salir XR';
    if (mode === 'immersive-ar') {
      scene3d.scene.background = null;
    }
    await scene3d.renderer.xr.setSession(session);
    session.addEventListener('end', () => {
      currentXrSession = null;
      btnXr.classList.remove('active-xr');
      btnXr.textContent = '🥽 Entrar VR / MR';
      scene3d.restoreBackground();
    });
  } catch (err) {
    appendLogEntry({
      time: sim.time,
      text: `Sesión XR no iniciada (${err.message || 'visor no disponible'}). Modo 3D escritorio activo.`,
      level: 'warn'
    });
  }
});

// ================= 7. CONTROLADOR DE ESCENARIOS SÍSMICOS =================
document.getElementById('btn-sc-normal')?.addEventListener('click', () => {
  if (!experienceStarted) startExperience(null);
  sound.ensureContext();
  sound.stopAlarmLoop();
  sim.setNormalMonitoring();
  if (elBtnToggleHolo) elBtnToggleHolo.style.display = 'none';
});

document.getElementById('btn-sc-mild')?.addEventListener('click', () => {
  if (!experienceStarted) startExperience(null);
  sound.ensureContext();
  sim.triggerSeismicScenario('mild');
});

document.getElementById('btn-sc-major')?.addEventListener('click', () => {
  if (!experienceStarted) startExperience(null);
  sound.ensureContext();
  sim.triggerSeismicScenario('major');
});

document.getElementById('btn-sc-hit')?.addEventListener('click', () => {
  if (!experienceStarted) startExperience(null);
  sound.ensureContext();
  sim.triggerPhysicalTableHit();
});

document.getElementById('btn-console-mild')?.addEventListener('click', () => {
  sound.ensureContext();
  sim.triggerSeismicScenario('mild');
  setTimeout(refreshConsoleData, 950);
});

document.getElementById('btn-console-major')?.addEventListener('click', () => {
  sound.ensureContext();
  sim.triggerSeismicScenario('major');
  setTimeout(refreshConsoleData, 950);
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
  if (sliderPeople) sliderPeople.value = String(sim.people.length);
  if (valPeople) valPeople.textContent = String(sim.people.length);
});

sliderPeople?.addEventListener('input', () => {
  const n = Number(sliderPeople.value);
  if (valPeople) valPeople.textContent = String(n);
  sim.spawnWithTotalCount(n);
});

sliderMag?.addEventListener('input', () => {
  sim.customMagnitude = Number(sliderMag.value);
  if (valMag) valMag.textContent = `${sim.customMagnitude.toFixed(1)} Mw`;
});

document.getElementById('btn-trigger-custom')?.addEventListener('click', () => {
  if (!experienceStarted) startExperience(null);
  sound.ensureContext();
  sim.triggerSeismicScenario('custom', Number(sliderMag.value));
});

selectNoise?.addEventListener('change', () => {
  sim.macNoiseLevel = selectNoise.value;
  if (valNoise) {
    valNoise.textContent =
      selectNoise.value === 'low' ? 'Bajo' : selectNoise.value === 'high' ? 'Alto' : 'Medio';
  }
});

document.getElementById('btn-new-mission')?.addEventListener('click', () => {
  if (!experienceStarted) startExperience(null);
  sound.ensureContext();
  sound.stopAlarmLoop();
  sim.spawnMissionRandom();
  document.getElementById('report-result')?.classList.remove('visible');
  if (elBtnToggleHolo) elBtnToggleHolo.style.display = 'none';
  if (!sim.challengeMode) {
    if (sliderPeople) sliderPeople.value = String(sim.people.length);
    if (valPeople) valPeople.textContent = String(sim.people.length);
  }
});

document.querySelectorAll('.cam-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!experienceStarted) startExperience(null);
    scene3d?.setCameraMode(btn.dataset.cam);
    syncCameraButtons(btn.dataset.cam);
  });
});

document.getElementById('chk-mr-vision')?.addEventListener('change', (e) => {
  if (scene3d) scene3d.mrVisionEnabled = e.target.checked;
});

elBtnToggleHolo?.addEventListener('click', () => {
  sim.showPreQuakeHologram = !sim.showPreQuakeHologram;
});

// ================= 8. SINCRONIZACIÓN HUD Y SISMÓGRAFO =================
function drawSeismogram(ctx, w, h, detailed = false) {
  if (!ctx) return;
  ctx.fillStyle = '#050a12';
  ctx.fillRect(0, 0, w, h);

  const threshY = h - (3.0 / 10.0) * (h - 10) - 5;
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, threshY);
  ctx.lineTo(w, threshY);
  ctx.stroke();
  ctx.setLineDash([]);

  if (detailed) {
    ctx.fillStyle = '#f87171';
    ctx.font = '11px monospace';
    ctx.fillText('Umbral Disparo STA/LTA = 3.0', 8, threshY - 5);
  }

  const hist = sim.seismoHistory;
  if (hist.length < 2) return;

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  hist.forEach((pt, idx) => {
    const x = (idx / (hist.length - 1)) * w;
    const normA = Math.min(1, pt.accelG / 0.75);
    const y = h - 5 - normA * (h - 12);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = detailed ? 2.2 : 1.6;
  ctx.beginPath();
  hist.forEach((pt, idx) => {
    const x = (idx / (hist.length - 1)) * w;
    const normR = Math.min(1, pt.ratio / 10.0);
    const y = h - 5 - normR * (h - 12);
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
  elBtnExtract?.classList.toggle('glow-ready', sim.gatewayLeds.yellow && !sim.dataExtractedByOperator);

  const s1 = document.getElementById('mstep-1');
  const s2 = document.getElementById('mstep-2');
  const s3 = document.getElementById('mstep-3');
  const s4 = document.getElementById('mstep-4');

  const hasEventStarted = sim.quakeActive || Boolean(sim.frozenSnapshot);
  const hasSnapshot = Boolean(sim.frozenSnapshot);
  const hasExtracted = sim.dataExtractedByOperator && hasSnapshot;
  const hasReported = sim.reportSubmitted;

  if (s1) s1.className = `mission-step ${hasEventStarted ? 'done' : 'current'}`;
  if (s2) s2.className = `mission-step ${hasSnapshot ? 'done' : hasEventStarted ? 'current' : ''}`;
  if (s3) s3.className = `mission-step ${hasExtracted ? 'done' : hasSnapshot ? 'current' : ''}`;
  if (s4) s4.className = `mission-step ${hasReported ? 'done' : hasExtracted ? 'current' : ''}`;

  if (elOledSta) elOledSta.textContent = `STA/LTA: ${sim.staLtaRatio.toFixed(2)}`;
  if (elOledBox && elOledTitle && elOledSub) {
    if (sim.scenario === 'major' && hasEventStarted) {
      elOledBox.className = 'sniffer-oled state-major';
      elOledTitle.textContent = 'ALERTA SÍSMICA';
      elOledSub.textContent = 'Enviando datos t₀ al Gateway';
    } else if (sim.scenario === 'mild' && hasEventStarted) {
      elOledBox.className = 'sniffer-oled state-mild';
      elOledTitle.textContent = 'SISMO LEVE';
      elOledSub.textContent = 'Enviando datos preventivos';
    } else {
      elOledBox.className = 'sniffer-oled state-normal';
      elOledTitle.textContent = 'MONITOREO';
      elOledSub.textContent = `Ventana 10s: ${sim.rollingProbes.length} tramas`;
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

// ================= 9. CONSOLA DE EXTRACCIÓN GATEWAY RPi5 =================
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

function worldToMap(wx, wz) {
  const x = ((wx + 12) / 24) * rssiCanvas.width;
  const y = ((wz + 9.5) / 21.5) * rssiCanvas.height;
  return { x, y };
}

function mapToWorld(cx, cy) {
  const wx = (cx / rssiCanvas.width) * 24 - 12;
  const wz = (cy / rssiCanvas.height) * 21.5 - 9.5;
  return { x: wx, z: wz };
}

rssiCanvas?.addEventListener('click', (e) => {
  const rect = rssiCanvas.getBoundingClientRect();
  const cx = ((e.clientX - rect.left) / rect.width) * rssiCanvas.width;
  const cy = ((e.clientY - rect.top) / rect.height) * rssiCanvas.height;
  sim.userMapPins.push(mapToWorld(cx, cy));
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

  rssiCtx.strokeStyle = 'rgba(56, 189, 248, 0.07)';
  rssiCtx.lineWidth = 1;
  for (let gx = 0; gx < w; gx += 38) {
    rssiCtx.beginPath();
    rssiCtx.moveTo(gx, 0);
    rssiCtx.lineTo(gx, h);
    rssiCtx.stroke();
  }
  for (let gy = 0; gy < h; gy += 38) {
    rssiCtx.beginPath();
    rssiCtx.moveTo(0, gy);
    rssiCtx.lineTo(w, gy);
    rssiCtx.stroke();
  }

  ZONES.forEach((zone) => {
    const tl = worldToMap(zone.bounds.xMin, zone.bounds.zMin);
    const br = worldToMap(zone.bounds.xMax, zone.bounds.zMax);
    const zw = br.x - tl.x;
    const zh = br.y - tl.y;

    const isCollapsed = sim.collapsedZones.has(zone.id);
    rssiCtx.fillStyle = isCollapsed ? 'rgba(239, 68, 68, 0.14)' : 'rgba(19, 32, 54, 0.72)';
    rssiCtx.fillRect(tl.x, tl.y, zw, zh);

    rssiCtx.strokeStyle = zone.color;
    rssiCtx.lineWidth = 2;
    rssiCtx.strokeRect(tl.x, tl.y, zw, zh);

    rssiCtx.fillStyle = zone.color;
    rssiCtx.font = 'bold 13px monospace';
    rssiCtx.fillText(`${zone.shortName}${isCollapsed ? ' [COLAPSO PARCIAL]' : ''}`, tl.x + 8, tl.y + 18);
  });

  const snPos = worldToMap(0, -1.85);
  rssiCtx.fillStyle = '#38bdf8';
  rssiCtx.beginPath();
  rssiCtx.arc(snPos.x, snPos.y, 7, 0, Math.PI * 2);
  rssiCtx.fill();
  rssiCtx.font = 'bold 11px monospace';
  rssiCtx.fillText('SNIFFER', snPos.x - 24, snPos.y - 11);

  const ap = worldToMap(ASSEMBLY_POINT.x, ASSEMBLY_POINT.z);
  rssiCtx.strokeStyle = '#10b981';
  rssiCtx.lineWidth = 2;
  rssiCtx.beginPath();
  rssiCtx.arc(ap.x, ap.y, 38, 0, Math.PI * 2);
  rssiCtx.stroke();
  rssiCtx.fillStyle = '#6ee7b7';
  rssiCtx.fillText('PUNTO DE ENCUENTRO', ap.x - 62, ap.y + 52);

  const gw = worldToMap(GATEWAY_WORLD_POS.x, GATEWAY_WORLD_POS.z);
  rssiCtx.fillStyle = '#fbbf24';
  rssiCtx.fillRect(gw.x - 10, gw.y - 8, 20, 16);
  rssiCtx.fillText('GATEWAY RPi5', gw.x - 42, gw.y + 24);

  packets.forEach((pkt) => {
    const pt = worldToMap(pkt.estX, pkt.estZ);
    const personNow = sim.people.find((p) => p.id === pkt.personId);
    const lost = personNow && (personNow.state === 'trapped' || !personNow.phoneOnline);
    const evac = personNow && personNow.state === 'evacuated';

    rssiCtx.fillStyle = pkt.isDuplicateRandomBurst
      ? 'rgba(245, 158, 11, 0.12)'
      : 'rgba(56, 189, 248, 0.16)';
    rssiCtx.beginPath();
    rssiCtx.arc(pt.x, pt.y, 14, 0, Math.PI * 2);
    rssiCtx.fill();

    rssiCtx.fillStyle = pkt.isDuplicateRandomBurst
      ? '#fbbf24'
      : lost
        ? '#ef4444'
        : evac
          ? '#10b981'
          : '#38bdf8';
    rssiCtx.beginPath();
    rssiCtx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
    rssiCtx.fill();
  });

  sim.userMapPins.forEach((pin, idx) => {
    const pt = worldToMap(pin.x, pin.z);
    rssiCtx.strokeStyle = '#fbbf24';
    rssiCtx.lineWidth = 2;
    rssiCtx.beginPath();
    rssiCtx.arc(pt.x, pt.y, 10, 0, Math.PI * 2);
    rssiCtx.stroke();
    rssiCtx.fillStyle = '#fef08a';
    rssiCtx.font = 'bold 11px monospace';
    rssiCtx.fillText(`R${idx + 1}`, pt.x + 12, pt.y + 4);
  });
}

function refreshConsoleData() {
  const snap = sim.frozenSnapshot;
  const banner = document.getElementById('console-snapshot-banner');
  const bannerText = document.getElementById('console-banner-text');

  if (banner && bannerText) {
    if (snap) {
      banner.className = 'snapshot-status-banner has-event';
      bannerText.innerHTML =
        `<strong>🟡 LED Amarillo Activo — Snapshot Pre-Sismo <code>t₀ = ${snap.triggerTime.toFixed(1)}s</code> (${snap.magnitude.toFixed(1)} Mw):</strong> ` +
        `Datos congelados por el Sniffer al cruzar <code>STA/LTA = ${snap.triggerStaLta.toFixed(2)}</code> justo antes de la evacuación/colapso.`;
    } else {
      banner.className = 'snapshot-status-banner no-event';
      bannerText.innerHTML =
        `<strong>🔵 LED Azul Activo (Sin evento sísmico aún):</strong> Mostrando buffer circular en vivo (últimos 10s). ` +
        `Usa los botones de la derecha para disparar un sismo y capturar el estado <code>t₀</code>.`;
    }
  }

  const rawPackets = snap ? snap.rawPackets : sim.rollingProbes;
  const filterEnabled = chkMacFilter ? chkMacFilter.checked : true;

  let displayedRows = [];
  if (filterEnabled) {
    const map = new Map();
    rawPackets.forEach((pkt) => {
      if (!pkt.isDuplicateRandomBurst) {
        map.set(pkt.deviceHash, pkt);
      }
    });
    displayedRows = Array.from(map.values());
  } else {
    displayedRows = [...rawPackets];
  }

  const randDiscarded = rawPackets.filter((p) => p.isDuplicateRandomBurst).length;
  const uniqueCount = new Set(rawPackets.filter((p) => !p.isDuplicateRandomBurst).map((p) => p.deviceHash)).size;

  const elRaw = document.getElementById('kpi-raw');
  const elRand = document.getElementById('kpi-rand');
  const elUniq = document.getElementById('kpi-unique');
  const elSta = document.getElementById('kpi-stalta');

  if (elRaw) elRaw.textContent = String(rawPackets.length);
  if (elRand) elRand.textContent = String(randDiscarded);
  if (elUniq) {
    elUniq.textContent = filterEnabled
      ? String(displayedRows.length)
      : `${rawPackets.length} (¡Sin filtrar!)`;
  }
  if (elSta) elSta.textContent = (snap ? snap.triggerStaLta : sim.staLtaRatio).toFixed(2);

  const tbody = document.getElementById('probe-tbody');
  if (tbody) {
    tbody.innerHTML = '';
    displayedRows.sort((a, b) => a.estimatedZone.localeCompare(b.estimatedZone));

    displayedRows.forEach((pkt) => {
      const personNow = sim.people.find((p) => p.id === pkt.personId);
      let postBadge = '<span class="tag tag-ok">Activa en sala</span>';
      if (personNow) {
        if (personNow.state === 'evacuated') {
          postBadge = '<span class="tag tag-ok">✓ Punto Encuentro</span>';
        } else if (personNow.state === 'trapped' || !personNow.phoneOnline) {
          postBadge = '<span class="tag tag-lost">✕ Señal perdida / Atrapado</span>';
        } else if (personNow.state.startsWith('evacuating')) {
          postBadge = '<span class="tag tag-rand">→ Evacuando</span>';
        }
      }

      const r = pkt.rssiByZone;
      const tr = document.createElement('tr');
      if (pkt.isDuplicateRandomBurst) tr.className = 'random-mac';

      tr.innerHTML = `
        <td><strong>${pkt.isDuplicateRandomBurst ? 'LAA-BURST' : pkt.deviceHash}</strong></td>
        <td>${pkt.mac}</td>
        <td>
          ${pkt.proto} · Ch ${pkt.channel}<br/>
          <span class="tag ${pkt.isDuplicateRandomBurst ? 'tag-rand' : 'tag-ok'}">
            ${pkt.isDuplicateRandomBurst ? 'Duplicado MAC Random' : pkt.vendor}
          </span>
        </td>
        <td>A:${r.A} | B:${r.B} | C:${r.C} | D:${r.D} dBm</td>
        <td><span class="tag tag-zone">Zona ${pkt.estimatedZone}</span> (${pkt.peakRssi} dBm)</td>
        <td>${postBadge}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  drawTacticalRssiMap(displayedRows);

  const fullSeismo = document.getElementById('full-seismo-canvas');
  if (fullSeismo) {
    drawSeismogram(fullSeismo.getContext('2d'), fullSeismo.width, fullSeismo.height, true);
  }

  const zoneSummary = { A: 0, B: 0, C: 0, D: 0 };
  const displayedZoneCounts = { A: 0, B: 0, C: 0, D: 0 };
  const lostByZone = { A: 0, B: 0, C: 0, D: 0 };
  displayedRows.forEach((d) => {
    if (displayedZoneCounts[d.estimatedZone] !== undefined) {
      displayedZoneCounts[d.estimatedZone]++;
    }
    if (!d.isDuplicateRandomBurst && zoneSummary[d.estimatedZone] !== undefined) {
      zoneSummary[d.estimatedZone]++;
      const pNow = sim.people.find((p) => p.id === d.personId);
      if (pNow && (pNow.state === 'trapped' || !pNow.phoneOnline)) {
        lostByZone[d.estimatedZone]++;
      }
    }
  });

  const summaryEl = document.getElementById('zone-rssi-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <span><strong>Triangulación Pre-Sismo (${filterEnabled ? 'Filtrada 10s' : '¡Bruta sin filtrar!'}):</strong></span>
      <span style="color:#38bdf8;">Zona A (Lab): <strong>${displayedZoneCounts.A}</strong>${lostByZone.A ? ` <em style="color:#f87171;">(${lostByZone.A} sin señal)</em>` : ''}</span>
      <span style="color:#c084fc;">Zona B (Serv.): <strong>${displayedZoneCounts.B}</strong>${lostByZone.B ? ` <em style="color:#f87171;">(${lostByZone.B} sin señal)</em>` : ''}</span>
      <span style="color:#fbbf24;">Zona C (Audit.): <strong>${displayedZoneCounts.C}</strong>${lostByZone.C ? ` <em style="color:#f87171;">(${lostByZone.C} sin señal)</em>` : ''}</span>
      <span style="color:#34d399;">Zona D (Cafet.): <strong>${displayedZoneCounts.D}</strong>${lostByZone.D ? ` <em style="color:#f87171;">(${lostByZone.D} sin señal)</em>` : ''}</span>
    `;
  }

  const mqttPayload = {
    gateway_id: 'lpsbox-rpi5-bogota-01',
    event_captured: Boolean(snap),
    timestamp_t0_sec: snap ? Number(snap.triggerTime.toFixed(2)) : Number(sim.time.toFixed(2)),
    seismic_mpu6050: {
      sta_lta_ratio: Number((snap ? snap.triggerStaLta : sim.staLtaRatio).toFixed(3)),
      threshold: sim.staLtaThreshold,
      peak_accel_g: Number((snap ? snap.peakAccelG : sim.accel.dynamicG).toFixed(4))
    },
    sniffer_10s_window: {
      raw_probe_requests: rawPackets.length,
      mac_random_bursts_filtered: randDiscarded,
      filtered_unique_phones: uniqueCount,
      estimated_zones_t0: zoneSummary
    },
    leds: { ...sim.gatewayLeds }
  };
  const mqttPre = document.getElementById('mqtt-json-preview');
  if (mqttPre) mqttPre.textContent = JSON.stringify(mqttPayload, null, 2);
}

// ================= 10. REPORTE DEL OPERARIO Y CALIFICACIÓN =================
zoneInputs.forEach((inp) => {
  inp?.addEventListener('input', () => {
    const sum = zoneInputs.reduce((acc, el) => acc + Number(el?.value || 0), 0);
    if (zoneSumHelper) {
      zoneSumHelper.textContent = `Suma actual ingresada por zonas: ${sum} personas`;
    }
  });
});

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
  const priorityZoneGuess = document.getElementById('inp-priority-zone')?.value || 'A';

  const evalRes = sim.evaluateOperatorReport({ totalGuess, zoneGuesses, priorityZoneGuess });

  const resultBox = document.getElementById('report-result');
  const scoreEl = document.getElementById('res-score');
  const fbEl = document.getElementById('res-feedback');

  if (scoreEl) {
    scoreEl.textContent = `${evalRes.score}/100`;
    scoreEl.style.color = evalRes.score >= 85 ? '#34d399' : evalRes.score >= 60 ? '#fbbf24' : '#f87171';
  }

  const zRows = ['A', 'B', 'C', 'D']
    .map((z) => {
      const d = evalRes.zoneDetails[z];
      const mark = d.exact ? '✓' : '≠';
      return `Zona ${z}: reportaste <strong>${d.guess}</strong> / real <strong>${d.truth}</strong> (${mark})`;
    })
    .join('<br/>');

  let extraNote = '';
  if (evalRes.usedUnfilteredRaw) {
    extraNote =
      `<p style="color:#fcd34d; margin-top:6px;">⚠️ <strong>Nota de Ingeniería:</strong> Ingresaste el conteo bruto (${evalRes.rawPacketCount}) sin filtrar las MACs aleatorias en la ventana de 10 segundos. ¡Activa siempre el filtro anti-MAC-randomization!</p>`;
  }

  if (fbEl) {
    fbEl.innerHTML = `
      <p><strong>Total antes del sismo (t₀):</strong> Reportaste <strong>${evalRes.totalGuess}</strong> personas · Realidad: <strong>${evalRes.truthTotal}</strong> personas.</p>
      <div style="margin: 6px 0; font-family: var(--font-mono); font-size: 11.5px;">${zRows}</div>
      <p><strong>Prioridad USAR:</strong> Sector óptimo <strong>Zona ${evalRes.bestPriorityZone}</strong> ${evalRes.priorityCorrect ? '(¡Acertaste!)' : ''}.</p>
      ${extraNote}
    `;
  }

  resultBox?.classList.add('visible');
  if (elBtnToggleHolo) elBtnToggleHolo.style.display = 'inline-flex';
  appendLogEntry({
    time: sim.time,
    text: `Reporte de Operario evaluado: ${evalRes.score}/100 pts. Hologramas 3D pre-sismo (t₀) activados.`,
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

// ================= 12. CONECTOR WEBSOCKET EN VIVO RASPBERRY PI 5 =================
btnWs?.addEventListener('click', () => {
  const url = wsInput?.value.trim();
  if (!url) return;
  if (wsClient) {
    wsClient.close();
    wsClient = null;
  }
  if (wsStatus) {
    wsStatus.textContent = `Conectando a ${url}...`;
    wsStatus.style.color = '#fbbf24';
  }

  try {
    wsClient = new WebSocket(url);
    wsClient.onopen = () => {
      if (wsStatus) {
        wsStatus.textContent = `✓ Conectado en vivo a Raspberry Pi 5 (${url})`;
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
      if (badge) badge.textContent = 'RPi5 + ESP32';
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
  } else if (activeView === 'console' && !sim.frozenSnapshot) {
    consoleRefreshTimer += dt;
    if (consoleRefreshTimer >= 1.2) {
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

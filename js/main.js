// js/main.js — Controlador principal UI, Consola Gateway RPi5, Mapa RSSI, Reporte Operario y WebXR

import { SoundEngine } from './audio.js';
import { LPSBoxSimulation, ZONES, ASSEMBLY_POINT, GATEWAY_WORLD_POS } from './simulation.js';
import { LPSBoxScene3D } from './scene3d.js';
import { StlCadInspector } from './stlViewer.js';

const sound = new SoundEngine();
let activeView = 'sim';
let consoleRefreshTimer = 0;
let wsClient = null;

// ================= INITIALIZE SIMULATION & 3D SCENE =================
const sim = new LPSBoxSimulation({
  onLog: (entry) => appendLogEntry(entry),
  onScenarioChange: (sc) => syncScenarioButtons(sc),
  onSnapshotCaptured: (snap) => {
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
    refreshConsoleData();
  },
  onTableHit: () => {
    sound.playTableShockwave();
  },
  onPacketHeartbeat: () => {
    if (activeView === 'sim' && !sim.quakeActive) {
      // Very subtle tick only if audio already unlocked
      if (sound.ctx && !sound.muted) sound.playPacketBlip();
    }
  }
});

const simCanvasWrap = document.getElementById('sim-canvas-wrap');
const stlBanner = document.getElementById('stl-loading-banner');
const stlText = document.getElementById('stl-loading-text');

const scene3d = new LPSBoxScene3D(simCanvasWrap, sim, {
  onStlReady: () => {
    stlText.textContent = '✓ modelo3d.stl cargado en el Nodo Sniffer 3D';
    setTimeout(() => stlBanner.classList.add('hidden'), 1500);
  },
  onStlError: () => {
    stlBanner.classList.add('hidden');
  },
  onExtractGateway: () => openGatewayConsole(),
  onHitDesk: () => {
    sound.ensureContext();
    sim.triggerPhysicalTableHit();
  },
  onCameraModeChanged: (camMode) => syncCameraButtons(camMode)
});

const cadInspector = new StlCadInspector(document.getElementById('cad-canvas-wrap'));

// Seed initial welcome log
appendLogEntry({
  time: 0,
  text: 'Sistema LPSBOX en línea. Elige un escenario (Sismo Tranqui o Terremoto) para iniciar tu turno de Operario.',
  level: 'ok'
});

// ================= NAVIGATION & VIEW SWITCHING =================
const navTabs = document.querySelectorAll('.nav-tab');
const panelViews = {
  console: document.getElementById('view-console'),
  docs: document.getElementById('view-docs'),
  gallery: document.getElementById('view-gallery')
};

function switchView(viewName) {
  activeView = viewName;
  navTabs.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });
  Object.entries(panelViews).forEach(([k, el]) => {
    el.classList.toggle('active', k === viewName);
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

document.getElementById('btn-back-sim').addEventListener('click', () => switchView('sim'));
document.querySelectorAll('[data-goto-sim]').forEach((b) => {
  b.addEventListener('click', () => switchView('sim'));
});

function openGatewayConsole() {
  sound.ensureContext();
  sound.playUsbConnect();
  switchView('console');
}

document.getElementById('btn-extract-gateway').addEventListener('click', openGatewayConsole);

// Collapsible HUD cards
document.querySelectorAll('[data-collapse]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const card = document.getElementById(btn.dataset.collapse);
    if (!card) return;
    const collapsed = card.classList.toggle('collapsed');
    btn.textContent = collapsed ? '+' : '−';
  });
});

// ================= AUDIO & WEBXR VR/MR BUTTONS =================
const btnAudio = document.getElementById('btn-audio');
btnAudio.addEventListener('click', () => {
  sound.ensureContext();
  sound.setMuted(!sound.muted);
  btnAudio.textContent = sound.muted ? '🔇 Silencio' : '🔊 Audio';
});

const btnXr = document.getElementById('btn-xr');
let currentXrSession = null;

btnXr.addEventListener('click', async () => {
  sound.ensureContext();
  if (!('xr' in navigator)) {
    appendLogEntry({
      time: sim.time,
      text: 'WebXR requiere Meta Quest Browser o visor XR compatible (en escritorio usa Vista Operario WASD o Táctica).',
      level: 'warn'
    });
    scene3d.setCameraMode('firstperson');
    syncCameraButtons('firstperson');
    return;
  }

  try {
    if (currentXrSession) {
      await currentXrSession.end();
      return;
    }
    // Prefer Mixed Reality (immersive-ar passthrough) if supported, else Virtual Reality (immersive-vr)
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
      scene3d.scene.background = null; // Enable MR camera passthrough!
    }
    await scene3d.renderer.xr.setSession(session);
    session.addEventListener('end', () => {
      currentXrSession = null;
      btnXr.classList.remove('active-xr');
      btnXr.textContent = '🥽 Entrar VR / MR';
      scene3d.scene.background.set?.(0x070c16);
    });
  } catch (err) {
    appendLogEntry({
      time: sim.time,
      text: `Sesión XR no iniciada (${err.message || 'visor no disponible'}). Modo 3D escritorio activo.`,
      level: 'warn'
    });
  }
});

// ================= SCENARIO CONTROLLER =================
function syncScenarioButtons(sc) {
  document.getElementById('btn-sc-normal').classList.toggle('active', sc === 'normal');
  document.getElementById('btn-sc-mild').classList.toggle('active', sc === 'mild');
  document.getElementById('btn-sc-major').classList.toggle('active', sc === 'major');
}

document.getElementById('btn-sc-normal').addEventListener('click', () => {
  sound.ensureContext();
  sound.stopAlarmLoop();
  sim.setNormalMonitoring();
  document.getElementById('btn-toggle-holo').style.display = 'none';
});

document.getElementById('btn-sc-mild').addEventListener('click', () => {
  sound.ensureContext();
  sim.triggerSeismicScenario('mild');
});

document.getElementById('btn-sc-major').addEventListener('click', () => {
  sound.ensureContext();
  sim.triggerSeismicScenario('major');
});

document.getElementById('btn-sc-hit').addEventListener('click', () => {
  sound.ensureContext();
  sim.triggerPhysicalTableHit();
});

document.getElementById('btn-console-mild').addEventListener('click', () => {
  sound.ensureContext();
  sim.triggerSeismicScenario('mild');
  setTimeout(refreshConsoleData, 950);
});

document.getElementById('btn-console-major').addEventListener('click', () => {
  sound.ensureContext();
  sim.triggerSeismicScenario('major');
  setTimeout(refreshConsoleData, 950);
});

// Challenge vs Sandbox pills
const pillChallenge = document.getElementById('pill-challenge');
const pillSandbox = document.getElementById('pill-sandbox');
const sandboxControls = document.getElementById('sandbox-controls');
const sliderPeople = document.getElementById('slider-people');
const valPeople = document.getElementById('val-people');

pillChallenge.addEventListener('click', () => {
  sim.challengeMode = true;
  pillChallenge.classList.add('active');
  pillSandbox.classList.remove('active');
  sandboxControls.style.display = 'none';
  sim.spawnMissionRandom();
});

pillSandbox.addEventListener('click', () => {
  sim.challengeMode = false;
  pillSandbox.classList.add('active');
  pillChallenge.classList.remove('active');
  sandboxControls.style.display = 'block';
  sliderPeople.value = String(sim.people.length);
  valPeople.textContent = String(sim.people.length);
});

sliderPeople.addEventListener('input', () => {
  const n = Number(sliderPeople.value);
  valPeople.textContent = String(n);
  sim.spawnWithTotalCount(n);
});

const sliderMag = document.getElementById('slider-mag');
const valMag = document.getElementById('val-mag');
sliderMag.addEventListener('input', () => {
  sim.customMagnitude = Number(sliderMag.value);
  valMag.textContent = `${sim.customMagnitude.toFixed(1)} Mw`;
});

document.getElementById('btn-trigger-custom').addEventListener('click', () => {
  sound.ensureContext();
  sim.triggerSeismicScenario('custom', Number(sliderMag.value));
});

const selectNoise = document.getElementById('select-mac-noise');
const valNoise = document.getElementById('val-noise');
selectNoise.addEventListener('change', () => {
  sim.macNoiseLevel = selectNoise.value;
  valNoise.textContent =
    selectNoise.value === 'low' ? 'Bajo' : selectNoise.value === 'high' ? 'Alto' : 'Medio';
});

document.getElementById('btn-new-mission').addEventListener('click', () => {
  sound.ensureContext();
  sound.stopAlarmLoop();
  sim.spawnMissionRandom();
  document.getElementById('report-result').classList.remove('visible');
  document.getElementById('btn-toggle-holo').style.display = 'none';
  if (!sim.challengeMode) {
    sliderPeople.value = String(sim.people.length);
    valPeople.textContent = String(sim.people.length);
  }
});

// Camera & MR toggles
function syncCameraButtons(mode) {
  document.querySelectorAll('.cam-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.cam === mode);
  });
}

document.querySelectorAll('.cam-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    scene3d.setCameraMode(btn.dataset.cam);
    syncCameraButtons(btn.dataset.cam);
  });
});

document.getElementById('chk-mr-vision').addEventListener('change', (e) => {
  scene3d.mrVisionEnabled = e.target.checked;
});

document.getElementById('btn-toggle-holo').addEventListener('click', () => {
  sim.showPreQuakeHologram = !sim.showPreQuakeHologram;
});

// ================= LIVE TICKER & HUD HARDWARE SYNC =================
const tickerLog = document.getElementById('ticker-log');
function appendLogEntry({ time, text, level }) {
  const div = document.createElement('div');
  div.className = `ticker-entry ${level || 'info'}`;
  div.innerHTML = `<span class="ts">[${time.toFixed(1)}s]</span>${text}`;
  tickerLog.prepend(div);
  while (tickerLog.children.length > 24) {
    tickerLog.removeChild(tickerLog.lastChild);
  }
}

const elLedBlue = document.getElementById('led-blue');
const elLedBlink = document.getElementById('led-blink');
const elLedYellow = document.getElementById('led-yellow');
const elNavDot = document.getElementById('nav-gateway-dot');
const elBtnExtract = document.getElementById('btn-extract-gateway');

const elOledBox = document.getElementById('hud-sniffer-oled');
const elOledSta = document.getElementById('oled-sta');
const elOledTitle = document.getElementById('oled-title');
const elOledSub = document.getElementById('oled-sub');
const elStatAccel = document.getElementById('stat-accel');
const elStatStaLta = document.getElementById('stat-stalta');
const miniSeismoCanvas = document.getElementById('mini-seismo-canvas');
const miniSeismoCtx = miniSeismoCanvas.getContext('2d');

function updateHudTelemetry() {
  // 1. Sync 3 Gateway LEDs
  elLedBlue.classList.toggle('blue-on', sim.gatewayLeds.blue);
  elLedBlink.classList.toggle('blink-on', sim.gatewayLeds.blink);
  elLedYellow.classList.toggle('yellow-on', sim.gatewayLeds.yellow);
  elNavDot.classList.toggle('has-data', sim.gatewayLeds.yellow);
  elBtnExtract.classList.toggle('glow-ready', sim.gatewayLeds.yellow && !sim.dataExtractedByOperator);

  // 2. Mission step progression
  const s1 = document.getElementById('mstep-1');
  const s2 = document.getElementById('mstep-2');
  const s3 = document.getElementById('mstep-3');
  const s4 = document.getElementById('mstep-4');

  const hasEventStarted = sim.quakeActive || Boolean(sim.frozenSnapshot);
  const hasSnapshot = Boolean(sim.frozenSnapshot);
  const hasExtracted = sim.dataExtractedByOperator && hasSnapshot;
  const hasReported = sim.reportSubmitted;

  s1.className = `mission-step ${hasEventStarted ? 'done' : 'current'}`;
  s2.className = `mission-step ${hasSnapshot ? 'done' : hasEventStarted ? 'current' : ''}`;
  s3.className = `mission-step ${hasExtracted ? 'done' : hasSnapshot ? 'current' : ''}`;
  s4.className = `mission-step ${hasReported ? 'done' : hasExtracted ? 'current' : ''}`;

  // 3. Sniffer OLED mirror
  elOledSta.textContent = `STA/LTA: ${sim.staLtaRatio.toFixed(2)}`;
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

  // 4. Stats + Mini Seismogram
  elStatAccel.textContent = `${sim.accel.dynamicG.toFixed(3)}g`;
  elStatStaLta.textContent = sim.staLtaRatio.toFixed(2);
  elStatStaLta.classList.toggle('triggered', sim.staLtaRatio >= sim.staLtaThreshold);
  document.getElementById('ticker-clock').textContent = `t = ${sim.time.toFixed(1)}s`;

  drawSeismogram(miniSeismoCtx, miniSeismoCanvas.width, miniSeismoCanvas.height, false);
}

function drawSeismogram(ctx, w, h, detailed = false) {
  ctx.fillStyle = '#050a12';
  ctx.fillRect(0, 0, w, h);

  // Threshold line (STA/LTA = 3.0 out of max 10)
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

  // Acceleration trace (cyan)
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

  // STA/LTA ratio curve (amber/red)
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

// ================= GATEWAY EXTRACTION CONSOLE =================
document.querySelectorAll('.subtab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.subtab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.subtab-pane').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.subtab).classList.add('active');
    refreshConsoleData();
  });
});

const chkMacFilter = document.getElementById('chk-mac-filter');
chkMacFilter.addEventListener('change', refreshConsoleData);

function refreshConsoleData() {
  const snap = sim.frozenSnapshot;
  const banner = document.getElementById('console-snapshot-banner');
  const bannerText = document.getElementById('console-banner-text');

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

  // Gather packet list (either frozen t0 snapshot or live 10s window)
  const rawPackets = snap ? snap.rawPackets : sim.rollingProbes;
  const filterEnabled = chkMacFilter.checked;

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

  document.getElementById('kpi-raw').textContent = String(rawPackets.length);
  document.getElementById('kpi-rand').textContent = String(randDiscarded);
  document.getElementById('kpi-unique').textContent = filterEnabled
    ? String(displayedRows.length)
    : `${rawPackets.length} (¡Sin filtrar!)`;
  document.getElementById('kpi-stalta').textContent = (snap ? snap.triggerStaLta : sim.staLtaRatio).toFixed(2);

  // Render Probe Request Table
  const tbody = document.getElementById('probe-tbody');
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

  // Render 2D RSSI Floorplan Map
  drawTacticalRssiMap(displayedRows);

  // Render Detailed Seismogram & MQTT JSON
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
  document.getElementById('mqtt-json-preview').textContent = JSON.stringify(mqttPayload, null, 2);
}

// ================= 2D TACTICAL RSSI MAP & OPERATOR RESCUE PINS =================
const rssiCanvas = document.getElementById('rssi-map-canvas');
const rssiCtx = rssiCanvas.getContext('2d');

// World X [-12..12] -> Canvas X, World Z [-9.5..12.0] -> Canvas Y
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

rssiCanvas.addEventListener('click', (e) => {
  const rect = rssiCanvas.getBoundingClientRect();
  const cx = ((e.clientX - rect.left) / rect.width) * rssiCanvas.width;
  const cy = ((e.clientY - rect.top) / rect.height) * rssiCanvas.height;
  const wpos = mapToWorld(cx, cy);
  sim.userMapPins.push(wpos);
  refreshConsoleData();
});

document.getElementById('btn-clear-pins').addEventListener('click', () => {
  sim.userMapPins = [];
  refreshConsoleData();
});

function drawTacticalRssiMap(packets) {
  const w = rssiCanvas.width;
  const h = rssiCanvas.height;
  rssiCtx.fillStyle = '#060c16';
  rssiCtx.fillRect(0, 0, w, h);

  // Subtle tactical grid
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

  // Draw 4 Building Zones
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

  // Central Sniffer icon at (0, -1.85)
  const snPos = worldToMap(0, -1.85);
  rssiCtx.fillStyle = '#38bdf8';
  rssiCtx.beginPath();
  rssiCtx.arc(snPos.x, snPos.y, 7, 0, Math.PI * 2);
  rssiCtx.fill();
  rssiCtx.font = 'bold 11px monospace';
  rssiCtx.fillText('SNIFFER', snPos.x - 24, snPos.y - 11);

  // Outdoor Evacuation Assembly Point & Gateway Desk
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

  // Plot detected smartphones at pre-quake t0 coordinates
  packets.forEach((pkt) => {
    const pt = worldToMap(pkt.estX, pkt.estZ);
    const personNow = sim.people.find((p) => p.id === pkt.personId);
    const lost = personNow && (personNow.state === 'trapped' || !personNow.phoneOnline);
    const evac = personNow && personNow.state === 'evacuated';

    // RSSI uncertainty halo
    rssiCtx.fillStyle = pkt.isDuplicateRandomBurst
      ? 'rgba(245, 158, 11, 0.12)'
      : 'rgba(56, 189, 248, 0.16)';
    rssiCtx.beginPath();
    rssiCtx.arc(pt.x, pt.y, 14, 0, Math.PI * 2);
    rssiCtx.fill();

    // Core dot (color encodes post-quake telemetry status while position is pre-quake t0!)
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

  // Plot Operator Rescue Pins
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

// ================= OPERATOR REPORT SUBMISSION & GRADING =================
const zoneInputs = ['a', 'b', 'c', 'd'].map((k) => document.getElementById(`inp-zone-${k}`));
const zoneSumHelper = document.getElementById('zone-sum-helper');

zoneInputs.forEach((inp) => {
  inp.addEventListener('input', () => {
    const sum = zoneInputs.reduce((acc, el) => acc + Number(el.value || 0), 0);
    zoneSumHelper.textContent = `Suma actual ingresada por zonas: ${sum} personas`;
  });
});

document.getElementById('operator-report-form').addEventListener('submit', (e) => {
  e.preventDefault();
  sound.ensureContext();
  sound.playUsbConnect();

  const totalGuess = Number(document.getElementById('inp-total').value || 0);
  const zoneGuesses = {
    A: Number(document.getElementById('inp-zone-a').value || 0),
    B: Number(document.getElementById('inp-zone-b').value || 0),
    C: Number(document.getElementById('inp-zone-c').value || 0),
    D: Number(document.getElementById('inp-zone-d').value || 0)
  };
  const priorityZoneGuess = document.getElementById('inp-priority-zone').value;

  const evalRes = sim.evaluateOperatorReport({ totalGuess, zoneGuesses, priorityZoneGuess });

  const resultBox = document.getElementById('report-result');
  const scoreEl = document.getElementById('res-score');
  const fbEl = document.getElementById('res-feedback');

  scoreEl.textContent = `${evalRes.score}/100`;
  scoreEl.style.color = evalRes.score >= 85 ? '#34d399' : evalRes.score >= 60 ? '#fbbf24' : '#f87171';

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

  fbEl.innerHTML = `
    <p><strong>Total antes del sismo (t₀):</strong> Reportaste <strong>${evalRes.totalGuess}</strong> personas · Realidad: <strong>${evalRes.truthTotal}</strong> personas.</p>
    <div style="margin: 6px 0; font-family: var(--font-mono); font-size: 11.5px;">${zRows}</div>
    <p><strong>Prioridad USAR:</strong> Sector óptimo <strong>Zona ${evalRes.bestPriorityZone}</strong> ${evalRes.priorityCorrect ? '(¡Acertaste!)' : ''}.</p>
    ${extraNote}
  `;

  resultBox.classList.add('visible');
  document.getElementById('btn-toggle-holo').style.display = 'inline-flex';
  appendLogEntry({
    time: sim.time,
    text: `Reporte de Operario evaluado: ${evalRes.score}/100 pts. Hologramas 3D pre-sismo (t₀) activados.`,
    level: evalRes.score >= 80 ? 'ok' : 'warn'
  });
});

document.getElementById('btn-view-hologram').addEventListener('click', () => {
  sim.showPreQuakeHologram = true;
  switchView('sim');
  scene3d.setCameraMode('tactical');
  syncCameraButtons('tactical');
});

// ================= HARDWARE GALLERY & STL VIEWER CONTROLS =================
document.getElementById('btn-cad-wire').addEventListener('click', (e) => {
  const on = cadInspector.toggleWireframe();
  e.currentTarget.textContent = on ? '🧊 Vista Sólida' : '🕸️ Malla Wireframe';
});

document.getElementById('btn-cad-rot').addEventListener('click', (e) => {
  const on = cadInspector.toggleAutoRotate();
  e.currentTarget.textContent = on ? '⏸ Pausar Giro' : '🔄 Auto-Rotar';
});

document.getElementById('btn-cad-reset').addEventListener('click', () => {
  cadInspector.resetCamera();
});

// Image Lightbox
const lightbox = document.getElementById('img-lightbox');
const lightboxImg = document.getElementById('lightbox-img');
document.querySelectorAll('.gallery-item img').forEach((img) => {
  img.addEventListener('click', () => {
    lightboxImg.src = img.src;
    lightboxImg.alt = img.alt;
    lightbox.classList.add('open');
  });
});
lightbox.addEventListener('click', () => lightbox.classList.remove('open'));

// ================= LIVE RASPBERRY PI 5 WEBSOCKET CONNECTOR =================
const btnWs = document.getElementById('btn-ws-connect');
const wsInput = document.getElementById('ws-url-input');
const wsStatus = document.getElementById('ws-status');

btnWs.addEventListener('click', () => {
  const url = wsInput.value.trim();
  if (!url) return;
  if (wsClient) {
    wsClient.close();
    wsClient = null;
  }
  wsStatus.textContent = `Conectando a ${url}...`;
  wsStatus.style.color = '#fbbf24';

  try {
    wsClient = new WebSocket(url);
    wsClient.onopen = () => {
      wsStatus.textContent = `✓ Conectado en vivo a Raspberry Pi 5 (${url})`;
      wsStatus.style.color = '#34d399';
      document.getElementById('gw-link-badge').textContent = 'RPi5 LIVE WS';
    };
    wsClient.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        sim.ingestExternalTelemetry(data);
      } catch (_) {}
    };
    wsClient.onerror = () => {
      wsStatus.textContent = 'No se detectó servidor WS local (usando motor de simulación interno).';
      wsStatus.style.color = '#f87171';
    };
    wsClient.onclose = () => {
      sim.externalHardwareConnected = false;
      document.getElementById('gw-link-badge').textContent = 'RPi5 + ESP32';
    };
  } catch (err) {
    wsStatus.textContent = `Error URL WebSocket: ${err.message}`;
    wsStatus.style.color = '#f87171';
  }
});

// ================= MAIN ANIMATION LOOP (WebXR COMPATIBLE) =================
let lastFrameTime = performance.now();

scene3d.renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameTime) / 1000));
  lastFrameTime = now;

  sim.update(dt);
  sound.updateSeismicRumble(sim.accel.dynamicG);

  scene3d.update(dt);
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
});

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  Notification,
  ipcMain,
  screen,
  dialog,
} = require("electron");
const path = require("path");
const zlib = require("zlib");
const fs = require("fs");

// ==================== SINGLE INSTANCE ====================
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// ==================== PATH RESOLUTION ====================
function asset(...p) {
  return app.isPackaged
    ? path.join(process.resourcesPath, "assets", ...p)
    : path.join(__dirname, "assets", ...p);
}
function appFile(f) {
  return path.join(__dirname, f);
}

// ==================== CONSTANTS ====================
const S = 16;
const ICON_BYTES = S * S * 4;
const BASE_H = 84;
const MIN_W = 150,
  MIN_H = 44,
  MAX_W = 800,
  MAX_H = 250;
const ASPECT = 3.57;
const CACHE_MAX = 8;

// ==================== BUFFERS ====================
const iconBuf = Buffer.alloc(ICON_BYTES);
const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const pngIHDR = Buffer.alloc(13);
pngIHDR.writeUInt32BE(S, 0);
pngIHDR.writeUInt32BE(S, 4);
pngIHDR[8] = 8;
pngIHDR[9] = 6;

const cornerMask = new Uint8Array(S * S);
for (const [x, y] of [
  [0, 0],
  [1, 0],
  [0, 1],
  [S - 1, 0],
  [S - 2, 0],
  [S - 1, 1],
  [0, S - 1],
  [1, S - 1],
  [0, S - 2],
  [S - 1, S - 1],
  [S - 2, S - 1],
  [S - 1, S - 2],
])
  cornerMask[y * S + x] = 1;

// ==================== FONT ====================
const FONT_RAW = {
  0: [
    [1, 1, 1],
    [1, 0, 1],
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
  1: [
    [0, 1, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
    [1, 1, 1],
  ],
  2: [
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
  ],
  3: [
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
  ],
  4: [
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 0, 1],
    [0, 0, 1],
  ],
  5: [
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
  ],
  6: [
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
  7: [
    [1, 1, 1],
    [0, 0, 1],
    [0, 0, 1],
    [0, 0, 1],
    [0, 0, 1],
  ],
  8: [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
  9: [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
  ],
  ":": [[0], [1], [0], [1], [0]],
};
const FONT = {};
for (const [ch, rows] of Object.entries(FONT_RAW)) {
  const px = [];
  const w = rows[0].length;
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < w; x++) if (rows[y][x]) px.push(x, y);
  FONT[ch] = { px, w };
}

// ==================== PNG ====================
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

const ihdrC = chunk("IHDR", pngIHDR);
const iendC = chunk("IEND", Buffer.alloc(0));

function buildPNG() {
  const rl = 1 + S * 4;
  const raw = Buffer.allocUnsafe(S * rl);
  for (let y = 0; y < S; y++) {
    raw[y * rl] = 0;
    iconBuf.copy(raw, y * rl + 1, y * S * 4, (y + 1) * S * 4);
  }
  return Buffer.concat([
    pngSig,
    ihdrC,
    chunk("IDAT", zlib.deflateSync(raw, { level: 1 })),
    iendC,
  ]);
}

// ==================== ICON RENDER ====================
const COLORS = {
  running: [39, 174, 96],
  paused: [230, 175, 46],
  finished: [231, 76, 60],
  idle: [52, 73, 94],
};
const iconCache = new Map();

function renderIcon(str, state) {
  const key = str + "|" + state;
  if (iconCache.has(key)) return iconCache.get(key);

  const [r, g, b] = COLORS[state] || COLORS.idle;
  for (let i = 0; i < ICON_BYTES; i += 4) {
    if (cornerMask[i >> 2]) {
      iconBuf[i] = iconBuf[i + 1] = iconBuf[i + 2] = iconBuf[i + 3] = 0;
    } else {
      iconBuf[i] = r;
      iconBuf[i + 1] = g;
      iconBuf[i + 2] = b;
      iconBuf[i + 3] = 255;
    }
  }

  let tw = 0;
  for (let i = 0; i < str.length; i++) {
    const f = FONT[str[i]];
    if (f) tw += f.w + (i < str.length - 1 ? 1 : 0);
  }

  let cx = (S - tw) >> 1,
    cy = (S - 5) >> 1;
  for (let i = 0; i < str.length; i++) {
    const f = FONT[str[i]];
    if (!f) continue;
    for (let j = 0; j < f.px.length; j += 2) {
      const x = cx + f.px[j],
        y = cy + f.px[j + 1];
      if (x >= 0 && x < S && y >= 0 && y < S) {
        const o = (y * S + x) << 2;
        iconBuf[o] = iconBuf[o + 1] = iconBuf[o + 2] = iconBuf[o + 3] = 255;
      }
    }
    cx += f.w + 1;
  }

  const icon = nativeImage.createFromBuffer(buildPNG());
  if (iconCache.size >= CACHE_MAX)
    iconCache.delete(iconCache.keys().next().value);
  iconCache.set(key, icon);
  return icon;
}

// ==================== TIME FORMAT ====================
const P2 = [];
for (let i = 0; i < 100; i++) P2[i] = i < 10 ? "0" + i : "" + i;

function fmt(s) {
  const h = (s / 3600) | 0,
    m = ((s % 3600) / 60) | 0,
    sec = s % 60;
  return h > 0 ? h + ":" + P2[m] + ":" + P2[sec] : P2[m] + ":" + P2[sec];
}
function icoTime(s) {
  return P2[Math.min((s / 60) | 0, 99)] + ":" + P2[s % 60];
}

// ==================== STATE ====================
let mainWindow = null,
  widgetWindow = null,
  tray = null;
let resizeInt = null,
  widgetVisible = false;
let configTimer = null,
  lastMenuKey = "",
  lastIconKey = "";
let hideTimer = null;
let originalTrayIcon = null;

const T = {
  init: 0,
  rem: 0,
  run: false,
  paused: false,
  iv: null,
  startAt: 0,
  pausedAt: 0,
  pausedMs: 0,
};

let soundCfg = {
  selected: "alarm",
  customPath: null,
  customBase64: null,
  volume: 0.7,
  loop: true,
};

const CFG_PATH = path.join(app.getPath("userData"), "timer-config.json");

function loadCfg() {
  try {
    if (!fs.existsSync(CFG_PATH)) return;
    Object.assign(soundCfg, JSON.parse(fs.readFileSync(CFG_PATH, "utf8")));
    if (soundCfg.customPath && fs.existsSync(soundCfg.customPath)) {
      const buf = fs.readFileSync(soundCfg.customPath);
      const ext = path.extname(soundCfg.customPath).toLowerCase();
      const mime =
        ext === ".mp3"
          ? "audio/mpeg"
          : ext === ".ogg"
            ? "audio/ogg"
            : "audio/wav";
      soundCfg.customBase64 = `data:${mime};base64,${buf.toString("base64")}`;
    }
  } catch (_) {}
}

function saveCfg() {
  if (configTimer) clearTimeout(configTimer);
  configTimer = setTimeout(() => {
    try {
      const { customBase64, ...s } = soundCfg;
      fs.writeFileSync(CFG_PATH, JSON.stringify(s));
    } catch (_) {}
    configTimer = null;
  }, 500);
}

// ==================== WIDGET SIZES ====================
const SIZES = {
  tiny: { w: 170, h: 50 },
  small: { w: 220, h: 64 },
  medium: { w: 300, h: 84 },
  large: { w: 400, h: 112 },
  xlarge: { w: 520, h: 145 },
  huge: { w: 660, h: 180 },
};
const SIZE_NAMES = {
  tiny: "Tiny",
  small: "Small",
  medium: "Medium",
  large: "Large",
  xlarge: "Extra Large",
  huge: "Huge",
};
let curSize = "medium";

// ==================== HELPERS ====================
function alive(w) {
  return w && !w.isDestroyed();
}
function sendW(w, ch, d) {
  if (alive(w)) w.webContents.send(ch, d);
}
function sendAll(ch, d) {
  sendW(mainWindow, ch, d);
  sendW(widgetWindow, ch, d);
}
function timerState() {
  if (T.run && !T.paused) return "running";
  if (T.paused) return "paused";
  if (T.rem === 0 && T.init > 0) return "finished";
  return "idle";
}

// ==================== WINDOWS ====================
function createWindow() {
  let icon;
  try {
    const p = asset("icon.png");
    if (fs.existsSync(p)) icon = nativeImage.createFromPath(p);
  } catch (_) {}

  mainWindow = new BrowserWindow({
    width: 420,
    height: 620,
    resizable: false,
    icon: icon || renderIcon("00:00", "idle"),
    webPreferences: { preload: appFile("preload.js"), contextIsolation: true },
  });
  mainWindow.loadFile(appFile("index.html"));
  mainWindow.setTitle("\u23F1 Timex");
  mainWindow.setMenuBarVisibility(false);
  mainWindow.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on("focus", () => mainWindow.flashFrame(false));
  mainWindow.webContents.on("did-finish-load", () =>
    sendW(mainWindow, "sound-config", soundCfg),
  );
}

function createWidget() {
  const wa = screen.getPrimaryDisplay().workAreaSize;
  const sz = SIZES[curSize];
  widgetWindow = new BrowserWindow({
    width: sz.w,
    height: sz.h,
    x: (wa.width - sz.w) >> 1,
    y: wa.height - sz.h - 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: appFile("preload-widget.js"),
      contextIsolation: true,
    },
  });
  widgetWindow.loadFile(appFile("widget.html"));
  widgetWindow.setAlwaysOnTop(true, "screen-saver");
  widgetWindow.setVisibleOnAllWorkspaces(true);
  widgetWindow.hide();
  widgetVisible = false;
  widgetWindow.webContents.on("did-finish-load", () => {
    emitScale();
    sendW(widgetWindow, "sound-config", soundCfg);
  });
}

function emitScale() {
  if (!alive(widgetWindow)) return;
  const b = widgetWindow.getBounds();
  sendW(widgetWindow, "scale-update", {
    scale: b.height / BASE_H,
    width: b.width,
    height: b.height,
    sizeKey: curSize,
  });
}

function setSize(k) {
  const sz = SIZES[k];
  if (!sz || !alive(widgetWindow)) return;
  curSize = k;
  const b = widgetWindow.getBounds();
  widgetWindow.setBounds({
    x: b.x + ((b.width - sz.w) >> 1),
    y: b.y + ((b.height - sz.h) >> 1),
    width: sz.w,
    height: sz.h,
  });
  emitScale();
  rebuildMenu();
}

function resizeBy(dh) {
  if (!alive(widgetWindow)) return;
  const b = widgetWindow.getBounds();
  let nh = Math.min(MAX_H, Math.max(MIN_H, b.height + dh));
  let nw = Math.min(MAX_W, Math.max(MIN_W, Math.round(nh * ASPECT)));
  widgetWindow.setBounds({
    x: b.x + ((b.width - nw) >> 1),
    y: b.y + ((b.height - nh) >> 1),
    width: nw,
    height: nh,
  });
  curSize = "custom";
  emitScale();
}

function showWidget() {
  if (!alive(widgetWindow)) return;
  widgetWindow.show();
  widgetVisible = true;
  emitScale();
  rebuildMenu();
}
function hideWidget() {
  if (!alive(widgetWindow)) return;
  widgetWindow.hide();
  widgetVisible = false;
  rebuildMenu();
}

// ==================== TRAY ====================
function createTray() {
  const iconPath = asset("icon.png");
  try {
    if (fs.existsSync(iconPath)) {
      originalTrayIcon = nativeImage
        .createFromPath(iconPath)
        .resize({ width: 16, height: 16 });
    }
  } catch (_) {}

  if (!originalTrayIcon) originalTrayIcon = renderIcon("00:00", "idle");

  tray = new Tray(originalTrayIcon);
  tray.setToolTip("Timex \u2014 Ready");
  rebuildMenu();
  tray.on("click", () => {
    if (alive(mainWindow)) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function rebuildMenu() {
  const key = `${T.run}|${T.paused}|${widgetVisible}|${curSize}`;
  if (key === lastMenuKey) return;
  lastMenuKey = key;

  const t = [];
  if (T.run) {
    t.push({
      label: T.paused ? "\u25B6  Resume" : "\u23F8  Pause",
      click: () => (T.paused ? resume() : pause()),
    });
    t.push({ label: "\u23F9  Stop", click: stop });
    t.push({ label: "\uD83D\uDD04  Restart", click: restart });
    t.push({ type: "separator" });
  }
  t.push({
    label: widgetVisible
      ? "\uD83D\uDD3D  Hide Widget"
      : "\uD83D\uDD3C  Show Widget",
    click: () => (widgetVisible ? hideWidget() : showWidget()),
  });
  t.push({
    label: "\uD83D\uDCD0  Widget Size",
    submenu: Object.keys(SIZES).map((k) => ({
      label: `${SIZE_NAMES[k]}  (${SIZES[k].w}\u00D7${SIZES[k].h})`,
      type: "radio",
      checked: curSize === k,
      click: () => setSize(k),
    })),
  });
  t.push({
    label: "\uD83D\uDCFA  Open Window",
    click: () => {
      if (alive(mainWindow)) {
        mainWindow.show();
        mainWindow.focus();
      }
    },
  });
  t.push({ type: "separator" });
  t.push({
    label: "\u274C  Quit",
    click: () => {
      app.isQuitting = true;
      app.quit();
    },
  });
  tray.setContextMenu(Menu.buildFromTemplate(t));
}

function updateTrayIcon() {
  const st = timerState();
  const ts = icoTime(T.rem);
  const key = ts + "|" + st;

  if (key === lastIconKey) return;
  lastIconKey = key;

  // Show original app icon when idle
  if (st === "idle" && originalTrayIcon) {
    tray.setImage(originalTrayIcon);
    tray.setToolTip("Timex \u2014 Ready");
    return;
  }

  tray.setImage(renderIcon(ts, st));
  const lbl =
    st === "paused"
      ? "(Paused)"
      : st === "running"
        ? "remaining"
        : st === "finished"
          ? "\u2014 Finished!"
          : "\u2014 Ready";
  tray.setToolTip(`Timex: ${fmt(T.rem)} ${lbl}`);
}

// ==================== TIMER ====================
function start(secs) {
  clearIv();
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  T.init = secs;
  T.rem = secs;
  T.run = true;
  T.paused = false;
  T.startAt = Date.now();
  T.pausedMs = 0;
  sendW(mainWindow, "stop-alarm");
  broadcast();
  rebuildMenu();
  showWidget();
  T.iv = setInterval(tick, 1000);
}

function tick() {
  if (T.paused) return;
  const elapsed = ((Date.now() - T.startAt - T.pausedMs) / 1000) | 0;
  const nr = Math.max(0, T.init - elapsed);
  if (nr === T.rem) return;
  T.rem = nr;
  if (T.rem <= 0) {
    T.rem = 0;
    T.run = false;
    clearIv();
    onDone();
  } else broadcast();
}

function pause() {
  if (!T.run || T.paused) return;
  T.paused = true;
  T.pausedAt = Date.now();
  broadcast();
  rebuildMenu();
}

function resume() {
  if (!T.paused) return;
  T.pausedMs += Date.now() - T.pausedAt;
  T.paused = false;
  broadcast();
  rebuildMenu();
}

function stop() {
  clearIv();
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  sendW(mainWindow, "stop-alarm");
  sendW(widgetWindow, "alarm-dismissed");
  hideWidget();
  resetToIdle();
}

function restart() {
  if (T.init > 0) start(T.init);
}

function dismiss() {
  sendW(mainWindow, "stop-alarm");
  sendW(widgetWindow, "alarm-dismissed");
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  hideWidget();
  resetToIdle();
}

function clearIv() {
  if (T.iv) {
    clearInterval(T.iv);
    T.iv = null;
  }
}

function resetToIdle() {
  T.init = 0;
  T.rem = 0;
  T.run = false;
  T.paused = false;
  lastIconKey = ""; // Force icon refresh
  broadcast();
  rebuildMenu();
}

function onDone() {
  const finishedDuration = fmt(T.init);
  broadcast();
  rebuildMenu();
  new Notification({
    title: "\u23F0 Time\u2019s Up!",
    body: `Your ${finishedDuration} timer has finished.`,
    urgency: "critical",
  }).show();
  if (alive(mainWindow)) {
    mainWindow.flashFrame(true);
    mainWindow.show();
  }
  sendW(mainWindow, "play-alarm", soundCfg);
  sendW(widgetWindow, "alarm-visual");
  sendAll("timer-finished");
  hideTimer = setTimeout(() => {
    hideWidget();
    resetToIdle();
    hideTimer = null;
  }, 5000);
}

// ==================== BROADCAST ====================
const payload = {
  remaining: 0,
  initial: 0,
  running: false,
  paused: false,
  display: "",
};

function broadcast() {
  if (alive(mainWindow)) {
    if (T.run)
      mainWindow.setTitle(
        `${T.paused ? "\u23F8" : "\u23F1"} ${fmt(T.rem)} \u2014 Timex`,
      );
    else if (T.rem === 0 && T.init > 0)
      mainWindow.setTitle("\u23F0 Time\u2019s Up! \u2014 Timex");
    else mainWindow.setTitle("\u23F1 Timex");

    if (T.run && T.init > 0)
      mainWindow.setProgressBar(T.rem / T.init, {
        mode: T.paused ? "paused" : "normal",
      });
    else mainWindow.setProgressBar(-1, { mode: "none" });
  }
  updateTrayIcon();
  payload.remaining = T.rem;
  payload.initial = T.init;
  payload.running = T.run;
  payload.paused = T.paused;
  payload.display = fmt(T.rem);
  sendAll("timer-update", payload);
}

// ==================== IPC ====================
ipcMain.on("start-timer", (_, s) => start(s));
ipcMain.on("pause-timer", pause);
ipcMain.on("resume-timer", resume);
ipcMain.on("stop-timer", stop);
ipcMain.on("restart-timer", restart);
ipcMain.on("dismiss-alarm", dismiss);

ipcMain.on("update-sound-config", (_, c) => {
  Object.assign(soundCfg, c);
  saveCfg();
  sendW(widgetWindow, "sound-config", soundCfg);
});

ipcMain.handle("browse-sound-file", async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: "Select Alarm Sound",
    filters: [
      {
        name: "Audio",
        extensions: ["mp3", "wav", "ogg", "flac", "m4a", "aac"],
      },
      { name: "All", extensions: ["*"] },
    ],
    properties: ["openFile"],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const fp = res.filePaths[0];
  const buf = fs.readFileSync(fp);
  const ext = path.extname(fp).toLowerCase();
  const mime =
    {
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".ogg": "audio/ogg",
      ".flac": "audio/flac",
      ".m4a": "audio/mp4",
      ".aac": "audio/aac",
    }[ext] || "audio/mpeg";
  const b64 = `data:${mime};base64,${buf.toString("base64")}`;
  soundCfg.customPath = fp;
  soundCfg.customBase64 = b64;
  soundCfg.selected = "custom";
  saveCfg();
  sendW(widgetWindow, "sound-config", soundCfg);
  return { path: fp, base64: b64, name: path.basename(fp) };
});

ipcMain.on("widget-action", (_, a) => {
  const acts = {
    pause,
    resume,
    stop,
    restart,
    dismiss,
    open() {
      if (alive(mainWindow)) {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    hide: hideWidget,
  };
  if (acts[a]) acts[a]();
});

ipcMain.on("widget-set-size", (_, k) => setSize(k));
ipcMain.on("widget-scroll-resize", (_, dy) => resizeBy(dy > 0 ? -6 : 6));

ipcMain.on("resize-start", () => {
  if (!alive(widgetWindow)) return;
  const sb = widgetWindow.getBounds();
  const sm = screen.getCursorScreenPoint();
  const ratio = sb.width / sb.height;
  if (resizeInt) clearInterval(resizeInt);
  resizeInt = setInterval(() => {
    const m = screen.getCursorScreenPoint();
    const dx = m.x - sm.x,
      dy = m.y - sm.y;
    let nw, nh;
    if (Math.abs(dx) > Math.abs(dy)) {
      nw = Math.min(MAX_W, Math.max(MIN_W, sb.width + dx));
      nh = Math.round(nw / ratio);
    } else {
      nh = Math.min(MAX_H, Math.max(MIN_H, sb.height + dy));
      nw = Math.round(nh * ratio);
    }
    nh = Math.min(MAX_H, Math.max(MIN_H, nh));
    nw = Math.min(MAX_W, Math.max(MIN_W, nw));
    widgetWindow.setBounds({ x: sb.x, y: sb.y, width: nw, height: nh });
    curSize = "custom";
    emitScale();
  }, 16);
});

ipcMain.on("resize-end", () => {
  if (resizeInt) {
    clearInterval(resizeInt);
    resizeInt = null;
  }
  rebuildMenu();
});

ipcMain.on("widget-drag", (_, { x, y }) => {
  if (!alive(widgetWindow)) return;
  const [wx, wy] = widgetWindow.getPosition();
  widgetWindow.setPosition(wx + x, wy + y);
});

// ==================== LIFECYCLE ====================
app.on("second-instance", () => {
  if (alive(mainWindow)) {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  loadCfg();
  createWindow();
  createWidget();
  createTray();
});

app.on("window-all-closed", () => {});
app.on("activate", () => {
  if (alive(mainWindow)) mainWindow.show();
});
app.on("before-quit", () => {
  clearIv();
  if (resizeInt) clearInterval(resizeInt);
  if (hideTimer) clearTimeout(hideTimer);
  if (configTimer) clearTimeout(configTimer);
  iconCache.clear();
});

const { contextBridge, ipcRenderer } = require("electron");

const map = new Map();
function on(ch, cb) {
  if (map.has(ch)) ipcRenderer.removeListener(ch, map.get(ch));
  const h = (_, d) => cb(d);
  map.set(ch, h);
  ipcRenderer.on(ch, h);
}

contextBridge.exposeInMainWorld("widgetAPI", {
  action: (n) => ipcRenderer.send("widget-action", n),
  setSize: (k) => ipcRenderer.send("widget-set-size", k),
  scrollResize: (d) => ipcRenderer.send("widget-scroll-resize", d),
  resizeStart: () => ipcRenderer.send("resize-start"),
  resizeEnd: () => ipcRenderer.send("resize-end"),
  drag: (d) => ipcRenderer.send("widget-drag", d),
  onUpdate: (cb) => on("timer-update", cb),
  onFinished: (cb) => on("timer-finished", cb),
  onScaleUpdate: (cb) => on("scale-update", cb),
  onSoundConfig: (cb) => on("sound-config", cb),
  onAlarmVisual: (cb) => on("alarm-visual", cb),
  onAlarmDismissed: (cb) => on("alarm-dismissed", cb),
});

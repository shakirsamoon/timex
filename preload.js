const { contextBridge, ipcRenderer } = require("electron");

const map = new Map();
function on(ch, cb) {
  if (map.has(ch)) ipcRenderer.removeListener(ch, map.get(ch));
  const h = (_, d) => cb(d);
  map.set(ch, h);
  ipcRenderer.on(ch, h);
}

contextBridge.exposeInMainWorld("timerAPI", {
  start: (s) => ipcRenderer.send("start-timer", s),
  pause: () => ipcRenderer.send("pause-timer"),
  resume: () => ipcRenderer.send("resume-timer"),
  stop: () => ipcRenderer.send("stop-timer"),
  restart: () => ipcRenderer.send("restart-timer"),
  dismissAlarm: () => ipcRenderer.send("dismiss-alarm"),
  updateSoundConfig: (c) => ipcRenderer.send("update-sound-config", c),
  browseSoundFile: () => ipcRenderer.invoke("browse-sound-file"),
  onUpdate: (cb) => on("timer-update", cb),
  onFinished: (cb) => on("timer-finished", cb),
  onSoundConfig: (cb) => on("sound-config", cb),
  onPlayAlarm: (cb) => on("play-alarm", cb),
  onStopAlarm: (cb) => on("stop-alarm", cb),
});

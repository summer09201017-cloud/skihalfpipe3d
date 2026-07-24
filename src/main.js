import "./styles.css";
// 3D 滑板 main.js —— UI 接線+字幕播報+預烤人聲(絕不 Web Speech)+鍵盤/觸控
// 操作:空白鍵按住=泵(地面下坡加速)/抓板(空中);A/D 或 ←/→=沿池移動(地面)/轉體(空中);V 視角。
import { SkateboardGame, DIFFICULTY_PRESETS } from "./game.js";
import { AudioManager } from "./audio.js";
import { loadSettings, saveSettings } from "./storage.js";
import { speakLine, setVoiceEnabled } from "./voice.js";

const $ = (id) => document.getElementById(id);
const ui = {
  canvas: $("gameCanvas"),
  scoreLabel: $("scoreLabel"), timeLabel: $("timeLabel"), comboLabel: $("comboLabel"),
  speedPanel: $("speedPanel"), speedFill: $("speedFill"),
  statusMessage: $("statusMessage"), commentaryBar: $("commentaryBar"),
  trickPop: $("trickPop"),
  controlsPanel: $("controlsPanel"), controlsHint: $("controlsHint"),
  touchPump: $("touchPump"), touchLeft: $("touchLeft"), touchRight: $("touchRight"),
  menuButton: $("menuButton"), audioButton: $("audioButton"), cameraButton: $("cameraButton"),
  fullscreenButton: $("fullscreenButton"),
  matchOverlay: $("matchOverlay"), overlayEyebrow: $("overlayEyebrow"),
  overlayTitle: $("overlayTitle"), overlayText: $("overlayText"),
  overlayMenuButton: $("overlayMenuButton"), overlayReplayButton: $("overlayReplayButton"),
  homeScreen: $("homeScreen"),
  difficultySelect: $("difficultySelect"), audioSelect: $("audioSelect"),
  startButton: $("startButton"),
};

const settings = loadSettings();
let selectedDifficulty = DIFFICULTY_PRESETS[settings.difficulty] ? settings.difficulty : "easy";
let audioEnabled = settings.audioEnabled !== false;

const audio = new AudioManager();
audio.setEnabled(audioEnabled);
setVoiceEnabled(audioEnabled);

const game = new SkateboardGame({ canvas: ui.canvas });
window.__skihalfpipe3d = game; // dev hook:Playwright 驗證用(3d-game-kit 慣例)

// 字幕條 pop + 預烤人聲(有 mp3 才出聲,缺檔=只出字幕)
function pushCommentary(text, tone = "info") {
  const bar = ui.commentaryBar;
  if (!bar || !text) return;
  bar.hidden = false;
  bar.dataset.tone = tone;
  bar.textContent = text;
  bar.style.animation = "none";
  void bar.offsetWidth;
  bar.style.animation = "";
}

// 招式大字 pop(落地結算那一下)
function popTrick(text, clean) {
  const el = ui.trickPop;
  if (!el) return;
  el.hidden = false;
  el.dataset.clean = clean ? "1" : "0";
  el.textContent = text;
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
}

game.onEvent = (event) => {
  switch (event.type) {
    case "run-start":
      audio.whistle(); audio.startCrowd();
      speakLine("比賽開始,滑起來!");
      pushCommentary("計時開始——泵出速度,飛出池緣!");
      break;
    case "air":
      audio.kick(Math.min(1, event.speed / 10));
      if (event.speed > 8) speakLine("好高的騰空!");
      break;
    case "trick": {
      if (event.clean) { audio.cheer(); audio.crowdCheer(Math.min(1, 0.4 + event.combo * 0.15)); }
      else audio.bounce();
      popTrick(`${event.label} +${event.points}`, event.clean);
      if (event.spinDeg >= 360) speakLine("空中轉體,漂亮!");
      else if (event.grabbed) speakLine("抓板動作,帥氣!");
      else if (event.clean) speakLine("落地乾淨俐落!");
      if (event.combo >= 3) speakLine("連續動作,分數起飛!");
      break;
    }
    case "ten-left":
      audio.buzz();
      speakLine("最後十秒,拼一波大招!");
      pushCommentary("最後十秒——拼一波大招!", "hot");
      break;
    case "run-end":
      try { if (!['localhost','127.0.0.1'].includes(location.hostname)) {   // -done:玩完一局(t=本局秒數,/stats 使用次數與平均停留吃這個)
        var __dt = Math.round((Date.now() - (window.__matchT0 || Date.now())) / 1000);
        navigator.sendBeacon?.('https://hfpc-play-stats.summer09201017.workers.dev/api/ping?g=skihalfpipe3d-done&t=' + __dt);
      } } catch (_) {}
      audio.horn(); audio.cheer(); audio.crowdCheer(1); audio.stopCrowd();
      speakLine("時間到!看看總分!");
      ui.matchOverlay.classList.add("visible");
      ui.overlayEyebrow.textContent = `最佳動作:${event.bestTrick.label}(${event.bestTrick.points} 分)`;
      ui.overlayTitle.textContent = event.title;
      ui.overlayText.textContent = event.text;
      break;
    default:
      break;
  }
};

game.onHud = (s) => {
  ui.scoreLabel.textContent = String(s.score);
  ui.timeLabel.textContent = `${Math.ceil(s.timeLeft)}s`;
  ui.timeLabel.classList.toggle("urgent", s.timeLeft <= 10 && s.phase === "run");
  ui.comboLabel.textContent = s.combo >= 2 ? `連招 ×${(1 + s.combo * 0.15).toFixed(2)}` : "";
  ui.statusMessage.textContent = s.message || "";
  ui.speedPanel.hidden = !s.meterActive;
  if (s.meterActive) {
    ui.speedFill.style.transform = `scaleX(${s.speedNorm})`;
    ui.speedFill.dataset.high = s.speedNorm > 0.75 ? "1" : "0";
  }
};

// ── 鍵盤 ──
window.addEventListener("keydown", (e) => {
  if (e.target && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
  if (["Space", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  if (game.phase === "menu") return;
  audio.unlock();
  if (e.code === "KeyA" || e.code === "ArrowLeft") game.controls.left = true;
  if (e.code === "KeyD" || e.code === "ArrowRight") game.controls.right = true;
  if (e.code === "Space") game.controls.pumpHeld = true;
  if (e.code === "KeyV" && !e.repeat) game.cycleCameraView();
});
window.addEventListener("keyup", (e) => {
  if (e.code === "KeyA" || e.code === "ArrowLeft") game.controls.left = false;
  if (e.code === "KeyD" || e.code === "ArrowRight") game.controls.right = false;
  if (e.code === "Space") game.controls.pumpHeld = false;
});
window.addEventListener("blur", () => {
  game.controls.left = game.controls.right = game.controls.pumpHeld = false;
});

// ── 觸控(按住式) ──
const holdBtn = (el, key) => {
  if (!el) return;
  const on = (e) => { e.preventDefault(); audio.unlock(); game.controls[key] = true; };
  const off = (e) => { e.preventDefault(); game.controls[key] = false; };
  el.addEventListener("pointerdown", on);
  el.addEventListener("pointerup", off);
  el.addEventListener("pointerleave", off);
  el.addEventListener("pointercancel", off);
};
holdBtn(ui.touchPump, "pumpHeld");
holdBtn(ui.touchLeft, "left");
holdBtn(ui.touchRight, "right");

// ── HUD 鈕 ──
ui.cameraButton.addEventListener("click", () => { audio.uiTap(); game.cycleCameraView(); });
ui.fullscreenButton.addEventListener("click", () => {
  audio.uiTap();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
});
ui.menuButton.addEventListener("click", () => {
  audio.uiTap(); audio.stopCrowd();
  game.phase = "menu";
  ui.homeScreen.classList.add("visible");
  ui.matchOverlay.classList.remove("visible");
});
const applyAudio = () => {
  audio.setEnabled(audioEnabled);
  setVoiceEnabled(audioEnabled);
  ui.audioButton.textContent = audioEnabled ? "音效開啟" : "音效靜音";
  if (!audioEnabled) audio.stopCrowd();
  persist();
};
ui.audioButton.addEventListener("click", () => { audioEnabled = !audioEnabled; applyAudio(); });
ui.audioSelect.addEventListener("change", (e) => { audioEnabled = e.target.value === "on"; applyAudio(); });

// ── 主選單 ──
function persist() {
  saveSettings({ difficulty: selectedDifficulty, audioEnabled });
}
function syncMenu() {
  ui.difficultySelect.value = selectedDifficulty;
  ui.audioSelect.value = audioEnabled ? "on" : "off";
  ui.audioButton.textContent = audioEnabled ? "音效開啟" : "音效靜音";
}
ui.difficultySelect.addEventListener("change", (e) => { selectedDifficulty = e.target.value; persist(); });

function beginRun() {
  audio.unlock(); audio.uiTap();
  persist();
  game.applyPresentation({ difficulty: selectedDifficulty });
  ui.homeScreen.classList.remove("visible");
  ui.matchOverlay.classList.remove("visible");
  ui.controlsPanel.hidden = false;
  game.start();
}
ui.startButton.addEventListener("click", () => { window.__matchT0 = Date.now(); beginRun(); });   // -done beacon 用:本局開始時間
ui.overlayReplayButton.addEventListener("click", () => { audio.uiTap(); ui.matchOverlay.classList.remove("visible"); beginRun(); });
ui.overlayMenuButton.addEventListener("click", () => {
  audio.uiTap();
  ui.matchOverlay.classList.remove("visible");
  game.phase = "menu";
  ui.homeScreen.classList.add("visible");
});

syncMenu();

// dev(localhost)不註冊 SW——SW 快取會讓每次改動都吃到「上一版」(3d-game-kit SW 地雷)
if ("serviceWorker" in navigator && !["localhost", "127.0.0.1"].includes(location.hostname)) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

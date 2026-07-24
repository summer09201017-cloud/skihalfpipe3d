// gen-voice.mjs —— 用 edge-tts(微軟神經語音,免費)把詞庫預烤成 mp3。
// 兩把嗓:SCRIPTURES→曉臻(女聲,經文莊重)、PHRASES→雲哲(男聲,旁白說書感)。
// 產出 public/voice/<key>.mp3 + manifest.json;runtime src/voice.js mp3 優先、缺檔=只出字幕不唸
// (★人聲鐵則:不用 Web Speech 機器聲 fallback)。用法:node scripts/gen-voice.mjs(需網路;產物進 git,離線可玩)。
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { voiceKey, PHRASES, SCRIPTURES } from "../src/voicePhrases.js";

// msedge-tts 內部的非同步清理會在我們搬走檔案後再 unlink 一次→吞掉這個特定錯誤,別讓它炸掉整批
process.on("uncaughtException", (e) => {
  if (e && e.code === "ENOENT" && e.syscall === "unlink") return;
  console.error(e);
  process.exit(1);
});

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "public", "voice");
mkdirSync(OUT, { recursive: true });

const manifestPath = join(OUT, "manifest.json");
let manifest = {};
try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); } catch { /* 第一次 */ }
const saveManifest = () => writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + "\n", "utf8");

const SCRIPTURE_VOICE = "zh-TW-HsiaoChenNeural"; // 曉臻(女聲,經文)
const NARRATION_VOICE = "zh-TW-YunJheNeural";    // 雲哲(男聲,旁白)

// 逐句烤(累加式:已有的檔跳過;一句一個 tts 連線,msedge-tts 這台一次一句最穩)
const JOBS = [
  ...SCRIPTURES.map((text) => ({ text, voice: SCRIPTURE_VOICE })),
  ...PHRASES.map((text) => ({ text, voice: NARRATION_VOICE })),
];

let made = 0, skipped = 0, failed = 0;
for (const { text, voice } of JOBS) {
  const key = voiceKey(text);
  const file = `${key}.mp3`;
  const fp = join(OUT, file);
  if (existsSync(fp)) { manifest[key] = `voice/${file}`; saveManifest(); skipped++; continue; }
  const tmpDir = join(OUT, `_tmp_${key}`);
  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    mkdirSync(tmpDir, { recursive: true });
    const { audioFilePath } = await tts.toFile(tmpDir, text);
    copyFileSync(audioFilePath, fp); // copy 不 rename:留原檔給 lib 自己清,避免它 unlink 撲空
    try { tts.close && tts.close(); } catch { /* socket 已關 */ }
    manifest[key] = `voice/${file}`;
    saveManifest(); // 逐句落盤:中途死也不丟已完成的
    made++;
    console.log("✓", voice === SCRIPTURE_VOICE ? "[經]" : "[白]", text);
  } catch (err) {
    failed++;
    console.error("✗", text, String(err).slice(0, 120));
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
  }
}
console.log(`done: made ${made}, skipped ${skipped}, failed ${failed}, total ${readdirSync(OUT).filter((f) => f.endsWith(".mp3")).length} mp3`);
process.exit(failed ? 1 : 0); // 明確收尾(lib 的 WebSocket 會讓 process 掛著)

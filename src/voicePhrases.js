// 播報詞庫(固定唸稿)+voiceKey——烤製與 runtime 共用(人聲鐵律:預烤 mp3,絕不 Web Speech)。
// 本作=冬奧類(滑雪 U 型場地),無經文;全部雲哲男聲(轉播感)。
export function voiceKey(text) {
  let h = 0x811c9dc5;
  const s = String(text).replace(/\s+/g, "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(36);
}

// 經文(本作無)——保留欄位讓 gen-voice.mjs 跨專案通用
export const SCRIPTURES = [];

// 旁白/播報(雲哲男聲)
export const PHRASES = [
  "比賽開始,滑起來!",
  "好高的騰空!",
  "空中轉體,漂亮!",
  "抓板動作,帥氣!",
  "落地乾淨俐落!",
  "連續動作,分數起飛!",
  "最後十秒,拼一波大招!",
  "時間到!看看總分!",
];

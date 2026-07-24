// verify-skate.mjs —— Playwright 目視驗收:跑完滑板全流程、逐狀態截圖、抓 pageerror。
// 用法:node scripts/verify-skate.mjs [outDir] [url]   (需先 npm run build + vite preview)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] || join(process.cwd(), "verify-shots");
const URL = process.argv[3] || "http://localhost:4174";
mkdirSync(OUT, { recursive: true });

const errors = [];
const shot = async (page, name) => {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log("  📸", name);
};
const st = (page) => page.evaluate(() => {
  const g = window.__skihalfpipe3d;
  return g ? { phase: g.phase, score: g.score, air: g.s.airborne, z: +g.s.z.toFixed(2), v: +g.s.v.toFixed(2), y: +g.s.y.toFixed(2) } : null;
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });

try {
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await shot(page, "01-menu");

  await page.selectOption("#difficultySelect", "easy").catch(() => {});
  await page.click("#startButton");
  await page.waitForTimeout(800);
  console.log("  after start:", JSON.stringify(await st(page)));

  // 泵起來:按住泵鍵 3 秒(引擎自己判斷下坡時機)
  await page.evaluate(() => { window.__skihalfpipe3d.controls.pumpHeld = true; });
  await page.waitForTimeout(2600);
  await shot(page, "02-riding");
  console.log("  riding:", JSON.stringify(await st(page)));

  // 等騰空(泵到速度夠自然飛);同時按轉體+抓板
  let flew = false;
  for (let i = 0; i < 60; i++) {
    const s = await st(page);
    if (s && s.air) { flew = true; break; }
    await page.waitForTimeout(150);
  }
  console.log("  airborne reached:", flew);
  if (flew) {
    await page.evaluate(() => { window.__skihalfpipe3d.controls.right = true; }); // 空中轉體
    await page.waitForTimeout(260);
    await shot(page, "03-air-trick");
    await page.evaluate(() => { window.__skihalfpipe3d.controls.right = false; });
  }

  // 等落地結算(score > 0)
  let scored = false;
  for (let i = 0; i < 60; i++) {
    const s = await st(page);
    if (s && !s.air && s.score > 0) { scored = true; break; }
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => { window.__skihalfpipe3d.controls.pumpHeld = false; });
  console.log("  landed & scored:", scored, JSON.stringify(await st(page)));
  await shot(page, "04-after-land");

  // 快轉到時間到 → 結算
  await page.evaluate(() => { window.__skihalfpipe3d.timeLeft = 0.4; });
  await page.waitForTimeout(2500);
  const fin = await st(page);
  console.log("  final:", JSON.stringify(fin));
  await shot(page, "05-done");
  const overlayVisible = await page.isVisible("#matchOverlay.visible");
  console.log("  ending overlay visible:", overlayVisible);
  if (!scored) errors.push("gameplay: never landed a scored trick");
  if (!fin || fin.phase !== "done") errors.push("gameplay: did not reach done phase");

  console.log("\n=== RESULT ===");
  console.log("errors:", errors.length);
  for (const e of errors) console.log("   🔴", e);
  console.log(errors.length === 0 ? "🟢 all green" : "🔴 issues found");
} catch (err) {
  console.error("VERIFY FAILED:", err.message);
  errors.push("script: " + err.message);
} finally {
  await browser.close();
  process.exit(errors.length ? 1 : 0);
}

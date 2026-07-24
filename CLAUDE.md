# CLAUDE.md — 3D 滑雪 U 型場地 Ski Halfpipe 3D(維護守則)

**冬奧單板滑雪 U 型場地(半管)計分賽**(2026-07-25,LA/冬奧地基紅利收割 A14)。
換皮自 **skateboard3d**(extreme-terrain-kit C4 地基);地形/物理/玩法一字不改,只換視覺皮。

## 這是什麼
半管(halfpipe)計分賽:泵速(下坡按住=加速)→ 衝出管緣騰空 → 空中轉體/抓板 → 落地結算
(穩=combo 加成)→ 時間到 → 總分 → 三星。**永不會輸**:落地不穩只是晃一下,不摔不傷,最少 ⭐+鼓勵。

## ★C4 地基:src/terrain.js(收割不重寫,一字不改)
- `terrainHeightAt(x,z)` / `terrainSlopeAt(x,z)`:高度場+斜率(板、人全用它=判定=畫面)。
- `createTerrainMesh({color})`:位移 PlaneGeometry(靜態建一次;本作傳雪面色);`createCoping()`:管緣鋼管=lip 標記。
- `alignToSurface(obj,x,z,{offset,tiltMul})`:貼地形(高度+順坡傾斜,用 atan)。
- `TERRAIN.halfpipe`(flat/radius/length):改這裡=改場地型。

## 換皮清單(相對 skateboard3d)——玩法/物理/難度全沒動
- **雪面**:`createTerrainMesh` 傳 `color:0xeaf1f7`;deck/wall/ground 改雪白;天空 `0xbcd6ea`+冷白光。
- **雪板**:`makeSkater` 的 `board` 由「板身+四輪」換成單板(無輪+上翹板頭板尾+雙綁腳固定器)。
- **人物**:雪衣長袖(手臂用 `tee`)+雪褲包腿(thigh/shin 用 `shorts`)+手套(hand 用 `glove`)+雪鏡(推額前,**不遮眼**,守臉部鐵則)。
- **場景**:棕櫚 → 松樹(三層綠圓錐+積雪頂);新增 `buildSnow()`/`updateSnow()` 飄雪粒子(純視覺,Points,`renderFrame` 每幀更新)。
- **identity**:package/title/manifest/sw `skihalfpipe3d-nf1`/icon(雪主題 SVG)/beacon `g=skihalfpipe3d`。

## 量值可調(鐵則)
全在 `DIFFICULTY_PRESETS`(game.js):runSeconds/pump/maxSpeed/assist(落地寬容度)/stars 三星門檻。

## 常用指令
- `npm run dev` / `npm run build` / `npm run preview -- --port 4174`
- `node scripts/verify-skate.mjs [outDir] [url]` Playwright 全流程截圖+抓 pageerror(dev hook=`window.__skihalfpipe3d`)

## 收尾鐵則
- 每次部署 bump `public/sw.js` 的 `CACHE_NAME`(skihalfpipe3d-nf1 → nf2…)。
- 部署 = Cloudflare Pages(`npx wrangler pages deploy dist --project-name skihalfpipe3d`);帳本四處同步:worker NAMES(`skihalfpipe3d`)、奧運頁/大廳卡、作品集 add-work、gamefleet sites.json。
- 相關:[[extreme-terrain-kit]]、[[3d-game-kit]]、[[3d-figure-kit]]、[[baked-voice-commentary]]、[[sports-arcade-kit]]、[[netlify-to-cloudflare-migrate]]。

## 本機地雷
- Windows:`.bat` 純 ASCII+CRLF;localhost 不註冊 SW、不打點(dev 快取雷)。
- three.js bundle ~510KB(gzip 131KB)= 正常,vite 的 500KB 警告可忽略。

榮耀歸神。

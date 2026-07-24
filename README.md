# 3D 滑雪 U 型場地 Ski Halfpipe 3D ❄🏂

冬奧「單板滑雪 U 型場地(半管)」計分賽——**泵出速度、衝出管緣騰空、空中轉體抓板、穩穩落地**;連續穩落地有連招加成,時間到看總分拿星星。可離線 PWA、手機/平板/投影皆可玩,**摔不傷、永遠能完賽**。

## 怎麼玩
- **空白鍵按住**:泵(地面下坡=加速)/ 抓板(空中)
- **A / D** 或 **← / →**:沿場地移動(地面)/ 轉體(空中)
- **V**:視角(斜側 / 正側轉播 / 高空)
- 手機:◀ ▶ + 大顆「泵/抓板」按住式按鈕、⛶ 全螢幕、直向會提示轉橫
- 訣竅:下坡按住泵→速度條衝紅→衝出管緣→轉滿整半圈(180°/360°…)落地=穩!

## 開發
```bash
npm install
npm run dev        # 本機開發(localhost 不註冊 SW)
npm run build      # 產出 dist/
node scripts/gen-voice.mjs     # 烤播報人聲 mp3(雲哲;沿用通用播報,無需重烤)
node scripts/verify-skate.mjs  # Playwright 全流程截圖驗收
```
雙擊 `run.bat` 也可(Windows)。

## 技術
- Three.js;零相依、可離線 PWA。
- **C4 Extreme Terrain 地基**:收割自 skateboard3d 的 `src/terrain.js`(heightAt/slopeAt/alignToSurface,零遊戲耦合、整檔可搬,一字不改)——本作只換皮:雪面色 + 無輪單板雪板 + 雪衣雪褲雪鏡人物 + 松樹雪景 + 飄雪粒子。
- 播報預烤 mp3(絕不 Web Speech 機器聲)。

榮耀歸神。

// 3D 滑板(U 型池)—— 單一 class(場景+狀態機+物理+動畫),不碰 DOM(照 3d-game-kit 三件套)
// C4 Extreme Terrain 首跑:地形地基全在 src/terrain.js(heightAt/slopeAt/alignToSurface,
// 照 water-kit 收割範式,零遊戲耦合)——之後 BMX 換車、衝浪把 heightAt 換成浪高場即收割。
// 玩法:計分賽——按住「泵」下坡加速、衝出池緣騰空、空中 ←/→ 轉體+按住抓板、
// 落地穩=滿分結算;連續穩落地 combo 加成。永不會輸:落地不穩只是晃一下,不摔不傷。
import * as THREE from "three";
import {
  TERRAIN, terrainHeightAt, terrainSlopeAt, lipInfo,
  createTerrainMesh, createCoping, alignToSurface,
} from "./terrain.js";

export const DIFFICULTY_LABELS = {
  kids: "幼兒", child: "兒童", easy: "入門", normal: "標準", hard: "職業",
};

// 五檔難度(量值鐵則:玩法數字集中這裡,寧可偏簡單)
// runSeconds=一輪秒數;pump=泵加速度;maxSpeed=速度上限;assist=落地寬容(轉體離整半圈幾度內算穩);
// stars=[⭐,⭐⭐,⭐⭐⭐] 門檻
export const DIFFICULTY_PRESETS = {
  kids:   { runSeconds: 40, pump: 7.5, maxSpeed: 8.0,  assist: 80, stars: [120, 320, 600] },
  child:  { runSeconds: 50, pump: 7.0, maxSpeed: 8.5,  assist: 65, stars: [220, 520, 900] },
  easy:   { runSeconds: 60, pump: 6.5, maxSpeed: 9.0,  assist: 55, stars: [320, 720, 1200] },
  normal: { runSeconds: 60, pump: 6.0, maxSpeed: 9.5,  assist: 45, stars: [420, 950, 1550] },
  hard:   { runSeconds: 75, pump: 5.6, maxSpeed: 10.0, assist: 35, stars: [600, 1300, 2100] },
};

const G = 9.8;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const rand = (a, b) => a + Math.random() * (b - a);

export class SkateboardGame {
  constructor({ canvas }) {
    this.canvas = canvas;
    this.difficulty = "easy";

    // 狀態機:menu → run → done
    this.phase = "menu";
    this.message = "選擇難度後開始。";
    this.time = 0;
    this.hudTimer = 0;
    this.cameraView = 0;
    this.cameraShake = 0;

    this.onHud = null;
    this.onEvent = null;

    // 操作旗標(main.js 設定):pumpHeld=泵/抓板;left/right=位移/轉體
    this.controls = { left: false, right: false, pumpHeld: false };

    // 滑行狀態(z=橫向玩的軸;x=池長方向漂移)
    this.s = {
      z: 0, v: 0, x: 0,
      airborne: false, y: 0, vy: 0, side: 1,
      spin: 0, spinVel: 0, grabT: 0, maxY: 0,
      heading: 1,        // 目前行進方向(給板頭朝向)
      crouch: 0,         // 泵時蹲(動畫)
      wobbleT: 0,        // 落地不穩晃動
      airT: 0,
    };
    this.timeLeft = 60;
    this.score = 0;
    this.combo = 0;
    this.bestTrick = { label: "—", points: 0 };
    this.lastTenWarned = false;

    // ── Three 場景(冬奧雪場) ──
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbcd6ea);
    this.scene.fog = new THREE.Fog(0xcdddeb, 42, 105);

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 260);
    this._camPos = new THREE.Vector3(12, 5, 8);
    this._camLook = new THREE.Vector3(0, 1.4, 0);
    this.camera.position.copy(this._camPos);

    const hemi = new THREE.HemisphereLight(0xeaf4ff, 0x9aa6b2, 1.0); // 雪地反光補亮
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xf3f8ff, 1.15); // 冷白冬陽
    sun.position.set(-14, 26, 12);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xcfe4ff, 0.4); // 補光:池身背光面不死黑
    fill.position.set(14, 16, -10);
    this.scene.add(fill);

    this.buildPark();
    this.skater = this.makeSkater();
    this.scene.add(this.skater.group);

    this.clock = new THREE.Clock();
    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.startLoop();
  }

  emitEvent(type, payload = {}) { if (this.onEvent) this.onEvent({ type, ...payload }); }
  get preset() { return DIFFICULTY_PRESETS[this.difficulty] || DIFFICULTY_PRESETS.easy; }

  // ── 場景:U 型半管 + 管畔 + 松樹雪景 + 看台觀眾(冬奧雪場) ──
  buildPark() {
    // ★地形(C4 地基):位移網格,建一次(雪面色)
    this.terrain = createTerrainMesh({ segX: 24, segZ: 160, color: 0xeaf1f7 });
    this.scene.add(this.terrain);
    this.coping = createCoping(this.scene);
    this.lip = lipInfo();

    // 池緣平台(deck)+ 地面
    const hp = TERRAIN.halfpipe;
    const deckMat = new THREE.MeshStandardMaterial({ color: 0xd8e4ec, roughness: 1 });
    for (const side of [-1, 1]) {
      const deck = new THREE.Mesh(new THREE.BoxGeometry(hp.length, 0.3, 3.4), deckMat);
      deck.position.set(0, hp.radius - 0.15, side * (this.lip.z + 1.7));
      this.scene.add(deck);
      // 圍欄
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(hp.length, 0.06, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.5, metalness: 0.5 }),
      );
      rail.position.set(0, hp.radius + 0.9, side * (this.lip.z + 3.3));
      this.scene.add(rail);
    }
    const groundMat = new THREE.MeshStandardMaterial({ color: 0xeef3f8, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 120), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    this.scene.add(ground);

    // 半管外壁(讓 U 型場地看起來是實體;雪牆色)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xd2dde6, roughness: 0.95 });
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(hp.length, hp.radius, 0.3), wallMat);
      wall.position.set(0, hp.radius / 2, side * (this.lip.z + 0.15));
      this.scene.add(wall);
    }
    for (const end of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, hp.radius, (this.lip.z + 0.3) * 2), wallMat);
      cap.position.set(end * (hp.length / 2 + 0.15), hp.radius / 2, 0);
      this.scene.add(cap);
    }

    // 🌲 松樹(冬奧雪景):幹=棕圓柱、三層綠圓錐、每層頂一薄積雪
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 1 });
    const pineMat = new THREE.MeshStandardMaterial({ color: 0x2f6b45, roughness: 0.9 });
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xf4f9fc, roughness: 0.85 });
    const pineSpots = [[-16, -12], [-8, -13.5], [4, -12.5], [13, -13], [-13, 12.5], [9, 13]];
    for (const [px, pz] of pineSpots) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.4, 8), trunkMat);
      trunk.position.y = 0.7;
      tree.add(trunk);
      for (const [r, h, y] of [[1.4, 1.9, 1.5], [1.05, 1.6, 2.5], [0.7, 1.3, 3.4]]) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), pineMat);
        cone.position.y = y;
        tree.add(cone);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.62, h * 0.4, 8), snowMat);
        cap.position.y = y + h * 0.32;
        tree.add(cap);
      }
      tree.position.set(px, 0, pz);
      tree.scale.setScalar(1.15);
      this.scene.add(tree);
    }

    // ❄ 飄雪(race-stage-kit 純視覺:Points,落到底就繞回頂端)
    this.buildSnow();

    // 看台 + 觀眾(臉部鐵則:膚色頭+彩衣+眼白/瞳孔;InstancedMesh 顧效能)
    const standMat = [0x2a5a8a, 0x33689c, 0x3d76ae];
    for (let tier = 0; tier < 3; tier++) {
      const stand = new THREE.Mesh(new THREE.BoxGeometry(30, 1.3, 2.2), new THREE.MeshStandardMaterial({ color: standMat[tier], roughness: 0.9 }));
      stand.position.set(0, 0.65 + tier * 1.15, this.lip.z + 6.5 + tier * 2.0);
      this.scene.add(stand);
    }
    this.buildCrowd();

    // 彩旗(頂上一排三角旗)
    const flagCols = [0xe8503a, 0xffd23f, 0x3f8f4f, 0x3d76ae, 0xc98ae0];
    for (let i = 0; i < 12; i++) {
      const flag = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 0.55, 3),
        new THREE.MeshStandardMaterial({ color: flagCols[i % flagCols.length], roughness: 0.8, side: THREE.DoubleSide }),
      );
      flag.rotation.x = Math.PI;
      flag.position.set(-11 + i * 2, 6.2, this.lip.z + 5.6);
      this.scene.add(flag);
    }
  }

  // ❄ 飄雪粒子(純視覺,零遊戲耦合;fog:false 免被霧吃掉)
  buildSnow() {
    const N = 620;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    this.snowV = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = rand(-22, 22);
      pos[i * 3 + 1] = rand(0, 20);
      pos[i * 3 + 2] = rand(-16, 16);
      this.snowV[i] = rand(1.2, 3.0);
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
    this.snow = new THREE.Points(geo, mat);
    this.scene.add(this.snow);
  }

  updateSnow(dt) {
    if (!this.snow) return;
    const p = this.snow.geometry.attributes.position;
    for (let i = 0; i < this.snowV.length; i++) {
      let y = p.getY(i) - this.snowV[i] * dt;
      if (y < -0.2) { y = rand(16, 22); p.setX(i, rand(-22, 22)); }
      else p.setX(i, p.getX(i) + Math.sin(this.time * 0.8 + i) * 0.006);
      p.setY(i, y);
    }
    p.needsUpdate = true;
  }

  buildCrowd() {
    const N = 54;
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshStandardMaterial({ roughness: 0.9 }), N);
    const torsos = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 0.3, 0.16), new THREE.MeshStandardMaterial({ roughness: 1 }), N);
    const eyesW = new THREE.InstancedMesh(new THREE.SphereGeometry(0.032, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), N * 2);
    const pupils = new THREE.InstancedMesh(new THREE.SphereGeometry(0.016, 5, 5), new THREE.MeshBasicMaterial({ color: 0x1a1a1a }), N * 2);
    const dummy = new THREE.Object3D();
    const palette = [0xe86a5a, 0x5aa1e8, 0xe8c95a, 0x7fd48a, 0xc98ae0, 0xf2f2f2];
    const skins = [0xf2c89a, 0xe6b183, 0xd9a06f];
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const put = (inst, idx, x, y, z) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, Math.PI, 0); // 面向 -z(看池子)
      dummy.updateMatrix();
      inst.setMatrixAt(idx, dummy.matrix);
    };
    for (let i = 0; i < N; i++) {
      const x = rand(-13, 13);
      const y = rand(1.7, 3.9);
      const z = lipInfo().z + rand(6.2, 10.2);
      put(heads, i, x, y, z);
      heads.setColorAt(i, new THREE.Color(pick(skins)));
      put(torsos, i, x, y - 0.3, z);
      torsos.setColorAt(i, new THREE.Color(pick(palette)));
      put(eyesW, i * 2, x - 0.062, y + 0.035, z - 0.115);
      put(eyesW, i * 2 + 1, x + 0.062, y + 0.035, z - 0.115);
      put(pupils, i * 2, x - 0.062, y + 0.035, z - 0.145);
      put(pupils, i * 2 + 1, x + 0.062, y + 0.035, z - 0.145);
    }
    for (const inst of [heads, torsos, eyesW, pupils]) inst.instanceMatrix.needsUpdate = true;
    if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
    if (torsos.instanceColor) torsos.instanceColor.needsUpdate = true;
    this.scene.add(heads, torsos, eyesW, pupils);
  }

  // 滑雪選手(★臉部鐵則+裝束寫實:安全帽+雪鏡/雪衣長袖/雪褲/手套/雪靴;矩形身體+長腿)
  makeSkater() {
    const g = new THREE.Group();
    g.rotation.order = "YXZ";
    const skin = new THREE.MeshStandardMaterial({ color: 0xf0d3aa, roughness: 0.7, emissive: 0x7a6446, emissiveIntensity: 0.4 });
    const tee = new THREE.MeshStandardMaterial({ color: 0xe8503a, roughness: 0.9 });    // 雪衣(長袖)
    const shorts = new THREE.MeshStandardMaterial({ color: 0x2b3f5c, roughness: 0.95 }); // 雪褲
    const helmetM = new THREE.MeshStandardMaterial({ color: 0x2e77b8, roughness: 0.4 });
    const padM = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.8 });
    const shoe = new THREE.MeshStandardMaterial({ color: 0xeef2f6, roughness: 0.85 });    // 雪靴
    const glove = new THREE.MeshStandardMaterial({ color: 0x1f2a3a, roughness: 0.9 });     // 手套
    const goggleFrame = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.5 });
    const goggleLens = new THREE.MeshStandardMaterial({ color: 0x6fd0e8, roughness: 0.15, metalness: 0.3, emissive: 0x2a6b7a, emissiveIntensity: 0.35 });
    const dark = new THREE.MeshBasicMaterial({ color: 0x23190f });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // 雪板(單板:板面+滑底+上翹板頭板尾+雙綁腳固定器,無輪)
    const board = new THREE.Group();
    const boardTop = new THREE.MeshStandardMaterial({ color: 0x18a0c8, roughness: 0.5, metalness: 0.1 });
    const boardBase = new THREE.MeshStandardMaterial({ color: 0xdfe9f0, roughness: 0.3, metalness: 0.2 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 1.02), boardTop);
    board.add(deck);
    for (const e of [-1, 1]) {
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.16), boardTop);
      tip.position.set(0, 0.03, e * 0.56);
      tip.rotation.x = -e * 0.5;
      board.add(tip);
    }
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.014, 1.0), boardBase);
    base.position.y = -0.03;
    board.add(base);
    const bindMat = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.85 });
    for (const bz of [-0.24, 0.24]) {
      const bind = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.2), bindMat);
      bind.position.set(0, 0.05, bz);
      board.add(bind);
    }
    board.position.y = 0.11;
    g.add(board);

    // 腿(pivot 在髖;雪板站姿=雙腳前後開、微蹲)——長腿 v2 比例;雪褲包腿
    const mkLeg = (z) => {
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.98, z);
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.42, 0.15), shorts);
      thigh.position.y = -0.21;
      pivot.add(thigh);
      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.4, 0.13), shorts);
      shin.position.y = -0.6;
      pivot.add(shin);
      const knee = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.12, 0.17), padM); // 護膝
      knee.position.y = -0.44;
      pivot.add(knee);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.26), shoe);
      foot.position.set(0, -0.82, 0.03);
      pivot.add(foot);
      g.add(pivot);
      return pivot;
    };
    const legF = mkLeg(0.24);   // 前腳
    const legB = mkLeg(-0.24);  // 後腳

    // 雪褲+雪衣軀幹(矩形身體鐵則)
    const hip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.24, 0.3), shorts);
    hip.position.y = 1.06;
    g.add(hip);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.28), tee);
    torso.position.y = 1.44;
    g.add(torso);

    // 手臂(pivot 在肩;平衡張開/抓板下伸)——雪衣長袖+護肘+手套
    const mkArm = (x) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 1.62, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.46, 0.11), tee);
      arm.position.y = -0.23;
      pivot.add(arm);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.14), padM); // 護肘
      pad.position.y = -0.24;
      pivot.add(pad);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), glove);
      hand.position.y = -0.5;
      pivot.add(hand);
      g.add(pivot);
      return pivot;
    };
    const armL = mkArm(-0.3), armR = mkArm(0.3);

    // 頭+臉(面向 +z)+安全帽
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 16), skin);
    head.position.y = 1.92;
    g.add(head);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), helmetM);
    helmet.position.y = 1.95;
    g.add(helmet);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.215, 0.035, 16), helmetM);
    brim.position.y = 1.94;
    g.add(brim);
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), white);
    eyeL.position.set(-0.07, 1.94, 0.155);
    g.add(eyeL);
    const eyeR = eyeL.clone(); eyeR.position.x = 0.07; g.add(eyeR);
    const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.019, 8, 8), dark);
    pupilL.position.set(-0.07, 1.94, 0.19); g.add(pupilL);
    const pupilR = pupilL.clone(); pupilR.position.x = 0.07; g.add(pupilR);
    const browL = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.016, 0.016), dark);
    browL.position.set(-0.07, 2.0, 0.17); browL.rotation.z = 0.14; g.add(browL);
    const browR = browL.clone(); browR.position.x = 0.07; browR.rotation.z = -0.14; g.add(browR);
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 12, Math.PI), dark);
    smile.position.set(0, 1.85, 0.165); smile.rotation.z = Math.PI; g.add(smile);

    // 雪鏡(推在額前/帽沿上,不遮眼——臉部鐵則:眼/眉/嘴表情全露出)
    const goggleStrap = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.022, 8, 22), goggleFrame);
    goggleStrap.position.set(0, 2.03, 0); goggleStrap.rotation.x = Math.PI / 2; g.add(goggleStrap);
    const goggleBody = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.07), goggleFrame);
    goggleBody.position.set(0, 2.04, 0.135); g.add(goggleBody);
    const goggleGlass = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.02), goggleLens);
    goggleGlass.position.set(0, 2.04, 0.175); g.add(goggleGlass);

    return { group: g, board, legF, legB, armL, armR };
  }

  // ── 流程 API(main.js 呼叫) ──
  applyPresentation({ difficulty }) {
    if (difficulty && DIFFICULTY_PRESETS[difficulty]) this.difficulty = difficulty;
  }

  start() {
    const p = this.preset;
    this.phase = "run";
    this.timeLeft = p.runSeconds;
    this.score = 0;
    this.combo = 0;
    this.bestTrick = { label: "—", points: 0 };
    this.lastTenWarned = false;
    Object.assign(this.s, {
      z: 0, v: 2.2, x: 0, airborne: false, y: 0, vy: 0, side: 1,
      spin: 0, spinVel: 0, grabT: 0, maxY: 0, heading: 1, crouch: 0, wobbleT: 0, airT: 0,
    });
    this.skater.group.rotation.set(0, 0, 0);
    this.message = "按住「泵」下坡加速,衝出池緣飛起來!";
    this.emitEvent("run-start");
    this.pushHud();
  }

  cycleCameraView() {
    this.cameraView = (this.cameraView + 1) % 3;
    const names = ["斜側視角", "正側轉播", "高空俯瞰"];
    this.message = `視角:${names[this.cameraView]}`;
    this.pushHud();
  }

  // ── 主迴圈 ──
  startLoop() {
    if (this._raf) return; // 防雙迴圈(3d-game-kit 雷)
    const loop = () => {
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.time += dt;
      this.update(dt);
      this.renderFrame(dt);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  update(dt) {
    if (this.phase !== "run") return;
    const p = this.preset;
    const s = this.s;

    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.timeLeft <= 10 && !this.lastTenWarned) {
      this.lastTenWarned = true;
      this.message = "最後十秒——拼一波大招!";
      this.emitEvent("ten-left");
    }
    if (this.timeLeft <= 0 && !s.airborne) {
      this.endRun(); // 空中則等落地結算
      return;
    }

    if (s.airborne) this.updateAir(dt);
    else this.updateGround(dt, p);
    this.hudTick(dt);
  }

  updateGround(dt, p) {
    const s = this.s;
    const slope = terrainSlopeAt(s.x, s.z).dz;

    // 重力沿坡分量 + 小摩擦
    s.v += -G * slope * dt;
    s.v *= Math.max(0, 1 - 0.06 * dt);

    // ★泵(pump):在過渡弧「往池心下坡」時按住=加速(一學就會的 Tiny Wings 式)
    const downhill = Math.abs(s.z) > TERRAIN.halfpipe.flat * 0.6 && Math.sign(s.v) === -Math.sign(s.z) && Math.abs(s.v) > 0.3;
    if (this.controls.pumpHeld && downhill) {
      s.v += Math.sign(s.v) * p.pump * dt;
      s.crouch = Math.min(1, s.crouch + dt * 6);
    } else {
      s.crouch = Math.max(0, s.crouch - dt * 5);
    }
    s.v = clamp(s.v, -p.maxSpeed, p.maxSpeed);

    // 平地推進助力:速度太低時自動補一點(永不卡死在池底)
    if (Math.abs(s.v) < 1.2 && Math.abs(s.z) < TERRAIN.halfpipe.flat) {
      s.v += (s.v >= 0 ? 1 : -1) * 1.5 * dt;
    }

    // 池長方向漂移(◀▶ 地面=沿池移動)
    const drift = (this.controls.right ? 1 : 0) - (this.controls.left ? 1 : 0);
    s.x = clamp(s.x + drift * 2.2 * dt, -TERRAIN.halfpipe.length / 2 + 2, TERRAIN.halfpipe.length / 2 - 2);

    s.z += s.v * dt;
    if (Math.abs(s.v) > 0.2) s.heading = Math.sign(s.v);

    // ★衝出池緣=騰空(判定=畫面:出緣速度直接變垂直初速)
    const lipZ = lipInfo().z - 0.05;
    if (Math.abs(s.z) >= lipZ) {
      const outward = Math.sign(s.z);
      if (Math.sign(s.v) === outward && Math.abs(s.v) > 2.2) {
        s.airborne = true;
        s.side = outward;
        s.z = lipZ * outward;
        s.y = lipInfo().height;
        s.vy = Math.abs(s.v) * 0.92;
        s.maxY = s.y;
        s.spin = 0; s.spinVel = 0; s.grabT = 0; s.airT = 0;
        this.emitEvent("air", { speed: Math.abs(s.v) });
      } else {
        // 速度不夠:貼著弧頂滑回來(不硬彈)
        s.z = lipZ * Math.sign(s.z);
        s.v = -Math.sign(s.z) * Math.max(Math.abs(s.v) * 0.4, 0.8);
      }
    }
    if (s.wobbleT > 0) s.wobbleT -= dt;
  }

  updateAir(dt) {
    const s = this.s;
    s.airT += dt;
    s.vy -= G * dt;
    s.y += s.vy * dt;
    s.maxY = Math.max(s.maxY, s.y);

    // 空中:◀▶=轉體(持續加轉);按住泵鍵=抓板
    const spinDir = (this.controls.right ? 1 : 0) - (this.controls.left ? 1 : 0);
    const targetVel = spinDir * 420; // deg/s
    s.spinVel = lerp(s.spinVel, targetVel, 1 - Math.exp(-dt * 6));
    s.spin += s.spinVel * dt;
    if (this.controls.pumpHeld) s.grabT += dt;

    // 回落到池緣高度=落地
    if (s.y <= lipInfo().height && s.vy < 0) this.land();
  }

  land() {
    const p = this.preset;
    const s = this.s;
    const lip = lipInfo();
    const heightGain = Math.max(0, s.maxY - lip.height);
    const spinAbs = Math.abs(s.spin);
    const halfTurns = Math.round(spinAbs / 180);
    const spinDeg = halfTurns * 180;
    const offBy = Math.abs(spinAbs - spinDeg);
    const clean = offBy <= p.assist;
    const grabbed = s.grabT >= 0.22;

    // 計分(落地那一刻結算;連續穩落地=combo 加成)
    let pts = 10 + Math.round(heightGain * 15) + halfTurns * 25 + (grabbed ? 20 : 0) + (clean ? 15 : 0);
    if (clean) this.combo = Math.min(this.combo + 1, 5);
    else this.combo = 0;
    const mult = 1 + this.combo * 0.15;
    pts = Math.round((pts * mult) / 5) * 5;
    this.score += pts;

    // 招式名
    const parts = [];
    if (spinDeg >= 180) parts.push(`${spinDeg}° 轉體`);
    if (grabbed) parts.push("抓板");
    if (heightGain > 1.4) parts.push("高飛");
    if (!parts.length) parts.push("小騰空");
    const label = parts.join("+");
    if (pts > this.bestTrick.points) this.bestTrick = { label, points: pts };

    // 回到地面:向池心;落地效率看穩不穩(不穩只是慢+晃,永不摔傷)
    s.airborne = false;
    s.z = (lip.z - 0.45) * s.side; // 落在過渡弧上(貼著 lip 會被池壁視覺吃掉)
    s.v = -s.side * Math.max(0, -s.vy) * (clean ? 0.9 : 0.55);
    s.v = clamp(s.v, -p.maxSpeed, p.maxSpeed);
    s.wobbleT = clean ? 0 : 0.7;
    this.skater.group.rotation.y = 0;

    this.message = clean
      ? `${label}!+${pts} 分${this.combo >= 2 ? `(連招 ×${(1 + this.combo * 0.15).toFixed(2)})` : ""}`
      : `${label}——落地晃了一下,+${pts} 分,穩住再來!`;
    this.emitEvent("trick", { label, points: pts, clean, combo: this.combo, heightGain, spinDeg, grabbed });
    if (this.timeLeft <= 0) this.endRun();
    this.pushHud();
  }

  // 終局:分數→星等(永不會輸:最少也有 ⭐+鼓勵)
  endRun() {
    this.phase = "done";
    const [, s2, s3] = this.preset.stars;
    const stars = this.score >= s3 ? 3 : this.score >= s2 ? 2 : 1;
    const starStr = "⭐".repeat(stars);
    const title = stars === 3 ? `${starStr} 完美演出!` : stars === 2 ? `${starStr} 好厲害!` : `${starStr} 完賽!`;
    const text = stars === 3
      ? `總分 ${this.score}!高度、轉體、抓板全都到位——你就是這座 U 型場地今天的主角!🏂`
      : stars === 2
        ? `總分 ${this.score}!招式越來越順了——泵得再快一點、轉體多半圈,三星就是你的!`
        : `總分 ${this.score}!每一次騰空都是進步——記住:下坡時按住「泵」,速度夠了自然飛得高!`;
    this.message = "時間到!";
    this.emitEvent("run-end", { score: this.score, stars, title, text, bestTrick: this.bestTrick });
    this.pushHud();
  }

  // ── HUD ──
  hudTick(dt) {
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.pushHud();
    }
  }

  pushHud() {
    if (!this.onHud) return;
    const p = this.preset;
    this.onHud({
      phase: this.phase,
      message: this.message,
      timeLeft: this.timeLeft,
      score: this.score,
      combo: this.combo,
      bestTrick: this.bestTrick,
      speedNorm: clamp(Math.abs(this.s.v) / p.maxSpeed, 0, 1),
      airborne: this.s.airborne,
      meterActive: this.phase === "run",
    });
  }

  // ── 呈現 ──
  renderFrame(dt) {
    const s = this.s;
    const sk = this.skater;

    this.updateSnow(dt); // ❄ 飄雪(選單/遊戲中都飄)

    if (this.phase !== "menu") {
      sk.group.position.x = s.x;
      sk.group.position.z = s.z;

      if (s.airborne) {
        sk.group.position.y = s.y;
        sk.group.rotation.x = 0;
        sk.group.rotation.z = -s.side * 0.12;
        sk.group.rotation.y = THREE.MathUtils.degToRad(s.spin) * s.side;
        // 空中姿態:縮腿;抓板=單手下伸碰板、另一手高舉
        const tuck = this.controls.pumpHeld ? 1 : 0.55;
        sk.legF.rotation.x = -0.9 * tuck;
        sk.legB.rotation.x = 0.9 * tuck;
        if (this.controls.pumpHeld) {
          sk.armR.rotation.x = -2.6; // 下伸抓板
          sk.armL.rotation.x = Math.PI * 0.75;
          sk.armL.rotation.z = 0;
          sk.armR.rotation.z = 0;
        } else {
          sk.armL.rotation.z = 1.1;
          sk.armR.rotation.z = -1.1;
          sk.armL.rotation.x = 0;
          sk.armR.rotation.x = 0;
        }
      } else if (this.phase === "done") {
        // 收招行禮:舉手揮
        sk.group.rotation.set(0, 0, 0);
        alignToSurface(sk.group, s.x, s.z, { offset: 0, tiltMul: 0.4 });
        sk.armR.rotation.x = -Math.PI * 0.85 + Math.sin(this.time * 4) * 0.25;
        sk.armR.rotation.z = 0;
        sk.armL.rotation.z = 0.3;
        sk.armL.rotation.x = 0;
        sk.legF.rotation.x = -0.15;
        sk.legB.rotation.x = 0.15;
      } else {
        // 地面:貼地形(★C4 地基:板貼坡)
        alignToSurface(sk.group, s.x, s.z, { offset: 0, tiltMul: 0.85 });
        sk.group.rotation.y = s.heading > 0 ? 0 : Math.PI; // 板頭朝行進方向
        sk.armL.rotation.z = 0.35;
        sk.armR.rotation.z = -0.35;
        sk.armL.rotation.x = 0;
        sk.armR.rotation.x = 0;
        // 蹲(泵)/站
        const bend = 0.35 + s.crouch * 0.55;
        sk.legF.rotation.x = -bend * 0.7;
        sk.legB.rotation.x = bend * 0.7;
        sk.group.position.y += -s.crouch * 0.16;
        // 落地不穩:晃
        if (s.wobbleT > 0) {
          sk.group.rotation.z += Math.sin(this.time * 26) * 0.16 * s.wobbleT;
          sk.armL.rotation.z = 0.9;
          sk.armR.rotation.z = -0.9;
        }
      }
    }

    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  updateCamera(dt) {
    const s = this.s;
    const k = 1 - Math.exp(-dt * 3);
    const py = s.airborne ? s.y : terrainHeightAt(s.x, s.z);
    const focus = new THREE.Vector3(s.x, py * 0.6 + 1.2, s.z * 0.55);
    const offsets = [
      new THREE.Vector3(10.5, 4.6, 7.5),  // 斜側
      new THREE.Vector3(13.5, 3.4, 0),    // 正側轉播(看 U 斷面)
      new THREE.Vector3(0.1, 17, 4),      // 高空
    ];
    this._camLook.lerp(focus, k);
    this._camPos.lerp(focus.clone().add(offsets[this.cameraView]), k);
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._camLook);
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}

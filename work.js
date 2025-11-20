/* -------------------------------------------------
 * Emotion Type Perlin Warp（静态版）
 * 4 fonts + Volume / Pitch slider
 * ------------------------------------------------*/

let fontPaths = [
  "Emotion1.otf",
  "Emotion2.otf",
  "Emotion3.otf",
  "Emotion4.otf"
];

let fontNames = ["OUTWARD", "INWARD", "DEFENSIVE", "CONTRADICTORY"];

let fonts = [];
let activeFontIndex = 0;

// UI
let btns = [];
let volumeSlider, pitchSlider;
let volumeLabel, pitchLabel;

// 文本
let typedText = "HELLO";
const MAX_LEN = 20;

// 点采样密度（越大越细）
let SAMPLE_FACTOR = 0.45;

// 布局区域
let topBarH = 64;
let bottomBarH = 120;
let drawArea = { x: 40, y: 100, w: 0, h: 0 };

// 点缓存
let pointsCache = null; // {fontIdx, text, size, polys, bbox, offset}
let lastLayoutW = -1, lastLayoutH = -1;

/* ---------------- 预加载字体 ---------------- */
function preload() {
  for (let i = 0; i < fontPaths.length; i++) {
    fonts[i] = loadFont(
      fontPaths[i],
      () => console.log("✔ loaded:", fontPaths[i]),
      () => console.log("❌ failed:", fontPaths[i])
    );
  }
}

/* ---------------- setup ---------------- */
function setup() {
  createCanvas(windowWidth, windowHeight);
  textAlign(CENTER, CENTER);

  // 顶部按钮
  for (let i = 0; i < fontNames.length; i++) {
    const b = createButton(fontNames[i]);
    b.mousePressed(() => setActiveFont(i));
    styleButton(b, i === activeFontIndex);
    btns.push(b);
  }

  // 滑块
  volumeSlider = createSlider(0, 1, 0.0, 0.001);
  pitchSlider  = createSlider(0, 1, 0.0, 0.001);
  styleSlider(volumeSlider);
  styleSlider(pitchSlider);

  volumeLabel = createDiv("Volume: 0.00 → 扭曲（左右）");
  pitchLabel  = createDiv("Pitch:  0.00 → 扭曲（上下）");
  styleLabel(volumeLabel);
  styleLabel(pitchLabel);

  layoutUI();
}

/* ---------------- draw ---------------- */
function draw() {
  background(0);
  layoutUI();

  drawTopBar();

  volumeLabel.html(`Volume: ${nf(volumeSlider.value(), 1, 2)} → 扭曲（左右）`);
  pitchLabel .html(`Pitch:  ${nf(pitchSlider.value(), 1, 2)} → 扭曲（上下）`);

  if (!fonts[activeFontIndex]) {
    fill(200);
    textSize(16);
    text("字体加载中…", width / 2, height / 2);
    return;
  }

  renderTypeWarp();
  drawBottomBarHelp();
}

/* ---------------- 键盘输入 ---------------- */
function keyTyped() {
  let c = key.toUpperCase();
  if ((c >= "A" && c <= "Z") || c === " ") {
    if (typedText.length < MAX_LEN) {
      typedText += c;
      invalidateCache();
    }
  }
}

function keyPressed() {
  if (keyCode === BACKSPACE) {
    typedText = typedText.slice(0, -1);
    invalidateCache();
    return false;
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  invalidateCache(true);
}

/* ---------------- UI 样式 & 布局 ---------------- */
function styleButton(b, active) {
  b.style("background", active ? "#ffffff" : "#222222");
  b.style("color", active ? "#000000" : "#dddddd");
  b.style("border", "none");
  b.style("padding", "10px 14px");
  b.style("margin-right", "8px");
  b.style("border-radius", "10px");
  b.style("cursor", "pointer");
}

function styleSlider(s) {
  s.style("width", "360px");
  s.style("accent-color", "#ffffff");
}

function styleLabel(d) {
  d.style("color", "#aaaaaa");
  d.style("font-family", "Helvetica, Arial, sans-serif");
  d.style("font-size", "14px");
}

function layoutUI() {
  // 顶部按钮
  let x = 20;
  for (let i = 0; i < btns.length; i++) {
    btns[i].position(x, 16);
    x += btns[i].size().width + 8;
  }

  drawArea.x = 40;
  drawArea.y = topBarH + 10;
  drawArea.w = width - 80;
  drawArea.h = height - topBarH - bottomBarH;

  // 底部 slider
  const centerX = width / 2;
  volumeSlider.position(centerX - 380, height - 90);
  pitchSlider .position(centerX - 380, height - 50);

  volumeLabel.position(centerX + 10, height - 108);
  pitchLabel .position(centerX + 10, height - 68);
}

function drawTopBar() {
  noStroke();
  fill(255);
  textSize(18);
  textAlign(LEFT, CENTER);
  text("Emotion Type Lab – Perlin Warp", 20, 36);
  textAlign(CENTER, CENTER);

  fill(120);
  textSize(12);
  text("输入 A–Z / 空格；Backspace 删除；上方按钮切换四套情绪字体", width / 2, 36);
}

function drawBottomBarHelp() {
  fill(120);
  textSize(12);
  textAlign(CENTER, CENTER);
  text("Slider 左端：原始字体 ｜ 往右：静态扭曲（Perlin 噪声）", width / 2, height - 18);
}

/* ---------------- 状态切换 ---------------- */
function setActiveFont(i) {
  activeFontIndex = i;
  for (let k = 0; k < btns.length; k++) {
    styleButton(btns[k], k === i);
  }
  invalidateCache();
}

function invalidateCache(forceRelayout = false) {
  pointsCache = null;
  if (forceRelayout) {
    lastLayoutW = -1;
    lastLayoutH = -1;
  }
}

/* ---------------- 核心：静态 / 扭曲 渲染 ---------------- */
function renderTypeWarp() {
  const font = fonts[activeFontIndex];
  const textStr = typedText.length ? typedText : " ";

  // 自适应字体大小
  const targetW = drawArea.w * 0.92;
  const targetH = drawArea.h * 0.8;
  let fontSize = 200;

  for (let iter = 0; iter < 10; iter++) {
    const b = font.textBounds(textStr, 0, 0, fontSize);
    const ratioW = targetW / max(1, b.w);
    const ratioH = targetH / max(1, b.h);
    const ratio  = min(ratioW, ratioH);
    fontSize *= constrain(ratio, 0.75, 1.25);
  }

  const vol = volumeSlider.value();
  const pit = pitchSlider.value();

  // （1）完全静态：原始字体
  if (vol < 0.01 && pit < 0.01) {
    push();
    textFont(font);
    textSize(fontSize);
    fill(255);
    noStroke();
    textAlign(CENTER, CENTER);
    const centerY = drawArea.y + drawArea.h / 2;
    text(textStr, width / 2, centerY);
    pop();
    return;
  }

  // （2）需要扭曲：生成 / 复用点阵
  if (
    pointsCache &&
    pointsCache.fontIdx === activeFontIndex &&
    pointsCache.text    === textStr &&
    abs(pointsCache.size - fontSize) < 0.5 &&
    lastLayoutW === width &&
    lastLayoutH === height
  ) {
    drawWarpedGlyph(pointsCache.polys, pointsCache.bbox, pointsCache.offset, vol, pit, fontSize);
    return;
  }

  // 重新生成点阵
  let polys = [];
  let cursorX = 0;
  const letterSpacing = fontSize * 0.05;

  for (let ci = 0; ci < textStr.length; ci++) {
    const ch = textStr[ci];
    if (ch === " ") {
      cursorX += fontSize * 0.35;
      continue;
    }

    const b = font.textBounds(ch, 0, 0, fontSize);
    const pts = font.textToPoints(ch, cursorX - b.x, -b.y, fontSize, {
      sampleFactor: SAMPLE_FACTOR,
      simplifyThreshold: 0
    });

    const sorted = pts.slice().sort((a, b2) => a.x - b2.x || a.y - b2.y);
    const letterPolys = buildPolylinesFromPoints(sorted, fontSize);
    polys.push(...letterPolys);

    cursorX += b.w + letterSpacing;
  }

  // bbox + 居中
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polys) {
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const bbox = {minX, minY, maxX, maxY, w, h};

  const targetCX = width / 2;
  const targetCY = drawArea.y + drawArea.h / 2;
  const offset = {
    x: targetCX - (minX + w / 2),
    y: targetCY - (minY + h / 2)
  };

  pointsCache = {
    fontIdx: activeFontIndex,
    text: textStr,
    size: fontSize,
    polys,
    bbox,
    offset
  };
  lastLayoutW = width;
  lastLayoutH = height;

  drawWarpedGlyph(polys, bbox, offset, vol, pit, fontSize);
}

/* ---------- 把点按距离切分成多条 polyline ---------- */
function buildPolylinesFromPoints(sorted, fontSize) {
  const polys = [];
  let current = [];
  const GAP = max(6, fontSize * 0.03);

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    if (current.length === 0) {
      current.push(p);
      continue;
    }
    const prev = current[current.length - 1];
    const d = dist(prev.x, prev.y, p.x, p.y);
    if (d > GAP) {
      if (current.length > 2) polys.push(current);
      current = [p];
    } else {
      current.push(p);
    }
  }
  if (current.length > 2) polys.push(current);
  return polys;
}

/* ---------- Perlin 静态扭曲 ---------- */
function drawWarpedGlyph(polys, bbox, offset, vol, pit, fontSize) {
  // 扭曲幅度（不要太大，保证还能看出字）
  const maxAmpX = fontSize * 0.25;
  const maxAmpY = fontSize * 0.30;

  const freq1 = 0.008;
  const freq2 = 0.012;

  // 用距离中心控制边缘更“碎”
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  const maxR = max(bbox.w, bbox.h) / 2;

  stroke(255);
  strokeWeight(1.8);
  noFill();

  for (const poly of polys) {
    beginShape();
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];

      const nx = p.x * freq1;
      const ny = p.y * freq1;

      const n1 = noise(nx, ny);
      const n2 = noise(p.x * freq2 + 100.0, p.y * freq2 + 50.0);

      const v1 = (n1 - 0.5) * 2;
      const v2 = (n2 - 0.5) * 2;

      const dx0 = p.x - cx;
      const dy0 = p.y - cy;
      const r   = sqrt(dx0*dx0 + dy0*dy0);
      const edgeFactor = lerp(0.3, 1.0, constrain(r / maxR, 0, 1));

      const dx = v1 * maxAmpX * vol * edgeFactor + v2 * maxAmpX * 0.3 * vol;
      const dy = v2 * maxAmpY * pit * edgeFactor + v1 * maxAmpY * 0.2 * pit;

      const x = p.x + dx + offset.x;
      const y = p.y + dy + offset.y;

      curveVertex(x, y);
    }
    endShape();
  }
}

/* ---------------------------------------------
 * Emotion Type Lab – 4 fonts + wave / shards warp
 * -------------------------------------------*/

// 字体文件（已经放在同目录）
let fontPaths = [
  "Emotion1.otf",
  "Emotion2.otf",
  "Emotion3.otf",
  "Emotion4.otf"
];

let fontNames = ["OUTWARD", "INWARD", "DEFENSIVE", "CONTRADICTORY"];

let fonts = [];
let activeFontIndex = 0;

// UI 控件
let btns = [];
let volumeSlider, pitchSlider;
let volumeLabel, pitchLabel;
let resetButton;  

// 文本内容
let typedText = "WORDS";
const MAX_LEN = 20;

// 动画时间
let t = 0;
const SPEED = 0.02;

// 点采样密度（越大点越密）
let SAMPLE_FACTOR = 0.32;

// 布局
let topBarH = 64;
let bottomBarH = 120;
let drawArea = { x: 40, y: 100, w: 0, h: 0 };

// 点缓存：避免每帧重新 textToPoints
let pointsCache = null; // {fontIdx,text,size,polys,offset}
let lastLayoutW = -1, lastLayoutH = -1;

/* ---------------- preload：加载四套字体 ---------------- */
function preload() {
  for (let i = 0; i < fontPaths.length; i++) {
    fonts[i] = loadFont(
      fontPaths[i],
      () => console.log("✔ loaded:", fontPaths[i]),
      () => console.log("❌ failed:", fontPaths[i])
    );
  }
}

/* ---------------- setup：搭 UI + 画布 ---------------- */
function setup() {
  createCanvas(windowWidth, windowHeight);
  textAlign(CENTER, CENTER);

  // 顶部按钮
  for (let i = 0; i < fontNames.length; i++) {
    const b = createButton(fontNames[i]);
    b.mousePressed(() => setActiveFont(i));
    b.style("background", i === activeFontIndex ? "#ffffff" : "#222222");
    b.style("color", i === activeFontIndex ? "#000000" : "#dddddd");
    b.style("border", "none");
    b.style("padding", "10px 14px");
    b.style("margin-right", "8px");
    b.style("border-radius", "10px");
    b.style("cursor", "pointer");
    btns.push(b);
  }

  // 滑块（0~1）
  volumeSlider = createSlider(0, 1, 0.0, 0.001); // 默认 0：先看原字体
  pitchSlider  = createSlider(0, 1, 0.0, 0.001);
  styleSlider(volumeSlider);
  styleSlider(pitchSlider);

  volumeLabel = createDiv("Volume: 0.00 → horizontal pull");
  pitchLabel  = createDiv("Pitch:  0.00 → vertical pull");
  styleLabel(volumeLabel);
  styleLabel(pitchLabel);
// Reset 按钮：重置两个 slider
  resetButton = createButton("Reset");
  resetButton.mousePressed(() => {
    volumeSlider.value(0);
    pitchSlider.value(0);
    invalidateCache();   // 回到原字体，再重新算变形
  });
  
  styleResetButton(resetButton);
  layoutUI();
    // ---------- 底部 slider：水平居中 ----------
  const sliderW = 360;
  const sliderX = width / 2 - sliderW / 2;

  volumeSlider.position(sliderX, height - 90);
  pitchSlider.position(sliderX, height - 50);

  // 标签放在各自 slider 正上方
  volumeLabel.position(width / 2 - sliderW / 2, height - 118);
  pitchLabel.position(width / 2 - sliderW / 2, height - 78);

  // Reset 按钮放在两个 slider 右边中间
  const resetX = sliderX + sliderW + 16;
  const resetY = height - 76;  // 大概在两个 slider 中间
  resetButton.position(resetX, resetY);

}

function styleResetButton(b) {
  b.style("background", "#444444");
  b.style("color", "#ffffff");
  b.style("border", "none");
  b.style("padding", "6px 10px");
  b.style("border-radius", "8px");
  b.style("cursor", "pointer");
  b.style("font-family", "Helvetica, Arial, sans-serif");
  b.style("font-size", "12px");
}



/* ---------------- draw：主循环 ---------------- */
function draw() {
  background(0);
  layoutUI();

  drawTopBar();

  volumeLabel.html(`Volume: ${nf(volumeSlider.value(), 1, 2)} → horizontal pull`);
  pitchLabel.html(`Pitch:  ${nf(pitchSlider.value(), 1, 2)} → vertical pull`);

  // 如果当前字体还没加载好，简单做个提示
  if (!fonts[activeFontIndex]) {
    fill(200);
    textSize(16);
    text(
      "Fonts are loading...\nIf nothing appears, please check file names & paths.",
      width / 2, height / 2
    );
    return;
  }

  t += SPEED;
  renderTypeWave();
  drawBottomBarHelp();
}

/* ---------------- 键盘输入：仅 A–Z / 空格 / Backspace ---------------- */
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

/* ---------------- UI 布局 & 样式 ---------------- */
function styleSlider(s) {
  s.style("width", "360px");
  s.style("accent-color", "#ffffff");
}

function styleLabel(d) {
  d.style("color", "#aaaaaa");
  d.style("font-family", "Helvetica, Arial, sans-serif");
  d.style("font-size", "14px");
  d.style("text-align", "center");     // 文本居中
  d.style("width", "360px");           // 和 slider 同宽，便于居中摆放
}

function layoutUI() {
  // ---------- 顶部四个按钮：右上角 ----------
  const marginTop = 16;
  const marginRight = 20;

  let x = width - marginRight;
  for (let i = btns.length - 1; i >= 0; i--) {
    const w = btns[i].size().width;
    btns[i].position(x - w, marginTop);
    x -= w + 8;
  }

  // ---------- 中间绘制区域 ----------
  drawArea.x = 40;
  drawArea.y = topBarH + 10;
  drawArea.w = width - 80;
  drawArea.h = height - topBarH - bottomBarH;

  // ---------- 底部 slider：水平居中 ----------
  const sliderW = 360;
  const sliderX = width / 2 - sliderW / 2;

  volumeSlider.position(sliderX, height - 90);
  pitchSlider.position(sliderX, height - 50);

  // 标签放在各自 slider 正上方
  volumeLabel.position(width / 2 - sliderW / 2, height - 118);
  pitchLabel.position(width / 2 - sliderW / 2, height - 78);
}

function drawTopBar() {
  noStroke();

  // 左上角标题
  fill(255);
  textSize(18);
  textAlign(LEFT, CENTER);
  text("Emotion Type Lab", 20, 36);

  // 顶部中间英文说明
  fill(180);
  textSize(12);
  textAlign(CENTER, CENTER);
  text(
    "Type A–Z / Space · Backspace to delete · use emotion buttons in the top-right to switch fonts",
    width / 2,
    36
  );
}

function drawBottomBarHelp() {
  fill(120);
  textSize(12);
  textAlign(CENTER, CENTER);
  text(
    "Slide left = softer, right = stronger · deformation is driven by the sliders",
    width / 2,
    height - 18
  );
}

/* ---------------- 状态切换 / 缓存 ---------------- */
function setActiveFont(i) {
  activeFontIndex = i;
  for (let k = 0; k < btns.length; k++) {
    const active = k === i;
    btns[k].style("background", active ? "#ffffff" : "#222222");
    btns[k].style("color", active ? "#000000" : "#dddddd");
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

/* ---------------- 核心：生成点阵 / 或原字体 ---------------- */
function renderTypeWave() {
  const font = fonts[activeFontIndex];
  const textStr = typedText.length ? typedText : " ";

  // 1. 自适应字号
  const targetW = drawArea.w * 0.92;
  const targetH = drawArea.h * 0.8;
  let fontSize = 200;

  for (let iter = 0; iter < 10; iter++) {
    const b = font.textBounds(textStr, 0, 0, fontSize);
    const ratioW = targetW / max(1, b.w);
    const ratioH = targetH / max(1, b.h);
    const ratio = min(ratioW, ratioH);
    fontSize *= constrain(ratio, 0.75, 1.25);
  }

  const vol = volumeSlider.value();
  const pit = pitchSlider.value();

  // ★ 两个 slider 都在最左端时：显示静态原字体
  if (vol === 0 && pit === 0) {
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

  // 复用缓存
  if (
    pointsCache &&
    pointsCache.fontIdx === activeFontIndex &&
    pointsCache.text === textStr &&
    abs(pointsCache.size - fontSize) < 0.5 &&
    lastLayoutW === width &&
    lastLayoutH === height
  ) {
    drawPolysWithWarp(pointsCache.polys, pointsCache.offset);
    return;
  }

  // 逐字生成点
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

    // Emotion2（INWARD）的点要更密一点
    let sample = SAMPLE_FACTOR;
    if (activeFontIndex === 1) {
      sample = 0.7;  // 点更多，更容易读字形
    }

    const pts = font.textToPoints(ch, cursorX - b.x, -b.y, fontSize, {
      sampleFactor: sample,
      simplifyThreshold: 0
    });

    const sorted = pts.slice().sort((a, b2) => a.x - b2.x || a.y - b2.y);
    const letterPolys = buildPolylinesFromPoints(sorted, fontSize);
    polys.push(...letterPolys);

    cursorX += b.w + letterSpacing;
  }

  // 计算整体 bbox 并居中
  let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
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
    offset
  };
  lastLayoutW = width;
  lastLayoutH = height;

  drawPolysWithWarp(polys, offset);
}

// 把点按距离切成多条 polyline（避免跨洞/跨笔画）
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

/* ---------------- 根据字体系统区分视觉 ---------------- */
function drawPolysWithWarp(polys, offset) {
  if (activeFontIndex === 0) {
    drawOutwardShards(polys, offset);
  } else if (activeFontIndex === 1) {
    drawInwardDots(polys, offset);
  } else if (activeFontIndex === 2) {
    drawDefensiveBlocks(polys, offset);
  } else if (activeFontIndex === 3) {
    drawContradictoryConflict(polys, offset);
  } else {
    drawFlowWave(polys, offset);
  }
}

/* ====== OUTWARD：更密集的实心锯齿块 + 更小的三角碎片 ====== */
function drawOutwardShards(polys, offset) {
  const vol = volumeSlider.value(); // 0~1 控制扩散强度
  const pit = pitchSlider.value();  // 0~1 控制锯齿撕裂感

  const fontSize = pointsCache ? pointsCache.size : 200;

  // 1. 整体 bbox & 中心（用来确定“向外”的方向）
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polys) {
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const maxR    = max(w, h) / 2;

  // 2. 扩散 / 锯齿参数
  const basePush   = fontSize * 0.04;
  const expandAmp  = fontSize * (0.12 + 0.25 * vol);
  const jagAmp     = fontSize * (0.12 + 0.30 * pit);
  const noiseFreq  = 0.013;
  const waveFreq   = 0.022;

  const shardLen   = fontSize * (0.06 + 0.18 * vol);
  const shardWidth = fontSize * 0.045;

  /* A. 淡淡的原轮廓，帮助阅读 */
  stroke(255, 45);
  strokeWeight(1.0);
  noFill();
  for (const poly of polys) {
    beginShape();
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      curveVertex(p.x + offset.x, p.y + offset.y);
    }
    endShape();
  }

  /* B. 主体：两层实心锯齿块 */
  noStroke();

  // 第一层
  fill(255, 190);
  for (const poly of polys) {
    beginShape();
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];

      let vx = (p.x - centerX) / maxR;
      let vy = (p.y - centerY) / maxR;
      const r = sqrt(vx * vx + vy * vy);
      const edgeFactor = pow(constrain(r, 0, 1), 0.7);

      if (r > 0.0001) {
        vx /= r;
        vy /= r;
      }

      const n   = noise(p.x * noiseFreq, p.y * noiseFreq, t * 0.7);
      const jag = (n - 0.5) * 2;

      const spikeFactor = (i % 2 === 0) ? 1.0 : 0.6;

      let radialPush = basePush + expandAmp * edgeFactor;
      let jagOffset  = jagAmp * jag * edgeFactor * spikeFactor * 0.5;

      const dx = vx * (radialPush + jagOffset * 0.6);
      const dy = vy * (radialPush + jagOffset);

      const x = p.x + dx + offset.x;
      const y = p.y + dy + offset.y;

      vertex(x, y);
    }
    endShape(CLOSE);
  }

  // 第二层
  fill(255, 230);
  for (const poly of polys) {
    beginShape();
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];

      let vx = (p.x - centerX) / maxR;
      let vy = (p.y - centerY) / maxR;
      const r = sqrt(vx * vx + vy * vy);
      const edgeFactor = pow(constrain(r, 0, 1), 0.85);

      if (r > 0.0001) {
        vx /= r;
        vy /= r;
      }

      const n   = noise(p.x * noiseFreq * 1.4, p.y * noiseFreq * 1.2, t * 0.95);
      const jag = (n - 0.5) * 2;
      const wave = sin(i * waveFreq * 9.0 + t * 2.6);

      const centerBoost = 0.4 + (1.0 - abs(r - 0.5) * 2.0);
      const spikeFactor = (i % 3 === 0) ? 1.4 : (i % 2 === 0 ? 1.0 : 0.7);

      let radialPush = basePush * 0.9 + expandAmp * 1.2 * edgeFactor;
      let jagOffset  = jagAmp * (jag * 0.7 + wave * 0.7) * spikeFactor * edgeFactor * centerBoost;

      const dx = vx * (radialPush + jagOffset);
      const dy = vy * (radialPush + jagOffset * 0.9);

      const x = p.x + dx + offset.x;
      const y = p.y + dy + offset.y;

      vertex(x, y);
    }
    endShape(CLOSE);
  }

  /* C. 外圈三角碎片：变小 + 稍微少一点，不抢主体 */
  noStroke();

  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];

      let vx = (p.x - centerX) / maxR;
      let vy = (p.y - centerY) / maxR;
      const r = sqrt(vx * vx + vy * vy);
      const edgeFactor = constrain(r, 0, 1);

      if (r > 0.0001) {
        vx /= r;
        vy /= r;
      }

      const atEdge = smoothstep(0.6, 1.0, edgeFactor);
      if (atEdge <= 0.01) continue;

      const seed = i * 39.7;
      const nn   = noise(p.x * noiseFreq * 1.6 + seed,
                         p.y * noiseFreq * 1.6 - seed + t * 0.9);

      let probBase = map(nn, 0, 1, 0.0, 0.5);
      probBase *= (0.4 + vol * 0.9) * (0.4 + pit * 0.7);
      const prob = probBase * atEdge;

      if (random() > prob) continue;

      let radialPush = basePush + expandAmp * 1.25 * edgeFactor;
      const bx = p.x + vx * radialPush + offset.x;
      const by = p.y + vy * radialPush + offset.y;

      const jitterAngle = (nn - 0.5) * PI * 0.5;
      const ca = cos(jitterAngle);
      const sa = sin(jitterAngle);
      const dirx = vx * ca - vy * sa;
      const diry = vx * sa + vy * ca;

      const tipX = bx + dirx * shardLen;
      const tipY = by + diry * shardLen;

      const perpX = -diry;
      const perpY =  dirx;
      const halfW = shardWidth * (0.5 + atEdge * 0.7);

      const leftX  = bx + perpX * halfW;
      const leftY  = by + perpY * halfW;
      const rightX = bx - perpX * halfW;
      const rightY = by - perpY * halfW;

      const alpha = 60 + 130 * atEdge;
      fill(255, alpha);

      beginShape();
      vertex(leftX,  leftY);
      vertex(tipX,   tipY);
      vertex(rightX, rightY);
      endShape(CLOSE);
    }
  }
}


/* ====== INWARD：Emotion2.otf 点阵内收 + 扩散（点更多更大） ====== */
function drawInwardDots(polys, offset) {
  const vol = volumeSlider.value(); // 0~1：往里收紧
  const pit = pitchSlider.value();  // 0~1：绕圈 / 波动

  const fontSize = pointsCache ? pointsCache.size : 200;

  // 把 poly 里所有点摊开
  let allPts = [];
  for (const poly of polys) {
    allPts = allPts.concat(poly);
  }
  if (allPts.length === 0) return;

  // 1. 计算字形中心 & 尺度
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of allPts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const maxR    = max(w, h) / 2;

  // 2. 参数：放大位移 & 扩散
  const inwardMax = fontSize * 1.0 * vol;
  const slideMax  = fontSize * 1.00 * pit;
  const jitterMax = fontSize * 0.05 * max(vol, pit);
  const noiseFreq = 10.0;

  const deformStrength = 0.55 + 0.95 * max(vol, pit);

  // 3. 画点（无底板）
  noStroke();
  for (const p of allPts) {
    const baseX = p.x + offset.x;
    const baseY = p.y + offset.y;

    let dx0 = p.x - centerX;
    let dy0 = p.y - centerY;
    let dist0 = sqrt(dx0 * dx0 + dy0 * dy0);
    if (dist0 < 1e-4) dist0 = 1e-4;
    const rRatio = constrain(dist0 / maxR, 0, 1);

    let ux = dx0 / dist0;
    let uy = dy0 / dist0;

    const inwardAmount = inwardMax * (0.3 + 0.7 * rRatio);
    const inwardX = -ux * inwardAmount;
    const inwardY = -uy * inwardAmount;

    const tx = -uy;
    const ty =  ux;

    const n  = noise(p.x * noiseFreq, p.y * noiseFreq, t * 0.8);
    const n2 = noise(p.x * noiseFreq * 1.3, p.y * noiseFreq * 1.3, t * 1.1);
    const slideDir = (n - 0.5) * 2;
    const slideAmt = slideMax * slideDir * (0.4 + 0.6 * rRatio);
    const slideX = tx * slideAmt;
    const slideY = ty * slideAmt;

    const jitterR = jitterMax * (0.5 + 0.8 * rRatio);
    const jitterA = TAU * n2;
    const jitterX = cos(jitterA) * jitterR;
    const jitterY = sin(jitterA) * jitterR;

    const targetX = baseX + inwardX + slideX + jitterX;
    const targetY = baseY + inwardY + slideY + jitterY;

    let finalX = lerp(baseX, targetX, deformStrength);
    let finalY = lerp(baseY, targetY, deformStrength);

    finalX = constrain(finalX, -fontSize, width + fontSize);
    finalY = constrain(finalY, -fontSize, height + fontSize);

    const baseDot = fontSize * 0.030;
    const dotSize = baseDot * (1.0 + 0.5 * rRatio + 0.6 * vol);

    fill(230);
    circle(finalX, finalY, dotSize);

    const haloSize = dotSize * (1.4 + 1.0 * pit);
    fill(255, 70 * (0.4 + 0.6 * rRatio));
    circle(finalX, finalY, haloSize);
  }

  // 4. 轻微连线，帮你锁住字形结构
  stroke(255, 50);
  strokeWeight(fontSize * 0.004);

  for (const poly of polys) {
    for (let i = 0; i < poly.length - 1; i++) {
      const p1 = poly[i];
      const p2 = poly[i + 1];

      const d = dist(p1.x, p1.y, p2.x, p2.y);
      if (d > fontSize * 0.32) continue;

      function inwardPosQuick(pp) {
        const baseX = pp.x + offset.x;
        const baseY = pp.y + offset.y;
        let dx0 = pp.x - centerX;
        let dy0 = pp.y - centerY;
        let dist0 = sqrt(dx0 * dx0 + dy0 * dy0);
        if (dist0 < 1e-4) dist0 = 1e-4;
        const rRatio = constrain(dist0 / maxR, 0, 1);
        let ux = dx0 / dist0;
        let uy = dy0 / dist0;
        const inwardAmount = inwardMax * (0.3 + 0.7 * rRatio);
        const inwardX = -ux * inwardAmount;
        const inwardY = -uy * inwardAmount;
        const tx = -uy;
        const ty =  ux;
        const n  = noise(pp.x * noiseFreq, pp.y * noiseFreq, t * 0.8);
        const n2 = noise(pp.x * noiseFreq * 1.3, pp.y * noiseFreq * 1.3, t * 1.1);
        const slideDir = (n - 0.5) * 2;
        const slideAmt = slideMax * slideDir * (0.4 + 0.6 * rRatio);
        const slideX = tx * slideAmt;
        const slideY = ty * slideAmt;
        const jitterR = jitterMax * (0.5 + 0.8 * rRatio);
        const jitterA = TAU * n2;
        const jitterX = cos(jitterA) * jitterR;
        const jitterY = sin(jitterA) * jitterR;
        const targetX = baseX + inwardX + slideX + jitterX;
        const targetY = baseY + inwardY + slideY + jitterY;
        let fx = lerp(baseX, targetX, deformStrength);
        let fy = lerp(baseY, targetY, deformStrength);
        fx = constrain(fx, -fontSize, width + fontSize);
        fy = constrain(fy, -fontSize, height + fontSize);
        return { x: fx, y: fy };
      }

      const a = inwardPosQuick(p1);
      const b = inwardPosQuick(p2);
      line(a.x, a.y, b.x, b.y);
    }
  }

  // 5. 背景噪点
  const sliderStrength = max(vol, pit);
  if (sliderStrength > 0.02) {
    const bgCount = int(map(sliderStrength, 0, 1, 40, 300));

    const gx1 = minX + offset.x - fontSize * 0.2;
    const gx2 = maxX + offset.x + fontSize * 0.2;
    const gy1 = minY + offset.y - fontSize * 0.2;
    const gy2 = maxY + offset.y + fontSize * 0.2;

    noStroke();
    for (let i = 0; i < bgCount; i++) {
      let x = random(width);
      let y = random(height);

      if (x > gx1 && x < gx2 && y > gy1 && y < gy2) {
        const cx = (gx1 + gx2) / 2;
        const cy = (gy1 + gy2) / 2;
        const dx = x - cx;
        const dy = y - cy;
        const len = sqrt(dx * dx + dy * dy) || 1;
        const push = fontSize * 0.3 * sliderStrength;
        x = cx + dx / len * (len + push);
        y = cy + dy / len * (len + push);
      }

      const baseR = fontSize * 0.006;
      const r = baseR * random(0.7, 1.8);
      const alpha = 40 + 120 * sliderStrength * random(0.4, 1.0);

      fill(255, alpha);
      circle(x, y, r);
    }
  }
}

/* =========================================================
 * DEFENSIVE – Emotion3.otf
 * 像素方块 + 抖动轮廓
 * ------------------------------------------------------ */
function drawDefensiveBlocks(polys, offset) {
  const vol = volumeSlider.value(); // 防御强度
  const pit = pitchSlider.value();  // 紧张 / 抖动程度

  const fontSize = pointsCache ? pointsCache.size : 220;

  // 1. 收集点，算出字型包围盒（给 outline 内推用）
  let allPts = [];
  for (const poly of polys) allPts = allPts.concat(poly);
  if (allPts.length === 0) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of allPts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const glyphCenterX = (minX + maxX) / 2;
  const glyphCenterY = (minY + maxY) / 2;

  /* ===============================
   * 2. 像素格 + 方块浮动核心视觉
   * =============================== */
  const cell = fontSize * 0.045; // 像素格大小

  const growMax   = fontSize * 0.08 * (0.35 + vol);
  const jitterMax = fontSize * 0.04 * (0.4 + pit);
  const nFreq     = 0.012;

  // 建立像素格 map（避免重复画）
  const cellMap = new Map();
  for (const p of allPts) {
    const sx = p.x + offset.x;
    const sy = p.y + offset.y;
    const gx = Math.round(sx / cell);
    const gy = Math.round(sy / cell);
    const key = gx + "," + gy;
    if (!cellMap.has(key)) cellMap.set(key, { gx, gy });
  }

  noStroke();
  const baseAlpha = 215;

  for (const { gx, gy } of cellMap.values()) {
    const cx = gx * cell;
    const cy = gy * cell;

    // 动态扩张
    const n = noise(cx * nFreq, cy * nFreq, t * 1.3);
    const grow = growMax * (0.3 + 0.7 * n);

    // 快速抖动
    const n2 = noise(cx * nFreq * 1.9, cy * nFreq * 1.9, t * 2.1);
    const ang = TAU * (n2 - 0.5);
    const jx = cos(ang) * jitterMax;
    const jy = sin(ang) * jitterMax;

    // 外层浅灰护甲块
    const w = cell + grow;
    const h = cell + grow;
    rectMode(CENTER);
    fill(235, baseAlpha);
    rect(cx + jx, cy + jy, w, h, 2);

    // 内层块
    fill(180, baseAlpha * 0.85);
    rect(cx + jx + w * 0.03, cy + jy + h * 0.03, w * 0.68, h * 0.68, 1);
  }

  /* 3. 字型轮廓 outline：两层抖动线条 */
  noFill();

  const outlineFreq = 0.015;
  const outlineAmp  = fontSize * 0.04 * (0.4 + vol);

  // 主轮廓：白色粗线 + 抖动
  stroke(255);
  strokeJoin(ROUND);
  strokeCap(ROUND);
  strokeWeight(fontSize * (0.022 + 0.04 * vol));

  for (const poly of polys) {
    beginShape();
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];

      let x = p.x + offset.x;
      let y = p.y + offset.y;

      const n = noise(p.x * outlineFreq, p.y * outlineFreq, t * 1.5);
      const a = TAU * n;
      const r = outlineAmp * (0.4 + 0.6 * pit);

      x += cos(a) * r;
      y += sin(a) * r;

      curveVertex(x, y);
    }
    endShape();
  }

  // 第二层：偏内圈、较暗
  stroke(200, 210);
  strokeWeight(fontSize * (0.010 + 0.02 * vol));

  for (const poly of polys) {
    beginShape();
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];

      const innerX0 = lerp(p.x, glyphCenterX, 0.08);
      const innerY0 = lerp(p.y, glyphCenterY, 0.08);

      let x = innerX0 + offset.x;
      let y = innerY0 + offset.y;

      const n = noise(p.x * outlineFreq * 1.2, p.y * outlineFreq * 1.2, t * 1.9);
      const a = TAU * n;
      const r = outlineAmp * 0.6 * (0.3 + 0.7 * pit);

      x += cos(a) * r;
      y += sin(a) * r;

      curveVertex(x, y);
    }
    endShape();
  }

  // 4. 焊接线段
  const edgeCount = 12 + int(18 * (vol + pit) * 0.5);
  stroke(255, 230);
  strokeWeight(fontSize * (0.010 + 0.022 * vol));

  for (let i = 0; i < edgeCount; i++) {
    const poly = polys[int(random(polys.length))];
    if (!poly || poly.length < 2) continue;

    const idx = int(random(poly.length));
    const p  = poly[idx];
    const q  = poly[(idx + 1) % poly.length];

    const mx = (p.x + q.x) / 2 + offset.x;
    const my = (p.y + q.y) / 2 + offset.y;

    const ang = atan2(q.y - p.y, q.x - p.x);
    const len = fontSize * random(0.12, 0.22);
    const ex = cos(ang) * len * 0.5;
    const ey = sin(ang) * len * 0.5;

    const ee = noise(i * 0.37, t * 1.7);
    const off = (ee - 0.5) * fontSize * 0.02 * (0.4 + pit);

    line(mx - ex + off, my - ey + off, mx + ex + off, my + ey + off);
  }
}

/* =========================================================
 * CONTRADICTORY – Emotion4.otf
 * 菱形碎片 + 缺口 + 对撞线
 * ------------------------------------------------------ */
function drawContradictoryConflict(polys, offset) {
  const vol = volumeSlider.value(); // 冲突强度
  const pit = pitchSlider.value();  // 扭曲程度

  const fontSize = pointsCache ? pointsCache.size : 200;

  // 收集所有点，计算中心 & 尺度
  let allPts = [];
  for (const poly of polys) allPts = allPts.concat(poly);
  if (allPts.length === 0) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of allPts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  // 撕裂 / 扭曲参数
  const tearAmp   = fontSize * (0.03 + 0.16 * vol);
  const twistAmp  = fontSize * (0.02 + 0.14 * pit);
  const tearFreq  = 0.012;
  const twistFreq = 0.015;

  // 菱形尺寸 & 缺口控制
  const diamondLen  = fontSize * (0.12 + 0.26 * vol);
  const diamondHalf = diamondLen * 0.5;
  const diamondThk  = fontSize * (0.035 + 0.06 * pit + 0.05 * vol);

  const gapFreq    = 0.018;
  const gapProbMax = 0.5;
  const gapProbMin = 0.35;

  noStroke();
  fill(255, 215);

  for (const poly of polys) {
    for (let i = 0; i < poly.length - 1; i++) {
      const p1 = poly[i];
      const p2 = poly[i + 1];

      const bx1 = p1.x + offset.x;
      const by1 = p1.y + offset.y;
      const bx2 = p2.x + offset.x;
      const by2 = p2.y + offset.y;

      let dx = p2.x - p1.x;
      let dy = p2.y - p1.y;
      let segLenGlyph = sqrt(dx * dx + dy * dy);
      if (segLenGlyph < 1e-3) continue;

      const tx = dx / segLenGlyph;
      const ty = dy / segLenGlyph;
      const nx = -ty;
      const ny = tx;

      const midX = (p1.x + p2.x) * 0.5;
      const midY = (p1.y + p2.y) * 0.5;

      const nTear = noise(midX * tearFreq, midY * tearFreq, t * 1.4);
      const sign  = nTear > 0.5 ? 1 : -1;
      const tear  = tearAmp * (0.4 + 0.6 * nTear);
      const twist = sin(midX * twistFreq + t * 2.2) * twistAmp;

      const p1x = bx1 + nx * tear * sign     + tx * twist * -0.6;
      const p1y = by1 + ny * tear * sign     + ty * twist * -0.6;
      const p2x = bx2 - nx * tear * sign     + tx * twist *  0.6;
      const p2y = by2 - ny * tear * sign     + ty * twist *  0.6;

      const segLenScreen = dist(p1x, p1y, p2x, p2y);
      if (segLenScreen < diamondLen * 0.5) continue;

      const steps = max(2, int(segLenScreen / (diamondLen * 0.8)));
      const stepT = 1 / steps;

      for (let s = 0; s <= 1 + 1e-4; s += stepT) {
        const cx = lerp(p1x, p2x, s);
        const cy = lerp(p1y, p2y, s);

        const gn = noise(cx * gapFreq, cy * gapFreq, t * 1.1);
        const gapProb = lerp(gapProbMin, gapProbMax, vol);

        if (gn < gapProb) {
          if (random() < 0.25 * (1.0 - vol)) {
            fill(255, 70);
          } else {
            continue;
          }
        } else {
          fill(255, 215);
        }

        const lenScale = 1.0 + 0.25 * (gn - 0.5) + 0.4 * vol;
        const halfL = diamondHalf * lenScale;
        const halfT = diamondThk * (0.5 + 0.5 * pit);

        const ax = cx + tx * halfL;
        const ay = cy + ty * halfL;
        const cx2 = cx - tx * halfL;
        const cy2 = cy - ty * halfL;
        const bx = cx + nx * halfT;
        const by = cy + ny * halfT;
        const dx2 = cx - nx * halfT;
        const dy2 = cy - ny * halfT;

        beginShape();
        vertex(ax,  ay);
        vertex(bx,  by);
        vertex(cx2, cy2);
        vertex(dx2, dy2);
        endShape(CLOSE);
      }
    }
  }

  // 纠缠线
  const waveFreq = 0.010;
  const waveAmp  = fontSize * (0.02 + 0.14 * pit);

  stroke(200, 210);
  strokeWeight(fontSize * 0.007);
  noFill();

  for (const poly of polys) {
    beginShape();
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];

      const dx0 = p.x - centerX;
      const dy0 = p.y - centerY;
      const r   = sqrt(dx0 * dx0 + dy0 * dy0) || 1;
      const ux  = dx0 / r;
      const uy  = dy0 / r;

      const ang   = atan2(dy0, dx0);
      const wave1 = sin(ang * 6.0 + t * 2.8);
      const wave2 = sin(p.x * waveFreq + t * 1.9);
      const wMix  = (wave1 * 0.6 - wave2 * 0.4);

      const offsetR = waveAmp * wMix;

      const x = p.x + offset.x + ux * offsetR;
      const y = p.y + offset.y + uy * offsetR;

      curveVertex(x, y);
    }
    endShape();
  }

  // 内部对撞线
  const clashCount = 10 + int(22 * max(vol, pit));
  stroke(255, 180);
  strokeWeight(fontSize * (0.010 + 0.020 * pit));

  for (let i = 0; i < clashCount; i++) {
    const poly = polys[int(random(polys.length))];
    if (!poly || poly.length < 2) continue;

    const idx = int(random(poly.length));
    const p   = poly[idx];

    const baseX = p.x + offset.x;
    const baseY = p.y + offset.y;

    let dx0 = p.x - centerX;
    let dy0 = p.y - centerY;
    let r0  = sqrt(dx0 * dx0 + dy0 * dy0) || 1;
    dx0 /= r0;
    dy0 /= r0;

    const rot = random([-PI / 4, PI / 4]);
    const ca  = cos(rot);
    const sa  = sin(rot);
    const dirx = dx0 * ca - dy0 * sa;
    const diry = dx0 * sa + dy0 * ca;

    const len  = fontSize * random(0.18, 0.40);
    const offN = fontSize * 0.03 * (0.3 + vol);

    const n = noise(p.x * 0.03, p.y * 0.03, t * 2.3);
    const j = (n - 0.5) * offN;

    const x1 = baseX - dirx * len * 0.5 + j;
    const y1 = baseY - diry * len * 0.5 + j;
    const x2 = baseX + dirx * len * 0.5 - j;
    const y2 = baseY + diry * len * 0.5 - j;

    line(x1, y1, x2, y2);
  }
}

/* ====== 其他字体：柔和波浪轮廓（兜底） ====== */
function drawFlowWave(polys, offset) {
  const vol = volumeSlider.value();
  const pit = pitchSlider.value();
  const fontSize = pointsCache ? pointsCache.size : 200;

  const baseAmpX = fontSize * 0.01;
  const baseAmpY = fontSize * 0.01;
  const maxExtraX = fontSize * 0.15;
  const maxExtraY = fontSize * 0.25;

  const ampX = baseAmpX + maxExtraX * vol;
  const ampY = baseAmpY + maxExtraY * pit;

  const noiseFreq = 0.009;
  const waveFreq  = 0.006;

  stroke(255);
  strokeWeight(1.4);
  noFill();

  for (const poly of polys) {
    beginShape();
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const nx = p.x * noiseFreq;
      const ny = p.y * noiseFreq;

      const n = noise(nx, ny, t * 0.5);
      const noiseVal = (n - 0.5) * 2;

      const wave = sin(p.x * waveFreq + t * 2.0);

      const dx = noiseVal * ampX;
      const dy = (noiseVal * 0.4 + wave * 0.6) * ampY;

      curveVertex(p.x + dx + offset.x, p.y + dy + offset.y);
    }
    endShape();
  }

  stroke(255, 120);
  strokeWeight(0.7);
  for (const poly of polys) {
    beginShape();
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];

      const nx = p.x * (noiseFreq * 1.1);
      const ny = p.y * (noiseFreq * 1.1);

      const n2 = noise(nx, ny, t * 0.5 + 100.0);
      const noiseVal2 = (n2 - 0.5) * 2;

      const wave2 = sin(p.x * waveFreq * 1.1 + t * 2.3);

      const dx2 = noiseVal2 * ampX * 0.5;
      const dy2 = (noiseVal2 * 0.3 + wave2 * 0.7) * ampY * 0.6;

      curveVertex(p.x + dx2 + offset.x, p.y + dy2 + offset.y);
    }
    endShape();
  }
}

/* 小工具：平滑 step（0~1 之间柔和过渡） */
function smoothstep(edge0, edge1, x) {
  const t = constrain((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

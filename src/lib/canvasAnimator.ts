import type {
  CameraMotionType,
  MotionGraphicPreset,
  PresenterVisualMode,
  ProductionStyle,
  SceneVisualBeat,
  TwinLanguage,
  VideoFormatType,
} from '../types';

export interface CanvasAnimationParams {
  imageUrls: string[];
  visualBeats?: SceneVisualBeat[];
  presenterMode?: PresenterVisualMode;
  productionStyle?: ProductionStyle;
  format?: VideoFormatType;
  audioUrl?: string;
  title: string;
  scriptText: string;
  aspectRatio: '9:16' | '1:1' | '16:9';
  backgroundStyle: string;
  framing: 'Close-Up Studio' | 'Medium Editorial' | 'Presenter Bust';
  speakingSpeed: number;
  subtitlesEnabled: boolean;
  aiDisclosureWatermark: boolean;
  watermarkText: string;
  language: TwinLanguage;
  targetDurationSec?: number;
  previewCanvas?: HTMLCanvasElement | null;
  onProgress?: (pct: number, phaseLabel: string) => void;
}

type ResolvedStyle = Exclude<ProductionStyle, 'auto_genre'>;

function resolveClientProductionStyle(params: CanvasAnimationParams): ResolvedStyle {
  if (
    params.productionStyle === 'comedy_skit' ||
    params.productionStyle === 'visual_explainer' ||
    params.productionStyle === 'story_cinema' ||
    params.productionStyle === 'creator_reel'
  ) {
    return params.productionStyle;
  }
  const text = `${params.title} ${params.scriptText}`.toLowerCase();
  if (
    params.format === 'Original Reaction' ||
    params.backgroundStyle === 'Warm Comedy Stage' ||
    /\b(comedy|funny|laugh|skit|meme|joke|boss|manager|sync|coffee|monday|traffic|relatable)\b|हंसी|कॉमेडी|बॉस|ऑफिस|मज़ाक/.test(
      text
    )
  ) {
    return 'comedy_skit';
  }
  if (
    params.format === 'Educational' ||
    params.backgroundStyle === 'Cosmic & Science Lab' ||
    /\b(space|science|physics|brain|neuron|quantum|psychology|trick|myth|reality|secret|finance|money|invest|study|research)\b|विज्ञान|दिमाग|पैसा|रिसर्च/.test(
      text
    )
  ) {
    return 'visual_explainer';
  }
  if (params.format === 'Storytelling') return 'story_cinema';
  return 'creator_reel';
}

function getDimensions(aspect: '9:16' | '1:1' | '16:9'): { w: number; h: number } {
  if (aspect === '1:1') return { w: 720, h: 720 };
  if (aspect === '16:9') return { w: 1280, h: 720 };
  return { w: 720, h: 1280 };
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function wrapWords(text: string, maxChars: number): Array<{ words: string[]; start: number; end: number }> {
  const allWords = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (allWords.length === 0) return [];
  const chunks: string[][] = [];
  let current: string[] = [];
  for (const w of allWords) {
    current.push(w);
    if (current.join(' ').length >= maxChars * 1.75) {
      chunks.push(current);
      current = [];
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks.map((words, idx) => ({
    words,
    start: idx / chunks.length,
    end: (idx + 1) / chunks.length,
  }));
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function drawCoverBox(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  zoom: number,
  panX: number,
  panY: number,
  rotRad: number,
  alpha = 1,
  cornerRadius = 0
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (cornerRadius > 0) {
    drawRoundedRectPath(ctx, boxX, boxY, boxW, boxH, cornerRadius);
    ctx.clip();
  } else {
    ctx.beginPath();
    ctx.rect(boxX, boxY, boxW, boxH);
    ctx.clip();
  }
  const cx = boxX + boxW / 2;
  const cy = boxY + boxH / 2;
  ctx.translate(cx + panX, cy + panY);
  ctx.rotate(rotRad);
  const imgRatio = img.width / Math.max(1, img.height);
  const boxRatio = boxW / Math.max(1, boxH);
  let drawW = boxW * zoom;
  let drawH = boxH * zoom;
  if (imgRatio > boxRatio) {
    drawH = boxH * zoom;
    drawW = drawH * imgRatio;
  } else {
    drawW = boxW * zoom;
    drawH = drawW / imgRatio;
  }
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

function drawThematicAtmosphere(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  mood: SceneVisualBeat['themeMood'],
  bgStyle: string,
  speechEnergy: number,
  style: ResolvedStyle
) {
  const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
  if (bgStyle === 'Studio Ivory Linen') {
    g.addColorStop(0, '#EFE8D8');
    g.addColorStop(1, '#DCD2BD');
  } else if (bgStyle === 'Architectural Daylight') {
    g.addColorStop(0, '#E8E3D9');
    g.addColorStop(1, '#C9C0AE');
  } else if (style === 'comedy_skit' || mood === 'comedy_office' || bgStyle === 'Warm Comedy Stage') {
    g.addColorStop(0, '#2F1C10');
    g.addColorStop(0.6, '#3D2212');
    g.addColorStop(1, '#1E140E');
  } else if (mood === 'cosmic_space' || bgStyle === 'Cosmic & Science Lab') {
    g.addColorStop(0, '#0B1021');
    g.addColorStop(0.55, '#131D38');
    g.addColorStop(1, '#1C1829');
  } else if (mood === 'science_tech' || style === 'visual_explainer') {
    g.addColorStop(0, '#0E1E24');
    g.addColorStop(1, '#182C33');
  } else if (mood === 'finance_business') {
    g.addColorStop(0, '#111E17');
    g.addColorStop(1, '#1D2D22');
  } else if (mood === 'mind_psychology') {
    g.addColorStop(0, '#1D1526');
    g.addColorStop(1, '#2B2030');
  } else if (mood === 'nature_earth') {
    g.addColorStop(0, '#132219');
    g.addColorStop(1, '#203123');
  } else {
    g.addColorStop(0, '#1A1917');
    g.addColorStop(1, '#292622');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Visual Explainer blueprint reticle grid
  if (style === 'visual_explainer') {
    ctx.save();
    ctx.strokeStyle = 'rgba(124, 198, 196, 0.08)';
    ctx.lineWidth = 1;
    const step = 48;
    const offset = (t * 8) % step;
    for (let x = offset; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = offset; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Subtle ambient motion orbs / bokeh particles matched to mood
  ctx.save();
  const isLight = bgStyle === 'Studio Ivory Linen' || bgStyle === 'Architectural Daylight';
  for (let i = 0; i < 10; i++) {
    const px = ((i * 197 + t * (12 + (i % 4) * 5)) % (w + 120)) - 60;
    const py = (i * 131 + Math.sin(t * 0.7 + i) * 35) % (h * 0.78);
    const rad = mood === 'cosmic_space' ? 2 + (i % 4) : 18 + (i % 4) * 14 + speechEnergy * 10;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fillStyle = isLight
      ? `rgba(182, 154, 101, ${0.06 + (i % 3) * 0.02})`
      : style === 'comedy_skit'
        ? `rgba(224, 159, 90, ${0.09 + (i % 3) * 0.03})`
        : mood === 'science_tech'
          ? `rgba(124, 198, 196, ${0.07 + (i % 3) * 0.03})`
          : `rgba(216, 179, 106, ${0.08 + (i % 3) * 0.03})`;
    ctx.fill();
  }
  ctx.restore();
}

function resolveBeatCameraMotion(
  cameraMotion: CameraMotionType | undefined,
  localProgress: number,
  t: number,
  sceneIdx: number,
  baseZoom = 1.05
): { zoom: number; panX: number; panY: number; rot: number } {
  switch (cameraMotion) {
    case 'punch_zoom': {
      const kick = localProgress < 0.18 ? 0.16 * Math.sin((localProgress / 0.18) * Math.PI * 0.6) : 0.06;
      return {
        zoom: baseZoom + 0.06 + kick + localProgress * 0.08,
        panX: Math.sin(t * 2.1) * 5,
        panY: Math.cos(t * 1.9) * 3,
        rot: (localProgress < 0.15 ? 0.015 : 0.004) * Math.sin(t * 5),
      };
    }
    case 'kinetic_pan': {
      const dir = sceneIdx % 2 === 0 ? 1 : -1;
      return {
        zoom: baseZoom + 0.12 + localProgress * 0.06,
        panX: dir * (-34 + localProgress * 68),
        panY: Math.sin(t * 1.4) * 4,
        rot: 0,
      };
    }
    case 'split_reveal': {
      const dir = sceneIdx % 2 === 0 ? -1 : 1;
      return {
        zoom: baseZoom + 0.1,
        panX: dir * (-24 + localProgress * 48),
        panY: -8 + localProgress * 16,
        rot: 0,
      };
    }
    case 'orbit_drift': {
      return {
        zoom: baseZoom + 0.11 + 0.03 * Math.sin(t * 1.1),
        panX: Math.cos(t * 0.95) * 20,
        panY: Math.sin(t * 0.95) * 14,
        rot: 0.012 * Math.sin(t * 0.7),
      };
    }
    case 'cinema_push':
    default:
      return {
        zoom: baseZoom + 0.03 + localProgress * 0.13,
        panX: (-10 + localProgress * 20) * (sceneIdx % 2 === 0 ? 1 : -1),
        panY: Math.sin(t * 0.8) * 3,
        rot: 0,
      };
  }
}

function drawBeatMotionGraphicLayer(
  ctx: CanvasRenderingContext2D,
  w: number,
  stageH: number,
  preset: MotionGraphicPreset | undefined,
  localProgress: number,
  t: number,
  speechEnergy: number,
  accentHex: string
) {
  if (!preset) return;
  ctx.save();

  if (preset === 'comic_reaction_burst') {
    const cx = w * 0.5;
    const cy = stageH * 0.44;
    const rays = 16;
    const innerR = Math.min(w, stageH) * 0.27;
    const outerR = Math.min(w, stageH) * (0.44 + speechEnergy * 0.08);
    ctx.strokeStyle = accentHex;
    ctx.globalAlpha = 0.24 + speechEnergy * 0.2;
    ctx.lineWidth = 2.5;
    for (let i = 0; i < rays; i++) {
      const ang = (i / rays) * Math.PI * 2 + t * 0.45;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * innerR, cy + Math.sin(ang) * innerR);
      ctx.lineTo(cx + Math.cos(ang) * outerR, cy + Math.sin(ang) * outerR);
      ctx.stroke();
    }
  } else if (preset === 'chat_thread_popup') {
    // Live typing indicator bar in upper right stage
    const bx = w - 156;
    const by = 68;
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = 'rgba(20, 19, 17, 0.76)';
    drawRoundedRectPath(ctx, bx, by, 130, 32, 16);
    ctx.fill();
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    for (let d = 0; d < 3; d++) {
      const bounce = Math.sin(t * 7 + d * 1.1) * 3.5;
      ctx.beginPath();
      ctx.arc(bx + 24 + d * 14, by + 16 + bounce, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = accentHex;
      ctx.fill();
    }
    ctx.font = '700 9.5px monospace';
    ctx.fillStyle = '#F6F3EC';
    ctx.fillText('TYPING...', bx + 68, by + 19);
  } else if (preset === 'orbital_physics_sim') {
    const cx = w * 0.78;
    const cy = stageH * 0.28;
    const rx = Math.min(w, stageH) * 0.16;
    const ry = rx * 0.42;
    ctx.translate(cx, cy);
    ctx.rotate(-0.35);
    ctx.strokeStyle = accentHex;
    ctx.globalAlpha = 0.42;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 0.62, ry * 0.62, 0.65, 0, Math.PI * 2);
    ctx.stroke();
    // Moving planet & core node
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = accentHex;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    const ox = Math.cos(t * 1.8) * rx;
    const oy = Math.sin(t * 1.8) * ry;
    ctx.fillStyle = '#F6F3EC';
    ctx.beginPath();
    ctx.arc(ox, oy, 4.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (preset === 'neural_network_pulse') {
    const nodes = [
      { x: w * 0.14, y: stageH * 0.22 },
      { x: w * 0.28, y: stageH * 0.15 },
      { x: w * 0.24, y: stageH * 0.31 },
      { x: w * 0.82, y: stageH * 0.2 },
      { x: w * 0.9, y: stageH * 0.31 },
    ];
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 1.3;
    nodes.forEach((a, i) => {
      nodes.slice(i + 1).forEach((b) => {
        if (Math.hypot(a.x - b.x, a.y - b.y) < w * 0.34) {
          ctx.globalAlpha = 0.25;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          const pulsePos = (t * 0.65 + i * 0.2) % 1;
          ctx.globalAlpha = 0.72;
          ctx.fillStyle = accentHex;
          ctx.beginPath();
          ctx.arc(a.x + (b.x - a.x) * pulsePos, a.y + (b.y - a.y) * pulsePos, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    });
    nodes.forEach((n, i) => {
      ctx.globalAlpha = 0.6 + 0.25 * Math.sin(t * 3 + i);
      ctx.fillStyle = '#F6F3EC';
      ctx.beginPath();
      ctx.arc(n.x, n.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (preset === 'compounding_curve_chart') {
    const gx = Math.round(w * 0.08);
    const gy = Math.round(stageH * 0.17);
    const gw = Math.round(w * 0.34);
    const gh = 78;
    ctx.fillStyle = 'rgba(15, 22, 18, 0.56)';
    drawRoundedRectPath(ctx, gx - 10, gy - 10, gw + 20, gh + 20, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gx, gy + gh);
    ctx.lineTo(gx + gw, gy + gh);
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx, gy + gh);
    ctx.stroke();

    const drawFrac = Math.min(1, 0.15 + localProgress * 0.95);
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    const steps = 20;
    let tipX = gx;
    let tipY = gy + gh;
    for (let s = 0; s <= steps; s++) {
      const f = (s / steps) * drawFrac;
      const px = gx + f * gw;
      const py = gy + gh - Math.pow(f, 2.1) * (gh - 8);
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
      tipX = px;
      tipY = py;
    }
    ctx.stroke();
    ctx.fillStyle = '#F6F3EC';
    ctx.beginPath();
    ctx.arc(tipX, tipY, 4 + speechEnergy * 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (preset === 'myth_reality_divider') {
    const sweep = Math.min(1, localProgress * 2.2);
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w * 0.52, 0);
    ctx.lineTo(w * 0.44, stageH * sweep);
    ctx.stroke();
  } else if (preset === 'cinema_spotlight_sweep') {
    const beamX = w * (0.2 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.7)));
    const beamGrad = ctx.createLinearGradient(beamX, 0, w * 0.5, stageH);
    beamGrad.addColorStop(0, 'rgba(216, 179, 106, 0.16)');
    beamGrad.addColorStop(1, 'rgba(216, 179, 106, 0)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(beamX - 45, 0);
    ctx.lineTo(beamX + 45, 0);
    ctx.lineTo(w * 0.85, stageH);
    ctx.lineTo(w * 0.15, stageH);
    ctx.closePath();
    ctx.fill();
  } else if (preset === 'kinetic_waveform_banner') {
    ctx.strokeStyle = accentHex;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 2;
    const baseY = stageH * 0.16;
    ctx.beginPath();
    for (let x = 24; x <= w - 24; x += 12) {
      const amp = (8 + speechEnergy * 18) * Math.sin(x * 0.03 + t * 5.2);
      const y = baseY + amp;
      if (x === 24) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.restore();
}

function drawRelatableOverlayCard(
  ctx: CanvasRenderingContext2D,
  w: number,
  stageH: number,
  beat: SceneVisualBeat | undefined,
  localProgress: number,
  style: ResolvedStyle,
  accentHex: string,
  t: number
) {
  if (!beat) return;
  const callout = (beat.calloutText || beat.headline || '').trim();
  if (!callout) return;

  const cardType =
    beat.visualCardType ||
    (style === 'comedy_skit'
      ? 'comic_bubble'
      : style === 'visual_explainer'
        ? 'stat_callout'
        : 'kinetic_quote');
  const subBadge = (beat.subBadge || beat.headline || 'KEY MOMENT').toUpperCase();

  // Snappy spring-in scale during first 15% of each beat
  const entry = Math.min(1, localProgress / 0.14);
  const springScale =
    entry < 1 ? 0.78 + 0.28 * Math.sin(entry * Math.PI * 0.65) : 1;

  ctx.save();
  const maxCardW = Math.min(w - 48, Math.round(w * 0.86));
  const titleFontSize = Math.max(17, Math.round(w * 0.03));
  ctx.font = `800 ${titleFontSize}px sans-serif`;
  const textW = ctx.measureText(callout).width;
  const cardW = Math.min(maxCardW, Math.max(240, Math.round(textW + 52)));
  const cardH = cardType === 'comparison_split' ? 76 : 68;

  const isTopPlacement = style === 'comedy_skit';
  const anchorX = Math.round(w / 2);
  const anchorY = isTopPlacement ? 96 : Math.max(105, stageH - 72);

  ctx.translate(anchorX, anchorY);
  ctx.scale(springScale, springScale);
  if (cardType === 'comic_bubble' || (style === 'comedy_skit' && beat.isPunchline)) {
    const wobble = beat.isPunchline ? Math.sin(t * 9) * 0.015 : -0.014;
    ctx.rotate(wobble);
  }

  const x0 = -cardW / 2;
  const y0 = -cardH / 2;

  if (cardType === 'reaction_chat' || cardType === 'comic_bubble') {
    // High-contrast relatable chat notification / comic bubble card
    ctx.fillStyle = cardType === 'comic_bubble' ? '#FBF7EE' : 'rgba(22, 20, 18, 0.92)';
    drawRoundedRectPath(ctx, x0, y0, cardW, cardH, 12);
    ctx.fill();
    ctx.lineWidth = beat.isPunchline ? 3 : 2;
    ctx.strokeStyle = beat.isPunchline ? '#E09F5A' : accentHex;
    ctx.stroke();

    // Small comic/chat bubble pointer tail at bottom left
    ctx.beginPath();
    ctx.moveTo(x0 + 26, y0 + cardH - 1);
    ctx.lineTo(x0 + 18, y0 + cardH + 11);
    ctx.lineTo(x0 + 42, y0 + cardH - 1);
    ctx.closePath();
    ctx.fill();

    // Live ping dot + subBadge
    ctx.fillStyle = beat.isPunchline ? '#C94A38' : '#E09F5A';
    ctx.beginPath();
    ctx.arc(x0 + 20, y0 + 18, 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '700 10.5px monospace';
    ctx.fillStyle = cardType === 'comic_bubble' ? '#7A5422' : '#D8B36A';
    ctx.fillText(subBadge.slice(0, 28), x0 + 32, y0 + 22);

    // Bold punchy callout text
    ctx.font = `800 ${titleFontSize}px sans-serif`;
    ctx.fillStyle = cardType === 'comic_bubble' ? '#1A1917' : '#F6F3EC';
    ctx.fillText(callout.slice(0, 38), x0 + 20, y0 + 49);
  } else if (cardType === 'stat_callout' || cardType === 'comparison_split') {
    // Explainer metric / myth-vs-reality overlay card with animated progress bar
    ctx.fillStyle = 'rgba(15, 25, 32, 0.90)';
    drawRoundedRectPath(ctx, x0, y0, cardW, cardH, 6);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = accentHex;
    ctx.stroke();

    // Left accent bar
    ctx.fillStyle = accentHex;
    ctx.fillRect(x0, y0 + 8, 5, cardH - 16);

    ctx.font = '700 10.5px monospace';
    ctx.fillStyle = '#7CC6C4';
    ctx.fillText(subBadge.slice(0, 30), x0 + 18, y0 + 21);

    ctx.font = `700 ${titleFontSize}px sans-serif`;
    ctx.fillStyle = '#F6F3EC';
    ctx.fillText(callout.slice(0, 38), x0 + 18, y0 + 46);

    // Animated explainer meter bar at bottom of card
    const meterFill = Math.min(1, localProgress * 2.8);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(x0 + 18, y0 + cardH - 10, cardW - 36, 4);
    ctx.fillStyle = accentHex;
    ctx.fillRect(x0 + 18, y0 + cardH - 10, Math.round((cardW - 36) * meterFill), 4);
  } else {
    // Kinetic editorial / story card
    ctx.fillStyle = 'rgba(20, 18, 16, 0.86)';
    drawRoundedRectPath(ctx, x0, y0, cardW, cardH, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(216, 179, 106, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = '600 10px monospace';
    ctx.fillStyle = accentHex;
    ctx.fillText(subBadge.slice(0, 30), x0 + 18, y0 + 21);

    ctx.font = `700 ${titleFontSize}px sans-serif`;
    ctx.fillStyle = '#F6F3EC';
    ctx.fillText(callout.slice(0, 38), x0 + 18, y0 + 49);
  }

  ctx.restore();
}

export async function renderCanvasMotionVideo(params: CanvasAnimationParams): Promise<{
  blob: Blob;
  durationSec: number;
  mimeType: string;
}> {
  const { w, h } = getDimensions(params.aspectRatio);
  const canvas = params.previewCanvas || document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('HTML5 2D Canvas context unavailable in this browser.');

  const resolvedStyle = resolveClientProductionStyle(params);
  const isFaceless = params.presenterMode === 'faceless_broll';
  const loadedPresenters = isFaceless
    ? []
    : (await Promise.all(params.imageUrls.map(loadImage))).filter(
        (img): img is HTMLImageElement => Boolean(img)
      );

  const beats = params.visualBeats || [];
  const loadedBeatImgs = await Promise.all(beats.map((b) => loadImage(b.imageUrl || '')));
  const anyValidBeatImg = loadedBeatImgs.find((x): x is HTMLImageElement => Boolean(x)) || null;

  if (loadedPresenters.length === 0 && !anyValidBeatImg && !isFaceless) {
    throw new Error('Could not load presenter or scene imagery for live motion rendering.');
  }

  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioCtx();
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 128;
  const freqData = new Uint8Array(analyser.frequencyBinCount);

  const dest = audioCtx.createMediaStreamDestination();
  let audioEl: HTMLAudioElement | null = null;
  let stopAmbient: (() => void) | null = null;

  const speed = Math.max(0.75, Math.min(1.35, params.speakingSpeed || 1));
  const wordCount = (params.scriptText || params.title).trim().split(/\s+/).filter(Boolean).length;
  const MIN_DURATION_SEC = 30;
  let targetDuration = Math.max(
    MIN_DURATION_SEC,
    Math.min(
      120,
      Math.round(Number(params.targetDurationSec) || Math.round(wordCount / 2.3 / speed) || MIN_DURATION_SEC)
    )
  );

  let hasActiveSpeechAudio = false;
  if (params.audioUrl) {
    audioEl = new Audio();
    audioEl.crossOrigin = 'anonymous';
    audioEl.src = params.audioUrl;
    audioEl.playbackRate = speed;
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      audioEl!.addEventListener('loadedmetadata', done, { once: true });
      audioEl!.addEventListener('error', done, { once: true });
      setTimeout(done, 2500);
    });
    if (Number.isFinite(audioEl.duration) && audioEl.duration > 0.5) {
      targetDuration = Math.max(
        MIN_DURATION_SEC,
        Math.min(120, Number(params.targetDurationSec) || audioEl.duration / speed)
      );
      hasActiveSpeechAudio = true;
    }
    const source = audioCtx.createMediaElementSource(audioEl);
    source.connect(analyser);
    analyser.connect(dest);
  }

  // Subtle ambient harmonic pad
  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const ambientGain = audioCtx.createGain();
  osc1.type = 'sine';
  osc2.type = 'triangle';
  osc1.frequency.value = resolvedStyle === 'comedy_skit' ? 220 : 196;
  osc2.frequency.value = resolvedStyle === 'comedy_skit' ? 329.63 : 293.66;
  ambientGain.gain.value = hasActiveSpeechAudio ? 0.003 : 0.032;
  osc1.connect(ambientGain);
  osc2.connect(ambientGain);
  ambientGain.connect(analyser);
  if (!hasActiveSpeechAudio) {
    analyser.connect(dest);
  }
  osc1.start();
  osc2.start();
  stopAmbient = () => {
    try {
      osc1.stop();
      osc2.stop();
    } catch {
      // ignore
    }
  };

  const videoStream = canvas.captureStream(24);
  const combinedStream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  const preferredMimes = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  const mimeType = preferredMimes.find((m) => MediaRecorder.isTypeSupported(m)) || '';
  const recorder = mimeType
    ? new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 1_350_000 })
    : new MediaRecorder(combinedStream);

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const segments = wrapWords(
    params.scriptText || params.title,
    params.aspectRatio === '16:9' ? 48 : 28
  );

  const isDarkBand =
    params.backgroundStyle === 'Warm Charcoal' ||
    params.backgroundStyle === 'Cosmic & Science Lab' ||
    params.backgroundStyle === 'Warm Comedy Stage' ||
    params.backgroundStyle === 'Auto-Match Script Theme';
  const cardBg = isDarkBand ? 'rgba(20, 19, 17, 0.90)' : 'rgba(246, 243, 236, 0.93)';
  const textInk = isDarkBand ? '#F6F3EC' : '#242421';
  const subtleInk = isDarkBand ? '#D8B36A' : '#77766F';
  const baseZoom =
    params.framing === 'Close-Up Studio' ? 1.12 : params.framing === 'Presenter Bust' ? 1.07 : 1.02;

  const recordingPromise = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
    };
    recorder.onerror = (ev: any) => {
      reject(new Error(ev?.error?.message || 'Canvas MediaRecorder failed.'));
    };
  });

  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  recorder.start(200);
  if (audioEl) {
    await audioEl.play().catch(() => {});
  }

  const startTime = performance.now();
  const totalMs = targetDuration * 1000;

  await new Promise<void>((resolveLoop) => {
    const drawFrame = () => {
      const elapsedMs = performance.now() - startTime;
      const t = elapsedMs / 1000;
      const progress = Math.min(1, elapsedMs / totalMs);

      analyser.getByteFrequencyData(freqData);
      let energySum = 0;
      for (let i = 0; i < 24; i++) energySum += freqData[i] || 0;
      const speechPlaying = Boolean(audioEl && !audioEl.ended && !audioEl.paused);
      const speechEnergy = speechPlaying
        ? Math.min(1, energySum / (24 * 165))
        : 0.22 + 0.22 * Math.abs(Math.sin(t * 4.2));

      const cutThresholds = [0, 0.17, 0.34, 0.52, 0.68, 0.84, 1.01];
      let sceneIdx = 5;
      for (let s = 0; s < 6; s++) {
        if (progress < cutThresholds[s + 1]) {
          sceneIdx = s;
          break;
        }
      }
      const span = cutThresholds[sceneIdx + 1] - cutThresholds[sceneIdx];
      const localProgress = Math.min(1, Math.max(0, (progress - cutThresholds[sceneIdx]) / span));

      const activeBeat = beats[sceneIdx];
      const activeMood = activeBeat?.themeMood || 'studio_editorial';
      const accentHex =
        resolvedStyle === 'comedy_skit'
          ? '#E09F5A'
          : resolvedStyle === 'visual_explainer'
            ? '#7CC6C4'
            : activeBeat?.accentHex || '#B69A65';
      const beatImg = loadedBeatImgs[sceneIdx] || anyValidBeatImg;
      const primaryPresenter = loadedPresenters[0] || null;
      const altPresenter = loadedPresenters[1 % Math.max(1, loadedPresenters.length)] || primaryPresenter;

      // 1. Dynamic thematic backdrop layer tuned to production style & script mood
      drawThematicAtmosphere(
        ctx,
        w,
        h,
        t,
        activeMood,
        params.backgroundStyle,
        speechEnergy,
        resolvedStyle
      );

      const barHeight = params.subtitlesEnabled ? Math.round(h * 0.22) : Math.round(h * 0.12);
      const stageH = h - barHeight;

      const isComedy = resolvedStyle === 'comedy_skit';
      const isExplainer = resolvedStyle === 'visual_explainer';
      const isCinema = resolvedStyle === 'story_cinema';
      const isPunchlineBeat = Boolean(activeBeat?.isPunchline);

      // Camera motion choreography driven by selected Prompt-Library cameraMotion + beat timing
      const beatCam = resolveBeatCameraMotion(
        activeBeat?.cameraMotion,
        localProgress,
        t,
        sceneIdx,
        baseZoom
      );

      // Dynamic kinetic camera impulse for Comedy vs calm flow for Cinema
      const comedyPunchKick =
        isComedy && localProgress < 0.16
          ? 0.14 * Math.sin((localProgress / 0.16) * Math.PI)
          : isComedy && isPunchlineBeat
            ? 0.08 + speechEnergy * 0.06
            : 0;
      const shakeX = isComedy && isPunchlineBeat && localProgress < 0.3 ? Math.sin(t * 36) * 5 : 0;
      const shakeY = isComedy && isPunchlineBeat && localProgress < 0.3 ? Math.cos(t * 42) * 3 : 0;

      const breathe = (isComedy ? 0.02 : 0.014) * Math.sin(t * (isComedy ? 2.8 : 1.9));
      const swayX = 8 * Math.sin(t * (isComedy ? 1.9 : 1.25)) + shakeX;
      const swayY = 5 * Math.cos(t * (isComedy ? 2.3 : 1.6)) - speechEnergy * 4 + shakeY;
      const tilt =
        (isComedy ? 0.022 : 0.01) * Math.sin(t * (isComedy ? 2.2 : 1.1)) +
        speechEnergy * (isComedy ? 0.014 : 0.006) * Math.sin(t * 7.5) +
        beatCam.rot;

      if (isFaceless || !primaryPresenter) {
        if (beatImg) {
          drawCoverBox(
            ctx,
            beatImg,
            0,
            0,
            w,
            stageH + 10,
            beatCam.zoom + comedyPunchKick,
            beatCam.panX + shakeX,
            beatCam.panY + swayY * 0.4,
            isComedy && isPunchlineBeat ? tilt * 0.6 : beatCam.rot,
            0.94
          );
        }
        const veil = ctx.createLinearGradient(0, 0, 0, stageH);
        veil.addColorStop(0, 'rgba(15, 14, 12, 0.52)');
        veil.addColorStop(0.5, 'rgba(15, 14, 12, 0.10)');
        veil.addColorStop(1, 'rgba(15, 14, 12, 0.60)');
        ctx.fillStyle = veil;
        ctx.fillRect(0, 0, w, stageH);
      } else if (isComedy) {
        // COMEDY SKIT ENGINE: Fast relatable reaction cuts, punch-zooms, expressive presenter reactions + relatable visual scenes
        if (sceneIdx % 2 === 1 && beatImg) {
          // Beat 2, 4, 6: Full-screen relatable comedic B-roll reaction + energetic presenter corner reaction PiP!
          drawCoverBox(
            ctx,
            beatImg,
            0,
            0,
            w,
            stageH + 10,
            1.08 + localProgress * 0.16 + comedyPunchKick,
            shakeX + (-20 + localProgress * 40),
            shakeY,
            isPunchlineBeat ? tilt * 0.5 : 0,
            1
          );
          const pipW = Math.round(Math.min(w, h) * 0.31);
          const pipH = Math.round(pipW * 1.18);
          const pipX = sceneIdx === 3 ? 22 : w - pipW - 22;
          const pipY = stageH - pipH - 22;
          ctx.fillStyle = 'rgba(26, 20, 15, 0.85)';
          drawRoundedRectPath(ctx, pipX - 5, pipY - 5, pipW + 10, pipH + 10, 12);
          ctx.fill();
          drawCoverBox(
            ctx,
            altPresenter || primaryPresenter,
            pipX,
            pipY,
            pipW,
            pipH,
            baseZoom + 0.08 + comedyPunchKick * 0.5,
            swayX * 0.5,
            swayY * 0.5,
            tilt * 1.2,
            1,
            10
          );
          ctx.strokeStyle = isPunchlineBeat ? '#E09F5A' : accentHex;
          ctx.lineWidth = 3.5;
          drawRoundedRectPath(ctx, pipX, pipY, pipW, pipH, 10);
          ctx.stroke();
        } else {
          // Beat 1, 3, 5: Relatable comedy scene top/backdrop + punchy presenter card
          if (beatImg) {
            drawCoverBox(ctx, beatImg, 0, 0, w, stageH + 10, 1.1 + localProgress * 0.1, shakeX, shakeY, 0, 0.58);
            ctx.fillStyle = 'rgba(26, 18, 12, 0.36)';
            ctx.fillRect(0, 0, w, stageH);
          }
          const cardW = params.aspectRatio === '16:9' ? Math.round(w * 0.44) : Math.round(w * 0.78);
          const cardH = Math.round(stageH * 0.72);
          const cardX = Math.round((w - cardW) / 2);
          const cardY = Math.round((stageH - cardH) / 2) + 28;
          drawCoverBox(
            ctx,
            primaryPresenter,
            cardX,
            cardY,
            cardW,
            cardH,
            baseZoom + breathe + comedyPunchKick,
            swayX * 0.7,
            swayY * 0.7,
            tilt * 0.9,
            1,
            12
          );
          ctx.strokeStyle = isPunchlineBeat || speechEnergy > 0.28 ? '#E09F5A' : accentHex;
          ctx.lineWidth = 3.5;
          drawRoundedRectPath(ctx, cardX, cardY, cardW, cardH, 12);
          ctx.stroke();
        }
      } else if (isExplainer) {
        // VISUAL EXPLAINER ENGINE: Diagram / B-roll priority (75% visual focus) + Presenter coach frame
        if (sceneIdx === 0) {
          if (beatImg) {
            drawCoverBox(ctx, beatImg, 0, 0, w, stageH + 10, 1.06 + localProgress * 0.08, 0, 0, 0, 0.6);
          }
          const insetW = params.aspectRatio === '16:9' ? Math.round(w * 0.4) : Math.round(w * 0.74);
          const insetH = Math.round(stageH * 0.72);
          const insetX = Math.round((w - insetW) / 2);
          const insetY = Math.round((stageH - insetH) / 2) - 8;
          drawCoverBox(
            ctx,
            primaryPresenter,
            insetX,
            insetY,
            insetW,
            insetH,
            baseZoom + breathe,
            swayX * 0.5,
            swayY * 0.5,
            tilt * 0.6,
            1,
            8
          );
          ctx.strokeStyle = '#7CC6C4';
          ctx.lineWidth = 2.5;
          drawRoundedRectPath(ctx, insetX, insetY, insetW, insetH, 8);
          ctx.stroke();
        } else {
          if (beatImg) {
            const pan = sceneIdx % 2 === 1 ? -28 + localProgress * 56 : 28 - localProgress * 56;
            drawCoverBox(ctx, beatImg, 0, 0, w, stageH + 10, 1.06 + localProgress * 0.1, pan, 0, 0, 1);
          } else {
            drawCoverBox(ctx, primaryPresenter, 0, 0, w, stageH + 10, baseZoom + breathe, swayX, swayY, tilt, 1);
          }
          const pipW = Math.round(Math.min(w, h) * 0.25);
          const pipH = Math.round(pipW * 1.2);
          const pipX = sceneIdx % 2 === 1 ? w - pipW - 24 : 24;
          const pipY = 70;
          ctx.fillStyle = 'rgba(14, 24, 29, 0.84)';
          drawRoundedRectPath(ctx, pipX - 4, pipY - 4, pipW + 8, pipH + 8, 8);
          ctx.fill();
          drawCoverBox(
            ctx,
            altPresenter || primaryPresenter,
            pipX,
            pipY,
            pipW,
            pipH,
            baseZoom + 0.04 + breathe,
            swayX * 0.4,
            swayY * 0.4,
            tilt * 0.4,
            1,
            6
          );
          ctx.strokeStyle = '#7CC6C4';
          ctx.lineWidth = 2;
          drawRoundedRectPath(ctx, pipX, pipY, pipW, pipH, 6);
          ctx.stroke();
        }
      } else {
        // CREATOR REEL & STORY CINEMA ENGINE: Dynamic alternating Hook -> B-Roll PiP -> Split Screen -> Expressive Reaction
        if (sceneIdx === 0 || sceneIdx === 5) {
          if (beatImg) {
            drawCoverBox(ctx, beatImg, 0, 0, w, stageH + 10, 1.08 + localProgress * 0.08, 0, 0, 0, 0.48);
            ctx.fillStyle = 'rgba(18, 17, 15, 0.42)';
            ctx.fillRect(0, 0, w, stageH);
          }
          const insetW = params.aspectRatio === '16:9' ? Math.round(w * 0.42) : Math.round(w * 0.78);
          const insetH = Math.round(stageH * 0.76);
          const insetX = Math.round((w - insetW) / 2);
          const insetY = Math.round((stageH - insetH) / 2);
          drawCoverBox(
            ctx,
            primaryPresenter,
            insetX,
            insetY,
            insetW,
            insetH,
            baseZoom + localProgress * 0.08 + breathe,
            swayX * 0.6,
            swayY * 0.6,
            tilt * 0.7,
            1,
            8
          );
          ctx.strokeStyle = accentHex;
          ctx.lineWidth = 2;
          drawRoundedRectPath(ctx, insetX, insetY, insetW, insetH, 8);
          ctx.stroke();
        } else if (sceneIdx === 1 || sceneIdx === 3) {
          if (beatImg) {
            const pan = sceneIdx === 1 ? -32 + localProgress * 64 : 32 - localProgress * 64;
            drawCoverBox(ctx, beatImg, 0, 0, w, stageH + 10, 1.08 + localProgress * 0.1, pan, 0, 0, 1);
          } else {
            drawCoverBox(ctx, primaryPresenter, 0, 0, w, stageH + 10, baseZoom + breathe, swayX, swayY, tilt, 1);
          }
          const pipW = Math.round(Math.min(w, h) * 0.28);
          const pipH = Math.round(pipW * 1.25);
          const pipX = sceneIdx === 1 ? w - pipW - 26 : 26;
          const pipY = stageH - pipH - 28;
          ctx.fillStyle = 'rgba(20, 19, 17, 0.75)';
          drawRoundedRectPath(ctx, pipX - 4, pipY - 4, pipW + 8, pipH + 8, 8);
          ctx.fill();
          drawCoverBox(
            ctx,
            altPresenter || primaryPresenter,
            pipX,
            pipY,
            pipW,
            pipH,
            baseZoom + 0.04 + breathe,
            swayX * 0.4,
            swayY * 0.4,
            tilt * 0.5,
            1,
            6
          );
          ctx.strokeStyle = speechEnergy > 0.28 ? accentHex : 'rgba(246, 243, 236, 0.5)';
          ctx.lineWidth = 2.5;
          drawRoundedRectPath(ctx, pipX, pipY, pipW, pipH, 6);
          ctx.stroke();
        } else if (sceneIdx === 2) {
          if (params.aspectRatio === '16:9') {
            const halfW = Math.round(w / 2);
            if (beatImg) {
              drawCoverBox(ctx, beatImg, 0, 0, halfW - 3, stageH, 1.06 + localProgress * 0.12, 0, 0, 0, 1);
            }
            drawCoverBox(
              ctx,
              primaryPresenter,
              halfW + 3,
              0,
              halfW - 3,
              stageH,
              baseZoom + breathe,
              swayX * 0.5,
              swayY * 0.5,
              tilt * 0.6,
              1
            );
            ctx.fillStyle = accentHex;
            ctx.fillRect(halfW - 2, 0, 4, stageH);
          } else {
            const topH = Math.round(stageH * 0.48);
            if (beatImg) {
              drawCoverBox(ctx, beatImg, 0, 0, w, topH - 2, 1.06 + localProgress * 0.12, -20 + localProgress * 40, 0, 0, 1);
            }
            drawCoverBox(
              ctx,
              primaryPresenter,
              0,
              topH + 2,
              w,
              stageH - topH,
              baseZoom + breathe,
              swayX * 0.5,
              swayY * 0.5,
              tilt * 0.6,
              1
            );
            ctx.fillStyle = accentHex;
            ctx.fillRect(0, topH - 2, w, 4);
          }
        } else {
          if (beatImg) {
            drawCoverBox(
              ctx,
              beatImg,
              0,
              0,
              w,
              stageH + 10,
              1.14 - localProgress * 0.08,
              0,
              -12 + localProgress * 24,
              0,
              1
            );
            drawCoverBox(
              ctx,
              altPresenter || primaryPresenter,
              0,
              0,
              w,
              stageH + 10,
              baseZoom + breathe,
              swayX,
              swayY,
              tilt,
              Math.min(0.68, 0.25 + speechEnergy * 0.55)
            );
          } else {
            drawCoverBox(ctx, primaryPresenter, 0, 0, w, stageH + 10, baseZoom + breathe, swayX, swayY, tilt, 1);
          }
        }
      }

      // Snappy scene transition flash in Comedy Skit mode on each new beat
      if (isComedy && sceneIdx > 0 && localProgress < 0.045) {
        const flashAlpha = (1 - localProgress / 0.045) * 0.38;
        ctx.fillStyle = `rgba(255, 244, 224, ${flashAlpha.toFixed(3)})`;
        ctx.fillRect(0, 0, w, stageH);
      }

      // Cinema letterbox bars for Story Cinema mode
      if (isCinema) {
        ctx.fillStyle = '#0F0E0C';
        ctx.fillRect(0, 0, w, 16);
        ctx.fillRect(0, stageH - 16, w, 16);
      }

      // Subtle eye-blink micro-cadence + vignette
      const blinkPhase = t % 3.4;
      if (!isFaceless && blinkPhase > 3.24) {
        ctx.fillStyle = 'rgba(26, 25, 23, 0.08)';
        ctx.fillRect(0, 0, w, stageH);
      }

      const grad = ctx.createRadialGradient(w / 2, h * 0.4, w * 0.25, w / 2, h / 2, Math.max(w, h) * 0.78);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(15,14,12,0.34)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, stageH);

      // Procedural Motion-Graphic Engine layer keyed from Prompt-Library preset
      drawBeatMotionGraphicLayer(
        ctx,
        w,
        stageH,
        activeBeat?.motionGraphicPreset,
        localProgress,
        t,
        speechEnergy,
        accentHex
      );

      // Relatable Animated Motion-Graphic Card illustrating the current beat
      drawRelatableOverlayCard(ctx, w, stageH, activeBeat, localProgress, resolvedStyle, accentHex, t);

      // Top Watermark & Dynamic Beat Headline Badge matched to active script segment
      if (params.aiDisclosureWatermark) {
        ctx.fillStyle = 'rgba(26, 25, 23, 0.76)';
        ctx.fillRect(24, 24, Math.min(w - 220, 310), 28);
        ctx.fillStyle = '#F6F3EC';
        ctx.font = '600 11px monospace';
        ctx.fillText((params.watermarkText || 'AI DIGITAL TWIN · AUTHORIZED').slice(0, 34), 34, 42);
      }

      const beatHeadline = (
        activeBeat?.headline ||
        (progress < 0.3 ? '01 OPENING HOOK' : progress < 0.72 ? '02 KEY INSIGHT' : '03 TAKEAWAY')
      ).slice(0, 26);
      ctx.font = '700 12px monospace';
      const badgeW = Math.min(w - 60, Math.max(132, Math.round(ctx.measureText(beatHeadline).width + 28)));
      ctx.fillStyle = accentHex;
      ctx.fillRect(w - badgeW - 24, 24, badgeW, 28);
      ctx.fillStyle = '#1A1917';
      ctx.fillText(beatHeadline.toUpperCase(), w - badgeW - 10, 42);

      // Lower Editorial Studio Band
      const bandTop = h - barHeight;
      ctx.fillStyle = cardBg;
      ctx.fillRect(0, bandTop, w, barHeight);

      // Progress bar strip
      ctx.fillStyle = 'rgba(182, 154, 101, 0.25)';
      ctx.fillRect(0, bandTop, w, 3);
      ctx.fillStyle = accentHex;
      ctx.fillRect(0, bandTop, Math.round(w * progress), 3);

      // Live 24-bar Audio Equalizer Visualizer
      const eqCount = 24;
      const eqWidth = Math.min(200, Math.round(w * 0.26));
      const eqX0 = w - eqWidth - 28;
      const barW = Math.max(3, Math.floor(eqWidth / eqCount) - 3);
      for (let b = 0; b < eqCount; b++) {
        const rawVal = audioEl
          ? (freqData[b * 2] || 0) / 255
          : Math.abs(Math.sin(t * 5.5 + b * 0.45)) * 0.65 + 0.15;
        const barH = Math.max(4, Math.round(rawVal * 30));
        ctx.fillStyle = b % 3 === 0 ? accentHex : subtleInk;
        ctx.fillRect(eqX0 + b * (barW + 3), bandTop + 34 - barH, barW, barH);
      }

      // Production Title Header
      ctx.fillStyle = subtleInk;
      ctx.font = '600 13px monospace';
      ctx.fillText(params.title.slice(0, 38).toUpperCase(), 30, bandTop + 26);

      // Kinetic Subtitles with Live Word Highlighting
      if (params.subtitlesEnabled && segments.length > 0) {
        const activeSeg =
          segments.find((s) => progress >= s.start && progress <= s.end) || segments[segments.length - 1];
        const segSpan = Math.max(0.01, activeSeg.end - activeSeg.start);
        const segLocal = Math.min(1, Math.max(0, (progress - activeSeg.start) / segSpan));
        const activeWordIdx = Math.floor(segLocal * activeSeg.words.length);

        const fontSize = Math.max(20, Math.round(w * 0.032));
        ctx.font = `600 ${fontSize}px sans-serif`;

        let cursorX = 30;
        let cursorY = bandTop + 64;
        const maxRight = w - 34;

        activeSeg.words.forEach((word, wi) => {
          const measured = ctx.measureText(`${word} `).width;
          if (cursorX + measured > maxRight) {
            cursorX = 30;
            cursorY += Math.round(fontSize * 1.32);
          }
          const isCurrent = wi === activeWordIdx;
          ctx.fillStyle = isCurrent ? accentHex : textInk;
          ctx.fillText(word, cursorX, cursorY);
          cursorX += measured;
        });
      }

      params.onProgress?.(Math.round(progress * 100), beatHeadline);

      if (elapsedMs < totalMs) {
        requestAnimationFrame(drawFrame);
      } else {
        resolveLoop();
      }
    };

    requestAnimationFrame(drawFrame);
  });

  if (audioEl) {
    audioEl.pause();
  }
  stopAmbient?.();
  recorder.stop();
  const blob = await recordingPromise;
  combinedStream.getTracks().forEach((tr) => tr.stop());
  await audioCtx.close().catch(() => {});

  return {
    blob,
    durationSec: Number(targetDuration.toFixed(2)),
    mimeType: blob.type || 'video/webm',
  };
}

import type { PresenterVisualMode, SceneVisualBeat, TwinLanguage } from '../types';

export interface CanvasAnimationParams {
  imageUrls: string[];
  visualBeats?: SceneVisualBeat[];
  presenterMode?: PresenterVisualMode;
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
  speechEnergy: number
) {
  const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
  if (bgStyle === 'Studio Ivory Linen') {
    g.addColorStop(0, '#EFE8D8');
    g.addColorStop(1, '#DCD2BD');
  } else if (bgStyle === 'Architectural Daylight') {
    g.addColorStop(0, '#E8E3D9');
    g.addColorStop(1, '#C9C0AE');
  } else if (mood === 'cosmic_space' || bgStyle === 'Cosmic & Science Lab') {
    g.addColorStop(0, '#0B1021');
    g.addColorStop(0.55, '#131D38');
    g.addColorStop(1, '#1C1829');
  } else if (mood === 'science_tech') {
    g.addColorStop(0, '#0F1E24');
    g.addColorStop(1, '#1A2D33');
  } else if (mood === 'comedy_office' || bgStyle === 'Warm Comedy Stage') {
    g.addColorStop(0, '#2B1B12');
    g.addColorStop(1, '#3D2518');
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

  // Subtle ambient motion orbs / particles matched to mood
  ctx.save();
  const isLight = bgStyle === 'Studio Ivory Linen' || bgStyle === 'Architectural Daylight';
  for (let i = 0; i < 10; i++) {
    const px = ((i * 197 + t * (12 + (i % 4) * 5)) % (w + 120)) - 60;
    const py = ((i * 131 + Math.sin(t * 0.7 + i) * 35) % (h * 0.78));
    const rad = mood === 'cosmic_space' ? 2 + (i % 4) : 18 + (i % 4) * 14 + speechEnergy * 10;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fillStyle = isLight
      ? `rgba(182, 154, 101, ${0.06 + (i % 3) * 0.02})`
      : mood === 'science_tech'
        ? `rgba(124, 198, 196, ${0.07 + (i % 3) * 0.03})`
        : `rgba(216, 179, 106, ${0.08 + (i % 3) * 0.03})`;
    ctx.fill();
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
  osc1.frequency.value = 196;
  osc2.frequency.value = 293.66;
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

      // 6 chronological beats aligned with script progression
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
      const accentHex = activeBeat?.accentHex || '#B69A65';
      const beatImg = loadedBeatImgs[sceneIdx] || anyValidBeatImg;
      const primaryPresenter = loadedPresenters[0] || null;
      const altPresenter = loadedPresenters[1 % Math.max(1, loadedPresenters.length)] || primaryPresenter;

      // 1. Dynamic thematic backdrop layer (always matches script mood & background style)
      drawThematicAtmosphere(ctx, w, h, t, activeMood, params.backgroundStyle, speechEnergy);

      const barHeight = params.subtitlesEnabled ? Math.round(h * 0.22) : Math.round(h * 0.12);
      const stageH = h - barHeight;

      const breathe = 0.015 * Math.sin(t * 1.9);
      const swayX = 8 * Math.sin(t * 1.25);
      const swayY = 5 * Math.cos(t * 1.6) - speechEnergy * 4;
      const tilt = 0.01 * Math.sin(t * 1.1) + speechEnergy * 0.006 * Math.sin(t * 6.5);

      if (isFaceless || !primaryPresenter) {
        // Faceless Documentary Mode: 100% full-stage script-matched B-roll photography & animated mood visuals
        if (beatImg) {
          const panDir = sceneIdx % 2 === 0 ? 1 : -1;
          const bgZoom = 1.05 + localProgress * 0.14;
          drawCoverBox(
            ctx,
            beatImg,
            0,
            0,
            w,
            stageH + 10,
            bgZoom,
            panDir * (-24 + localProgress * 48),
            swayY * 0.4,
            0,
            0.94
          );
        }
        // Subtle thematic gradient veil so topic headline & captions stay crisp
        const veil = ctx.createLinearGradient(0, 0, 0, stageH);
        veil.addColorStop(0, 'rgba(15, 14, 12, 0.52)');
        veil.addColorStop(0.5, 'rgba(15, 14, 12, 0.12)');
        veil.addColorStop(1, 'rgba(15, 14, 12, 0.58)');
        ctx.fillStyle = veil;
        ctx.fillRect(0, 0, w, stageH);
      } else {
        // Multi-scene Presenter + Script B-Roll Choreography (distinct every beat!)
        if (sceneIdx === 0 || sceneIdx === 5) {
          // Hook & Payoff: Script B-Roll backdrop behind crisp Editorial Presenter Frame
          if (beatImg) {
            drawCoverBox(ctx, beatImg, 0, 0, w, stageH + 10, 1.08 + localProgress * 0.08, 0, 0, 0, 0.48);
            ctx.fillStyle = 'rgba(18, 17, 15, 0.45)';
            ctx.fillRect(0, 0, w, stageH);
          }
          const insetW = params.aspectRatio === '16:9' ? Math.round(w * 0.42) : Math.round(w * 0.78);
          const insetH = Math.round(stageH * 0.8);
          const insetX = Math.round((w - insetW) / 2);
          const insetY = Math.round((stageH - insetH) / 2) + 14;
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
          // Full-bleed Topic B-Roll + Animated Presenter Picture-in-Picture
          if (beatImg) {
            const pan = sceneIdx === 1 ? -32 + localProgress * 64 : 32 - localProgress * 64;
            drawCoverBox(ctx, beatImg, 0, 0, w, stageH + 10, 1.08 + localProgress * 0.1, pan, 0, 0, 1);
          } else {
            drawCoverBox(ctx, primaryPresenter, 0, 0, w, stageH + 10, baseZoom + breathe, swayX, swayY, tilt, 1);
          }
          // Presenter PiP window (alternate side per scene)
          const pipW = Math.round(Math.min(w, h) * 0.28);
          const pipH = Math.round(pipW * 1.25);
          const pipX = sceneIdx === 1 ? w - pipW - 26 : 26;
          const pipY = stageH - pipH - 22;
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
          // Editorial Split Screen: Topic B-Roll + Presenter
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
          // Scene 4: Topic B-Roll with expressive presenter crossfade reaction
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

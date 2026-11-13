import type { TwinLanguage } from '../types';

export interface CanvasAnimationParams {
  imageUrls: string[];
  audioUrl?: string;
  title: string;
  scriptText: string;
  aspectRatio: '9:16' | '1:1' | '16:9';
  backgroundStyle: 'Studio Ivory Linen' | 'Warm Charcoal' | 'Architectural Daylight';
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

  const loadedImages = (await Promise.all(params.imageUrls.map(loadImage))).filter(
    (img): img is HTMLImageElement => Boolean(img)
  );
  if (loadedImages.length === 0) {
    throw new Error('Could not load portrait reference images for live motion rendering.');
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
    Math.min(120, Math.round(Number(params.targetDurationSec) || Math.round((wordCount / 2.3) / speed) || MIN_DURATION_SEC))
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
        Math.min(120, Number(params.targetDurationSec) || (audioEl.duration / speed))
      );
      hasActiveSpeechAudio = true;
    }
    const source = audioCtx.createMediaElementSource(audioEl);
    source.connect(analyser);
    analyser.connect(dest);
  }

  // Soft harmonic studio pad (stays very subtle under speech or sustains waveform/stream after speech ends)
  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const ambientGain = audioCtx.createGain();
  osc1.type = 'sine';
  osc2.type = 'triangle';
  osc1.frequency.value = 196;
  osc2.frequency.value = 293.66;
  ambientGain.gain.value = hasActiveSpeechAudio ? 0.004 : 0.035;
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

  const videoStream = canvas.captureStream(30);
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
    ? new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 3_200_000 })
    : new MediaRecorder(combinedStream);

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const segments = wrapWords(
    params.scriptText || params.title,
    params.aspectRatio === '16:9' ? 48 : 28
  );

  const isDark = params.backgroundStyle === 'Warm Charcoal';
  const cardBg = isDark ? 'rgba(26, 25, 23, 0.90)' : 'rgba(246, 243, 236, 0.92)';
  const textInk = isDark ? '#F6F3EC' : '#242421';
  const subtleInk = isDark ? '#B69A65' : '#77766F';
  const baseZoom =
    params.framing === 'Close-Up Studio' ? 1.16 : params.framing === 'Presenter Bust' ? 1.09 : 1.03;

  const drawCoverImage = (
    img: HTMLImageElement,
    zoom: number,
    panX: number,
    panY: number,
    rotRad: number,
    alpha = 1
  ) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(w / 2 + panX, h / 2 + panY);
    ctx.rotate(rotRad);
    const imgRatio = img.width / img.height;
    const canvasRatio = w / h;
    let drawW = w * zoom;
    let drawH = h * zoom;
    if (imgRatio > canvasRatio) {
      drawH = h * zoom;
      drawW = drawH * imgRatio;
    } else {
      drawW = w * zoom;
      drawH = drawW / imgRatio;
    }
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  };

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

      // Clear background
      ctx.fillStyle = isDark ? '#1A1917' : '#EFE8D8';
      ctx.fillRect(0, 0, w, h);

      // 6 cinematic camera beats across >= 30s timeline
      const cutThresholds = [0, 0.17, 0.34, 0.52, 0.68, 0.84, 1.01];
      let sceneIdx = 5;
      for (let s = 0; s < 6; s++) {
        if (progress < cutThresholds[s + 1]) {
          sceneIdx = s;
          break;
        }
      }
      const span = cutThresholds[sceneIdx + 1] - cutThresholds[sceneIdx];
      const localSceneProgress = Math.min(1, Math.max(0, (progress - cutThresholds[sceneIdx]) / span));

      const primaryImg = loadedImages[0];
      const talkingImg = loadedImages[1 % loadedImages.length];
      const wideImg = loadedImages[2 % loadedImages.length];

      // Natural head sway + subtle breathing + speech emphasis
      const breathe = 0.018 * Math.sin(t * 1.9);
      const swayX = 11 * Math.sin(t * 1.25);
      const swayY = 6 * Math.cos(t * 1.7) - speechEnergy * 5;
      const headTilt = 0.014 * Math.sin(t * 1.1) + speechEnergy * 0.008 * Math.sin(t * 7);

      if (sceneIdx === 0) {
        const z = baseZoom + localSceneProgress * 0.14 + breathe;
        drawCoverImage(primaryImg, z, swayX, swayY, headTilt, 1);
        if (talkingImg !== primaryImg && speechEnergy > 0.25) {
          drawCoverImage(talkingImg, z, swayX, swayY, headTilt, Math.min(0.85, speechEnergy * 1.1));
        }
      } else if (sceneIdx === 1) {
        const pan = -30 + localSceneProgress * 60;
        drawCoverImage(talkingImg, baseZoom + 0.12 + breathe, pan + swayX * 0.5, swayY, headTilt * 0.9, 1);
      } else if (sceneIdx === 2) {
        const z = baseZoom + 0.18 - localSceneProgress * 0.14;
        drawCoverImage(wideImg, z, -swayX, swayY * 0.8, -headTilt * 0.6, 1);
        if (loadedImages.length > 1) {
          drawCoverImage(
            talkingImg,
            z + 0.03,
            swayX,
            swayY,
            headTilt,
            0.2 + 0.35 * Math.sin(localSceneProgress * Math.PI)
          );
        }
      } else if (sceneIdx === 3) {
        const pan = 28 - localSceneProgress * 56;
        drawCoverImage(primaryImg, baseZoom + 0.14 + breathe, pan + swayX * 0.4, swayY, -headTilt * 0.8, 1);
      } else if (sceneIdx === 4) {
        const z = baseZoom + 0.04 + localSceneProgress * 0.13 + breathe;
        drawCoverImage(talkingImg, z, swayX * 0.8, swayY, headTilt, 1);
        if (primaryImg !== talkingImg && speechEnergy > 0.3) {
          drawCoverImage(primaryImg, z, swayX * 0.8, swayY, headTilt, Math.min(0.7, speechEnergy));
        }
      } else {
        const z = baseZoom + 0.06 + localSceneProgress * 0.12 + breathe;
        drawCoverImage(primaryImg, z, swayX * 0.7, swayY, headTilt, 1);
        if (talkingImg !== primaryImg) {
          drawCoverImage(talkingImg, z, swayX * 0.7, swayY, headTilt, Math.min(0.9, 0.25 + speechEnergy));
        }
      }

      // Subtle cinematic dark vignette & simulated natural eye-blink pulse every 3.4s
      const blinkPhase = t % 3.4;
      if (blinkPhase > 3.24) {
        ctx.fillStyle = 'rgba(26, 25, 23, 0.12)';
        ctx.fillRect(0, 0, w, h);
      }

      const grad = ctx.createRadialGradient(w / 2, h * 0.42, w * 0.22, w / 2, h / 2, Math.max(w, h) * 0.75);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(20,19,17,0.38)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Top Watermark & Dynamic Beat Badge
      if (params.aiDisclosureWatermark) {
        ctx.fillStyle = 'rgba(26, 25, 23, 0.72)';
        ctx.fillRect(24, 24, Math.min(w - 180, 340), 30);
        ctx.fillStyle = '#F6F3EC';
        ctx.font = '600 12px monospace';
        ctx.fillText((params.watermarkText || 'AI DIGITAL TWIN · AUTHORIZED LIKENESS').slice(0, 38), 34, 43);
      }

      const beatLabel =
        progress < 0.3 ? '01 HOOK' : progress < 0.72 ? '02 INSIGHT' : '03 ACTION';
      ctx.fillStyle = '#B69A65';
      ctx.fillRect(w - 134, 24, 110, 30);
      ctx.fillStyle = '#1A1917';
      ctx.font = '700 12px monospace';
      ctx.fillText(beatLabel, w - 120, 43);

      // Lower Editorial Studio Band
      const barHeight = params.subtitlesEnabled ? Math.round(h * 0.22) : Math.round(h * 0.12);
      const bandTop = h - barHeight;
      ctx.fillStyle = cardBg;
      ctx.fillRect(0, bandTop, w, barHeight);

      // Top hairline + Animated Champagne-Gold Progress Bar
      ctx.fillStyle = 'rgba(182, 154, 101, 0.28)';
      ctx.fillRect(0, bandTop, w, 3);
      ctx.fillStyle = '#B69A65';
      ctx.fillRect(0, bandTop, Math.round(w * progress), 3);

      // Live 24-bar Audio Equalizer Visualizer
      const eqCount = 24;
      const eqWidth = Math.min(210, Math.round(w * 0.28));
      const eqX0 = w - eqWidth - 28;
      const barW = Math.max(3, Math.floor(eqWidth / eqCount) - 3);
      for (let b = 0; b < eqCount; b++) {
        const rawVal = audioEl
          ? (freqData[b * 2] || 0) / 255
          : Math.abs(Math.sin(t * 5.5 + b * 0.45)) * 0.65 + 0.15;
        const barH = Math.max(4, Math.round(rawVal * 32));
        ctx.fillStyle = b % 3 === 0 ? '#B69A65' : subtleInk;
        ctx.fillRect(eqX0 + b * (barW + 3), bandTop + 36 - barH, barW, barH);
      }

      // Production Title Header
      ctx.fillStyle = subtleInk;
      ctx.font = '600 13px monospace';
      ctx.fillText(params.title.slice(0, 38).toUpperCase(), 30, bandTop + 28);

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
        let cursorY = bandTop + 68;
        const maxRight = w - 34;

        activeSeg.words.forEach((word, wi) => {
          const measured = ctx.measureText(`${word} `).width;
          if (cursorX + measured > maxRight) {
            cursorX = 30;
            cursorY += Math.round(fontSize * 1.32);
          }
          const isCurrent = wi === activeWordIdx;
          ctx.fillStyle = isCurrent ? '#B69A65' : textInk;
          ctx.fillText(word, cursorX, cursorY);
          cursorX += measured;
        });
      }

      params.onProgress?.(Math.round(progress * 100), beatLabel);

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

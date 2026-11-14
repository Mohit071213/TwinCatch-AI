import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import type { ProductionStyle, VoicePitchWarmth, VoiceProsodyPreset } from '../src/types.ts';

const execFileAsync = promisify(execFile);

export const MIN_VIDEO_DURATION_SEC = 30;

export const ALLOWED_FREE_HINDI_VOICES = [
  'en-US-AndrewMultilingualNeural',
  'en-US-BrianMultilingualNeural',
  'hi-IN-MadhurNeural',
  'en-IN-PrabhatNeural',
  'en-US-AvaMultilingualNeural',
  'en-US-EmmaMultilingualNeural',
  'hi-IN-SwaraNeural',
  'en-IN-NeerjaNeural',
] as const;

let cachedHasDrawtext: boolean | null = null;
let cachedFfmpegOk: boolean | null = null;

export async function checkFfmpegAvailable(): Promise<boolean> {
  if (cachedFfmpegOk !== null) return cachedFfmpegOk;
  try {
    await execFileAsync('ffmpeg', ['-version'], { timeout: 5000 });
    cachedFfmpegOk = true;
  } catch {
    cachedFfmpegOk = false;
  }
  return cachedFfmpegOk;
}

async function hasDrawtextFilter(): Promise<boolean> {
  if (cachedHasDrawtext !== null) return cachedHasDrawtext;
  try {
    const { stdout } = await execFileAsync('ffmpeg', ['-hide_banner', '-filters'], { timeout: 5000 });
    cachedHasDrawtext = stdout.includes('drawtext');
  } catch {
    cachedHasDrawtext = false;
  }
  return cachedHasDrawtext;
}

export async function getMediaDurationSec(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        filePath,
      ],
      { timeout: 8000 }
    );
    const parsed = Number.parseFloat(stdout.trim());
    return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : 0;
  } catch {
    return 0;
  }
}

export async function synthesizeAmbientStudioWav(params: {
  durationSec: number;
  outputWavPath: string;
}): Promise<void> {
  await fs.mkdir(path.dirname(params.outputWavPath), { recursive: true });
  const dur = Math.max(4, Math.min(45, Math.round(params.durationSec || 8)));
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `aevalsrc=0.06*sin(2*PI*220*t)*(0.5+0.5*sin(2*PI*t/1.5))+0.04*sin(2*PI*330*t)*(0.5+0.5*sin(2*PI*t/2.2))+0.025*sin(2*PI*440*t)*(0.5+0.5*sin(2*PI*t/3.1)):s=24000:c=mono:d=${dur}`,
      '-c:a',
      'pcm_s16le',
      params.outputWavPath,
    ],
    { timeout: 15000 }
  );
}

function escapeSsmlText(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function runFfmpegPipe(args: string[], stdinBuffer: Buffer, timeoutMs = 20000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const outChunks: Buffer[] = [];
    let errText = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`FFmpeg pipe timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => outChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => {
      errText += chunk.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(Buffer.concat(outChunks));
      } else {
        reject(new Error(`FFmpeg pipe exited with code ${code}: ${errText.slice(-300)}`));
      }
    });

    child.stdin.on('error', () => {
      // Ignore broken pipe if child exits early
    });
    child.stdin.end(stdinBuffer);
  });
}

function msToSilencePcm24k(ms: number): Buffer {
  const clampedMs = Math.max(0, Math.min(1200, Math.round(ms)));
  // 24,000 samples/sec * 2 bytes/sample (pcm_s16le mono) = 48 bytes per ms
  const byteCount = clampedMs * 48;
  return Buffer.alloc(byteCount - (byteCount % 2), 0);
}

interface SpeechPhrase {
  text: string;
  pauseAfterMs: number;
}

function segmentConversationalPhrases(
  rawText: string,
  preset: VoiceProsodyPreset,
  naturalPauses: boolean
): SpeechPhrase[] {
  const cleaned = rawText
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  if (!cleaned) return [];
  if (!naturalPauses) {
    return [{ text: cleaned.replace(/\n+/g, ' '), pauseAfterMs: 80 }];
  }

  const pauseProfile =
    preset === 'calm_mentor'
      ? { sentence: 195, clause: 95 }
      : preset === 'lively_creator'
        ? { sentence: 85, clause: 40 }
        : preset === 'friendly_explainer'
          ? { sentence: 125, clause: 60 }
          : { sentence: 150, clause: 70 }; // warm_storyteller

  const paragraphs = cleaned
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const phrases: SpeechPhrase[] = [];

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const para = paragraphs[pIdx];
    // Split on sentence endings (Hindi danda ।, ?, !, ..., and non-decimal .) plus conversational dashes
    const rawTokens = para
      .split(/(?<=[।?!]|(?<!\d)\.(?!\d)|\.{3}|[—–;])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    // Only subdivide very long clauses (>135 chars) so intonation stays flowing and brisk
    const fineSegments: Array<{ text: string; kind: 'sentence' | 'clause' }> = [];
    for (const token of rawTokens) {
      if (token.length > 135 && token.includes(',')) {
        const subParts = token.split(/(?<=,)\s+/).map((x) => x.trim()).filter(Boolean);
        subParts.forEach((sub, sIdx) => {
          const isLastSub = sIdx === subParts.length - 1;
          fineSegments.push({
            text: sub,
            kind: !isLastSub || /[—–;,]$/.test(sub) ? 'clause' : 'sentence',
          });
        });
      } else {
        const isClause = /[—–;,]$/.test(token);
        fineSegments.push({ text: token, kind: isClause ? 'clause' : 'sentence' });
      }
    }

    // Merge short <38 char fragments so speaker flows cleanly instead of pausing every few words
    const merged: Array<{ text: string; kind: 'sentence' | 'clause' }> = [];
    for (const seg of fineSegments) {
      if (merged.length > 0 && (seg.text.length < 34 || merged[merged.length - 1].text.length < 38)) {
        merged[merged.length - 1].text = `${merged[merged.length - 1].text} ${seg.text}`;
        merged[merged.length - 1].kind = seg.kind;
      } else {
        merged.push({ ...seg });
      }
    }

    merged.forEach((m, idx) => {
      const isLastInPara = idx === merged.length - 1;
      const isVeryLast = pIdx === paragraphs.length - 1 && isLastInPara;
      const pauseAfterMs = isVeryLast
        ? 45
        : isLastInPara && paragraphs.length > 1
          ? pauseProfile.sentence + 40
          : m.kind === 'clause'
            ? pauseProfile.clause
            : pauseProfile.sentence;
      phrases.push({ text: m.text, pauseAfterMs });
    });
  }

  return phrases.length > 0 ? phrases : [{ text: cleaned, pauseAfterMs: 45 }];
}

export async function synthesizeEdgeNeuralSpeechWav(params: {
  text: string;
  voiceIdentity: string;
  language: 'English' | 'Hindi' | 'Hinglish';
  speakingSpeed?: number;
  prosodyPreset?: VoiceProsodyPreset;
  pitchWarmth?: VoicePitchWarmth;
  naturalPauses?: boolean;
  outputWavPath: string;
}): Promise<{ wavPath: string; voiceUsed: string; byteLength: number }> {
  await fs.mkdir(path.dirname(params.outputWavPath), { recursive: true });

  const voiceUsed = (ALLOWED_FREE_HINDI_VOICES as readonly string[]).includes(params.voiceIdentity)
    ? params.voiceIdentity
    : params.language === 'English'
      ? 'en-US-AvaMultilingualNeural'
      : 'en-US-AndrewMultilingualNeural';

  const preset: VoiceProsodyPreset = params.prosodyPreset || 'warm_storyteller';
  const presetDefaults =
    preset === 'calm_mentor'
      ? { pace: 1.0, warmth: 'warm' as VoicePitchWarmth }
      : preset === 'lively_creator'
        ? { pace: 1.15, warmth: 'bright' as VoicePitchWarmth }
        : preset === 'friendly_explainer'
          ? { pace: 1.1, warmth: 'natural' as VoicePitchWarmth }
          : { pace: 1.05, warmth: 'warm' as VoicePitchWarmth };

  const effectivePace = Math.max(
    0.85,
    Math.min(1.32, Number(params.speakingSpeed) || presetDefaults.pace)
  );
  const warmth: VoicePitchWarmth = params.pitchWarmth || presetDefaults.warmth;
  const naturalPauses = params.naturalPauses !== false;

  const ratePct = Math.round((effectivePace - 1.0) * 100);
  const rateStr = `${ratePct >= 0 ? '+' : ''}${ratePct}%`;
  const pitchStr = warmth === 'warm' ? '-3Hz' : warmth === 'bright' ? '+4Hz' : '+0Hz';

  const phrases = segmentConversationalPhrases(params.text.slice(0, 2200), preset, naturalPauses);
  const tts = new MsEdgeTTS({ connectionTimeoutMs: 12000, synthesisTimeoutMs: 25000 });

  const pcmParts: Buffer[] = [msToSilencePcm24k(25)]; // crisp 25ms lead-in
  try {
    await tts.setMetadata(voiceUsed, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    for (const phrase of phrases) {
      const { audioStream } = tts.toStream(escapeSsmlText(phrase.text), {
        rate: rateStr,
        pitch: pitchStr,
      });
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const mp3Buf = Buffer.concat(chunks);
      if (mp3Buf.length < 128) {
        throw new Error(`Free Neural Hindi TTS returned an empty segment for ${voiceUsed}.`);
      }

      const pcmChunk = await runFfmpegPipe(
        ['-v', 'error', '-f', 'mp3', '-i', 'pipe:0', '-ar', '24000', '-ac', '1', '-f', 's16le', 'pipe:1'],
        mp3Buf,
        15000
      );
      if (pcmChunk.length > 0) {
        pcmParts.push(pcmChunk);
        if (phrase.pauseAfterMs > 0) {
          pcmParts.push(msToSilencePcm24k(phrase.pauseAfterMs));
        }
      }
    }
  } finally {
    try {
      tts.close();
    } catch {
      // ignore close errors
    }
  }

  const combinedPcm = Buffer.concat(pcmParts);
  if (combinedPcm.length < 512) {
    throw new Error('Free Neural Hindi TTS returned insufficient audio.');
  }

  // Master concatenated speech PCM with subtle broadcast vocal warmth & balanced loudness
  const tmpPcm = `${params.outputWavPath}.tmp.pcm`;
  await fs.writeFile(tmpPcm, combinedPcm);
  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-f',
        's16le',
        '-ar',
        '24000',
        '-ac',
        '1',
        '-i',
        tmpPcm,
        '-af',
        'highpass=f=75,equalizer=f=210:t=q:w=1.1:g=2.0,equalizer=f=4400:t=q:w=1.3:g=-1.5,loudnorm=I=-16:TP=-1.5:LRA=9',
        '-ar',
        '24000',
        '-ac',
        '1',
        '-c:a',
        'pcm_s16le',
        params.outputWavPath,
      ],
      { timeout: 25000 }
    );
  } finally {
    await fs.unlink(tmpPcm).catch(() => {});
  }

  const stat = await fs.stat(params.outputWavPath);
  return {
    wavPath: params.outputWavPath,
    voiceUsed,
    byteLength: stat.size,
  };
}

function escapeDrawtext(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/,/g, '\\,')
    .replace(/\n/g, ' ')
    .trim();
}

function chunkTimedSubtitles(
  text: string,
  totalDurationSec: number,
  maxCharsPerLine: number
): Array<{ lines: string[]; start: number; end: number }> {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0) return [];

  const chunks: string[][] = [];
  let currentChunk: string[] = [];
  for (const w of words) {
    currentChunk.push(w);
    if (currentChunk.join(' ').length >= maxCharsPerLine * 1.8) {
      chunks.push(currentChunk);
      currentChunk = [];
    }
  }
  if (currentChunk.length > 0) chunks.push(currentChunk);

  const sliceSec = totalDurationSec / chunks.length;
  return chunks.map((chunkWords, i) => {
    const line1: string[] = [];
    const line2: string[] = [];
    for (const w of chunkWords) {
      if ((line1.join(' ') + ' ' + w).trim().length <= maxCharsPerLine && line2.length === 0) {
        line1.push(w);
      } else {
        line2.push(w);
      }
    }
    return {
      lines: [line1.join(' '), line2.join(' ')].filter(Boolean),
      start: Number((i * sliceSec).toFixed(2)),
      end: Number(((i + 1) * sliceSec).toFixed(2)),
    };
  });
}

function dimensionsForAspect(aspectRatio: '9:16' | '1:1' | '16:9'): { w: number; h: number } {
  if (aspectRatio === '1:1') return { w: 720, h: 720 };
  if (aspectRatio === '16:9') return { w: 1280, h: 720 };
  return { w: 720, h: 1280 };
}

export interface FfmpegRenderOptions {
  portraitPath: string;
  sceneImagePaths?: string[];
  sceneBackgroundPaths?: string[];
  presenterMode?: 'auto_match' | 'faceless_broll' | 'twin_owner' | 'cast_ananya' | 'cast_meera' | 'cast_kabir';
  productionStyle?: ProductionStyle;
  beatOverlays?: Array<{
    calloutText?: string;
    subBadge?: string;
    isPunchline?: boolean;
    startPct: number;
    endPct: number;
  }>;
  audioPath?: string;
  durationSec: number;
  aspectRatio: '9:16' | '1:1' | '16:9';
  framing?: 'Close-Up Studio' | 'Medium Editorial' | 'Presenter Bust';
  speakingSpeed?: number;
  title: string;
  captionExcerpt: string;
  backgroundStyle: string;
  subtitlesEnabled: boolean;
  aiDisclosureWatermark: boolean;
  watermarkText: string;
  outputVideoPath: string;
  outputThumbPath: string;
}

export async function renderTwinVideoFFmpeg(opts: FfmpegRenderOptions): Promise<{
  durationSec: number;
  processingMs: number;
}> {
  const start = Date.now();
  await fs.mkdir(path.dirname(opts.outputVideoPath), { recursive: true });
  await fs.mkdir(path.dirname(opts.outputThumbPath), { recursive: true });

  const { w, h } = dimensionsForAspect(opts.aspectRatio);
  const speed = Math.max(0.75, Math.min(1.35, Number(opts.speakingSpeed) || 1.0));
  let targetDuration = Math.max(MIN_VIDEO_DURATION_SEC, Math.min(opts.durationSec || MIN_VIDEO_DURATION_SEC, 120));

  const hasAudio = Boolean(opts.audioPath);
  if (opts.audioPath) {
    const probed = await getMediaDurationSec(opts.audioPath);
    if (probed > 0.5) {
      targetDuration = Math.min(Math.max(probed / speed, MIN_VIDEO_DURATION_SEC), 120);
    }
  }

  const drawtextSupported = await hasDrawtextFilter();
  const isVideoPortrait = Boolean(opts.portraitPath && /\.(mp4|mov|webm)$/i.test(opts.portraitPath));

  const bgColor =
    opts.backgroundStyle === 'Warm Charcoal'
      ? '0x1A1917'
      : opts.backgroundStyle === 'Cosmic & Science Lab'
        ? '0x0F1528'
        : opts.backgroundStyle === 'Warm Comedy Stage'
          ? '0x2A1D15'
          : opts.backgroundStyle === 'Auto-Match Script Theme'
            ? '0x181715'
            : opts.backgroundStyle === 'Architectural Daylight'
              ? '0xEAE4D7'
              : '0xF6F3EC';

  // Deduplicate available presenter portrait paths
  const uniqueImages: string[] = [];
  for (const p of [opts.portraitPath, ...(opts.sceneImagePaths || [])]) {
    if (p && !/\.(mp4|mov|webm)$/i.test(p) && !uniqueImages.includes(p)) {
      try {
        await fs.access(p);
        uniqueImages.push(p);
      } catch {
        // skip unreachable path
      }
    }
  }

  // Deduplicate script-matched B-roll scene backgrounds
  const bgImages: string[] = [];
  for (const p of opts.sceneBackgroundPaths || []) {
    if (p && !/\.(mp4|mov|webm)$/i.test(p) && !bgImages.includes(p)) {
      try {
        await fs.access(p);
        bgImages.push(p);
      } catch {
        // skip unreachable path
      }
    }
  }

  if (uniqueImages.length === 0 && bgImages.length > 0) {
    uniqueImages.push(bgImages[0]);
  }
  if (uniqueImages.length === 0 && !isVideoPortrait) {
    uniqueImages.push(opts.portraitPath);
  }

  const args: string[] = ['-y'];
  const filters: string[] = [];
  const fps = 25;

  const framingStartZoom =
    opts.framing === 'Close-Up Studio' ? 1.14 : opts.framing === 'Presenter Bust' ? 1.07 : 1.02;

  let audioInputIdx = 1;

  if (isVideoPortrait) {
    args.push('-stream_loop', '-1', '-i', opts.portraitPath);
    filters.push(
      `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=${fps},settb=AVTB,setsar=1,eq=contrast=1.04:saturation=0.98[base]`
    );
    audioInputIdx = 1;
  } else {
    // 6-shot dynamic genre choreography across >=30s with style-matched cuts & punch zooms
    const style = opts.productionStyle || 'creator_reel';
    const shotCount = 6;
    const xfadeDur = style === 'comedy_skit' ? 0.22 : style === 'story_cinema' ? 0.52 : 0.36;
    const rawShotDur = Number(((targetDuration + xfadeDur * (shotCount - 1)) / shotCount).toFixed(2));
    const shotFrames = Math.max(60, Math.round(rawShotDur * fps));

    let shotImages: string[];
    if (opts.presenterMode === 'faceless_broll' && bgImages.length > 0) {
      shotImages = Array.from({ length: 6 }, (_, idx) => bgImages[idx % bgImages.length]);
    } else if (bgImages.length > 0) {
      shotImages = [
        uniqueImages[0],
        bgImages[0],
        bgImages[1 % bgImages.length],
        uniqueImages[1 % uniqueImages.length] || bgImages[2 % bgImages.length],
        bgImages[2 % bgImages.length],
        bgImages[3 % bgImages.length] || uniqueImages[0],
      ];
    } else {
      shotImages = [
        uniqueImages[0],
        uniqueImages[1 % uniqueImages.length],
        uniqueImages[2 % uniqueImages.length],
        uniqueImages[0],
        uniqueImages[1 % uniqueImages.length],
        uniqueImages[2 % uniqueImages.length],
      ];
    }

    for (const imgPath of shotImages) {
      args.push('-loop', '1', '-t', String(rawShotDur + 0.2), '-framerate', String(fps), '-i', imgPath);
    }
    audioInputIdx = shotCount;

    const zoomRate = style === 'comedy_skit' ? 0.0032 : style === 'visual_explainer' ? 0.0016 : 0.002;
    const eqFilter =
      style === 'comedy_skit'
        ? 'eq=contrast=1.08:saturation=1.18:brightness=0.02'
        : style === 'story_cinema'
          ? 'eq=contrast=1.09:saturation=0.90:brightness=-0.02'
          : 'eq=contrast=1.05:saturation=1.04';

    const shotMoves = [
      `zoompan=z='if(eq(on,1),${framingStartZoom},min(zoom+${zoomRate},${(framingStartZoom + 0.26).toFixed(2)}))':x='iw/2-(iw/zoom/2)':y='ih/2.5-(ih/zoom/2.5)':d=${shotFrames}:s=${w}x${h}:fps=${fps}`,
      `zoompan=z='${(framingStartZoom + 0.14).toFixed(2)}':x='(iw-iw/zoom)*(on/${shotFrames})':y='ih/2.35-(ih/zoom/2.35)':d=${shotFrames}:s=${w}x${h}:fps=${fps}`,
      `zoompan=z='if(eq(on,1),${(framingStartZoom + 0.25).toFixed(2)},max(zoom-${zoomRate},${framingStartZoom.toFixed(2)}))':x='iw/2-(iw/zoom/2)':y='ih/2.2-(ih/zoom/2.2)':d=${shotFrames}:s=${w}x${h}:fps=${fps}`,
      `zoompan=z='${(framingStartZoom + 0.12).toFixed(2)}':x='(iw-iw/zoom)*(1-on/${shotFrames})':y='ih/2.4-(ih/zoom/2.4)':d=${shotFrames}:s=${w}x${h}:fps=${fps}`,
      `zoompan=z='if(eq(on,1),${(framingStartZoom + 0.04).toFixed(2)},min(zoom+${(zoomRate * 1.1).toFixed(4)},${(framingStartZoom + 0.24).toFixed(2)}))':x='iw/2-(iw/zoom/2)':y='ih/2.45-(ih/zoom/2.45)':d=${shotFrames}:s=${w}x${h}:fps=${fps}`,
      `zoompan=z='if(eq(on,1),${(framingStartZoom + 0.22).toFixed(2)},max(zoom-0.0018,${framingStartZoom.toFixed(2)}))':x='(iw-iw/zoom)*(on/${shotFrames})':y='ih/2.3-(ih/zoom/2.3)':d=${shotFrames}:s=${w}x${h}:fps=${fps}`,
    ];

    for (let i = 0; i < shotCount; i++) {
      filters.push(
        `[${i}:v]scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},${shotMoves[i]},settb=AVTB,setsar=1,format=yuv420p,${eqFilter}[v${i}]`
      );
    }

    const transitions =
      style === 'comedy_skit'
        ? ['wipeleft', 'wiperight', 'slidedown', 'slideup', 'radial']
        : style === 'story_cinema'
          ? ['dissolve', 'fadeblack', 'dissolve', 'smoothleft', 'dissolve']
          : ['smoothleft', 'slideup', 'smoothright', 'dissolve', 'circleopen'];
    let prev = 'v0';
    for (let i = 1; i < shotCount; i++) {
      const offset = Number((i * (rawShotDur - xfadeDur)).toFixed(2));
      const outTag = i === shotCount - 1 ? 'base' : `xf${i}`;
      filters.push(
        `[${prev}][v${i}]xfade=transition=${transitions[(i - 1) % transitions.length]}:duration=${xfadeDur}:offset=${offset}[${outTag}]`
      );
      prev = outTag;
    }
  }

  // Audio source: real speech file OR warm harmonic studio pulse (never dead silence)
  if (hasAudio && opts.audioPath) {
    args.push('-i', opts.audioPath);
  } else {
    args.push(
      '-f',
      'lavfi',
      '-i',
      `aevalsrc=0.06*sin(2*PI*220*t)*(0.5+0.5*sin(2*PI*t/1.5))+0.04*sin(2*PI*330*t)*(0.5+0.5*sin(2*PI*t/2.2))+0.025*sin(2*PI*440*t)*(0.5+0.5*sin(2*PI*t/3.1)):s=44100:c=stereo`
    );
  }

  // Pad audio to full >=30s duration if spoken track is shorter, and split for waveform overlay
  if (hasAudio && Math.abs(speed - 1.0) >= 0.05) {
    filters.push(
      `[${audioInputIdx}:a]atempo=${speed.toFixed(2)},apad=whole_dur=${targetDuration.toFixed(2)},asplit=2[aout][awave]`
    );
  } else if (hasAudio) {
    filters.push(
      `[${audioInputIdx}:a]apad=whole_dur=${targetDuration.toFixed(2)},asplit=2[aout][awave]`
    );
  } else {
    filters.push(`[${audioInputIdx}:a]asplit=2[aout][awave]`);
  }

  const barHeight = opts.subtitlesEnabled ? Math.round(h * 0.21) : Math.round(h * 0.11);
  const waveW = Math.min(260, Math.round(w * 0.34));
  const waveH = 34;

  // Lower editorial backdrop + animated gold progress bar strip
  filters.push(
    `[base]drawbox=x=0:y=${h - barHeight}:w=${w}:h=${barHeight}:color=${bgColor}@0.88:t=fill,drawbox=x=0:y=${h - barHeight}:w=${w}:h=2:color=0xE4DDD0@0.9:t=fill[banded]`
  );

  // Smoothly animated progress bar sweeping across the caption divider via overlay expression
  filters.push(`color=c=0xB69A65:s=${w}x3:r=${fps}:d=${targetDuration.toFixed(2)}[progbar]`);
  filters.push(
    `[banded][progbar]overlay=x='-w+(w*t/${targetDuration.toFixed(2)})':y=${h - barHeight}:shortest=1[progressed]`
  );

  // Live audio-reactive waveform overlay on the top-right of the editorial caption bar
  filters.push(
    `[awave]showwaves=s=${waveW}x${waveH}:mode=cline:rate=${fps}:colors=0xB69A65@0.95,format=rgba[wave]`
  );
  filters.push(
    `[progressed][wave]overlay=x=${w - waveW - 28}:y=${h - barHeight + 10}:shortest=1[waved]`
  );

  let lastTag = 'waved';

  if (drawtextSupported) {
    const isDarkBar =
      opts.backgroundStyle === 'Warm Charcoal' ||
      opts.backgroundStyle === 'Auto-Match Script Theme' ||
      opts.backgroundStyle === 'Cosmic & Science Lab' ||
      opts.backgroundStyle === 'Warm Comedy Stage';
    const textColor = isDarkBar ? '0xF6F3EC' : '0x242421';
    const subtleColor = isDarkBar ? '0xD8B36A' : '0x77766F';

    if (opts.aiDisclosureWatermark) {
      const wm = escapeDrawtext(opts.watermarkText || 'AI DIGITAL TWIN · AUTHORIZED LIKENESS');
      filters.push(
        `[${lastTag}]drawtext=text='${wm}':x=28:y=26:fontsize=${Math.max(13, Math.round(w * 0.019))}:fontcolor=0xFFFFFF@0.92:box=1:boxcolor=0x1A1917@0.65:boxborderw=8[wm]`
      );
      lastTag = 'wm';
    }

    // Genre-specific on-screen visual punchline / fact callout overlays per beat
    const callouts = (opts.beatOverlays || []).filter((b) => b.calloutText).slice(0, 6);
    if (callouts.length > 0) {
      const style = opts.productionStyle || 'creator_reel';
      const boxBg =
        style === 'comedy_skit'
          ? '0xE09F5A@0.95'
          : style === 'visual_explainer'
            ? '0x15252E@0.92'
            : '0x1A1917@0.88';
      const boxFg = style === 'comedy_skit' ? '0x1A1917' : '0xF6F3EC';
      const calloutFont = Math.max(17, Math.round(w * 0.029));
      const yCallout = style === 'comedy_skit' ? 84 : h - barHeight - 62;

      callouts.forEach((b, bIdx) => {
        const sTime = Number((b.startPct * targetDuration).toFixed(2));
        const eTime = Number((b.endPct * targetDuration).toFixed(2));
        const txt = escapeDrawtext((b.calloutText || '').slice(0, 34));
        const nextTag = `co_${bIdx}`;
        filters.push(
          `[${lastTag}]drawtext=text='${txt}':x=(w-text_w)/2:y=${yCallout}:fontsize=${calloutFont}:fontcolor=${boxFg}:box=1:boxcolor=${boxBg}:boxborderw=12:enable='between(t,${sTime},${eTime})'[${nextTag}]`
        );
        lastTag = nextTag;
      });
    } else {
      const b1End = Number((targetDuration * 0.3).toFixed(2));
      const b2End = Number((targetDuration * 0.72).toFixed(2));
      const beatBadgeSize = Math.max(12, Math.round(w * 0.018));
      filters.push(
        `[${lastTag}]drawtext=text='01 HOOK':x=${w - 118}:y=28:fontsize=${beatBadgeSize}:fontcolor=0x1A1917:box=1:boxcolor=0xB69A65@0.94:boxborderw=7:enable='between(t,0,${b1End})'[beat1]`
      );
      filters.push(
        `[beat1]drawtext=text='02 INSIGHT':x=${w - 134}:y=28:fontsize=${beatBadgeSize}:fontcolor=0x1A1917:box=1:boxcolor=0xB69A65@0.94:boxborderw=7:enable='between(t,${b1End},${b2End})'[beat2]`
      );
      filters.push(
        `[beat2]drawtext=text='03 ACTION':x=${w - 130}:y=28:fontsize=${beatBadgeSize}:fontcolor=0x1A1917:box=1:boxcolor=0xB69A65@0.94:boxborderw=7:enable='between(t,${b2End},${targetDuration.toFixed(2)})'[beat3]`
      );
      lastTag = 'beat3';
    }

    if (opts.subtitlesEnabled) {
      const titleTag = escapeDrawtext(opts.title.slice(0, 42));
      filters.push(
        `[${lastTag}]drawtext=text='${titleTag}':x=32:y=${h - barHeight + 16}:fontsize=${Math.max(13, Math.round(w * 0.02))}:fontcolor=${subtleColor}[lbl]`
      );
      lastTag = 'lbl';

      const timedSegments = chunkTimedSubtitles(
        opts.captionExcerpt || opts.title,
        targetDuration,
        opts.aspectRatio === '16:9' ? 54 : 32
      ).slice(0, 12);

      timedSegments.forEach((seg, segIdx) => {
        seg.lines.forEach((line, lineIdx) => {
          const nextTag = `sub_${segIdx}_${lineIdx}`;
          const yPos = h - barHeight + 52 + lineIdx * Math.round(w * 0.044);
          filters.push(
            `[${lastTag}]drawtext=text='${escapeDrawtext(line)}':x=32:y=${yPos}:fontsize=${Math.max(18, Math.round(w * 0.031))}:fontcolor=${textColor}:enable='between(t,${seg.start},${seg.end})'[${nextTag}]`
          );
          lastTag = nextTag;
        });
      });
    }
  }

  const filterComplex = filters.join(';');

  args.push(
    '-filter_complex',
    filterComplex,
    '-map',
    `[${lastTag}]`,
    '-map',
    '[aout]',
    '-t',
    targetDuration.toFixed(2),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '22',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-movflags',
    '+faststart',
    opts.outputVideoPath
  );

  await execFileAsync('ffmpeg', args, { timeout: 120000 });

  await execFileAsync(
    'ffmpeg',
    ['-y', '-ss', '0.4', '-i', opts.outputVideoPath, '-vframes', '1', '-q:v', '3', opts.outputThumbPath],
    { timeout: 15000 }
  );

  return {
    durationSec: Number(targetDuration.toFixed(2)),
    processingMs: Date.now() - start,
  };
}

export async function transcodeUploadedVideoFFmpeg(opts: {
  inputMediaPath: string;
  audioPath?: string;
  targetDurationSec?: number;
  outputVideoPath: string;
  outputThumbPath: string;
}): Promise<{ durationSec: number; processingMs: number }> {
  const start = Date.now();
  await fs.mkdir(path.dirname(opts.outputVideoPath), { recursive: true });
  await fs.mkdir(path.dirname(opts.outputThumbPath), { recursive: true });

  const probedVideoDur = await getMediaDurationSec(opts.inputMediaPath);
  const fullDur = Math.max(MIN_VIDEO_DURATION_SEC, probedVideoDur || opts.targetDurationSec || MIN_VIDEO_DURATION_SEC);

  const args = ['-y', '-i', opts.inputMediaPath];
  if (opts.audioPath) {
    args.push('-i', opts.audioPath, '-map', '0:v:0', '-map', '1:a:0', '-af', `apad=whole_dur=${fullDur.toFixed(2)}`);
  } else {
    args.push('-map', '0:v:0', '-map', '0:a?');
  }

  args.push(
    '-t',
    fullDur.toFixed(2),
    '-vf',
    'scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=24',
    '-c:v',
    'libx264',
    '-preset',
    'superfast',
    '-threads',
    '2',
    '-crf',
    '22',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-movflags',
    '+faststart',
    opts.outputVideoPath
  );

  await execFileAsync('ffmpeg', args, { timeout: 180000 });

  await execFileAsync(
    'ffmpeg',
    ['-y', '-ss', '0.4', '-i', opts.outputVideoPath, '-vframes', '1', '-q:v', '3', opts.outputThumbPath],
    { timeout: 15000 }
  );

  const durationSec = await getMediaDurationSec(opts.outputVideoPath);
  return {
    durationSec: Math.max(MIN_VIDEO_DURATION_SEC, durationSec || fullDur),
    processingMs: Date.now() - start,
  };
}

export async function muxAudioAndWatermarkOnVideoFFmpeg(opts: {
  sourceVideoPath: string;
  audioPath?: string;
  aiDisclosureWatermark: boolean;
  watermarkText: string;
  outputVideoPath: string;
  outputThumbPath: string;
}): Promise<{ durationSec: number; processingMs: number }> {
  const start = Date.now();
  await fs.mkdir(path.dirname(opts.outputVideoPath), { recursive: true });
  await fs.mkdir(path.dirname(opts.outputThumbPath), { recursive: true });

  const drawtextSupported = await hasDrawtextFilter();
  const args = ['-y', '-i', opts.sourceVideoPath];
  if (opts.audioPath) {
    args.push('-i', opts.audioPath);
  }

  if (drawtextSupported && opts.aiDisclosureWatermark) {
    const wm = escapeDrawtext(opts.watermarkText || 'AI DIGITAL TWIN · AUTHORIZED LIKENESS');
    args.push(
      '-vf',
      `drawtext=text='${wm}':x=24:y=24:fontsize=16:fontcolor=0xFFFFFF@0.9:box=1:boxcolor=0x1A1917@0.58:boxborderw=8`
    );
  }

  if (opts.audioPath) {
    args.push('-map', '0:v:0', '-map', '1:a:0', '-shortest');
  } else {
    args.push('-map', '0:v:0', '-map', '0:a?');
  }

  args.push(
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '21',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    opts.outputVideoPath
  );

  await execFileAsync('ffmpeg', args, { timeout: 120000 });

  await execFileAsync(
    'ffmpeg',
    ['-y', '-ss', '0.4', '-i', opts.outputVideoPath, '-vframes', '1', '-q:v', '3', opts.outputThumbPath],
    { timeout: 15000 }
  );

  const durationSec = await getMediaDurationSec(opts.outputVideoPath);
  return {
    durationSec: durationSec || 8,
    processingMs: Date.now() - start,
  };
}

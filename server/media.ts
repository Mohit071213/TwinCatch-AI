import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const execFileAsync = promisify(execFile);

export const MIN_VIDEO_DURATION_SEC = 30;

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

export async function synthesizeEdgeNeuralSpeechWav(params: {
  text: string;
  voiceIdentity: string;
  language: 'English' | 'Hindi' | 'Hinglish';
  speakingSpeed?: number;
  outputWavPath: string;
}): Promise<{ wavPath: string; voiceUsed: string; byteLength: number }> {
  await fs.mkdir(path.dirname(params.outputWavPath), { recursive: true });

  const allowedEdgeVoices = [
    'hi-IN-MadhurNeural',
    'hi-IN-SwaraNeural',
    'en-IN-PrabhatNeural',
    'en-IN-NeerjaNeural',
  ];

  const voiceUsed = allowedEdgeVoices.includes(params.voiceIdentity)
    ? params.voiceIdentity
    : params.language === 'Hindi'
      ? 'hi-IN-MadhurNeural'
      : params.language === 'Hinglish'
        ? 'hi-IN-SwaraNeural'
        : 'en-IN-PrabhatNeural';

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voiceUsed, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const { audioStream } = tts.toStream(params.text.slice(0, 1800));
  const chunks: Buffer[] = [];
  for await (const chunk of audioStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const mp3Buffer = Buffer.concat(chunks);
  if (mp3Buffer.length < 256) {
    throw new Error('Free Neural Hindi TTS returned an empty audio stream.');
  }

  const tmpMp3 = `${params.outputWavPath}.tmp.mp3`;
  await fs.writeFile(tmpMp3, mp3Buffer);
  try {
    const speed = Math.max(0.8, Math.min(1.25, Number(params.speakingSpeed) || 1.0));
    const args = ['-y', '-i', tmpMp3];
    if (Math.abs(speed - 1.0) >= 0.05) {
      args.push('-af', `atempo=${speed.toFixed(2)}`);
    }
    args.push('-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le', params.outputWavPath);
    await execFileAsync('ffmpeg', args, { timeout: 20000 });
  } finally {
    await fs.unlink(tmpMp3).catch(() => {});
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
  audioPath?: string;
  durationSec: number;
  aspectRatio: '9:16' | '1:1' | '16:9';
  framing?: 'Close-Up Studio' | 'Medium Editorial' | 'Presenter Bust';
  speakingSpeed?: number;
  title: string;
  captionExcerpt: string;
  backgroundStyle: 'Studio Ivory Linen' | 'Warm Charcoal' | 'Architectural Daylight';
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
  const isVideoPortrait = /\.(mp4|mov|webm)$/i.test(opts.portraitPath);

  const bgColor =
    opts.backgroundStyle === 'Warm Charcoal'
      ? '0x1A1917'
      : opts.backgroundStyle === 'Architectural Daylight'
        ? '0xEAE4D7'
        : '0xF6F3EC';

  // Deduplicate available scene images for multi-angle choreography
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
    // 6-shot dynamic editorial choreography across >=30s with smooth xfade transitions
    const shotCount = 6;
    const xfadeDur = 0.4;
    const rawShotDur = Number(((targetDuration + xfadeDur * (shotCount - 1)) / shotCount).toFixed(2));
    const shotFrames = Math.max(60, Math.round(rawShotDur * fps));

    const shotImages = [
      uniqueImages[0],
      uniqueImages[1 % uniqueImages.length],
      uniqueImages[2 % uniqueImages.length],
      uniqueImages[0],
      uniqueImages[1 % uniqueImages.length],
      uniqueImages[2 % uniqueImages.length],
    ];

    for (const imgPath of shotImages) {
      args.push('-loop', '1', '-t', String(rawShotDur + 0.2), '-framerate', String(fps), '-i', imgPath);
    }
    audioInputIdx = shotCount;

    const shotMoves = [
      `zoompan=z='if(eq(on,1),${framingStartZoom},min(zoom+0.0018,${(framingStartZoom + 0.22).toFixed(2)}))':x='iw/2-(iw/zoom/2)':y='ih/2.5-(ih/zoom/2.5)':d=${shotFrames}:s=${w}x${h}:fps=${fps}`,
      `zoompan=z='${(framingStartZoom + 0.14).toFixed(2)}':x='(iw-iw/zoom)*(on/${shotFrames})':y='ih/2.35-(ih/zoom/2.35)':d=${shotFrames}:s=${w}x${h}:fps=${fps}`,
      `zoompan=z='if(eq(on,1),${(framingStartZoom + 0.24).toFixed(2)},max(zoom-0.0018,${framingStartZoom.toFixed(2)}))':x='iw/2-(iw/zoom/2)':y='ih/2.2-(ih/zoom/2.2)':d=${shotFrames}:s=${w}x${h}:fps=${fps}`,
      `zoompan=z='${(framingStartZoom + 0.12).toFixed(2)}':x='(iw-iw/zoom)*(1-on/${shotFrames})':y='ih/2.4-(ih/zoom/2.4)':d=${shotFrames}:s=${w}x${h}:fps=${fps}`,
      `zoompan=z='if(eq(on,1),${(framingStartZoom + 0.05).toFixed(2)},min(zoom+0.0016,${(framingStartZoom + 0.20).toFixed(2)}))':x='iw/2-(iw/zoom/2)':y='ih/2.45-(ih/zoom/2.45)':d=${shotFrames}:s=${w}x${h}:fps=${fps}`,
      `zoompan=z='if(eq(on,1),${(framingStartZoom + 0.20).toFixed(2)},max(zoom-0.0015,${framingStartZoom.toFixed(2)}))':x='(iw-iw/zoom)*(on/${shotFrames})':y='ih/2.3-(ih/zoom/2.3)':d=${shotFrames}:s=${w}x${h}:fps=${fps}`,
    ];

    for (let i = 0; i < shotCount; i++) {
      filters.push(
        `[${i}:v]scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},${shotMoves[i]},settb=AVTB,setsar=1,format=yuv420p,eq=contrast=1.04:saturation=0.98[v${i}]`
      );
    }

    const transitions = ['smoothleft', 'slideup', 'smoothright', 'dissolve', 'circleopen'];
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
    const textColor = opts.backgroundStyle === 'Warm Charcoal' ? '0xF6F3EC' : '0x242421';
    const subtleColor = opts.backgroundStyle === 'Warm Charcoal' ? '0xB69A65' : '0x77766F';

    if (opts.aiDisclosureWatermark) {
      const wm = escapeDrawtext(opts.watermarkText || 'AI DIGITAL TWIN · AUTHORIZED LIKENESS');
      filters.push(
        `[${lastTag}]drawtext=text='${wm}':x=28:y=26:fontsize=${Math.max(13, Math.round(w * 0.019))}:fontcolor=0xFFFFFF@0.92:box=1:boxcolor=0x1A1917@0.65:boxborderw=8[wm]`
      );
      lastTag = 'wm';
    }

    // Animated Beat Callout Badges synced to the 3 story phases
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

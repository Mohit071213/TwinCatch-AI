import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  PresenterVisualMode,
  ProductionStyle,
  SceneVisualBeat,
  ScriptGenre,
  TwinLanguage,
  VideoFormatType,
  VisualPromptTemplate,
  WorkspaceMode,
  WritingStyleMode,
} from '../src/types.ts';
import {
  VISUAL_PROMPT_LIBRARY,
  getPromptTemplateById,
  selectFallbackTemplatesForScript,
} from '../src/lib/promptLibrary.ts';

export const SCENE_CACHE_DIR = path.resolve(process.cwd(), 'data', 'scene-cache');
const PUBLIC_CAST_DIR = path.resolve(process.cwd(), 'public', 'cast');

type ThemeMood = SceneVisualBeat['themeMood'];
type ResolvedProductionStyle = Exclude<ProductionStyle, 'auto_genre'>;

const MOOD_PALETTES: Record<ThemeMood, { bgHex: string; accentHex: string }> = {
  cosmic_space: { bgHex: '#0F1528', accentHex: '#D8B36A' },
  science_tech: { bgHex: '#132128', accentHex: '#7CC6C4' },
  comedy_office: { bgHex: '#2A1D15', accentHex: '#E09F5A' },
  finance_business: { bgHex: '#13201A', accentHex: '#C8A96B' },
  history_world: { bgHex: '#251D17', accentHex: '#CFA668' },
  mind_psychology: { bgHex: '#1E1726', accentHex: '#C99E76' },
  nature_earth: { bgHex: '#16231B', accentHex: '#A7BA78' },
  studio_editorial: { bgHex: '#1A1917', accentHex: '#B69A65' },
};

const CUT_RANGES: Array<[number, number]> = [
  [0, 0.17],
  [0.17, 0.34],
  [0.34, 0.52],
  [0.52, 0.68],
  [0.68, 0.84],
  [0.84, 1.0],
];

const FEMALE_VOICE_HINTS = [
  'ava',
  'emma',
  'swara',
  'neerja',
  'kore',
  'aoede',
  'leda',
  'zephyr',
];

function getGeminiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !key.trim()) return null;
  return new GoogleGenAI({
    apiKey: key.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label = 'Timeout'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

interface PlanVisualsResult {
  beats: SceneVisualBeat[];
  beatDiskPaths: Array<string | undefined>;
  presenter: ResolvedPresenterInfo;
  productionStyleResolved: ResolvedProductionStyle;
  visionAnalysisUsed: boolean;
}

const RECENT_PLANS_CACHE = new Map<string, { expiresAt: number; value: PlanVisualsResult }>();

function splitScriptInto6Cues(title: string, scriptText: string): string[] {
  const full = (scriptText || title || 'Creative story insight').replace(/\s+/g, ' ').trim();
  const words = full.split(' ').filter(Boolean);
  if (words.length < 6) {
    return Array.from({ length: 6 }, () => full);
  }
  const perBeat = Math.ceil(words.length / 6);
  return Array.from({ length: 6 }, (_, i) => {
    const slice = words.slice(i * perBeat, (i + 1) * perBeat);
    return slice.length > 0 ? slice.join(' ') : words.slice(-perBeat).join(' ');
  });
}

export function resolveProductionStyle(params: {
  productionStyle?: ProductionStyle;
  format?: VideoFormatType | string;
  genre?: ScriptGenre | string;
  writingStyle?: WritingStyleMode | string;
  backgroundStyle?: string;
  title?: string;
  scriptText?: string;
}): ResolvedProductionStyle {
  if (
    params.productionStyle === 'comedy_skit' ||
    params.productionStyle === 'visual_explainer' ||
    params.productionStyle === 'story_cinema' ||
    params.productionStyle === 'creator_reel'
  ) {
    return params.productionStyle;
  }

  const text = `${params.title || ''} ${params.scriptText || ''}`.toLowerCase();
  const hasComedySignals =
    params.genre === 'Comedy' ||
    params.writingStyle === 'Observational Comedy' ||
    params.writingStyle === 'Relatable Skit / Dialogue' ||
    /\b(comedy|funny|laugh|skit|meme|joke|roast|boss|manager|sync|meeting|monday|coffee|traffic|relatable|friend|prank)\b|हंसी|कॉमेडी|बॉस|ऑफिस|मज़ाक|कहानी नहीं|दोस्त/.test(
      text
    );

  if (
    params.format === 'Original Reaction' ||
    params.backgroundStyle === 'Warm Comedy Stage' ||
    hasComedySignals
  ) {
    return 'comedy_skit';
  }

  const hasExplainerSignals =
    params.genre === 'Science' ||
    params.genre === 'Knowledge' ||
    params.genre === 'Myth Busting' ||
    params.genre === 'Psychology' ||
    params.genre === 'Tech & AI' ||
    params.genre === 'Business & Finance' ||
    params.writingStyle === 'Mind-Blowing Science' ||
    params.writingStyle === 'Deep Knowledge Explainer' ||
    params.writingStyle === 'Rapid Myth-Buster' ||
    /\b(space|science|physics|brain|neuron|quantum|psychology|trick|myth|reality|secret|finance|money|invest|study|research|how|why)\b|विज्ञान|दिमाग|पैसा|कैसे|रिसर्च|सच/.test(
      text
    );

  if (
    params.format === 'Educational' ||
    params.backgroundStyle === 'Cosmic & Science Lab' ||
    hasExplainerSignals
  ) {
    return 'visual_explainer';
  }

  if (
    params.format === 'Storytelling' ||
    params.genre === 'Storytelling' ||
    params.genre === 'History & Facts' ||
    params.writingStyle === 'Cinematic Storytelling' ||
    /\b(history|ancient|empire|story|journey|night|memory)\b|इतिहास|कहानी|सफर/.test(text)
  ) {
    return 'story_cinema';
  }

  return 'creator_reel';
}

function inferMoodFromText(
  text: string,
  backgroundStyle?: string,
  genre?: ScriptGenre | string
): ThemeMood {
  if (backgroundStyle === 'Cosmic & Science Lab') return 'cosmic_space';
  if (backgroundStyle === 'Warm Comedy Stage') return 'comedy_office';
  if (genre === 'Comedy') return 'comedy_office';
  if (genre === 'Business & Finance') return 'finance_business';
  if (genre === 'History & Facts') return 'history_world';
  if (genre === 'Psychology') return 'mind_psychology';
  if (genre === 'Science' || genre === 'Tech & AI') return 'science_tech';

  const t = text.toLowerCase();
  if (/\b(space|cosmos|planet|star|astronaut|galaxy|moon|gravity|nasa)\b|अंतरिक्ष|तारे|चांद|गुरुत्वाकर्षण/.test(t)) {
    return 'cosmic_space';
  }
  if (/\b(science|lab|brain|neuron|atom|quantum|physics|chemistry|biology|dna|robot|ai|tech|algorithm)\b|विज्ञान|दिमाग|तकनीक/.test(t)) {
    return 'science_tech';
  }
  if (/\b(comedy|funny|laugh|skit|meme|joke|office|manager|boss|sync|meeting|monday|coffee|traffic|relatable)\b|हंसी|कॉमेडी|बॉस|ऑफिस|मज़ाक/.test(t)) {
    return 'comedy_office';
  }
  if (/\b(money|finance|stock|market|wealth|invest|startup|business|economy|rupee)\b|पैसा|निवेश|बिज़नेस/.test(t)) {
    return 'finance_business';
  }
  if (/\b(psychology|mind|habit|mirror|airport|wait|focus|sleep|dream|emotion)\b|मनोविज्ञान|दिमाग|आदत|नींद/.test(t)) {
    return 'mind_psychology';
  }
  if (/\b(history|ancient|empire|war|city|monument|india|heritage)\b|इतिहास|प्राचीन|शहर/.test(t)) {
    return 'history_world';
  }
  if (/\b(earth|ocean|forest|nature|climate|mountain|water|animal)\b|प्रकृति|समुद्र|पृथ्वी/.test(t)) {
    return 'nature_earth';
  }
  return 'studio_editorial';
}

async function encodeImageFileForGemini(diskPath?: string): Promise<{ mimeType: string; data: string } | null> {
  if (!diskPath) return null;
  try {
    const st = await fs.stat(diskPath);
    if (!st.isFile() || st.size === 0 || st.size > 4_000_000) return null;
    const ext = path.extname(diskPath).toLowerCase();
    const mimeType =
      ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const buf = await fs.readFile(diskPath);
    return { mimeType, data: buf.toString('base64') };
  } catch {
    return null;
  }
}

interface VisionStage1Decision {
  promptTemplateId: string;
  headline: string;
  searchQuery: string;
  calloutText: string;
  subBadge: string;
  isPunchline: boolean;
  visionRationale: string;
}

async function analyzeScriptAndSelectPromptLibraryViaGeminiVision(params: {
  title: string;
  cues: string[];
  language?: TwinLanguage;
  format?: VideoFormatType | string;
  genre?: ScriptGenre | string;
  writingStyle?: WritingStyleMode | string;
  emotion?: string;
  backgroundStyle?: string;
  prodStyle: ResolvedProductionStyle;
  presenterLabel: string;
  presenterImagePath?: string;
  beatTemplateOverrides?: Record<number, string>;
}): Promise<VisionStage1Decision[] | null> {
  const ai = getGeminiClient();
  if (!ai) return null;

  try {
    const libraryIndexText = VISUAL_PROMPT_LIBRARY.map(
      (t) =>
        `- id="${t.id}" | name="${t.name}" | category="${t.category}" | motion="${t.motionGraphicPreset}" | camera="${t.cameraMotion}" | style="${t.productionStyle}" | desc="${t.directorPrompt}"`
    ).join('\n');

    const overrideNotes = Object.entries(params.beatTemplateOverrides || {})
      .filter(([, tplId]) => Boolean(getPromptTemplateById(tplId)))
      .map(([idx, tplId]) => `Beat ${Number(idx) + 1} MUST use promptTemplateId="${tplId}"`)
      .join('; ');

    const promptText = `You are a Multimodal Film & Motion-Graphic Vision Director.
Inspect BOTH the attached presenter portrait (if present) AND the full script context/metadata below, then select the best matching visual asset template from our Structured Prompt-Library for each of the 6 chronological beats.

SCRIPT METADATA:
- Title: "${params.title}"
- Language: "${params.language || 'Hinglish'}"
- Genre: "${params.genre || 'Auto'}"
- Writing Style: "${params.writingStyle || 'Auto'}"
- Video Format: "${params.format || 'Talking-Head'}"
- Intended Emotion: "${params.emotion || 'Conversational'}"
- Production Style: "${params.prodStyle}"
- Background Engine: "${params.backgroundStyle || 'Auto-Match Script Theme'}"
- Active Presenter: "${params.presenterLabel}"
${overrideNotes ? `- Creator Manual Overrides (Respect Strictly): ${overrideNotes}\n` : ''}
STRUCTURED PROMPT-LIBRARY CATALOG (Pick exact "id" values from here):
${libraryIndexText}

For each of the 6 spoken beats below, output:
1. promptTemplateId: Exact "id" from the Prompt-Library matching the beat's action, tone, and the presenter portrait's lighting/vibe.
2. headline: Crisp 2-4 word scene title (English or punchy Hinglish).
3. searchQuery: 3-4 concrete English nouns describing a moving clip or relatable human action matching the selected prompt template (avoid plain empty buildings).
4. calloutText: Bold 2-6 word motion-graphic pop-up text illustrating that exact spoken line.
5. subBadge: Tiny 2-3 word label above the callout card.
6. isPunchline: boolean true if that beat is a comedic punchline, reveal, or emotional turn.
7. visionRationale: Short 6-12 word note explaining why this prompt-library asset fits the script metadata and presenter appearance.

SPOKEN BEATS:
${params.cues.map((c, i) => `Beat ${i + 1}: "${c}"`).join('\n')}`;

    const parts: Array<any> = [];
    const portraitPart = await encodeImageFileForGemini(params.presenterImagePath);
    if (portraitPart) {
      parts.push({ inlineData: portraitPart });
    }
    parts.push({ text: promptText });

    const resp = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                promptTemplateId: { type: Type.STRING },
                headline: { type: Type.STRING },
                searchQuery: { type: Type.STRING },
                calloutText: { type: Type.STRING },
                subBadge: { type: Type.STRING },
                isPunchline: { type: Type.BOOLEAN },
                visionRationale: { type: Type.STRING },
              },
              required: [
                'promptTemplateId',
                'headline',
                'searchQuery',
                'calloutText',
                'subBadge',
                'isPunchline',
                'visionRationale',
              ],
            },
          },
        },
      }),
      9500,
      'Gemini Vision Stage 1 timeout'
    );

    const parsed = JSON.parse((resp.text ?? '[]').trim());
    if (Array.isArray(parsed) && parsed.length >= 6) {
      return parsed.slice(0, 6).map((item, idx) => {
        const overrideId = params.beatTemplateOverrides?.[idx];
        const validTpl =
          getPromptTemplateById(overrideId) ||
          getPromptTemplateById(item.promptTemplateId) ||
          VISUAL_PROMPT_LIBRARY[idx % VISUAL_PROMPT_LIBRARY.length];
        return {
          promptTemplateId: validTpl.id,
          headline: String(item.headline || validTpl.name).slice(0, 42),
          searchQuery: String(item.searchQuery || validTpl.clipKeywords[0]).slice(0, 80),
          calloutText: String(item.calloutText || validTpl.sampleCallout).slice(0, 46),
          subBadge: String(item.subBadge || validTpl.sampleSubBadge).slice(0, 26),
          isPunchline: Boolean(item.isPunchline),
          visionRationale: String(
            item.visionRationale || `Matched ${validTpl.name} to ${params.prodStyle} & presenter tone`
          ).slice(0, 96),
        };
      });
    }
  } catch {
    // Cleanly fall back to deterministic metadata + prompt-library selector
  }
  return null;
}

interface CandidateAsset {
  url: string;
  isAnimatedGif: boolean;
}

async function fetchOpenverseCandidates(query: string): Promise<CandidateAsset[]> {
  const out: CandidateAsset[] = [];
  try {
    const ovUrl = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(
      query
    )}&page_size=6&mature=false`;
    const r = await fetch(ovUrl, {
      headers: { 'User-Agent': 'TwinForgeStudio/1.0 (visual-director)' },
      signal: AbortSignal.timeout(3000),
    });
    if (r.ok) {
      const data = await r.json();
      const items = Array.isArray(data?.results) ? data.results : [];
      for (const item of items) {
        if ((item.width && item.width < 420) || (item.height && item.height < 280)) continue;
        if (typeof item.url === 'string' && /\.gif(\?|$)/i.test(item.url)) {
          out.push({ url: item.url, isAnimatedGif: true });
        } else if (typeof item.url === 'string' && /\.(jpe?g|png)(\?|$)/i.test(item.url)) {
          out.push({ url: item.url, isAnimatedGif: false });
        } else if (typeof item.thumbnail === 'string' && item.thumbnail.startsWith('http')) {
          out.push({ url: item.thumbnail, isAnimatedGif: false });
        }
      }
    }
  } catch {
    // ignore timeout
  }
  return out;
}

async function fetchWikimediaCommonsCandidates(query: string): Promise<CandidateAsset[]> {
  const out: CandidateAsset[] = [];
  try {
    const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
      `${query} filetype:bitmap`
    )}&gsrlimit=6&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=1000&format=json`;
    const r = await fetch(commonsUrl, {
      headers: { 'User-Agent': 'TwinForgeStudio/1.0 (visual-director)' },
      signal: AbortSignal.timeout(3000),
    });
    if (r.ok) {
      const data = await r.json();
      const pages = Object.values(data?.query?.pages || {}) as Array<any>;
      for (const p of pages) {
        const info = p?.imageinfo?.[0];
        if (!info) continue;
        if (info.mime === 'image/gif' && info.url && (info.size || 0) < 4_500_000) {
          out.push({ url: info.url, isAnimatedGif: true });
        } else if (
          (info.mime === 'image/jpeg' || info.mime === 'image/png') &&
          (info.width || 0) >= 480
        ) {
          const src = info.thumburl || info.url;
          if (src) out.push({ url: src, isAnimatedGif: false });
        }
      }
    }
  } catch {
    // ignore
  }
  return out;
}

async function fetchWikipediaCandidates(query: string): Promise<CandidateAsset[]> {
  const out: CandidateAsset[] = [];
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      query
    )}&gsrlimit=4&prop=pageimages&piprop=thumbnail|original&pithumbsize=1000&format=json&origin=*`;
    const r = await fetch(wikiUrl, {
      headers: { 'User-Agent': 'TwinForgeStudio/1.0 (visual-director)' },
      signal: AbortSignal.timeout(3000),
    });
    if (r.ok) {
      const data = await r.json();
      const pages = Object.values(data?.query?.pages || {}) as Array<any>;
      for (const p of pages) {
        const src: string | undefined = p?.thumbnail?.source || p?.original?.source;
        if (src && /\.(jpe?g|png|gif)(\?|$)/i.test(src)) {
          out.push({ url: src, isAnimatedGif: /\.gif(\?|$)/i.test(src) });
        }
      }
    }
  } catch {
    // ignore
  }
  return out;
}

async function fetchTopicMediaCandidates(
  query: string,
  mood: ThemeMood
): Promise<CandidateAsset[]> {
  const preferLifestyleFirst =
    mood === 'comedy_office' ||
    mood === 'mind_psychology' ||
    mood === 'finance_business' ||
    mood === 'studio_editorial';

  const [openverse, commons, wiki] = await Promise.all([
    fetchOpenverseCandidates(query),
    fetchWikimediaCommonsCandidates(query),
    fetchWikipediaCandidates(query),
  ]);

  const results = preferLifestyleFirst
    ? [...openverse, ...commons, ...wiki]
    : [...commons, ...wiki, ...openverse];

  const seen = new Set<string>();
  return results.filter((c) => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
}

interface DownloadedMediaBuffer {
  url: string;
  ext: '.jpg' | '.png' | '.gif';
  mimeType: string;
  buf: Buffer;
  isAnimatedGif: boolean;
}

async function downloadCandidateBuffer(cand: CandidateAsset): Promise<DownloadedMediaBuffer | null> {
  try {
    const resp = await fetch(cand.url, {
      headers: { 'User-Agent': 'TwinForgeStudio/1.0' },
      signal: AbortSignal.timeout(3500),
    });
    if (!resp.ok) return null;
    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    const isGif = ct.includes('image/gif') || cand.isAnimatedGif;
    const isPng = ct.includes('image/png');
    const isJpeg = ct.includes('image/jpeg') || ct.includes('image/jpg');
    if (!isGif && !isPng && !isJpeg) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < 8000 || buf.length > 5_000_000) return null;
    return {
      url: cand.url,
      ext: isGif ? '.gif' : isPng ? '.png' : '.jpg',
      mimeType: isGif ? 'image/gif' : isPng ? 'image/png' : 'image/jpeg',
      buf,
      isAnimatedGif: isGif,
    };
  } catch {
    return null;
  }
}

async function persistDownloadedMedia(
  item: DownloadedMediaBuffer,
  cacheKey: string,
  mood: ThemeMood
): Promise<{ localPath: string; publicUrl: string; mediaKind: 'animated_clip' | 'curated_frame' }> {
  await fs.mkdir(SCENE_CACHE_DIR, { recursive: true });
  const hash = crypto.createHash('sha1').update(cacheKey).digest('hex').slice(0, 14);
  const filename = `scene_${mood}_${hash}${item.ext}`;
  const destPath = path.join(SCENE_CACHE_DIR, filename);
  await fs.writeFile(destPath, item.buf);
  return {
    localPath: destPath,
    publicUrl: `/api/media/scenes/${filename}`,
    mediaKind: item.isAnimatedGif ? 'animated_clip' : 'curated_frame',
  };
}

/**
 * Gemini Vision Pass 2: Visually inspect fetched candidate scene images/GIFs
 * alongside the presenter portrait & script cue to pick the strongest visual fit.
 */
async function selectBestCandidateViaGeminiVision(params: {
  candidates: DownloadedMediaBuffer[];
  spokenCue: string;
  template: VisualPromptTemplate;
  presenterImagePath?: string;
}): Promise<{ chosen: DownloadedMediaBuffer; visionNote?: string }> {
  if (params.candidates.length === 0) {
    throw new Error('No candidate media provided.');
  }
  if (params.candidates.length === 1) {
    return { chosen: params.candidates[0] };
  }

  const ai = getGeminiClient();
  if (!ai) {
    const gifFirst = params.candidates.find((c) => c.isAnimatedGif) || params.candidates[0];
    return { chosen: gifFirst };
  }

  try {
    const parts: Array<any> = [];
    const portraitPart = await encodeImageFileForGemini(params.presenterImagePath);
    if (portraitPart) {
      parts.push({ text: 'Reference Presenter Portrait (match lighting, warmth, and editorial clarity):' });
      parts.push({ inlineData: portraitPart });
    }

    // Pass static JPG/PNG frames via inlineData and note animated GIF clips by metadata
    params.candidates.forEach((cand, idx) => {
      if (cand.isAnimatedGif || cand.mimeType === 'image/gif') {
        const clipName = decodeURIComponent(cand.url.split('/').pop()?.split('?')[0] || 'animated_clip.gif');
        parts.push({ text: `Candidate ${idx} (Animated GIF Motion Clip): "${clipName}"` });
      } else {
        parts.push({ text: `Candidate ${idx} (Visual Frame):` });
        parts.push({
          inlineData: {
            mimeType: cand.mimeType,
            data: cand.buf.toString('base64'),
          },
        });
      }
    });

    parts.push({
      text: `You are inspecting ${params.candidates.length} candidate visual assets for this video beat.
Spoken Script Cue: "${params.spokenCue}"
Selected Prompt-Library Template: "${params.template.name}" (${params.template.directorPrompt})

Pick the single best candidate index (0 to ${params.candidates.length - 1}) that:
1. Best illustrates the spoken cue and template mood with clear, expressive framing.
2. Avoids heavy watermarks, tiny pixelated scans, or dull text screenshots.
3. Harmonizes well visually with the Reference Presenter Portrait (if provided).

Return JSON { "bestIndex": integer, "visionNote": "short 5-10 word visual reason" }.`,
    });

    const resp = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              bestIndex: { type: Type.INTEGER },
              visionNote: { type: Type.STRING },
            },
            required: ['bestIndex', 'visionNote'],
          },
        },
      }),
      6500,
      'Gemini Vision Stage 2 timeout'
    );

    const parsed = JSON.parse((resp.text ?? '{}').trim());
    const idx = Number(parsed.bestIndex);
    if (Number.isInteger(idx) && idx >= 0 && idx < params.candidates.length) {
      return {
        chosen: params.candidates[idx],
        visionNote: parsed.visionNote ? String(parsed.visionNote).slice(0, 96) : undefined,
      };
    }
  } catch {
    // Graceful deterministic selection
  }

  return {
    chosen: params.candidates.find((c) => c.isAnimatedGif) || params.candidates[0],
  };
}

export interface ResolvedPresenterInfo {
  presenterModeResolved: PresenterVisualMode;
  presenterLabel: string;
  presenterImageUrls: string[];
  presenterDiskPaths: string[];
}

export async function resolvePresenterSelection(params: {
  presenterMode?: PresenterVisualMode;
  voiceIdentity?: string;
  title?: string;
  scriptText?: string;
  genre?: ScriptGenre | string;
  mode: WorkspaceMode;
  twinFaceImageAssets: Array<{ id: string; url: string; diskPath?: string }>;
  preferredPortraitId?: string;
}): Promise<ResolvedPresenterInfo> {
  const requestedMode: PresenterVisualMode = params.presenterMode || 'auto_match';

  if (requestedMode === 'faceless_broll') {
    return {
      presenterModeResolved: 'faceless_broll',
      presenterLabel: 'Visual Documentary Only (Dynamic Motion Scenes, No Face)',
      presenterImageUrls: [],
      presenterDiskPaths: [],
    };
  }

  const castFiles = {
    cast_ananya: {
      url: '/cast/ananya_warm.jpg',
      disk: path.join(PUBLIC_CAST_DIR, 'ananya_warm.jpg'),
      label: 'Ananya · Warm Hindi Storyteller',
    },
    cast_meera: {
      url: '/cast/meera_science.jpg',
      disk: path.join(PUBLIC_CAST_DIR, 'meera_science.jpg'),
      label: 'Meera · Science & Tech Educator',
    },
    cast_kabir: {
      url: '/cast/kabir_storyteller.jpg',
      disk: path.join(PUBLIC_CAST_DIR, 'kabir_storyteller.jpg'),
      label: 'Kabir · Comedy & Story Host',
    },
  };

  if (
    requestedMode === 'cast_ananya' ||
    requestedMode === 'cast_meera' ||
    requestedMode === 'cast_kabir'
  ) {
    const chosen = castFiles[requestedMode];
    try {
      await fs.access(chosen.disk);
      return {
        presenterModeResolved: requestedMode,
        presenterLabel: chosen.label,
        presenterImageUrls: [chosen.url],
        presenterDiskPaths: [chosen.disk],
      };
    } catch {
      // fall through
    }
  }

  if (requestedMode === 'twin_owner' && params.twinFaceImageAssets.length > 0) {
    const preferred =
      params.twinFaceImageAssets.find((a) => a.id === params.preferredPortraitId) ||
      params.twinFaceImageAssets[0];
    const ordered = [
      preferred,
      ...params.twinFaceImageAssets.filter((a) => a.id !== preferred.id),
    ];
    return {
      presenterModeResolved: 'twin_owner',
      presenterLabel: 'My Uploaded Twin Portrait',
      presenterImageUrls: ordered.map((a) => a.url),
      presenterDiskPaths: ordered.map((a) => a.diskPath).filter((x): x is string => Boolean(x)),
    };
  }

  const voiceLower = (params.voiceIdentity || '').toLowerCase();
  const isFemaleVoice = FEMALE_VOICE_HINTS.some((h) => voiceLower.includes(h));
  const mood = inferMoodFromText(
    `${params.title || ''} ${params.scriptText || ''}`,
    undefined,
    params.genre
  );

  if (isFemaleVoice) {
    const femaleKey =
      mood === 'science_tech' || mood === 'cosmic_space' || mood === 'finance_business'
        ? 'cast_meera'
        : 'cast_ananya';
    const chosen = castFiles[femaleKey];
    try {
      await fs.access(chosen.disk);
      return {
        presenterModeResolved: femaleKey,
        presenterLabel: `${chosen.label} (Matched to Female Voice)`,
        presenterImageUrls: [chosen.url],
        presenterDiskPaths: [chosen.disk],
      };
    } catch {
      // fall back
    }
  }

  const isLiveCustomPortrait =
    params.mode === 'live' && params.twinFaceImageAssets.length > 0;
  if (isLiveCustomPortrait) {
    const preferred =
      params.twinFaceImageAssets.find((a) => a.id === params.preferredPortraitId) ||
      params.twinFaceImageAssets[0];
    const ordered = [
      preferred,
      ...params.twinFaceImageAssets.filter((a) => a.id !== preferred.id),
    ];
    return {
      presenterModeResolved: 'twin_owner',
      presenterLabel: 'Your Uploaded Twin Portrait (Matched to Male Voice)',
      presenterImageUrls: ordered.map((a) => a.url),
      presenterDiskPaths: ordered.map((a) => a.diskPath).filter((x): x is string => Boolean(x)),
    };
  }

  if (mood !== 'studio_editorial') {
    const chosen = castFiles.cast_kabir;
    try {
      await fs.access(chosen.disk);
      return {
        presenterModeResolved: 'cast_kabir',
        presenterLabel: `${chosen.label} (Matched to Script & Male Voice)`,
        presenterImageUrls: [chosen.url],
        presenterDiskPaths: [chosen.disk],
      };
    } catch {
      // ignore
    }
  }

  const orderedFallback = params.twinFaceImageAssets;
  return {
    presenterModeResolved: 'twin_owner',
    presenterLabel: 'Studio Editorial Presenter',
    presenterImageUrls: orderedFallback.map((a) => a.url),
    presenterDiskPaths: orderedFallback.map((a) => a.diskPath).filter((x): x is string => Boolean(x)),
  };
}

export async function planAndFetchScriptVisuals(params: {
  title: string;
  scriptText: string;
  language?: TwinLanguage;
  format?: VideoFormatType | string;
  genre?: ScriptGenre | string;
  writingStyle?: WritingStyleMode | string;
  emotion?: string;
  backgroundStyle?: string;
  presenterMode?: PresenterVisualMode;
  productionStyle?: ProductionStyle;
  voiceIdentity?: string;
  mode: WorkspaceMode;
  twinFaceImageAssets: Array<{ id: string; url: string; diskPath?: string }>;
  preferredPortraitId?: string;
  beatTemplateOverrides?: Record<number, string>;
}): Promise<PlanVisualsResult> {
  const cacheKey = crypto
    .createHash('sha1')
    .update(
      JSON.stringify({
        m: params.mode,
        t: params.title,
        s: params.scriptText,
        l: params.language,
        f: params.format,
        g: params.genre,
        w: params.writingStyle,
        e: params.emotion,
        b: params.backgroundStyle,
        pm: params.presenterMode,
        ps: params.productionStyle,
        v: params.voiceIdentity,
        pid: params.preferredPortraitId,
        ov: params.beatTemplateOverrides || {},
      })
    )
    .digest('hex');

  const cachedEntry = RECENT_PLANS_CACHE.get(cacheKey);
  if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
    return cachedEntry.value;
  }

  const cues = splitScriptInto6Cues(params.title, params.scriptText);
  const prodStyleResolved = resolveProductionStyle({
    productionStyle: params.productionStyle,
    format: params.format,
    genre: params.genre,
    writingStyle: params.writingStyle,
    backgroundStyle: params.backgroundStyle,
    title: params.title,
    scriptText: params.scriptText,
  });

  // Resolve active presenter FIRST so Gemini Vision Pass 1 & Pass 2 can inspect the portrait!
  const presenter = await resolvePresenterSelection({
    presenterMode: params.presenterMode,
    voiceIdentity: params.voiceIdentity,
    title: params.title,
    scriptText: params.scriptText,
    genre: params.genre,
    mode: params.mode,
    twinFaceImageAssets: params.twinFaceImageAssets,
    preferredPortraitId: params.preferredPortraitId,
  });

  const presenterImagePath = presenter.presenterDiskPaths[0];
  const overallMood = inferMoodFromText(
    `${params.title} ${params.scriptText}`,
    params.backgroundStyle,
    params.genre
  );

  // Stage 1: Gemini Vision inspects script context, metadata & presenter portrait to pick Prompt-Library presets
  const visionPlan = await analyzeScriptAndSelectPromptLibraryViaGeminiVision({
    title: params.title,
    cues,
    language: params.language,
    format: params.format,
    genre: params.genre,
    writingStyle: params.writingStyle,
    emotion: params.emotion,
    backgroundStyle: params.backgroundStyle,
    prodStyle: prodStyleResolved,
    presenterLabel: presenter.presenterLabel,
    presenterImagePath,
    beatTemplateOverrides: params.beatTemplateOverrides,
  });

  const fallbackTemplates = selectFallbackTemplatesForScript(overallMood, prodStyleResolved);

  const rawBeats: SceneVisualBeat[] = cues.map((cue, idx) => {
    const overrideTpl = getPromptTemplateById(params.beatTemplateOverrides?.[idx]);
    const decision = visionPlan?.[idx];
    const tpl =
      overrideTpl ||
      getPromptTemplateById(decision?.promptTemplateId) ||
      fallbackTemplates[idx % fallbackTemplates.length];

    const beatMood = tpl.themeMood || overallMood;
    const palette = MOOD_PALETTES[beatMood] || MOOD_PALETTES.studio_editorial;
    const [startPct, endPct] = CUT_RANGES[idx];

    return {
      beatIndex: idx,
      startPct,
      endPct,
      headline: overrideTpl ? overrideTpl.name.toUpperCase() : decision?.headline || tpl.name.toUpperCase(),
      spokenCue: cue.slice(0, 140),
      searchQuery: overrideTpl
        ? overrideTpl.clipKeywords[idx % overrideTpl.clipKeywords.length]
        : decision?.searchQuery || tpl.clipKeywords[idx % tpl.clipKeywords.length],
      themeMood: beatMood,
      bgHex: palette.bgHex,
      accentHex: tpl.colorAccent || palette.accentHex,
      visualCardType: tpl.visualCardType,
      calloutText: overrideTpl ? overrideTpl.sampleCallout : decision?.calloutText || tpl.sampleCallout,
      subBadge: overrideTpl ? overrideTpl.sampleSubBadge : decision?.subBadge || tpl.sampleSubBadge,
      isPunchline:
        overrideTpl
          ? overrideTpl.cameraMotion === 'punch_zoom'
          : decision?.isPunchline ?? (idx === 1 || idx === 3 || idx === 5),
      promptTemplateId: tpl.id,
      promptTemplateName: tpl.name,
      motionGraphicPreset: tpl.motionGraphicPreset,
      cameraMotion: tpl.cameraMotion,
      visionRationale: overrideTpl
        ? `Manual override: ${overrideTpl.name}`
        : decision?.visionRationale || `${tpl.name} · matched to ${prodStyleResolved.replace('_', ' ')}`,
      mediaKind: 'motion_graphic',
    };
  });

  // Fetch candidate media & run Gemini Vision Pass 2 candidate scoring concurrently across beats
  const usedUrls = new Set<string>();
  const resolvedDiskPaths: Array<string | undefined> = Array(6).fill(undefined);

  await Promise.all(
    rawBeats.map(async (beat, idx) => {
      const tpl =
        getPromptTemplateById(beat.promptTemplateId) || fallbackTemplates[idx % fallbackTemplates.length];

      const primary = await fetchTopicMediaCandidates(beat.searchQuery, beat.themeMood);
      const secondary =
        primary.length < 3
          ? await fetchTopicMediaCandidates(
              tpl.clipKeywords[(idx + 1) % tpl.clipKeywords.length],
              beat.themeMood
            )
          : [];

      const pool = [...primary, ...secondary];
      const uniqueCands: CandidateAsset[] = [];
      for (const c of pool) {
        if (!usedUrls.has(c.url) && !uniqueCands.some((u) => u.url === c.url)) {
          uniqueCands.push(c);
        }
      }
      const ordered = uniqueCands.length > 0 ? uniqueCands : pool;

      // Download up to 3 top candidates to inspect visually via Gemini Vision Pass 2
      const downloaded = (
        await Promise.all(ordered.slice(0, 3).map((c) => downloadCandidateBuffer(c)))
      ).filter((x): x is DownloadedMediaBuffer => Boolean(x));

      if (downloaded.length > 0) {
        const picked = await selectBestCandidateViaGeminiVision({
          candidates: downloaded,
          spokenCue: beat.spokenCue,
          template: tpl,
          presenterImagePath,
        });
        usedUrls.add(picked.chosen.url);
        const cached = await persistDownloadedMedia(
          picked.chosen,
          `${beat.searchQuery}_${picked.chosen.url}`,
          beat.themeMood
        );
        beat.imageUrl = cached.publicUrl;
        beat.mediaKind = cached.mediaKind;
        resolvedDiskPaths[idx] = cached.localPath;
        if (picked.visionNote && !params.beatTemplateOverrides?.[idx]) {
          beat.visionRationale = picked.visionNote;
        }
      }
    })
  );

  // Backfill any beats without fetched network media using local mood-tagged cache
  const missingAny = rawBeats.some((b) => !b.imageUrl);
  if (missingAny) {
    try {
      const files = (await fs.readdir(SCENE_CACHE_DIR)).filter((f) => /\.(jpe?g|png|gif)$/i.test(f));
      if (files.length > 0) {
        const usedLocal = new Set(resolvedDiskPaths.filter(Boolean).map((p) => path.basename(p!)));
        rawBeats.forEach((beat, idx) => {
          if (!beat.imageUrl) {
            const moodPrefix = `scene_${beat.themeMood}_`;
            const moodMatch =
              files.find((f) => f.startsWith(moodPrefix) && !usedLocal.has(f)) ||
              files.find((f) => f.startsWith(moodPrefix)) ||
              files.find((f) => !usedLocal.has(f)) ||
              files[idx % files.length];
            if (moodMatch) {
              usedLocal.add(moodMatch);
              beat.imageUrl = `/api/media/scenes/${moodMatch}`;
              beat.mediaKind = /\.gif$/i.test(moodMatch) ? 'animated_clip' : 'curated_frame';
              resolvedDiskPaths[idx] = path.join(SCENE_CACHE_DIR, moodMatch);
            }
          }
        });
      }
    } catch {
      // ignore read errors
    }
  }

  // Final sibling copy guard if cache directory had fewer images
  const firstCachedIdx = rawBeats.findIndex((b) => Boolean(b.imageUrl));
  if (firstCachedIdx !== -1) {
    rawBeats.forEach((beat, idx) => {
      if (!beat.imageUrl) {
        const donor = rawBeats[(idx + firstCachedIdx + 1) % rawBeats.length];
        const donorDisk = resolvedDiskPaths[(idx + firstCachedIdx + 1) % rawBeats.length];
        if (donor.imageUrl) {
          beat.imageUrl = donor.imageUrl;
          beat.mediaKind = donor.mediaKind;
          resolvedDiskPaths[idx] = donorDisk;
        } else {
          beat.imageUrl = rawBeats[firstCachedIdx].imageUrl;
          beat.mediaKind = rawBeats[firstCachedIdx].mediaKind;
          resolvedDiskPaths[idx] = resolvedDiskPaths[firstCachedIdx];
        }
      }
    });
  }

  const result: PlanVisualsResult = {
    beats: rawBeats,
    beatDiskPaths: resolvedDiskPaths,
    presenter,
    productionStyleResolved: prodStyleResolved,
    visionAnalysisUsed: Boolean(visionPlan),
  };

  if (RECENT_PLANS_CACHE.size >= 12) {
    const oldestKey = RECENT_PLANS_CACHE.keys().next().value;
    if (oldestKey) RECENT_PLANS_CACHE.delete(oldestKey);
  }
  RECENT_PLANS_CACHE.set(cacheKey, { expiresAt: Date.now() + 90_000, value: result });

  return result;
}

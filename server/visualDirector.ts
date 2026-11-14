import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  PresenterVisualMode,
  SceneVisualBeat,
  TwinLanguage,
  WorkspaceMode,
} from '../src/types.ts';

export const SCENE_CACHE_DIR = path.resolve(process.cwd(), 'data', 'scene-cache');
const PUBLIC_CAST_DIR = path.resolve(process.cwd(), 'public', 'cast');

type ThemeMood = SceneVisualBeat['themeMood'];

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

function inferMoodFromText(text: string, backgroundStyle?: string): ThemeMood {
  if (backgroundStyle === 'Cosmic & Science Lab') return 'cosmic_space';
  if (backgroundStyle === 'Warm Comedy Stage') return 'comedy_office';

  const t = text.toLowerCase();
  if (/\b(space|cosmos|planet|star|astronaut|galaxy|moon|gravity|nasa)\b|अंतरिक्ष|तारे|चांद|गुरुत्वाकर्षण/.test(t)) {
    return 'cosmic_space';
  }
  if (/\b(science|lab|brain|neuron|atom|quantum|physics|chemistry|biology|dna|robot|ai|tech|algorithm)\b|विज्ञान|दिमाग|तकनीक/.test(t)) {
    return 'science_tech';
  }
  if (/\b(comedy|funny|laugh|office|manager|boss|sync|meeting|monday|coffee|meme|joke)\b|हंसी|कॉमेडी|बॉस|ऑफिस/.test(t)) {
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

function fallbackQueriesForMood(mood: ThemeMood, title: string): Array<{ query: string; headline: string }> {
  const cleanTitle = title.replace(/[^\w\s-]/g, ' ').trim();
  switch (mood) {
    case 'cosmic_space':
      return [
        { query: 'Earth seen from Apollo spacecraft', headline: '01 ZERO GRAVITY HOOK' },
        { query: 'International Space Station astronaut', headline: '02 LIFE IN ORBIT' },
        { query: 'Water droplet microgravity surface tension', headline: '03 SURFACE TENSION PHYSICS' },
        { query: 'Carina Nebula Hubble telescope', headline: '04 DEEP SPACE PERSPECTIVE' },
        { query: 'Astronaut helmet visor spacewalk', headline: '05 FLOATING IN SILENCE' },
        { query: 'Milky Way night sky observatory', headline: '06 COSMIC TAKEAWAY' },
      ];
    case 'science_tech':
      return [
        { query: 'Multipolar neuron brain fluorescence', headline: '01 THE HIDDEN SIGNAL' },
        { query: 'Physics laboratory optical experiment', headline: '02 HOW IT ACTUALLY WORKS' },
        { query: 'Microchip silicon wafer macro', headline: '03 INSIDE THE MECHANISM' },
        { query: 'Supercomputer server room technology', headline: '04 REAL-WORLD IMPACT' },
        { query: 'Scientist microscope research laboratory', headline: '05 PROVEN EVIDENCE' },
        { query: 'Solar eclipse science phenomenon', headline: '06 NEXT DISCOVERY' },
      ];
    case 'comedy_office':
      return [
        { query: 'Modern office meeting conference table', headline: '01 QUICK 5-MIN SYNC' },
        { query: 'Laptop coffee desk workspace', headline: '02 CALENDAR HIJACK' },
        { query: 'City commuter traffic rush hour', headline: '03 REALITY CHECK' },
        { query: 'Espresso coffee cup cafe table', headline: '04 LUNCH HOUR LOST' },
        { query: 'Corporate skyscraper glass building', headline: '05 CORPORATE SURVIVAL' },
        { query: 'Sunset city skyline evening', headline: '06 SIGN OFF ON TIME' },
      ];
    case 'finance_business':
      return [
        { query: 'Stock exchange trading floor chart', headline: '01 FOLLOW THE MONEY' },
        { query: 'City financial district skyscrapers', headline: '02 MARKET REALITY' },
        { query: 'Gold bullion bank reserve', headline: '03 COMPOUNDING VALUE' },
        { query: 'Startup team whiteboard strategy', headline: '04 SMART EXECUTION' },
        { query: 'Currency banknotes economics concept', headline: '05 RISK VS REWARD' },
        { query: 'Modern architecture bridge horizon', headline: '06 LONG-TERM PLAY' },
      ];
    case 'mind_psychology':
      return [
        { query: 'Airport baggage claim terminal', headline: '01 THE HIDDEN TRICK' },
        { query: 'Human eye iris macro photography', headline: '02 PERCEPTION SHIFT' },
        { query: 'Mirror reflection architecture glass', headline: '03 ATTENTION HACK' },
        { query: 'Library books reading calm light', headline: '04 THE REAL EXPERIMENT' },
        { query: 'Clockwork gears time mechanism', headline: '05 TIME PERCEPTION' },
        { query: 'Walking path morning sunlight', headline: '06 EVERYDAY TAKEAWAY' },
      ];
    case 'history_world':
      return [
        { query: 'Ancient stone temple architecture', headline: '01 UNTOLD ORIGIN' },
        { query: 'Antique world map compass', headline: '02 ACROSS CENTURIES' },
        { query: 'Taj Mahal sunrise architecture', headline: '03 LIVING HERITAGE' },
        { query: 'Ancient manuscript library archive', headline: '04 ARCHIVAL PROOF' },
        { query: 'Roman colosseum panoramic history', headline: '05 TIMELESS LESSON' },
        { query: 'Golden hour desert horizon', headline: '06 STILL RELEVANT TODAY' },
      ];
    case 'nature_earth':
      return [
        { query: 'Deep ocean wave blue water', headline: '01 PLANET WONDER' },
        { query: 'Amazon rainforest aerial canopy', headline: '02 LIVING ECOSYSTEM' },
        { query: 'Snowy mountain peak alpenglow', headline: '03 SCALE OF NATURE' },
        { query: 'Coral reef underwater sunlight', headline: '04 HIDDEN BALANCE' },
        { query: 'Aurora borealis night sky', headline: '05 NATURAL MAGIC' },
        { query: 'Earth horizon sunrise atmosphere', headline: '06 PROTECT OUR WORLD' },
      ];
    default:
      return [
        { query: cleanTitle.split(' ').slice(0, 3).join(' ') || 'Cinema camera studio lens', headline: '01 OPENING HOOK' },
        { query: 'Podcast microphone recording studio', headline: '02 THE REAL INSIGHT' },
        { query: 'Creative designer desk notebook', headline: '03 BREAKING IT DOWN' },
        { query: 'Modern city architecture light', headline: '04 REAL EXAMPLE' },
        { query: 'Film editing monitor timeline', headline: '05 WHY IT MATTERS' },
        { query: 'Warm sunlit studio portrait backdrop', headline: '06 FINAL TAKEAWAY' },
      ];
  }
}

async function generateStoryboardViaGemini(
  title: string,
  cues: string[],
  backgroundStyle?: string
): Promise<Array<{
  headline: string;
  searchQuery: string;
  themeMood: ThemeMood;
}> | null> {
  const ai = getGeminiClient();
  if (!ai) return null;

  try {
    const prompt = `You are a Visual Film Director creating 6 chronological visual B-roll scenes matching each beat of a voiceover script.
Video Title: "${title}"
Requested Background Preference: "${backgroundStyle || 'Auto-Match Script Theme'}"

For each of the 6 spoken script beats below, generate:
1. headline: concise 2-5 word visual caption/card header matching that beat (in English or crisp Hinglish)
2. searchQuery: 2-4 concrete English noun keywords that match real-world Wikipedia / Wikimedia photography (e.g., "astronaut space earth", "office laptop coffee", "human brain neuron", "airport baggage claim", "coral reef underwater"). Avoid abstract adjectives!
3. themeMood: one of cosmic_space, science_tech, comedy_office, finance_business, history_world, mind_psychology, nature_earth, studio_editorial.

Beats:
${cues.map((c, i) => `Beat ${i + 1}: "${c}"`).join('\n')}`;

    const resp = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING },
              searchQuery: { type: Type.STRING },
              themeMood: { type: Type.STRING },
            },
            required: ['headline', 'searchQuery', 'themeMood'],
          },
        },
      },
    });

    const parsed = JSON.parse((resp.text ?? '[]').trim());
    if (Array.isArray(parsed) && parsed.length >= 6) {
      return parsed.slice(0, 6).map((item) => {
        const mood = (Object.keys(MOOD_PALETTES).includes(item.themeMood)
          ? item.themeMood
          : inferMoodFromText(`${title} ${cues.join(' ')}`, backgroundStyle)) as ThemeMood;
        return {
          headline: String(item.headline || 'SCENE INSIGHT').slice(0, 42),
          searchQuery: String(item.searchQuery || title).slice(0, 80),
          themeMood: mood,
        };
      });
    }
  } catch {
    // Cleanly fall back to deterministic bilingual visual mapper
  }
  return null;
}

async function fetchTopicPhotoCandidates(query: string): Promise<string[]> {
  const results: string[] = [];
  const headers = { 'User-Agent': 'TwinForgeStudio/1.0 (visual-director)' };

  // 1. Wikipedia PageImages (fast, crisp encyclopedia photography)
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      query
    )}&gsrlimit=4&prop=pageimages&piprop=thumbnail|original&pithumbsize=1200&format=json&origin=*`;
    const r = await fetch(wikiUrl, { headers, signal: AbortSignal.timeout(4500) });
    if (r.ok) {
      const data = await r.json();
      const pages = Object.values(data?.query?.pages || {}) as Array<any>;
      for (const p of pages) {
        const src: string | undefined = p?.thumbnail?.source || p?.original?.source;
        if (src && /\.(jpe?g|png)(\?|$)/i.test(src)) {
          results.push(src);
        }
      }
    }
  } catch {
    // continue to Wikimedia Commons
  }

  // 2. Wikimedia Commons high-res bitmap search
  if (results.length < 2) {
    try {
      const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
        `${query} filetype:bitmap`
      )}&gsrlimit=5&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=1200&format=json`;
      const r = await fetch(commonsUrl, { headers, signal: AbortSignal.timeout(4500) });
      if (r.ok) {
        const data = await r.json();
        const pages = Object.values(data?.query?.pages || {}) as Array<any>;
        for (const p of pages) {
          const info = p?.imageinfo?.[0];
          if (
            info &&
            (info.mime === 'image/jpeg' || info.mime === 'image/png') &&
            (info.width || 0) >= 500
          ) {
            const src = info.thumburl || info.url;
            if (src) results.push(src);
          }
        }
      }
    } catch {
      // ignore timeout
    }
  }

  return Array.from(new Set(results));
}

async function cacheImageLocally(
  remoteUrl: string,
  cacheKey: string,
  mood: ThemeMood = 'studio_editorial'
): Promise<{ localPath: string; publicUrl: string } | null> {
  await fs.mkdir(SCENE_CACHE_DIR, { recursive: true });
  const hash = crypto.createHash('sha1').update(cacheKey).digest('hex').slice(0, 14);
  const ext = /\.png(\?|$)/i.test(remoteUrl) ? '.png' : '.jpg';
  const filename = `scene_${mood}_${hash}${ext}`;
  const destPath = path.join(SCENE_CACHE_DIR, filename);

  try {
    const st = await fs.stat(destPath);
    if (st.size > 8000) {
      return { localPath: destPath, publicUrl: `/api/media/scenes/${filename}` };
    }
  } catch {
    // cache miss
  }

  try {
    const resp = await fetch(remoteUrl, {
      headers: { 'User-Agent': 'TwinForgeStudio/1.0' },
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) return null;
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('image/jpeg') && !ct.includes('image/png') && !ct.includes('image/webp')) {
      return null;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < 8000) return null;
    await fs.writeFile(destPath, buf);
    return { localPath: destPath, publicUrl: `/api/media/scenes/${filename}` };
  } catch {
    return null;
  }
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
  mode: WorkspaceMode;
  twinFaceImageAssets: Array<{ id: string; url: string; diskPath?: string }>;
  preferredPortraitId?: string;
}): Promise<ResolvedPresenterInfo> {
  const requestedMode: PresenterVisualMode = params.presenterMode || 'auto_match';

  if (requestedMode === 'faceless_broll') {
    return {
      presenterModeResolved: 'faceless_broll',
      presenterLabel: 'Visual Documentary Only (Script B-Roll, No Same Face)',
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

  // auto_match: Vary presenter smartly by Voice Gender + Script Topic (and use User's own Live uploads if explicitly uploaded!)
  const voiceLower = (params.voiceIdentity || '').toLowerCase();
  const isFemaleVoice = FEMALE_VOICE_HINTS.some((h) => voiceLower.includes(h));
  const mood = inferMoodFromText(`${params.title || ''} ${params.scriptText || ''}`);

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

  // For Male voices: in Live workspace with real user-uploaded portraits, prioritize user's twin if editorial/founder,
  // otherwise vary presenter between Kabir (comedy/science/storytelling) and Creator Twin so Demo videos never all look identical!
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

  // In Demo Mode with Male voice: use Kabir for comedy/science/nature/space/history stories, or Twin for founder/editorial
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
  backgroundStyle?: string;
  presenterMode?: PresenterVisualMode;
  voiceIdentity?: string;
  mode: WorkspaceMode;
  twinFaceImageAssets: Array<{ id: string; url: string; diskPath?: string }>;
  preferredPortraitId?: string;
}): Promise<{
  beats: SceneVisualBeat[];
  beatDiskPaths: Array<string | undefined>;
  presenter: ResolvedPresenterInfo;
}> {
  const cues = splitScriptInto6Cues(params.title, params.scriptText);
  const overallMood = inferMoodFromText(
    `${params.title} ${params.scriptText}`,
    params.backgroundStyle
  );

  const geminiPlan = await generateStoryboardViaGemini(
    params.title,
    cues,
    params.backgroundStyle
  );
  const fallbackSpecs = fallbackQueriesForMood(overallMood, params.title);

  const rawBeats = cues.map((cue, idx) => {
    const spec = geminiPlan?.[idx] || {
      headline: fallbackSpecs[idx].headline,
      searchQuery: fallbackSpecs[idx].query,
      themeMood: overallMood,
    };
    const palette = MOOD_PALETTES[spec.themeMood] || MOOD_PALETTES.studio_editorial;
    const [startPct, endPct] = CUT_RANGES[idx];
    return {
      beatIndex: idx,
      startPct,
      endPct,
      headline: spec.headline,
      spokenCue: cue.slice(0, 140),
      searchQuery: spec.searchQuery,
      themeMood: spec.themeMood,
      bgHex: palette.bgHex,
      accentHex: palette.accentHex,
    };
  });

  // Fetch & cache unique topic-matched photographs reliably across all 6 beats
  const usedUrls = new Set<string>();
  const resolvedDiskPaths: Array<string | undefined> = Array(6).fill(undefined);

  await Promise.all(
    rawBeats.map(async (beat, idx) => {
      const primary = await fetchTopicPhotoCandidates(beat.searchQuery);
      const fallback =
        primary.length < 3 ? await fetchTopicPhotoCandidates(fallbackSpecs[idx].query) : [];
      const pool = Array.from(new Set([...primary, ...fallback]));

      const orderedCandidates = [
        ...pool.filter((u) => !usedUrls.has(u)),
        ...pool.filter((u) => usedUrls.has(u)),
      ];

      for (const cand of orderedCandidates.slice(0, 4)) {
        usedUrls.add(cand);
        const cached = await cacheImageLocally(cand, `${beat.searchQuery}_${cand}`, beat.themeMood);
        if (cached) {
          (beat as SceneVisualBeat).imageUrl = cached.publicUrl;
          resolvedDiskPaths[idx] = cached.localPath;
          break;
        }
      }
    })
  );

  // Backfill any remaining beats from local mood-tagged cache (immune to Wikimedia 429 rate limits)
  const missingAny = rawBeats.some((b) => !(b as SceneVisualBeat).imageUrl);
  if (missingAny) {
    try {
      const files = (await fs.readdir(SCENE_CACHE_DIR)).filter((f) => /\.(jpe?g|png)$/i.test(f));
      if (files.length > 0) {
        const usedLocal = new Set(resolvedDiskPaths.filter(Boolean).map((p) => path.basename(p!)));
        rawBeats.forEach((beat, idx) => {
          if (!(beat as SceneVisualBeat).imageUrl) {
            const moodPrefix = `scene_${beat.themeMood}_`;
            const moodMatch =
              files.find((f) => f.startsWith(moodPrefix) && !usedLocal.has(f)) ||
              files.find((f) => f.startsWith(moodPrefix)) ||
              files.find((f) => !usedLocal.has(f)) ||
              files[idx % files.length];
            if (moodMatch) {
              usedLocal.add(moodMatch);
              (beat as SceneVisualBeat).imageUrl = `/api/media/scenes/${moodMatch}`;
              resolvedDiskPaths[idx] = path.join(SCENE_CACHE_DIR, moodMatch);
            }
          }
        });
      }
    } catch {
      // ignore read errors
    }
  }

  // Final sibling copy guard if any single beat still lacks an image
  const firstCachedIdx = rawBeats.findIndex((b) => Boolean((b as SceneVisualBeat).imageUrl));
  if (firstCachedIdx !== -1) {
    rawBeats.forEach((beat, idx) => {
      if (!(beat as SceneVisualBeat).imageUrl) {
        const donor = rawBeats[(idx + firstCachedIdx + 1) % rawBeats.length] as SceneVisualBeat;
        const donorDisk = resolvedDiskPaths[(idx + firstCachedIdx + 1) % rawBeats.length];
        if (donor.imageUrl) {
          (beat as SceneVisualBeat).imageUrl = donor.imageUrl;
          resolvedDiskPaths[idx] = donorDisk;
        } else {
          (beat as SceneVisualBeat).imageUrl = (rawBeats[firstCachedIdx] as SceneVisualBeat).imageUrl;
          resolvedDiskPaths[idx] = resolvedDiskPaths[firstCachedIdx];
        }
      }
    });
  }

  const presenter = await resolvePresenterSelection({
    presenterMode: params.presenterMode,
    voiceIdentity: params.voiceIdentity,
    title: params.title,
    scriptText: params.scriptText,
    mode: params.mode,
    twinFaceImageAssets: params.twinFaceImageAssets,
    preferredPortraitId: params.preferredPortraitId,
  });

  return {
    beats: rawBeats,
    beatDiskPaths: resolvedDiskPaths,
    presenter,
  };
}

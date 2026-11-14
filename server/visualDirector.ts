import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  PresenterVisualMode,
  ProductionStyle,
  SceneVisualBeat,
  TwinLanguage,
  VideoFormatType,
  VisualCardType,
  WorkspaceMode,
} from '../src/types.ts';

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

const VALID_CARD_TYPES: VisualCardType[] = [
  'reaction_chat',
  'stat_callout',
  'comparison_split',
  'comic_bubble',
  'kinetic_quote',
];

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

export function resolveProductionStyle(params: {
  productionStyle?: ProductionStyle;
  format?: VideoFormatType | string;
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
    /\b(history|ancient|empire|story|journey|night|memory)\b|इतिहास|कहानी|सफर/.test(text)
  ) {
    return 'story_cinema';
  }

  return 'creator_reel';
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

interface FallbackBeatSpec {
  query: string;
  headline: string;
  visualCardType: VisualCardType;
  calloutText: string;
  subBadge: string;
  isPunchline: boolean;
}

function fallbackQueriesForMood(
  mood: ThemeMood,
  title: string,
  prodStyle: ResolvedProductionStyle
): FallbackBeatSpec[] {
  const cleanTitle = title.replace(/[^\w\s-]/g, ' ').trim();
  if (mood === 'comedy_office' || prodStyle === 'comedy_skit') {
    return [
      {
        query: 'tired office worker coffee laptop',
        headline: '01 QUICK 5-MIN SYNC',
        visualCardType: 'reaction_chat',
        calloutText: 'BOSS: "QUICK 5-MIN SYNC" 👀',
        subBadge: '9:00 AM CALENDAR TRAP',
        isPunchline: false,
      },
      {
        query: 'stressed person laptop desk clock',
        headline: '02 47 MINUTES LATER',
        visualCardType: 'comic_bubble',
        calloutText: 'STILL ON SLIDE #1 💀',
        subBadge: '9:47 AM · NO ESCAPE',
        isPunchline: true,
      },
      {
        query: 'cold coffee cup tired hands desk',
        headline: '03 COLD CHAI REALITY',
        visualCardType: 'reaction_chat',
        calloutText: 'GARAM CHAI BECAME ICED TEA ☕',
        subBadge: 'REALITY CHECK',
        isPunchline: false,
      },
      {
        query: 'shocked funny face office coworker',
        headline: '04 ONE SMALL DOUBT',
        visualCardType: 'comic_bubble',
        calloutText: '"EK CHHOTA SA QUESTION THA..." 🚨',
        subBadge: 'DANGER ZONE',
        isPunchline: true,
      },
      {
        query: 'happy person closing laptop smiling',
        headline: '05 SURVIVAL RULE',
        visualCardType: 'stat_callout',
        calloutText: 'JUST SEND BULLET POINTS ⚡',
        subBadge: 'CREATOR RULE #1',
        isPunchline: false,
      },
      {
        query: 'friends laughing together smiling',
        headline: '06 TAG THAT PERSON',
        visualCardType: 'comic_bubble',
        calloutText: 'TAG YOUR "5-MIN" FRIEND 😂',
        subBadge: 'SHARE THE PAIN',
        isPunchline: true,
      },
    ];
  }

  switch (mood) {
    case 'cosmic_space':
      return [
        {
          query: 'Earth seen from space astronauts',
          headline: '01 ZERO GRAVITY HOOK',
          visualCardType: 'stat_callout',
          calloutText: 'GRAVITY LOCK: OFF (0.00 G)',
          subBadge: 'ORBITAL PHYSICS',
          isPunchline: false,
        },
        {
          query: 'astronaut floating space station smiling',
          headline: '02 EVERYDAY WEIRD FACT',
          visualCardType: 'comparison_split',
          calloutText: 'EARTH TEAR DROPS vs ORBIT BALL',
          subBadge: 'LIVE EXPERIMENT',
          isPunchline: true,
        },
        {
          query: 'water sphere microgravity floating astronaut',
          headline: '03 SURFACE TENSION',
          visualCardType: 'stat_callout',
          calloutText: 'LIQUID STICKS TO YOUR CHEEK',
          subBadge: 'NO DRIPPING',
          isPunchline: false,
        },
        {
          query: 'nebula stars telescope glowing cosmos',
          headline: '04 MIND-BLOWING SCALE',
          visualCardType: 'kinetic_quote',
          calloutText: '28,000 KM/H FREE FALL',
          subBadge: 'DEEP SPACE VIEW',
          isPunchline: true,
        },
        {
          query: 'astronaut helmet reflection earth',
          headline: '05 HUMAN SURVIVAL',
          visualCardType: 'stat_callout',
          calloutText: '16 SUNRISES EVERY 24 HOURS',
          subBadge: 'ISS DAILY LOG',
          isPunchline: false,
        },
        {
          query: 'night sky milky way stargazing person',
          headline: '06 FOLLOW FOR MORE',
          visualCardType: 'kinetic_quote',
          calloutText: 'SCIENCE IN 30 SECONDS ✨',
          subBadge: 'SAVE THIS FACT',
          isPunchline: false,
        },
      ];
    case 'science_tech':
      return [
        {
          query: 'person thinking glowing screen technology',
          headline: '01 THE HIDDEN SIGNAL',
          visualCardType: 'stat_callout',
          calloutText: 'WHAT NOBODY NOTICES FIRST',
          subBadge: 'THE MECHANISM',
          isPunchline: false,
        },
        {
          query: 'scientist laboratory experiment colorful',
          headline: '02 REAL LAB PROOF',
          visualCardType: 'comparison_split',
          calloutText: 'GUSSWORK vs LAB EVIDENCE',
          subBadge: 'PROVEN STUDY',
          isPunchline: true,
        },
        {
          query: 'human brain neuron light connection',
          headline: '03 INSIDE THE SYSTEM',
          visualCardType: 'stat_callout',
          calloutText: '3X FASTER PATTERN LOCK',
          subBadge: 'HOW IT WORKS',
          isPunchline: false,
        },
        {
          query: 'futuristic computer code hardware close up',
          headline: '04 REAL-WORLD IMPACT',
          visualCardType: 'kinetic_quote',
          calloutText: 'WHY THIS CHANGES EVERYTHING',
          subBadge: 'KEY INSIGHT',
          isPunchline: true,
        },
        {
          query: 'engineer testing prototype workshop',
          headline: '05 DAILY APPLICATION',
          visualCardType: 'stat_callout',
          calloutText: 'USE THIS IN 10 SECONDS',
          subBadge: 'PRACTICAL TEST',
          isPunchline: false,
        },
        {
          query: 'curious student learning science amazed',
          headline: '06 NEXT DISCOVERY',
          visualCardType: 'kinetic_quote',
          calloutText: 'SAVE BEFORE YOU FORGET 🔬',
          subBadge: 'PART 2 NEXT',
          isPunchline: false,
        },
      ];
    case 'finance_business':
      return [
        {
          query: 'person checking smartphone money wallet',
          headline: '01 SILENT MONEY LEAK',
          visualCardType: 'stat_callout',
          calloutText: 'WHY SALARY VANISHES FAST',
          subBadge: 'MONEY TRAP',
          isPunchline: false,
        },
        {
          query: 'coffee bills calculator desk budget',
          headline: '02 TINY HABITS ADD UP',
          visualCardType: 'comparison_split',
          calloutText: 'SMALL SPEND vs COMPOUNDING',
          subBadge: 'NUMBERS TEST',
          isPunchline: true,
        },
        {
          query: 'stock chart green arrow growth screen',
          headline: '03 THE 10-YEAR CURVE',
          visualCardType: 'stat_callout',
          calloutText: 'TIME BEATS TIMING EVERY TIME',
          subBadge: 'COMPOUND MATH',
          isPunchline: false,
        },
        {
          query: 'young entrepreneur laptop cafe working',
          headline: '04 SMART EXECUTION',
          visualCardType: 'kinetic_quote',
          calloutText: 'EARN IN SKILLS, SAVE IN SYSTEMS',
          subBadge: 'RULE #1',
          isPunchline: true,
        },
        {
          query: 'coins jar savings piggy bank desk',
          headline: '05 ZERO-STRESS BUFFER',
          visualCardType: 'stat_callout',
          calloutText: 'AUTO-SAVE ON DAY ONE',
          subBadge: 'SIMPLE SYSTEM',
          isPunchline: false,
        },
        {
          query: 'confident founder smiling sunset cityscape',
          headline: '06 START THIS MONTH',
          visualCardType: 'kinetic_quote',
          calloutText: 'SAVE & SHARE WITH A FRIEND 📈',
          subBadge: 'ACTION STEP',
          isPunchline: false,
        },
      ];
    case 'mind_psychology':
      return [
        {
          query: 'person waiting impatiently airport luggage',
          headline: '01 THE HIDDEN MIND HACK',
          visualCardType: 'reaction_chat',
          calloutText: 'WHY WAITING FEELS SO LONG',
          subBadge: 'PSYCHOLOGY TRICK',
          isPunchline: false,
        },
        {
          query: 'people walking busy corridor terminal',
          headline: '02 PERCEPTION vs CLOCK',
          visualCardType: 'comparison_split',
          calloutText: 'WALKING = HAPPY · STANDING = MAD',
          subBadge: 'REAL EXPERIMENT',
          isPunchline: true,
        },
        {
          query: 'person looking in mirror thoughtful portrait',
          headline: '03 ATTENTION REDIRECTED',
          visualCardType: 'stat_callout',
          calloutText: 'BUSY BRAIN IGNORES THE CLOCK',
          subBadge: 'BRAIN DESIGN',
          isPunchline: false,
        },
        {
          query: 'clock time hour glass close up',
          headline: '04 ZERO COST TRICK',
          visualCardType: 'kinetic_quote',
          calloutText: 'CHANGE EXPERIENCE, NOT SPEED',
          subBadge: 'UX PSYCHOLOGY',
          isPunchline: true,
        },
        {
          query: 'smiling traveler walking smoothly airport',
          headline: '05 ZERO COMPLAINTS',
          visualCardType: 'stat_callout',
          calloutText: 'COMPLAINTS DROPPED NEAR ZERO',
          subBadge: 'PROVEN RESULT',
          isPunchline: false,
        },
        {
          query: 'calm person morning coffee sunlight',
          headline: '06 SPOT IT TODAY',
          visualCardType: 'kinetic_quote',
          calloutText: 'NOTICE THIS NEXT TIME 🧠',
          subBadge: 'MIND BLOWN',
          isPunchline: false,
        },
      ];
    case 'history_world':
      return [
        {
          query: 'ancient stone ruins golden sunset',
          headline: '01 FORGOTTEN ORIGIN',
          visualCardType: 'kinetic_quote',
          calloutText: 'BUILT CENTURIES BEFORE US',
          subBadge: 'ARCHIVAL MYSTERY',
          isPunchline: false,
        },
        {
          query: 'old vintage map compass parchment',
          headline: '02 HIDDEN CLUE',
          visualCardType: 'stat_callout',
          calloutText: 'THE DETAIL BOOKS SKIPPED',
          subBadge: 'HISTORICAL RECORD',
          isPunchline: false,
        },
        {
          query: 'Indian palace architecture sunrise golden',
          headline: '03 MASTER ENGINEERING',
          visualCardType: 'comparison_split',
          calloutText: 'ANCIENT CRAFT vs MODERN TECH',
          subBadge: 'STILL STANDING',
          isPunchline: true,
        },
        {
          query: 'historian reading old archive books',
          headline: '04 PROOF UNCOVERED',
          visualCardType: 'stat_callout',
          calloutText: 'VERIFIED BY REAL ARTIFACTS',
          subBadge: 'FACT CHECKED',
          isPunchline: false,
        },
        {
          query: 'dramatic monument clouds silhouettes',
          headline: '05 TURNING POINT',
          visualCardType: 'kinetic_quote',
          calloutText: 'ONE DECISION CHANGED HISTORY',
          subBadge: 'TIMELINE SHIFT',
          isPunchline: true,
        },
        {
          query: 'horizon sunlight over historic city',
          headline: '06 STILL ALIVE TODAY',
          visualCardType: 'kinetic_quote',
          calloutText: 'HISTORY EXPLAINS TODAY 🏛️',
          subBadge: 'SHARE THE STORY',
          isPunchline: false,
        },
      ];
    case 'nature_earth':
      return [
        {
          query: 'dramatic ocean wave deep blue sunlight',
          headline: '01 PLANET WONDER',
          visualCardType: 'stat_callout',
          calloutText: 'HIDDEN POWER OF NATURE',
          subBadge: 'EARTH DISCOVERY',
          isPunchline: false,
        },
        {
          query: 'lush green rainforest mist sunrise',
          headline: '02 LIVING NETWORK',
          visualCardType: 'comparison_split',
          calloutText: 'WHAT WE SEE vs UNDERNEATH',
          subBadge: 'ECOSYSTEM',
          isPunchline: false,
        },
        {
          query: 'colorful coral reef fish underwater',
          headline: '03 DELICATE BALANCE',
          visualCardType: 'stat_callout',
          calloutText: 'EVERY PIECE CONNECTS',
          subBadge: 'NATURE DESIGN',
          isPunchline: true,
        },
        {
          query: 'snowy mountain peak golden alpenglow',
          headline: '04 SCALE OF EARTH',
          visualCardType: 'kinetic_quote',
          calloutText: 'MILLIONS OF YEARS IN THE MAKING',
          subBadge: 'PURE WONDER',
          isPunchline: false,
        },
        {
          query: 'aurora borealis night sky glowing',
          headline: '05 COSMIC SHIELD',
          visualCardType: 'stat_callout',
          calloutText: 'INVISIBLE PROTECTION ABOVE US',
          subBadge: 'ATMOSPHERE',
          isPunchline: true,
        },
        {
          query: 'person hiking overlooking green valley',
          headline: '06 RESPECT THE WILD',
          visualCardType: 'kinetic_quote',
          calloutText: 'SAVE THIS NATURAL WONDER 🌍',
          subBadge: 'PART 1',
          isPunchline: false,
        },
      ];
    default:
      return [
        {
          query: cleanTitle.split(' ').slice(0, 3).join(' ') || 'creator talking camera microphone',
          headline: '01 OPENING HOOK',
          visualCardType: prodStyle === 'visual_explainer' ? 'stat_callout' : 'reaction_chat',
          calloutText: 'WAIT TILL YOU HEAR THIS 👀',
          subBadge: 'THE REAL TRUTH',
          isPunchline: false,
        },
        {
          query: 'person explaining whiteboard notebook cafe',
          headline: '02 THE REAL REASON',
          visualCardType: 'comparison_split',
          calloutText: 'COMMON MYTH vs REALITY',
          subBadge: 'LOOK CLOSER',
          isPunchline: true,
        },
        {
          query: 'smartphone filming content studio desk',
          headline: '03 SIMPLE EXAMPLE',
          visualCardType: 'stat_callout',
          calloutText: 'WHY 90% MISS THIS STEP',
          subBadge: 'PROOF POINT',
          isPunchline: false,
        },
        {
          query: 'friends talking laughing coffee shop',
          headline: '04 RELATABLE MOMENT',
          visualCardType: 'comic_bubble',
          calloutText: 'HUM SAB YAHI GALTI KARTE HAIN',
          subBadge: 'EVERYDAY HABIT',
          isPunchline: true,
        },
        {
          query: 'focused creator editing video laptop',
          headline: '05 DO THIS INSTEAD',
          visualCardType: 'stat_callout',
          calloutText: 'ONE SMALL SWITCH = BIG RESULT',
          subBadge: 'ACTIONABLE TIP',
          isPunchline: false,
        },
        {
          query: 'smiling confident person warm sunlight',
          headline: '06 FINAL TAKEAWAY',
          visualCardType: 'kinetic_quote',
          calloutText: 'FOLLOW FOR PART 2 ⚡',
          subBadge: 'SAVE & SHARE',
          isPunchline: false,
        },
      ];
  }
}

async function generateStoryboardViaGemini(
  title: string,
  cues: string[],
  backgroundStyle: string | undefined,
  prodStyle: ResolvedProductionStyle
): Promise<Array<{
  headline: string;
  searchQuery: string;
  themeMood: ThemeMood;
  visualCardType: VisualCardType;
  calloutText: string;
  subBadge: string;
  isPunchline: boolean;
}> | null> {
  const ai = getGeminiClient();
  if (!ai) return null;

  try {
    const prompt = `You are a Creative Short-Form Video Director designing 6 chronological relatable visual scenes matching a spoken voiceover.
Video Title: "${title}"
Production Style: "${prodStyle}" (${
      prodStyle === 'comedy_skit'
        ? 'punchy comic timing, relatable everyday human situations, funny chat/reaction bubbles'
        : prodStyle === 'visual_explainer'
          ? 'sharp stat callouts, myth vs reality cards, crystal clear conceptual photography'
          : prodStyle === 'story_cinema'
            ? 'dramatic atmospheric scenes and chapter quote cards'
            : 'relatable creator hooks, lifestyle human scenes, punchy cards'
    })
Requested Background Preference: "${backgroundStyle || 'Auto-Match Script Theme'}"

For each of the 6 spoken script beats below, generate:
1. headline: concise 2-4 word top label (English or crisp Hinglish).
2. searchQuery: 3-4 concrete English nouns describing a RELATABLE HUMAN ACTION OR SCENE for real photography search (e.g., "tired office worker coffee laptop", "friends laughing cafe funny", "shocked face smartphone screen", "astronaut water drop space", "airport travelers waiting"). Avoid generic empty buildings!
3. themeMood: one of cosmic_space, science_tech, comedy_office, finance_business, history_world, mind_psychology, nature_earth, studio_editorial.
4. visualCardType: choose the best dynamic on-screen graphic overlay card: "reaction_chat", "stat_callout", "comparison_split", "comic_bubble", or "kinetic_quote".
5. calloutText: a punchy 2-6 word on-screen visual pop-up text directly illustrating THAT spoken line (in Hinglish/English/Hindi matching the script tone — e.g. "BOSS: QUICK 5-MIN SYNC 👀", "MYTH: MORE SLEEP = LAZY ❌", "47 MINS ON SLIDE ONE 💀").
6. subBadge: tiny 2-3 word label above the callout card (e.g., "9:00 AM TRAP", "LAB PROOF", "REALITY CHECK").
7. isPunchline: boolean true if that beat is a comedic punchline, plot twist, or big reveal!

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
              visualCardType: { type: Type.STRING },
              calloutText: { type: Type.STRING },
              subBadge: { type: Type.STRING },
              isPunchline: { type: Type.BOOLEAN },
            },
            required: [
              'headline',
              'searchQuery',
              'themeMood',
              'visualCardType',
              'calloutText',
              'subBadge',
              'isPunchline',
            ],
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
        const cardType = VALID_CARD_TYPES.includes(item.visualCardType)
          ? (item.visualCardType as VisualCardType)
          : prodStyle === 'comedy_skit'
            ? 'comic_bubble'
            : 'stat_callout';
        return {
          headline: String(item.headline || 'SCENE INSIGHT').slice(0, 42),
          searchQuery: String(item.searchQuery || title).slice(0, 80),
          themeMood: mood,
          visualCardType: cardType,
          calloutText: String(item.calloutText || item.headline || 'WATCH THIS').slice(0, 46),
          subBadge: String(item.subBadge || 'KEY MOMENT').slice(0, 26),
          isPunchline: Boolean(item.isPunchline),
        };
      });
    }
  } catch {
    // Cleanly fall back to deterministic bilingual visual mapper
  }
  return null;
}

async function fetchOpenverseCandidates(query: string): Promise<string[]> {
  const urls: string[] = [];
  try {
    const ovUrl = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(
      query
    )}&page_size=6&mature=false`;
    const r = await fetch(ovUrl, {
      headers: { 'User-Agent': 'TwinForgeStudio/1.0 (visual-director)' },
      signal: AbortSignal.timeout(4500),
    });
    if (r.ok) {
      const data = await r.json();
      const items = Array.isArray(data?.results) ? data.results : [];
      for (const item of items) {
        if ((item.width && item.width < 420) || (item.height && item.height < 280)) continue;
        // Prefer direct JPEG/PNG url first or reliable Openverse thumbnail proxy
        if (typeof item.url === 'string' && /\.(jpe?g|png)(\?|$)/i.test(item.url)) {
          urls.push(item.url);
        } else if (typeof item.thumbnail === 'string' && item.thumbnail.startsWith('http')) {
          urls.push(item.thumbnail);
        }
      }
    }
  } catch {
    // Ignore transient timeout
  }
  return urls;
}

async function fetchTopicPhotoCandidates(query: string, mood: ThemeMood): Promise<string[]> {
  const results: string[] = [];
  const headers = { 'User-Agent': 'TwinForgeStudio/1.0 (visual-director)' };

  const preferLifestyleFirst =
    mood === 'comedy_office' ||
    mood === 'mind_psychology' ||
    mood === 'finance_business' ||
    mood === 'studio_editorial';

  // 1. For relatable human/comedy/lifestyle scenes, try Openverse Creative Commons photography first
  if (preferLifestyleFirst) {
    const ov = await fetchOpenverseCandidates(query);
    results.push(...ov);
  }

  // 2. Wikipedia PageImages (great for space, science, history, landmarks, specific concepts)
  if (results.length < 3) {
    try {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        query
      )}&gsrlimit=4&prop=pageimages&piprop=thumbnail|original&pithumbsize=1200&format=json&origin=*`;
      const r = await fetch(wikiUrl, { headers, signal: AbortSignal.timeout(4000) });
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
      // continue
    }
  }

  // 3. Openverse fallback if Wikipedia didn't yield enough relatable scenes
  if (!preferLifestyleFirst && results.length < 2) {
    const ov = await fetchOpenverseCandidates(query);
    results.push(...ov);
  }

  // 4. Wikimedia Commons high-res bitmap search
  if (results.length < 2) {
    try {
      const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
        `${query} filetype:bitmap`
      )}&gsrlimit=5&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=1200&format=json`;
      const r = await fetch(commonsUrl, { headers, signal: AbortSignal.timeout(4000) });
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
  const guessedExt = /\.png(\?|$)/i.test(remoteUrl) ? '.png' : '.jpg';

  for (const checkExt of ['.jpg', '.png']) {
    const existing = `scene_${mood}_${hash}${checkExt}`;
    const existingPath = path.join(SCENE_CACHE_DIR, existing);
    try {
      const st = await fs.stat(existingPath);
      if (st.size > 8000) {
        return { localPath: existingPath, publicUrl: `/api/media/scenes/${existing}` };
      }
    } catch {
      // miss
    }
  }

  try {
    const resp = await fetch(remoteUrl, {
      headers: { 'User-Agent': 'TwinForgeStudio/1.0' },
      signal: AbortSignal.timeout(5500),
    });
    if (!resp.ok) return null;
    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    // Strictly stick to JPEG or PNG so both Canvas and FFmpeg decode reliably
    if (!ct.includes('image/jpeg') && !ct.includes('image/jpg') && !ct.includes('image/png')) {
      return null;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < 8000) return null;
    const ext = ct.includes('image/png') ? '.png' : guessedExt;
    const filename = `scene_${mood}_${hash}${ext}`;
    const destPath = path.join(SCENE_CACHE_DIR, filename);
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
  backgroundStyle?: string;
  presenterMode?: PresenterVisualMode;
  productionStyle?: ProductionStyle;
  voiceIdentity?: string;
  mode: WorkspaceMode;
  twinFaceImageAssets: Array<{ id: string; url: string; diskPath?: string }>;
  preferredPortraitId?: string;
}): Promise<{
  beats: SceneVisualBeat[];
  beatDiskPaths: Array<string | undefined>;
  presenter: ResolvedPresenterInfo;
  productionStyleResolved: ResolvedProductionStyle;
}> {
  const cues = splitScriptInto6Cues(params.title, params.scriptText);
  const prodStyleResolved = resolveProductionStyle({
    productionStyle: params.productionStyle,
    format: params.format,
    backgroundStyle: params.backgroundStyle,
    title: params.title,
    scriptText: params.scriptText,
  });

  const overallMood = inferMoodFromText(
    `${params.title} ${params.scriptText}`,
    params.backgroundStyle
  );

  const geminiPlan = await generateStoryboardViaGemini(
    params.title,
    cues,
    params.backgroundStyle,
    prodStyleResolved
  );
  const fallbackSpecs = fallbackQueriesForMood(overallMood, params.title, prodStyleResolved);

  const rawBeats: SceneVisualBeat[] = cues.map((cue, idx) => {
    const fb = fallbackSpecs[idx];
    const spec = geminiPlan?.[idx] || {
      headline: fb.headline,
      searchQuery: fb.query,
      themeMood: overallMood,
      visualCardType: fb.visualCardType,
      calloutText: fb.calloutText,
      subBadge: fb.subBadge,
      isPunchline: fb.isPunchline,
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
      visualCardType: spec.visualCardType,
      calloutText: spec.calloutText,
      subBadge: spec.subBadge,
      isPunchline: spec.isPunchline,
    };
  });

  // Fetch & cache unique topic-matched photographs reliably across all 6 beats
  const usedUrls = new Set<string>();
  const resolvedDiskPaths: Array<string | undefined> = Array(6).fill(undefined);

  await Promise.all(
    rawBeats.map(async (beat, idx) => {
      const primary = await fetchTopicPhotoCandidates(beat.searchQuery, beat.themeMood);
      const fallback =
        primary.length < 3
          ? await fetchTopicPhotoCandidates(fallbackSpecs[idx].query, beat.themeMood)
          : [];
      const pool = Array.from(new Set([...primary, ...fallback]));

      const orderedCandidates = [
        ...pool.filter((u) => !usedUrls.has(u)),
        ...pool.filter((u) => usedUrls.has(u)),
      ];

      for (const cand of orderedCandidates.slice(0, 4)) {
        usedUrls.add(cand);
        const cached = await cacheImageLocally(cand, `${beat.searchQuery}_${cand}`, beat.themeMood);
        if (cached) {
          beat.imageUrl = cached.publicUrl;
          resolvedDiskPaths[idx] = cached.localPath;
          break;
        }
      }
    })
  );

  // Backfill any remaining beats from local mood-tagged cache
  const missingAny = rawBeats.some((b) => !b.imageUrl);
  if (missingAny) {
    try {
      const files = (await fs.readdir(SCENE_CACHE_DIR)).filter((f) => /\.(jpe?g|png)$/i.test(f));
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
  const firstCachedIdx = rawBeats.findIndex((b) => Boolean(b.imageUrl));
  if (firstCachedIdx !== -1) {
    rawBeats.forEach((beat, idx) => {
      if (!beat.imageUrl) {
        const donor = rawBeats[(idx + firstCachedIdx + 1) % rawBeats.length];
        const donorDisk = resolvedDiskPaths[(idx + firstCachedIdx + 1) % rawBeats.length];
        if (donor.imageUrl) {
          beat.imageUrl = donor.imageUrl;
          resolvedDiskPaths[idx] = donorDisk;
        } else {
          beat.imageUrl = rawBeats[firstCachedIdx].imageUrl;
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
    productionStyleResolved: prodStyleResolved,
  };
}

import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  ContentScriptPack,
  OnlineViralIdea,
  PersonalityProfile,
  RewriteAction,
  ScriptGenre,
  TwinLanguage,
  VideoFormatType,
  VoiceProviderId,
  WritingStyleMode,
} from '../src/types.ts';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function isGeminiConfigured(): boolean {
  const apiKey = process.env.GEMINI_API_KEY;
  return Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
}

export async function generateIntelligenceScripts(params: {
  trendTopic: string;
  trendSummary: string;
  language: TwinLanguage;
  personality: PersonalityProfile;
  targetDurationSec: number;
  genre?: ScriptGenre;
  writingStyle?: WritingStyleMode;
  sourceUrl?: string;
}): Promise<Omit<ContentScriptPack, 'id' | 'trendId' | 'approvalStatus' | 'createdAt' | 'updatedAt'>> {
  const ai = getAiClient();
  const chosenGenre = params.genre || 'Knowledge';
  const chosenStyle = params.writingStyle || 'Viral Hook & Curiosity';

  const genreGuidance =
    chosenGenre === 'Comedy'
      ? 'Craft sharp comedic setups, relatable timing, unexpected punchlines, and a quick callback in the CTA.'
      : chosenGenre === 'Science'
        ? 'Lead with awe-inspiring scientific wonder grounded in real phenomena, explain it via a crystal-clear everyday analogy, and end with a mind-expanding takeaway.'
        : chosenGenre === 'Knowledge' || chosenGenre === 'History & Facts'
          ? 'Open with a high-curiosity knowledge gap ("Why X happens / Why most people miss Y"), unpack two concrete insights, and conclude with a memorable mental model.'
          : chosenGenre === 'Myth Busting'
            ? 'Challenge a widespread misconception in the first 3 seconds, show why it fails in reality, and replace it with the true mechanism.'
            : 'Deliver an authentic, high-retention narrative with clear beats and zero fluff.';

  const prompt = `
Analyze the following topic and generate a strategic creator angle plus 3 distinct video scripts tailored to this creator's authentic voice and identity.

CREATOR IDENTITY:
- Name: ${params.personality.creatorName || 'Creator'} (${params.personality.handle || '@creator'})
- Niche: ${params.personality.niche}
- Speaking Style: ${params.personality.speakingStyle}
- Vocabulary & Tone: ${params.personality.vocabularyNotes}
- Humour: ${params.personality.humourStyle}
- Formality: ${params.personality.formalityLevel}
- Accent/Pronunciation Guidance: ${params.personality.accentAndPronunciation}
- Signature Phrases to weave naturally when fitting: ${params.personality.catchphrases.join(' | ') || 'None specified'}

VIRAL GENRE: ${chosenGenre}
WRITING STYLE MODE: ${chosenStyle}
GENRE DIRECTION: ${genreGuidance}
TOPIC: ${params.trendTopic}
CONTEXT / SOURCE FACTS: ${params.trendSummary}
TARGET LANGUAGE: ${params.language} (If Hinglish, write crisp conversational Hindi-English blend in Latin script with natural Indian creator phrasing; if Hindi, write clear spoken Devanagari Hindi; if English, write sharp natural spoken English).
TARGET DURATION: ~${Math.max(30, params.targetDurationSec)} seconds (~${Math.round(Math.max(30, params.targetDurationSec) * 2.4)} words per script, minimum 30 seconds of spoken content).

Generate JSON strictly matching the schema with:
1. recommendedFormat: one of "Talking-Head", "Presenter-Style", "Educational", "Original Reaction", "Storytelling", "Promotional", "Short-Form Social"
2. thesis: 1-2 sentences on the unique POV this creator should take
3. audiencePainPoint: what the target audience cares about right now
4. ctaStrategy: specific low-friction call to action
5. variants: array of EXACTLY 3 scripts with toneName values:
   - "Natural & Conversational"
   - "Educational & Authoritative"
   - "Entertaining & Engaging"
Each variant must include hook3s (attention-grabbing first 3 seconds), body (full spoken monologue ready for teleprompter/TTS), cta (closing line), estimatedDurationSec (number), wordCount (number).
`.trim();

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'You are an editorial creative director crafting spoken video scripts for a personal digital twin. Keep scripts natural, non-robotic, concise, and free of corporate clichés.',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          recommendedFormat: { type: Type.STRING },
          thesis: { type: Type.STRING },
          audiencePainPoint: { type: Type.STRING },
          ctaStrategy: { type: Type.STRING },
          variants: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                toneName: { type: Type.STRING },
                hook3s: { type: Type.STRING },
                body: { type: Type.STRING },
                cta: { type: Type.STRING },
                estimatedDurationSec: { type: Type.NUMBER },
                wordCount: { type: Type.NUMBER },
              },
              required: ['toneName', 'hook3s', 'body', 'cta', 'estimatedDurationSec', 'wordCount'],
            },
          },
        },
        required: ['recommendedFormat', 'thesis', 'audiencePainPoint', 'ctaStrategy', 'variants'],
      },
    },
  });

  const rawText = response.text || '';
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const parsed = JSON.parse(cleaned);

  const allowedFormats: VideoFormatType[] = [
    'Talking-Head',
    'Presenter-Style',
    'Educational',
    'Original Reaction',
    'Storytelling',
    'Promotional',
    'Short-Form Social',
  ];

  const toneNames: Array<
    'Natural & Conversational' | 'Educational & Authoritative' | 'Entertaining & Engaging'
  > = [
    'Natural & Conversational',
    'Educational & Authoritative',
    'Entertaining & Engaging',
  ];

  const variants = (Array.isArray(parsed.variants) ? parsed.variants : [])
    .slice(0, 3)
    .map((v: any, idx: number) => {
      const fullWords = `${v.hook3s || ''} ${v.body || ''} ${v.cta || ''}`
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
      return {
        id: `var_${Date.now()}_${idx}`,
        toneName: toneNames[idx] || 'Natural & Conversational',
        hook3s: String(v.hook3s || ''),
        body: String(v.body || ''),
        cta: String(v.cta || ''),
        wordCount: fullWords || Number(v.wordCount) || 75,
        estimatedDurationSec: Math.max(30, Math.round((fullWords || 75) / 2.3)),
      };
    });

  return {
    trendTopic: params.trendTopic,
    genre: chosenGenre,
    writingStyle: chosenStyle,
    sourceUrl: params.sourceUrl,
    language: params.language,
    recommendedFormat: allowedFormats.includes(parsed.recommendedFormat)
      ? parsed.recommendedFormat
      : 'Talking-Head',
    thesis: String(parsed.thesis || ''),
    audiencePainPoint: String(parsed.audiencePainPoint || ''),
    ctaStrategy: String(parsed.ctaStrategy || ''),
    selectedVariantId: variants[0]?.id || '',
    variants,
  };
}

async function fetchLivePublicHeadlines(genre: ScriptGenre, query?: string): Promise<
  Array<{ title: string; snippet: string; sourceTitle: string; sourceUrl: string }>
> {
  const results: Array<{ title: string; snippet: string; sourceTitle: string; sourceUrl: string }> = [];

  const genreSearchKeywords: Record<ScriptGenre, string> = {
    Comedy: 'viral funny observational humor relatable trend comedy',
    Knowledge: 'surprising everyday facts explained hidden design secret',
    Science: 'breakthrough science discovery physics biology study',
    'Myth Busting': 'common myth debunked science fact vs fiction',
    Psychology: 'human psychology cognitive bias behavior study',
    'Tech & AI': 'AI workflow creator technology breakthrough',
    Storytelling: 'remarkable true story human resilience turning point',
    'Business & Finance': 'smart creator economy startup money lesson',
    'History & Facts': 'fascinating forgotten history historical mystery',
  };

  const qStr = query?.trim()
    ? `${query.trim()} ${genre}`
    : genreSearchKeywords[genre] || genre;

  const parseRssXml = (xml: string, fallbackSource: string) => {
    const items: Array<{ title: string; snippet: string; sourceTitle: string; sourceUrl: string }> = [];
    const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
    for (const block of itemMatches.slice(0, 8)) {
      const rawTitle = (block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
      const rawLink = (block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .trim();
      const rawDesc = (block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] || '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const srcName =
        (block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || fallbackSource)
          .replace(/<[^>]+>/g, '')
          .trim() || fallbackSource;
      if (rawTitle && rawLink.startsWith('http')) {
        items.push({
          title: rawTitle,
          snippet: rawDesc.slice(0, 220),
          sourceTitle: srcName,
          sourceUrl: rawLink,
        });
      }
    }
    return items;
  };

  const feedTasks: Array<Promise<void>> = [
    fetch(
      `https://news.google.com/rss/search?q=${encodeURIComponent(qStr)}&hl=en-IN&gl=IN&ceid=IN:en`,
      { signal: AbortSignal.timeout(7000) }
    )
      .then((r) => (r.ok ? r.text() : ''))
      .then((xml) => {
        if (xml) results.push(...parseRssXml(xml, 'Google News Live'));
      })
      .catch(() => {}),
  ];

  if (genre === 'Science' || genre === 'Myth Busting') {
    feedTasks.push(
      fetch('https://www.sciencedaily.com/rss/top/science.xml', {
        signal: AbortSignal.timeout(7000),
      })
        .then((r) => (r.ok ? r.text() : ''))
        .then((xml) => {
          if (xml) results.push(...parseRssXml(xml, 'ScienceDaily'));
        })
        .catch(() => {})
    );
  }

  if (genre === 'Knowledge' || genre === 'History & Facts' || genre === 'Psychology') {
    feedTasks.push(
      fetch('https://www.smithsonianmag.com/rss/smart-news/', {
        signal: AbortSignal.timeout(7000),
      })
        .then((r) => (r.ok ? r.text() : ''))
        .then((xml) => {
          if (xml) results.push(...parseRssXml(xml, 'Smithsonian Smart News'));
        })
        .catch(() => {})
    );

    const wikiDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10).replace(/-/g, '/');
    feedTasks.push(
      fetch(`https://en.wikipedia.org/api/rest_v1/feed/featured/${wikiDate}`, {
        signal: AbortSignal.timeout(7000),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: any) => {
          const mostread = Array.isArray(data?.mostread?.articles) ? data.mostread.articles : [];
          for (const art of mostread.slice(0, 4)) {
            const url = art?.content_urls?.desktop?.page;
            if (art?.normalizedtitle && url) {
              results.push({
                title: String(art.normalizedtitle),
                snippet: String(art.extract || art.description || '').slice(0, 220),
                sourceTitle: 'Wikipedia Trending',
                sourceUrl: url,
              });
            }
          }
        })
        .catch(() => {})
    );
  }

  await Promise.all(feedTasks);
  return results.slice(0, 10);
}

export async function fetchOnlineViralIdeas(params: {
  genre: ScriptGenre;
  query?: string;
  language: TwinLanguage;
  personality: PersonalityProfile;
}): Promise<{
  ideas: OnlineViralIdea[];
  groundingSources: Array<{ title: string; url: string }>;
}> {
  const focusClause = params.query?.trim()
    ? `Focused specifically around: "${params.query.trim()}".`
    : `Discover fresh, currently trending or endlessly shareable viral hooks in ${params.genre}.`;

  const now = new Date().toISOString();

  // Attempt 1: Gemini 4 Hydrogen with live Google Search grounding
  if (isGeminiConfigured()) {
    try {
      const ai = getAiClient();
      const searchPrompt = `
Use Google Search to find 5 real, fresh, high-engagement viral short-video ideas in the "${params.genre}" category for a digital twin video creator.
${focusClause}
Creator niche context: ${params.personality.niche || 'General viral creator'}.
Target language style: ${params.language} (If Hindi, write titles/hooks in clear spoken Devanagari Hindi; if Hinglish, write natural Indian Hinglish; if English, crisp natural English).

Requirements:
- For Science / Knowledge / History & Facts / Myth Busting / Psychology: base each idea on real fascinating scientific findings, surprising trivia, or recent discoveries found via search.
- For Comedy / Storytelling / Business & Finance / Tech & AI: base each idea on relatable trending situations, cultural conversations, viral formats, or sharp observational premises found online.
- Output ONLY a valid JSON array of 5 objects with keys:
  "title" (punchy editorial headline),
  "hookIdea" (exact 3-second spoken opening hook),
  "viralTrigger" (why viewers watch past 3 seconds and share, max 18 words),
  "suggestedAngle" (key 2-sentence factual/comedic premise to expand into a >=30s script).
Do not include markdown prose outside the JSON array.
`.trim();

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: searchPrompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          tools: [{ googleSearch: {} }],
        },
      });

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const groundingSources = chunks
        .map((c: any) => ({
          title: String(c?.web?.title || '').trim(),
          url: String(c?.web?.uri || '').trim(),
        }))
        .filter((s: { title: string; url: string }) => Boolean(s.url));

      const rawText = (response.text || '').trim();
      let parsedList: any[] = [];
      const jsonMatch = rawText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const candidate = JSON.parse(jsonMatch[0]);
          if (Array.isArray(candidate)) parsedList = candidate;
        } catch {
          parsedList = [];
        }
      }

      if (parsedList.length > 0) {
        const ideas: OnlineViralIdea[] = parsedList.slice(0, 6).map((item, idx) => {
          const src = groundingSources[idx % Math.max(1, groundingSources.length)];
          return {
            id: `idea_${Date.now()}_${idx}`,
            genre: params.genre,
            language: params.language,
            title: String(item.title || `${params.genre} Viral Concept #${idx + 1}`),
            hookIdea: String(item.hookIdea || ''),
            viralTrigger: String(item.viralTrigger || 'High curiosity gap and relatable twist'),
            suggestedAngle: String(item.suggestedAngle || ''),
            sourceTitle: src?.title || undefined,
            sourceUrl: src?.url || undefined,
            fetchedAt: now,
          };
        });
        return { ideas, groundingSources };
      }
    } catch {
      // Fall through cleanly to live public RSS / Wikipedia + Gemini synthesis fallback
    }
  }

  // Attempt 2: Live public web headlines (Google News RSS / ScienceDaily / Smithsonian / Wikipedia) + Gemini standard synthesis
  const liveArticles = await fetchLivePublicHeadlines(params.genre, params.query);
  const groundingSources = liveArticles.map((a) => ({ title: a.sourceTitle, url: a.sourceUrl }));

  if (isGeminiConfigured() && liveArticles.length > 0) {
    try {
      const ai = getAiClient();
      const synthPrompt = `
Turn these live online stories/headlines into 5 high-retention ${params.genre} viral video script ideas in ${params.language} for creator ${params.personality.creatorName || 'Creator'} (${params.personality.niche}).
${focusClause}

LIVE WEB SOURCES:
${liveArticles.map((a, i) => `${i + 1}. [${a.sourceTitle}] ${a.title} — ${a.snippet}`).join('\n')}

Return JSON strictly matching the schema (include sourceIndex matching 0..${liveArticles.length - 1}).
`.trim();

      const resp = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: synthPrompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                sourceIndex: { type: Type.NUMBER },
                title: { type: Type.STRING },
                hookIdea: { type: Type.STRING },
                viralTrigger: { type: Type.STRING },
                suggestedAngle: { type: Type.STRING },
              },
              required: ['title', 'hookIdea', 'viralTrigger', 'suggestedAngle'],
            },
          },
        },
      });

      const parsed = JSON.parse(
        (resp.text || '[]')
          .replace(/^```json\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim()
      );
      if (Array.isArray(parsed) && parsed.length > 0) {
        const ideas: OnlineViralIdea[] = parsed.slice(0, 6).map((item: any, idx: number) => {
          const srcIdx =
            typeof item.sourceIndex === 'number' && liveArticles[item.sourceIndex]
              ? item.sourceIndex
              : idx % liveArticles.length;
          const src = liveArticles[srcIdx];
          return {
            id: `idea_${Date.now()}_${idx}`,
            genre: params.genre,
            language: params.language,
            title: String(item.title || src?.title || `${params.genre} Idea #${idx + 1}`),
            hookIdea: String(item.hookIdea || ''),
            viralTrigger: String(item.viralTrigger || 'Fresh live web curiosity hook'),
            suggestedAngle: String(item.suggestedAngle || src?.snippet || ''),
            sourceTitle: src?.sourceTitle,
            sourceUrl: src?.sourceUrl,
            fetchedAt: now,
          };
        });
        return { ideas, groundingSources };
      }
    } catch {
      // Fall through cleanly to direct live-headline card formatting below
    }
  }

  if (liveArticles.length === 0) {
    throw new Error('Could not reach live web search or public RSS feeds right now. Check internet connectivity or try another keyword.');
  }

  const directIdeas: OnlineViralIdea[] = liveArticles.slice(0, 5).map((art, idx) => ({
    id: `idea_${Date.now()}_${idx}`,
    genre: params.genre,
    language: params.language,
    title: art.title,
    hookIdea:
      params.language === 'Hindi'
        ? `क्या आपने आज की यह बड़ी ${params.genre} अपडेट देखी? — ${art.title.slice(0, 80)}`
        : params.language === 'Hinglish'
          ? `Wait — kya aapne yeh latest ${params.genre} story dekhi? "${art.title.slice(0, 72)}"`
          : `Wait — did you see what just surfaced in ${params.genre}? ${art.title.slice(0, 80)}`,
    viralTrigger: `Fresh live discovery from ${art.sourceTitle} ready for a 30s+ creator breakdown.`,
    suggestedAngle: art.snippet || art.title,
    sourceTitle: art.sourceTitle,
    sourceUrl: art.sourceUrl,
    fetchedAt: now,
  }));

  return { ideas: directIdeas, groundingSources };
}

export async function rewriteScriptVariant(params: {
  hook3s: string;
  body: string;
  cta: string;
  action: RewriteAction;
  genre?: ScriptGenre;
  writingStyle?: WritingStyleMode;
  language: TwinLanguage;
  personality: PersonalityProfile;
}): Promise<{ hook3s: string; body: string; cta: string; wordCount: number; estimatedDurationSec: number }> {
  const ai = getAiClient();

  const instructionMap: Record<RewriteAction, string> = {
    punch_hook:
      'Rewrite the 3-second opening hook to stop the scroll immediately using curiosity, surprise, or contrast, while keeping the body and CTA tight and aligned.',
    add_comedy:
      'Infuse witty observational humour, crisp comedic timing, and a memorable relatable punchline/callback while preserving the core message.',
    deepen_science:
      'Enrich the script with a fascinating verifiable scientific mechanism, concrete real-world analogy, or surprising mind-blowing fact.',
    expand_45s:
      'Expand the monologue naturally to ~110 words (~45-50 seconds spoken) with clear rhythmic pauses and an extra relatable example, never using filler.',
    to_hindi:
      'Translate and naturally adapt the entire script (hook3s, body, cta) into fluent, warm spoken Devanagari Hindi suitable for natural Indian delivery (at least 75 words / >=30s).',
    to_hinglish:
      'Adapt the entire script naturally into crisp conversational Indian Hinglish (Latin script blend of everyday Hindi and English, at least 75 words / >=30s).',
    to_english:
      'Adapt the entire script into sharp, conversational modern English (at least 75 words / >=30s).',
    sharpen_cta:
      'Make the closing CTA much more compelling to trigger thoughtful comments, saves, and shares.',
  };

  const prompt = `
You are an expert creator script editor for ${params.personality.creatorName || 'this creator'}.
Genre: ${params.genre || 'Knowledge'} · Writing Style: ${params.writingStyle || 'Viral Hook & Curiosity'} · Speaking Style: ${params.personality.speakingStyle}.

EDITING TASK: ${instructionMap[params.action]}
Keep the full script minimum 75 words (>=30 seconds spoken).

CURRENT SCRIPT:
- hook3s: ${params.hook3s}
- body: ${params.body}
- cta: ${params.cta}

Return JSON strictly with keys: hook3s, body, cta.
`.trim();

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          hook3s: { type: Type.STRING },
          body: { type: Type.STRING },
          cta: { type: Type.STRING },
        },
        required: ['hook3s', 'body', 'cta'],
      },
    },
  });

  const cleaned = (response.text || '{}')
    .replace(/^```json\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const parsed = JSON.parse(cleaned);
  const hook3s = String(parsed.hook3s || params.hook3s);
  const body = String(parsed.body || params.body);
  const cta = String(parsed.cta || params.cta);
  const wc = `${hook3s} ${body} ${cta}`.trim().split(/\s+/).filter(Boolean).length;

  return {
    hook3s,
    body,
    cta,
    wordCount: wc,
    estimatedDurationSec: Math.max(30, Math.round(wc / 2.3)),
  };
}

export async function synthesizeGeminiSpeechWav(params: {
  text: string;
  provider: VoiceProviderId;
  voiceIdentity: string;
  language: TwinLanguage;
  emotion: string;
  outputWavPath: string;
}): Promise<{ wavPath: string; byteLength: number; modelUsed: string }> {
  const ai = getAiClient();
  const primaryModel =
    params.provider === 'gemini_flash_tts'
      ? 'gemini-3.8-flash-tts'
      : 'gemini-3.8-flash-lite-tts';

  const validVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr', 'Aoede', 'Leda', 'Orus'];
  const chosenVoice = validVoices.includes(params.voiceIdentity) ? params.voiceIdentity : 'Charon';

  const langPrompt =
    params.language === 'Hindi'
      ? 'Speak naturally in fluent conversational Hindi with warm Indian intonation: '
      : params.language === 'Hinglish'
        ? 'Speak with natural Indian Hinglish cadence: '
        : '';

  const styleCue =
    params.language === 'Hindi'
      ? `${params.emotion}, natural fluent Hindi Indian speaker with warm conversational cadence and clear pauses`
      : params.language === 'Hinglish'
        ? `${params.emotion}, natural urban Indian Hinglish creator delivery with authentic pronunciation`
        : `${params.emotion}, articulate creator delivery with natural breathing and conversational pacing`;

  const callGenerateTts = async (modelName: string, includeMetadata: boolean) => {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${langPrompt}${params.text}`,
              ...(includeMetadata && modelName.startsWith('gemini-3.8')
                ? {
                    speechMetadata: {
                      style: styleCue,
                    },
                  }
                : {}),
            } as any,
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: chosenVoice },
          },
        },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts || [];
    const audioPart = parts.find((p) => p.inlineData?.data);
    return audioPart?.inlineData || null;
  };

  let inlineData: { data?: string; mimeType?: string } | null = null;
  let modelUsed = primaryModel;

  try {
    try {
      inlineData = await callGenerateTts(primaryModel, true);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('speechMetadata') || msg.includes('400')) {
        inlineData = await callGenerateTts(primaryModel, false);
      } else {
        throw err;
      }
    }
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (msg.includes('404') || err?.status === 404 || msg.toLowerCase().includes('not found')) {
      modelUsed = 'gemini-2.5-flash-preview-tts';
      inlineData = await callGenerateTts(modelUsed, false);
    } else {
      throw err;
    }
  }

  if (!inlineData?.data) {
    throw new Error('Gemini TTS did not return audio data.');
  }

  const rawBuffer = Buffer.from(inlineData.data, 'base64');
  // Check if buffer already begins with RIFF WAV header; if raw L16 PCM, wrap with 44-byte RIFF WAV header
  const isRiffWav =
    rawBuffer.length >= 12 &&
    rawBuffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    rawBuffer.subarray(8, 12).toString('ascii') === 'WAVE';

  let finalWav = rawBuffer;
  if (!isRiffWav) {
    const sampleRate = 24000;
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + rawBuffer.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(rawBuffer.length, 40);
    finalWav = Buffer.concat([header, rawBuffer]);
  }

  await fs.mkdir(path.dirname(params.outputWavPath), { recursive: true });
  await fs.writeFile(params.outputWavPath, finalWav);

  return {
    wavPath: params.outputWavPath,
    byteLength: finalWav.length,
    modelUsed,
  };
}

export async function transcribeUploadedAudio(params: {
  audioFilePath: string;
  mimeType: string;
  languageHint: TwinLanguage;
}): Promise<string> {
  const ai = getAiClient();
  const raw = await fs.readFile(params.audioFilePath);
  const b64 = raw.toString('base64');

  const safeMime =
    params.mimeType && params.mimeType.startsWith('audio/') ? params.mimeType : 'audio/wav';

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          { inlineData: { mimeType: safeMime, data: b64 } },
          {
            text: `Transcribe this voice sample accurately. Language context: ${params.languageHint}. Return only the spoken transcript.`,
          },
        ],
      },
    });
    return (response.text || '').trim();
  } catch (err: any) {
    if (String(err?.message || '').includes('404')) {
      const fallback = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            { inlineData: { mimeType: safeMime, data: b64 } },
            {
              text: `Transcribe this voice sample accurately. Language context: ${params.languageHint}. Return only the spoken transcript.`,
            },
          ],
        },
      });
      return (fallback.text || '').trim();
    }
    throw err;
  }
}

export async function generatePremiumVeoClip(params: {
  portraitImagePath: string;
  prompt: string;
  aspectRatio: '9:16' | '16:9';
  durationSec: number;
  outputRawMp4Path: string;
}): Promise<{ rawVideoPath: string }> {
  const ai = getAiClient();
  const imgBuf = await fs.readFile(params.portraitImagePath);
  const ext = path.extname(params.portraitImagePath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
  const clampedSec = Math.max(3, Math.min(Math.round(params.durationSec || 6), 10));

  const interaction = await ai.interactions.create(
    {
      model: 'gemini-omni-1.2-flash',
      input: [
        {
          type: 'image',
          mime_type: mimeType,
          data: imgBuf.toString('base64'),
        },
        {
          type: 'text',
          text: params.prompt,
        },
      ],
      background: false,
      store: false,
      stream: false,
      response_format: {
        type: 'video',
        aspect_ratio: params.aspectRatio,
        duration: `${clampedSec}s`,
        resolution: '720p',
      },
    },
    { timeout: 300000 }
  );

  const videoPart = interaction.output_video;
  if (!videoPart?.data) {
    throw new Error('Gemini Omni / Veo did not return a video payload.');
  }

  const videoBuffer = Buffer.from(videoPart.data, 'base64');
  await fs.mkdir(path.dirname(params.outputRawMp4Path), { recursive: true });
  await fs.writeFile(params.outputRawMp4Path, videoBuffer);

  return { rawVideoPath: params.outputRawMp4Path };
}

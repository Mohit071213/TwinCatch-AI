// server.ts
import crypto3 from "node:crypto";
import fs5 from "node:fs/promises";
import path5 from "node:path";
import express from "express";
import { XMLParser } from "fast-xml-parser";
import multer from "multer";
import { createServer as createViteServer } from "vite";

// server/gemini.ts
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import fs from "node:fs/promises";
import path from "node:path";
function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error("GEMINI_API_KEY is not configured in the server environment.");
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: "v1beta",
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
function isGeminiConfigured() {
  const apiKey = process.env.GEMINI_API_KEY;
  return Boolean(apiKey && apiKey !== "MY_GEMINI_API_KEY");
}
async function generateIntelligenceScripts(params) {
  const ai = getAiClient();
  const chosenGenre = params.genre || "Knowledge";
  const chosenStyle = params.writingStyle || "Viral Hook & Curiosity";
  const genreGuidance = chosenGenre === "Comedy" ? "Craft sharp comedic setups, relatable timing, unexpected punchlines, and a quick callback in the CTA." : chosenGenre === "Science" ? "Lead with awe-inspiring scientific wonder grounded in real phenomena, explain it via a crystal-clear everyday analogy, and end with a mind-expanding takeaway." : chosenGenre === "Knowledge" || chosenGenre === "History & Facts" ? 'Open with a high-curiosity knowledge gap ("Why X happens / Why most people miss Y"), unpack two concrete insights, and conclude with a memorable mental model.' : chosenGenre === "Myth Busting" ? "Challenge a widespread misconception in the first 3 seconds, show why it fails in reality, and replace it with the true mechanism." : "Deliver an authentic, high-retention narrative with clear beats and zero fluff.";
  const prompt = `
Analyze the following topic and generate a strategic creator angle plus 3 distinct video scripts tailored to this creator's authentic voice and identity.

CREATOR IDENTITY:
- Name: ${params.personality.creatorName || "Creator"} (${params.personality.handle || "@creator"})
- Niche: ${params.personality.niche}
- Speaking Style: ${params.personality.speakingStyle}
- Vocabulary & Tone: ${params.personality.vocabularyNotes}
- Humour: ${params.personality.humourStyle}
- Formality: ${params.personality.formalityLevel}
- Accent/Pronunciation Guidance: ${params.personality.accentAndPronunciation}
- Signature Phrases to weave naturally when fitting: ${params.personality.catchphrases.join(" | ") || "None specified"}

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
    model: "gemini-4-hydrogen",
    contents: prompt,
    config: {
      systemInstruction: "You are an editorial creative director crafting spoken video scripts for a personal digital twin. Keep scripts natural, non-robotic, concise, and free of corporate clich\xE9s.",
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: "application/json",
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
                wordCount: { type: Type.NUMBER }
              },
              required: ["toneName", "hook3s", "body", "cta", "estimatedDurationSec", "wordCount"]
            }
          }
        },
        required: ["recommendedFormat", "thesis", "audiencePainPoint", "ctaStrategy", "variants"]
      }
    }
  });
  const rawText = response.text || "";
  const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned);
  const allowedFormats = [
    "Talking-Head",
    "Presenter-Style",
    "Educational",
    "Original Reaction",
    "Storytelling",
    "Promotional",
    "Short-Form Social"
  ];
  const toneNames = [
    "Natural & Conversational",
    "Educational & Authoritative",
    "Entertaining & Engaging"
  ];
  const variants = (Array.isArray(parsed.variants) ? parsed.variants : []).slice(0, 3).map((v, idx) => {
    const fullWords = `${v.hook3s || ""} ${v.body || ""} ${v.cta || ""}`.trim().split(/\s+/).filter(Boolean).length;
    return {
      id: `var_${Date.now()}_${idx}`,
      toneName: toneNames[idx] || "Natural & Conversational",
      hook3s: String(v.hook3s || ""),
      body: String(v.body || ""),
      cta: String(v.cta || ""),
      wordCount: fullWords || Number(v.wordCount) || 75,
      estimatedDurationSec: Math.max(30, Math.round((fullWords || 75) / 2.3))
    };
  });
  return {
    trendTopic: params.trendTopic,
    genre: chosenGenre,
    writingStyle: chosenStyle,
    sourceUrl: params.sourceUrl,
    language: params.language,
    recommendedFormat: allowedFormats.includes(parsed.recommendedFormat) ? parsed.recommendedFormat : "Talking-Head",
    thesis: String(parsed.thesis || ""),
    audiencePainPoint: String(parsed.audiencePainPoint || ""),
    ctaStrategy: String(parsed.ctaStrategy || ""),
    selectedVariantId: variants[0]?.id || "",
    variants
  };
}
async function fetchLivePublicHeadlines(genre, query) {
  const results = [];
  const genreSearchKeywords = {
    Comedy: "viral funny observational humor relatable trend comedy",
    Knowledge: "surprising everyday facts explained hidden design secret",
    Science: "breakthrough science discovery physics biology study",
    "Myth Busting": "common myth debunked science fact vs fiction",
    Psychology: "human psychology cognitive bias behavior study",
    "Tech & AI": "AI workflow creator technology breakthrough",
    Storytelling: "remarkable true story human resilience turning point",
    "Business & Finance": "smart creator economy startup money lesson",
    "History & Facts": "fascinating forgotten history historical mystery"
  };
  const qStr = query?.trim() ? `${query.trim()} ${genre}` : genreSearchKeywords[genre] || genre;
  const parseRssXml = (xml, fallbackSource) => {
    const items = [];
    const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
    for (const block of itemMatches.slice(0, 8)) {
      const rawTitle = (block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
      const rawLink = (block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
      const rawDesc = (block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const srcName = (block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || fallbackSource).replace(/<[^>]+>/g, "").trim() || fallbackSource;
      if (rawTitle && rawLink.startsWith("http")) {
        items.push({
          title: rawTitle,
          snippet: rawDesc.slice(0, 220),
          sourceTitle: srcName,
          sourceUrl: rawLink
        });
      }
    }
    return items;
  };
  const feedTasks = [
    fetch(
      `https://news.google.com/rss/search?q=${encodeURIComponent(qStr)}&hl=en-IN&gl=IN&ceid=IN:en`,
      { signal: AbortSignal.timeout(7e3) }
    ).then((r) => r.ok ? r.text() : "").then((xml) => {
      if (xml) results.push(...parseRssXml(xml, "Google News Live"));
    }).catch(() => {
    })
  ];
  if (genre === "Science" || genre === "Myth Busting") {
    feedTasks.push(
      fetch("https://www.sciencedaily.com/rss/top/science.xml", {
        signal: AbortSignal.timeout(7e3)
      }).then((r) => r.ok ? r.text() : "").then((xml) => {
        if (xml) results.push(...parseRssXml(xml, "ScienceDaily"));
      }).catch(() => {
      })
    );
  }
  if (genre === "Knowledge" || genre === "History & Facts" || genre === "Psychology") {
    feedTasks.push(
      fetch("https://www.smithsonianmag.com/rss/smart-news/", {
        signal: AbortSignal.timeout(7e3)
      }).then((r) => r.ok ? r.text() : "").then((xml) => {
        if (xml) results.push(...parseRssXml(xml, "Smithsonian Smart News"));
      }).catch(() => {
      })
    );
    const wikiDate = new Date(Date.now() - 864e5).toISOString().slice(0, 10).replace(/-/g, "/");
    feedTasks.push(
      fetch(`https://en.wikipedia.org/api/rest_v1/feed/featured/${wikiDate}`, {
        signal: AbortSignal.timeout(7e3)
      }).then((r) => r.ok ? r.json() : null).then((data) => {
        const mostread = Array.isArray(data?.mostread?.articles) ? data.mostread.articles : [];
        for (const art of mostread.slice(0, 4)) {
          const url = art?.content_urls?.desktop?.page;
          if (art?.normalizedtitle && url) {
            results.push({
              title: String(art.normalizedtitle),
              snippet: String(art.extract || art.description || "").slice(0, 220),
              sourceTitle: "Wikipedia Trending",
              sourceUrl: url
            });
          }
        }
      }).catch(() => {
      })
    );
  }
  await Promise.all(feedTasks);
  return results.slice(0, 10);
}
async function fetchOnlineViralIdeas(params) {
  const focusClause = params.query?.trim() ? `Focused specifically around: "${params.query.trim()}".` : `Discover fresh, currently trending or endlessly shareable viral hooks in ${params.genre}.`;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (isGeminiConfigured()) {
    try {
      const ai = getAiClient();
      const searchPrompt = `
Use Google Search to find 5 real, fresh, high-engagement viral short-video ideas in the "${params.genre}" category for a digital twin video creator.
${focusClause}
Creator niche context: ${params.personality.niche || "General viral creator"}.
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
        model: "gemini-4-hydrogen",
        contents: searchPrompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          tools: [{ googleSearch: {} }]
        }
      });
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const groundingSources2 = chunks.map((c) => ({
        title: String(c?.web?.title || "").trim(),
        url: String(c?.web?.uri || "").trim()
      })).filter((s) => Boolean(s.url));
      const rawText = (response.text || "").trim();
      let parsedList = [];
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
        const ideas = parsedList.slice(0, 6).map((item, idx) => {
          const src = groundingSources2[idx % Math.max(1, groundingSources2.length)];
          return {
            id: `idea_${Date.now()}_${idx}`,
            genre: params.genre,
            language: params.language,
            title: String(item.title || `${params.genre} Viral Concept #${idx + 1}`),
            hookIdea: String(item.hookIdea || ""),
            viralTrigger: String(item.viralTrigger || "High curiosity gap and relatable twist"),
            suggestedAngle: String(item.suggestedAngle || ""),
            sourceTitle: src?.title || void 0,
            sourceUrl: src?.url || void 0,
            fetchedAt: now
          };
        });
        return { ideas, groundingSources: groundingSources2 };
      }
    } catch {
    }
  }
  const liveArticles = await fetchLivePublicHeadlines(params.genre, params.query);
  const groundingSources = liveArticles.map((a) => ({ title: a.sourceTitle, url: a.sourceUrl }));
  if (isGeminiConfigured() && liveArticles.length > 0) {
    try {
      const ai = getAiClient();
      const synthPrompt = `
Turn these live online stories/headlines into 5 high-retention ${params.genre} viral video script ideas in ${params.language} for creator ${params.personality.creatorName || "Creator"} (${params.personality.niche}).
${focusClause}

LIVE WEB SOURCES:
${liveArticles.map((a, i) => `${i + 1}. [${a.sourceTitle}] ${a.title} \u2014 ${a.snippet}`).join("\n")}

Return JSON strictly matching the schema (include sourceIndex matching 0..${liveArticles.length - 1}).
`.trim();
      const resp = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: synthPrompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                sourceIndex: { type: Type.NUMBER },
                title: { type: Type.STRING },
                hookIdea: { type: Type.STRING },
                viralTrigger: { type: Type.STRING },
                suggestedAngle: { type: Type.STRING }
              },
              required: ["title", "hookIdea", "viralTrigger", "suggestedAngle"]
            }
          }
        }
      });
      const parsed = JSON.parse(
        (resp.text || "[]").replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim()
      );
      if (Array.isArray(parsed) && parsed.length > 0) {
        const ideas = parsed.slice(0, 6).map((item, idx) => {
          const srcIdx = typeof item.sourceIndex === "number" && liveArticles[item.sourceIndex] ? item.sourceIndex : idx % liveArticles.length;
          const src = liveArticles[srcIdx];
          return {
            id: `idea_${Date.now()}_${idx}`,
            genre: params.genre,
            language: params.language,
            title: String(item.title || src?.title || `${params.genre} Idea #${idx + 1}`),
            hookIdea: String(item.hookIdea || ""),
            viralTrigger: String(item.viralTrigger || "Fresh live web curiosity hook"),
            suggestedAngle: String(item.suggestedAngle || src?.snippet || ""),
            sourceTitle: src?.sourceTitle,
            sourceUrl: src?.sourceUrl,
            fetchedAt: now
          };
        });
        return { ideas, groundingSources };
      }
    } catch {
    }
  }
  if (liveArticles.length === 0) {
    throw new Error("Could not reach live web search or public RSS feeds right now. Check internet connectivity or try another keyword.");
  }
  const directIdeas = liveArticles.slice(0, 5).map((art, idx) => ({
    id: `idea_${Date.now()}_${idx}`,
    genre: params.genre,
    language: params.language,
    title: art.title,
    hookIdea: params.language === "Hindi" ? `\u0915\u094D\u092F\u093E \u0906\u092A\u0928\u0947 \u0906\u091C \u0915\u0940 \u092F\u0939 \u092C\u0921\u093C\u0940 ${params.genre} \u0905\u092A\u0921\u0947\u091F \u0926\u0947\u0916\u0940? \u2014 ${art.title.slice(0, 80)}` : params.language === "Hinglish" ? `Wait \u2014 kya aapne yeh latest ${params.genre} story dekhi? "${art.title.slice(0, 72)}"` : `Wait \u2014 did you see what just surfaced in ${params.genre}? ${art.title.slice(0, 80)}`,
    viralTrigger: `Fresh live discovery from ${art.sourceTitle} ready for a 30s+ creator breakdown.`,
    suggestedAngle: art.snippet || art.title,
    sourceTitle: art.sourceTitle,
    sourceUrl: art.sourceUrl,
    fetchedAt: now
  }));
  return { ideas: directIdeas, groundingSources };
}
async function rewriteScriptVariant(params) {
  const ai = getAiClient();
  const instructionMap = {
    punch_hook: "Rewrite the 3-second opening hook to stop the scroll immediately using curiosity, surprise, or contrast, while keeping the body and CTA tight and aligned.",
    add_comedy: "Infuse witty observational humour, crisp comedic timing, and a memorable relatable punchline/callback while preserving the core message.",
    deepen_science: "Enrich the script with a fascinating verifiable scientific mechanism, concrete real-world analogy, or surprising mind-blowing fact.",
    expand_45s: "Expand the monologue naturally to ~110 words (~45-50 seconds spoken) with clear rhythmic pauses and an extra relatable example, never using filler.",
    to_hindi: "Translate and naturally adapt the entire script (hook3s, body, cta) into fluent, warm spoken Devanagari Hindi suitable for natural Indian delivery (at least 75 words / >=30s).",
    to_hinglish: "Adapt the entire script naturally into crisp conversational Indian Hinglish (Latin script blend of everyday Hindi and English, at least 75 words / >=30s).",
    to_english: "Adapt the entire script into sharp, conversational modern English (at least 75 words / >=30s).",
    sharpen_cta: "Make the closing CTA much more compelling to trigger thoughtful comments, saves, and shares."
  };
  const prompt = `
You are an expert creator script editor for ${params.personality.creatorName || "this creator"}.
Genre: ${params.genre || "Knowledge"} \xB7 Writing Style: ${params.writingStyle || "Viral Hook & Curiosity"} \xB7 Speaking Style: ${params.personality.speakingStyle}.

EDITING TASK: ${instructionMap[params.action]}
Keep the full script minimum 75 words (>=30 seconds spoken).

CURRENT SCRIPT:
- hook3s: ${params.hook3s}
- body: ${params.body}
- cta: ${params.cta}

Return JSON strictly with keys: hook3s, body, cta.
`.trim();
  const response = await ai.models.generateContent({
    model: "gemini-4-hydrogen",
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          hook3s: { type: Type.STRING },
          body: { type: Type.STRING },
          cta: { type: Type.STRING }
        },
        required: ["hook3s", "body", "cta"]
      }
    }
  });
  const cleaned = (response.text || "{}").replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
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
    estimatedDurationSec: Math.max(30, Math.round(wc / 2.3))
  };
}
async function synthesizeGeminiSpeechWav(params) {
  const ai = getAiClient();
  const primaryModel = params.provider === "gemini_flash_tts" ? "gemini-3.8-flash-tts" : "gemini-3.8-flash-lite-tts";
  const validVoices = ["Puck", "Charon", "Kore", "Fenrir", "Zephyr", "Aoede", "Leda", "Orus"];
  const chosenVoice = validVoices.includes(params.voiceIdentity) ? params.voiceIdentity : "Charon";
  const langPrompt = params.language === "Hindi" ? "Speak naturally in fluent conversational Hindi with warm Indian intonation: " : params.language === "Hinglish" ? "Speak with natural Indian Hinglish cadence: " : "";
  const styleCue = params.language === "Hindi" ? `${params.emotion}, natural fluent Hindi Indian speaker with warm conversational cadence and clear pauses` : params.language === "Hinglish" ? `${params.emotion}, natural urban Indian Hinglish creator delivery with authentic pronunciation` : `${params.emotion}, articulate creator delivery with natural breathing and conversational pacing`;
  const callGenerateTts = async (modelName, includeMetadata) => {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${langPrompt}${params.text}`,
              ...includeMetadata && modelName.startsWith("gemini-3.8") ? {
                speechMetadata: {
                  style: styleCue
                }
              } : {}
            }
          ]
        }
      ],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: chosenVoice }
          }
        }
      }
    });
    const parts = response.candidates?.[0]?.content?.parts || [];
    const audioPart = parts.find((p) => p.inlineData?.data);
    return audioPart?.inlineData || null;
  };
  let inlineData = null;
  let modelUsed = primaryModel;
  try {
    try {
      inlineData = await callGenerateTts(primaryModel, true);
    } catch (err) {
      const msg = String(err?.message || "");
      if (msg.includes("speechMetadata") || msg.includes("400")) {
        inlineData = await callGenerateTts(primaryModel, false);
      } else {
        throw err;
      }
    }
  } catch (err) {
    const msg = String(err?.message || "");
    if (msg.includes("404") || err?.status === 404 || msg.toLowerCase().includes("not found")) {
      modelUsed = "gemini-2.5-flash-preview-tts";
      inlineData = await callGenerateTts(modelUsed, false);
    } else {
      throw err;
    }
  }
  if (!inlineData?.data) {
    throw new Error("Gemini TTS did not return audio data.");
  }
  const rawBuffer = Buffer.from(inlineData.data, "base64");
  const isRiffWav = rawBuffer.length >= 12 && rawBuffer.subarray(0, 4).toString("ascii") === "RIFF" && rawBuffer.subarray(8, 12).toString("ascii") === "WAVE";
  let finalWav = rawBuffer;
  if (!isRiffWav) {
    const sampleRate = 24e3;
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + rawBuffer.length, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(rawBuffer.length, 40);
    finalWav = Buffer.concat([header, rawBuffer]);
  }
  await fs.mkdir(path.dirname(params.outputWavPath), { recursive: true });
  await fs.writeFile(params.outputWavPath, finalWav);
  return {
    wavPath: params.outputWavPath,
    byteLength: finalWav.length,
    modelUsed
  };
}
async function transcribeUploadedAudio(params) {
  const ai = getAiClient();
  const raw = await fs.readFile(params.audioFilePath);
  const b64 = raw.toString("base64");
  const safeMime = params.mimeType && params.mimeType.startsWith("audio/") ? params.mimeType : "audio/wav";
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-transcribe",
      contents: {
        parts: [
          { inlineData: { mimeType: safeMime, data: b64 } },
          {
            text: `Transcribe this voice sample accurately. Language context: ${params.languageHint}. Return only the spoken transcript.`
          }
        ]
      }
    });
    return (response.text || "").trim();
  } catch (err) {
    if (String(err?.message || "").includes("404")) {
      const fallback = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: {
          parts: [
            { inlineData: { mimeType: safeMime, data: b64 } },
            {
              text: `Transcribe this voice sample accurately. Language context: ${params.languageHint}. Return only the spoken transcript.`
            }
          ]
        }
      });
      return (fallback.text || "").trim();
    }
    throw err;
  }
}
async function generatePremiumVeoClip(params) {
  const ai = getAiClient();
  const imgBuf = await fs.readFile(params.portraitImagePath);
  const ext = path.extname(params.portraitImagePath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
  const clampedSec = Math.max(3, Math.min(Math.round(params.durationSec || 6), 10));
  const interaction = await ai.interactions.create(
    {
      model: "gemini-omni-1.2-flash",
      input: [
        {
          type: "image",
          mime_type: mimeType,
          data: imgBuf.toString("base64")
        },
        {
          type: "text",
          text: params.prompt
        }
      ],
      background: false,
      store: false,
      stream: false,
      response_format: {
        type: "video",
        aspect_ratio: params.aspectRatio,
        duration: `${clampedSec}s`,
        resolution: "720p"
      }
    },
    { timeout: 3e5 }
  );
  const videoPart = interaction.output_video;
  if (!videoPart?.data) {
    throw new Error("Gemini Omni / Veo did not return a video payload.");
  }
  const videoBuffer = Buffer.from(videoPart.data, "base64");
  await fs.mkdir(path.dirname(params.outputRawMp4Path), { recursive: true });
  await fs.writeFile(params.outputRawMp4Path, videoBuffer);
  return { rawVideoPath: params.outputRawMp4Path };
}

// server/media.ts
import { execFile, spawn } from "node:child_process";
import fs2 from "node:fs/promises";
import path2 from "node:path";
import { promisify } from "node:util";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
var execFileAsync = promisify(execFile);
var MIN_VIDEO_DURATION_SEC = 30;
var ALLOWED_FREE_HINDI_VOICES = [
  "en-US-AndrewMultilingualNeural",
  "en-US-BrianMultilingualNeural",
  "hi-IN-MadhurNeural",
  "en-IN-PrabhatNeural",
  "en-US-AvaMultilingualNeural",
  "en-US-EmmaMultilingualNeural",
  "hi-IN-SwaraNeural",
  "en-IN-NeerjaNeural"
];
var cachedHasDrawtext = null;
var cachedFfmpegOk = null;
async function checkFfmpegAvailable() {
  if (cachedFfmpegOk !== null) return cachedFfmpegOk;
  try {
    await execFileAsync("ffmpeg", ["-version"], { timeout: 5e3 });
    cachedFfmpegOk = true;
  } catch {
    cachedFfmpegOk = false;
  }
  return cachedFfmpegOk;
}
async function hasDrawtextFilter() {
  if (cachedHasDrawtext !== null) return cachedHasDrawtext;
  try {
    const { stdout } = await execFileAsync("ffmpeg", ["-hide_banner", "-filters"], { timeout: 5e3 });
    cachedHasDrawtext = stdout.includes("drawtext");
  } catch {
    cachedHasDrawtext = false;
  }
  return cachedHasDrawtext;
}
async function getMediaDurationSec(filePath) {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath
      ],
      { timeout: 8e3 }
    );
    const parsed = Number.parseFloat(stdout.trim());
    return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : 0;
  } catch {
    return 0;
  }
}
async function synthesizeAmbientStudioWav(params) {
  await fs2.mkdir(path2.dirname(params.outputWavPath), { recursive: true });
  const dur = Math.max(4, Math.min(45, Math.round(params.durationSec || 8)));
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `aevalsrc=0.06*sin(2*PI*220*t)*(0.5+0.5*sin(2*PI*t/1.5))+0.04*sin(2*PI*330*t)*(0.5+0.5*sin(2*PI*t/2.2))+0.025*sin(2*PI*440*t)*(0.5+0.5*sin(2*PI*t/3.1)):s=24000:c=mono:d=${dur}`,
      "-c:a",
      "pcm_s16le",
      params.outputWavPath
    ],
    { timeout: 15e3 }
  );
}
function escapeSsmlText(input) {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function runFfmpegPipe(args, stdinBuffer, timeoutMs = 2e4) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });
    const outChunks = [];
    let errText = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`FFmpeg pipe timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => outChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => {
      errText += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(Buffer.concat(outChunks));
      } else {
        reject(new Error(`FFmpeg pipe exited with code ${code}: ${errText.slice(-300)}`));
      }
    });
    child.stdin.on("error", () => {
    });
    child.stdin.end(stdinBuffer);
  });
}
function msToSilencePcm24k(ms) {
  const clampedMs = Math.max(0, Math.min(1200, Math.round(ms)));
  const byteCount = clampedMs * 48;
  return Buffer.alloc(byteCount - byteCount % 2, 0);
}
function segmentConversationalPhrases(rawText, preset, naturalPauses) {
  const cleaned = rawText.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!cleaned) return [];
  if (!naturalPauses) {
    return [{ text: cleaned.replace(/\n+/g, " "), pauseAfterMs: 80 }];
  }
  const pauseProfile = preset === "calm_mentor" ? { sentence: 360, clause: 175 } : preset === "lively_creator" ? { sentence: 215, clause: 110 } : preset === "friendly_explainer" ? { sentence: 270, clause: 135 } : { sentence: 320, clause: 155 };
  const paragraphs = cleaned.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const phrases = [];
  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const para = paragraphs[pIdx];
    const rawTokens = para.split(/(?<=[।?!]|(?<!\d)\.(?!\d)|\.{3}|[—–;])\s+/).map((s) => s.trim()).filter(Boolean);
    const fineSegments = [];
    for (const token of rawTokens) {
      if (token.length > 95 && token.includes(",")) {
        const subParts = token.split(/(?<=,)\s+/).map((x) => x.trim()).filter(Boolean);
        subParts.forEach((sub, sIdx) => {
          const isLastSub = sIdx === subParts.length - 1;
          fineSegments.push({
            text: sub,
            kind: !isLastSub || /[—–;,]$/.test(sub) ? "clause" : "sentence"
          });
        });
      } else {
        const isClause = /[—–;,]$/.test(token);
        fineSegments.push({ text: token, kind: isClause ? "clause" : "sentence" });
      }
    }
    const merged = [];
    for (const seg of fineSegments) {
      if (merged.length > 0 && seg.text.length < 16) {
        merged[merged.length - 1].text = `${merged[merged.length - 1].text} ${seg.text}`;
        merged[merged.length - 1].kind = seg.kind;
      } else if (merged.length > 0 && merged[merged.length - 1].text.length < 18) {
        merged[merged.length - 1].text = `${merged[merged.length - 1].text} ${seg.text}`;
        merged[merged.length - 1].kind = seg.kind;
      } else {
        merged.push({ ...seg });
      }
    }
    merged.forEach((m, idx) => {
      const isLastInPara = idx === merged.length - 1;
      const isVeryLast = pIdx === paragraphs.length - 1 && isLastInPara;
      const pauseAfterMs = isVeryLast ? 90 : isLastInPara && paragraphs.length > 1 ? pauseProfile.sentence + 85 : m.kind === "clause" ? pauseProfile.clause : pauseProfile.sentence;
      phrases.push({ text: m.text, pauseAfterMs });
    });
  }
  return phrases.length > 0 ? phrases : [{ text: cleaned, pauseAfterMs: 90 }];
}
async function synthesizeEdgeNeuralSpeechWav(params) {
  await fs2.mkdir(path2.dirname(params.outputWavPath), { recursive: true });
  const voiceUsed = ALLOWED_FREE_HINDI_VOICES.includes(params.voiceIdentity) ? params.voiceIdentity : params.language === "English" ? "en-US-AvaMultilingualNeural" : "en-US-AndrewMultilingualNeural";
  const preset = params.prosodyPreset || "warm_storyteller";
  const presetDefaults = preset === "calm_mentor" ? { pace: 0.92, warmth: "warm" } : preset === "lively_creator" ? { pace: 1.04, warmth: "bright" } : preset === "friendly_explainer" ? { pace: 0.98, warmth: "natural" } : { pace: 0.95, warmth: "warm" };
  const effectivePace = Math.max(
    0.85,
    Math.min(1.15, Number(params.speakingSpeed) || presetDefaults.pace)
  );
  const warmth = params.pitchWarmth || presetDefaults.warmth;
  const naturalPauses = params.naturalPauses !== false;
  const ratePct = Math.round((effectivePace - 1) * 100);
  const rateStr = `${ratePct >= 0 ? "+" : ""}${ratePct}%`;
  const pitchStr = warmth === "warm" ? "-4Hz" : warmth === "bright" ? "+4Hz" : "+0Hz";
  const phrases = segmentConversationalPhrases(params.text.slice(0, 2200), preset, naturalPauses);
  const tts = new MsEdgeTTS({ connectionTimeoutMs: 12e3, synthesisTimeoutMs: 25e3 });
  const pcmParts = [msToSilencePcm24k(60)];
  try {
    await tts.setMetadata(voiceUsed, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    for (const phrase of phrases) {
      const { audioStream } = tts.toStream(escapeSsmlText(phrase.text), {
        rate: rateStr,
        pitch: pitchStr
      });
      const chunks = [];
      for await (const chunk of audioStream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const mp3Buf = Buffer.concat(chunks);
      if (mp3Buf.length < 128) {
        throw new Error(`Free Neural Hindi TTS returned an empty segment for ${voiceUsed}.`);
      }
      const pcmChunk = await runFfmpegPipe(
        ["-v", "error", "-f", "mp3", "-i", "pipe:0", "-ar", "24000", "-ac", "1", "-f", "s16le", "pipe:1"],
        mp3Buf,
        15e3
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
    }
  }
  const combinedPcm = Buffer.concat(pcmParts);
  if (combinedPcm.length < 512) {
    throw new Error("Free Neural Hindi TTS returned insufficient audio.");
  }
  const tmpPcm = `${params.outputWavPath}.tmp.pcm`;
  await fs2.writeFile(tmpPcm, combinedPcm);
  try {
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "s16le",
        "-ar",
        "24000",
        "-ac",
        "1",
        "-i",
        tmpPcm,
        "-af",
        "highpass=f=75,equalizer=f=210:t=q:w=1.1:g=2.0,equalizer=f=4400:t=q:w=1.3:g=-1.5,loudnorm=I=-16:TP=-1.5:LRA=9",
        "-ar",
        "24000",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        params.outputWavPath
      ],
      { timeout: 25e3 }
    );
  } finally {
    await fs2.unlink(tmpPcm).catch(() => {
    });
  }
  const stat = await fs2.stat(params.outputWavPath);
  return {
    wavPath: params.outputWavPath,
    voiceUsed,
    byteLength: stat.size
  };
}
function escapeDrawtext(input) {
  return input.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/%/g, "\\%").replace(/\[/g, "\\[").replace(/\]/g, "\\]").replace(/,/g, "\\,").replace(/\n/g, " ").trim();
}
function chunkTimedSubtitles(text, totalDurationSec, maxCharsPerLine) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return [];
  const chunks = [];
  let currentChunk = [];
  for (const w of words) {
    currentChunk.push(w);
    if (currentChunk.join(" ").length >= maxCharsPerLine * 1.8) {
      chunks.push(currentChunk);
      currentChunk = [];
    }
  }
  if (currentChunk.length > 0) chunks.push(currentChunk);
  const sliceSec = totalDurationSec / chunks.length;
  return chunks.map((chunkWords, i) => {
    const line1 = [];
    const line2 = [];
    for (const w of chunkWords) {
      if ((line1.join(" ") + " " + w).trim().length <= maxCharsPerLine && line2.length === 0) {
        line1.push(w);
      } else {
        line2.push(w);
      }
    }
    return {
      lines: [line1.join(" "), line2.join(" ")].filter(Boolean),
      start: Number((i * sliceSec).toFixed(2)),
      end: Number(((i + 1) * sliceSec).toFixed(2))
    };
  });
}
function dimensionsForAspect(aspectRatio) {
  if (aspectRatio === "1:1") return { w: 720, h: 720 };
  if (aspectRatio === "16:9") return { w: 1280, h: 720 };
  return { w: 720, h: 1280 };
}
async function renderTwinVideoFFmpeg(opts) {
  const start = Date.now();
  await fs2.mkdir(path2.dirname(opts.outputVideoPath), { recursive: true });
  await fs2.mkdir(path2.dirname(opts.outputThumbPath), { recursive: true });
  const { w, h } = dimensionsForAspect(opts.aspectRatio);
  const speed = Math.max(0.75, Math.min(1.35, Number(opts.speakingSpeed) || 1));
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
  const bgColor = opts.backgroundStyle === "Warm Charcoal" ? "0x1A1917" : opts.backgroundStyle === "Cosmic & Science Lab" ? "0x0F1528" : opts.backgroundStyle === "Warm Comedy Stage" ? "0x2A1D15" : opts.backgroundStyle === "Auto-Match Script Theme" ? "0x181715" : opts.backgroundStyle === "Architectural Daylight" ? "0xEAE4D7" : "0xF6F3EC";
  const uniqueImages = [];
  for (const p of [opts.portraitPath, ...opts.sceneImagePaths || []]) {
    if (p && !/\.(mp4|mov|webm)$/i.test(p) && !uniqueImages.includes(p)) {
      try {
        await fs2.access(p);
        uniqueImages.push(p);
      } catch {
      }
    }
  }
  const bgImages = [];
  for (const p of opts.sceneBackgroundPaths || []) {
    if (p && !/\.(mp4|mov|webm)$/i.test(p) && !bgImages.includes(p)) {
      try {
        await fs2.access(p);
        bgImages.push(p);
      } catch {
      }
    }
  }
  if (uniqueImages.length === 0 && bgImages.length > 0) {
    uniqueImages.push(bgImages[0]);
  }
  if (uniqueImages.length === 0 && !isVideoPortrait) {
    uniqueImages.push(opts.portraitPath);
  }
  const args = ["-y"];
  const filters = [];
  const fps = 25;
  const framingStartZoom = opts.framing === "Close-Up Studio" ? 1.14 : opts.framing === "Presenter Bust" ? 1.07 : 1.02;
  let audioInputIdx = 1;
  if (isVideoPortrait) {
    args.push("-stream_loop", "-1", "-i", opts.portraitPath);
    filters.push(
      `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=${fps},settb=AVTB,setsar=1,eq=contrast=1.04:saturation=0.98[base]`
    );
    audioInputIdx = 1;
  } else {
    const shotCount = 6;
    const xfadeDur = 0.4;
    const rawShotDur = Number(((targetDuration + xfadeDur * (shotCount - 1)) / shotCount).toFixed(2));
    const shotFrames = Math.max(60, Math.round(rawShotDur * fps));
    let shotImages;
    if (opts.presenterMode === "faceless_broll" && bgImages.length > 0) {
      shotImages = Array.from({ length: 6 }, (_, idx) => bgImages[idx % bgImages.length]);
    } else if (bgImages.length > 0) {
      shotImages = [
        uniqueImages[0],
        bgImages[0],
        bgImages[1 % bgImages.length],
        uniqueImages[1 % uniqueImages.length] || bgImages[2 % bgImages.length],
        bgImages[2 % bgImages.length],
        bgImages[3 % bgImages.length] || uniqueImages[0]
      ];
    } else {
      shotImages = [
        uniqueImages[0],
        uniqueImages[1 % uniqueImages.length],
        uniqueImages[2 % uniqueImages.length],
        uniqueImages[0],
        uniqueImages[1 % uniqueImages.length],
        uniqueImages[2 % uniqueImages.length]
      ];
    }
    for (const imgPath of shotImages) {
      args.push("-loop", "1", "-t", String(rawShotDur + 0.2), "-framerate", String(fps), "-i", imgPath);
    }
    audioInputIdx = shotCount;
    const shotMoves = [
      `zoompan=z='if(eq(on,1),${framingStartZoom},min(zoom+0.0018,${(framingStartZoom + 0.22).toFixed(2)}))':x='iw/2-(iw/zoom/2)':y='ih/2.5-(ih/zoom/2.5)':d=${shotFrames}:s=${w}x${h}:fps=${fps}`,
      `zoompan=z='${(framingStartZoom + 0.14).toFixed(2)}':x='(iw-iw/zoom)*(on/${shotFrames})':y='ih/2.35-(ih/zoom/2.35)':d=${shotFrames}:s=${w}x${h}:fps=${fps}`,
      `zoompan=z='if(eq(on,1),${(framingStartZoom + 0.24).toFixed(2)},max(zoom-0.0018,${framingStartZoom.toFixed(2)}))':x='iw/2-(iw/zoom/2)':y='ih/2.2-(ih/zoom/2.2)':d=${shotFrames}:s=${w}x${h}:fps=${fps}`,
      `zoompan=z='${(framingStartZoom + 0.12).toFixed(2)}':x='(iw-iw/zoom)*(1-on/${shotFrames})':y='ih/2.4-(ih/zoom/2.4)':d=${shotFrames}:s=${w}x${h}:fps=${fps}`,
      `zoompan=z='if(eq(on,1),${(framingStartZoom + 0.05).toFixed(2)},min(zoom+0.0016,${(framingStartZoom + 0.2).toFixed(2)}))':x='iw/2-(iw/zoom/2)':y='ih/2.45-(ih/zoom/2.45)':d=${shotFrames}:s=${w}x${h}:fps=${fps}`,
      `zoompan=z='if(eq(on,1),${(framingStartZoom + 0.2).toFixed(2)},max(zoom-0.0015,${framingStartZoom.toFixed(2)}))':x='(iw-iw/zoom)*(on/${shotFrames})':y='ih/2.3-(ih/zoom/2.3)':d=${shotFrames}:s=${w}x${h}:fps=${fps}`
    ];
    for (let i = 0; i < shotCount; i++) {
      filters.push(
        `[${i}:v]scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},${shotMoves[i]},settb=AVTB,setsar=1,format=yuv420p,eq=contrast=1.04:saturation=0.98[v${i}]`
      );
    }
    const transitions = ["smoothleft", "slideup", "smoothright", "dissolve", "circleopen"];
    let prev = "v0";
    for (let i = 1; i < shotCount; i++) {
      const offset = Number((i * (rawShotDur - xfadeDur)).toFixed(2));
      const outTag = i === shotCount - 1 ? "base" : `xf${i}`;
      filters.push(
        `[${prev}][v${i}]xfade=transition=${transitions[(i - 1) % transitions.length]}:duration=${xfadeDur}:offset=${offset}[${outTag}]`
      );
      prev = outTag;
    }
  }
  if (hasAudio && opts.audioPath) {
    args.push("-i", opts.audioPath);
  } else {
    args.push(
      "-f",
      "lavfi",
      "-i",
      `aevalsrc=0.06*sin(2*PI*220*t)*(0.5+0.5*sin(2*PI*t/1.5))+0.04*sin(2*PI*330*t)*(0.5+0.5*sin(2*PI*t/2.2))+0.025*sin(2*PI*440*t)*(0.5+0.5*sin(2*PI*t/3.1)):s=44100:c=stereo`
    );
  }
  if (hasAudio && Math.abs(speed - 1) >= 0.05) {
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
  filters.push(
    `[base]drawbox=x=0:y=${h - barHeight}:w=${w}:h=${barHeight}:color=${bgColor}@0.88:t=fill,drawbox=x=0:y=${h - barHeight}:w=${w}:h=2:color=0xE4DDD0@0.9:t=fill[banded]`
  );
  filters.push(`color=c=0xB69A65:s=${w}x3:r=${fps}:d=${targetDuration.toFixed(2)}[progbar]`);
  filters.push(
    `[banded][progbar]overlay=x='-w+(w*t/${targetDuration.toFixed(2)})':y=${h - barHeight}:shortest=1[progressed]`
  );
  filters.push(
    `[awave]showwaves=s=${waveW}x${waveH}:mode=cline:rate=${fps}:colors=0xB69A65@0.95,format=rgba[wave]`
  );
  filters.push(
    `[progressed][wave]overlay=x=${w - waveW - 28}:y=${h - barHeight + 10}:shortest=1[waved]`
  );
  let lastTag = "waved";
  if (drawtextSupported) {
    const isDarkBar = opts.backgroundStyle === "Warm Charcoal" || opts.backgroundStyle === "Auto-Match Script Theme" || opts.backgroundStyle === "Cosmic & Science Lab" || opts.backgroundStyle === "Warm Comedy Stage";
    const textColor = isDarkBar ? "0xF6F3EC" : "0x242421";
    const subtleColor = isDarkBar ? "0xD8B36A" : "0x77766F";
    if (opts.aiDisclosureWatermark) {
      const wm = escapeDrawtext(opts.watermarkText || "AI DIGITAL TWIN \xB7 AUTHORIZED LIKENESS");
      filters.push(
        `[${lastTag}]drawtext=text='${wm}':x=28:y=26:fontsize=${Math.max(13, Math.round(w * 0.019))}:fontcolor=0xFFFFFF@0.92:box=1:boxcolor=0x1A1917@0.65:boxborderw=8[wm]`
      );
      lastTag = "wm";
    }
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
    lastTag = "beat3";
    if (opts.subtitlesEnabled) {
      const titleTag = escapeDrawtext(opts.title.slice(0, 42));
      filters.push(
        `[${lastTag}]drawtext=text='${titleTag}':x=32:y=${h - barHeight + 16}:fontsize=${Math.max(13, Math.round(w * 0.02))}:fontcolor=${subtleColor}[lbl]`
      );
      lastTag = "lbl";
      const timedSegments = chunkTimedSubtitles(
        opts.captionExcerpt || opts.title,
        targetDuration,
        opts.aspectRatio === "16:9" ? 54 : 32
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
  const filterComplex = filters.join(";");
  args.push(
    "-filter_complex",
    filterComplex,
    "-map",
    `[${lastTag}]`,
    "-map",
    "[aout]",
    "-t",
    targetDuration.toFixed(2),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    opts.outputVideoPath
  );
  await execFileAsync("ffmpeg", args, { timeout: 12e4 });
  await execFileAsync(
    "ffmpeg",
    ["-y", "-ss", "0.4", "-i", opts.outputVideoPath, "-vframes", "1", "-q:v", "3", opts.outputThumbPath],
    { timeout: 15e3 }
  );
  return {
    durationSec: Number(targetDuration.toFixed(2)),
    processingMs: Date.now() - start
  };
}
async function transcodeUploadedVideoFFmpeg(opts) {
  const start = Date.now();
  await fs2.mkdir(path2.dirname(opts.outputVideoPath), { recursive: true });
  await fs2.mkdir(path2.dirname(opts.outputThumbPath), { recursive: true });
  const probedVideoDur = await getMediaDurationSec(opts.inputMediaPath);
  const fullDur = Math.max(MIN_VIDEO_DURATION_SEC, probedVideoDur || opts.targetDurationSec || MIN_VIDEO_DURATION_SEC);
  const args = ["-y", "-i", opts.inputMediaPath];
  if (opts.audioPath) {
    args.push("-i", opts.audioPath, "-map", "0:v:0", "-map", "1:a:0", "-af", `apad=whole_dur=${fullDur.toFixed(2)}`);
  } else {
    args.push("-map", "0:v:0", "-map", "0:a?");
  }
  args.push(
    "-t",
    fullDur.toFixed(2),
    "-vf",
    "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=24",
    "-c:v",
    "libx264",
    "-preset",
    "superfast",
    "-threads",
    "2",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    opts.outputVideoPath
  );
  await execFileAsync("ffmpeg", args, { timeout: 18e4 });
  await execFileAsync(
    "ffmpeg",
    ["-y", "-ss", "0.4", "-i", opts.outputVideoPath, "-vframes", "1", "-q:v", "3", opts.outputThumbPath],
    { timeout: 15e3 }
  );
  const durationSec = await getMediaDurationSec(opts.outputVideoPath);
  return {
    durationSec: Math.max(MIN_VIDEO_DURATION_SEC, durationSec || fullDur),
    processingMs: Date.now() - start
  };
}
async function muxAudioAndWatermarkOnVideoFFmpeg(opts) {
  const start = Date.now();
  await fs2.mkdir(path2.dirname(opts.outputVideoPath), { recursive: true });
  await fs2.mkdir(path2.dirname(opts.outputThumbPath), { recursive: true });
  const drawtextSupported = await hasDrawtextFilter();
  const args = ["-y", "-i", opts.sourceVideoPath];
  if (opts.audioPath) {
    args.push("-i", opts.audioPath);
  }
  if (drawtextSupported && opts.aiDisclosureWatermark) {
    const wm = escapeDrawtext(opts.watermarkText || "AI DIGITAL TWIN \xB7 AUTHORIZED LIKENESS");
    args.push(
      "-vf",
      `drawtext=text='${wm}':x=24:y=24:fontsize=16:fontcolor=0xFFFFFF@0.9:box=1:boxcolor=0x1A1917@0.58:boxborderw=8`
    );
  }
  if (opts.audioPath) {
    args.push("-map", "0:v:0", "-map", "1:a:0", "-shortest");
  } else {
    args.push("-map", "0:v:0", "-map", "0:a?");
  }
  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "21",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    opts.outputVideoPath
  );
  await execFileAsync("ffmpeg", args, { timeout: 12e4 });
  await execFileAsync(
    "ffmpeg",
    ["-y", "-ss", "0.4", "-i", opts.outputVideoPath, "-vframes", "1", "-q:v", "3", opts.outputThumbPath],
    { timeout: 15e3 }
  );
  const durationSec = await getMediaDurationSec(opts.outputVideoPath);
  return {
    durationSec: durationSec || 8,
    processingMs: Date.now() - start
  };
}

// server/store.ts
import crypto from "node:crypto";
import fs3 from "node:fs/promises";
import path3 from "node:path";
var DATA_ROOT = path3.resolve(process.cwd(), "data");
var UPLOADS_DIR = path3.join(DATA_ROOT, "uploads");
var AUDIO_DIR = path3.join(DATA_ROOT, "audio");
var VIDEOS_DIR = path3.join(DATA_ROOT, "videos");
var COVERS_DIR = path3.join(DATA_ROOT, "covers");
var DEMO_ASSETS_DIR = path3.join(DATA_ROOT, "demo-assets");
var LIVE_DB_PATH = path3.join(DATA_ROOT, "live-workspace.json");
var DEMO_DB_PATH = path3.join(DATA_ROOT, "demo-workspace.json");
function computeReadiness(twin) {
  const faceCats = new Set(twin.faceAssets.map((a) => a.category));
  const requiredFace = ["front", "left_profile", "right_profile", "expression_talking"];
  const coveredFace = requiredFace.filter((c) => faceCats.has(c)).length;
  const extraFaceBonus = Math.min(20, Math.max(0, twin.faceAssets.length - coveredFace) * 5);
  const faceScore = Math.min(100, Math.round(coveredFace / requiredFace.length * 80 + extraFaceBonus));
  const voiceCount = twin.voiceSamples.length;
  const verifiedVoice = twin.voiceSamples.filter((v) => v.verified).length;
  const voiceScore = voiceCount === 0 ? 0 : Math.min(100, Math.round(Math.min(voiceCount, 3) * 25 + Math.min(verifiedVoice, 2) * 12.5));
  const p = twin.personality;
  const filledPersonality = [
    p.creatorName,
    p.niche,
    p.speakingStyle,
    p.vocabularyNotes,
    p.accentAndPronunciation
  ].filter((x) => x && x.trim().length > 2).length;
  const personalityScore = Math.round(filledPersonality / 5 * 100);
  const consentVerified = Boolean(twin.consent.attested && twin.consent.ownerFullName.trim().length > 1);
  const missingItems = [];
  if (!faceCats.has("front")) missingItems.push("Front-facing portrait");
  if (!faceCats.has("left_profile")) missingItems.push("Left profile portrait");
  if (!faceCats.has("right_profile")) missingItems.push("Right profile portrait");
  if (!faceCats.has("expression_talking")) missingItems.push("Talking expression frame");
  if (voiceCount === 0) missingItems.push("Clean voice sample (.wav/.mp3)");
  if (!consentVerified) missingItems.push("Signed biometric ownership consent");
  const overallScore = Math.round(
    faceScore * 0.35 + voiceScore * 0.3 + personalityScore * 0.2 + (consentVerified ? 15 : 0)
  );
  return {
    overallScore,
    faceScore,
    voiceScore,
    personalityScore,
    consentVerified,
    missingItems,
    externalModelStatus: overallScore >= 70 && consentVerified ? "local_ready" : "not_trained"
  };
}
function defaultRssFeeds() {
  return [
    {
      id: "rss_techcrunch_ai",
      name: "TechCrunch AI",
      url: "https://techcrunch.com/category/artificial-intelligence/feed/",
      defaultCategory: "Technology",
      enabled: true
    },
    {
      id: "rss_sciencedaily_top",
      name: "ScienceDaily Top Science",
      url: "https://www.sciencedaily.com/rss/top/science.xml",
      defaultCategory: "Science",
      enabled: true
    },
    {
      id: "rss_smithsonian_smart",
      name: "Smithsonian Smart News",
      url: "https://www.smithsonianmag.com/rss/smart-news/",
      defaultCategory: "Knowledge",
      enabled: true
    },
    {
      id: "rss_verge",
      name: "The Verge",
      url: "https://www.theverge.com/rss/index.xml",
      defaultCategory: "Rising",
      enabled: true
    },
    {
      id: "rss_hn_front",
      name: "Hacker News Frontpage",
      url: "https://hnrss.org/frontpage?count=12",
      defaultCategory: "Business",
      enabled: true
    }
  ];
}
function defaultDemoOnlineIdeas(now = (/* @__PURE__ */ new Date()).toISOString()) {
  return [
    {
      id: "demo_idea_comedy",
      genre: "Comedy",
      language: "Hinglish",
      title: 'Corporate "Quick 5-Minute Sync" That Hijacks Your Entire Afternoon',
      hookIdea: 'Manager jab bole "just a quick 5-minute sync", samajh jaao lunch gaya.',
      viralTrigger: "Instant workplace relatability across Indian tech & startup reels.",
      suggestedAngle: "Contrast the polite calendar invite with the 47-minute screen-share reality using crisp observational timing and a relatable punchline.",
      fetchedAt: now
    },
    {
      id: "demo_idea_science",
      genre: "Science",
      language: "Hindi",
      title: "\u0915\u094D\u092F\u094B\u0902 \u0905\u0902\u0924\u0930\u093F\u0915\u094D\u0937 \u092E\u0947\u0902 \u0906\u0902\u0938\u0942 \u0928\u0940\u091A\u0947 \u0928\u0939\u0940\u0902 \u0917\u093F\u0930\u0924\u0947 \u2014 \u0914\u0930 \u0906\u0902\u0916 \u092A\u0930 \u0924\u0948\u0930\u0924\u0947 \u0930\u0939\u0924\u0947 \u0939\u0948\u0902",
      hookIdea: "\u0905\u0917\u0930 \u0906\u092A \u0938\u094D\u092A\u0947\u0938 \u092E\u0947\u0902 \u0930\u094B\u090F\u0902, \u0924\u094B \u0906\u092A\u0915\u093E \u090F\u0915 \u092D\u0940 \u0906\u0902\u0938\u0942 \u0917\u093E\u0932 \u092A\u0930 \u0928\u0939\u0940\u0902 \u0917\u093F\u0930\u0947\u0917\u093E \u2014 \u091C\u093E\u0928\u093F\u090F \u0915\u094D\u092F\u094B\u0902\u0964",
      viralTrigger: "Visual physics curiosity gap that viewers instantly share and rewatch.",
      suggestedAngle: "Explain surface tension vs zero gravity in simple conversational Hindi with an everyday Earth kitchen analogy.",
      fetchedAt: now
    },
    {
      id: "demo_idea_knowledge",
      genre: "Knowledge",
      language: "English",
      title: "Why Airports Put Mirrors Next to Baggage Claim Belts",
      hookIdea: "Airports did not shorten baggage wait times \u2014 they hacked human psychology instead.",
      viralTrigger: "Hidden everyday design secret viewers notice on their very next flight.",
      suggestedAngle: "Unpack the Houston airport walk-time experiment showing how occupied waiting feels twice as fast as idle waiting.",
      fetchedAt: now
    }
  ];
}
function defaultIntegrations(geminiOk, ffmpegOk) {
  const kokoroUrl = process.env.KOKORO_TTS_URL || "";
  const piperUrl = process.env.PIPER_TTS_URL || "";
  const elevenKey = process.env.ELEVENLABS_API_KEY || "";
  const livePortraitUrl = process.env.LIVEPORTRAIT_URL || "";
  const heygenKey = process.env.HEYGEN_API_KEY || "";
  const n8nUrl = process.env.N8N_WEBHOOK_URL || "";
  return [
    {
      id: "free_hindi_neural",
      name: "Free Natural Hindi & Conversational Neural Voices",
      category: "Voice Engine",
      tier: "local_free",
      description: "Zero-cost neural speech engine with 8 expressive Male & Female conversational voices (Andrew, Ava, Brian, Emma, Madhur, Swara, Prabhat, Neerja) plus natural breathing pauses & vocal warmth EQ.",
      configured: true,
      endpointUrl: "free://neural-hindi-tts",
      status: "connected",
      capabilities: ["$0.00 Free Tier", "8 Male & Female Voices", "Natural Hindi Pauses & Warmth", "24kHz Warm EQ Master"],
      supportsVoiceCloning: false,
      lastCheckedAt: (/* @__PURE__ */ new Date()).toISOString(),
      notes: "Active in $0.00 Free Tier via My Digital Twin Persona Settings & Studio MP4 renders. Distinct from paid personal voice cloning."
    },
    {
      id: "gemini_intelligence",
      name: "Gemini 4 Hydrogen & Speech",
      category: "LLM Intelligence",
      tier: "balanced",
      description: "Server-side script generation (EN/HI/Hinglish), speech transcription, and expressive TTS voice auditions.",
      configured: geminiOk,
      endpointUrl: "server://gemini-api",
      status: geminiOk ? "connected" : "unconfigured",
      capabilities: ["Multilingual Scripts", "Voice Verification STT", "WAV Voice Audition"],
      supportsVoiceCloning: false,
      lastCheckedAt: (/* @__PURE__ */ new Date()).toISOString(),
      notes: geminiOk ? "Active on server. Standard voice personas only \u2014 never mislabelled as personal voice cloning." : "Requires GEMINI_API_KEY environment secret."
    },
    {
      id: "free_canvas_animator",
      name: "Free Live Motion & Expression Animator",
      category: "Avatar & Lip-Sync",
      tier: "local_free",
      description: "Zero-cost 30fps multi-expression animator driving head sway, eye-blinks, speech-energy mouth crossfades, camera cuts, and kinetic captions.",
      configured: true,
      endpointUrl: "browser://canvas-motion-director",
      status: "connected",
      capabilities: ["$0.00 / Render", "Speech-Energy Motion", "Multi-Angle Cuts", "Kinetic Captions"],
      supportsVoiceCloning: false,
      lastCheckedAt: (/* @__PURE__ */ new Date()).toISOString(),
      notes: "Runs 100% free in Studio and masters to H.264 MP4 via local FFmpeg."
    },
    {
      id: "ffmpeg_local",
      name: "Free Multi-Scene FFmpeg Motion Director",
      category: "Avatar & Lip-Sync",
      tier: "local_free",
      description: "Deterministic server-side 4-scene MP4 director with xfade transitions, camera pans, live audio waveform, beat badges, and timed captions.",
      configured: ffmpegOk,
      endpointUrl: "local:///usr/bin/ffmpeg",
      status: ffmpegOk ? "connected" : "unreachable",
      capabilities: ["Multi-Shot xfade Cuts", "Audio Waveform", "9:16 / 1:1 / 16:9 Render", "Timed Subtitles"],
      supportsVoiceCloning: false,
      lastCheckedAt: (/* @__PURE__ */ new Date()).toISOString(),
      notes: ffmpegOk ? "Local FFmpeg binary verified on server." : "FFmpeg binary not detected."
    },
    {
      id: "free_hf_space",
      name: "Free Hugging Face ZeroGPU Lip-Sync Space",
      category: "Avatar & Lip-Sync",
      tier: "local_free",
      description: "Optional $0.00 community Gradio Space bridge (e.g. LivePortrait / SadTalker ZeroGPU Space) for neural facial animation.",
      configured: Boolean(process.env.HF_SPACE_URL),
      endpointUrl: process.env.HF_SPACE_URL || "",
      status: process.env.HF_SPACE_URL ? "reachable" : "unconfigured",
      capabilities: ["$0.00 ZeroGPU", "Neural Lip Sync", "Gradio API Bridge"],
      supportsVoiceCloning: false,
      lastCheckedAt: null,
      notes: "Paste any public Hugging Face Gradio Space endpoint URL to run free cloud lip-sync when available."
    },
    {
      id: "gemini_omni_veo",
      name: "Gemini Omni / Veo Video Generator",
      category: "Avatar & Lip-Sync",
      tier: "premium",
      description: "Photorealistic image-to-video motion generation via Gemini Interactions API. Always gated by explicit cost approval.",
      configured: geminiOk,
      endpointUrl: "server://gemini-omni-1.2-flash",
      status: geminiOk ? "connected" : "unconfigured",
      capabilities: ["720p Portrait Animation", "Reference Image Conditioning", "FFmpeg Post-Mastering"],
      supportsVoiceCloning: false,
      lastCheckedAt: (/* @__PURE__ */ new Date()).toISOString(),
      notes: "Requires paid-tier API key and per-job cost authorization in Video Studio."
    },
    {
      id: "kokoro_local",
      name: "Local Kokoro / Piper TTS Worker",
      category: "Voice Engine",
      tier: "local_free",
      description: "Zero-cost local neural TTS HTTP adapter for draft synthesis and offline experimentation.",
      configured: Boolean(kokoroUrl || piperUrl),
      endpointUrl: kokoroUrl || piperUrl || "",
      status: kokoroUrl || piperUrl ? "reachable" : "unconfigured",
      capabilities: ["Zero API Cost", "Fast Draft Speech"],
      supportsVoiceCloning: false,
      lastCheckedAt: null,
      notes: "Optional zero-cost fallback. Configure your local Kokoro or Piper HTTP endpoint URL to enable."
    },
    {
      id: "elevenlabs_webhook",
      name: "ElevenLabs Personal Voice Clone",
      category: "Voice Engine",
      tier: "premium",
      description: "Authorized personal voice cloning connector for Hindi, Hinglish, and English emotional inflection.",
      configured: Boolean(elevenKey),
      endpointUrl: process.env.ELEVENLABS_WEBHOOK_URL || "",
      status: elevenKey ? "connected" : "unconfigured",
      capabilities: ["Cloned Voice Identity", "Multilingual Pronunciation", "Emotion Controls"],
      supportsVoiceCloning: true,
      lastCheckedAt: null,
      notes: "Never substituted silently. Must be explicitly configured and authorized."
    },
    {
      id: "liveportrait_heygen",
      name: "LivePortrait / HeyGen Lip-Sync Worker",
      category: "Avatar & Lip-Sync",
      tier: "premium",
      description: "Dedicated facial expression driving and audio-driven lip-synchronization worker webhook.",
      configured: Boolean(livePortraitUrl || heygenKey),
      endpointUrl: livePortraitUrl || "",
      status: livePortraitUrl || heygenKey ? "connected" : "unconfigured",
      capabilities: ["Neural Lip Sync", "Natural Eye Blinking", "Head Motion Driving"],
      supportsVoiceCloning: false,
      lastCheckedAt: null,
      notes: "Connect a remote LivePortrait GPU endpoint or HeyGen webhook URL."
    },
    {
      id: "n8n_webhook",
      name: "n8n Workflow Orchestrator",
      category: "Automation",
      tier: "balanced",
      description: "HMAC-SHA256 signed webhook dispatch and callback receiver for automated multi-step publishing.",
      configured: Boolean(n8nUrl),
      endpointUrl: n8nUrl,
      status: n8nUrl ? "connected" : "unconfigured",
      capabilities: ["Idempotent Job Dispatch", "Retry Backoff", "Execution Audit Logs"],
      supportsVoiceCloning: false,
      lastCheckedAt: null,
      notes: "Configure any webhook URL (e.g., your n8n production trigger) to dispatch live workflow events."
    },
    {
      id: "social_graph_connector",
      name: "Instagram / TikTok / Facebook Publisher",
      category: "Social Publishing",
      tier: "balanced",
      description: "External publishing webhook bridge. Items remain Draft/Scheduled until a delivery receipt is confirmed.",
      configured: false,
      endpointUrl: "",
      status: "unconfigured",
      capabilities: ["Reels / TikTok Prep", "Cover Frame Export", "Confirmed Receipt Tracking"],
      supportsVoiceCloning: false,
      lastCheckedAt: null,
      notes: "Connect an authorized social publishing webhook to execute live post deliveries."
    }
  ];
}
function defaultBenchmarks() {
  return [
    {
      id: "bm_free_hindi_neural",
      providerId: "free_hindi_neural",
      providerName: "Free Natural Hindi / Indian Neural Voice ($0.00)",
      category: "voice",
      tier: "local_free",
      referenceImageLabel: "N/A (Audio Only)",
      voiceSampleLabel: "Hindi / Hinglish Persona Reference",
      scriptExcerpt: "\u0928\u092E\u0938\u094D\u0924\u0947, \u092E\u0948\u0902 \u0906\u092A\u0915\u093E \u0921\u093F\u091C\u093F\u091F\u0932 \u091F\u094D\u0935\u093F\u0928 \u0939\u0942\u0901\u0964 \u0906\u091C \u0939\u092E \u0924\u0940\u0938 \u0938\u0947\u0915\u0902\u0921 \u0915\u0940 \u090F\u0915 \u0938\u093E\u092B \u0930\u0940\u0932 \u0924\u0948\u092F\u093E\u0930 \u0915\u0930\u0947\u0902\u0917\u0947\u0964",
      verified: false,
      processingMs: null,
      resolutionOrSampleRate: "24kHz Mono WAV",
      estimatedCostPerMinUsd: 0,
      metrics: {
        faceSimilarity: null,
        voiceSimilarity: null,
        lipSync: null,
        naturalExpressions: null,
        renderingQuality: null
      },
      notes: "Zero-cost Hindi & Hinglish neural voice engine (hi-IN-MadhurNeural / hi-IN-SwaraNeural). Run benchmark to audition real synthesis latency.",
      benchmarkedAt: null
    },
    {
      id: "bm_ffmpeg_local",
      providerId: "ffmpeg_local",
      providerName: "Local FFmpeg Portrait Assembly",
      category: "video",
      tier: "local_free",
      referenceImageLabel: "Creator Front Studio Portrait",
      voiceSampleLabel: "Studio Speech Sample",
      scriptExcerpt: "Short-form 9:16 editorial hook with burned-in captions.",
      verified: false,
      processingMs: null,
      resolutionOrSampleRate: "720x1280 H.264",
      estimatedCostPerMinUsd: 0,
      metrics: {
        faceSimilarity: null,
        voiceSimilarity: null,
        lipSync: null,
        naturalExpressions: null,
        renderingQuality: null
      },
      notes: "Run benchmark to measure actual local FFmpeg processing latency and inspect playable MP4 output.",
      benchmarkedAt: null
    },
    {
      id: "bm_gemini_lite_tts",
      providerId: "gemini_lite_tts",
      providerName: "Gemini 3.8 Flash Lite TTS",
      category: "voice",
      tier: "balanced",
      referenceImageLabel: "N/A (Audio Only)",
      voiceSampleLabel: "Creator Reference Voice",
      scriptExcerpt: "Three-second creator hook audition.",
      verified: false,
      processingMs: null,
      resolutionOrSampleRate: "24kHz Mono WAV",
      estimatedCostPerMinUsd: 0.015,
      metrics: {
        faceSimilarity: null,
        voiceSimilarity: null,
        lipSync: null,
        naturalExpressions: null,
        renderingQuality: null
      },
      notes: "Standard studio voice (not personal voice clone). Run benchmark to audition real latency and output.",
      benchmarkedAt: null
    },
    {
      id: "bm_gemini_flash_tts",
      providerId: "gemini_flash_tts",
      providerName: "Gemini 3.8 Flash TTS (Expressive)",
      category: "voice",
      tier: "balanced",
      referenceImageLabel: "N/A (Audio Only)",
      voiceSampleLabel: "Creator Reference Voice",
      scriptExcerpt: "Conversational bilingual Hinglish/English hook.",
      verified: false,
      processingMs: null,
      resolutionOrSampleRate: "24kHz Mono WAV",
      estimatedCostPerMinUsd: 0.03,
      metrics: {
        faceSimilarity: null,
        voiceSimilarity: null,
        lipSync: null,
        naturalExpressions: null,
        renderingQuality: null
      },
      notes: "Higher prosody fidelity than Lite TTS. Run benchmark to preview side-by-side.",
      benchmarkedAt: null
    },
    {
      id: "bm_elevenlabs_clone",
      providerId: "elevenlabs_webhook",
      providerName: "ElevenLabs Personal Voice Clone",
      category: "voice",
      tier: "premium",
      referenceImageLabel: "N/A (Audio Only)",
      voiceSampleLabel: "Authorized Personal Clone",
      scriptExcerpt: "Multilingual conversational clone test.",
      verified: false,
      processingMs: null,
      resolutionOrSampleRate: "44.1kHz MP3/WAV",
      estimatedCostPerMinUsd: 0.18,
      metrics: {
        faceSimilarity: null,
        voiceSimilarity: null,
        lipSync: null,
        naturalExpressions: null,
        renderingQuality: null
      },
      notes: "External connector unconfigured. Configure endpoint in Integrations to run verified benchmark.",
      benchmarkedAt: null
    },
    {
      id: "bm_gemini_omni_veo",
      providerId: "gemini_omni_veo",
      providerName: "Gemini Omni / Veo + FFmpeg Master",
      category: "video",
      tier: "premium",
      referenceImageLabel: "Creator Front Studio Portrait",
      voiceSampleLabel: "Expressive TTS Track",
      scriptExcerpt: "Photorealistic animated presenter clip.",
      verified: false,
      processingMs: null,
      resolutionOrSampleRate: "720p MP4 + AAC",
      estimatedCostPerMinUsd: 0.45,
      metrics: {
        faceSimilarity: null,
        voiceSimilarity: null,
        lipSync: null,
        naturalExpressions: null,
        renderingQuality: null
      },
      notes: "Paid tier model. Requires explicit cost approval to run side-by-side benchmark.",
      benchmarkedAt: null
    }
  ];
}
function createInitialLiveState(geminiOk, ffmpegOk) {
  const twin = {
    faceAssets: [],
    voiceSamples: [],
    personality: {
      creatorName: "",
      handle: "",
      niche: "Technology, Creator Systems & Practical AI",
      speakingStyle: "Direct, thoughtful, grounded in practical real-world examples.",
      vocabularyNotes: "Clear modern editorial language without hype buzzwords.",
      humourStyle: "Dry understated wit",
      formalityLevel: "Conversational Editorial",
      accentAndPronunciation: "Natural Indian-English & crisp Hinglish cadence",
      catchphrases: [],
      primaryLanguage: "Hindi",
      preferredVoiceProvider: "free_hindi_neural",
      preferredVoiceId: "en-US-AndrewMultilingualNeural",
      voiceProsodyPreset: "warm_storyteller",
      voicePitchWarmth: "warm",
      voicePace: 0.95,
      naturalPausesEnabled: true
    },
    consent: {
      attested: false,
      ownerFullName: "",
      attestedAt: null,
      likenessUsageScope: "Personal content creation owned by the verified creator only.",
      requireAiDisclosure: true
    },
    readiness: {
      overallScore: 0,
      faceScore: 0,
      voiceScore: 0,
      personalityScore: 0,
      consentVerified: false,
      missingItems: [
        "Front-facing portrait",
        "Left profile portrait",
        "Right profile portrait",
        "Talking expression frame",
        "Clean voice sample (.wav/.mp3)",
        "Signed biometric ownership consent"
      ],
      externalModelStatus: "not_trained"
    }
  };
  twin.readiness = computeReadiness(twin);
  return {
    mode: "live",
    twin,
    trends: [],
    onlineIdeas: [],
    scripts: [],
    auditions: [],
    videos: [],
    benchmarks: defaultBenchmarks(),
    automationJobs: [],
    publishingDrafts: [],
    analytics: [],
    integrations: defaultIntegrations(geminiOk, ffmpegOk),
    auditLogs: [
      {
        id: "audit_init",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        actor: "System",
        category: "security",
        action: "Live Workspace Initialized",
        detail: "Clean single-creator workspace created with strict zero-fabrication defaults."
      }
    ],
    settings: {
      monthlyBudgetCapUsd: 25,
      currentMonthSpendUsd: 0,
      requireExplicitPaidApproval: true,
      defaultQualityTier: "balanced",
      aiDisclosureDefault: true,
      watermarkText: "AI DIGITAL TWIN \xB7 AUTHORIZED LIKENESS",
      sessionLockEnabled: false,
      creatorEmail: "Samymehra071213@gmail.com",
      rssFeeds: defaultRssFeeds()
    },
    capabilities: {
      geminiConfigured: geminiOk,
      ffmpegAvailable: ffmpegOk
    }
  };
}
function createInitialDemoState(geminiOk, ffmpegOk) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const twin = {
    faceAssets: [
      {
        id: "demo_face_front",
        category: "front",
        label: "Studio Front Portrait (Neutral)",
        url: "/api/media/demo/twin_portrait_front.jpg",
        mimeType: "image/jpeg",
        filename: "twin_portrait_front.jpg",
        sizeBytes: 342800,
        uploadedAt: now
      },
      {
        id: "demo_face_talking",
        category: "expression_talking",
        label: "Three-Quarter Talking Expression",
        url: "/api/media/demo/twin_portrait_talking.jpg",
        mimeType: "image/jpeg",
        filename: "twin_portrait_talking.jpg",
        sizeBytes: 318400,
        uploadedAt: now
      },
      {
        id: "demo_face_left",
        category: "left_profile",
        label: "Studio Banner / Framing Reference",
        url: "/api/media/demo/studio_editorial_banner.jpg",
        mimeType: "image/jpeg",
        filename: "studio_editorial_banner.jpg",
        sizeBytes: 412e3,
        uploadedAt: now
      }
    ],
    voiceSamples: [
      {
        id: "demo_voice_en",
        label: "Studio Intro \u2014 Warm Editorial",
        language: "English",
        emotion: "Conversational",
        url: "",
        mimeType: "audio/wav",
        filename: "demo_en_editorial_sample.wav",
        sizeBytes: 482e3,
        durationSec: 14,
        transcript: "Most creators waste six hours filming a forty-second reel when the real bottleneck is clarity of thought.",
        verified: true,
        uploadedAt: now
      },
      {
        id: "demo_voice_hinglish",
        label: "Hinglish Conversational Cadence",
        language: "Hinglish",
        emotion: "Warm",
        url: "",
        mimeType: "audio/wav",
        filename: "demo_hinglish_sample.wav",
        sizeBytes: 394e3,
        durationSec: 11,
        transcript: "Dekho, AI tab kaam aata hai jab woh aapki apni awaaz aur soch ko amplify kare, replace nahi.",
        verified: true,
        uploadedAt: now
      }
    ],
    personality: {
      creatorName: "Aarav Mehta",
      handle: "@aarav.studio",
      niche: "Applied AI Systems, Creator Economics & Product Craft",
      speakingStyle: "Calm, structured storytelling with sharp 3-second opening hooks and zero fluff.",
      vocabularyNotes: "Concise, grounded terminology; avoids generic AI hype words.",
      humourStyle: "Subtle observational wit",
      formalityLevel: "Conversational Editorial",
      accentAndPronunciation: "Natural Indian-English & crisp conversational Hinglish",
      catchphrases: ["Let us break the signal from the noise.", "Seedha point pe aate hain."],
      primaryLanguage: "Hinglish",
      preferredVoiceProvider: "free_hindi_neural",
      preferredVoiceId: "en-US-AndrewMultilingualNeural",
      voiceProsodyPreset: "warm_storyteller",
      voicePitchWarmth: "warm",
      voicePace: 0.95,
      naturalPausesEnabled: true
    },
    consent: {
      attested: true,
      ownerFullName: "Aarav Mehta (Demo Creator Profile)",
      attestedAt: now,
      likenessUsageScope: "Demo Showcase Profile \u2014 Authorized synthetic studio demonstration.",
      requireAiDisclosure: true
    },
    readiness: {
      overallScore: 84,
      faceScore: 75,
      voiceScore: 75,
      personalityScore: 100,
      consentVerified: true,
      missingItems: ["Right profile portrait"],
      externalModelStatus: "local_ready"
    }
  };
  twin.readiness = computeReadiness(twin);
  return {
    mode: "demo",
    twin,
    trends: [
      {
        id: "demo_trend_1",
        topic: "Why Small Creators Are Replacing 4-Hour Filming Days With Script-First AI Workflows",
        platform: "RSS / News",
        category: "Rising",
        sourceUrl: "https://techcrunch.com/category/artificial-intelligence/",
        sourceName: "TechCrunch Creator Dispatch",
        sourceType: "curated",
        discoveredAt: now,
        summary: "Independent founders and educators are shifting production time from camera setup to tight editorial research and multilingual distribution.",
        metrics: {
          available: false,
          note: "Source RSS feed does not expose social engagement counts"
        },
        relevanceScore: 94,
        opportunityScore: 91
      },
      {
        id: "demo_trend_2",
        topic: "Hinglish Tech Explainers Outperforming Pure English Reels Across Tier-1 & Tier-2 India",
        platform: "Instagram",
        category: "Viral",
        sourceUrl: "https://instagram.com",
        sourceName: "Manual Creator Benchmark Import",
        sourceType: "manual",
        discoveredAt: now,
        summary: "Conversational bilingual hooks within the first 2.5 seconds show stronger completion curves for technical tutorials.",
        metrics: {
          available: true,
          views: "184K (logged)",
          engagementRate: "6.8%",
          note: "Creator-imported public post observation"
        },
        relevanceScore: 96,
        opportunityScore: 95
      },
      {
        id: "demo_trend_3",
        topic: "Mandatory AI Likeness Provenance & Watermarking Standards for Brand Partnerships",
        platform: "RSS / News",
        category: "Business",
        sourceUrl: "https://www.theverge.com/",
        sourceName: "The Verge Media Policy",
        sourceType: "curated",
        discoveredAt: now,
        summary: "Agencies increasingly require cryptographic consent provenance and clear synthetic disclosure before approving twin campaigns.",
        metrics: {
          available: false,
          note: "Unavailable from publisher feed"
        },
        relevanceScore: 88,
        opportunityScore: 85
      }
    ],
    onlineIdeas: defaultDemoOnlineIdeas(now),
    scripts: [
      {
        id: "demo_script_1",
        trendId: "demo_trend_2",
        trendTopic: "Hinglish Tech Explainers Outperforming Pure English Reels",
        language: "Hinglish",
        recommendedFormat: "Talking-Head",
        thesis: "Creators lose retention not from bad cameras, but from speaking in textbook English instead of how founders actually think and talk.",
        audiencePainPoint: "Spending weekends recording 12 retakes that still get scrolled past in 2 seconds.",
        ctaStrategy: 'Ask viewers to comment "SCRIPT" or share whether they prefer Hinglish breakdowns.',
        selectedVariantId: "demo_var_1",
        approvalStatus: "approved",
        createdAt: now,
        updatedAt: now,
        variants: [
          {
            id: "demo_var_1",
            toneName: "Natural & Conversational",
            hook3s: "Seedha point pe aate hain \u2014 aapki reel log 2 second mein scroll kyun karte hain?",
            body: "Aap lighting aur camera upgrade karte rehte ho, lekin audience ko chahiye clarity unki apni bhasha mein. Jab aap complex AI workflow ko simple Hinglish mein break down karte ho, retention turant upar jaata hai.",
            cta: "Batayein comments mein: aapka next explainer English mein chahiye ya Hinglish mein?",
            wordCount: 74,
            estimatedDurationSec: 32
          },
          {
            id: "demo_var_2",
            toneName: "Educational & Authoritative",
            hook3s: "Three structural shifts driving higher retention on bilingual tech reels in 2026.",
            body: "First, anchor your opening three seconds in a concrete operational problem. Second, match vocabulary to everyday founder conversation rather than formal documentation. Third, deliver a structured 30-second breakdown with visual pacing and clear spoken cadence.",
            cta: "Save this framework before recording your next batch.",
            wordCount: 54,
            estimatedDurationSec: 30
          },
          {
            id: "demo_var_3",
            toneName: "Entertaining & Engaging",
            hook3s: "Maine 4 ghante ki lighting setup chhod di \u2014 aur output double ho gaya.",
            body: "Sach bolun toh pehle har video ke liye tripod, mic, aur 18 retakes lagte the. Ab focus sirf sharp writing aur clean digital twin delivery pe hai jahan ek 30-second explainer bina retake ke publish hota hai.",
            cta: "Follow karein agar aap bhi creator burnout se nikalna chahte hain.",
            wordCount: 52,
            estimatedDurationSec: 30
          }
        ]
      }
    ],
    auditions: [],
    videos: [
      {
        id: "demo_video_1",
        title: "Hinglish & Hindi Retention Blueprint \u2014 Studio Reel",
        scriptId: "demo_script_1",
        trendTopic: "Hinglish Tech Explainers Outperforming Pure English Reels",
        qualityTier: "local_free",
        voiceProvider: "free_hindi_neural",
        voiceIdentity: "hi-IN-MadhurNeural",
        visualProvider: "ffmpeg_local",
        aspectRatio: "9:16",
        format: "Talking-Head",
        language: "Hindi",
        emotion: "Warm & Editorial",
        framing: "Close-Up Studio",
        backgroundStyle: "Studio Ivory Linen",
        wardrobeNote: "Charcoal wool blazer & ivory knit",
        speakingSpeed: 1,
        voiceIntensity: "Balanced",
        subtitlesEnabled: true,
        aiDisclosureWatermark: true,
        estimatedCostUsd: 0,
        actualCostUsd: 0,
        approvedPaidCharge: false,
        durationSec: 32,
        processingMs: 4200,
        status: "completed",
        reviewStatus: "approved",
        videoUrl: "/api/media/videos/demo_reel_portrait.mp4",
        thumbnailUrl: "/api/media/covers/demo_reel_portrait.jpg",
        provenanceNote: "Free Hindi Neural Voice (Madhur) + 6-Shot FFmpeg Motion Director ($0.00)",
        createdAt: now
      },
      {
        id: "demo_video_2",
        title: "Consent-First Digital Twin Standards",
        trendTopic: "Mandatory AI Likeness Provenance & Watermarking Standards",
        qualityTier: "local_free",
        voiceProvider: "free_hindi_neural",
        voiceIdentity: "en-IN-PrabhatNeural",
        visualProvider: "ffmpeg_local",
        aspectRatio: "16:9",
        format: "Presenter-Style",
        language: "English",
        emotion: "Authoritative",
        framing: "Medium Editorial",
        backgroundStyle: "Warm Charcoal",
        wardrobeNote: "Charcoal wool blazer & ivory knit",
        speakingSpeed: 1,
        voiceIntensity: "Measured",
        subtitlesEnabled: true,
        aiDisclosureWatermark: true,
        estimatedCostUsd: 0,
        actualCostUsd: 0,
        approvedPaidCharge: false,
        durationSec: 32,
        processingMs: 3900,
        status: "completed",
        reviewStatus: "pending",
        videoUrl: "/api/media/videos/demo_presenter_wide.mp4",
        thumbnailUrl: "/api/media/covers/demo_presenter_wide.jpg",
        provenanceNote: "Free Indian Neural Voice (Prabhat) + 6-Shot FFmpeg Motion Director ($0.00)",
        createdAt: now
      }
    ],
    benchmarks: defaultBenchmarks(),
    automationJobs: [
      {
        id: "job_demo_9014",
        workflowName: "Twin Render -> Instagram Reels Draft Queue",
        eventType: "render.completed",
        targetWebhookUrl: "https://n8n.example.internal/webhook/twinforge-reels",
        idempotencyKey: "idem_demo_9014",
        payloadSummary: "video=demo_video_1 \xB7 aspect=9:16 \xB7 disclosure=true",
        status: "succeeded",
        attempts: 1,
        maxAttempts: 3,
        signaturePreview: "sha256=9f82c1...e4b1",
        responseCode: 200,
        providerCostUsd: 0.02,
        createdAt: now,
        updatedAt: now,
        logs: [
          "[21:00:02] Prepared signed webhook payload (HMAC-SHA256)",
          "[21:00:03] Demo simulation receipt acknowledged (HTTP 200)"
        ]
      }
    ],
    publishingDrafts: [
      {
        id: "pub_demo_1",
        videoId: "demo_video_1",
        videoTitle: "Hinglish Retention Blueprint \u2014 Studio Reel",
        thumbnailUrl: "/api/media/covers/demo_reel_portrait.jpg",
        videoUrl: "/api/media/videos/demo_reel_portrait.mp4",
        aspectRatio: "9:16",
        platform: "Instagram Reels",
        caption: "Seedha point pe aate hain: retention camera se nahi, clarity se aata hai. Built with my authorized digital twin.",
        hashtags: ["#CreatorEconomy", "#HinglishTech", "#DigitalTwin", "#ContentSystems"],
        scheduledFor: new Date(Date.now() + 864e5).toISOString().slice(0, 16),
        approvalStatus: "awaiting_approval",
        publishStatus: "draft",
        statusNote: "Awaiting creator sign-off before external webhook dispatch."
      }
    ],
    analytics: [
      {
        id: "an_demo_1",
        videoId: "demo_video_1",
        title: "Hinglish Retention Blueprint \u2014 Studio Reel",
        platform: "Instagram Reels",
        format: "Talking-Head",
        language: "Hinglish",
        hookType: "Direct Hinglish Question (2.5s)",
        aspectRatio: "9:16",
        views: 14820,
        reach: 12190,
        avgWatchSec: 19.4,
        retentionPct: 68.2,
        shares: 312,
        comments: 94,
        saves: 540,
        followerDelta: 186,
        engagementRate: 6.4,
        productionCostUsd: 0.02,
        loggedAt: now
      },
      {
        id: "an_demo_2",
        videoId: "demo_video_2",
        title: "Consent-First Digital Twin Standards",
        platform: "Facebook Reels",
        format: "Presenter-Style",
        language: "English",
        hookType: "Policy Contrarian Statement",
        aspectRatio: "16:9",
        views: 5410,
        reach: 4680,
        avgWatchSec: 15.1,
        retentionPct: 54,
        shares: 84,
        comments: 31,
        saves: 122,
        followerDelta: 48,
        engagementRate: 4.3,
        productionCostUsd: 0,
        loggedAt: now
      }
    ],
    integrations: defaultIntegrations(geminiOk, ffmpegOk),
    auditLogs: [
      {
        id: "demo_audit_1",
        timestamp: now,
        actor: "Aarav Mehta (Demo)",
        category: "consent",
        action: "Demo Biometric Consent Active",
        detail: "Demo showcase workspace active. Switch to Live Mode at top bar to work with your real assets."
      }
    ],
    settings: {
      monthlyBudgetCapUsd: 25,
      currentMonthSpendUsd: 0.02,
      requireExplicitPaidApproval: true,
      defaultQualityTier: "balanced",
      aiDisclosureDefault: true,
      watermarkText: "AI DIGITAL TWIN \xB7 AUTHORIZED LIKENESS",
      sessionLockEnabled: false,
      creatorEmail: "Samymehra071213@gmail.com",
      rssFeeds: defaultRssFeeds()
    },
    capabilities: {
      geminiConfigured: geminiOk,
      ffmpegAvailable: ffmpegOk
    }
  };
}
async function copyDemoImagesIfNeeded() {
  await fs3.mkdir(DEMO_ASSETS_DIR, { recursive: true });
  const imgDir = path3.resolve(process.cwd(), "src", "assets", "images");
  try {
    const files = await fs3.readdir(imgDir);
    const frontFile = files.find((f) => f.startsWith("twin_portrait_front"));
    const talkFile = files.find((f) => f.startsWith("twin_portrait_talking"));
    const bannerFile = files.find((f) => f.startsWith("studio_editorial_banner"));
    if (frontFile) {
      await fs3.copyFile(path3.join(imgDir, frontFile), path3.join(DEMO_ASSETS_DIR, "twin_portrait_front.jpg"));
    }
    if (talkFile) {
      await fs3.copyFile(path3.join(imgDir, talkFile), path3.join(DEMO_ASSETS_DIR, "twin_portrait_talking.jpg"));
    }
    if (bannerFile) {
      await fs3.copyFile(path3.join(imgDir, bannerFile), path3.join(DEMO_ASSETS_DIR, "studio_editorial_banner.jpg"));
    }
  } catch {
  }
}
async function ensureInitialized() {
  await Promise.all([
    fs3.mkdir(DATA_ROOT, { recursive: true }),
    fs3.mkdir(UPLOADS_DIR, { recursive: true }),
    fs3.mkdir(AUDIO_DIR, { recursive: true }),
    fs3.mkdir(VIDEOS_DIR, { recursive: true }),
    fs3.mkdir(COVERS_DIR, { recursive: true }),
    copyDemoImagesIfNeeded()
  ]);
  const geminiOk = isGeminiConfigured();
  const ffmpegOk = await checkFfmpegAvailable();
  try {
    await fs3.access(LIVE_DB_PATH);
  } catch {
    await fs3.writeFile(LIVE_DB_PATH, JSON.stringify(createInitialLiveState(geminiOk, ffmpegOk), null, 2));
  }
  try {
    await fs3.access(DEMO_DB_PATH);
  } catch {
    await fs3.writeFile(DEMO_DB_PATH, JSON.stringify(createInitialDemoState(geminiOk, ffmpegOk), null, 2));
  }
  if (ffmpegOk) {
    void preRenderDemoVideos();
  }
}
async function preRenderDemoVideos() {
  const portraitFront = path3.join(DEMO_ASSETS_DIR, "twin_portrait_front.jpg");
  const portraitTalking = path3.join(DEMO_ASSETS_DIR, "twin_portrait_talking.jpg");
  const studioBanner = path3.join(DEMO_ASSETS_DIR, "studio_editorial_banner.jpg");
  const reelOut = path3.join(VIDEOS_DIR, "demo_reel_portrait.mp4");
  const reelThumb = path3.join(COVERS_DIR, "demo_reel_portrait.jpg");
  const wideOut = path3.join(VIDEOS_DIR, "demo_presenter_wide.mp4");
  const wideThumb = path3.join(COVERS_DIR, "demo_presenter_wide.jpg");
  const markerPath = path3.join(VIDEOS_DIR, ".demo_v3_hindi_30s");
  try {
    await fs3.access(markerPath);
    await fs3.access(reelOut);
    await fs3.access(wideOut);
    return;
  } catch {
  }
  const sceneImages = [portraitFront, portraitTalking, studioBanner];
  let reelDuration = MIN_VIDEO_DURATION_SEC;
  let wideDuration = MIN_VIDEO_DURATION_SEC;
  let reelSpoken = false;
  let wideSpoken = false;
  const hindiReelScript = "\u0938\u0940\u0927\u0947 \u092A\u0949\u0907\u0902\u091F \u092A\u0930 \u0906\u0924\u0947 \u0939\u0948\u0902\u0964 \u0906\u092A\u0915\u0940 \u0930\u0940\u0932 \u0932\u094B\u0917 \u0926\u094B \u0938\u0947\u0915\u0902\u0921 \u092E\u0947\u0902 \u0938\u094D\u0915\u094D\u0930\u0949\u0932 \u0915\u094D\u092F\u094B\u0902 \u0915\u0930 \u0926\u0947\u0924\u0947 \u0939\u0948\u0902? \u091C\u093C\u094D\u092F\u093E\u0926\u093E\u0924\u0930 \u0915\u094D\u0930\u093F\u090F\u091F\u0930\u094D\u0938 \u092E\u0939\u0902\u0917\u0947 \u0915\u0948\u092E\u0930\u0947 \u0914\u0930 \u0932\u093E\u0907\u091F\u093F\u0902\u0917 \u0938\u0947\u091F\u0905\u092A \u092A\u0930 \u0918\u0902\u091F\u094B\u0902 \u0916\u0930\u094D\u091A \u0915\u0930\u0924\u0947 \u0939\u0948\u0902, \u0932\u0947\u0915\u093F\u0928 \u0905\u0938\u0932\u0940 \u092B\u0930\u094D\u0915 \u0938\u093E\u092B\u093C \u0935\u093F\u091A\u093E\u0930 \u0914\u0930 \u092A\u094D\u0930\u093E\u0915\u0943\u0924\u093F\u0915 \u0939\u093F\u0902\u0926\u0940 \u0938\u094D\u091F\u094B\u0930\u0940\u091F\u0947\u0932\u093F\u0902\u0917 \u0938\u0947 \u092A\u0921\u093C\u0924\u093E \u0939\u0948\u0964 \u091C\u092C \u0906\u092A\u0915\u093E \u0921\u093F\u091C\u093F\u091F\u0932 \u091F\u094D\u0935\u093F\u0928 \u0906\u092A\u0915\u0940 \u0905\u092A\u0928\u0940 \u0936\u0948\u0932\u0940, \u0938\u0939\u0940 \u0935\u093F\u0930\u093E\u092E \u0914\u0930 \u0938\u094D\u092A\u0937\u094D\u091F \u0909\u091A\u094D\u091A\u093E\u0930\u0923 \u0915\u0947 \u0938\u093E\u0925 \u0915\u092E \u0938\u0947 \u0915\u092E \u0924\u0940\u0938 \u0938\u0947\u0915\u0902\u0921 \u0924\u0915 \u090F\u0915 \u0920\u094B\u0938 \u0906\u0907\u0921\u093F\u092F\u093E \u0938\u092E\u091D\u093E\u0924\u093E \u0939\u0948, \u0924\u094B \u0926\u0930\u094D\u0936\u0915 \u0905\u0902\u0924 \u0924\u0915 \u091C\u0941\u0921\u093C\u0947 \u0930\u0939\u0924\u0947 \u0939\u0948\u0902\u0964";
  const wideEnglishScript = "Every creator digital twin should begin with verified biometric consent, transparent provenance watermarking, and genuine editorial perspective. Instead of burning hours on repetitive camera setups, structured thirty-second explainers combine multi-angle motion choreography, synchronized audio waveforms, and multilingual accessibility while keeping cost and quality transparent.";
  try {
    await fs3.access(portraitFront);
    let reelAudioPath;
    try {
      const wavPath = path3.join(AUDIO_DIR, "demo_reel_voice.wav");
      await synthesizeEdgeNeuralSpeechWav({
        text: hindiReelScript,
        voiceIdentity: "hi-IN-MadhurNeural",
        language: "Hindi",
        outputWavPath: wavPath
      });
      reelAudioPath = wavPath;
      reelSpoken = true;
    } catch {
      if (isGeminiConfigured()) {
        try {
          const wavPath = path3.join(AUDIO_DIR, "demo_reel_voice.wav");
          await synthesizeGeminiSpeechWav({
            text: "Seedha point pe aate hain. Aapki reel log do second mein scroll kyun karte hain? Kyunki camera se zyada clarity aur natural Hinglish storytelling matter karti hai. Kam se kam tees second tak ek clear idea deliver karein.",
            provider: "gemini_lite_tts",
            voiceIdentity: "Charon",
            language: "Hinglish",
            emotion: "Conversational Editorial",
            outputWavPath: wavPath
          });
          reelAudioPath = wavPath;
          reelSpoken = true;
        } catch {
          reelAudioPath = void 0;
        }
      }
    }
    const res1 = await renderTwinVideoFFmpeg({
      portraitPath: portraitFront,
      sceneImagePaths: sceneImages,
      audioPath: reelAudioPath,
      durationSec: 32,
      aspectRatio: "9:16",
      framing: "Close-Up Studio",
      title: "Hindi & Hinglish Retention Blueprint",
      captionExcerpt: "Seedha point pe aate hain. Camera se zyada clarity aur natural Hindi storytelling matter karti hai \u2014 delivering full 30-second creator insights without retakes.",
      backgroundStyle: "Studio Ivory Linen",
      subtitlesEnabled: true,
      aiDisclosureWatermark: true,
      watermarkText: "AI DIGITAL TWIN \xB7 DEMO SHOWCASE",
      outputVideoPath: reelOut,
      outputThumbPath: reelThumb
    });
    reelDuration = res1.durationSec;
  } catch {
  }
  try {
    await fs3.access(portraitTalking);
    let wideAudioPath;
    try {
      const wavPath = path3.join(AUDIO_DIR, "demo_wide_voice.wav");
      await synthesizeEdgeNeuralSpeechWav({
        text: wideEnglishScript,
        voiceIdentity: "en-IN-PrabhatNeural",
        language: "English",
        outputWavPath: wavPath
      });
      wideAudioPath = wavPath;
      wideSpoken = true;
    } catch {
      if (isGeminiConfigured()) {
        try {
          const wavPath = path3.join(AUDIO_DIR, "demo_wide_voice.wav");
          await synthesizeGeminiSpeechWav({
            text: wideEnglishScript,
            provider: "gemini_flash_tts",
            voiceIdentity: "Puck",
            language: "English",
            emotion: "Authoritative",
            outputWavPath: wavPath
          });
          wideAudioPath = wavPath;
          wideSpoken = true;
        } catch {
          wideAudioPath = void 0;
        }
      }
    }
    const res2 = await renderTwinVideoFFmpeg({
      portraitPath: portraitTalking,
      sceneImagePaths: [portraitTalking, studioBanner, portraitFront],
      audioPath: wideAudioPath,
      durationSec: 32,
      aspectRatio: "16:9",
      framing: "Medium Editorial",
      title: "Consent-First Twin Provenance",
      captionExcerpt: "Verified biometric consent, 6-shot dynamic motion cuts, natural voiceovers, and transparent AI disclosure on every 30-second export.",
      backgroundStyle: "Warm Charcoal",
      subtitlesEnabled: true,
      aiDisclosureWatermark: true,
      watermarkText: "AI DIGITAL TWIN \xB7 DEMO SHOWCASE",
      outputVideoPath: wideOut,
      outputThumbPath: wideThumb
    });
    wideDuration = res2.durationSec;
  } catch {
  }
  try {
    const raw = await fs3.readFile(DEMO_DB_PATH, "utf8");
    const demoState = JSON.parse(raw);
    const v1 = demoState.videos.find((v) => v.id === "demo_video_1");
    if (v1) {
      v1.durationSec = reelDuration;
      v1.qualityTier = "local_free";
      v1.voiceProvider = "free_hindi_neural";
      v1.voiceIdentity = "hi-IN-MadhurNeural";
      v1.estimatedCostUsd = 0;
      v1.actualCostUsd = 0;
      v1.provenanceNote = reelSpoken ? "Free Hindi Neural Voice (Madhur) + 6-Shot FFmpeg Motion Director ($0.00)" : "6-Shot FFmpeg Motion Director \xB7 Minimum 30s Demo ($0.00)";
    }
    const v2 = demoState.videos.find((v) => v.id === "demo_video_2");
    if (v2) {
      v2.durationSec = wideDuration;
      v2.qualityTier = "local_free";
      v2.voiceProvider = "free_hindi_neural";
      v2.voiceIdentity = "en-IN-PrabhatNeural";
      v2.estimatedCostUsd = 0;
      v2.actualCostUsd = 0;
      v2.provenanceNote = wideSpoken ? "Free Indian Neural Voice (Prabhat) + 6-Shot FFmpeg Motion Director ($0.00)" : "6-Shot FFmpeg Motion Director \xB7 Minimum 30s Demo ($0.00)";
    }
    await fs3.writeFile(DEMO_DB_PATH, JSON.stringify(demoState, null, 2));
    await fs3.writeFile(markerPath, (/* @__PURE__ */ new Date()).toISOString());
  } catch {
  }
}
async function readWorkspace(mode) {
  const target = mode === "demo" ? DEMO_DB_PATH : LIVE_DB_PATH;
  const raw = await fs3.readFile(target, "utf8");
  const parsed = JSON.parse(raw);
  parsed.mode = mode;
  if (!Array.isArray(parsed.onlineIdeas) || mode === "demo" && parsed.onlineIdeas.length === 0) {
    parsed.onlineIdeas = mode === "demo" ? defaultDemoOnlineIdeas() : [];
  }
  if (!parsed.twin.personality.preferredVoiceProvider) {
    parsed.twin.personality.preferredVoiceProvider = "free_hindi_neural";
  }
  if (!parsed.twin.personality.preferredVoiceId) {
    parsed.twin.personality.preferredVoiceId = "en-US-AndrewMultilingualNeural";
  }
  if (!parsed.twin.personality.voiceProsodyPreset) {
    parsed.twin.personality.voiceProsodyPreset = "warm_storyteller";
  }
  if (!parsed.twin.personality.voicePitchWarmth) {
    parsed.twin.personality.voicePitchWarmth = "warm";
  }
  if (typeof parsed.twin.personality.voicePace !== "number") {
    parsed.twin.personality.voicePace = 0.95;
  }
  if (typeof parsed.twin.personality.naturalPausesEnabled !== "boolean") {
    parsed.twin.personality.naturalPausesEnabled = true;
  }
  parsed.twin.readiness = computeReadiness(parsed.twin);
  parsed.capabilities = {
    geminiConfigured: isGeminiConfigured(),
    ffmpegAvailable: await checkFfmpegAvailable()
  };
  const rssDefaults = defaultRssFeeds();
  for (const rf of rssDefaults) {
    if (!parsed.settings.rssFeeds.some((r) => r.id === rf.id)) {
      parsed.settings.rssFeeds.push(rf);
    }
  }
  const defaults = defaultIntegrations(parsed.capabilities.geminiConfigured, parsed.capabilities.ffmpegAvailable);
  for (const def of defaults) {
    if (!parsed.integrations.some((i) => i.id === def.id)) {
      parsed.integrations.unshift(def);
    }
  }
  const bmDefaults = defaultBenchmarks();
  for (const bm of bmDefaults) {
    if (!parsed.benchmarks.some((b) => b.providerId === bm.providerId)) {
      parsed.benchmarks.unshift(bm);
    }
  }
  return parsed;
}
async function writeWorkspace(mode, state) {
  const target = mode === "demo" ? DEMO_DB_PATH : LIVE_DB_PATH;
  state.mode = mode;
  state.twin.readiness = computeReadiness(state.twin);
  await fs3.writeFile(target, JSON.stringify(state, null, 2));
  return state;
}
async function resetLiveWorkspace() {
  const geminiOk = isGeminiConfigured();
  const ffmpegOk = await checkFfmpegAvailable();
  const fresh = createInitialLiveState(geminiOk, ffmpegOk);
  await fs3.writeFile(LIVE_DB_PATH, JSON.stringify(fresh, null, 2));
  return fresh;
}
function appendAuditLog(state, entry) {
  state.auditLogs.unshift({
    id: `aud_${crypto.randomUUID().slice(0, 8)}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    ...entry
  });
  if (state.auditLogs.length > 200) {
    state.auditLogs = state.auditLogs.slice(0, 200);
  }
}

// server/visualDirector.ts
import crypto2 from "node:crypto";
import fs4 from "node:fs/promises";
import path4 from "node:path";
import { GoogleGenAI as GoogleGenAI2, ThinkingLevel as ThinkingLevel2, Type as Type2 } from "@google/genai";
var SCENE_CACHE_DIR = path4.resolve(process.cwd(), "data", "scene-cache");
var PUBLIC_CAST_DIR = path4.resolve(process.cwd(), "public", "cast");
var MOOD_PALETTES = {
  cosmic_space: { bgHex: "#0F1528", accentHex: "#D8B36A" },
  science_tech: { bgHex: "#132128", accentHex: "#7CC6C4" },
  comedy_office: { bgHex: "#2A1D15", accentHex: "#E09F5A" },
  finance_business: { bgHex: "#13201A", accentHex: "#C8A96B" },
  history_world: { bgHex: "#251D17", accentHex: "#CFA668" },
  mind_psychology: { bgHex: "#1E1726", accentHex: "#C99E76" },
  nature_earth: { bgHex: "#16231B", accentHex: "#A7BA78" },
  studio_editorial: { bgHex: "#1A1917", accentHex: "#B69A65" }
};
var CUT_RANGES = [
  [0, 0.17],
  [0.17, 0.34],
  [0.34, 0.52],
  [0.52, 0.68],
  [0.68, 0.84],
  [0.84, 1]
];
var FEMALE_VOICE_HINTS = [
  "ava",
  "emma",
  "swara",
  "neerja",
  "kore",
  "aoede",
  "leda",
  "zephyr"
];
function getGeminiClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !key.trim()) return null;
  return new GoogleGenAI2({
    apiKey: key.trim(),
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
function splitScriptInto6Cues(title, scriptText) {
  const full = (scriptText || title || "Creative story insight").replace(/\s+/g, " ").trim();
  const words = full.split(" ").filter(Boolean);
  if (words.length < 6) {
    return Array.from({ length: 6 }, () => full);
  }
  const perBeat = Math.ceil(words.length / 6);
  return Array.from({ length: 6 }, (_, i) => {
    const slice = words.slice(i * perBeat, (i + 1) * perBeat);
    return slice.length > 0 ? slice.join(" ") : words.slice(-perBeat).join(" ");
  });
}
function inferMoodFromText(text, backgroundStyle) {
  if (backgroundStyle === "Cosmic & Science Lab") return "cosmic_space";
  if (backgroundStyle === "Warm Comedy Stage") return "comedy_office";
  const t = text.toLowerCase();
  if (/\b(space|cosmos|planet|star|astronaut|galaxy|moon|gravity|nasa)\b|अंतरिक्ष|तारे|चांद|गुरुत्वाकर्षण/.test(t)) {
    return "cosmic_space";
  }
  if (/\b(science|lab|brain|neuron|atom|quantum|physics|chemistry|biology|dna|robot|ai|tech|algorithm)\b|विज्ञान|दिमाग|तकनीक/.test(t)) {
    return "science_tech";
  }
  if (/\b(comedy|funny|laugh|office|manager|boss|sync|meeting|monday|coffee|meme|joke)\b|हंसी|कॉमेडी|बॉस|ऑफिस/.test(t)) {
    return "comedy_office";
  }
  if (/\b(money|finance|stock|market|wealth|invest|startup|business|economy|rupee)\b|पैसा|निवेश|बिज़नेस/.test(t)) {
    return "finance_business";
  }
  if (/\b(psychology|mind|habit|mirror|airport|wait|focus|sleep|dream|emotion)\b|मनोविज्ञान|दिमाग|आदत|नींद/.test(t)) {
    return "mind_psychology";
  }
  if (/\b(history|ancient|empire|war|city|monument|india|heritage)\b|इतिहास|प्राचीन|शहर/.test(t)) {
    return "history_world";
  }
  if (/\b(earth|ocean|forest|nature|climate|mountain|water|animal)\b|प्रकृति|समुद्र|पृथ्वी/.test(t)) {
    return "nature_earth";
  }
  return "studio_editorial";
}
function fallbackQueriesForMood(mood, title) {
  const cleanTitle = title.replace(/[^\w\s-]/g, " ").trim();
  switch (mood) {
    case "cosmic_space":
      return [
        { query: "Earth seen from Apollo spacecraft", headline: "01 ZERO GRAVITY HOOK" },
        { query: "International Space Station astronaut", headline: "02 LIFE IN ORBIT" },
        { query: "Water droplet microgravity surface tension", headline: "03 SURFACE TENSION PHYSICS" },
        { query: "Carina Nebula Hubble telescope", headline: "04 DEEP SPACE PERSPECTIVE" },
        { query: "Astronaut helmet visor spacewalk", headline: "05 FLOATING IN SILENCE" },
        { query: "Milky Way night sky observatory", headline: "06 COSMIC TAKEAWAY" }
      ];
    case "science_tech":
      return [
        { query: "Multipolar neuron brain fluorescence", headline: "01 THE HIDDEN SIGNAL" },
        { query: "Physics laboratory optical experiment", headline: "02 HOW IT ACTUALLY WORKS" },
        { query: "Microchip silicon wafer macro", headline: "03 INSIDE THE MECHANISM" },
        { query: "Supercomputer server room technology", headline: "04 REAL-WORLD IMPACT" },
        { query: "Scientist microscope research laboratory", headline: "05 PROVEN EVIDENCE" },
        { query: "Solar eclipse science phenomenon", headline: "06 NEXT DISCOVERY" }
      ];
    case "comedy_office":
      return [
        { query: "Modern office meeting conference table", headline: "01 QUICK 5-MIN SYNC" },
        { query: "Laptop coffee desk workspace", headline: "02 CALENDAR HIJACK" },
        { query: "City commuter traffic rush hour", headline: "03 REALITY CHECK" },
        { query: "Espresso coffee cup cafe table", headline: "04 LUNCH HOUR LOST" },
        { query: "Corporate skyscraper glass building", headline: "05 CORPORATE SURVIVAL" },
        { query: "Sunset city skyline evening", headline: "06 SIGN OFF ON TIME" }
      ];
    case "finance_business":
      return [
        { query: "Stock exchange trading floor chart", headline: "01 FOLLOW THE MONEY" },
        { query: "City financial district skyscrapers", headline: "02 MARKET REALITY" },
        { query: "Gold bullion bank reserve", headline: "03 COMPOUNDING VALUE" },
        { query: "Startup team whiteboard strategy", headline: "04 SMART EXECUTION" },
        { query: "Currency banknotes economics concept", headline: "05 RISK VS REWARD" },
        { query: "Modern architecture bridge horizon", headline: "06 LONG-TERM PLAY" }
      ];
    case "mind_psychology":
      return [
        { query: "Airport baggage claim terminal", headline: "01 THE HIDDEN TRICK" },
        { query: "Human eye iris macro photography", headline: "02 PERCEPTION SHIFT" },
        { query: "Mirror reflection architecture glass", headline: "03 ATTENTION HACK" },
        { query: "Library books reading calm light", headline: "04 THE REAL EXPERIMENT" },
        { query: "Clockwork gears time mechanism", headline: "05 TIME PERCEPTION" },
        { query: "Walking path morning sunlight", headline: "06 EVERYDAY TAKEAWAY" }
      ];
    case "history_world":
      return [
        { query: "Ancient stone temple architecture", headline: "01 UNTOLD ORIGIN" },
        { query: "Antique world map compass", headline: "02 ACROSS CENTURIES" },
        { query: "Taj Mahal sunrise architecture", headline: "03 LIVING HERITAGE" },
        { query: "Ancient manuscript library archive", headline: "04 ARCHIVAL PROOF" },
        { query: "Roman colosseum panoramic history", headline: "05 TIMELESS LESSON" },
        { query: "Golden hour desert horizon", headline: "06 STILL RELEVANT TODAY" }
      ];
    case "nature_earth":
      return [
        { query: "Deep ocean wave blue water", headline: "01 PLANET WONDER" },
        { query: "Amazon rainforest aerial canopy", headline: "02 LIVING ECOSYSTEM" },
        { query: "Snowy mountain peak alpenglow", headline: "03 SCALE OF NATURE" },
        { query: "Coral reef underwater sunlight", headline: "04 HIDDEN BALANCE" },
        { query: "Aurora borealis night sky", headline: "05 NATURAL MAGIC" },
        { query: "Earth horizon sunrise atmosphere", headline: "06 PROTECT OUR WORLD" }
      ];
    default:
      return [
        { query: cleanTitle.split(" ").slice(0, 3).join(" ") || "Cinema camera studio lens", headline: "01 OPENING HOOK" },
        { query: "Podcast microphone recording studio", headline: "02 THE REAL INSIGHT" },
        { query: "Creative designer desk notebook", headline: "03 BREAKING IT DOWN" },
        { query: "Modern city architecture light", headline: "04 REAL EXAMPLE" },
        { query: "Film editing monitor timeline", headline: "05 WHY IT MATTERS" },
        { query: "Warm sunlit studio portrait backdrop", headline: "06 FINAL TAKEAWAY" }
      ];
  }
}
async function generateStoryboardViaGemini(title, cues, backgroundStyle) {
  const ai = getGeminiClient();
  if (!ai) return null;
  try {
    const prompt = `You are a Visual Film Director creating 6 chronological visual B-roll scenes matching each beat of a voiceover script.
Video Title: "${title}"
Requested Background Preference: "${backgroundStyle || "Auto-Match Script Theme"}"

For each of the 6 spoken script beats below, generate:
1. headline: concise 2-5 word visual caption/card header matching that beat (in English or crisp Hinglish)
2. searchQuery: 2-4 concrete English noun keywords that match real-world Wikipedia / Wikimedia photography (e.g., "astronaut space earth", "office laptop coffee", "human brain neuron", "airport baggage claim", "coral reef underwater"). Avoid abstract adjectives!
3. themeMood: one of cosmic_space, science_tech, comedy_office, finance_business, history_world, mind_psychology, nature_earth, studio_editorial.

Beats:
${cues.map((c, i) => `Beat ${i + 1}: "${c}"`).join("\n")}`;
    const resp = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel2.LOW },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type2.ARRAY,
          items: {
            type: Type2.OBJECT,
            properties: {
              headline: { type: Type2.STRING },
              searchQuery: { type: Type2.STRING },
              themeMood: { type: Type2.STRING }
            },
            required: ["headline", "searchQuery", "themeMood"]
          }
        }
      }
    });
    const parsed = JSON.parse((resp.text ?? "[]").trim());
    if (Array.isArray(parsed) && parsed.length >= 6) {
      return parsed.slice(0, 6).map((item) => {
        const mood = Object.keys(MOOD_PALETTES).includes(item.themeMood) ? item.themeMood : inferMoodFromText(`${title} ${cues.join(" ")}`, backgroundStyle);
        return {
          headline: String(item.headline || "SCENE INSIGHT").slice(0, 42),
          searchQuery: String(item.searchQuery || title).slice(0, 80),
          themeMood: mood
        };
      });
    }
  } catch {
  }
  return null;
}
async function fetchTopicPhotoCandidates(query) {
  const results = [];
  const headers = { "User-Agent": "TwinForgeStudio/1.0 (visual-director)" };
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      query
    )}&gsrlimit=4&prop=pageimages&piprop=thumbnail|original&pithumbsize=1200&format=json&origin=*`;
    const r = await fetch(wikiUrl, { headers, signal: AbortSignal.timeout(4500) });
    if (r.ok) {
      const data = await r.json();
      const pages = Object.values(data?.query?.pages || {});
      for (const p of pages) {
        const src = p?.thumbnail?.source || p?.original?.source;
        if (src && /\.(jpe?g|png)(\?|$)/i.test(src)) {
          results.push(src);
        }
      }
    }
  } catch {
  }
  if (results.length < 2) {
    try {
      const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
        `${query} filetype:bitmap`
      )}&gsrlimit=5&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=1200&format=json`;
      const r = await fetch(commonsUrl, { headers, signal: AbortSignal.timeout(4500) });
      if (r.ok) {
        const data = await r.json();
        const pages = Object.values(data?.query?.pages || {});
        for (const p of pages) {
          const info = p?.imageinfo?.[0];
          if (info && (info.mime === "image/jpeg" || info.mime === "image/png") && (info.width || 0) >= 500) {
            const src = info.thumburl || info.url;
            if (src) results.push(src);
          }
        }
      }
    } catch {
    }
  }
  return Array.from(new Set(results));
}
async function cacheImageLocally(remoteUrl, cacheKey) {
  await fs4.mkdir(SCENE_CACHE_DIR, { recursive: true });
  const hash = crypto2.createHash("sha1").update(cacheKey).digest("hex").slice(0, 16);
  const ext = /\.png(\?|$)/i.test(remoteUrl) ? ".png" : ".jpg";
  const filename = `scene_${hash}${ext}`;
  const destPath = path4.join(SCENE_CACHE_DIR, filename);
  try {
    const st = await fs4.stat(destPath);
    if (st.size > 8e3) {
      return { localPath: destPath, publicUrl: `/api/media/scenes/${filename}` };
    }
  } catch {
  }
  try {
    const resp = await fetch(remoteUrl, {
      headers: { "User-Agent": "TwinForgeStudio/1.0" },
      signal: AbortSignal.timeout(6e3)
    });
    if (!resp.ok) return null;
    const ct = resp.headers.get("content-type") || "";
    if (!ct.includes("image/jpeg") && !ct.includes("image/png") && !ct.includes("image/webp")) {
      return null;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < 8e3) return null;
    await fs4.writeFile(destPath, buf);
    return { localPath: destPath, publicUrl: `/api/media/scenes/${filename}` };
  } catch {
    return null;
  }
}
async function resolvePresenterSelection(params) {
  const requestedMode = params.presenterMode || "auto_match";
  if (requestedMode === "faceless_broll") {
    return {
      presenterModeResolved: "faceless_broll",
      presenterLabel: "Visual Documentary Only (Script B-Roll, No Same Face)",
      presenterImageUrls: [],
      presenterDiskPaths: []
    };
  }
  const castFiles = {
    cast_ananya: {
      url: "/cast/ananya_warm.jpg",
      disk: path4.join(PUBLIC_CAST_DIR, "ananya_warm.jpg"),
      label: "Ananya \xB7 Warm Hindi Storyteller"
    },
    cast_meera: {
      url: "/cast/meera_science.jpg",
      disk: path4.join(PUBLIC_CAST_DIR, "meera_science.jpg"),
      label: "Meera \xB7 Science & Tech Educator"
    },
    cast_kabir: {
      url: "/cast/kabir_storyteller.jpg",
      disk: path4.join(PUBLIC_CAST_DIR, "kabir_storyteller.jpg"),
      label: "Kabir \xB7 Comedy & Story Host"
    }
  };
  if (requestedMode === "cast_ananya" || requestedMode === "cast_meera" || requestedMode === "cast_kabir") {
    const chosen = castFiles[requestedMode];
    try {
      await fs4.access(chosen.disk);
      return {
        presenterModeResolved: requestedMode,
        presenterLabel: chosen.label,
        presenterImageUrls: [chosen.url],
        presenterDiskPaths: [chosen.disk]
      };
    } catch {
    }
  }
  if (requestedMode === "twin_owner" && params.twinFaceImageAssets.length > 0) {
    const preferred = params.twinFaceImageAssets.find((a) => a.id === params.preferredPortraitId) || params.twinFaceImageAssets[0];
    const ordered = [
      preferred,
      ...params.twinFaceImageAssets.filter((a) => a.id !== preferred.id)
    ];
    return {
      presenterModeResolved: "twin_owner",
      presenterLabel: "My Uploaded Twin Portrait",
      presenterImageUrls: ordered.map((a) => a.url),
      presenterDiskPaths: ordered.map((a) => a.diskPath).filter((x) => Boolean(x))
    };
  }
  const voiceLower = (params.voiceIdentity || "").toLowerCase();
  const isFemaleVoice = FEMALE_VOICE_HINTS.some((h) => voiceLower.includes(h));
  const mood = inferMoodFromText(`${params.title || ""} ${params.scriptText || ""}`);
  if (isFemaleVoice) {
    const femaleKey = mood === "science_tech" || mood === "cosmic_space" || mood === "finance_business" ? "cast_meera" : "cast_ananya";
    const chosen = castFiles[femaleKey];
    try {
      await fs4.access(chosen.disk);
      return {
        presenterModeResolved: femaleKey,
        presenterLabel: `${chosen.label} (Matched to Female Voice)`,
        presenterImageUrls: [chosen.url],
        presenterDiskPaths: [chosen.disk]
      };
    } catch {
    }
  }
  const isLiveCustomPortrait = params.mode === "live" && params.twinFaceImageAssets.length > 0;
  if (isLiveCustomPortrait) {
    const preferred = params.twinFaceImageAssets.find((a) => a.id === params.preferredPortraitId) || params.twinFaceImageAssets[0];
    const ordered = [
      preferred,
      ...params.twinFaceImageAssets.filter((a) => a.id !== preferred.id)
    ];
    return {
      presenterModeResolved: "twin_owner",
      presenterLabel: "Your Uploaded Twin Portrait (Matched to Male Voice)",
      presenterImageUrls: ordered.map((a) => a.url),
      presenterDiskPaths: ordered.map((a) => a.diskPath).filter((x) => Boolean(x))
    };
  }
  if (mood !== "studio_editorial") {
    const chosen = castFiles.cast_kabir;
    try {
      await fs4.access(chosen.disk);
      return {
        presenterModeResolved: "cast_kabir",
        presenterLabel: `${chosen.label} (Matched to Script & Male Voice)`,
        presenterImageUrls: [chosen.url],
        presenterDiskPaths: [chosen.disk]
      };
    } catch {
    }
  }
  const orderedFallback = params.twinFaceImageAssets;
  return {
    presenterModeResolved: "twin_owner",
    presenterLabel: "Studio Editorial Presenter",
    presenterImageUrls: orderedFallback.map((a) => a.url),
    presenterDiskPaths: orderedFallback.map((a) => a.diskPath).filter((x) => Boolean(x))
  };
}
async function planAndFetchScriptVisuals(params) {
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
      themeMood: overallMood
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
      accentHex: palette.accentHex
    };
  });
  const usedUrls = /* @__PURE__ */ new Set();
  const resolvedDiskPaths = Array(6).fill(void 0);
  await Promise.all(
    rawBeats.map(async (beat, idx) => {
      const primary = await fetchTopicPhotoCandidates(beat.searchQuery);
      const fallback = primary.length < 3 ? await fetchTopicPhotoCandidates(fallbackSpecs[idx].query) : [];
      const pool = Array.from(/* @__PURE__ */ new Set([...primary, ...fallback]));
      const orderedCandidates = [
        ...pool.filter((u) => !usedUrls.has(u)),
        ...pool.filter((u) => usedUrls.has(u))
      ];
      for (const cand of orderedCandidates.slice(0, 4)) {
        usedUrls.add(cand);
        const cached = await cacheImageLocally(cand, `${beat.searchQuery}_${cand}`);
        if (cached) {
          beat.imageUrl = cached.publicUrl;
          resolvedDiskPaths[idx] = cached.localPath;
          break;
        }
      }
    })
  );
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
    preferredPortraitId: params.preferredPortraitId
  });
  return {
    beats: rawBeats,
    beatDiskPaths: resolvedDiskPaths,
    presenter
  };
}

// server.ts
function resolveMode(req) {
  const header = req.headers["x-workspace-mode"];
  const q = req.query.mode;
  if (header === "demo" || q === "demo") return "demo";
  return "live";
}
function safeFilename(original) {
  const ext = path5.extname(original).replace(/[^a-zA-Z0-9.]/g, "") || ".bin";
  return `${Date.now()}_${crypto3.randomUUID().slice(0, 6)}${ext}`;
}
function resolveLocalAssetPath(mediaUrl) {
  if (!mediaUrl) return null;
  if (mediaUrl.startsWith("/api/media/demo/")) {
    return path5.join(DEMO_ASSETS_DIR, path5.basename(mediaUrl));
  }
  if (mediaUrl.startsWith("/api/media/uploads/")) {
    return path5.join(UPLOADS_DIR, path5.basename(mediaUrl));
  }
  if (mediaUrl.startsWith("/api/media/audio/")) {
    return path5.join(AUDIO_DIR, path5.basename(mediaUrl));
  }
  if (mediaUrl.startsWith("/api/media/videos/")) {
    return path5.join(VIDEOS_DIR, path5.basename(mediaUrl));
  }
  return null;
}
function estimateJobCost(state, qualityTier, voiceProvider, visualProvider, durationSec) {
  const mins = Math.max(0.5, durationSec / 60);
  let voiceRate = 0;
  if (voiceProvider === "gemini_lite_tts") voiceRate = 0.015;
  else if (voiceProvider === "gemini_flash_tts") voiceRate = 0.03;
  else if (voiceProvider === "elevenlabs_webhook") voiceRate = 0.18;
  let visualRate = 0;
  if (visualProvider === "gemini_omni_veo") visualRate = 0.45;
  else if (visualProvider === "liveportrait_webhook") visualRate = 0.14;
  else if (visualProvider === "heygen_webhook") visualRate = 0.6;
  const estimatedVoiceUsd = Number((voiceRate * mins).toFixed(4));
  const estimatedVisualUsd = Number((visualRate * mins).toFixed(4));
  const estimatedTotalUsd = Number((estimatedVoiceUsd + estimatedVisualUsd).toFixed(4));
  const isFreeVisual = visualProvider === "free_canvas_animator" || visualProvider === "ffmpeg_local" || visualProvider === "free_hf_space";
  const requiresExplicitPaidApproval = qualityTier === "premium" || !isFreeVisual || voiceProvider === "elevenlabs_webhook" || state.settings.requireExplicitPaidApproval && estimatedTotalUsd > 0;
  let qualityAdvisory = "Balanced Mode uses expressive Gemini 3.8 TTS voice audition combined with Multi-Scene FFmpeg Motion Director (>=30s).";
  let recommendedUpgradeTier;
  let recommendedUpgradeReason;
  if (qualityTier === "local_free") {
    const freeVoiceLabel = voiceProvider === "free_hindi_neural" ? "Free Natural Hindi / Indian Neural Voice ($0.00)" : "Free Studio Audio ($0.00)";
    qualityAdvisory = visualProvider === "free_canvas_animator" ? `${freeVoiceLabel} + Free Live Motion Animator active \u2014 30fps facial crossfades, camera cuts, waveform, and >=30s captions at $0.00 cost.` : visualProvider === "free_hf_space" ? `${freeVoiceLabel} + Hugging Face ZeroGPU Space adapter selected. Ensure your Gradio Space URL is connected in Integrations.` : `${freeVoiceLabel} + 6-Shot FFmpeg Motion Director active \u2014 renders minimum 30s dynamic camera cuts, xfade transitions, waveform, and subtitles at $0.00 cost.`;
  } else if (qualityTier === "balanced" && isFreeVisual) {
    qualityAdvisory = "Balanced Mode pairs expressive Gemini 3.8 TTS voiceover with multi-scene motion cuts (>=30s) and audio-reactive studio animation. Upgrade to Premium Realism for generative Veo 3D head motion.";
    recommendedUpgradeTier = "premium";
    recommendedUpgradeReason = "Upgrade to Premium Realism (Gemini Omni / Veo or LivePortrait) when photorealistic 3D generative facial motion is required.";
  } else if (qualityTier === "premium") {
    qualityAdvisory = "Premium Realism Mode pairs photorealistic generative/neural motion with local FFmpeg audio muxing, captions, and provenance watermarking.";
  }
  return {
    qualityTier,
    voiceProvider,
    visualProvider,
    estimatedVoiceUsd,
    estimatedVisualUsd,
    estimatedTotalUsd,
    requiresExplicitPaidApproval,
    estimatedProcessingSec: visualProvider === "gemini_omni_veo" ? 45 : 5,
    qualityAdvisory,
    recommendedUpgradeTier,
    recommendedUpgradeReason
  };
}
function scoreNicheRelevance(text, niche) {
  const cleanText = text.toLowerCase();
  const keywords = niche.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  const generalTerms = ["ai", "creator", "video", "content", "product", "tech", "founder", "workflow", "social", "media"];
  const allTerms = Array.from(/* @__PURE__ */ new Set([...keywords, ...generalTerms]));
  let hits = 0;
  for (const term of allTerms) {
    if (cleanText.includes(term)) hits += 1;
  }
  return Math.min(98, Math.max(58, 60 + hits * 7));
}
async function startServer() {
  await ensureInitialized();
  const app = express();
  app.use(express.json({ limit: "25mb" }));
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
      filename: (_req, file, cb) => cb(null, safeFilename(file.originalname))
    }),
    limits: { fileSize: 50 * 1024 * 1024 }
  });
  await fs5.mkdir(SCENE_CACHE_DIR, { recursive: true });
  app.use("/api/media/uploads", express.static(UPLOADS_DIR));
  app.use("/api/media/audio", express.static(AUDIO_DIR));
  app.use("/api/media/videos", express.static(VIDEOS_DIR));
  app.use("/api/media/covers", express.static(COVERS_DIR));
  app.use("/api/media/demo", express.static(DEMO_ASSETS_DIR));
  app.use("/api/media/scenes", express.static(SCENE_CACHE_DIR));
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, status: "ready", uptimeSec: Math.round(process.uptime()) });
  });
  app.get("/api/workspace", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      res.json(state);
    } catch (err) {
      res.status(500).json({ error: err.message || "Failed to load workspace." });
    }
  });
  app.post("/api/twin/upload-face", upload.single("file"), async (req, res) => {
    try {
      const mode = resolveMode(req);
      if (!req.file) return res.status(400).json({ error: "No image or video file received." });
      const category = req.body.category || "front";
      const label = String(req.body.label || req.file.originalname);
      const state = await readWorkspace(mode);
      state.twin.faceAssets.unshift({
        id: `face_${crypto3.randomUUID().slice(0, 8)}`,
        category,
        label,
        url: `/api/media/uploads/${req.file.filename}`,
        mimeType: req.file.mimetype,
        filename: req.file.originalname,
        sizeBytes: req.file.size,
        uploadedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || "Creator",
        category: "identity",
        action: "Face Reference Added",
        detail: `${label} (${category}) uploaded to local identity vault.`
      });
      const saved = await writeWorkspace(mode, state);
      res.json(saved);
    } catch (err) {
      res.status(500).json({ error: err.message || "Face upload failed." });
    }
  });
  app.delete("/api/twin/face/:id", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const target = state.twin.faceAssets.find((f) => f.id === req.params.id);
      state.twin.faceAssets = state.twin.faceAssets.filter((f) => f.id !== req.params.id);
      if (target && target.url.startsWith("/api/media/uploads/")) {
        await fs5.unlink(path5.join(UPLOADS_DIR, path5.basename(target.url))).catch(() => {
        });
      }
      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || "Creator",
        category: "identity",
        action: "Face Reference Removed",
        detail: `Removed face reference ${target?.label || req.params.id}.`
      });
      res.json(await writeWorkspace(mode, state));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/twin/upload-voice", upload.single("file"), async (req, res) => {
    try {
      const mode = resolveMode(req);
      if (!req.file) return res.status(400).json({ error: "No audio recording received." });
      const label = String(req.body.label || req.file.originalname || "Voice Sample");
      const language = req.body.language || "English";
      const emotion = req.body.emotion || "Conversational";
      const diskPath = path5.join(UPLOADS_DIR, req.file.filename);
      const durationSec = await getMediaDurationSec(diskPath);
      const state = await readWorkspace(mode);
      state.twin.voiceSamples.unshift({
        id: `voice_${crypto3.randomUUID().slice(0, 8)}`,
        label,
        language,
        emotion,
        url: `/api/media/uploads/${req.file.filename}`,
        mimeType: req.file.mimetype || "audio/webm",
        filename: req.file.originalname,
        sizeBytes: req.file.size,
        durationSec: durationSec || void 0,
        verified: false,
        uploadedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || "Creator",
        category: "identity",
        action: "Voice Sample Added",
        detail: `${label} (${language} \xB7 ${emotion}) saved.`
      });
      res.json(await writeWorkspace(mode, state));
    } catch (err) {
      res.status(500).json({ error: err.message || "Voice upload failed." });
    }
  });
  app.post("/api/twin/transcribe-voice/:id", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const sample = state.twin.voiceSamples.find((v) => v.id === req.params.id);
      if (!sample) return res.status(404).json({ error: "Voice sample not found." });
      const localPath = resolveLocalAssetPath(sample.url);
      if (!localPath) {
        return res.status(400).json({ error: "This sample has no audio file on disk to transcribe." });
      }
      const transcript = await transcribeUploadedAudio({
        audioFilePath: localPath,
        mimeType: sample.mimeType,
        languageHint: sample.language
      });
      sample.transcript = transcript || "(No clear speech detected)";
      sample.verified = Boolean(transcript && transcript.trim().length > 2);
      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || "Creator",
        category: "identity",
        action: "Voice Sample Verified",
        detail: `Transcribed "${sample.label}" via Gemini 3.5 Transcribe.`
      });
      res.json(await writeWorkspace(mode, state));
    } catch (err) {
      res.status(500).json({ error: err.message || "Voice transcription failed." });
    }
  });
  app.delete("/api/twin/voice/:id", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const target = state.twin.voiceSamples.find((v) => v.id === req.params.id);
      state.twin.voiceSamples = state.twin.voiceSamples.filter((v) => v.id !== req.params.id);
      if (target && target.url.startsWith("/api/media/uploads/")) {
        await fs5.unlink(path5.join(UPLOADS_DIR, path5.basename(target.url))).catch(() => {
        });
      }
      res.json(await writeWorkspace(mode, state));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/twin/personality", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      state.twin.personality = {
        ...state.twin.personality,
        ...req.body
      };
      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || "Creator",
        category: "identity",
        action: "Personality Profile Updated",
        detail: `Updated speaking persona for ${state.twin.personality.creatorName || "creator"} (${state.twin.personality.primaryLanguage}).`
      });
      res.json(await writeWorkspace(mode, state));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/twin/consent", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const { ownerFullName, likenessUsageScope, requireAiDisclosure, attested } = req.body;
      state.twin.consent = {
        attested: Boolean(attested),
        ownerFullName: String(ownerFullName || ""),
        attestedAt: attested ? (/* @__PURE__ */ new Date()).toISOString() : null,
        likenessUsageScope: String(
          likenessUsageScope || "Personal content creation owned by the verified creator only."
        ),
        requireAiDisclosure: Boolean(requireAiDisclosure)
      };
      appendAuditLog(state, {
        actor: ownerFullName || "Creator",
        category: "consent",
        action: attested ? "Biometric Likeness Consent Signed" : "Consent Revoked",
        detail: `Owner: ${ownerFullName || "Unspecified"} \xB7 AI Disclosure: ${requireAiDisclosure ? "Required" : "Optional"}`
      });
      res.json(await writeWorkspace(mode, state));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/trends/refresh", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
      const fetchedItems = [];
      const feedErrors = [];
      const enabledFeeds = state.settings.rssFeeds.filter((f) => f.enabled);
      await Promise.all(
        enabledFeeds.map(async (feed) => {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 7e3);
            const resp = await fetch(feed.url, {
              signal: controller.signal,
              headers: { "User-Agent": "TwinForgeStudio/1.0 (+RSS-Reader)" }
            });
            clearTimeout(timer);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const xml = await resp.text();
            const parsed = parser.parse(xml);
            const rssItems = parsed?.rss?.channel?.item;
            const atomEntries = parsed?.feed?.entry;
            const rawList = Array.isArray(rssItems) ? rssItems : rssItems ? [rssItems] : Array.isArray(atomEntries) ? atomEntries : atomEntries ? [atomEntries] : [];
            for (const entry of rawList.slice(0, 4)) {
              const title = String(entry.title?.["#text"] || entry.title || "").replace(/<[^>]+>/g, "").trim();
              if (!title) continue;
              const rawLink = typeof entry.link === "string" ? entry.link : entry.link?.["@_href"] || entry.link?.[0]?.["@_href"] || feed.url;
              const desc = String(
                entry.description?.["#text"] || entry.description || entry.summary?.["#text"] || entry.summary || ""
              ).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 220);
              const pubDate = entry.pubDate || entry.published || entry.updated || (/* @__PURE__ */ new Date()).toISOString();
              const rel = scoreNicheRelevance(`${title} ${desc}`, state.twin.personality.niche);
              fetchedItems.push({
                id: `trend_${crypto3.createHash("md5").update(title).digest("hex").slice(0, 10)}`,
                topic: title,
                platform: "RSS / News",
                category: feed.defaultCategory,
                sourceUrl: String(rawLink),
                sourceName: feed.name,
                sourceType: "rss",
                discoveredAt: new Date(pubDate).toString() === "Invalid Date" ? (/* @__PURE__ */ new Date()).toISOString() : new Date(pubDate).toISOString(),
                summary: desc || "Live public RSS headline imported without modification.",
                metrics: {
                  available: false,
                  note: "Public RSS feeds do not expose view or engagement counts"
                },
                relevanceScore: rel,
                opportunityScore: Math.min(97, Math.round(rel * 0.96))
              });
            }
          } catch (e) {
            feedErrors.push(`${feed.name}: ${e.message || "fetch failed"}`);
          }
        })
      );
      const existingById = new Map(state.trends.map((t) => [t.id, t]));
      for (const item of fetchedItems) {
        existingById.set(item.id, item);
      }
      state.trends = Array.from(existingById.values()).sort((a, b) => new Date(b.discoveredAt).getTime() - new Date(a.discoveredAt).getTime()).slice(0, 40);
      appendAuditLog(state, {
        actor: "Trend Radar",
        category: "intelligence",
        action: "Live RSS Sync Completed",
        detail: `Imported ${fetchedItems.length} live feed articles across ${enabledFeeds.length} sources.`
      });
      const saved = await writeWorkspace(mode, state);
      res.json({ workspace: saved, fetchedCount: fetchedItems.length, feedErrors });
    } catch (err) {
      res.status(500).json({ error: err.message || "Failed to refresh RSS feeds." });
    }
  });
  app.post("/api/trends/import", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const { topic, platform, category, sourceUrl, summary, views, engagementRate } = req.body;
      if (!topic || !String(topic).trim()) {
        return res.status(400).json({ error: "Trend topic is required." });
      }
      const rel = scoreNicheRelevance(`${topic} ${summary || ""}`, state.twin.personality.niche);
      const hasMetrics = Boolean(views && String(views).trim() || engagementRate && String(engagementRate).trim());
      const item = {
        id: `trend_${crypto3.randomUUID().slice(0, 8)}`,
        topic: String(topic).trim(),
        platform: platform || "Manual",
        category: category || "Rising",
        sourceUrl: String(sourceUrl || ""),
        sourceName: "Creator Manual Import",
        sourceType: "manual",
        discoveredAt: (/* @__PURE__ */ new Date()).toISOString(),
        summary: String(summary || "Manually curated creator trend brief."),
        metrics: hasMetrics ? {
          available: true,
          views: views ? String(views) : void 0,
          engagementRate: engagementRate ? String(engagementRate) : void 0,
          note: "Observed metrics supplied manually by creator"
        } : {
          available: false,
          note: "No external platform metrics attached"
        },
        relevanceScore: rel,
        opportunityScore: Math.min(98, rel + 2)
      };
      state.trends.unshift(item);
      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || "Creator",
        category: "intelligence",
        action: "Trend Imported Manually",
        detail: `${item.topic} (${item.platform} \xB7 ${item.category})`
      });
      res.json(await writeWorkspace(mode, state));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/intelligence/fetch-online", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const { genre, query, language, alsoImportToRadar } = req.body;
      const targetGenre = genre || "Knowledge";
      const targetLang = language || state.twin.personality.primaryLanguage || "Hindi";
      const { ideas, groundingSources } = await fetchOnlineViralIdeas({
        genre: targetGenre,
        query: query ? String(query) : void 0,
        language: targetLang,
        personality: state.twin.personality
      });
      const existing = Array.isArray(state.onlineIdeas) ? state.onlineIdeas : [];
      state.onlineIdeas = [...ideas, ...existing].slice(0, 30);
      if (alsoImportToRadar) {
        const mappedCat = targetGenre === "Comedy" ? "Comedy" : targetGenre === "Science" ? "Science" : targetGenre === "Knowledge" || targetGenre === "History & Facts" ? "Knowledge" : targetGenre === "Tech & AI" ? "Technology" : targetGenre === "Business & Finance" ? "Business" : "Viral";
        for (const idea of ideas.slice(0, 4)) {
          const id = `trend_${crypto3.createHash("md5").update(idea.title).digest("hex").slice(0, 10)}`;
          if (!state.trends.some((t) => t.id === id)) {
            state.trends.unshift({
              id,
              topic: idea.title,
              platform: "Online Search",
              category: mappedCat,
              sourceUrl: idea.sourceUrl || "",
              sourceName: idea.sourceTitle || "Google Search Grounded Discovery",
              sourceType: "web_search",
              discoveredAt: idea.fetchedAt,
              summary: `${idea.hookIdea} \u2014 ${idea.suggestedAngle}`,
              metrics: {
                available: false,
                note: `Web-grounded ${targetGenre} idea \xB7 ${idea.viralTrigger}`
              },
              relevanceScore: 91,
              opportunityScore: 93
            });
          }
        }
      }
      appendAuditLog(state, {
        actor: "Gemini Web Search",
        category: "intelligence",
        action: `Fetched Online Viral Ideas (${targetGenre})`,
        detail: `Discovered ${ideas.length} grounded ${targetGenre} ideas (${groundingSources.length} web sources).`
      });
      const saved = await writeWorkspace(mode, state);
      res.json({ workspace: saved, ideas, groundingSources });
    } catch (err) {
      res.status(500).json({ error: err.message || "Failed to fetch online viral ideas." });
    }
  });
  app.post("/api/intelligence/create-blank", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const { title, trendTopic, genre, writingStyle, language, hook3s, body, cta } = req.body;
      const lang = language || state.twin.personality.primaryLanguage || "Hindi";
      const topicTitle = String(title || trendTopic || "").trim() || `Custom ${genre || "Creator"} Script`;
      const h = String(hook3s || "").trim() || "Wait \u2014 what if everything you assumed about this was upside down?";
      const b = String(body || "").trim() || "Write or paste your full monologue here (target 75+ words for a 30+ second video), or use the AI Writing Tools above to punch up your hook, add comedy or science facts, and translate into natural Hindi or Hinglish.";
      const c = String(cta || "").trim() || "Follow and comment your favorite part below.";
      const wc = `${h} ${b} ${c}`.trim().split(/\s+/).filter(Boolean).length;
      const varId = `var_${Date.now()}_0`;
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const pack = {
        id: `scr_${crypto3.randomUUID().slice(0, 8)}`,
        trendTopic: topicTitle,
        genre: genre || "Knowledge",
        writingStyle: writingStyle || "Viral Hook & Curiosity",
        language: lang,
        recommendedFormat: "Talking-Head",
        thesis: "Creator original script authored directly inside Content Intelligence.",
        audiencePainPoint: "Custom creator angle.",
        ctaStrategy: c,
        selectedVariantId: varId,
        variants: [
          {
            id: varId,
            toneName: "Natural & Conversational",
            hook3s: h,
            body: b,
            cta: c,
            wordCount: wc,
            estimatedDurationSec: Math.max(30, Math.round(wc / 2.3))
          }
        ],
        approvalStatus: "draft",
        createdAt: now,
        updatedAt: now
      };
      state.scripts.unshift(pack);
      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || "Creator",
        category: "intelligence",
        action: "Created Custom Script Draft",
        detail: `${topicTitle} (${pack.genre} \xB7 ${lang})`
      });
      const saved = await writeWorkspace(mode, state);
      res.json({ workspace: saved, scriptId: pack.id });
    } catch (err) {
      res.status(500).json({ error: err.message || "Failed to create blank script." });
    }
  });
  app.post("/api/intelligence/generate", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const {
        trendId,
        trendTopic,
        trendSummary,
        language,
        targetDurationSec,
        genre,
        writingStyle,
        sourceUrl
      } = req.body;
      if (!trendTopic) return res.status(400).json({ error: "A trend topic or prompt is required." });
      const result = await generateIntelligenceScripts({
        trendTopic: String(trendTopic),
        trendSummary: String(trendSummary || trendTopic),
        language: language || state.twin.personality.primaryLanguage || "English",
        personality: state.twin.personality,
        targetDurationSec: Math.max(MIN_VIDEO_DURATION_SEC, Number(targetDurationSec) || 35),
        genre,
        writingStyle,
        sourceUrl
      });
      const pack = {
        id: `scr_${crypto3.randomUUID().slice(0, 8)}`,
        trendId: trendId || void 0,
        ...result,
        approvalStatus: "draft",
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      state.scripts.unshift(pack);
      appendAuditLog(state, {
        actor: "Gemini 4 Hydrogen",
        category: "intelligence",
        action: `Generated ${pack.variants.length} ${pack.genre || "Viral"} Scripts`,
        detail: `${pack.trendTopic.slice(0, 56)} (${pack.language})`
      });
      const saved = await writeWorkspace(mode, state);
      res.json({ workspace: saved, scriptId: pack.id });
    } catch (err) {
      res.status(500).json({ error: err.message || "Script generation failed." });
    }
  });
  app.post("/api/intelligence/:id/rewrite", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const pack = state.scripts.find((s) => s.id === req.params.id);
      if (!pack) return res.status(404).json({ error: "Script pack not found." });
      const { variantId, action } = req.body;
      const targetVar = pack.variants.find((v) => v.id === variantId) || pack.variants.find((v) => v.id === pack.selectedVariantId) || pack.variants[0];
      if (!targetVar) return res.status(404).json({ error: "Script variant not found." });
      const rewritten = await rewriteScriptVariant({
        hook3s: targetVar.hook3s,
        body: targetVar.body,
        cta: targetVar.cta,
        action,
        genre: pack.genre,
        writingStyle: pack.writingStyle,
        language: pack.language,
        personality: state.twin.personality
      });
      targetVar.hook3s = rewritten.hook3s;
      targetVar.body = rewritten.body;
      targetVar.cta = rewritten.cta;
      targetVar.wordCount = rewritten.wordCount;
      targetVar.estimatedDurationSec = rewritten.estimatedDurationSec;
      if (action === "to_hindi") pack.language = "Hindi";
      else if (action === "to_hinglish") pack.language = "Hinglish";
      else if (action === "to_english") pack.language = "English";
      pack.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      appendAuditLog(state, {
        actor: "Gemini Writing Assistant",
        category: "intelligence",
        action: `Script Rewritten (${action})`,
        detail: `${pack.trendTopic.slice(0, 54)} (${rewritten.wordCount} words)`
      });
      const saved = await writeWorkspace(mode, state);
      res.json({ workspace: saved, action });
    } catch (err) {
      res.status(500).json({ error: err.message || "Script rewrite failed." });
    }
  });
  app.put("/api/intelligence/:id", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const idx = state.scripts.findIndex((s) => s.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: "Script pack not found." });
      state.scripts[idx] = {
        ...state.scripts[idx],
        ...req.body,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (req.body.approvalStatus === "approved") {
        appendAuditLog(state, {
          actor: state.twin.personality.creatorName || "Creator",
          category: "intelligence",
          action: "Script Approved for Studio",
          detail: state.scripts[idx].trendTopic.slice(0, 72)
        });
      }
      res.json(await writeWorkspace(mode, state));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/voice/audition", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const {
        text,
        provider,
        voiceIdentity,
        language,
        emotion,
        speakingSpeed,
        prosodyPreset,
        pitchWarmth,
        naturalPauses
      } = req.body;
      if (!text || !text.trim()) {
        return res.status(400).json({ error: "Audition script text is required." });
      }
      const filename = `audition_${Date.now()}_${crypto3.randomUUID().slice(0, 5)}.wav`;
      const outPath = path5.join(AUDIO_DIR, filename);
      let actualTtsModel = "";
      let resolvedProvider = provider;
      let resolvedVoiceLabel = voiceIdentity || "en-US-AndrewMultilingualNeural";
      let fallbackNotice;
      if (provider === "free_hindi_neural") {
        try {
          const persona = state.twin.personality;
          const edgeRes = await synthesizeEdgeNeuralSpeechWav({
            text: text.slice(0, 2200),
            voiceIdentity: voiceIdentity || persona.preferredVoiceId || "en-US-AndrewMultilingualNeural",
            language: language || "Hindi",
            speakingSpeed: Number(speakingSpeed) || persona.voicePace || 0.95,
            prosodyPreset: prosodyPreset || persona.voiceProsodyPreset || "warm_storyteller",
            pitchWarmth: pitchWarmth || persona.voicePitchWarmth || "warm",
            naturalPauses: typeof naturalPauses === "boolean" ? naturalPauses : persona.naturalPausesEnabled !== false,
            outputWavPath: outPath
          });
          actualTtsModel = edgeRes.voiceUsed;
          resolvedVoiceLabel = `${edgeRes.voiceUsed} (Free Conversational Hindi Neural)`;
        } catch (edgeErr) {
          const ttsResult = await synthesizeGeminiSpeechWav({
            text: text.slice(0, 900),
            provider: "gemini_lite_tts",
            voiceIdentity: "Charon",
            language: language || "Hindi",
            emotion: emotion || "Conversational Editorial",
            outputWavPath: outPath
          });
          resolvedProvider = "gemini_lite_tts";
          actualTtsModel = ttsResult.modelUsed;
          resolvedVoiceLabel = `Charon (${ttsResult.modelUsed} Fallback)`;
          fallbackNotice = `Free Edge Hindi Neural stream unavailable (${edgeErr.message || "network"}); synthesized via ${ttsResult.modelUsed}.`;
        }
      } else if (provider === "ambient_studio") {
        const words = text.trim().split(/\s+/).filter(Boolean).length;
        const dur = Math.max(8, Math.min(45, Math.round(words / 2.3) || 10));
        await synthesizeAmbientStudioWav({ durationSec: dur, outputWavPath: outPath });
        resolvedVoiceLabel = "Studio Harmonic Beat ($0.00)";
      } else if (provider === "kokoro_local" || provider === "piper_local") {
        const connector = state.integrations.find((i) => i.id === "kokoro_local");
        if (!connector?.endpointUrl) {
          return res.status(400).json({
            error: "Local Kokoro/Piper endpoint URL is not configured in Integrations. Switch to Free Natural Hindi Neural Voice ($0.00) or Gemini Speech."
          });
        }
        const resp = await fetch(connector.endpointUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: voiceIdentity, language })
        });
        if (!resp.ok) {
          return res.status(502).json({
            error: `Local TTS endpoint returned HTTP ${resp.status}. Never silently substituting a different voice.`
          });
        }
        const buf = Buffer.from(await resp.arrayBuffer());
        await fs5.writeFile(outPath, buf);
        resolvedVoiceLabel = `${voiceIdentity || "Kokoro Local"} (Self-Hosted)`;
      } else if (provider === "elevenlabs_webhook") {
        const connector = state.integrations.find((i) => i.id === "elevenlabs_webhook");
        if (!connector?.endpointUrl) {
          return res.status(400).json({
            error: "ElevenLabs Personal Voice Clone connector is unconfigured. Configure its webhook URL in Integrations before auditioning."
          });
        }
        const resp = await fetch(connector.endpointUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voiceIdentity, language, emotion })
        });
        if (!resp.ok) {
          return res.status(502).json({
            error: `ElevenLabs webhook returned HTTP ${resp.status}.`
          });
        }
        const buf = Buffer.from(await resp.arrayBuffer());
        await fs5.writeFile(outPath, buf);
        resolvedVoiceLabel = voiceIdentity || "Authorized Cloned Voice";
      } else {
        const ttsResult = await synthesizeGeminiSpeechWav({
          text: text.slice(0, 900),
          provider,
          voiceIdentity: voiceIdentity || "Charon",
          language: language || "English",
          emotion: emotion || "Conversational Editorial",
          outputWavPath: outPath
        });
        actualTtsModel = ttsResult.modelUsed;
        resolvedVoiceLabel = `${voiceIdentity || "Charon"} (Studio Preset \u2014 Non-Cloned)`;
        fallbackNotice = `${actualTtsModel ? `Synthesized via ${actualTtsModel}. ` : ""}Using Gemini studio voice persona (not a personal voice clone). Configure ElevenLabs in Integrations for personal cloning.`;
      }
      const durationSec = await getMediaDurationSec(outPath) || Math.max(3, Math.round(text.split(/\s+/).length / 2.3));
      const estCost = resolvedProvider === "free_hindi_neural" || resolvedProvider === "kokoro_local" || resolvedProvider === "piper_local" || resolvedProvider === "ambient_studio" ? 0 : resolvedProvider === "elevenlabs_webhook" ? Number((durationSec / 60 * 0.18).toFixed(4)) : resolvedProvider === "gemini_flash_tts" ? Number((durationSec / 60 * 0.03).toFixed(4)) : Number((durationSec / 60 * 0.015).toFixed(4));
      const providerLabel = resolvedProvider === "free_hindi_neural" ? "Free Natural Hindi / Indian Neural Voice" : resolvedProvider === "ambient_studio" ? "Free Studio Rhythm Bed" : actualTtsModel === "gemini-2.5-flash-preview-tts" ? "Gemini 2.5 Flash Preview TTS" : resolvedProvider === "gemini_flash_tts" ? "Gemini 3.8 Flash TTS" : resolvedProvider === "gemini_lite_tts" ? "Gemini 3.8 Flash Lite TTS" : resolvedProvider === "elevenlabs_webhook" ? "ElevenLabs Personal Clone" : "Local Kokoro / Piper";
      const audition = {
        id: `aud_${crypto3.randomUUID().slice(0, 8)}`,
        provider: resolvedProvider,
        providerLabel,
        voiceIdentity: resolvedVoiceLabel,
        language,
        emotion,
        text: text.slice(0, 400),
        audioUrl: `/api/media/audio/${filename}`,
        durationSec,
        estimatedCostUsd: estCost,
        actualCostUsd: estCost,
        usedFallbackNotice: fallbackNotice,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      state.auditions.unshift(audition);
      state.settings.currentMonthSpendUsd = Number((state.settings.currentMonthSpendUsd + estCost).toFixed(4));
      appendAuditLog(state, {
        actor: providerLabel,
        category: "cost",
        action: "Voice Audition Generated",
        detail: `${durationSec}s WAV synthesized (${audition.voiceIdentity})`,
        costImpactUsd: estCost
      });
      const saved = await writeWorkspace(mode, state);
      res.json({ workspace: saved, audition });
    } catch (err) {
      res.status(500).json({ error: err.message || "Voice audition failed." });
    }
  });
  app.post("/api/studio/estimate", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const { qualityTier, voiceProvider, visualProvider, durationSec } = req.body;
      const estimate = estimateJobCost(
        state,
        qualityTier || "balanced",
        voiceProvider || "free_hindi_neural",
        visualProvider || "ffmpeg_local",
        Math.max(MIN_VIDEO_DURATION_SEC, Number(durationSec) || MIN_VIDEO_DURATION_SEC)
      );
      res.json(estimate);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/studio/plan-visuals", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const { title, scriptText, language, backgroundStyle, presenterMode, voiceIdentity, portraitAssetId } = req.body;
      const imageAssets = state.twin.faceAssets.filter((f) => !/\.(mp4|mov|webm)$/i.test(f.url)).map((f) => ({
        id: f.id,
        url: f.url,
        diskPath: resolveLocalAssetPath(f.url) || void 0
      }));
      const planned = await planAndFetchScriptVisuals({
        title: String(title || "TwinForge Studio Production"),
        scriptText: String(scriptText || title || ""),
        language: language || state.twin.personality.primaryLanguage,
        backgroundStyle: backgroundStyle || "Auto-Match Script Theme",
        presenterMode: presenterMode || "auto_match",
        voiceIdentity: voiceIdentity || state.twin.personality.preferredVoiceId,
        mode,
        twinFaceImageAssets: imageAssets,
        preferredPortraitId: portraitAssetId
      });
      res.json({
        beats: planned.beats,
        presenterModeResolved: planned.presenter.presenterModeResolved,
        presenterLabel: planned.presenter.presenterLabel,
        presenterImageUrls: planned.presenter.presenterImageUrls
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "Visual planning failed." });
    }
  });
  app.post("/api/studio/render", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const {
        title,
        scriptId,
        trendTopic,
        scriptText,
        qualityTier,
        voiceProvider,
        voiceIdentity,
        visualProvider,
        aspectRatio,
        format,
        language,
        emotion,
        framing,
        backgroundStyle,
        wardrobeNote,
        speakingSpeed,
        voiceIntensity,
        subtitlesEnabled,
        aiDisclosureWatermark,
        portraitAssetId,
        auditionAudioUrl,
        targetDurationSec,
        approvedPaidCharge
      } = req.body;
      if (!state.twin.consent.attested) {
        return res.status(403).json({
          error: "Biometric likeness consent must be attested in My Digital Twin before generating digital twin videos."
        });
      }
      const words = (scriptText || title || "").trim().split(/\s+/).filter(Boolean).length;
      const estSec = Math.max(
        MIN_VIDEO_DURATION_SEC,
        Math.min(120, Math.round(Number(targetDurationSec) || Math.round(words / 2.2) || MIN_VIDEO_DURATION_SEC))
      );
      const costEst = estimateJobCost(state, qualityTier, voiceProvider, visualProvider, estSec);
      if (costEst.requiresExplicitPaidApproval && !approvedPaidCharge) {
        return res.status(402).json({
          error: "Explicit user cost authorization required before executing this render.",
          estimate: costEst
        });
      }
      const twinFaceImgAssets = state.twin.faceAssets.filter((f) => !/\.(mp4|mov|webm)$/i.test(f.url)).map((f) => ({
        id: f.id,
        url: f.url,
        diskPath: resolveLocalAssetPath(f.url) || void 0
      }));
      const plannedVisuals = await planAndFetchScriptVisuals({
        title: title || "TwinForge Studio Production",
        scriptText: scriptText || title || "",
        language: language || state.twin.personality.primaryLanguage,
        backgroundStyle: backgroundStyle || "Auto-Match Script Theme",
        presenterMode: req.body.presenterMode || "auto_match",
        voiceIdentity: voiceIdentity || state.twin.personality.preferredVoiceId,
        mode,
        twinFaceImageAssets: twinFaceImgAssets,
        preferredPortraitId: portraitAssetId
      });
      const chosenAsset = state.twin.faceAssets.find((f) => f.id === portraitAssetId) || state.twin.faceAssets[0];
      const portraitPath = plannedVisuals.presenter.presenterDiskPaths[0] || resolveLocalAssetPath(chosenAsset?.url) || plannedVisuals.beatDiskPaths.find((p) => Boolean(p));
      if (!portraitPath) {
        return res.status(400).json({
          error: "Please upload a portrait or select a presenter/faceless documentary mode before rendering."
        });
      }
      const startMs = Date.now();
      let audioPath = resolveLocalAssetPath(auditionAudioUrl) || void 0;
      let actualVoiceCost = 0;
      if (!audioPath && (scriptText?.trim() || title?.trim())) {
        const spokenText = (scriptText || title).trim();
        if (voiceProvider === "free_hindi_neural") {
          const wavName = `render_hindi_${Date.now()}_${crypto3.randomUUID().slice(0, 4)}.wav`;
          const wavOut = path5.join(AUDIO_DIR, wavName);
          const persona = state.twin.personality;
          try {
            await synthesizeEdgeNeuralSpeechWav({
              text: spokenText.slice(0, 2200),
              voiceIdentity: voiceIdentity || persona.preferredVoiceId || "en-US-AndrewMultilingualNeural",
              language: language || "Hindi",
              speakingSpeed: Number(speakingSpeed) || persona.voicePace || 0.95,
              prosodyPreset: req.body.prosodyPreset || persona.voiceProsodyPreset || "warm_storyteller",
              pitchWarmth: req.body.pitchWarmth || persona.voicePitchWarmth || "warm",
              naturalPauses: typeof req.body.naturalPauses === "boolean" ? req.body.naturalPauses : persona.naturalPausesEnabled !== false,
              outputWavPath: wavOut
            });
            audioPath = wavOut;
            actualVoiceCost = 0;
          } catch {
            await synthesizeGeminiSpeechWav({
              text: spokenText.slice(0, 900),
              provider: "gemini_lite_tts",
              voiceIdentity: "Charon",
              language: language || "Hindi",
              emotion: emotion || "Conversational",
              outputWavPath: wavOut
            });
            audioPath = wavOut;
            actualVoiceCost = 0;
          }
        } else if (voiceProvider === "gemini_flash_tts" || voiceProvider === "gemini_lite_tts") {
          const wavName = `render_tts_${Date.now()}_${crypto3.randomUUID().slice(0, 4)}.wav`;
          const wavOut = path5.join(AUDIO_DIR, wavName);
          await synthesizeGeminiSpeechWav({
            text: spokenText.slice(0, 900),
            provider: voiceProvider,
            voiceIdentity: voiceIdentity || "Charon",
            language: language || "English",
            emotion: emotion || "Editorial",
            outputWavPath: wavOut
          });
          audioPath = wavOut;
          actualVoiceCost = costEst.estimatedVoiceUsd;
        }
      }
      const jobId = `vid_${crypto3.randomUUID().slice(0, 8)}`;
      const outVideoName = `${jobId}.mp4`;
      const outThumbName = `${jobId}.jpg`;
      const outVideoPath = path5.join(VIDEOS_DIR, outVideoName);
      const outThumbPath = path5.join(COVERS_DIR, outThumbName);
      let actualVisualCost = 0;
      let durationSec = estSec;
      let provenanceNote = "";
      if (visualProvider === "gemini_omni_veo") {
        const rawVeoPath = path5.join(VIDEOS_DIR, `${jobId}_raw_veo.mp4`);
        const veoAspect = aspectRatio === "16:9" ? "16:9" : "9:16";
        await generatePremiumVeoClip({
          portraitImagePath: portraitPath,
          prompt: `Photorealistic studio talking-head creator speaking calmly with natural blinking, subtle head movement, and ${emotion} expression. Framing: ${framing}. Lighting: warm architectural studio. Wardrobe: ${wardrobeNote || "tailored blazer"}.`,
          aspectRatio: veoAspect,
          durationSec: Math.min(10, Math.max(4, Math.round(estSec))),
          outputRawMp4Path: rawVeoPath
        });
        const mastered = await muxAudioAndWatermarkOnVideoFFmpeg({
          sourceVideoPath: rawVeoPath,
          audioPath,
          aiDisclosureWatermark,
          watermarkText: state.settings.watermarkText,
          outputVideoPath: outVideoPath,
          outputThumbPath: outThumbPath
        });
        durationSec = mastered.durationSec;
        actualVisualCost = costEst.estimatedVisualUsd;
        provenanceNote = "Gemini Omni / Veo Motion + Local FFmpeg Mastering";
      } else {
        if (visualProvider === "free_hf_space") {
          const connector = state.integrations.find((i) => i.id === "free_hf_space");
          if (!connector?.endpointUrl) {
            return res.status(400).json({
              error: "Free Hugging Face ZeroGPU Space URL is not configured in Integrations. Add a Gradio Space URL or choose Free Live Motion Animator / Multi-Scene FFmpeg Director."
            });
          }
          const resp = await fetch(connector.endpointUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title,
              scriptText,
              aspectRatio,
              emotion,
              portraitUrl: chosenAsset?.url
            })
          });
          if (!resp.ok) {
            return res.status(502).json({
              error: `Hugging Face Space returned HTTP ${resp.status}. Switch to Free Live Motion Animator or Multi-Scene FFmpeg Director for instant $0.00 output.`
            });
          }
        }
        if (visualProvider === "liveportrait_webhook" || visualProvider === "heygen_webhook") {
          const connector = state.integrations.find((i) => i.id === "liveportrait_heygen");
          if (!connector?.endpointUrl) {
            return res.status(400).json({
              error: "External LivePortrait/HeyGen webhook URL is not configured in Integrations. Never silently downgrading\u2014please configure it or choose a Free Motion / Gemini Veo engine."
            });
          }
        }
        const sceneImagePaths = plannedVisuals.presenter.presenterDiskPaths;
        const sceneBackgroundPaths = plannedVisuals.beatDiskPaths.filter((p) => Boolean(p));
        const rendered = await renderTwinVideoFFmpeg({
          portraitPath,
          sceneImagePaths,
          sceneBackgroundPaths,
          presenterMode: plannedVisuals.presenter.presenterModeResolved,
          audioPath,
          durationSec: estSec,
          aspectRatio: aspectRatio || "9:16",
          framing: framing || "Close-Up Studio",
          speakingSpeed: Number(speakingSpeed) || 1,
          title: title || "TwinForge Production",
          captionExcerpt: scriptText || title,
          backgroundStyle: backgroundStyle || "Auto-Match Script Theme",
          subtitlesEnabled: Boolean(subtitlesEnabled),
          aiDisclosureWatermark: Boolean(aiDisclosureWatermark),
          watermarkText: state.settings.watermarkText,
          outputVideoPath: outVideoPath,
          outputThumbPath: outThumbPath
        });
        durationSec = rendered.durationSec;
        provenanceNote = qualityTier === "local_free" ? voiceProvider === "free_hindi_neural" ? `Free Natural Hindi Neural (${voiceIdentity || "Andrew"}) \xB7 ${plannedVisuals.presenter.presenterLabel} \xB7 6-Scene Script B-Roll ($0.00)` : `Free 6-Shot Script B-Roll Director \xB7 ${plannedVisuals.presenter.presenterLabel} ($0.00)` : `Balanced Mode \xB7 Gemini Speech \xB7 ${plannedVisuals.presenter.presenterLabel}`;
      }
      const processingMs = Date.now() - startMs;
      const actualCostUsd = Number((actualVoiceCost + actualVisualCost).toFixed(4));
      const job = {
        id: jobId,
        title: title || "Untitled Twin Production",
        scriptId,
        trendTopic: trendTopic || "Custom Studio Script",
        qualityTier: qualityTier || "balanced",
        voiceProvider,
        voiceIdentity: voiceIdentity || "Charon",
        visualProvider,
        aspectRatio: aspectRatio || "9:16",
        format: format || "Talking-Head",
        language: language || "English",
        emotion: emotion || "Conversational",
        framing: framing || "Close-Up Studio",
        backgroundStyle: backgroundStyle || "Auto-Match Script Theme",
        presenterMode: plannedVisuals.presenter.presenterModeResolved,
        wardrobeNote: wardrobeNote || "Studio Attire",
        speakingSpeed: Number(speakingSpeed) || 1,
        voiceIntensity: voiceIntensity || "Balanced",
        subtitlesEnabled: Boolean(subtitlesEnabled),
        aiDisclosureWatermark: Boolean(aiDisclosureWatermark),
        estimatedCostUsd: costEst.estimatedTotalUsd,
        actualCostUsd,
        approvedPaidCharge: Boolean(approvedPaidCharge),
        durationSec,
        processingMs,
        status: "completed",
        reviewStatus: "pending",
        videoUrl: `/api/media/videos/${outVideoName}`,
        thumbnailUrl: `/api/media/covers/${outThumbName}`,
        audioUrl: audioPath ? `/api/media/audio/${path5.basename(audioPath)}` : void 0,
        provenanceNote,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      state.videos.unshift(job);
      state.settings.currentMonthSpendUsd = Number((state.settings.currentMonthSpendUsd + actualCostUsd).toFixed(4));
      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || "Creator",
        category: "render",
        action: `Rendered ${job.aspectRatio} MP4 (${job.qualityTier})`,
        detail: `${job.title} \xB7 ${durationSec}s in ${(processingMs / 1e3).toFixed(1)}s \xB7 Est $${costEst.estimatedTotalUsd.toFixed(3)} / Actual $${actualCostUsd.toFixed(3)}`,
        costImpactUsd: actualCostUsd
      });
      const saved = await writeWorkspace(mode, state);
      res.json({ workspace: saved, video: job });
    } catch (err) {
      res.status(500).json({ error: err.message || "Video render failed." });
    }
  });
  app.post("/api/studio/upload-rendered", upload.single("video"), async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      if (!state.twin.consent.attested) {
        return res.status(403).json({
          error: "Biometric likeness consent must be attested in My Digital Twin before generating digital twin videos."
        });
      }
      if (!req.file) {
        return res.status(400).json({ error: "Animated video recording payload is missing." });
      }
      const startMs = Date.now();
      const meta = req.body;
      const jobId = `vid_${crypto3.randomUUID().slice(0, 8)}`;
      const outVideoName = `${jobId}.mp4`;
      const outThumbName = `${jobId}.jpg`;
      const outVideoPath = path5.join(VIDEOS_DIR, outVideoName);
      const outThumbPath = path5.join(COVERS_DIR, outThumbName);
      const candidateAudioPath = resolveLocalAssetPath(meta.auditionAudioUrl);
      let audioPath;
      if (candidateAudioPath) {
        try {
          await fs5.access(candidateAudioPath);
          audioPath = candidateAudioPath;
        } catch {
          audioPath = void 0;
        }
      }
      const requestedDur = Math.max(
        MIN_VIDEO_DURATION_SEC,
        Number(meta.targetDurationSec) || MIN_VIDEO_DURATION_SEC
      );
      const transcoded = await transcodeUploadedVideoFFmpeg({
        inputMediaPath: req.file.path,
        audioPath,
        targetDurationSec: requestedDur,
        outputVideoPath: outVideoPath,
        outputThumbPath: outThumbPath
      });
      await fs5.unlink(req.file.path).catch(() => {
      });
      const actualVoiceCost = Number(meta.actualVoiceCostUsd) || 0;
      const processingMs = Date.now() - startMs;
      const job = {
        id: jobId,
        title: meta.title || "Free Live Motion Twin Video",
        scriptId: meta.scriptId || void 0,
        trendTopic: meta.trendTopic || "Custom Studio Script",
        qualityTier: meta.qualityTier || "local_free",
        voiceProvider: meta.voiceProvider || "free_hindi_neural",
        voiceIdentity: meta.voiceIdentity || "hi-IN-MadhurNeural",
        visualProvider: "free_canvas_animator",
        aspectRatio: meta.aspectRatio || "9:16",
        format: meta.format || "Talking-Head",
        language: meta.language || "Hindi",
        emotion: meta.emotion || "Conversational",
        framing: meta.framing || "Close-Up Studio",
        backgroundStyle: meta.backgroundStyle || "Auto-Match Script Theme",
        presenterMode: meta.presenterMode || "auto_match",
        wardrobeNote: meta.wardrobeNote || "Studio Attire",
        speakingSpeed: Number(meta.speakingSpeed) || 1,
        voiceIntensity: meta.voiceIntensity || "Balanced",
        subtitlesEnabled: meta.subtitlesEnabled !== "false",
        aiDisclosureWatermark: meta.aiDisclosureWatermark !== "false",
        estimatedCostUsd: actualVoiceCost,
        actualCostUsd: actualVoiceCost,
        approvedPaidCharge: false,
        durationSec: transcoded.durationSec,
        processingMs,
        status: "completed",
        reviewStatus: "pending",
        videoUrl: `/api/media/videos/${outVideoName}`,
        thumbnailUrl: `/api/media/covers/${outThumbName}`,
        audioUrl: audioPath ? `/api/media/audio/${path5.basename(audioPath)}` : void 0,
        provenanceNote: actualVoiceCost > 0 ? "Free Live Motion Animator ($0.00 Visual) + Gemini Speech + FFmpeg MP4 Master" : meta.voiceProvider === "free_hindi_neural" ? `100% Free Hindi/Indian Neural Voice (${meta.voiceIdentity || "Madhur"}) + Live Motion Animator ($0.00)` : "100% Free Live Motion & Expression Animator ($0.00) \xB7 FFmpeg H.264 Master",
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      state.videos.unshift(job);
      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || "Creator",
        category: "render",
        action: `Rendered Free Live Motion ${job.aspectRatio} MP4`,
        detail: `${job.title} \xB7 ${job.durationSec}s \xB7 Actual $${actualVoiceCost.toFixed(3)}`,
        costImpactUsd: actualVoiceCost
      });
      const saved = await writeWorkspace(mode, state);
      res.json({ workspace: saved, video: job });
    } catch (err) {
      res.status(500).json({ error: err.message || "Failed to master animated recording." });
    }
  });
  app.put("/api/library/:id/review", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const video = state.videos.find((v) => v.id === req.params.id);
      if (!video) return res.status(404).json({ error: "Video not found." });
      video.reviewStatus = req.body.reviewStatus;
      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || "Creator",
        category: "render",
        action: `Video ${req.body.reviewStatus}`,
        detail: video.title
      });
      res.json(await writeWorkspace(mode, state));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/library/:id", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const target = state.videos.find((v) => v.id === req.params.id);
      if (!target) return res.status(404).json({ error: "Video not found." });
      state.videos = state.videos.filter((v) => v.id !== req.params.id);
      if (target.videoUrl.startsWith("/api/media/videos/")) {
        await fs5.unlink(path5.join(VIDEOS_DIR, path5.basename(target.videoUrl))).catch(() => {
        });
      }
      if (target.thumbnailUrl.startsWith("/api/media/covers/")) {
        await fs5.unlink(path5.join(COVERS_DIR, path5.basename(target.thumbnailUrl))).catch(() => {
        });
      }
      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || "Creator",
        category: "render",
        action: "Video Deleted from Library",
        detail: target.title
      });
      res.json(await writeWorkspace(mode, state));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/benchmarks/run", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const { providerId, scriptExcerpt, approvedPaidCharge } = req.body;
      const bm = state.benchmarks.find((b) => b.providerId === providerId);
      if (!bm) return res.status(404).json({ error: "Benchmark provider not found." });
      const sampleScript = String(scriptExcerpt || "").trim() || "Every creator assumes camera gear drives retention, when clarity in the first three seconds decides everything.";
      if (bm.tier === "premium" && !approvedPaidCharge) {
        return res.status(402).json({
          error: "Explicit user cost approval required to run a paid-tier provider benchmark."
        });
      }
      const startMs = Date.now();
      if (providerId === "free_hindi_neural") {
        const fname = `bm_free_hindi_${Date.now()}.wav`;
        const out = path5.join(AUDIO_DIR, fname);
        const edgeRes = await synthesizeEdgeNeuralSpeechWav({
          text: sampleScript === "Every creator assumes camera gear drives retention, when clarity in the first three seconds decides everything." ? "\u0928\u092E\u0938\u094D\u0924\u0947, \u092E\u0948\u0902 \u0906\u092A\u0915\u093E \u0921\u093F\u091C\u093F\u091F\u0932 \u091F\u094D\u0935\u093F\u0928 \u0939\u0942\u0901\u0964 \u0906\u091C \u0939\u092E \u092C\u093F\u0932\u094D\u0915\u0941\u0932 \u092A\u094D\u0930\u093E\u0915\u0943\u0924\u093F\u0915 \u0939\u093F\u0902\u0926\u0940 \u0906\u0935\u093E\u091C\u093C \u0914\u0930 \u0915\u092E \u0938\u0947 \u0915\u092E \u0924\u0940\u0938 \u0938\u0947\u0915\u0902\u0921 \u0915\u0947 \u0935\u0940\u0921\u093F\u092F\u094B \u0915\u0940 \u0917\u0941\u0923\u0935\u0924\u094D\u0924\u093E \u091C\u093E\u0902\u091A \u0930\u0939\u0947 \u0939\u0948\u0902\u0964" : sampleScript,
          voiceIdentity: state.twin.personality.preferredVoiceId || "hi-IN-MadhurNeural",
          language: "Hindi",
          outputWavPath: out
        });
        const elapsed = Date.now() - startMs;
        bm.verified = true;
        bm.processingMs = elapsed;
        bm.sampleOutputUrl = `/api/media/audio/${fname}`;
        bm.sampleType = "audio";
        bm.scriptExcerpt = sampleScript;
        bm.benchmarkedAt = (/* @__PURE__ */ new Date()).toISOString();
        bm.notes = `Measured $0.00 Hindi neural synthesis (${edgeRes.voiceUsed}) in ${elapsed}ms. Audition for natural Hindi cadence & pronunciation.`;
      } else if (providerId === "gemini_lite_tts" || providerId === "gemini_flash_tts") {
        const fname = `bm_${providerId}_${Date.now()}.wav`;
        const out = path5.join(AUDIO_DIR, fname);
        await synthesizeGeminiSpeechWav({
          text: sampleScript,
          provider: providerId,
          voiceIdentity: "Charon",
          language: state.twin.personality.primaryLanguage || "English",
          emotion: "Conversational Editorial",
          outputWavPath: out
        });
        const elapsed = Date.now() - startMs;
        bm.verified = true;
        bm.processingMs = elapsed;
        bm.sampleOutputUrl = `/api/media/audio/${fname}`;
        bm.sampleType = "audio";
        bm.scriptExcerpt = sampleScript;
        bm.benchmarkedAt = (/* @__PURE__ */ new Date()).toISOString();
        bm.notes = `Measured live WAV synthesis in ${elapsed}ms. Audition side-by-side to evaluate voice similarity & clarity.`;
      } else if (providerId === "ffmpeg_local") {
        const portrait = resolveLocalAssetPath(state.twin.faceAssets[0]?.url);
        if (!portrait) {
          return res.status(400).json({ error: "Upload a portrait in My Digital Twin first to benchmark visual rendering." });
        }
        const sceneImagePaths = [
          portrait,
          ...state.twin.faceAssets.map((a) => resolveLocalAssetPath(a.url)).filter((p) => Boolean(p && p !== portrait))
        ];
        const vName = `bm_ffmpeg_${Date.now()}.mp4`;
        const tName = `bm_ffmpeg_${Date.now()}.jpg`;
        const rendered = await renderTwinVideoFFmpeg({
          portraitPath: portrait,
          sceneImagePaths,
          durationSec: 6,
          aspectRatio: "9:16",
          title: "Benchmark \xB7 Multi-Scene FFmpeg",
          captionExcerpt: sampleScript,
          backgroundStyle: "Studio Ivory Linen",
          subtitlesEnabled: true,
          aiDisclosureWatermark: true,
          watermarkText: state.settings.watermarkText,
          outputVideoPath: path5.join(VIDEOS_DIR, vName),
          outputThumbPath: path5.join(COVERS_DIR, tName)
        });
        bm.verified = true;
        bm.processingMs = rendered.processingMs;
        bm.sampleOutputUrl = `/api/media/videos/${vName}`;
        bm.sampleType = "video";
        bm.scriptExcerpt = sampleScript;
        bm.benchmarkedAt = (/* @__PURE__ */ new Date()).toISOString();
        bm.notes = `Measured 4-scene FFmpeg Motion Director in ${rendered.processingMs}ms ($0.00). Inspect xfade cuts, audio waveform, and kinetic captions.`;
      } else if (providerId === "gemini_omni_veo") {
        const portrait = resolveLocalAssetPath(state.twin.faceAssets[0]?.url);
        if (!portrait) {
          return res.status(400).json({ error: "Upload a portrait first to benchmark Veo image-to-video." });
        }
        const rawVeo = path5.join(VIDEOS_DIR, `bm_veo_raw_${Date.now()}.mp4`);
        const vName = `bm_veo_${Date.now()}.mp4`;
        const tName = `bm_veo_${Date.now()}.jpg`;
        await generatePremiumVeoClip({
          portraitImagePath: portrait,
          prompt: `Photorealistic studio creator speaking calmly with natural facial expressions and blinking. ${sampleScript}`,
          aspectRatio: "9:16",
          durationSec: 5,
          outputRawMp4Path: rawVeo
        });
        await muxAudioAndWatermarkOnVideoFFmpeg({
          sourceVideoPath: rawVeo,
          aiDisclosureWatermark: true,
          watermarkText: state.settings.watermarkText,
          outputVideoPath: path5.join(VIDEOS_DIR, vName),
          outputThumbPath: path5.join(COVERS_DIR, tName)
        });
        const elapsed = Date.now() - startMs;
        bm.verified = true;
        bm.processingMs = elapsed;
        bm.sampleOutputUrl = `/api/media/videos/${vName}`;
        bm.sampleType = "video";
        bm.scriptExcerpt = sampleScript;
        bm.benchmarkedAt = (/* @__PURE__ */ new Date()).toISOString();
        bm.notes = `Measured Gemini Omni/Veo + FFmpeg master in ${elapsed}ms.`;
      } else {
        return res.status(400).json({
          error: `${bm.providerName} requires a configured external endpoint in Integrations before benchmarking.`
        });
      }
      const saved = await writeWorkspace(mode, state);
      res.json({ workspace: saved, benchmark: bm });
    } catch (err) {
      res.status(500).json({ error: err.message || "Benchmark execution failed." });
    }
  });
  app.put("/api/benchmarks/:id/rate", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const bm = state.benchmarks.find((b) => b.id === req.params.id);
      if (!bm) return res.status(404).json({ error: "Benchmark not found." });
      bm.metrics = { ...bm.metrics, ...req.body.metrics };
      res.json(await writeWorkspace(mode, state));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/automation/dispatch", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const { workflowName, eventType, targetWebhookUrl, payload } = req.body;
      const n8nIntegration = state.integrations.find((i) => i.id === "n8n_webhook");
      const url = String(targetWebhookUrl || n8nIntegration?.endpointUrl || "").trim();
      const jobId = `job_${crypto3.randomUUID().slice(0, 8)}`;
      const idempotencyKey = `idem_${crypto3.randomUUID().slice(0, 12)}`;
      const bodyStr = JSON.stringify({ jobId, idempotencyKey, eventType, timestamp: (/* @__PURE__ */ new Date()).toISOString(), payload });
      const sig = crypto3.createHmac("sha256", process.env.WEBHOOK_SECRET || "twinforge-local-signing-key").update(bodyStr).digest("hex");
      const logs = [
        `[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] Created job ${jobId} (idempotency=${idempotencyKey})`,
        `[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] Signed payload HMAC-SHA256 (${sig.slice(0, 14)}...)`
      ];
      let status = "queued";
      let responseCode;
      if (!url) {
        status = "failed";
        logs.push(`[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] Dispatch halted: no target n8n webhook URL configured.`);
      } else {
        try {
          const resp = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-TwinForge-Signature": `sha256=${sig}`,
              "X-Idempotency-Key": idempotencyKey
            },
            body: bodyStr
          });
          responseCode = resp.status;
          status = resp.ok ? "succeeded" : "failed";
          logs.push(`[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] Target responded HTTP ${resp.status}`);
        } catch (err) {
          status = "failed";
          logs.push(`[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] Network error: ${err.message}`);
        }
      }
      state.automationJobs.unshift({
        id: jobId,
        workflowName: workflowName || "Custom Workflow Trigger",
        eventType: eventType || "manual.test",
        targetWebhookUrl: url || "Unconfigured",
        idempotencyKey,
        payloadSummary: JSON.stringify(payload || {}).slice(0, 90),
        status,
        attempts: 1,
        maxAttempts: 3,
        signaturePreview: `sha256=${sig.slice(0, 12)}...`,
        responseCode,
        providerCostUsd: 0,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        logs
      });
      appendAuditLog(state, {
        actor: "Automation Engine",
        category: "automation",
        action: `Webhook ${status}`,
        detail: `${workflowName || eventType} -> ${url || "No endpoint"}`
      });
      res.json(await writeWorkspace(mode, state));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/automation/retry/:id", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const job = state.automationJobs.find((j) => j.id === req.params.id);
      if (!job) return res.status(404).json({ error: "Job not found." });
      job.attempts += 1;
      job.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      if (!job.targetWebhookUrl || job.targetWebhookUrl === "Unconfigured") {
        job.status = "failed";
        job.logs.push(`[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] Retry #${job.attempts} failed: target webhook URL missing.`);
      } else {
        try {
          const resp = await fetch(job.targetWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Idempotency-Key": job.idempotencyKey },
            body: JSON.stringify({ jobId: job.id, retryAttempt: job.attempts })
          });
          job.responseCode = resp.status;
          job.status = resp.ok ? "succeeded" : "failed";
          job.logs.push(`[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] Retry #${job.attempts} -> HTTP ${resp.status}`);
        } catch (err) {
          job.status = "failed";
          job.logs.push(`[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] Retry #${job.attempts} error: ${err.message}`);
        }
      }
      res.json(await writeWorkspace(mode, state));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/automation/toggle/:id", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const job = state.automationJobs.find((j) => j.id === req.params.id);
      if (!job) return res.status(404).json({ error: "Job not found." });
      job.status = job.status === "paused" ? "queued" : "paused";
      job.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      job.logs.push(`[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] Operator set status to ${job.status}`);
      res.json(await writeWorkspace(mode, state));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/automation/webhook/callback", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const { jobId, status, detail } = req.body;
      const job = state.automationJobs.find((j) => j.id === jobId);
      if (job) {
        job.status = status || "succeeded";
        job.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        job.logs.push(`[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] Inbound callback: ${detail || job.status}`);
        await writeWorkspace(mode, state);
      }
      res.json({ received: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/publishing/draft", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const { videoId, platform, caption, hashtags, scheduledFor } = req.body;
      const video = state.videos.find((v) => v.id === videoId);
      if (!video) return res.status(404).json({ error: "Selected video not found in library." });
      state.publishingDrafts.unshift({
        id: `pub_${crypto3.randomUUID().slice(0, 8)}`,
        videoId: video.id,
        videoTitle: video.title,
        thumbnailUrl: video.thumbnailUrl,
        videoUrl: video.videoUrl,
        aspectRatio: video.aspectRatio,
        platform: platform || "Instagram Reels",
        caption: caption || `${video.title} \u2014 produced with my authorized TwinForge digital twin.`,
        hashtags: Array.isArray(hashtags) ? hashtags : ["#DigitalTwin", "#CreatorStudio"],
        scheduledFor: scheduledFor || new Date(Date.now() + 864e5).toISOString().slice(0, 16),
        approvalStatus: "awaiting_approval",
        publishStatus: "draft",
        statusNote: "Saved as draft. Human approval required prior to external delivery."
      });
      res.json(await writeWorkspace(mode, state));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/publishing/:id", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const idx = state.publishingDrafts.findIndex((p) => p.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: "Publishing draft not found." });
      state.publishingDrafts[idx] = { ...state.publishingDrafts[idx], ...req.body };
      res.json(await writeWorkspace(mode, state));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/publishing/:id/dispatch", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const draft = state.publishingDrafts.find((p) => p.id === req.params.id);
      if (!draft) return res.status(404).json({ error: "Publishing draft not found." });
      if (draft.approvalStatus !== "approved") {
        return res.status(400).json({ error: "Human approval is required before dispatching to publishing connectors." });
      }
      const socialConnector = state.integrations.find((i) => i.id === "social_graph_connector");
      const n8nConnector = state.integrations.find((i) => i.id === "n8n_webhook");
      const targetUrl = socialConnector?.endpointUrl || n8nConnector?.endpointUrl;
      if (!targetUrl) {
        draft.publishStatus = "scheduled";
        draft.statusNote = "No live publishing webhook configured. Kept as Scheduled Draft (never falsely marked Published).";
        return res.json(await writeWorkspace(mode, state));
      }
      const resp = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft)
      });
      if (resp.ok) {
        const receipt = `rcpt_${crypto3.randomUUID().slice(0, 8)}`;
        draft.publishStatus = "published";
        draft.receiptId = receipt;
        draft.receiptConfirmedAt = (/* @__PURE__ */ new Date()).toISOString();
        draft.statusNote = `Confirmed delivery receipt ${receipt} from external publisher.`;
      } else {
        draft.publishStatus = "failed";
        draft.statusNote = `Publisher returned HTTP ${resp.status}; post was not published.`;
      }
      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || "Creator",
        category: "publishing",
        action: `Publishing ${draft.publishStatus}`,
        detail: `${draft.platform} \xB7 ${draft.videoTitle}`
      });
      res.json(await writeWorkspace(mode, state));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/analytics/log", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const b = req.body;
      const views = Math.max(0, Number(b.views) || 0);
      const shares = Math.max(0, Number(b.shares) || 0);
      const comments = Math.max(0, Number(b.comments) || 0);
      const saves = Math.max(0, Number(b.saves) || 0);
      const engagementRate = views > 0 ? Number(((shares + comments + saves) / views * 100).toFixed(2)) : 0;
      state.analytics.unshift({
        id: `an_${crypto3.randomUUID().slice(0, 8)}`,
        videoId: String(b.videoId || ""),
        title: String(b.title || "Logged Video"),
        platform: b.platform || "Instagram Reels",
        format: b.format || "Talking-Head",
        language: b.language || "English",
        hookType: String(b.hookType || "Direct Hook"),
        aspectRatio: b.aspectRatio || "9:16",
        views,
        reach: Math.max(0, Number(b.reach) || views),
        avgWatchSec: Math.max(0, Number(b.avgWatchSec) || 0),
        retentionPct: Math.min(100, Math.max(0, Number(b.retentionPct) || 0)),
        shares,
        comments,
        saves,
        followerDelta: Number(b.followerDelta) || 0,
        engagementRate,
        productionCostUsd: Number(b.productionCostUsd) || 0,
        loggedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      res.json(await writeWorkspace(mode, state));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/integrations/:id", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const item = state.integrations.find((i) => i.id === req.params.id);
      if (!item) return res.status(404).json({ error: "Integration not found." });
      item.endpointUrl = String(req.body.endpointUrl || "").trim();
      item.configured = Boolean(item.endpointUrl);
      item.status = item.configured ? "connected" : "unconfigured";
      item.lastCheckedAt = (/* @__PURE__ */ new Date()).toISOString();
      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || "Creator",
        category: "security",
        action: "Integration Endpoint Updated",
        detail: `${item.name} (${item.configured ? "Configured" : "Cleared"})`
      });
      res.json(await writeWorkspace(mode, state));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/integrations/:id/test", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const item = state.integrations.find((i) => i.id === req.params.id);
      if (!item) return res.status(404).json({ error: "Integration not found." });
      item.lastCheckedAt = (/* @__PURE__ */ new Date()).toISOString();
      if (item.id === "gemini_intelligence" || item.id === "gemini_omni_veo") {
        item.status = state.capabilities.geminiConfigured ? "connected" : "unconfigured";
      } else if (item.id === "ffmpeg_local") {
        item.status = state.capabilities.ffmpegAvailable ? "connected" : "unreachable";
      } else if (!item.endpointUrl) {
        item.status = "unconfigured";
      } else {
        try {
          const resp = await fetch(item.endpointUrl, { method: "HEAD" });
          item.status = resp.ok || resp.status < 500 ? "reachable" : "unreachable";
        } catch {
          item.status = "unreachable";
        }
      }
      res.json(await writeWorkspace(mode, state));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/settings", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      state.settings = { ...state.settings, ...req.body };
      res.json(await writeWorkspace(mode, state));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/settings/export", async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      res.setHeader("Content-Disposition", `attachment; filename="twinforge_${mode}_export.json"`);
      res.json(state);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/settings/reset-live", async (_req, res) => {
    try {
      const fresh = await resetLiveWorkspace();
      res.json(fresh);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  let viteServer = null;
  if (process.env.NODE_ENV !== "production") {
    viteServer = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: ["**/data/**", "**/.git/**", "**/node_modules/**"]
        }
      },
      appType: "spa"
    });
    app.use(viteServer.middlewares);
  } else {
    const distPath = path5.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path5.join(distPath, "index.html"));
    });
  }
  const port = Number(process.env.PORT) || 3e3;
  const httpServer = app.listen(port, "0.0.0.0", () => {
    console.log(`TwinForge AI Studio listening on http://0.0.0.0:${port}`);
  });
  const shutdown = async () => {
    httpServer.close(() => {
    });
    if (viteServer) {
      await viteServer.close().catch(() => {
      });
    }
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
}
startServer().catch((err) => {
  console.error("Failed to start TwinForge AI server:", err);
  process.exit(1);
});

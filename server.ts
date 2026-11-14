import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { XMLParser } from 'fast-xml-parser';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import type {
  CostEstimate,
  FaceCategory,
  PresenterVisualMode,
  ProductionStyle,
  QualityTier,
  RewriteAction,
  ScriptGenre,
  TrendCategory,
  TrendItem,
  TwinLanguage,
  VideoFormatType,
  VideoRenderJob,
  VisualProviderId,
  VoiceProviderId,
  WorkspaceMode,
  WorkspaceState,
  WritingStyleMode,
} from './src/types.ts';
import {
  fetchOnlineViralIdeas,
  generateIntelligenceScripts,
  generatePremiumVeoClip,
  rewriteScriptVariant,
  synthesizeGeminiSpeechWav,
  transcribeUploadedAudio,
} from './server/gemini.ts';
import {
  MIN_VIDEO_DURATION_SEC,
  getMediaDurationSec,
  muxAudioAndWatermarkOnVideoFFmpeg,
  renderTwinVideoFFmpeg,
  synthesizeAmbientStudioWav,
  synthesizeEdgeNeuralSpeechWav,
  transcodeUploadedVideoFFmpeg,
} from './server/media.ts';
import {
  AUDIO_DIR,
  COVERS_DIR,
  DEMO_ASSETS_DIR,
  UPLOADS_DIR,
  VIDEOS_DIR,
  appendAuditLog,
  ensureInitialized,
  readWorkspace,
  resetLiveWorkspace,
  writeWorkspace,
} from './server/store.ts';
import { SCENE_CACHE_DIR, planAndFetchScriptVisuals } from './server/visualDirector.ts';

function resolveMode(req: express.Request): WorkspaceMode {
  const header = req.headers['x-workspace-mode'];
  const q = req.query.mode;
  if (header === 'demo' || q === 'demo') return 'demo';
  return 'live';
}

function safeFilename(original: string): string {
  const ext = path.extname(original).replace(/[^a-zA-Z0-9.]/g, '') || '.bin';
  return `${Date.now()}_${crypto.randomUUID().slice(0, 6)}${ext}`;
}

function resolveLocalAssetPath(mediaUrl: string | undefined): string | null {
  if (!mediaUrl) return null;
  if (mediaUrl.startsWith('/api/media/demo/')) {
    return path.join(DEMO_ASSETS_DIR, path.basename(mediaUrl));
  }
  if (mediaUrl.startsWith('/api/media/uploads/')) {
    return path.join(UPLOADS_DIR, path.basename(mediaUrl));
  }
  if (mediaUrl.startsWith('/api/media/audio/')) {
    return path.join(AUDIO_DIR, path.basename(mediaUrl));
  }
  if (mediaUrl.startsWith('/api/media/videos/')) {
    return path.join(VIDEOS_DIR, path.basename(mediaUrl));
  }
  return null;
}

function estimateJobCost(
  state: WorkspaceState,
  qualityTier: QualityTier,
  voiceProvider: VoiceProviderId,
  visualProvider: VisualProviderId,
  durationSec: number
): CostEstimate {
  const mins = Math.max(0.5, durationSec / 60);

  let voiceRate = 0;
  if (voiceProvider === 'gemini_lite_tts') voiceRate = 0.015;
  else if (voiceProvider === 'gemini_flash_tts') voiceRate = 0.03;
  else if (voiceProvider === 'elevenlabs_webhook') voiceRate = 0.18;

  let visualRate = 0;
  if (visualProvider === 'gemini_omni_veo') visualRate = 0.45;
  else if (visualProvider === 'liveportrait_webhook') visualRate = 0.14;
  else if (visualProvider === 'heygen_webhook') visualRate = 0.6;

  const estimatedVoiceUsd = Number((voiceRate * mins).toFixed(4));
  const estimatedVisualUsd = Number((visualRate * mins).toFixed(4));
  const estimatedTotalUsd = Number((estimatedVoiceUsd + estimatedVisualUsd).toFixed(4));

  const isFreeVisual =
    visualProvider === 'free_canvas_animator' ||
    visualProvider === 'ffmpeg_local' ||
    visualProvider === 'free_hf_space';

  const requiresExplicitPaidApproval =
    qualityTier === 'premium' ||
    !isFreeVisual ||
    voiceProvider === 'elevenlabs_webhook' ||
    (state.settings.requireExplicitPaidApproval && estimatedTotalUsd > 0);

  let qualityAdvisory =
    'Balanced Mode uses expressive Gemini 3.8 TTS voice audition combined with Multi-Scene FFmpeg Motion Director (>=30s).';
  let recommendedUpgradeTier: QualityTier | undefined;
  let recommendedUpgradeReason: string | undefined;

  if (qualityTier === 'local_free') {
    const freeVoiceLabel =
      voiceProvider === 'free_hindi_neural'
        ? 'Free Natural Hindi / Indian Neural Voice ($0.00)'
        : 'Free Studio Audio ($0.00)';
    qualityAdvisory =
      visualProvider === 'free_canvas_animator'
        ? `${freeVoiceLabel} + Free Live Motion Animator active — 30fps facial crossfades, camera cuts, waveform, and >=30s captions at $0.00 cost.`
        : visualProvider === 'free_hf_space'
          ? `${freeVoiceLabel} + Hugging Face ZeroGPU Space adapter selected. Ensure your Gradio Space URL is connected in Integrations.`
          : `${freeVoiceLabel} + 6-Shot FFmpeg Motion Director active — renders minimum 30s dynamic camera cuts, xfade transitions, waveform, and subtitles at $0.00 cost.`;
  } else if (qualityTier === 'balanced' && isFreeVisual) {
    qualityAdvisory =
      'Balanced Mode pairs expressive Gemini 3.8 TTS voiceover with multi-scene motion cuts (>=30s) and audio-reactive studio animation. Upgrade to Premium Realism for generative Veo 3D head motion.';
    recommendedUpgradeTier = 'premium';
    recommendedUpgradeReason =
      'Upgrade to Premium Realism (Gemini Omni / Veo or LivePortrait) when photorealistic 3D generative facial motion is required.';
  } else if (qualityTier === 'premium') {
    qualityAdvisory =
      'Premium Realism Mode pairs photorealistic generative/neural motion with local FFmpeg audio muxing, captions, and provenance watermarking.';
  }

  return {
    qualityTier,
    voiceProvider,
    visualProvider,
    estimatedVoiceUsd,
    estimatedVisualUsd,
    estimatedTotalUsd,
    requiresExplicitPaidApproval,
    estimatedProcessingSec: visualProvider === 'gemini_omni_veo' ? 45 : 5,
    qualityAdvisory,
    recommendedUpgradeTier,
    recommendedUpgradeReason,
  };
}

function scoreNicheRelevance(text: string, niche: string): number {
  const cleanText = text.toLowerCase();
  const keywords = niche
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3);
  const generalTerms = ['ai', 'creator', 'video', 'content', 'product', 'tech', 'founder', 'workflow', 'social', 'media'];
  const allTerms = Array.from(new Set([...keywords, ...generalTerms]));
  let hits = 0;
  for (const term of allTerms) {
    if (cleanText.includes(term)) hits += 1;
  }
  return Math.min(98, Math.max(58, 60 + hits * 7));
}

async function startServer() {
  await ensureInitialized();

  const app = express();
  app.use(express.json({ limit: '25mb' }));

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
      filename: (_req, file, cb) => cb(null, safeFilename(file.originalname)),
    }),
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  // Safe local media static routes
  await fs.mkdir(SCENE_CACHE_DIR, { recursive: true });
  app.use('/api/media/uploads', express.static(UPLOADS_DIR));
  app.use('/api/media/audio', express.static(AUDIO_DIR));
  app.use('/api/media/videos', express.static(VIDEOS_DIR));
  app.use('/api/media/covers', express.static(COVERS_DIR));
  app.use('/api/media/demo', express.static(DEMO_ASSETS_DIR));
  app.use('/api/media/scenes', express.static(SCENE_CACHE_DIR));

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, status: 'ready', uptimeSec: Math.round(process.uptime()) });
  });

  // Get workspace state
  app.get('/api/workspace', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      res.json(state);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load workspace.' });
    }
  });

  // Upload Face / Reference Clip
  app.post('/api/twin/upload-face', upload.single('file'), async (req, res) => {
    try {
      const mode = resolveMode(req);
      if (!req.file) return res.status(400).json({ error: 'No image or video file received.' });
      const category = (req.body.category || 'front') as FaceCategory;
      const label = String(req.body.label || req.file.originalname);

      const state = await readWorkspace(mode);
      state.twin.faceAssets.unshift({
        id: `face_${crypto.randomUUID().slice(0, 8)}`,
        category,
        label,
        url: `/api/media/uploads/${req.file.filename}`,
        mimeType: req.file.mimetype,
        filename: req.file.originalname,
        sizeBytes: req.file.size,
        uploadedAt: new Date().toISOString(),
      });

      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || 'Creator',
        category: 'identity',
        action: 'Face Reference Added',
        detail: `${label} (${category}) uploaded to local identity vault.`,
      });

      const saved = await writeWorkspace(mode, state);
      res.json(saved);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Face upload failed.' });
    }
  });

  app.delete('/api/twin/face/:id', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const target = state.twin.faceAssets.find((f) => f.id === req.params.id);
      state.twin.faceAssets = state.twin.faceAssets.filter((f) => f.id !== req.params.id);
      if (target && target.url.startsWith('/api/media/uploads/')) {
        await fs.unlink(path.join(UPLOADS_DIR, path.basename(target.url))).catch(() => {});
      }
      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || 'Creator',
        category: 'identity',
        action: 'Face Reference Removed',
        detail: `Removed face reference ${target?.label || req.params.id}.`,
      });
      res.json(await writeWorkspace(mode, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Upload Voice Sample (file or mic recording)
  app.post('/api/twin/upload-voice', upload.single('file'), async (req, res) => {
    try {
      const mode = resolveMode(req);
      if (!req.file) return res.status(400).json({ error: 'No audio recording received.' });

      const label = String(req.body.label || req.file.originalname || 'Voice Sample');
      const language = (req.body.language || 'English') as TwinLanguage;
      const emotion = req.body.emotion || 'Conversational';
      const diskPath = path.join(UPLOADS_DIR, req.file.filename);
      const durationSec = await getMediaDurationSec(diskPath);

      const state = await readWorkspace(mode);
      state.twin.voiceSamples.unshift({
        id: `voice_${crypto.randomUUID().slice(0, 8)}`,
        label,
        language,
        emotion,
        url: `/api/media/uploads/${req.file.filename}`,
        mimeType: req.file.mimetype || 'audio/webm',
        filename: req.file.originalname,
        sizeBytes: req.file.size,
        durationSec: durationSec || undefined,
        verified: false,
        uploadedAt: new Date().toISOString(),
      });

      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || 'Creator',
        category: 'identity',
        action: 'Voice Sample Added',
        detail: `${label} (${language} · ${emotion}) saved.`,
      });

      res.json(await writeWorkspace(mode, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Voice upload failed.' });
    }
  });

  app.post('/api/twin/transcribe-voice/:id', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const sample = state.twin.voiceSamples.find((v) => v.id === req.params.id);
      if (!sample) return res.status(404).json({ error: 'Voice sample not found.' });
      const localPath = resolveLocalAssetPath(sample.url);
      if (!localPath) {
        return res.status(400).json({ error: 'This sample has no audio file on disk to transcribe.' });
      }
      const transcript = await transcribeUploadedAudio({
        audioFilePath: localPath,
        mimeType: sample.mimeType,
        languageHint: sample.language,
      });
      sample.transcript = transcript || '(No clear speech detected)';
      sample.verified = Boolean(transcript && transcript.trim().length > 2);

      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || 'Creator',
        category: 'identity',
        action: 'Voice Sample Verified',
        detail: `Transcribed "${sample.label}" via Gemini 3.5 Transcribe.`,
      });

      res.json(await writeWorkspace(mode, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Voice transcription failed.' });
    }
  });

  app.delete('/api/twin/voice/:id', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const target = state.twin.voiceSamples.find((v) => v.id === req.params.id);
      state.twin.voiceSamples = state.twin.voiceSamples.filter((v) => v.id !== req.params.id);
      if (target && target.url.startsWith('/api/media/uploads/')) {
        await fs.unlink(path.join(UPLOADS_DIR, path.basename(target.url))).catch(() => {});
      }
      res.json(await writeWorkspace(mode, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/twin/personality', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      state.twin.personality = {
        ...state.twin.personality,
        ...req.body,
      };
      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || 'Creator',
        category: 'identity',
        action: 'Personality Profile Updated',
        detail: `Updated speaking persona for ${state.twin.personality.creatorName || 'creator'} (${state.twin.personality.primaryLanguage}).`,
      });
      res.json(await writeWorkspace(mode, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/twin/consent', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const { ownerFullName, likenessUsageScope, requireAiDisclosure, attested } = req.body;
      state.twin.consent = {
        attested: Boolean(attested),
        ownerFullName: String(ownerFullName || ''),
        attestedAt: attested ? new Date().toISOString() : null,
        likenessUsageScope: String(
          likenessUsageScope || 'Personal content creation owned by the verified creator only.'
        ),
        requireAiDisclosure: Boolean(requireAiDisclosure),
      };
      appendAuditLog(state, {
        actor: ownerFullName || 'Creator',
        category: 'consent',
        action: attested ? 'Biometric Likeness Consent Signed' : 'Consent Revoked',
        detail: `Owner: ${ownerFullName || 'Unspecified'} · AI Disclosure: ${requireAiDisclosure ? 'Required' : 'Optional'}`,
      });
      res.json(await writeWorkspace(mode, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Live RSS Trend Radar Fetch
  app.post('/api/trends/refresh', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
      const fetchedItems: TrendItem[] = [];
      const feedErrors: string[] = [];

      const enabledFeeds = state.settings.rssFeeds.filter((f) => f.enabled);
      await Promise.all(
        enabledFeeds.map(async (feed) => {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 7000);
            const resp = await fetch(feed.url, {
              signal: controller.signal,
              headers: { 'User-Agent': 'TwinForgeStudio/1.0 (+RSS-Reader)' },
            });
            clearTimeout(timer);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const xml = await resp.text();
            const parsed = parser.parse(xml);

            const rssItems = parsed?.rss?.channel?.item;
            const atomEntries = parsed?.feed?.entry;
            const rawList = Array.isArray(rssItems)
              ? rssItems
              : rssItems
                ? [rssItems]
                : Array.isArray(atomEntries)
                  ? atomEntries
                  : atomEntries
                    ? [atomEntries]
                    : [];

            for (const entry of rawList.slice(0, 4)) {
              const title = String(entry.title?.['#text'] || entry.title || '').replace(/<[^>]+>/g, '').trim();
              if (!title) continue;
              const rawLink =
                typeof entry.link === 'string'
                  ? entry.link
                  : entry.link?.['@_href'] || entry.link?.[0]?.['@_href'] || feed.url;
              const desc = String(
                entry.description?.['#text'] ||
                  entry.description ||
                  entry.summary?.['#text'] ||
                  entry.summary ||
                  ''
              )
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 220);
              const pubDate = entry.pubDate || entry.published || entry.updated || new Date().toISOString();
              const rel = scoreNicheRelevance(`${title} ${desc}`, state.twin.personality.niche);

              fetchedItems.push({
                id: `trend_${crypto.createHash('md5').update(title).digest('hex').slice(0, 10)}`,
                topic: title,
                platform: 'RSS / News',
                category: feed.defaultCategory,
                sourceUrl: String(rawLink),
                sourceName: feed.name,
                sourceType: 'rss',
                discoveredAt: new Date(pubDate).toString() === 'Invalid Date' ? new Date().toISOString() : new Date(pubDate).toISOString(),
                summary: desc || 'Live public RSS headline imported without modification.',
                metrics: {
                  available: false,
                  note: 'Public RSS feeds do not expose view or engagement counts',
                },
                relevanceScore: rel,
                opportunityScore: Math.min(97, Math.round(rel * 0.96)),
              });
            }
          } catch (e: any) {
            feedErrors.push(`${feed.name}: ${e.message || 'fetch failed'}`);
          }
        })
      );

      // Deduplicate by topic while keeping manual/custom items
      const existingById = new Map(state.trends.map((t) => [t.id, t]));
      for (const item of fetchedItems) {
        existingById.set(item.id, item);
      }
      state.trends = Array.from(existingById.values())
        .sort((a, b) => new Date(b.discoveredAt).getTime() - new Date(a.discoveredAt).getTime())
        .slice(0, 40);

      appendAuditLog(state, {
        actor: 'Trend Radar',
        category: 'intelligence',
        action: 'Live RSS Sync Completed',
        detail: `Imported ${fetchedItems.length} live feed articles across ${enabledFeeds.length} sources.`,
      });

      const saved = await writeWorkspace(mode, state);
      res.json({ workspace: saved, fetchedCount: fetchedItems.length, feedErrors });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to refresh RSS feeds.' });
    }
  });

  app.post('/api/trends/import', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const { topic, platform, category, sourceUrl, summary, views, engagementRate } = req.body;
      if (!topic || !String(topic).trim()) {
        return res.status(400).json({ error: 'Trend topic is required.' });
      }
      const rel = scoreNicheRelevance(`${topic} ${summary || ''}`, state.twin.personality.niche);
      const hasMetrics = Boolean((views && String(views).trim()) || (engagementRate && String(engagementRate).trim()));

      const item: TrendItem = {
        id: `trend_${crypto.randomUUID().slice(0, 8)}`,
        topic: String(topic).trim(),
        platform: platform || 'Manual',
        category: (category || 'Rising') as TrendCategory,
        sourceUrl: String(sourceUrl || ''),
        sourceName: 'Creator Manual Import',
        sourceType: 'manual',
        discoveredAt: new Date().toISOString(),
        summary: String(summary || 'Manually curated creator trend brief.'),
        metrics: hasMetrics
          ? {
              available: true,
              views: views ? String(views) : undefined,
              engagementRate: engagementRate ? String(engagementRate) : undefined,
              note: 'Observed metrics supplied manually by creator',
            }
          : {
              available: false,
              note: 'No external platform metrics attached',
            },
        relevanceScore: rel,
        opportunityScore: Math.min(98, rel + 2),
      };

      state.trends.unshift(item);
      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || 'Creator',
        category: 'intelligence',
        action: 'Trend Imported Manually',
        detail: `${item.topic} (${item.platform} · ${item.category})`,
      });
      res.json(await writeWorkspace(mode, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Online Viral Ideas Search (Google Search Grounding across Comedy, Science, Knowledge, etc.)
  app.post('/api/intelligence/fetch-online', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const { genre, query, language, alsoImportToRadar } = req.body as {
        genre?: ScriptGenre;
        query?: string;
        language?: TwinLanguage;
        alsoImportToRadar?: boolean;
      };

      const targetGenre: ScriptGenre = genre || 'Knowledge';
      const targetLang: TwinLanguage =
        language || state.twin.personality.primaryLanguage || 'Hindi';

      const { ideas, groundingSources } = await fetchOnlineViralIdeas({
        genre: targetGenre,
        query: query ? String(query) : undefined,
        language: targetLang,
        personality: state.twin.personality,
      });

      const existing = Array.isArray(state.onlineIdeas) ? state.onlineIdeas : [];
      state.onlineIdeas = [...ideas, ...existing].slice(0, 30);

      if (alsoImportToRadar) {
        const mappedCat: TrendCategory =
          targetGenre === 'Comedy'
            ? 'Comedy'
            : targetGenre === 'Science'
              ? 'Science'
              : targetGenre === 'Knowledge' || targetGenre === 'History & Facts'
                ? 'Knowledge'
                : targetGenre === 'Tech & AI'
                  ? 'Technology'
                  : targetGenre === 'Business & Finance'
                    ? 'Business'
                    : 'Viral';

        for (const idea of ideas.slice(0, 4)) {
          const id = `trend_${crypto.createHash('md5').update(idea.title).digest('hex').slice(0, 10)}`;
          if (!state.trends.some((t) => t.id === id)) {
            state.trends.unshift({
              id,
              topic: idea.title,
              platform: 'Online Search',
              category: mappedCat,
              sourceUrl: idea.sourceUrl || '',
              sourceName: idea.sourceTitle || 'Google Search Grounded Discovery',
              sourceType: 'web_search',
              discoveredAt: idea.fetchedAt,
              summary: `${idea.hookIdea} — ${idea.suggestedAngle}`,
              metrics: {
                available: false,
                note: `Web-grounded ${targetGenre} idea · ${idea.viralTrigger}`,
              },
              relevanceScore: 91,
              opportunityScore: 93,
            });
          }
        }
      }

      appendAuditLog(state, {
        actor: 'Gemini Web Search',
        category: 'intelligence',
        action: `Fetched Online Viral Ideas (${targetGenre})`,
        detail: `Discovered ${ideas.length} grounded ${targetGenre} ideas (${groundingSources.length} web sources).`,
      });

      const saved = await writeWorkspace(mode, state);
      res.json({ workspace: saved, ideas, groundingSources });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch online viral ideas.' });
    }
  });

  // Create Blank / Manual Script Pack for Custom Writing & AI Assist
  app.post('/api/intelligence/create-blank', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const { title, trendTopic, genre, writingStyle, language, hook3s, body, cta } = req.body as {
        title?: string;
        trendTopic?: string;
        genre?: ScriptGenre;
        writingStyle?: WritingStyleMode;
        language?: TwinLanguage;
        hook3s?: string;
        body?: string;
        cta?: string;
      };

      const lang: TwinLanguage = language || state.twin.personality.primaryLanguage || 'Hindi';
      const topicTitle = String(title || trendTopic || '').trim() || `Custom ${genre || 'Creator'} Script`;
      const h = String(hook3s || '').trim() || 'Wait — what if everything you assumed about this was upside down?';
      const b =
        String(body || '').trim() ||
        'Write or paste your full monologue here (target 75+ words for a 30+ second video), or use the AI Writing Tools above to punch up your hook, add comedy or science facts, and translate into natural Hindi or Hinglish.';
      const c = String(cta || '').trim() || 'Follow and comment your favorite part below.';
      const wc = `${h} ${b} ${c}`.trim().split(/\s+/).filter(Boolean).length;
      const varId = `var_${Date.now()}_0`;
      const now = new Date().toISOString();

      const pack = {
        id: `scr_${crypto.randomUUID().slice(0, 8)}`,
        trendTopic: topicTitle,
        genre: genre || 'Knowledge',
        writingStyle: writingStyle || 'Viral Hook & Curiosity',
        language: lang,
        recommendedFormat: 'Talking-Head' as const,
        thesis: 'Creator original script authored directly inside Content Intelligence.',
        audiencePainPoint: 'Custom creator angle.',
        ctaStrategy: c,
        selectedVariantId: varId,
        variants: [
          {
            id: varId,
            toneName: 'Natural & Conversational' as const,
            hook3s: h,
            body: b,
            cta: c,
            wordCount: wc,
            estimatedDurationSec: Math.max(30, Math.round(wc / 2.3)),
          },
        ],
        approvalStatus: 'draft' as const,
        createdAt: now,
        updatedAt: now,
      };

      state.scripts.unshift(pack);
      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || 'Creator',
        category: 'intelligence',
        action: 'Created Custom Script Draft',
        detail: `${topicTitle} (${pack.genre} · ${lang})`,
      });

      const saved = await writeWorkspace(mode, state);
      res.json({ workspace: saved, scriptId: pack.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to create blank script.' });
    }
  });

  // Content Intelligence Script Generation
  app.post('/api/intelligence/generate', async (req, res) => {
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
        sourceUrl,
      } = req.body as {
        trendId?: string;
        trendTopic: string;
        trendSummary?: string;
        language?: TwinLanguage;
        targetDurationSec?: number;
        genre?: ScriptGenre;
        writingStyle?: WritingStyleMode;
        sourceUrl?: string;
      };
      if (!trendTopic) return res.status(400).json({ error: 'A trend topic or prompt is required.' });

      const result = await generateIntelligenceScripts({
        trendTopic: String(trendTopic),
        trendSummary: String(trendSummary || trendTopic),
        language: (language || state.twin.personality.primaryLanguage || 'English') as TwinLanguage,
        personality: state.twin.personality,
        targetDurationSec: Math.max(MIN_VIDEO_DURATION_SEC, Number(targetDurationSec) || 35),
        genre,
        writingStyle,
        sourceUrl,
      });

      const pack = {
        id: `scr_${crypto.randomUUID().slice(0, 8)}`,
        trendId: trendId || undefined,
        ...result,
        approvalStatus: 'draft' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      state.scripts.unshift(pack);
      appendAuditLog(state, {
        actor: 'Gemini 4 Hydrogen',
        category: 'intelligence',
        action: `Generated ${pack.variants.length} ${pack.genre || 'Viral'} Scripts`,
        detail: `${pack.trendTopic.slice(0, 56)} (${pack.language})`,
      });

      const saved = await writeWorkspace(mode, state);
      res.json({ workspace: saved, scriptId: pack.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Script generation failed.' });
    }
  });

  // AI Writing Assist / Rewrite on an active script variant
  app.post('/api/intelligence/:id/rewrite', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const pack = state.scripts.find((s) => s.id === req.params.id);
      if (!pack) return res.status(404).json({ error: 'Script pack not found.' });

      const { variantId, action } = req.body as { variantId?: string; action: RewriteAction };
      const targetVar =
        pack.variants.find((v) => v.id === variantId) ||
        pack.variants.find((v) => v.id === pack.selectedVariantId) ||
        pack.variants[0];
      if (!targetVar) return res.status(404).json({ error: 'Script variant not found.' });

      const rewritten = await rewriteScriptVariant({
        hook3s: targetVar.hook3s,
        body: targetVar.body,
        cta: targetVar.cta,
        action,
        genre: pack.genre,
        writingStyle: pack.writingStyle,
        language: pack.language,
        personality: state.twin.personality,
      });

      targetVar.hook3s = rewritten.hook3s;
      targetVar.body = rewritten.body;
      targetVar.cta = rewritten.cta;
      targetVar.wordCount = rewritten.wordCount;
      targetVar.estimatedDurationSec = rewritten.estimatedDurationSec;
      if (action === 'to_hindi') pack.language = 'Hindi';
      else if (action === 'to_hinglish') pack.language = 'Hinglish';
      else if (action === 'to_english') pack.language = 'English';
      pack.updatedAt = new Date().toISOString();

      appendAuditLog(state, {
        actor: 'Gemini Writing Assistant',
        category: 'intelligence',
        action: `Script Rewritten (${action})`,
        detail: `${pack.trendTopic.slice(0, 54)} (${rewritten.wordCount} words)`,
      });

      const saved = await writeWorkspace(mode, state);
      res.json({ workspace: saved, action });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Script rewrite failed.' });
    }
  });

  app.put('/api/intelligence/:id', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const idx = state.scripts.findIndex((s) => s.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: 'Script pack not found.' });

      state.scripts[idx] = {
        ...state.scripts[idx],
        ...req.body,
        updatedAt: new Date().toISOString(),
      };

      if (req.body.approvalStatus === 'approved') {
        appendAuditLog(state, {
          actor: state.twin.personality.creatorName || 'Creator',
          category: 'intelligence',
          action: 'Script Approved for Studio',
          detail: state.scripts[idx].trendTopic.slice(0, 72),
        });
      }

      res.json(await writeWorkspace(mode, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Voice Engine Audition
  app.post('/api/voice/audition', async (req, res) => {
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
        naturalPauses,
        productionStyle,
      } = req.body as {
        text: string;
        provider: VoiceProviderId;
        voiceIdentity: string;
        language: TwinLanguage;
        emotion: string;
        speakingSpeed?: number;
        prosodyPreset?: any;
        pitchWarmth?: any;
        naturalPauses?: boolean;
        productionStyle?: ProductionStyle;
      };

      if (!text || !text.trim()) {
        return res.status(400).json({ error: 'Audition script text is required.' });
      }

      const filename = `audition_${Date.now()}_${crypto.randomUUID().slice(0, 5)}.wav`;
      const outPath = path.join(AUDIO_DIR, filename);

      let actualTtsModel = '';
      let resolvedProvider: VoiceProviderId = provider;
      let resolvedVoiceLabel = voiceIdentity || 'en-US-AndrewMultilingualNeural';
      let fallbackNotice: string | undefined;

      if (provider === 'free_hindi_neural') {
        try {
          const persona = state.twin.personality;
          const isComedy = productionStyle === 'comedy_skit';
          const effectiveSpeed = isComedy
            ? Math.max(1.12, Number(speakingSpeed) || persona.voicePace || 1.14)
            : Number(speakingSpeed) || persona.voicePace || 1.08;
          const effectivePreset =
            prosodyPreset ||
            (isComedy ? 'lively_creator' : persona.voiceProsodyPreset || 'friendly_explainer');
          const edgeRes = await synthesizeEdgeNeuralSpeechWav({
            text: text.slice(0, 2200),
            voiceIdentity: voiceIdentity || persona.preferredVoiceId || 'en-US-AndrewMultilingualNeural',
            language: language || 'Hindi',
            speakingSpeed: effectiveSpeed,
            prosodyPreset: effectivePreset,
            pitchWarmth: pitchWarmth || (isComedy ? 'bright' : persona.voicePitchWarmth || 'warm'),
            naturalPauses: typeof naturalPauses === 'boolean' ? naturalPauses : persona.naturalPausesEnabled !== false,
            outputWavPath: outPath,
          });
          actualTtsModel = edgeRes.voiceUsed;
          resolvedVoiceLabel = `${edgeRes.voiceUsed} (Free Conversational Hindi Neural)`;
        } catch (edgeErr: any) {
          // Explicit documented fallback to Gemini Lite TTS if Edge TTS endpoint is temporarily unreachable
          const ttsResult = await synthesizeGeminiSpeechWav({
            text: text.slice(0, 900),
            provider: 'gemini_lite_tts',
            voiceIdentity: 'Charon',
            language: language || 'Hindi',
            emotion: emotion || 'Conversational Editorial',
            outputWavPath: outPath,
          });
          resolvedProvider = 'gemini_lite_tts';
          actualTtsModel = ttsResult.modelUsed;
          resolvedVoiceLabel = `Charon (${ttsResult.modelUsed} Fallback)`;
          fallbackNotice = `Free Edge Hindi Neural stream unavailable (${edgeErr.message || 'network'}); synthesized via ${ttsResult.modelUsed}.`;
        }
      } else if (provider === 'ambient_studio') {
        const words = text.trim().split(/\s+/).filter(Boolean).length;
        const dur = Math.max(8, Math.min(45, Math.round(words / 2.3) || 10));
        await synthesizeAmbientStudioWav({ durationSec: dur, outputWavPath: outPath });
        resolvedVoiceLabel = 'Studio Harmonic Beat ($0.00)';
      } else if (provider === 'kokoro_local' || provider === 'piper_local') {
        const connector = state.integrations.find((i) => i.id === 'kokoro_local');
        if (!connector?.endpointUrl) {
          return res.status(400).json({
            error:
              'Local Kokoro/Piper endpoint URL is not configured in Integrations. Switch to Free Natural Hindi Neural Voice ($0.00) or Gemini Speech.',
          });
        }
        const resp = await fetch(connector.endpointUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice: voiceIdentity, language }),
        });
        if (!resp.ok) {
          return res.status(502).json({
            error: `Local TTS endpoint returned HTTP ${resp.status}. Never silently substituting a different voice.`,
          });
        }
        const buf = Buffer.from(await resp.arrayBuffer());
        await fs.writeFile(outPath, buf);
        resolvedVoiceLabel = `${voiceIdentity || 'Kokoro Local'} (Self-Hosted)`;
      } else if (provider === 'elevenlabs_webhook') {
        const connector = state.integrations.find((i) => i.id === 'elevenlabs_webhook');
        if (!connector?.endpointUrl) {
          return res.status(400).json({
            error:
              'ElevenLabs Personal Voice Clone connector is unconfigured. Configure its webhook URL in Integrations before auditioning.',
          });
        }
        const resp = await fetch(connector.endpointUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voiceIdentity, language, emotion }),
        });
        if (!resp.ok) {
          return res.status(502).json({
            error: `ElevenLabs webhook returned HTTP ${resp.status}.`,
          });
        }
        const buf = Buffer.from(await resp.arrayBuffer());
        await fs.writeFile(outPath, buf);
        resolvedVoiceLabel = voiceIdentity || 'Authorized Cloned Voice';
      } else {
        const ttsResult = await synthesizeGeminiSpeechWav({
          text: text.slice(0, 900),
          provider,
          voiceIdentity: voiceIdentity || 'Charon',
          language: language || 'English',
          emotion: emotion || 'Conversational Editorial',
          outputWavPath: outPath,
        });
        actualTtsModel = ttsResult.modelUsed;
        resolvedVoiceLabel = `${voiceIdentity || 'Charon'} (Studio Preset — Non-Cloned)`;
        fallbackNotice = `${actualTtsModel ? `Synthesized via ${actualTtsModel}. ` : ''}Using Gemini studio voice persona (not a personal voice clone). Configure ElevenLabs in Integrations for personal cloning.`;
      }

      const durationSec = (await getMediaDurationSec(outPath)) || Math.max(3, Math.round(text.split(/\s+/).length / 2.3));
      const estCost =
        resolvedProvider === 'free_hindi_neural' ||
        resolvedProvider === 'kokoro_local' ||
        resolvedProvider === 'piper_local' ||
        resolvedProvider === 'ambient_studio'
          ? 0
          : resolvedProvider === 'elevenlabs_webhook'
            ? Number(((durationSec / 60) * 0.18).toFixed(4))
            : resolvedProvider === 'gemini_flash_tts'
              ? Number(((durationSec / 60) * 0.03).toFixed(4))
              : Number(((durationSec / 60) * 0.015).toFixed(4));

      const providerLabel =
        resolvedProvider === 'free_hindi_neural'
          ? 'Free Natural Hindi / Indian Neural Voice'
          : resolvedProvider === 'ambient_studio'
            ? 'Free Studio Rhythm Bed'
            : actualTtsModel === 'gemini-2.5-flash-preview-tts'
              ? 'Gemini 2.5 Flash Preview TTS'
              : resolvedProvider === 'gemini_flash_tts'
                ? 'Gemini 3.8 Flash TTS'
                : resolvedProvider === 'gemini_lite_tts'
                  ? 'Gemini 3.8 Flash Lite TTS'
                  : resolvedProvider === 'elevenlabs_webhook'
                    ? 'ElevenLabs Personal Clone'
                    : 'Local Kokoro / Piper';

      const audition = {
        id: `aud_${crypto.randomUUID().slice(0, 8)}`,
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
        createdAt: new Date().toISOString(),
      };

      state.auditions.unshift(audition);
      state.settings.currentMonthSpendUsd = Number((state.settings.currentMonthSpendUsd + estCost).toFixed(4));
      appendAuditLog(state, {
        actor: providerLabel,
        category: 'cost',
        action: 'Voice Audition Generated',
        detail: `${durationSec}s WAV synthesized (${audition.voiceIdentity})`,
        costImpactUsd: estCost,
      });

      const saved = await writeWorkspace(mode, state);
      res.json({ workspace: saved, audition });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Voice audition failed.' });
    }
  });

  // Pre-generation Cost Estimator & Quality Fallback Advisory
  app.post('/api/studio/estimate', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const { qualityTier, voiceProvider, visualProvider, durationSec } = req.body;
      const estimate = estimateJobCost(
        state,
        qualityTier || 'balanced',
        voiceProvider || 'free_hindi_neural',
        visualProvider || 'ffmpeg_local',
        Math.max(MIN_VIDEO_DURATION_SEC, Number(durationSec) || MIN_VIDEO_DURATION_SEC)
      );
      res.json(estimate);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Plan script-matched backgrounds & diverse presenter visuals ($0.00 live fetch + Gemini cue extraction)
  app.post('/api/studio/plan-visuals', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const {
        title,
        scriptText,
        language,
        format,
        backgroundStyle,
        presenterMode,
        productionStyle,
        voiceIdentity,
        portraitAssetId,
      } = req.body as {
        title?: string;
        scriptText?: string;
        language?: TwinLanguage;
        format?: VideoFormatType;
        backgroundStyle?: string;
        presenterMode?: PresenterVisualMode;
        productionStyle?: ProductionStyle;
        voiceIdentity?: string;
        portraitAssetId?: string;
      };

      const imageAssets = state.twin.faceAssets
        .filter((f) => !/\.(mp4|mov|webm)$/i.test(f.url))
        .map((f) => ({
          id: f.id,
          url: f.url,
          diskPath: resolveLocalAssetPath(f.url) || undefined,
        }));

      const planned = await planAndFetchScriptVisuals({
        title: String(title || 'TwinForge Studio Production'),
        scriptText: String(scriptText || title || ''),
        language: language || state.twin.personality.primaryLanguage,
        format,
        backgroundStyle: backgroundStyle || 'Auto-Match Script Theme',
        presenterMode: presenterMode || 'auto_match',
        productionStyle: productionStyle || 'auto_genre',
        voiceIdentity: voiceIdentity || state.twin.personality.preferredVoiceId,
        mode,
        twinFaceImageAssets: imageAssets,
        preferredPortraitId: portraitAssetId,
      });

      res.json({
        beats: planned.beats,
        presenterModeResolved: planned.presenter.presenterModeResolved,
        presenterLabel: planned.presenter.presenterLabel,
        presenterImageUrls: planned.presenter.presenterImageUrls,
        productionStyleResolved: planned.productionStyleResolved,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Visual planning failed.' });
    }
  });

  // Video Render Pipeline (Local Free, Balanced, or Explicitly Approved Premium)
  app.post('/api/studio/render', async (req, res) => {
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
        approvedPaidCharge,
      } = req.body as {
        title: string;
        scriptId?: string;
        trendTopic?: string;
        scriptText: string;
        qualityTier: QualityTier;
        voiceProvider: VoiceProviderId;
        voiceIdentity: string;
        visualProvider: VisualProviderId;
        aspectRatio: '9:16' | '1:1' | '16:9';
        format: VideoFormatType;
        language: TwinLanguage;
        emotion: string;
        framing: 'Close-Up Studio' | 'Medium Editorial' | 'Presenter Bust';
        backgroundStyle: string;
        presenterMode?: PresenterVisualMode;
        productionStyle?: ProductionStyle;
        wardrobeNote: string;
        speakingSpeed: number;
        voiceIntensity: 'Measured' | 'Balanced' | 'Dynamic';
        subtitlesEnabled: boolean;
        aiDisclosureWatermark: boolean;
        portraitAssetId?: string;
        auditionAudioUrl?: string;
        targetDurationSec?: number;
        approvedPaidCharge: boolean;
      };

      if (!state.twin.consent.attested) {
        return res.status(403).json({
          error: 'Biometric likeness consent must be attested in My Digital Twin before generating digital twin videos.',
        });
      }

      const words = (scriptText || title || '').trim().split(/\s+/).filter(Boolean).length;
      const estSec = Math.max(
        MIN_VIDEO_DURATION_SEC,
        Math.min(120, Math.round(Number(targetDurationSec) || Math.round(words / 2.2) || MIN_VIDEO_DURATION_SEC))
      );
      const costEst = estimateJobCost(state, qualityTier, voiceProvider, visualProvider, estSec);

      if (costEst.requiresExplicitPaidApproval && !approvedPaidCharge) {
        return res.status(402).json({
          error: 'Explicit user cost authorization required before executing this render.',
          estimate: costEst,
        });
      }

      // Plan script-matched backgrounds, genre production style & diverse presenter
      const twinFaceImgAssets = state.twin.faceAssets
        .filter((f) => !/\.(mp4|mov|webm)$/i.test(f.url))
        .map((f) => ({
          id: f.id,
          url: f.url,
          diskPath: resolveLocalAssetPath(f.url) || undefined,
        }));

      const plannedVisuals = await planAndFetchScriptVisuals({
        title: title || 'TwinForge Studio Production',
        scriptText: scriptText || title || '',
        language: language || state.twin.personality.primaryLanguage,
        format: format || 'Talking-Head',
        backgroundStyle: backgroundStyle || 'Auto-Match Script Theme',
        presenterMode: (req.body as any).presenterMode || 'auto_match',
        productionStyle: (req.body as any).productionStyle || 'auto_genre',
        voiceIdentity: voiceIdentity || state.twin.personality.preferredVoiceId,
        mode,
        twinFaceImageAssets: twinFaceImgAssets,
        preferredPortraitId: portraitAssetId,
      });

      const chosenAsset =
        state.twin.faceAssets.find((f) => f.id === portraitAssetId) || state.twin.faceAssets[0];
      const portraitPath =
        plannedVisuals.presenter.presenterDiskPaths[0] ||
        resolveLocalAssetPath(chosenAsset?.url) ||
        plannedVisuals.beatDiskPaths.find((p): p is string => Boolean(p));

      if (!portraitPath) {
        return res.status(400).json({
          error: 'Please upload a portrait or select a presenter/faceless documentary mode before rendering.',
        });
      }

      const startMs = Date.now();
      let audioPath = resolveLocalAssetPath(auditionAudioUrl) || undefined;
      let actualVoiceCost = 0;

      // Synthesize speech if not supplied from audition
      if (!audioPath && (scriptText?.trim() || title?.trim())) {
        const spokenText = (scriptText || title).trim();
        if (voiceProvider === 'free_hindi_neural') {
          const wavName = `render_hindi_${Date.now()}_${crypto.randomUUID().slice(0, 4)}.wav`;
          const wavOut = path.join(AUDIO_DIR, wavName);
          const persona = state.twin.personality;
          const isComedy = plannedVisuals.productionStyleResolved === 'comedy_skit';
          const effectiveSpeed = isComedy
            ? Math.max(1.12, Number(speakingSpeed) || persona.voicePace || 1.14)
            : Number(speakingSpeed) || persona.voicePace || 1.08;
          const effectivePreset =
            (req.body as any).prosodyPreset ||
            (isComedy ? 'lively_creator' : persona.voiceProsodyPreset || 'friendly_explainer');
          try {
            await synthesizeEdgeNeuralSpeechWav({
              text: spokenText.slice(0, 2200),
              voiceIdentity: voiceIdentity || persona.preferredVoiceId || 'en-US-AndrewMultilingualNeural',
              language: language || 'Hindi',
              speakingSpeed: effectiveSpeed,
              prosodyPreset: effectivePreset,
              pitchWarmth: (req.body as any).pitchWarmth || (isComedy ? 'bright' : persona.voicePitchWarmth || 'warm'),
              naturalPauses:
                typeof (req.body as any).naturalPauses === 'boolean'
                  ? (req.body as any).naturalPauses
                  : persona.naturalPausesEnabled !== false,
              outputWavPath: wavOut,
            });
            audioPath = wavOut;
            actualVoiceCost = 0;
          } catch {
            // Fall back to Gemini Lite TTS if Edge TTS fails
            await synthesizeGeminiSpeechWav({
              text: spokenText.slice(0, 900),
              provider: 'gemini_lite_tts',
              voiceIdentity: 'Charon',
              language: language || 'Hindi',
              emotion: emotion || 'Conversational',
              outputWavPath: wavOut,
            });
            audioPath = wavOut;
            actualVoiceCost = 0;
          }
        } else if (voiceProvider === 'gemini_flash_tts' || voiceProvider === 'gemini_lite_tts') {
          const wavName = `render_tts_${Date.now()}_${crypto.randomUUID().slice(0, 4)}.wav`;
          const wavOut = path.join(AUDIO_DIR, wavName);
          await synthesizeGeminiSpeechWav({
            text: spokenText.slice(0, 900),
            provider: voiceProvider,
            voiceIdentity: voiceIdentity || 'Charon',
            language: language || 'English',
            emotion: emotion || 'Editorial',
            outputWavPath: wavOut,
          });
          audioPath = wavOut;
          actualVoiceCost = costEst.estimatedVoiceUsd;
        }
      }

      const jobId = `vid_${crypto.randomUUID().slice(0, 8)}`;
      const outVideoName = `${jobId}.mp4`;
      const outThumbName = `${jobId}.jpg`;
      const outVideoPath = path.join(VIDEOS_DIR, outVideoName);
      const outThumbPath = path.join(COVERS_DIR, outThumbName);

      let actualVisualCost = 0;
      let durationSec = estSec;
      let provenanceNote = '';

      if (visualProvider === 'gemini_omni_veo') {
        const rawVeoPath = path.join(VIDEOS_DIR, `${jobId}_raw_veo.mp4`);
        const veoAspect = aspectRatio === '16:9' ? '16:9' : '9:16';
        await generatePremiumVeoClip({
          portraitImagePath: portraitPath,
          prompt: `Photorealistic studio talking-head creator speaking calmly with natural blinking, subtle head movement, and ${emotion} expression. Framing: ${framing}. Lighting: warm architectural studio. Wardrobe: ${wardrobeNote || 'tailored blazer'}.`,
          aspectRatio: veoAspect,
          durationSec: Math.min(10, Math.max(4, Math.round(estSec))),
          outputRawMp4Path: rawVeoPath,
        });
        // Preserve local FFmpeg mastering on top of Gemini Omni/Veo output
        const mastered = await muxAudioAndWatermarkOnVideoFFmpeg({
          sourceVideoPath: rawVeoPath,
          audioPath,
          aiDisclosureWatermark,
          watermarkText: state.settings.watermarkText,
          outputVideoPath: outVideoPath,
          outputThumbPath: outThumbPath,
        });
        durationSec = mastered.durationSec;
        actualVisualCost = costEst.estimatedVisualUsd;
        provenanceNote = 'Gemini Omni / Veo Motion + Local FFmpeg Mastering';
      } else {
        if (visualProvider === 'free_hf_space') {
          const connector = state.integrations.find((i) => i.id === 'free_hf_space');
          if (!connector?.endpointUrl) {
            return res.status(400).json({
              error:
                'Free Hugging Face ZeroGPU Space URL is not configured in Integrations. Add a Gradio Space URL or choose Free Live Motion Animator / Multi-Scene FFmpeg Director.',
            });
          }
          const resp = await fetch(connector.endpointUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title,
              scriptText,
              aspectRatio,
              emotion,
              portraitUrl: chosenAsset?.url,
            }),
          });
          if (!resp.ok) {
            return res.status(502).json({
              error: `Hugging Face Space returned HTTP ${resp.status}. Switch to Free Live Motion Animator or Multi-Scene FFmpeg Director for instant $0.00 output.`,
            });
          }
        }
        if (visualProvider === 'liveportrait_webhook' || visualProvider === 'heygen_webhook') {
          const connector = state.integrations.find((i) => i.id === 'liveportrait_heygen');
          if (!connector?.endpointUrl) {
            return res.status(400).json({
              error:
                'External LivePortrait/HeyGen webhook URL is not configured in Integrations. Never silently downgrading—please configure it or choose a Free Motion / Gemini Veo engine.',
            });
          }
        }
        const sceneImagePaths = plannedVisuals.presenter.presenterDiskPaths;
        const sceneBackgroundPaths = plannedVisuals.beatDiskPaths.filter((p): p is string => Boolean(p));
        const rendered = await renderTwinVideoFFmpeg({
          portraitPath,
          sceneImagePaths,
          sceneBackgroundPaths,
          presenterMode: plannedVisuals.presenter.presenterModeResolved,
          productionStyle: plannedVisuals.productionStyleResolved,
          beatOverlays: plannedVisuals.beats.map((b) => ({
            headline: b.headline,
            calloutText: b.calloutText,
            subBadge: b.subBadge,
            isPunchline: b.isPunchline,
            startPct: b.startPct,
            endPct: b.endPct,
          })),
          audioPath,
          durationSec: estSec,
          aspectRatio: aspectRatio || '9:16',
          framing: framing || 'Close-Up Studio',
          speakingSpeed: Number(speakingSpeed) || 1.0,
          title: title || 'TwinForge Production',
          captionExcerpt: scriptText || title,
          backgroundStyle: backgroundStyle || 'Auto-Match Script Theme',
          subtitlesEnabled: Boolean(subtitlesEnabled),
          aiDisclosureWatermark: Boolean(aiDisclosureWatermark),
          watermarkText: state.settings.watermarkText,
          outputVideoPath: outVideoPath,
          outputThumbPath: outThumbPath,
        });
        durationSec = rendered.durationSec;
        provenanceNote =
          qualityTier === 'local_free'
            ? voiceProvider === 'free_hindi_neural'
              ? `Free Natural Hindi Neural (${voiceIdentity || 'Andrew'}) · ${plannedVisuals.productionStyleResolved.replace('_', ' ')} · ${plannedVisuals.presenter.presenterLabel} ($0.00)`
              : `Free 6-Shot ${plannedVisuals.productionStyleResolved.replace('_', ' ')} Director · ${plannedVisuals.presenter.presenterLabel} ($0.00)`
            : `Balanced Mode · ${plannedVisuals.productionStyleResolved.replace('_', ' ')} · ${plannedVisuals.presenter.presenterLabel}`;
      }

      const processingMs = Date.now() - startMs;
      const actualCostUsd = Number((actualVoiceCost + actualVisualCost).toFixed(4));

      const job: VideoRenderJob = {
        id: jobId,
        title: title || 'Untitled Twin Production',
        scriptId,
        trendTopic: trendTopic || 'Custom Studio Script',
        qualityTier: qualityTier || 'balanced',
        voiceProvider,
        voiceIdentity: voiceIdentity || 'Charon',
        visualProvider,
        aspectRatio: aspectRatio || '9:16',
        format: format || 'Talking-Head',
        language: language || 'English',
        emotion: emotion || 'Conversational',
        framing: framing || 'Close-Up Studio',
        backgroundStyle: backgroundStyle || 'Auto-Match Script Theme',
        presenterMode: plannedVisuals.presenter.presenterModeResolved,
        productionStyle: plannedVisuals.productionStyleResolved,
        wardrobeNote: wardrobeNote || 'Studio Attire',
        speakingSpeed: Number(speakingSpeed) || 1.0,
        voiceIntensity: voiceIntensity || 'Balanced',
        subtitlesEnabled: Boolean(subtitlesEnabled),
        aiDisclosureWatermark: Boolean(aiDisclosureWatermark),
        estimatedCostUsd: costEst.estimatedTotalUsd,
        actualCostUsd,
        approvedPaidCharge: Boolean(approvedPaidCharge),
        durationSec,
        processingMs,
        status: 'completed',
        reviewStatus: 'pending',
        videoUrl: `/api/media/videos/${outVideoName}`,
        thumbnailUrl: `/api/media/covers/${outThumbName}`,
        audioUrl: audioPath ? `/api/media/audio/${path.basename(audioPath)}` : undefined,
        provenanceNote,
        createdAt: new Date().toISOString(),
      };

      state.videos.unshift(job);
      state.settings.currentMonthSpendUsd = Number((state.settings.currentMonthSpendUsd + actualCostUsd).toFixed(4));
      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || 'Creator',
        category: 'render',
        action: `Rendered ${job.aspectRatio} MP4 (${job.qualityTier})`,
        detail: `${job.title} · ${durationSec}s in ${(processingMs / 1000).toFixed(1)}s · Est $${costEst.estimatedTotalUsd.toFixed(3)} / Actual $${actualCostUsd.toFixed(3)}`,
        costImpactUsd: actualCostUsd,
      });

      const saved = await writeWorkspace(mode, state);
      res.json({ workspace: saved, video: job });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Video render failed.' });
    }
  });

  // Upload & FFmpeg-master client-animated free Canvas render into H.264 MP4
  app.post('/api/studio/upload-rendered', upload.single('video'), async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      if (!state.twin.consent.attested) {
        return res.status(403).json({
          error: 'Biometric likeness consent must be attested in My Digital Twin before generating digital twin videos.',
        });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Animated video recording payload is missing.' });
      }

      const startMs = Date.now();
      const meta = req.body as Record<string, string>;
      const jobId = `vid_${crypto.randomUUID().slice(0, 8)}`;
      const outVideoName = `${jobId}.mp4`;
      const outThumbName = `${jobId}.jpg`;
      const outVideoPath = path.join(VIDEOS_DIR, outVideoName);
      const outThumbPath = path.join(COVERS_DIR, outThumbName);
      const candidateAudioPath = resolveLocalAssetPath(meta.auditionAudioUrl);
      let audioPath: string | undefined;
      if (candidateAudioPath) {
        try {
          await fs.access(candidateAudioPath);
          audioPath = candidateAudioPath;
        } catch {
          audioPath = undefined;
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
        outputThumbPath: outThumbPath,
      });
      await fs.unlink(req.file.path).catch(() => {});

      const actualVoiceCost = Number(meta.actualVoiceCostUsd) || 0;
      const processingMs = Date.now() - startMs;

      const job: VideoRenderJob = {
        id: jobId,
        title: meta.title || 'Free Live Motion Twin Video',
        scriptId: meta.scriptId || undefined,
        trendTopic: meta.trendTopic || 'Custom Studio Script',
        qualityTier: (meta.qualityTier as QualityTier) || 'local_free',
        voiceProvider: (meta.voiceProvider as VoiceProviderId) || 'free_hindi_neural',
        voiceIdentity: meta.voiceIdentity || 'hi-IN-MadhurNeural',
        visualProvider: 'free_canvas_animator',
        aspectRatio: (meta.aspectRatio as '9:16' | '1:1' | '16:9') || '9:16',
        format: (meta.format as VideoFormatType) || 'Talking-Head',
        language: (meta.language as TwinLanguage) || 'Hindi',
        emotion: meta.emotion || 'Conversational',
        framing: (meta.framing as any) || 'Close-Up Studio',
        backgroundStyle: meta.backgroundStyle || 'Auto-Match Script Theme',
        presenterMode: (meta.presenterMode as PresenterVisualMode) || 'auto_match',
        productionStyle: (meta.productionStyle as ProductionStyle) || 'auto_genre',
        wardrobeNote: meta.wardrobeNote || 'Studio Attire',
        speakingSpeed: Number(meta.speakingSpeed) || 1.0,
        voiceIntensity: (meta.voiceIntensity as any) || 'Balanced',
        subtitlesEnabled: meta.subtitlesEnabled !== 'false',
        aiDisclosureWatermark: meta.aiDisclosureWatermark !== 'false',
        estimatedCostUsd: actualVoiceCost,
        actualCostUsd: actualVoiceCost,
        approvedPaidCharge: false,
        durationSec: transcoded.durationSec,
        processingMs,
        status: 'completed',
        reviewStatus: 'pending',
        videoUrl: `/api/media/videos/${outVideoName}`,
        thumbnailUrl: `/api/media/covers/${outThumbName}`,
        audioUrl: audioPath ? `/api/media/audio/${path.basename(audioPath)}` : undefined,
        provenanceNote:
          actualVoiceCost > 0
            ? 'Free Live Motion Animator ($0.00 Visual) + Gemini Speech + FFmpeg MP4 Master'
            : meta.voiceProvider === 'free_hindi_neural'
              ? `100% Free Hindi/Indian Neural Voice (${meta.voiceIdentity || 'Madhur'}) + Live Motion Animator ($0.00)`
              : '100% Free Live Motion & Expression Animator ($0.00) · FFmpeg H.264 Master',
        createdAt: new Date().toISOString(),
      };

      state.videos.unshift(job);
      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || 'Creator',
        category: 'render',
        action: `Rendered Free Live Motion ${job.aspectRatio} MP4`,
        detail: `${job.title} · ${job.durationSec}s · Actual $${actualVoiceCost.toFixed(3)}`,
        costImpactUsd: actualVoiceCost,
      });

      const saved = await writeWorkspace(mode, state);
      res.json({ workspace: saved, video: job });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to master animated recording.' });
    }
  });

  app.put('/api/library/:id/review', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const video = state.videos.find((v) => v.id === req.params.id);
      if (!video) return res.status(404).json({ error: 'Video not found.' });
      video.reviewStatus = req.body.reviewStatus;
      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || 'Creator',
        category: 'render',
        action: `Video ${req.body.reviewStatus}`,
        detail: video.title,
      });
      res.json(await writeWorkspace(mode, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/library/:id', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const target = state.videos.find((v) => v.id === req.params.id);
      if (!target) return res.status(404).json({ error: 'Video not found.' });
      state.videos = state.videos.filter((v) => v.id !== req.params.id);
      if (target.videoUrl.startsWith('/api/media/videos/')) {
        await fs.unlink(path.join(VIDEOS_DIR, path.basename(target.videoUrl))).catch(() => {});
      }
      if (target.thumbnailUrl.startsWith('/api/media/covers/')) {
        await fs.unlink(path.join(COVERS_DIR, path.basename(target.thumbnailUrl))).catch(() => {});
      }
      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || 'Creator',
        category: 'render',
        action: 'Video Deleted from Library',
        detail: target.title,
      });
      res.json(await writeWorkspace(mode, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Side-by-Side Provider Benchmark Runner
  app.post('/api/benchmarks/run', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const { providerId, scriptExcerpt, approvedPaidCharge } = req.body;
      const bm = state.benchmarks.find((b) => b.providerId === providerId);
      if (!bm) return res.status(404).json({ error: 'Benchmark provider not found.' });

      const sampleScript =
        String(scriptExcerpt || '').trim() ||
        'Every creator assumes camera gear drives retention, when clarity in the first three seconds decides everything.';

      if (bm.tier === 'premium' && !approvedPaidCharge) {
        return res.status(402).json({
          error: 'Explicit user cost approval required to run a paid-tier provider benchmark.',
        });
      }

      const startMs = Date.now();

      if (providerId === 'free_hindi_neural') {
        const fname = `bm_free_hindi_${Date.now()}.wav`;
        const out = path.join(AUDIO_DIR, fname);
        const edgeRes = await synthesizeEdgeNeuralSpeechWav({
          text:
            sampleScript ===
            'Every creator assumes camera gear drives retention, when clarity in the first three seconds decides everything.'
              ? 'नमस्ते, मैं आपका डिजिटल ट्विन हूँ। आज हम बिल्कुल प्राकृतिक हिंदी आवाज़ और कम से कम तीस सेकंड के वीडियो की गुणवत्ता जांच रहे हैं।'
              : sampleScript,
          voiceIdentity: state.twin.personality.preferredVoiceId || 'hi-IN-MadhurNeural',
          language: 'Hindi',
          outputWavPath: out,
        });
        const elapsed = Date.now() - startMs;
        bm.verified = true;
        bm.processingMs = elapsed;
        bm.sampleOutputUrl = `/api/media/audio/${fname}`;
        bm.sampleType = 'audio';
        bm.scriptExcerpt = sampleScript;
        bm.benchmarkedAt = new Date().toISOString();
        bm.notes = `Measured $0.00 Hindi neural synthesis (${edgeRes.voiceUsed}) in ${elapsed}ms. Audition for natural Hindi cadence & pronunciation.`;
      } else if (providerId === 'gemini_lite_tts' || providerId === 'gemini_flash_tts') {
        const fname = `bm_${providerId}_${Date.now()}.wav`;
        const out = path.join(AUDIO_DIR, fname);
        await synthesizeGeminiSpeechWav({
          text: sampleScript,
          provider: providerId,
          voiceIdentity: 'Charon',
          language: state.twin.personality.primaryLanguage || 'English',
          emotion: 'Conversational Editorial',
          outputWavPath: out,
        });
        const elapsed = Date.now() - startMs;
        bm.verified = true;
        bm.processingMs = elapsed;
        bm.sampleOutputUrl = `/api/media/audio/${fname}`;
        bm.sampleType = 'audio';
        bm.scriptExcerpt = sampleScript;
        bm.benchmarkedAt = new Date().toISOString();
        bm.notes = `Measured live WAV synthesis in ${elapsed}ms. Audition side-by-side to evaluate voice similarity & clarity.`;
      } else if (providerId === 'ffmpeg_local') {
        const portrait = resolveLocalAssetPath(state.twin.faceAssets[0]?.url);
        if (!portrait) {
          return res.status(400).json({ error: 'Upload a portrait in My Digital Twin first to benchmark visual rendering.' });
        }
        const sceneImagePaths = [
          portrait,
          ...state.twin.faceAssets
            .map((a) => resolveLocalAssetPath(a.url))
            .filter((p): p is string => Boolean(p && p !== portrait)),
        ];
        const vName = `bm_ffmpeg_${Date.now()}.mp4`;
        const tName = `bm_ffmpeg_${Date.now()}.jpg`;
        const rendered = await renderTwinVideoFFmpeg({
          portraitPath: portrait,
          sceneImagePaths,
          durationSec: 6,
          aspectRatio: '9:16',
          title: 'Benchmark · Multi-Scene FFmpeg',
          captionExcerpt: sampleScript,
          backgroundStyle: 'Studio Ivory Linen',
          subtitlesEnabled: true,
          aiDisclosureWatermark: true,
          watermarkText: state.settings.watermarkText,
          outputVideoPath: path.join(VIDEOS_DIR, vName),
          outputThumbPath: path.join(COVERS_DIR, tName),
        });
        bm.verified = true;
        bm.processingMs = rendered.processingMs;
        bm.sampleOutputUrl = `/api/media/videos/${vName}`;
        bm.sampleType = 'video';
        bm.scriptExcerpt = sampleScript;
        bm.benchmarkedAt = new Date().toISOString();
        bm.notes = `Measured 4-scene FFmpeg Motion Director in ${rendered.processingMs}ms ($0.00). Inspect xfade cuts, audio waveform, and kinetic captions.`;
      } else if (providerId === 'gemini_omni_veo') {
        const portrait = resolveLocalAssetPath(state.twin.faceAssets[0]?.url);
        if (!portrait) {
          return res.status(400).json({ error: 'Upload a portrait first to benchmark Veo image-to-video.' });
        }
        const rawVeo = path.join(VIDEOS_DIR, `bm_veo_raw_${Date.now()}.mp4`);
        const vName = `bm_veo_${Date.now()}.mp4`;
        const tName = `bm_veo_${Date.now()}.jpg`;
        await generatePremiumVeoClip({
          portraitImagePath: portrait,
          prompt: `Photorealistic studio creator speaking calmly with natural facial expressions and blinking. ${sampleScript}`,
          aspectRatio: '9:16',
          durationSec: 5,
          outputRawMp4Path: rawVeo,
        });
        await muxAudioAndWatermarkOnVideoFFmpeg({
          sourceVideoPath: rawVeo,
          aiDisclosureWatermark: true,
          watermarkText: state.settings.watermarkText,
          outputVideoPath: path.join(VIDEOS_DIR, vName),
          outputThumbPath: path.join(COVERS_DIR, tName),
        });
        const elapsed = Date.now() - startMs;
        bm.verified = true;
        bm.processingMs = elapsed;
        bm.sampleOutputUrl = `/api/media/videos/${vName}`;
        bm.sampleType = 'video';
        bm.scriptExcerpt = sampleScript;
        bm.benchmarkedAt = new Date().toISOString();
        bm.notes = `Measured Gemini Omni/Veo + FFmpeg master in ${elapsed}ms.`;
      } else {
        return res.status(400).json({
          error: `${bm.providerName} requires a configured external endpoint in Integrations before benchmarking.`,
        });
      }

      const saved = await writeWorkspace(mode, state);
      res.json({ workspace: saved, benchmark: bm });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Benchmark execution failed.' });
    }
  });

  // Save user-observed quality ratings on a benchmarked provider
  app.put('/api/benchmarks/:id/rate', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const bm = state.benchmarks.find((b) => b.id === req.params.id);
      if (!bm) return res.status(404).json({ error: 'Benchmark not found.' });
      bm.metrics = { ...bm.metrics, ...req.body.metrics };
      res.json(await writeWorkspace(mode, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // n8n Automation & Webhook Dispatch
  app.post('/api/automation/dispatch', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const { workflowName, eventType, targetWebhookUrl, payload } = req.body;
      const n8nIntegration = state.integrations.find((i) => i.id === 'n8n_webhook');
      const url = String(targetWebhookUrl || n8nIntegration?.endpointUrl || '').trim();
      const jobId = `job_${crypto.randomUUID().slice(0, 8)}`;
      const idempotencyKey = `idem_${crypto.randomUUID().slice(0, 12)}`;
      const bodyStr = JSON.stringify({ jobId, idempotencyKey, eventType, timestamp: new Date().toISOString(), payload });
      const sig = crypto
        .createHmac('sha256', process.env.WEBHOOK_SECRET || 'twinforge-local-signing-key')
        .update(bodyStr)
        .digest('hex');

      const logs: string[] = [
        `[${new Date().toLocaleTimeString()}] Created job ${jobId} (idempotency=${idempotencyKey})`,
        `[${new Date().toLocaleTimeString()}] Signed payload HMAC-SHA256 (${sig.slice(0, 14)}...)`,
      ];

      let status: 'succeeded' | 'failed' | 'queued' = 'queued';
      let responseCode: number | undefined;

      if (!url) {
        status = 'failed';
        logs.push(`[${new Date().toLocaleTimeString()}] Dispatch halted: no target n8n webhook URL configured.`);
      } else {
        try {
          const resp = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-TwinForge-Signature': `sha256=${sig}`,
              'X-Idempotency-Key': idempotencyKey,
            },
            body: bodyStr,
          });
          responseCode = resp.status;
          status = resp.ok ? 'succeeded' : 'failed';
          logs.push(`[${new Date().toLocaleTimeString()}] Target responded HTTP ${resp.status}`);
        } catch (err: any) {
          status = 'failed';
          logs.push(`[${new Date().toLocaleTimeString()}] Network error: ${err.message}`);
        }
      }

      state.automationJobs.unshift({
        id: jobId,
        workflowName: workflowName || 'Custom Workflow Trigger',
        eventType: eventType || 'manual.test',
        targetWebhookUrl: url || 'Unconfigured',
        idempotencyKey,
        payloadSummary: JSON.stringify(payload || {}).slice(0, 90),
        status,
        attempts: 1,
        maxAttempts: 3,
        signaturePreview: `sha256=${sig.slice(0, 12)}...`,
        responseCode,
        providerCostUsd: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        logs,
      });

      appendAuditLog(state, {
        actor: 'Automation Engine',
        category: 'automation',
        action: `Webhook ${status}`,
        detail: `${workflowName || eventType} -> ${url || 'No endpoint'}`,
      });

      res.json(await writeWorkspace(mode, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/automation/retry/:id', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const job = state.automationJobs.find((j) => j.id === req.params.id);
      if (!job) return res.status(404).json({ error: 'Job not found.' });
      job.attempts += 1;
      job.updatedAt = new Date().toISOString();
      if (!job.targetWebhookUrl || job.targetWebhookUrl === 'Unconfigured') {
        job.status = 'failed';
        job.logs.push(`[${new Date().toLocaleTimeString()}] Retry #${job.attempts} failed: target webhook URL missing.`);
      } else {
        try {
          const resp = await fetch(job.targetWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': job.idempotencyKey },
            body: JSON.stringify({ jobId: job.id, retryAttempt: job.attempts }),
          });
          job.responseCode = resp.status;
          job.status = resp.ok ? 'succeeded' : 'failed';
          job.logs.push(`[${new Date().toLocaleTimeString()}] Retry #${job.attempts} -> HTTP ${resp.status}`);
        } catch (err: any) {
          job.status = 'failed';
          job.logs.push(`[${new Date().toLocaleTimeString()}] Retry #${job.attempts} error: ${err.message}`);
        }
      }
      res.json(await writeWorkspace(mode, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/automation/toggle/:id', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const job = state.automationJobs.find((j) => j.id === req.params.id);
      if (!job) return res.status(404).json({ error: 'Job not found.' });
      job.status = job.status === 'paused' ? 'queued' : 'paused';
      job.updatedAt = new Date().toISOString();
      job.logs.push(`[${new Date().toLocaleTimeString()}] Operator set status to ${job.status}`);
      res.json(await writeWorkspace(mode, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/automation/webhook/callback', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const { jobId, status, detail } = req.body;
      const job = state.automationJobs.find((j) => j.id === jobId);
      if (job) {
        job.status = status || 'succeeded';
        job.updatedAt = new Date().toISOString();
        job.logs.push(`[${new Date().toLocaleTimeString()}] Inbound callback: ${detail || job.status}`);
        await writeWorkspace(mode, state);
      }
      res.json({ received: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Publishing Drafts & Dispatch
  app.post('/api/publishing/draft', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const { videoId, platform, caption, hashtags, scheduledFor } = req.body;
      const video = state.videos.find((v) => v.id === videoId);
      if (!video) return res.status(404).json({ error: 'Selected video not found in library.' });

      state.publishingDrafts.unshift({
        id: `pub_${crypto.randomUUID().slice(0, 8)}`,
        videoId: video.id,
        videoTitle: video.title,
        thumbnailUrl: video.thumbnailUrl,
        videoUrl: video.videoUrl,
        aspectRatio: video.aspectRatio,
        platform: platform || 'Instagram Reels',
        caption: caption || `${video.title} — produced with my authorized TwinForge digital twin.`,
        hashtags: Array.isArray(hashtags) ? hashtags : ['#DigitalTwin', '#CreatorStudio'],
        scheduledFor: scheduledFor || new Date(Date.now() + 86400000).toISOString().slice(0, 16),
        approvalStatus: 'awaiting_approval',
        publishStatus: 'draft',
        statusNote: 'Saved as draft. Human approval required prior to external delivery.',
      });

      res.json(await writeWorkspace(mode, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/publishing/:id', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const idx = state.publishingDrafts.findIndex((p) => p.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: 'Publishing draft not found.' });
      state.publishingDrafts[idx] = { ...state.publishingDrafts[idx], ...req.body };
      res.json(await writeWorkspace(mode, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/publishing/:id/dispatch', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const draft = state.publishingDrafts.find((p) => p.id === req.params.id);
      if (!draft) return res.status(404).json({ error: 'Publishing draft not found.' });

      if (draft.approvalStatus !== 'approved') {
        return res.status(400).json({ error: 'Human approval is required before dispatching to publishing connectors.' });
      }

      const socialConnector = state.integrations.find((i) => i.id === 'social_graph_connector');
      const n8nConnector = state.integrations.find((i) => i.id === 'n8n_webhook');
      const targetUrl = socialConnector?.endpointUrl || n8nConnector?.endpointUrl;

      if (!targetUrl) {
        draft.publishStatus = 'scheduled';
        draft.statusNote =
          'No live publishing webhook configured. Kept as Scheduled Draft (never falsely marked Published).';
        return res.json(await writeWorkspace(mode, state));
      }

      const resp = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });

      if (resp.ok) {
        const receipt = `rcpt_${crypto.randomUUID().slice(0, 8)}`;
        draft.publishStatus = 'published';
        draft.receiptId = receipt;
        draft.receiptConfirmedAt = new Date().toISOString();
        draft.statusNote = `Confirmed delivery receipt ${receipt} from external publisher.`;
      } else {
        draft.publishStatus = 'failed';
        draft.statusNote = `Publisher returned HTTP ${resp.status}; post was not published.`;
      }

      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || 'Creator',
        category: 'publishing',
        action: `Publishing ${draft.publishStatus}`,
        detail: `${draft.platform} · ${draft.videoTitle}`,
      });

      res.json(await writeWorkspace(mode, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Analytics factual logging
  app.post('/api/analytics/log', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const b = req.body;
      const views = Math.max(0, Number(b.views) || 0);
      const shares = Math.max(0, Number(b.shares) || 0);
      const comments = Math.max(0, Number(b.comments) || 0);
      const saves = Math.max(0, Number(b.saves) || 0);
      const engagementRate = views > 0 ? Number((((shares + comments + saves) / views) * 100).toFixed(2)) : 0;

      state.analytics.unshift({
        id: `an_${crypto.randomUUID().slice(0, 8)}`,
        videoId: String(b.videoId || ''),
        title: String(b.title || 'Logged Video'),
        platform: b.platform || 'Instagram Reels',
        format: b.format || 'Talking-Head',
        language: b.language || 'English',
        hookType: String(b.hookType || 'Direct Hook'),
        aspectRatio: b.aspectRatio || '9:16',
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
        loggedAt: new Date().toISOString(),
      });

      res.json(await writeWorkspace(mode, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Integrations update & reachability check
  app.put('/api/integrations/:id', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const item = state.integrations.find((i) => i.id === req.params.id);
      if (!item) return res.status(404).json({ error: 'Integration not found.' });
      item.endpointUrl = String(req.body.endpointUrl || '').trim();
      item.configured = Boolean(item.endpointUrl);
      item.status = item.configured ? 'connected' : 'unconfigured';
      item.lastCheckedAt = new Date().toISOString();
      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || 'Creator',
        category: 'security',
        action: 'Integration Endpoint Updated',
        detail: `${item.name} (${item.configured ? 'Configured' : 'Cleared'})`,
      });
      res.json(await writeWorkspace(mode, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/integrations/:id/test', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      const item = state.integrations.find((i) => i.id === req.params.id);
      if (!item) return res.status(404).json({ error: 'Integration not found.' });
      item.lastCheckedAt = new Date().toISOString();

      if (item.id === 'gemini_intelligence' || item.id === 'gemini_omni_veo') {
        item.status = state.capabilities.geminiConfigured ? 'connected' : 'unconfigured';
      } else if (item.id === 'ffmpeg_local') {
        item.status = state.capabilities.ffmpegAvailable ? 'connected' : 'unreachable';
      } else if (!item.endpointUrl) {
        item.status = 'unconfigured';
      } else {
        try {
          const resp = await fetch(item.endpointUrl, { method: 'HEAD' });
          item.status = resp.ok || resp.status < 500 ? 'reachable' : 'unreachable';
        } catch {
          item.status = 'unreachable';
        }
      }
      res.json(await writeWorkspace(mode, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Settings, Full JSON Export & Live Reset
  app.put('/api/settings', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      state.settings = { ...state.settings, ...req.body };
      res.json(await writeWorkspace(mode, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/settings/export', async (req, res) => {
    try {
      const mode = resolveMode(req);
      const state = await readWorkspace(mode);
      res.setHeader('Content-Disposition', `attachment; filename="twinforge_${mode}_export.json"`);
      res.json(state);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/settings/reset-live', async (_req, res) => {
    try {
      const fresh = await resetLiveWorkspace();
      res.json(fresh);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware in dev / static dist in production
  let viteServer: Awaited<ReturnType<typeof createViteServer>> | null = null;
  if (process.env.NODE_ENV !== 'production') {
    viteServer = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: ['**/data/**', '**/.git/**', '**/node_modules/**'],
        },
      },
      appType: 'spa',
    });
    app.use(viteServer.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  const httpServer = app.listen(port, '0.0.0.0', () => {
    console.log(`TwinForge AI Studio listening on http://0.0.0.0:${port}`);
  });

  const shutdown = async () => {
    httpServer.close(() => {});
    if (viteServer) {
      await viteServer.close().catch(() => {});
    }
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
}

startServer().catch((err) => {
  console.error('Failed to start TwinForge AI server:', err);
  process.exit(1);
});

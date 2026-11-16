import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { XMLParser } from 'fast-xml-parser';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import type {
  AnimationPresetMode,
  ColorGradePreset,
  ConnectorAuthType,
  ConnectorHttpMethod,
  CostEstimate,
  FaceCategory,
  IntegrationConnector,
  PresenterVisualMode,
  ProductionStyle,
  PublishingDraft,
  QualityTier,
  RewriteAction,
  ScriptGenre,
  ShootingAnglePreset,
  TransitionStylePreset,
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
  isGeminiConfigured,
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
import { VISUAL_PROMPT_LIBRARY } from './src/lib/promptLibrary.ts';
import { SCENE_CACHE_DIR, planAndFetchScriptVisuals } from './server/visualDirector.ts';
import {
  consumeFreeGeminiQuota,
  createStripeCheckoutSession,
  deductTesterCredits,
  evaluatePaidVeoAccess,
  getBillingProtectionStatus,
  inspectFreeGeminiQuota,
  isOwnerAuthorized,
  isPaidVeoFlagEnabled,
  isStripeConfigured,
  refundTesterCredits,
  resolveSessionId,
  verifyAndApplyStripeSession,
} from './server/billing.ts';

function resolveMode(req: express.Request): WorkspaceMode {
  const header = req.headers['x-workspace-mode'];
  const q = req.query.mode;
  if (header === 'demo' || q === 'demo') return 'demo';
  return 'live';
}

async function readReqWorkspace(req: express.Request): Promise<{
  mode: WorkspaceMode;
  sessionId: string | null;
  state: WorkspaceState;
}> {
  const mode = resolveMode(req);
  const sessionId = resolveSessionId(req);
  const state = await readWorkspace(mode, sessionId);
  state.capabilities.billingProtection = await getBillingProtectionStatus({ req, sessionId });
  return { mode, sessionId, state };
}

async function writeReqWorkspace(
  req: express.Request,
  state: WorkspaceState
): Promise<WorkspaceState> {
  const mode = resolveMode(req);
  const sessionId = resolveSessionId(req);
  const saved = await writeWorkspace(mode, state, sessionId);
  saved.capabilities.billingProtection = await getBillingProtectionStatus({ req, sessionId });
  return saved;
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
  durationSec: number,
  veoGate?: { allowed: boolean; billedTo: 'owner' | 'tester_credits' | 'blocked'; reason?: string }
): CostEstimate {
  const mins = Math.max(0.5, durationSec / 60);

  let voiceRate = 0;
  // Standard Gemini 3.8 TTS models (Lite & Flash) run on free-tier eligible standard GEMINI_API_KEY
  if (voiceProvider === 'elevenlabs_webhook') voiceRate = 0.18;

  let visualRate = 0;
  if (visualProvider === 'gemini_omni_veo') visualRate = 0.45;
  else if (visualProvider === 'liveportrait_webhook') visualRate = 0.14;
  else if (visualProvider === 'heygen_webhook') visualRate = 0.6;
  else if (visualProvider === 'custom_paid_video_webhook') visualRate = 0.25;

  const estimatedVoiceUsd = Number((voiceRate * mins).toFixed(4));
  const estimatedVisualUsd = Number((visualRate * mins).toFixed(4));
  const estimatedTotalUsd = Number((estimatedVoiceUsd + estimatedVisualUsd).toFixed(4));

  const isFreeVisual =
    visualProvider === 'free_canvas_animator' ||
    visualProvider === 'ffmpeg_local' ||
    visualProvider === 'free_hf_space';

  const isByoPaidProvider =
    voiceProvider === 'elevenlabs_webhook' ||
    visualProvider === 'liveportrait_webhook' ||
    visualProvider === 'heygen_webhook' ||
    visualProvider === 'custom_paid_video_webhook';

  const paidVeoBlockedByServer =
    visualProvider === 'gemini_omni_veo' && veoGate ? !veoGate.allowed : false;

  const billingResponsibility: CostEstimate['billingResponsibility'] =
    paidVeoBlockedByServer
      ? 'blocked_developer_shield'
      : visualProvider === 'gemini_omni_veo'
        ? veoGate?.billedTo === 'owner'
          ? 'owner_authorized'
          : 'tester_prepaid_credits'
        : isByoPaidProvider
          ? 'tester_byo_provider'
          : 'free_zero_cost';

  const requiresExplicitPaidApproval =
    qualityTier === 'premium' ||
    !isFreeVisual ||
    voiceProvider === 'elevenlabs_webhook' ||
    (state.settings.requireExplicitPaidApproval && estimatedTotalUsd > 0);

  let qualityAdvisory =
    'Gemini 3.8 TTS (Free Tier Eligible) paired with Cinema Multi-Scene FFmpeg Motion Director (>=30s).';
  let recommendedUpgradeTier: QualityTier | undefined;
  let recommendedUpgradeReason: string | undefined;

  if (paidVeoBlockedByServer) {
    qualityAdvisory =
      veoGate?.reason ||
      'Gemini Omni / Veo is locked by Developer Zero-Bill Shield ($0.00 risk). Use Free Cinema, your own Paid Provider Token in Integrations, or Remix in AI Studio.';
  } else if (isByoPaidProvider) {
    qualityAdvisory =
      'Bring-Your-Own Paid API active: calls authenticate with YOUR token in Integrations so your own provider account gets billed directly ($0.00 developer cost).';
  } else if (qualityTier === 'local_free') {
    const freeVoiceLabel =
      voiceProvider === 'free_hindi_neural'
        ? 'Free Natural Hindi / Indian Neural Voice ($0.00)'
        : voiceProvider === 'gemini_lite_tts' || voiceProvider === 'gemini_flash_tts'
          ? 'Free-Tier Gemini 3.8 Speech Persona ($0.00)'
          : 'Free Studio Audio ($0.00)';
    qualityAdvisory =
      visualProvider === 'free_canvas_animator'
        ? `${freeVoiceLabel} + Cinema Canvas Director active — layered DoF frames, shooting angles, LUT grading, waveform, and >=30s captions at $0.00 cost.`
        : visualProvider === 'free_hf_space'
          ? `${freeVoiceLabel} + Hugging Face ZeroGPU Space adapter selected. Ensure your Gradio Space URL is connected in Integrations.`
          : `${freeVoiceLabel} + 6-Shot FFmpeg Cinema Director active — renders minimum 30s multi-angle cuts, LUT color grades, xfade transitions, and subtitles at $0.00 cost.`;
  } else if (qualityTier === 'balanced' && isFreeVisual) {
    qualityAdvisory =
      'Balanced Mode pairs expressive Gemini 3.8 TTS voiceover (Free-Tier Gemini API Eligible) with multi-angle cinema cuts (>=30s) at $0.00 cost.';
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
    paidVeoBlockedByServer,
    billingResponsibility,
    blockReason: paidVeoBlockedByServer ? veoGate?.reason : undefined,
  };
}

function buildHttpNodeRequestConfig(connector: IntegrationConnector): {
  url: string;
  headers: Record<string, string>;
  method: ConnectorHttpMethod;
} {
  let url = (connector.endpointUrl || '').trim();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (connector.customHeadersJson?.trim()) {
    try {
      const parsed = JSON.parse(connector.customHeadersJson);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed)) {
          if (k.trim() && v !== undefined && v !== null) {
            headers[k.trim()] = String(v);
          }
        }
      }
    } catch {
      // Keep default headers if custom JSON is malformed
    }
  }

  const token = (connector.apiToken || '').trim();
  const authType: ConnectorAuthType = connector.authType || 'bearer';
  const authHeaderName = (connector.authHeaderName || 'Authorization').trim() || 'Authorization';

  if (token) {
    if (authType === 'bearer') {
      headers[authHeaderName] = token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`;
    } else if (authType === 'header_key') {
      headers[authHeaderName] = token;
    } else if (authType === 'basic') {
      headers[authHeaderName] = token.toLowerCase().startsWith('basic ')
        ? token
        : `Basic ${Buffer.from(token).toString('base64')}`;
    } else if (authType === 'query_token' && url) {
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}${encodeURIComponent(authHeaderName)}=${encodeURIComponent(token)}`;
    }
  }

  return {
    url,
    headers,
    method: connector.httpMethod || 'POST',
  };
}

function renderHttpNodePayload(
  templateJson: string | undefined,
  vars: Record<string, string>
): string {
  const raw = (templateJson || '').trim();
  if (!raw) {
    return JSON.stringify(vars);
  }
  return raw.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    const val = vars[key] ?? '';
    return val.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  });
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

async function dispatchExternalPaidVideoWorker(params: {
  connector: IntegrationConnector;
  vars: Record<string, string>;
  defaultPayload: Record<string, any>;
  outputRawMp4Path: string;
}): Promise<void> {
  const { url, headers, method } = buildHttpNodeRequestConfig(params.connector);
  if (!url) {
    throw new Error(`${params.connector.name} endpoint URL is missing in Integrations.`);
  }
  const hasAuthHeader = Object.keys(headers).some(
    (k) => k.toLowerCase() !== 'content-type'
  );
  const hasQueryToken = url.includes('=') && Boolean(params.connector.apiToken?.trim());
  if (!params.connector.apiToken?.trim() && !hasAuthHeader && !hasQueryToken) {
    throw new Error(
      `${params.connector.name} requires YOUR own API Token / Authorization key in Integrations so the provider bills your account ($0.00 developer bill).`
    );
  }

  const bodyStr =
    method === 'GET'
      ? undefined
      : params.connector.payloadTemplateJson?.trim()
        ? renderHttpNodePayload(params.connector.payloadTemplateJson, params.vars)
        : JSON.stringify(params.defaultPayload);

  const resp = await fetch(url, {
    method,
    headers,
    body: bodyStr,
    signal: AbortSignal.timeout(45000),
  });

  if (!resp.ok) {
    const errText = (await resp.text().catch(() => '')).slice(0, 220);
    throw new Error(
      `${params.connector.name} returned HTTP ${resp.status}${errText ? `: ${errText}` : ''}. Verify your token and billing balance with that provider.`
    );
  }

  const contentType = (resp.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('video/') || contentType.includes('application/octet-stream')) {
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.byteLength < 1024) {
      throw new Error(`${params.connector.name} returned an empty video payload.`);
    }
    await fs.writeFile(params.outputRawMp4Path, buf);
    return;
  }

  const data: any = await resp.json().catch(() => null);
  const remoteVideoUrl =
    data?.videoUrl ||
    data?.video_url ||
    data?.url ||
    data?.data?.video_url ||
    data?.result?.url ||
    (Array.isArray(data?.output) ? data.output[0] : undefined);

  if (!remoteVideoUrl || typeof remoteVideoUrl !== 'string') {
    throw new Error(
      `${params.connector.name} responded HTTP ${resp.status}, but no MP4 stream or videoUrl/video_url JSON field was returned.`
    );
  }

  const dlResp = await fetch(remoteVideoUrl, { signal: AbortSignal.timeout(30000) });
  if (!dlResp.ok) {
    throw new Error(`Failed to download rendered video from ${params.connector.name} (HTTP ${dlResp.status}).`);
  }
  const vidBuf = Buffer.from(await dlResp.arrayBuffer());
  if (vidBuf.byteLength < 1024) {
    throw new Error(`${params.connector.name} returned an invalid video URL payload.`);
  }
  await fs.writeFile(params.outputRawMp4Path, vidBuf);
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

  // Billing Protection & Stripe Prepaid Credit Endpoints (Free Local Ledger)
  app.get('/api/billing/status', async (req, res) => {
    try {
      const sessionId = resolveSessionId(req);
      res.json(await getBillingProtectionStatus({ req, sessionId }));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/billing/create-checkout-session', async (req, res) => {
    try {
      const sessionId = resolveSessionId(req);
      if (!sessionId) {
        return res.status(400).json({ error: 'Tester workspace session header is required.' });
      }
      if (!isPaidVeoFlagEnabled() || !isStripeConfigured()) {
        return res.status(403).json({
          error:
            'Prepaid Stripe Checkout is not enabled by the developer on this preview. Paid Gemini Veo stays locked ($0.00 developer risk). Connect your own Paid API token in Integrations or Remix in AI Studio.',
        });
      }
      const amountUsd = Math.max(2, Math.min(100, Number(req.body?.amountUsd) || 5));
      const reqOrigin = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;
      const session = await createStripeCheckoutSession({
        sessionId,
        amountUsd,
        successUrl: `${reqOrigin}/?stripe_session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${reqOrigin}/?stripe_cancelled=1`,
      });
      res.json(session);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to start Stripe Checkout.' });
    }
  });

  app.post('/api/billing/verify-stripe-session', async (req, res) => {
    try {
      const sessionId = resolveSessionId(req);
      if (!sessionId) {
        return res.status(400).json({ error: 'Tester workspace session header is required.' });
      }
      const stripeSessionId = String(req.body?.stripeSessionId || '').trim();
      if (!stripeSessionId) {
        return res.status(400).json({ error: 'stripeSessionId is required.' });
      }
      const result = await verifyAndApplyStripeSession({ stripeSessionId, sessionId });
      const status = await getBillingProtectionStatus({ req, sessionId });
      res.json({ ...result, billingProtection: status });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to verify Stripe payment.' });
    }
  });

  // Get workspace state
  app.get('/api/workspace', async (req, res) => {
    try {
      const { state } = await readReqWorkspace(req);
      res.json(state);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load workspace.' });
    }
  });

  // Upload Face / Reference Clip
  app.post('/api/twin/upload-face', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No image or video file received.' });
      const category = (req.body.category || 'front') as FaceCategory;
      const label = String(req.body.label || req.file.originalname);

      const { state } = await readReqWorkspace(req);
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

      const saved = await writeReqWorkspace(req, state);
      res.json(saved);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Face upload failed.' });
    }
  });

  app.delete('/api/twin/face/:id', async (req, res) => {
    try {
      const { state } = await readReqWorkspace(req);
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
      res.json(await writeReqWorkspace(req, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Upload Voice Sample (file or mic recording)
  app.post('/api/twin/upload-voice', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No audio recording received.' });

      const label = String(req.body.label || req.file.originalname || 'Voice Sample');
      const language = (req.body.language || 'English') as TwinLanguage;
      const emotion = req.body.emotion || 'Conversational';
      const diskPath = path.join(UPLOADS_DIR, req.file.filename);
      const durationSec = await getMediaDurationSec(diskPath);

      const { state } = await readReqWorkspace(req);
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

      res.json(await writeReqWorkspace(req, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Voice upload failed.' });
    }
  });

  app.post('/api/twin/transcribe-voice/:id', async (req, res) => {
    try {
      const { sessionId, state } = await readReqWorkspace(req);
      const sample = state.twin.voiceSamples.find((v) => v.id === req.params.id);
      if (!sample) return res.status(404).json({ error: 'Voice sample not found.' });
      const localPath = resolveLocalAssetPath(sample.url);
      if (!localPath) {
        return res.status(400).json({ error: 'This sample has no audio file on disk to transcribe.' });
      }
      if (isGeminiConfigured()) {
        const q = await consumeFreeGeminiQuota(req, sessionId);
        if (!q.ok) return res.status(429).json({ error: q.error });
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

      res.json(await writeReqWorkspace(req, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Voice transcription failed.' });
    }
  });

  app.post('/api/twin/verify-voice/:id', async (req, res) => {
    try {
      const { state } = await readReqWorkspace(req);
      const sample = state.twin.voiceSamples.find((v) => v.id === req.params.id);
      if (!sample) return res.status(404).json({ error: 'Voice sample not found.' });
      const manualTranscript = String(req.body?.transcript || '').trim();
      if (manualTranscript) {
        sample.transcript = manualTranscript;
      } else if (!sample.transcript) {
        sample.transcript = `Verified studio voice reference (${sample.language} · ${sample.emotion})`;
      }
      sample.verified = true;
      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || 'Creator',
        category: 'identity',
        action: 'Voice Sample Verified',
        detail: `Creator verified "${sample.label}" (${sample.language}).`,
      });
      res.json(await writeReqWorkspace(req, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Voice verification failed.' });
    }
  });

  app.delete('/api/twin/voice/:id', async (req, res) => {
    try {
      const { state } = await readReqWorkspace(req);
      const target = state.twin.voiceSamples.find((v) => v.id === req.params.id);
      state.twin.voiceSamples = state.twin.voiceSamples.filter((v) => v.id !== req.params.id);
      if (target && target.url.startsWith('/api/media/uploads/')) {
        await fs.unlink(path.join(UPLOADS_DIR, path.basename(target.url))).catch(() => {});
      }
      res.json(await writeReqWorkspace(req, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/twin/personality', async (req, res) => {
    try {
      const { state } = await readReqWorkspace(req);
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
      res.json(await writeReqWorkspace(req, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/twin/consent', async (req, res) => {
    try {
      const { state } = await readReqWorkspace(req);
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
      res.json(await writeReqWorkspace(req, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Live RSS Trend Radar Fetch
  app.post('/api/trends/refresh', async (req, res) => {
    try {
      const { state } = await readReqWorkspace(req);
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

      const saved = await writeReqWorkspace(req, state);
      res.json({ workspace: saved, fetchedCount: fetchedItems.length, feedErrors });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to refresh RSS feeds.' });
    }
  });

  app.post('/api/trends/import', async (req, res) => {
    try {
      const { state } = await readReqWorkspace(req);
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
      res.json(await writeReqWorkspace(req, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Online Viral Ideas Search (Google Search Grounding across Comedy, Science, Knowledge, etc.)
  app.post('/api/intelligence/fetch-online', async (req, res) => {
    try {
      const { sessionId, state } = await readReqWorkspace(req);
      const { genre, query, language, alsoImportToRadar } = req.body as {
        genre?: ScriptGenre;
        query?: string;
        language?: TwinLanguage;
        alsoImportToRadar?: boolean;
      };

      const targetGenre: ScriptGenre = genre || 'Knowledge';
      const targetLang: TwinLanguage =
        language || state.twin.personality.primaryLanguage || 'Hindi';

      if (isGeminiConfigured()) {
        const q = await consumeFreeGeminiQuota(req, sessionId);
        if (!q.ok) return res.status(429).json({ error: q.error });
      }

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

      const saved = await writeReqWorkspace(req, state);
      res.json({ workspace: saved, ideas, groundingSources });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch online viral ideas.' });
    }
  });

  // Create Blank / Manual Script Pack for Custom Writing & AI Assist
  app.post('/api/intelligence/create-blank', async (req, res) => {
    try {
      const { state } = await readReqWorkspace(req);
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

      const saved = await writeReqWorkspace(req, state);
      res.json({ workspace: saved, scriptId: pack.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to create blank script.' });
    }
  });

  // Content Intelligence Script Generation
  app.post('/api/intelligence/generate', async (req, res) => {
    try {
      const { sessionId, state } = await readReqWorkspace(req);
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

      if (isGeminiConfigured()) {
        const q = await consumeFreeGeminiQuota(req, sessionId);
        if (!q.ok) return res.status(429).json({ error: q.error });
      }

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

      const saved = await writeReqWorkspace(req, state);
      res.json({ workspace: saved, scriptId: pack.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Script generation failed.' });
    }
  });

  // AI Writing Assist / Rewrite on an active script variant
  app.post('/api/intelligence/:id/rewrite', async (req, res) => {
    try {
      const { sessionId, state } = await readReqWorkspace(req);
      const pack = state.scripts.find((s) => s.id === req.params.id);
      if (!pack) return res.status(404).json({ error: 'Script pack not found.' });

      const { variantId, action } = req.body as { variantId?: string; action: RewriteAction };
      const targetVar =
        pack.variants.find((v) => v.id === variantId) ||
        pack.variants.find((v) => v.id === pack.selectedVariantId) ||
        pack.variants[0];
      if (!targetVar) return res.status(404).json({ error: 'Script variant not found.' });

      if (isGeminiConfigured()) {
        const q = await consumeFreeGeminiQuota(req, sessionId);
        if (!q.ok) return res.status(429).json({ error: q.error });
      }

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

      const saved = await writeReqWorkspace(req, state);
      res.json({ workspace: saved, action });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Script rewrite failed.' });
    }
  });

  app.put('/api/intelligence/:id', async (req, res) => {
    try {
      const { state } = await readReqWorkspace(req);
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

      res.json(await writeReqWorkspace(req, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Voice Engine Audition
  app.post('/api/voice/audition', async (req, res) => {
    try {
      const { sessionId, state } = await readReqWorkspace(req);
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
          const q = await consumeFreeGeminiQuota(req, sessionId);
          if (!q.ok) {
            return res.status(429).json({
              error: `Free Edge TTS stream temporarily unreachable (${edgeErr.message || 'network'}) and ${q.error}`,
            });
          }
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
              'ElevenLabs Personal Voice Clone connector requires YOUR endpoint URL and API key in Integrations so ElevenLabs bills your account ($0.00 developer bill).',
          });
        }
        const { url, headers, method } = buildHttpNodeRequestConfig(connector);
        const resp = await fetch(url, {
          method: method === 'GET' ? 'POST' : method,
          headers,
          body: JSON.stringify({
            text,
            model_id: 'eleven_multilingual_v2',
            voiceIdentity,
            language,
            emotion,
          }),
          signal: AbortSignal.timeout(25000),
        });
        if (!resp.ok) {
          const errText = (await resp.text().catch(() => '')).slice(0, 180);
          return res.status(502).json({
            error: `ElevenLabs webhook returned HTTP ${resp.status}${errText ? `: ${errText}` : ''}. Verify your personal API token in Integrations.`,
          });
        }
        const buf = Buffer.from(await resp.arrayBuffer());
        await fs.writeFile(outPath, buf);
        resolvedVoiceLabel = `${voiceIdentity || 'Authorized Cloned Voice'} (Your Token)`;
      } else {
        const q = await consumeFreeGeminiQuota(req, sessionId);
        if (!q.ok) {
          return res.status(429).json({ error: q.error });
        }
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
        resolvedProvider === 'elevenlabs_webhook'
          ? Number(((durationSec / 60) * 0.18).toFixed(4))
          : 0;

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
                    ? 'ElevenLabs Personal Clone (Your Token)'
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

      const saved = await writeReqWorkspace(req, state);
      res.json({ workspace: saved, audition });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Voice audition failed.' });
    }
  });

  // Pre-generation Cost Estimator & Quality Fallback Advisory
  app.post('/api/studio/estimate', async (req, res) => {
    try {
      const { sessionId, state } = await readReqWorkspace(req);
      const { qualityTier, voiceProvider, visualProvider, durationSec } = req.body;
      const safeDur = Math.max(MIN_VIDEO_DURATION_SEC, Number(durationSec) || MIN_VIDEO_DURATION_SEC);
      const qTier = (qualityTier || 'local_free') as QualityTier;
      const vProv = (voiceProvider || 'free_hindi_neural') as VoiceProviderId;
      const visProv = (visualProvider || 'ffmpeg_local') as VisualProviderId;
      const prelim = estimateJobCost(state, qTier, vProv, visProv, safeDur);
      const veoGate =
        visProv === 'gemini_omni_veo'
          ? await evaluatePaidVeoAccess({
              req,
              sessionId,
              estimatedUsd: prelim.estimatedTotalUsd,
            })
          : undefined;
      const estimate = estimateJobCost(state, qTier, vProv, visProv, safeDur, veoGate);
      res.json(estimate);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Browsable structured Prompt-Library catalog for Video Studio scene selection
  app.get('/api/studio/prompt-library', (_req, res) => {
    res.json({ templates: VISUAL_PROMPT_LIBRARY });
  });

  // Plan script-matched backgrounds, prompt-library presets & diverse presenter visuals
  app.post('/api/studio/plan-visuals', async (req, res) => {
    try {
      const { mode, sessionId, state } = await readReqWorkspace(req);
      const {
        title,
        scriptText,
        language,
        format,
        genre,
        writingStyle,
        emotion,
        backgroundStyle,
        presenterMode,
        productionStyle,
        shootingAngle,
        voiceIdentity,
        portraitAssetId,
        beatTemplateOverrides,
      } = req.body as {
        title?: string;
        scriptText?: string;
        language?: TwinLanguage;
        format?: VideoFormatType;
        genre?: ScriptGenre;
        writingStyle?: WritingStyleMode;
        emotion?: string;
        backgroundStyle?: string;
        presenterMode?: PresenterVisualMode;
        productionStyle?: ProductionStyle;
        shootingAngle?: ShootingAnglePreset;
        voiceIdentity?: string;
        portraitAssetId?: string;
        beatTemplateOverrides?: Record<string, string>;
      };

      const normalizedOverrides: Record<number, string> = {};
      if (beatTemplateOverrides && typeof beatTemplateOverrides === 'object') {
        for (const [k, v] of Object.entries(beatTemplateOverrides)) {
          const num = Number(k);
          if (Number.isInteger(num) && num >= 0 && num < 6 && typeof v === 'string' && v.trim()) {
            normalizedOverrides[num] = v.trim();
          }
        }
      }

      const imageAssets = state.twin.faceAssets
        .filter((f) => !/\.(mp4|mov|webm)$/i.test(f.url))
        .map((f) => ({
          id: f.id,
          url: f.url,
          diskPath: resolveLocalAssetPath(f.url) || undefined,
        }));

      let allowGeminiVision = false;
      if (isGeminiConfigured()) {
        const q = await inspectFreeGeminiQuota(req, sessionId);
        if (q.hourlyRemaining > 0 && q.dailyRemaining > 0) {
          allowGeminiVision = true;
          await consumeFreeGeminiQuota(req, sessionId);
        }
      }

      const planned = await planAndFetchScriptVisuals({
        title: String(title || 'TwinForge Studio Production'),
        scriptText: String(scriptText || title || ''),
        language: language || state.twin.personality.primaryLanguage,
        format,
        genre,
        writingStyle,
        emotion,
        backgroundStyle: backgroundStyle || 'Auto-Match Script Theme',
        presenterMode: presenterMode || 'auto_match',
        productionStyle: productionStyle || 'auto_genre',
        shootingAngle: shootingAngle || 'auto_director',
        voiceIdentity: voiceIdentity || state.twin.personality.preferredVoiceId,
        mode,
        twinFaceImageAssets: allowGeminiVision ? imageAssets : [],
        preferredPortraitId: portraitAssetId,
        beatTemplateOverrides: normalizedOverrides,
      });

      res.json({
        beats: planned.beats,
        presenterModeResolved: planned.presenter.presenterModeResolved,
        presenterLabel: planned.presenter.presenterLabel,
        presenterImageUrls: planned.presenter.presenterImageUrls,
        productionStyleResolved: planned.productionStyleResolved,
        visionAnalysisUsed: planned.visionAnalysisUsed,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Visual planning failed.' });
    }
  });

  // Video Render Pipeline (Local Free, Balanced, or Explicitly Approved Premium)
  app.post('/api/studio/render', async (req, res) => {
    try {
      const { mode, sessionId, state } = await readReqWorkspace(req);
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
      const prelimCost = estimateJobCost(state, qualityTier, voiceProvider, visualProvider, estSec);
      const veoGate =
        visualProvider === 'gemini_omni_veo'
          ? await evaluatePaidVeoAccess({
              req,
              sessionId,
              estimatedUsd: prelimCost.estimatedTotalUsd,
            })
          : undefined;
      const costEst = estimateJobCost(state, qualityTier, voiceProvider, visualProvider, estSec, veoGate);

      // CRITICAL SERVER LOCK: Block Paid Gemini Veo unconditionally unless unlocked by Owner token or verified tester Stripe credits
      if (visualProvider === 'gemini_omni_veo' && (!veoGate || !veoGate.allowed)) {
        return res.status(403).json({
          error:
            veoGate?.reason ||
            'Developer Zero-Bill Shield is ACTIVE: Paid Gemini Omni / Veo is locked server-side ($0.00 developer risk).',
          code: 'PAID_VEO_LOCKED_ZERO_DEV_BILL',
          estimate: costEst,
        });
      }

      if (costEst.requiresExplicitPaidApproval && !approvedPaidCharge) {
        return res.status(402).json({
          error: 'Explicit user cost authorization required before executing this render.',
          estimate: costEst,
        });
      }

      // Validate external BYO paid connectors BEFORE burning any voice synthesis or credits
      let externalPaidConnector: IntegrationConnector | undefined;
      if (
        visualProvider === 'liveportrait_webhook' ||
        visualProvider === 'heygen_webhook' ||
        visualProvider === 'custom_paid_video_webhook'
      ) {
        const lookupId =
          visualProvider === 'custom_paid_video_webhook'
            ? 'custom_paid_video_webhook'
            : 'liveportrait_heygen';
        externalPaidConnector = state.integrations.find((i) => i.id === lookupId);
        if (!externalPaidConnector?.endpointUrl) {
          return res.status(400).json({
            error: `${
              visualProvider === 'custom_paid_video_webhook'
                ? 'Custom Paid Video API'
                : 'External LivePortrait/HeyGen'
            } endpoint URL and YOUR API token must be configured in Integrations so you pay your own provider bill ($0.00 developer bill).`,
          });
        }
        const cfg = buildHttpNodeRequestConfig(externalPaidConnector);
        const hasAuth =
          Boolean(externalPaidConnector.apiToken?.trim()) ||
          Object.keys(cfg.headers).some((k) => k.toLowerCase() !== 'content-type');
        if (!hasAuth) {
          return res.status(400).json({
            error: `${externalPaidConnector.name} requires YOUR own API Token / Authorization key in Integrations before rendering ($0.00 developer cost).`,
          });
        }
      }

      // Plan script-matched backgrounds, prompt-library presets & diverse presenter via Gemini Vision
      const twinFaceImgAssets = state.twin.faceAssets
        .filter((f) => !/\.(mp4|mov|webm)$/i.test(f.url))
        .map((f) => ({
          id: f.id,
          url: f.url,
          diskPath: resolveLocalAssetPath(f.url) || undefined,
        }));

      const rawOverrides = (req.body as any).beatTemplateOverrides;
      const normalizedRenderOverrides: Record<number, string> = {};
      if (rawOverrides && typeof rawOverrides === 'object') {
        for (const [k, v] of Object.entries(rawOverrides)) {
          const num = Number(k);
          if (Number.isInteger(num) && num >= 0 && num < 6 && typeof v === 'string' && v.trim()) {
            normalizedRenderOverrides[num] = v.trim();
          }
        }
      }

      const plannedVisuals = await planAndFetchScriptVisuals({
        title: title || 'TwinForge Studio Production',
        scriptText: scriptText || title || '',
        language: language || state.twin.personality.primaryLanguage,
        format: format || 'Talking-Head',
        genre: (req.body as any).genre,
        writingStyle: (req.body as any).writingStyle,
        emotion,
        backgroundStyle: backgroundStyle || 'Auto-Match Script Theme',
        presenterMode: (req.body as any).presenterMode || 'auto_match',
        productionStyle: (req.body as any).productionStyle || 'auto_genre',
        shootingAngle: ((req.body as any).shootingAngle as ShootingAnglePreset) || 'auto_director',
        voiceIdentity: voiceIdentity || state.twin.personality.preferredVoiceId,
        mode,
        twinFaceImageAssets: twinFaceImgAssets,
        preferredPortraitId: portraitAssetId,
        beatTemplateOverrides: normalizedRenderOverrides,
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
            // Fall back to Gemini Lite TTS if Edge TTS fails (only if free quota allows)
            const q = await consumeFreeGeminiQuota(req, sessionId);
            if (!q.ok) return res.status(429).json({ error: q.error });
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
        } else if (voiceProvider === 'elevenlabs_webhook') {
          const elConn = state.integrations.find((i) => i.id === 'elevenlabs_webhook');
          if (!elConn?.endpointUrl) {
            return res.status(400).json({
              error:
                'ElevenLabs Personal Voice Clone requires YOUR endpoint URL and API token in Integrations ($0.00 developer cost).',
            });
          }
          const { url, headers, method } = buildHttpNodeRequestConfig(elConn);
          const elResp = await fetch(url, {
            method: method === 'GET' ? 'POST' : method,
            headers,
            body: JSON.stringify({
              text: spokenText.slice(0, 1500),
              model_id: 'eleven_multilingual_v2',
              voiceIdentity,
              language,
              emotion,
            }),
            signal: AbortSignal.timeout(25000),
          });
          if (!elResp.ok) {
            const errTxt = (await elResp.text().catch(() => '')).slice(0, 180);
            return res.status(502).json({
              error: `ElevenLabs webhook failed (HTTP ${elResp.status})${errTxt ? `: ${errTxt}` : ''}.`,
            });
          }
          const wavName = `render_el_${Date.now()}_${crypto.randomUUID().slice(0, 4)}.wav`;
          const wavOut = path.join(AUDIO_DIR, wavName);
          await fs.writeFile(wavOut, Buffer.from(await elResp.arrayBuffer()));
          audioPath = wavOut;
          actualVoiceCost = costEst.estimatedVoiceUsd;
        } else if (voiceProvider === 'gemini_flash_tts' || voiceProvider === 'gemini_lite_tts') {
          const q = await consumeFreeGeminiQuota(req, sessionId);
          if (!q.ok) return res.status(429).json({ error: q.error });
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
      let costBilledTo: VideoRenderJob['costBilledTo'] =
        voiceProvider === 'elevenlabs_webhook' ? 'tester_byo_token' : 'free';

      if (visualProvider === 'gemini_omni_veo') {
        const rawVeoPath = path.join(VIDEOS_DIR, `${jobId}_raw_veo.mp4`);
        const veoAspect = aspectRatio === '16:9' ? '16:9' : '9:16';
        let chargedCredits = false;
        if (veoGate?.billedTo === 'tester_credits' && sessionId) {
          const deduct = await deductTesterCredits(sessionId, costEst.estimatedTotalUsd, jobId);
          if (!deduct.ok) {
            return res.status(402).json({
              error: `Insufficient prepaid credits ($${deduct.remainingUsd.toFixed(2)}). Required: $${costEst.estimatedTotalUsd.toFixed(2)}.`,
            });
          }
          chargedCredits = true;
        }
        try {
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
          costBilledTo = veoGate?.billedTo === 'owner' ? 'owner' : 'tester_credits';
          provenanceNote =
            veoGate?.billedTo === 'owner'
              ? 'Gemini Omni / Veo Motion (Owner Unlocked) + Local FFmpeg Mastering'
              : 'Gemini Omni / Veo Motion (Tester Prepaid Credits) + Local FFmpeg Mastering';
        } catch (veoErr) {
          if (chargedCredits && sessionId) {
            await refundTesterCredits(sessionId, costEst.estimatedTotalUsd, jobId);
          }
          throw veoErr;
        }
      } else if (externalPaidConnector) {
        const reqOrigin = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;
        const rawWorkerMp4 = path.join(VIDEOS_DIR, `${jobId}_raw_worker.mp4`);
        const publicPortraitUrl = chosenAsset?.url ? `${reqOrigin}${chosenAsset.url}` : '';
        const publicAudioUrl = audioPath ? `${reqOrigin}/api/media/audio/${path.basename(audioPath)}` : '';
        await dispatchExternalPaidVideoWorker({
          connector: externalPaidConnector,
          vars: {
            id: jobId,
            title: title || 'TwinForge Production',
            scriptText: scriptText || title || '',
            aspectRatio: aspectRatio || '9:16',
            emotion: emotion || 'Conversational',
            portraitUrl: publicPortraitUrl,
            audioUrl: publicAudioUrl,
            durationSec: String(estSec),
          },
          defaultPayload: {
            jobId,
            provider: visualProvider,
            title,
            scriptText,
            aspectRatio: aspectRatio || '9:16',
            emotion,
            durationSec: estSec,
            portraitUrl: publicPortraitUrl,
            audioUrl: publicAudioUrl,
          },
          outputRawMp4Path: rawWorkerMp4,
        });
        const mastered = await muxAudioAndWatermarkOnVideoFFmpeg({
          sourceVideoPath: rawWorkerMp4,
          audioPath,
          aiDisclosureWatermark,
          watermarkText: state.settings.watermarkText,
          outputVideoPath: outVideoPath,
          outputThumbPath: outThumbPath,
        });
        durationSec = mastered.durationSec;
        actualVisualCost = costEst.estimatedVisualUsd;
        costBilledTo = 'tester_byo_token';
        provenanceNote = `${externalPaidConnector.name} (Tester BYO Token) + Local FFmpeg Mastering`;
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
        const sceneImagePaths = plannedVisuals.presenter.presenterDiskPaths;
        const sceneBackgroundPaths = plannedVisuals.beatDiskPaths.filter((p): p is string => Boolean(p));
        const requestedAngle: ShootingAnglePreset = (req.body as any).shootingAngle || 'auto_director';
        const requestedGrade: ColorGradePreset = (req.body as any).colorGrade || 'teal_amber_cinema';
        const requestedAnimMode: AnimationPresetMode = (req.body as any).animationMode || 'cinematic_layered';
        const requestedTransition: TransitionStylePreset = (req.body as any).transitionStyle || 'whip_pan';

        const rendered = await renderTwinVideoFFmpeg({
          portraitPath,
          sceneImagePaths,
          sceneBackgroundPaths,
          presenterMode: plannedVisuals.presenter.presenterModeResolved,
          productionStyle: plannedVisuals.productionStyleResolved,
          shootingAngle: requestedAngle,
          colorGrade: requestedGrade,
          animationMode: requestedAnimMode,
          transitionStyle: requestedTransition,
          beatOverlays: plannedVisuals.beats.map((b) => ({
            headline: b.headline,
            calloutText: b.calloutText,
            subBadge: b.subBadge,
            isPunchline: b.isPunchline,
            motionGraphicPreset: b.motionGraphicPreset,
            cameraMotion: b.cameraMotion,
            shootingAngle: b.shootingAngle,
            colorAccent: b.accentHex,
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
        const visionTag = plannedVisuals.visionAnalysisUsed ? ' · Gemini Vision Prompt Library' : ' · Prompt Library';
        provenanceNote =
          qualityTier === 'local_free'
            ? voiceProvider === 'free_hindi_neural'
              ? `Free Natural Hindi Neural (${voiceIdentity || 'Andrew'}) · ${plannedVisuals.productionStyleResolved.replace('_', ' ')}${visionTag} ($0.00)`
              : voiceProvider === 'gemini_lite_tts' || voiceProvider === 'gemini_flash_tts'
                ? `Free-Tier Gemini 3.8 TTS (${voiceIdentity || 'Kore'}) · ${plannedVisuals.productionStyleResolved.replace('_', ' ')}${visionTag} ($0.00)`
                : `Free 6-Shot ${plannedVisuals.productionStyleResolved.replace('_', ' ')} Cinema Director${visionTag} ($0.00)`
            : `Balanced Cinema Mode · ${plannedVisuals.productionStyleResolved.replace('_', ' ')}${visionTag}`;
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
        voiceIdentity: voiceIdentity || 'Kore',
        visualProvider,
        aspectRatio: aspectRatio || '9:16',
        format: format || 'Talking-Head',
        language: language || 'English',
        emotion: emotion || 'Conversational',
        framing: framing || 'Close-Up Studio',
        backgroundStyle: backgroundStyle || 'Auto-Match Script Theme',
        presenterMode: plannedVisuals.presenter.presenterModeResolved,
        productionStyle: plannedVisuals.productionStyleResolved,
        shootingAngle: ((req.body as any).shootingAngle as ShootingAnglePreset) || 'auto_director',
        colorGrade: ((req.body as any).colorGrade as ColorGradePreset) || 'teal_amber_cinema',
        animationMode: ((req.body as any).animationMode as AnimationPresetMode) || 'cinematic_layered',
        transitionStyle: ((req.body as any).transitionStyle as TransitionStylePreset) || 'whip_pan',
        wardrobeNote: wardrobeNote || 'Studio Attire',
        speakingSpeed: Number(speakingSpeed) || 1.0,
        voiceIntensity: voiceIntensity || 'Balanced',
        subtitlesEnabled: Boolean(subtitlesEnabled),
        aiDisclosureWatermark: Boolean(aiDisclosureWatermark),
        estimatedCostUsd: costEst.estimatedTotalUsd,
        actualCostUsd,
        approvedPaidCharge: Boolean(approvedPaidCharge),
        costBilledTo,
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
        detail: `${job.title} · ${durationSec}s in ${(processingMs / 1000).toFixed(1)}s · Est $${costEst.estimatedTotalUsd.toFixed(3)} / Actual $${actualCostUsd.toFixed(3)} · Billed: ${costBilledTo}`,
        costImpactUsd: actualCostUsd,
      });

      const saved = await writeReqWorkspace(req, state);
      res.json({ workspace: saved, video: job });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Video render failed.' });
    }
  });

  // Upload & FFmpeg-master client-animated free Canvas render into H.264 MP4
  app.post('/api/studio/upload-rendered', upload.single('video'), async (req, res) => {
    try {
      const { state } = await readReqWorkspace(req);
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
        shootingAngle: (meta.shootingAngle as ShootingAnglePreset) || 'auto_director',
        colorGrade: (meta.colorGrade as ColorGradePreset) || 'teal_amber_cinema',
        animationMode: (meta.animationMode as AnimationPresetMode) || 'cinematic_layered',
        transitionStyle: (meta.transitionStyle as TransitionStylePreset) || 'whip_pan',
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

      const saved = await writeReqWorkspace(req, state);
      res.json({ workspace: saved, video: job });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to master animated recording.' });
    }
  });

  app.put('/api/library/:id/review', async (req, res) => {
    try {
      const { state } = await readReqWorkspace(req);
      const video = state.videos.find((v) => v.id === req.params.id);
      if (!video) return res.status(404).json({ error: 'Video not found.' });
      video.reviewStatus = req.body.reviewStatus;
      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || 'Creator',
        category: 'render',
        action: `Video ${req.body.reviewStatus}`,
        detail: video.title,
      });
      res.json(await writeReqWorkspace(req, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/library/:id', async (req, res) => {
    try {
      const { state } = await readReqWorkspace(req);
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
      res.json(await writeReqWorkspace(req, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Side-by-Side Provider Benchmark Runner
  app.post('/api/benchmarks/run', async (req, res) => {
    try {
      const { sessionId, state } = await readReqWorkspace(req);
      const { providerId, scriptExcerpt, approvedPaidCharge } = req.body;
      const bm = state.benchmarks.find((b) => b.providerId === providerId);
      if (!bm) return res.status(404).json({ error: 'Benchmark provider not found.' });

      const sampleScript =
        String(scriptExcerpt || '').trim() ||
        'Every creator assumes camera gear drives retention, when clarity in the first three seconds decides everything.';

      if (providerId === 'gemini_omni_veo') {
        const veoGate = await evaluatePaidVeoAccess({
          req,
          sessionId,
          estimatedUsd: 0.25,
        });
        if (!veoGate.allowed) {
          return res.status(403).json({
            error:
              veoGate.reason ||
              'Developer Zero-Bill Shield is ACTIVE: Paid Gemini Omni / Veo benchmark is locked server-side ($0.00 developer risk).',
            code: 'PAID_VEO_LOCKED_ZERO_DEV_BILL',
          });
        }
      }

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
        const q = await consumeFreeGeminiQuota(req, sessionId);
        if (!q.ok) return res.status(429).json({ error: q.error });
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
      } else if (providerId === 'elevenlabs_webhook') {
        const elConn = state.integrations.find((i) => i.id === 'elevenlabs_webhook');
        if (!elConn?.endpointUrl || !elConn?.apiToken) {
          return res.status(400).json({
            error:
              'Configure YOUR ElevenLabs endpoint URL and API key in Integrations before running this benchmark ($0.00 developer cost).',
          });
        }
        const { url, headers, method } = buildHttpNodeRequestConfig(elConn);
        const resp = await fetch(url, {
          method: method === 'GET' ? 'POST' : method,
          headers,
          body: JSON.stringify({
            text: sampleScript,
            model_id: 'eleven_multilingual_v2',
            language: state.twin.personality.primaryLanguage || 'English',
          }),
          signal: AbortSignal.timeout(25000),
        });
        if (!resp.ok) {
          return res.status(502).json({ error: `ElevenLabs benchmark returned HTTP ${resp.status}.` });
        }
        const fname = `bm_elevenlabs_${Date.now()}.wav`;
        await fs.writeFile(path.join(AUDIO_DIR, fname), Buffer.from(await resp.arrayBuffer()));
        const elapsed = Date.now() - startMs;
        bm.verified = true;
        bm.processingMs = elapsed;
        bm.sampleOutputUrl = `/api/media/audio/${fname}`;
        bm.sampleType = 'audio';
        bm.scriptExcerpt = sampleScript;
        bm.benchmarkedAt = new Date().toISOString();
        bm.notes = `Measured ElevenLabs BYO token synthesis in ${elapsed}ms (billed to your ElevenLabs key).`;
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
        const veoGate = await evaluatePaidVeoAccess({ req, sessionId, estimatedUsd: 0.25 });
        let chargedCredits = false;
        const bmRef = `bm_veo_${Date.now()}`;
        if (veoGate.billedTo === 'tester_credits' && sessionId) {
          const deduct = await deductTesterCredits(sessionId, 0.25, bmRef);
          if (!deduct.ok) {
            return res.status(402).json({
              error: `Insufficient prepaid credits ($${deduct.remainingUsd.toFixed(2)}) for $0.25 Veo benchmark.`,
            });
          }
          chargedCredits = true;
        }
        try {
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
        } catch (veoErr) {
          if (chargedCredits && sessionId) {
            await refundTesterCredits(sessionId, 0.25, bmRef);
          }
          throw veoErr;
        }
      } else if (
        providerId === 'liveportrait_webhook' ||
        providerId === 'heygen_webhook' ||
        providerId === 'custom_paid_video_webhook'
      ) {
        const lookupId =
          providerId === 'custom_paid_video_webhook' ? 'custom_paid_video_webhook' : 'liveportrait_heygen';
        const conn = state.integrations.find((i) => i.id === lookupId);
        if (!conn?.endpointUrl || !conn?.apiToken) {
          return res.status(400).json({
            error: `Configure YOUR ${bm.providerName} endpoint URL & API token in Integrations before benchmarking ($0.00 developer cost).`,
          });
        }
        const reqOrigin = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;
        const rawWorker = path.join(VIDEOS_DIR, `bm_worker_raw_${Date.now()}.mp4`);
        const vName = `bm_worker_${Date.now()}.mp4`;
        const tName = `bm_worker_${Date.now()}.jpg`;
        await dispatchExternalPaidVideoWorker({
          connector: conn,
          vars: {
            id: `bm_${Date.now()}`,
            title: `Benchmark · ${bm.providerName}`,
            scriptText: sampleScript,
            aspectRatio: '9:16',
            emotion: 'Editorial',
            portraitUrl: state.twin.faceAssets[0]?.url ? `${reqOrigin}${state.twin.faceAssets[0].url}` : '',
            audioUrl: '',
            durationSec: '5',
          },
          defaultPayload: {
            provider: providerId,
            scriptText: sampleScript,
            aspectRatio: '9:16',
            durationSec: 5,
            portraitUrl: state.twin.faceAssets[0]?.url ? `${reqOrigin}${state.twin.faceAssets[0].url}` : '',
          },
          outputRawMp4Path: rawWorker,
        });
        await muxAudioAndWatermarkOnVideoFFmpeg({
          sourceVideoPath: rawWorker,
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
        bm.notes = `Measured ${bm.providerName} (Tester BYO token) + FFmpeg master in ${elapsed}ms.`;
      } else {
        return res.status(400).json({
          error: `${bm.providerName} requires a configured external endpoint in Integrations before benchmarking.`,
        });
      }

      const saved = await writeReqWorkspace(req, state);
      res.json({ workspace: saved, benchmark: bm });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Benchmark execution failed.' });
    }
  });

  // Save user-observed quality ratings on a benchmarked provider
  app.put('/api/benchmarks/:id/rate', async (req, res) => {
    try {
      const { state } = await readReqWorkspace(req);
      const bm = state.benchmarks.find((b) => b.id === req.params.id);
      if (!bm) return res.status(404).json({ error: 'Benchmark not found.' });
      bm.metrics = { ...bm.metrics, ...req.body.metrics };
      res.json(await writeReqWorkspace(req, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // n8n Automation & Webhook Dispatch
  app.post('/api/automation/dispatch', async (req, res) => {
    try {
      const { state } = await readReqWorkspace(req);
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

      res.json(await writeReqWorkspace(req, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/automation/retry/:id', async (req, res) => {
    try {
      const { state } = await readReqWorkspace(req);
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
      res.json(await writeReqWorkspace(req, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/automation/toggle/:id', async (req, res) => {
    try {
      const { state } = await readReqWorkspace(req);
      const job = state.automationJobs.find((j) => j.id === req.params.id);
      if (!job) return res.status(404).json({ error: 'Job not found.' });
      job.status = job.status === 'paused' ? 'queued' : 'paused';
      job.updatedAt = new Date().toISOString();
      job.logs.push(`[${new Date().toLocaleTimeString()}] Operator set status to ${job.status}`);
      res.json(await writeReqWorkspace(req, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/automation/webhook/callback', async (req, res) => {
    try {
      const { state } = await readReqWorkspace(req);
      const { jobId, status, detail } = req.body;
      const job = state.automationJobs.find((j) => j.id === jobId);
      if (job) {
        job.status = status || 'succeeded';
        job.updatedAt = new Date().toISOString();
        job.logs.push(`[${new Date().toLocaleTimeString()}] Inbound callback: ${detail || job.status}`);
        await writeReqWorkspace(req, state);
      }
      res.json({ received: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Publishing Drafts & Dispatch
  app.post('/api/publishing/draft', async (req, res) => {
    try {
      const { state } = await readReqWorkspace(req);
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

      res.json(await writeReqWorkspace(req, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/publishing/:id', async (req, res) => {
    try {
      const { state } = await readReqWorkspace(req);
      const idx = state.publishingDrafts.findIndex((p) => p.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: 'Publishing draft not found.' });
      state.publishingDrafts[idx] = { ...state.publishingDrafts[idx], ...req.body };
      res.json(await writeReqWorkspace(req, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/publishing/:id/dispatch', async (req, res) => {
    try {
      const { state } = await readReqWorkspace(req);
      const draft = state.publishingDrafts.find((p) => p.id === req.params.id);
      if (!draft) return res.status(404).json({ error: 'Publishing draft not found.' });

      if (draft.approvalStatus !== 'approved') {
        return res.status(400).json({ error: 'Human approval is required before dispatching to publishing connectors.' });
      }

      const targetConnectorId = req.body?.targetConnectorId as string | undefined;
      const igConnector = state.integrations.find((i) => i.id === 'instagram_direct');
      const fbConnector = state.integrations.find((i) => i.id === 'facebook_direct');
      const httpNode = state.integrations.find((i) => i.id === 'n8n_http_node');
      const socialConnector = state.integrations.find((i) => i.id === 'social_graph_connector');
      const n8nConnector = state.integrations.find((i) => i.id === 'n8n_webhook');

      const chosenConnector =
        (targetConnectorId ? state.integrations.find((i) => i.id === targetConnectorId) : undefined) ||
        (draft.platform.toLowerCase().includes('instagram') && igConnector?.configured ? igConnector : undefined) ||
        (draft.platform.toLowerCase().includes('facebook') && fbConnector?.configured ? fbConnector : undefined) ||
        (httpNode?.configured ? httpNode : undefined) ||
        (socialConnector?.endpointUrl ? socialConnector : undefined) ||
        (n8nConnector?.endpointUrl ? n8nConnector : undefined);

      const reqOrigin = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;
      const captionFull = `${draft.caption}\n\n${draft.hashtags.join(' ')}`.trim();

      if (!chosenConnector || (!chosenConnector.endpointUrl && !chosenConnector.apiToken)) {
        draft.publishStatus = 'scheduled';
        draft.statusNote =
          'No Instagram/Facebook Token or n8n HTTP Node URL configured yet. Kept as Scheduled Draft (never falsely marked Published).';
        return res.json(await writeReqWorkspace(req, state));
      }

      if (chosenConnector.id === 'instagram_direct') {
        const igUserId = (chosenConnector.accountId || '').trim();
        const token = (chosenConnector.apiToken || '').trim();
        if (!igUserId || !token) {
          return res.status(400).json({
            error: 'Instagram Business Account ID and Meta Access Token are required in Publishing or Integrations.',
          });
        }
        const mediaBase = (chosenConnector.publicMediaBaseUrl || reqOrigin).replace(/\/+$/, '');
        const publicVideoUrl = `${mediaBase}${draft.videoUrl}`;
        if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(publicVideoUrl) && !chosenConnector.publicMediaBaseUrl) {
          draft.publishStatus = 'failed';
          draft.statusNote =
            'Instagram Graph API requires a public HTTPS video URL to fetch MP4 bytes. Open the Instagram Direct Connector drawer and set Public Media Base URL (or run via your *.run.app preview URL).';
          return res.json(await writeReqWorkspace(req, state));
        }

        const createUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(igUserId)}/media`;
        const createResp = await fetch(createUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            media_type: 'REELS',
            video_url: publicVideoUrl,
            caption: captionFull,
            access_token: token,
          }),
          signal: AbortSignal.timeout(15000),
        });
        const createData: any = await createResp.json().catch(() => ({}));
        if (!createResp.ok || !createData?.id) {
          draft.publishStatus = 'failed';
          draft.statusNote = `Instagram Graph API container error (HTTP ${createResp.status}): ${createData?.error?.message || JSON.stringify(createData).slice(0, 180)}`;
        } else {
          // Allow brief processing delay then publish container
          await new Promise((r) => setTimeout(r, 1500));
          const pubUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(igUserId)}/media_publish`;
          const pubResp = await fetch(pubUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              creation_id: createData.id,
              access_token: token,
            }),
            signal: AbortSignal.timeout(15000),
          });
          const pubData: any = await pubResp.json().catch(() => ({}));
          if (pubResp.ok && pubData?.id) {
            draft.publishStatus = 'published';
            draft.receiptId = String(pubData.id);
            draft.receiptConfirmedAt = new Date().toISOString();
            draft.statusNote = `Published to Instagram Reels via Graph API (Media ID: ${pubData.id}).`;
          } else {
            draft.publishStatus = 'scheduled';
            draft.receiptId = String(createData.id);
            draft.statusNote = `Instagram container created (${createData.id}); Graph publish status: ${pubData?.error?.message || `HTTP ${pubResp.status} (container still processing on Meta)`}.`;
          }
        }
      } else if (chosenConnector.id === 'facebook_direct') {
        const pageId = (chosenConnector.accountId || '').trim();
        const token = (chosenConnector.apiToken || '').trim();
        if (!pageId || !token) {
          return res.status(400).json({
            error: 'Facebook Page ID and Page Access Token are required in Publishing or Integrations.',
          });
        }
        const mediaBase = (chosenConnector.publicMediaBaseUrl || reqOrigin).replace(/\/+$/, '');
        const publicVideoUrl = `${mediaBase}${draft.videoUrl}`;
        const fbUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(pageId)}/videos`;
        const fbResp = await fetch(fbUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_url: publicVideoUrl,
            title: draft.videoTitle,
            description: captionFull,
            access_token: token,
          }),
          signal: AbortSignal.timeout(15000),
        });
        const fbData: any = await fbResp.json().catch(() => ({}));
        if (fbResp.ok && fbData?.id) {
          draft.publishStatus = 'published';
          draft.receiptId = String(fbData.id);
          draft.receiptConfirmedAt = new Date().toISOString();
          draft.statusNote = `Published to Facebook Page via Graph API (Video ID: ${fbData.id}).`;
        } else {
          draft.publishStatus = 'failed';
          draft.statusNote = `Facebook Graph API error (HTTP ${fbResp.status}): ${fbData?.error?.message || JSON.stringify(fbData).slice(0, 180)}`;
        }
      } else {
        // Configurable n8n HTTP Request Node / Custom Webhook Bridge
        const { url, headers, method } = buildHttpNodeRequestConfig(chosenConnector);
        if (!url) {
          draft.publishStatus = 'scheduled';
          draft.statusNote = 'HTTP Node Endpoint URL is blank. Saved as Scheduled Draft.';
          return res.json(await writeReqWorkspace(req, state));
        }

        const mediaBase = (chosenConnector.publicMediaBaseUrl || reqOrigin).replace(/\/+$/, '');
        const vars = {
          id: draft.id,
          title: draft.videoTitle,
          platform: draft.platform,
          videoUrl: `${mediaBase}${draft.videoUrl}`,
          thumbnailUrl: `${mediaBase}${draft.thumbnailUrl}`,
          caption: draft.caption,
          hashtags: draft.hashtags.join(' '),
          aspectRatio: draft.aspectRatio,
          scheduledFor: draft.scheduledFor,
        };
        const bodyStr =
          method === 'GET'
            ? undefined
            : chosenConnector.id === 'n8n_http_node'
              ? renderHttpNodePayload(chosenConnector.payloadTemplateJson, vars)
              : JSON.stringify({ ...draft, publicVideoUrl: vars.videoUrl });

        const resp = await fetch(url, {
          method,
          headers,
          body: bodyStr,
          signal: AbortSignal.timeout(12000),
        });
        const respPreview = (await resp.text().catch(() => '')).slice(0, 180);

        if (resp.ok) {
          const receipt = `http_${crypto.randomUUID().slice(0, 8)}`;
          draft.publishStatus = 'published';
          draft.receiptId = receipt;
          draft.receiptConfirmedAt = new Date().toISOString();
          draft.statusNote = `HTTP ${resp.status} confirmed via ${chosenConnector.name} (${receipt})${respPreview ? ` · ${respPreview}` : ''}.`;
        } else {
          draft.publishStatus = 'failed';
          draft.statusNote = `${chosenConnector.name} returned HTTP ${resp.status}: ${respPreview || 'request failed'}`;
        }

        state.automationJobs.unshift({
          id: `job_${crypto.randomUUID().slice(0, 8)}`,
          workflowName: `${chosenConnector.name} -> ${draft.platform}`,
          eventType: 'publish.ready',
          targetWebhookUrl: url,
          idempotencyKey: `idem_${crypto.randomUUID().slice(0, 10)}`,
          payloadSummary: `${method} · ${draft.videoTitle.slice(0, 50)}`,
          status: resp.ok ? 'succeeded' : 'failed',
          attempts: 1,
          maxAttempts: 3,
          signaturePreview: `auth=${chosenConnector.authType || 'bearer'}`,
          responseCode: resp.status,
          providerCostUsd: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          logs: [`[${new Date().toLocaleTimeString()}] ${method} ${url} -> HTTP ${resp.status}`],
        });
      }

      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || 'Creator',
        category: 'publishing',
        action: `Publishing ${draft.publishStatus}`,
        detail: `${draft.platform} · ${draft.videoTitle} (${chosenConnector.name})`,
      });

      res.json(await writeReqWorkspace(req, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Analytics factual logging
  app.post('/api/analytics/log', async (req, res) => {
    try {
      const { state } = await readReqWorkspace(req);
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

      res.json(await writeReqWorkspace(req, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Auto-connect all built-in $0.00 free voice, animation, FFmpeg & free-tier Gemini engines
  app.post('/api/integrations/auto-connect-free', async (req, res) => {
    try {
      const { state } = await readReqWorkspace(req);
      const now = new Date().toISOString();

      state.settings.defaultQualityTier = 'local_free';
      if (state.twin.personality.preferredVoiceProvider === 'elevenlabs_webhook') {
        state.twin.personality.preferredVoiceProvider = 'free_hindi_neural';
      }

      const freeIds = ['free_hindi_neural', 'free_canvas_animator', 'ffmpeg_local', 'gemini_intelligence'];
      let connectedCount = 0;
      for (const id of freeIds) {
        const conn = state.integrations.find((i) => i.id === id);
        if (!conn) continue;
        const ok =
          id === 'ffmpeg_local'
            ? state.capabilities.ffmpegAvailable
            : id === 'gemini_intelligence'
              ? state.capabilities.geminiConfigured
              : true;
        conn.configured = ok;
        conn.status = ok ? 'connected' : id === 'gemini_intelligence' ? 'unconfigured' : 'unreachable';
        conn.lastCheckedAt = now;
        conn.lastTestResult = {
          ok,
          message: ok
            ? `Auto-connected free $0.00 engine (${conn.name}).`
            : id === 'gemini_intelligence'
              ? 'GEMINI_API_KEY secret not set yet; Free Hindi Voice & Canvas Animator remain connected.'
              : 'FFmpeg binary not detected on host.',
          testedAt: now,
        };
        if (ok) connectedCount++;
      }

      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || 'Creator',
        category: 'security',
        action: 'Auto-Connected Free Engines ($0.00)',
        detail: `Verified ${connectedCount} built-in free engines and defaulted Video Studio to Local Free Cinema.`,
      });

      const saved = await writeReqWorkspace(req, state);
      res.json(saved);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to auto-connect free engines.' });
    }
  });

  // Integrations update & reachability / live API test
  app.put('/api/integrations/:id', async (req, res) => {
    try {
      const { state } = await readReqWorkspace(req);
      const item = state.integrations.find((i) => i.id === req.params.id);
      if (!item) return res.status(404).json({ error: 'Integration not found.' });

      if (typeof req.body.endpointUrl === 'string') {
        item.endpointUrl = req.body.endpointUrl.trim();
      }
      if (typeof req.body.httpMethod === 'string') {
        item.httpMethod = req.body.httpMethod as ConnectorHttpMethod;
      }
      if (typeof req.body.authType === 'string') {
        item.authType = req.body.authType as ConnectorAuthType;
      }
      if (typeof req.body.authHeaderName === 'string') {
        item.authHeaderName = req.body.authHeaderName.trim();
      }
      if (typeof req.body.apiToken === 'string') {
        item.apiToken = req.body.apiToken.trim();
      }
      if (typeof req.body.accountId === 'string') {
        item.accountId = req.body.accountId.trim();
      }
      if (typeof req.body.publicMediaBaseUrl === 'string') {
        item.publicMediaBaseUrl = req.body.publicMediaBaseUrl.trim();
      }
      if (typeof req.body.customHeadersJson === 'string') {
        item.customHeadersJson = req.body.customHeadersJson;
      }
      if (typeof req.body.payloadTemplateJson === 'string') {
        item.payloadTemplateJson = req.body.payloadTemplateJson;
      }

      if (item.nodeKind === 'instagram_graph' || item.nodeKind === 'facebook_graph') {
        item.configured = Boolean(item.accountId && item.apiToken);
      } else {
        item.configured = Boolean(item.endpointUrl);
      }
      item.status = item.configured ? 'connected' : 'unconfigured';
      item.lastCheckedAt = new Date().toISOString();

      appendAuditLog(state, {
        actor: state.twin.personality.creatorName || 'Creator',
        category: 'security',
        action: 'Integration Node Updated',
        detail: `${item.name} (${item.configured ? 'Configured' : 'Cleared'})`,
      });
      res.json(await writeReqWorkspace(req, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/integrations/:id/test', async (req, res) => {
    try {
      const { state } = await readReqWorkspace(req);
      const item = state.integrations.find((i) => i.id === req.params.id);
      if (!item) return res.status(404).json({ error: 'Integration not found.' });
      const now = new Date().toISOString();
      item.lastCheckedAt = now;

      if (item.id === 'gemini_intelligence') {
        item.status = state.capabilities.geminiConfigured ? 'connected' : 'unconfigured';
        item.lastTestResult = {
          ok: state.capabilities.geminiConfigured,
          message: state.capabilities.geminiConfigured
            ? 'Server-side GEMINI_API_KEY verified (Free-Tier quota protected).'
            : 'GEMINI_API_KEY missing in environment.',
          testedAt: now,
        };
      } else if (item.id === 'gemini_omni_veo') {
        const flagOn = isPaidVeoFlagEnabled();
        const ownerOk = isOwnerAuthorized(req);
        const stripeOn = isStripeConfigured();
        const usable = state.capabilities.geminiConfigured && flagOn && (ownerOk || stripeOn);
        item.status = !flagOn ? 'unconfigured' : usable ? 'connected' : 'reachable';
        item.lastTestResult = {
          ok: flagOn ? usable : true,
          message: !flagOn
            ? 'Server-Protected ($0.00 developer risk). Use Auto-Connected Free Cinema, connect your own Fal/Replicate/Runway/HeyGen token below, or Remix in AI Studio to use your own Gemini billing.'
            : ownerOk
              ? 'Paid Veo UNLOCKED for verified Developer Owner session.'
              : stripeOn
                ? 'Paid Veo active via Tester Credits ($0.00 developer liability).'
                : 'ALLOW_PAID_GEMINI_VEO=true requires server authorization before public testing.',
          testedAt: now,
        };
      } else if (item.id === 'ffmpeg_local') {
        item.status = state.capabilities.ffmpegAvailable ? 'connected' : 'unreachable';
        item.lastTestResult = {
          ok: state.capabilities.ffmpegAvailable,
          message: state.capabilities.ffmpegAvailable ? 'Local FFmpeg binary healthy.' : 'FFmpeg missing.',
          testedAt: now,
        };
      } else if (item.id === 'instagram_direct') {
        if (!item.accountId || !item.apiToken) {
          item.status = 'unconfigured';
          item.lastTestResult = {
            ok: false,
            message: 'Enter both IG Business Account ID and Meta Graph Access Token first.',
            testedAt: now,
          };
        } else {
          try {
            const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(item.accountId)}?fields=id,username,name&access_token=${encodeURIComponent(item.apiToken)}`;
            const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
            const bodyText = await resp.text();
            item.status = resp.ok ? 'connected' : 'unreachable';
            item.lastTestResult = {
              ok: resp.ok,
              statusCode: resp.status,
              message: resp.ok
                ? 'Instagram Graph Account verified & ready for Reels publishing.'
                : `Meta Graph API returned HTTP ${resp.status}`,
              responsePreview: bodyText.slice(0, 260),
              testedAt: now,
            };
          } catch (netErr: any) {
            item.status = 'unreachable';
            item.lastTestResult = {
              ok: false,
              message: netErr.message || 'Failed contacting Meta Graph API',
              testedAt: now,
            };
          }
        }
      } else if (item.id === 'facebook_direct') {
        if (!item.accountId || !item.apiToken) {
          item.status = 'unconfigured';
          item.lastTestResult = {
            ok: false,
            message: 'Enter both Facebook Page ID and Page Access Token first.',
            testedAt: now,
          };
        } else {
          try {
            const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(item.accountId)}?fields=id,name&access_token=${encodeURIComponent(item.apiToken)}`;
            const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
            const bodyText = await resp.text();
            item.status = resp.ok ? 'connected' : 'unreachable';
            item.lastTestResult = {
              ok: resp.ok,
              statusCode: resp.status,
              message: resp.ok
                ? 'Facebook Page Token verified & ready for video publishing.'
                : `Meta Graph API returned HTTP ${resp.status}`,
              responsePreview: bodyText.slice(0, 260),
              testedAt: now,
            };
          } catch (netErr: any) {
            item.status = 'unreachable';
            item.lastTestResult = {
              ok: false,
              message: netErr.message || 'Failed contacting Meta Graph API',
              testedAt: now,
            };
          }
        }
      } else if (!item.endpointUrl) {
        item.status = 'unconfigured';
        item.lastTestResult = {
          ok: false,
          message: 'No endpoint URL configured.',
          testedAt: now,
        };
      } else if (item.id === 'n8n_http_node' || item.nodeKind === 'http_node') {
        const { url, headers, method } = buildHttpNodeRequestConfig(item);
        const testVars = {
          id: 'test_draft_preview',
          title: 'TwinForge HTTP Node Connection Check',
          platform: 'Instagram Reels',
          videoUrl: 'https://example.com/demo.mp4',
          thumbnailUrl: 'https://example.com/thumb.jpg',
          caption: 'HTTP Node connectivity verification from TwinForge Studio',
          hashtags: '#TwinForge #Automation',
          aspectRatio: '9:16',
          scheduledFor: now.slice(0, 16),
        };
        const body =
          method === 'GET'
            ? undefined
            : renderHttpNodePayload(item.payloadTemplateJson, testVars);
        try {
          const resp = await fetch(url, {
            method,
            headers,
            body,
            signal: AbortSignal.timeout(8000),
          });
          const respText = await resp.text().catch(() => '');
          item.status = resp.ok ? 'connected' : resp.status < 500 ? 'reachable' : 'unreachable';
          item.lastTestResult = {
            ok: resp.ok,
            statusCode: resp.status,
            message: `${method} ${url} -> HTTP ${resp.status}`,
            responsePreview: respText.slice(0, 280),
            testedAt: now,
          };
        } catch (errNet: any) {
          item.status = 'unreachable';
          item.lastTestResult = {
            ok: false,
            message: `${method} request failed: ${errNet.message}`,
            testedAt: now,
          };
        }
      } else if (
        item.id === 'elevenlabs_webhook' ||
        item.id === 'liveportrait_heygen' ||
        item.id === 'custom_paid_video_webhook'
      ) {
        const { url, headers } = buildHttpNodeRequestConfig(item);
        const hasAuth =
          Boolean(item.apiToken?.trim()) ||
          Object.keys(headers).some((k) => k.toLowerCase() !== 'content-type');
        if (!hasAuth) {
          item.status = 'unconfigured';
          item.lastTestResult = {
            ok: false,
            message: 'Enter YOUR personal API token / Authorization header so your provider bills your account ($0.00 developer cost).',
            testedAt: now,
          };
        } else {
          try {
            const resp = await fetch(url, { method: 'HEAD', headers, signal: AbortSignal.timeout(6000) });
            item.status = resp.ok || resp.status < 500 ? 'connected' : 'unreachable';
            item.lastTestResult = {
              ok: resp.ok || resp.status < 500,
              statusCode: resp.status,
              message: `BYO Token + Endpoint checked (HTTP ${resp.status}). Calls will bill your own account.`,
              testedAt: now,
            };
          } catch (errNet: any) {
            item.status = 'unreachable';
            item.lastTestResult = {
              ok: false,
              message: errNet.message || 'Endpoint unreachable',
              testedAt: now,
            };
          }
        }
      } else {
        try {
          const resp = await fetch(item.endpointUrl, { method: 'HEAD', signal: AbortSignal.timeout(6000) });
          item.status = resp.ok || resp.status < 500 ? 'reachable' : 'unreachable';
          item.lastTestResult = {
            ok: resp.ok || resp.status < 500,
            statusCode: resp.status,
            message: `HEAD -> HTTP ${resp.status}`,
            testedAt: now,
          };
        } catch (errNet: any) {
          item.status = 'unreachable';
          item.lastTestResult = {
            ok: false,
            message: errNet.message || 'Endpoint unreachable',
            testedAt: now,
          };
        }
      }
      res.json(await writeReqWorkspace(req, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Settings, Full JSON Export & Live Reset
  app.put('/api/settings', async (req, res) => {
    try {
      const { state } = await readReqWorkspace(req);
      state.settings = { ...state.settings, ...req.body };
      res.json(await writeReqWorkspace(req, state));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/settings/export', async (req, res) => {
    try {
      const { mode, state } = await readReqWorkspace(req);
      res.setHeader('Content-Disposition', `attachment; filename="twinforge_${mode}_export.json"`);
      res.json(state);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/settings/reset-live', async (req, res) => {
    try {
      const sessionId = resolveSessionId(req);
      const fresh = await resetLiveWorkspace(sessionId);
      fresh.capabilities.billingProtection = await getBillingProtectionStatus({ req, sessionId });
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

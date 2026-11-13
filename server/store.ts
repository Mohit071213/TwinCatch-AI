import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  AuditLogEntry,
  IntegrationConnector,
  ProviderBenchmark,
  RssFeedSource,
  TwinProfile,
  TwinReadiness,
  WorkspaceMode,
  WorkspaceState,
} from '../src/types.ts';
import { isGeminiConfigured, synthesizeGeminiSpeechWav } from './gemini.ts';
import {
  MIN_VIDEO_DURATION_SEC,
  checkFfmpegAvailable,
  renderTwinVideoFFmpeg,
  synthesizeEdgeNeuralSpeechWav,
} from './media.ts';

export const DATA_ROOT = path.resolve(process.cwd(), 'data');
export const UPLOADS_DIR = path.join(DATA_ROOT, 'uploads');
export const AUDIO_DIR = path.join(DATA_ROOT, 'audio');
export const VIDEOS_DIR = path.join(DATA_ROOT, 'videos');
export const COVERS_DIR = path.join(DATA_ROOT, 'covers');
export const DEMO_ASSETS_DIR = path.join(DATA_ROOT, 'demo-assets');

const LIVE_DB_PATH = path.join(DATA_ROOT, 'live-workspace.json');
const DEMO_DB_PATH = path.join(DATA_ROOT, 'demo-workspace.json');

export function computeReadiness(twin: TwinProfile): TwinReadiness {
  const faceCats = new Set(twin.faceAssets.map((a) => a.category));
  const requiredFace = ['front', 'left_profile', 'right_profile', 'expression_talking'];
  const coveredFace = requiredFace.filter((c) => faceCats.has(c as any)).length;
  const extraFaceBonus = Math.min(20, Math.max(0, twin.faceAssets.length - coveredFace) * 5);
  const faceScore = Math.min(100, Math.round((coveredFace / requiredFace.length) * 80 + extraFaceBonus));

  const voiceCount = twin.voiceSamples.length;
  const verifiedVoice = twin.voiceSamples.filter((v) => v.verified).length;
  const voiceScore =
    voiceCount === 0
      ? 0
      : Math.min(100, Math.round(Math.min(voiceCount, 3) * 25 + Math.min(verifiedVoice, 2) * 12.5));

  const p = twin.personality;
  const filledPersonality = [
    p.creatorName,
    p.niche,
    p.speakingStyle,
    p.vocabularyNotes,
    p.accentAndPronunciation,
  ].filter((x) => x && x.trim().length > 2).length;
  const personalityScore = Math.round((filledPersonality / 5) * 100);

  const consentVerified = Boolean(twin.consent.attested && twin.consent.ownerFullName.trim().length > 1);

  const missingItems: string[] = [];
  if (!faceCats.has('front')) missingItems.push('Front-facing portrait');
  if (!faceCats.has('left_profile')) missingItems.push('Left profile portrait');
  if (!faceCats.has('right_profile')) missingItems.push('Right profile portrait');
  if (!faceCats.has('expression_talking')) missingItems.push('Talking expression frame');
  if (voiceCount === 0) missingItems.push('Clean voice sample (.wav/.mp3)');
  if (!consentVerified) missingItems.push('Signed biometric ownership consent');

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
    externalModelStatus: overallScore >= 70 && consentVerified ? 'local_ready' : 'not_trained',
  };
}

function defaultRssFeeds(): RssFeedSource[] {
  return [
    {
      id: 'rss_techcrunch_ai',
      name: 'TechCrunch AI',
      url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
      defaultCategory: 'Technology',
      enabled: true,
    },
    {
      id: 'rss_sciencedaily_top',
      name: 'ScienceDaily Top Science',
      url: 'https://www.sciencedaily.com/rss/top/science.xml',
      defaultCategory: 'Science',
      enabled: true,
    },
    {
      id: 'rss_smithsonian_smart',
      name: 'Smithsonian Smart News',
      url: 'https://www.smithsonianmag.com/rss/smart-news/',
      defaultCategory: 'Knowledge',
      enabled: true,
    },
    {
      id: 'rss_verge',
      name: 'The Verge',
      url: 'https://www.theverge.com/rss/index.xml',
      defaultCategory: 'Rising',
      enabled: true,
    },
    {
      id: 'rss_hn_front',
      name: 'Hacker News Frontpage',
      url: 'https://hnrss.org/frontpage?count=12',
      defaultCategory: 'Business',
      enabled: true,
    },
  ];
}

function defaultDemoOnlineIdeas(now = new Date().toISOString()) {
  return [
    {
      id: 'demo_idea_comedy',
      genre: 'Comedy' as const,
      language: 'Hinglish' as const,
      title: 'Corporate "Quick 5-Minute Sync" That Hijacks Your Entire Afternoon',
      hookIdea: 'Manager jab bole "just a quick 5-minute sync", samajh jaao lunch gaya.',
      viralTrigger: 'Instant workplace relatability across Indian tech & startup reels.',
      suggestedAngle:
        'Contrast the polite calendar invite with the 47-minute screen-share reality using crisp observational timing and a relatable punchline.',
      fetchedAt: now,
    },
    {
      id: 'demo_idea_science',
      genre: 'Science' as const,
      language: 'Hindi' as const,
      title: 'क्यों अंतरिक्ष में आंसू नीचे नहीं गिरते — और आंख पर तैरते रहते हैं',
      hookIdea: 'अगर आप स्पेस में रोएं, तो आपका एक भी आंसू गाल पर नहीं गिरेगा — जानिए क्यों।',
      viralTrigger: 'Visual physics curiosity gap that viewers instantly share and rewatch.',
      suggestedAngle:
        'Explain surface tension vs zero gravity in simple conversational Hindi with an everyday Earth kitchen analogy.',
      fetchedAt: now,
    },
    {
      id: 'demo_idea_knowledge',
      genre: 'Knowledge' as const,
      language: 'English' as const,
      title: 'Why Airports Put Mirrors Next to Baggage Claim Belts',
      hookIdea: 'Airports did not shorten baggage wait times — they hacked human psychology instead.',
      viralTrigger: 'Hidden everyday design secret viewers notice on their very next flight.',
      suggestedAngle:
        'Unpack the Houston airport walk-time experiment showing how occupied waiting feels twice as fast as idle waiting.',
      fetchedAt: now,
    },
  ];
}

function defaultIntegrations(geminiOk: boolean, ffmpegOk: boolean): IntegrationConnector[] {
  const kokoroUrl = process.env.KOKORO_TTS_URL || '';
  const piperUrl = process.env.PIPER_TTS_URL || '';
  const elevenKey = process.env.ELEVENLABS_API_KEY || '';
  const livePortraitUrl = process.env.LIVEPORTRAIT_URL || '';
  const heygenKey = process.env.HEYGEN_API_KEY || '';
  const n8nUrl = process.env.N8N_WEBHOOK_URL || '';

  return [
    {
      id: 'free_hindi_neural',
      name: 'Free Natural Hindi & Indian Neural Voice',
      category: 'Voice Engine',
      tier: 'local_free',
      description: 'Zero-cost neural speech engine for fluent Devanagari Hindi, conversational Hinglish, and Indian English voices (Madhur, Swara, Prabhat, Neerja).',
      configured: true,
      endpointUrl: 'free://neural-hindi-tts',
      status: 'connected',
      capabilities: ['$0.00 Free Tier', 'Natural Hindi & Hinglish', '4 Indian Neural Voices', '24kHz WAV Master'],
      supportsVoiceCloning: false,
      lastCheckedAt: new Date().toISOString(),
      notes: 'Active in $0.00 Free Tier for Persona Creation & Studio MP4 renders. Distinct from paid personal voice cloning.',
    },
    {
      id: 'gemini_intelligence',
      name: 'Gemini 4 Hydrogen & Speech',
      category: 'LLM Intelligence',
      tier: 'balanced',
      description: 'Server-side script generation (EN/HI/Hinglish), speech transcription, and expressive TTS voice auditions.',
      configured: geminiOk,
      endpointUrl: 'server://gemini-api',
      status: geminiOk ? 'connected' : 'unconfigured',
      capabilities: ['Multilingual Scripts', 'Voice Verification STT', 'WAV Voice Audition'],
      supportsVoiceCloning: false,
      lastCheckedAt: new Date().toISOString(),
      notes: geminiOk
        ? 'Active on server. Standard voice personas only — never mislabelled as personal voice cloning.'
        : 'Requires GEMINI_API_KEY environment secret.',
    },
    {
      id: 'free_canvas_animator',
      name: 'Free Live Motion & Expression Animator',
      category: 'Avatar & Lip-Sync',
      tier: 'local_free',
      description: 'Zero-cost 30fps multi-expression animator driving head sway, eye-blinks, speech-energy mouth crossfades, camera cuts, and kinetic captions.',
      configured: true,
      endpointUrl: 'browser://canvas-motion-director',
      status: 'connected',
      capabilities: ['$0.00 / Render', 'Speech-Energy Motion', 'Multi-Angle Cuts', 'Kinetic Captions'],
      supportsVoiceCloning: false,
      lastCheckedAt: new Date().toISOString(),
      notes: 'Runs 100% free in Studio and masters to H.264 MP4 via local FFmpeg.',
    },
    {
      id: 'ffmpeg_local',
      name: 'Free Multi-Scene FFmpeg Motion Director',
      category: 'Avatar & Lip-Sync',
      tier: 'local_free',
      description: 'Deterministic server-side 4-scene MP4 director with xfade transitions, camera pans, live audio waveform, beat badges, and timed captions.',
      configured: ffmpegOk,
      endpointUrl: 'local:///usr/bin/ffmpeg',
      status: ffmpegOk ? 'connected' : 'unreachable',
      capabilities: ['Multi-Shot xfade Cuts', 'Audio Waveform', '9:16 / 1:1 / 16:9 Render', 'Timed Subtitles'],
      supportsVoiceCloning: false,
      lastCheckedAt: new Date().toISOString(),
      notes: ffmpegOk ? 'Local FFmpeg binary verified on server.' : 'FFmpeg binary not detected.',
    },
    {
      id: 'free_hf_space',
      name: 'Free Hugging Face ZeroGPU Lip-Sync Space',
      category: 'Avatar & Lip-Sync',
      tier: 'local_free',
      description: 'Optional $0.00 community Gradio Space bridge (e.g. LivePortrait / SadTalker ZeroGPU Space) for neural facial animation.',
      configured: Boolean(process.env.HF_SPACE_URL),
      endpointUrl: process.env.HF_SPACE_URL || '',
      status: process.env.HF_SPACE_URL ? 'reachable' : 'unconfigured',
      capabilities: ['$0.00 ZeroGPU', 'Neural Lip Sync', 'Gradio API Bridge'],
      supportsVoiceCloning: false,
      lastCheckedAt: null,
      notes: 'Paste any public Hugging Face Gradio Space endpoint URL to run free cloud lip-sync when available.',
    },
    {
      id: 'gemini_omni_veo',
      name: 'Gemini Omni / Veo Video Generator',
      category: 'Avatar & Lip-Sync',
      tier: 'premium',
      description: 'Photorealistic image-to-video motion generation via Gemini Interactions API. Always gated by explicit cost approval.',
      configured: geminiOk,
      endpointUrl: 'server://gemini-omni-1.2-flash',
      status: geminiOk ? 'connected' : 'unconfigured',
      capabilities: ['720p Portrait Animation', 'Reference Image Conditioning', 'FFmpeg Post-Mastering'],
      supportsVoiceCloning: false,
      lastCheckedAt: new Date().toISOString(),
      notes: 'Requires paid-tier API key and per-job cost authorization in Video Studio.',
    },
    {
      id: 'kokoro_local',
      name: 'Local Kokoro / Piper TTS Worker',
      category: 'Voice Engine',
      tier: 'local_free',
      description: 'Zero-cost local neural TTS HTTP adapter for draft synthesis and offline experimentation.',
      configured: Boolean(kokoroUrl || piperUrl),
      endpointUrl: kokoroUrl || piperUrl || '',
      status: kokoroUrl || piperUrl ? 'reachable' : 'unconfigured',
      capabilities: ['Zero API Cost', 'Fast Draft Speech'],
      supportsVoiceCloning: false,
      lastCheckedAt: null,
      notes: 'Optional zero-cost fallback. Configure your local Kokoro or Piper HTTP endpoint URL to enable.',
    },
    {
      id: 'elevenlabs_webhook',
      name: 'ElevenLabs Personal Voice Clone',
      category: 'Voice Engine',
      tier: 'premium',
      description: 'Authorized personal voice cloning connector for Hindi, Hinglish, and English emotional inflection.',
      configured: Boolean(elevenKey),
      endpointUrl: process.env.ELEVENLABS_WEBHOOK_URL || '',
      status: elevenKey ? 'connected' : 'unconfigured',
      capabilities: ['Cloned Voice Identity', 'Multilingual Pronunciation', 'Emotion Controls'],
      supportsVoiceCloning: true,
      lastCheckedAt: null,
      notes: 'Never substituted silently. Must be explicitly configured and authorized.',
    },
    {
      id: 'liveportrait_heygen',
      name: 'LivePortrait / HeyGen Lip-Sync Worker',
      category: 'Avatar & Lip-Sync',
      tier: 'premium',
      description: 'Dedicated facial expression driving and audio-driven lip-synchronization worker webhook.',
      configured: Boolean(livePortraitUrl || heygenKey),
      endpointUrl: livePortraitUrl || '',
      status: livePortraitUrl || heygenKey ? 'connected' : 'unconfigured',
      capabilities: ['Neural Lip Sync', 'Natural Eye Blinking', 'Head Motion Driving'],
      supportsVoiceCloning: false,
      lastCheckedAt: null,
      notes: 'Connect a remote LivePortrait GPU endpoint or HeyGen webhook URL.',
    },
    {
      id: 'n8n_webhook',
      name: 'n8n Workflow Orchestrator',
      category: 'Automation',
      tier: 'balanced',
      description: 'HMAC-SHA256 signed webhook dispatch and callback receiver for automated multi-step publishing.',
      configured: Boolean(n8nUrl),
      endpointUrl: n8nUrl,
      status: n8nUrl ? 'connected' : 'unconfigured',
      capabilities: ['Idempotent Job Dispatch', 'Retry Backoff', 'Execution Audit Logs'],
      supportsVoiceCloning: false,
      lastCheckedAt: null,
      notes: 'Configure any webhook URL (e.g., your n8n production trigger) to dispatch live workflow events.',
    },
    {
      id: 'social_graph_connector',
      name: 'Instagram / TikTok / Facebook Publisher',
      category: 'Social Publishing',
      tier: 'balanced',
      description: 'External publishing webhook bridge. Items remain Draft/Scheduled until a delivery receipt is confirmed.',
      configured: false,
      endpointUrl: '',
      status: 'unconfigured',
      capabilities: ['Reels / TikTok Prep', 'Cover Frame Export', 'Confirmed Receipt Tracking'],
      supportsVoiceCloning: false,
      lastCheckedAt: null,
      notes: 'Connect an authorized social publishing webhook to execute live post deliveries.',
    },
  ];
}

function defaultBenchmarks(): ProviderBenchmark[] {
  return [
    {
      id: 'bm_free_hindi_neural',
      providerId: 'free_hindi_neural',
      providerName: 'Free Natural Hindi / Indian Neural Voice ($0.00)',
      category: 'voice',
      tier: 'local_free',
      referenceImageLabel: 'N/A (Audio Only)',
      voiceSampleLabel: 'Hindi / Hinglish Persona Reference',
      scriptExcerpt: 'नमस्ते, मैं आपका डिजिटल ट्विन हूँ। आज हम तीस सेकंड की एक साफ रील तैयार करेंगे।',
      verified: false,
      processingMs: null,
      resolutionOrSampleRate: '24kHz Mono WAV',
      estimatedCostPerMinUsd: 0,
      metrics: {
        faceSimilarity: null,
        voiceSimilarity: null,
        lipSync: null,
        naturalExpressions: null,
        renderingQuality: null,
      },
      notes: 'Zero-cost Hindi & Hinglish neural voice engine (hi-IN-MadhurNeural / hi-IN-SwaraNeural). Run benchmark to audition real synthesis latency.',
      benchmarkedAt: null,
    },
    {
      id: 'bm_ffmpeg_local',
      providerId: 'ffmpeg_local',
      providerName: 'Local FFmpeg Portrait Assembly',
      category: 'video',
      tier: 'local_free',
      referenceImageLabel: 'Creator Front Studio Portrait',
      voiceSampleLabel: 'Studio Speech Sample',
      scriptExcerpt: 'Short-form 9:16 editorial hook with burned-in captions.',
      verified: false,
      processingMs: null,
      resolutionOrSampleRate: '720x1280 H.264',
      estimatedCostPerMinUsd: 0,
      metrics: {
        faceSimilarity: null,
        voiceSimilarity: null,
        lipSync: null,
        naturalExpressions: null,
        renderingQuality: null,
      },
      notes: 'Run benchmark to measure actual local FFmpeg processing latency and inspect playable MP4 output.',
      benchmarkedAt: null,
    },
    {
      id: 'bm_gemini_lite_tts',
      providerId: 'gemini_lite_tts',
      providerName: 'Gemini 3.8 Flash Lite TTS',
      category: 'voice',
      tier: 'balanced',
      referenceImageLabel: 'N/A (Audio Only)',
      voiceSampleLabel: 'Creator Reference Voice',
      scriptExcerpt: 'Three-second creator hook audition.',
      verified: false,
      processingMs: null,
      resolutionOrSampleRate: '24kHz Mono WAV',
      estimatedCostPerMinUsd: 0.015,
      metrics: {
        faceSimilarity: null,
        voiceSimilarity: null,
        lipSync: null,
        naturalExpressions: null,
        renderingQuality: null,
      },
      notes: 'Standard studio voice (not personal voice clone). Run benchmark to audition real latency and output.',
      benchmarkedAt: null,
    },
    {
      id: 'bm_gemini_flash_tts',
      providerId: 'gemini_flash_tts',
      providerName: 'Gemini 3.8 Flash TTS (Expressive)',
      category: 'voice',
      tier: 'balanced',
      referenceImageLabel: 'N/A (Audio Only)',
      voiceSampleLabel: 'Creator Reference Voice',
      scriptExcerpt: 'Conversational bilingual Hinglish/English hook.',
      verified: false,
      processingMs: null,
      resolutionOrSampleRate: '24kHz Mono WAV',
      estimatedCostPerMinUsd: 0.03,
      metrics: {
        faceSimilarity: null,
        voiceSimilarity: null,
        lipSync: null,
        naturalExpressions: null,
        renderingQuality: null,
      },
      notes: 'Higher prosody fidelity than Lite TTS. Run benchmark to preview side-by-side.',
      benchmarkedAt: null,
    },
    {
      id: 'bm_elevenlabs_clone',
      providerId: 'elevenlabs_webhook',
      providerName: 'ElevenLabs Personal Voice Clone',
      category: 'voice',
      tier: 'premium',
      referenceImageLabel: 'N/A (Audio Only)',
      voiceSampleLabel: 'Authorized Personal Clone',
      scriptExcerpt: 'Multilingual conversational clone test.',
      verified: false,
      processingMs: null,
      resolutionOrSampleRate: '44.1kHz MP3/WAV',
      estimatedCostPerMinUsd: 0.18,
      metrics: {
        faceSimilarity: null,
        voiceSimilarity: null,
        lipSync: null,
        naturalExpressions: null,
        renderingQuality: null,
      },
      notes: 'External connector unconfigured. Configure endpoint in Integrations to run verified benchmark.',
      benchmarkedAt: null,
    },
    {
      id: 'bm_gemini_omni_veo',
      providerId: 'gemini_omni_veo',
      providerName: 'Gemini Omni / Veo + FFmpeg Master',
      category: 'video',
      tier: 'premium',
      referenceImageLabel: 'Creator Front Studio Portrait',
      voiceSampleLabel: 'Expressive TTS Track',
      scriptExcerpt: 'Photorealistic animated presenter clip.',
      verified: false,
      processingMs: null,
      resolutionOrSampleRate: '720p MP4 + AAC',
      estimatedCostPerMinUsd: 0.45,
      metrics: {
        faceSimilarity: null,
        voiceSimilarity: null,
        lipSync: null,
        naturalExpressions: null,
        renderingQuality: null,
      },
      notes: 'Paid tier model. Requires explicit cost approval to run side-by-side benchmark.',
      benchmarkedAt: null,
    },
  ];
}

function createInitialLiveState(geminiOk: boolean, ffmpegOk: boolean): WorkspaceState {
  const twin: TwinProfile = {
    faceAssets: [],
    voiceSamples: [],
    personality: {
      creatorName: '',
      handle: '',
      niche: 'Technology, Creator Systems & Practical AI',
      speakingStyle: 'Direct, thoughtful, grounded in practical real-world examples.',
      vocabularyNotes: 'Clear modern editorial language without hype buzzwords.',
      humourStyle: 'Dry understated wit',
      formalityLevel: 'Conversational Editorial',
      accentAndPronunciation: 'Natural Indian-English & crisp Hinglish cadence',
      catchphrases: [],
      primaryLanguage: 'Hindi',
      preferredVoiceProvider: 'free_hindi_neural',
      preferredVoiceId: 'hi-IN-MadhurNeural',
    },
    consent: {
      attested: false,
      ownerFullName: '',
      attestedAt: null,
      likenessUsageScope: 'Personal content creation owned by the verified creator only.',
      requireAiDisclosure: true,
    },
    readiness: {
      overallScore: 0,
      faceScore: 0,
      voiceScore: 0,
      personalityScore: 0,
      consentVerified: false,
      missingItems: [
        'Front-facing portrait',
        'Left profile portrait',
        'Right profile portrait',
        'Talking expression frame',
        'Clean voice sample (.wav/.mp3)',
        'Signed biometric ownership consent',
      ],
      externalModelStatus: 'not_trained',
    },
  };
  twin.readiness = computeReadiness(twin);

  return {
    mode: 'live',
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
        id: 'audit_init',
        timestamp: new Date().toISOString(),
        actor: 'System',
        category: 'security',
        action: 'Live Workspace Initialized',
        detail: 'Clean single-creator workspace created with strict zero-fabrication defaults.',
      },
    ],
    settings: {
      monthlyBudgetCapUsd: 25,
      currentMonthSpendUsd: 0,
      requireExplicitPaidApproval: true,
      defaultQualityTier: 'balanced',
      aiDisclosureDefault: true,
      watermarkText: 'AI DIGITAL TWIN · AUTHORIZED LIKENESS',
      sessionLockEnabled: false,
      creatorEmail: 'Samymehra071213@gmail.com',
      rssFeeds: defaultRssFeeds(),
    },
    capabilities: {
      geminiConfigured: geminiOk,
      ffmpegAvailable: ffmpegOk,
    },
  };
}

function createInitialDemoState(geminiOk: boolean, ffmpegOk: boolean): WorkspaceState {
  const now = new Date().toISOString();
  const twin: TwinProfile = {
    faceAssets: [
      {
        id: 'demo_face_front',
        category: 'front',
        label: 'Studio Front Portrait (Neutral)',
        url: '/api/media/demo/twin_portrait_front.jpg',
        mimeType: 'image/jpeg',
        filename: 'twin_portrait_front.jpg',
        sizeBytes: 342800,
        uploadedAt: now,
      },
      {
        id: 'demo_face_talking',
        category: 'expression_talking',
        label: 'Three-Quarter Talking Expression',
        url: '/api/media/demo/twin_portrait_talking.jpg',
        mimeType: 'image/jpeg',
        filename: 'twin_portrait_talking.jpg',
        sizeBytes: 318400,
        uploadedAt: now,
      },
      {
        id: 'demo_face_left',
        category: 'left_profile',
        label: 'Studio Banner / Framing Reference',
        url: '/api/media/demo/studio_editorial_banner.jpg',
        mimeType: 'image/jpeg',
        filename: 'studio_editorial_banner.jpg',
        sizeBytes: 412000,
        uploadedAt: now,
      },
    ],
    voiceSamples: [
      {
        id: 'demo_voice_en',
        label: 'Studio Intro — Warm Editorial',
        language: 'English',
        emotion: 'Conversational',
        url: '',
        mimeType: 'audio/wav',
        filename: 'demo_en_editorial_sample.wav',
        sizeBytes: 482000,
        durationSec: 14,
        transcript: 'Most creators waste six hours filming a forty-second reel when the real bottleneck is clarity of thought.',
        verified: true,
        uploadedAt: now,
      },
      {
        id: 'demo_voice_hinglish',
        label: 'Hinglish Conversational Cadence',
        language: 'Hinglish',
        emotion: 'Warm',
        url: '',
        mimeType: 'audio/wav',
        filename: 'demo_hinglish_sample.wav',
        sizeBytes: 394000,
        durationSec: 11,
        transcript: 'Dekho, AI tab kaam aata hai jab woh aapki apni awaaz aur soch ko amplify kare, replace nahi.',
        verified: true,
        uploadedAt: now,
      },
    ],
    personality: {
      creatorName: 'Aarav Mehta',
      handle: '@aarav.studio',
      niche: 'Applied AI Systems, Creator Economics & Product Craft',
      speakingStyle: 'Calm, structured storytelling with sharp 3-second opening hooks and zero fluff.',
      vocabularyNotes: 'Concise, grounded terminology; avoids generic AI hype words.',
      humourStyle: 'Subtle observational wit',
      formalityLevel: 'Conversational Editorial',
      accentAndPronunciation: 'Natural Indian-English & crisp conversational Hinglish',
      catchphrases: ['Let us break the signal from the noise.', 'Seedha point pe aate hain.'],
      primaryLanguage: 'Hinglish',
      preferredVoiceProvider: 'free_hindi_neural',
      preferredVoiceId: 'hi-IN-MadhurNeural',
    },
    consent: {
      attested: true,
      ownerFullName: 'Aarav Mehta (Demo Creator Profile)',
      attestedAt: now,
      likenessUsageScope: 'Demo Showcase Profile — Authorized synthetic studio demonstration.',
      requireAiDisclosure: true,
    },
    readiness: {
      overallScore: 84,
      faceScore: 75,
      voiceScore: 75,
      personalityScore: 100,
      consentVerified: true,
      missingItems: ['Right profile portrait'],
      externalModelStatus: 'local_ready',
    },
  };
  twin.readiness = computeReadiness(twin);

  return {
    mode: 'demo',
    twin,
    trends: [
      {
        id: 'demo_trend_1',
        topic: 'Why Small Creators Are Replacing 4-Hour Filming Days With Script-First AI Workflows',
        platform: 'RSS / News',
        category: 'Rising',
        sourceUrl: 'https://techcrunch.com/category/artificial-intelligence/',
        sourceName: 'TechCrunch Creator Dispatch',
        sourceType: 'curated',
        discoveredAt: now,
        summary: 'Independent founders and educators are shifting production time from camera setup to tight editorial research and multilingual distribution.',
        metrics: {
          available: false,
          note: 'Source RSS feed does not expose social engagement counts',
        },
        relevanceScore: 94,
        opportunityScore: 91,
      },
      {
        id: 'demo_trend_2',
        topic: 'Hinglish Tech Explainers Outperforming Pure English Reels Across Tier-1 & Tier-2 India',
        platform: 'Instagram',
        category: 'Viral',
        sourceUrl: 'https://instagram.com',
        sourceName: 'Manual Creator Benchmark Import',
        sourceType: 'manual',
        discoveredAt: now,
        summary: 'Conversational bilingual hooks within the first 2.5 seconds show stronger completion curves for technical tutorials.',
        metrics: {
          available: true,
          views: '184K (logged)',
          engagementRate: '6.8%',
          note: 'Creator-imported public post observation',
        },
        relevanceScore: 96,
        opportunityScore: 95,
      },
      {
        id: 'demo_trend_3',
        topic: 'Mandatory AI Likeness Provenance & Watermarking Standards for Brand Partnerships',
        platform: 'RSS / News',
        category: 'Business',
        sourceUrl: 'https://www.theverge.com/',
        sourceName: 'The Verge Media Policy',
        sourceType: 'curated',
        discoveredAt: now,
        summary: 'Agencies increasingly require cryptographic consent provenance and clear synthetic disclosure before approving twin campaigns.',
        metrics: {
          available: false,
          note: 'Unavailable from publisher feed',
        },
        relevanceScore: 88,
        opportunityScore: 85,
      },
    ],
    onlineIdeas: defaultDemoOnlineIdeas(now),
    scripts: [
      {
        id: 'demo_script_1',
        trendId: 'demo_trend_2',
        trendTopic: 'Hinglish Tech Explainers Outperforming Pure English Reels',
        language: 'Hinglish',
        recommendedFormat: 'Talking-Head',
        thesis: 'Creators lose retention not from bad cameras, but from speaking in textbook English instead of how founders actually think and talk.',
        audiencePainPoint: 'Spending weekends recording 12 retakes that still get scrolled past in 2 seconds.',
        ctaStrategy: 'Ask viewers to comment "SCRIPT" or share whether they prefer Hinglish breakdowns.',
        selectedVariantId: 'demo_var_1',
        approvalStatus: 'approved',
        createdAt: now,
        updatedAt: now,
        variants: [
          {
            id: 'demo_var_1',
            toneName: 'Natural & Conversational',
            hook3s: 'Seedha point pe aate hain — aapki reel log 2 second mein scroll kyun karte hain?',
            body: 'Aap lighting aur camera upgrade karte rehte ho, lekin audience ko chahiye clarity unki apni bhasha mein. Jab aap complex AI workflow ko simple Hinglish mein break down karte ho, retention turant upar jaata hai.',
            cta: 'Batayein comments mein: aapka next explainer English mein chahiye ya Hinglish mein?',
            wordCount: 74,
            estimatedDurationSec: 32,
          },
          {
            id: 'demo_var_2',
            toneName: 'Educational & Authoritative',
            hook3s: 'Three structural shifts driving higher retention on bilingual tech reels in 2026.',
            body: 'First, anchor your opening three seconds in a concrete operational problem. Second, match vocabulary to everyday founder conversation rather than formal documentation. Third, deliver a structured 30-second breakdown with visual pacing and clear spoken cadence.',
            cta: 'Save this framework before recording your next batch.',
            wordCount: 54,
            estimatedDurationSec: 30,
          },
          {
            id: 'demo_var_3',
            toneName: 'Entertaining & Engaging',
            hook3s: 'Maine 4 ghante ki lighting setup chhod di — aur output double ho gaya.',
            body: 'Sach bolun toh pehle har video ke liye tripod, mic, aur 18 retakes lagte the. Ab focus sirf sharp writing aur clean digital twin delivery pe hai jahan ek 30-second explainer bina retake ke publish hota hai.',
            cta: 'Follow karein agar aap bhi creator burnout se nikalna chahte hain.',
            wordCount: 52,
            estimatedDurationSec: 30,
          },
        ],
      },
    ],
    auditions: [],
    videos: [
      {
        id: 'demo_video_1',
        title: 'Hinglish & Hindi Retention Blueprint — Studio Reel',
        scriptId: 'demo_script_1',
        trendTopic: 'Hinglish Tech Explainers Outperforming Pure English Reels',
        qualityTier: 'local_free',
        voiceProvider: 'free_hindi_neural',
        voiceIdentity: 'hi-IN-MadhurNeural',
        visualProvider: 'ffmpeg_local',
        aspectRatio: '9:16',
        format: 'Talking-Head',
        language: 'Hindi',
        emotion: 'Warm & Editorial',
        framing: 'Close-Up Studio',
        backgroundStyle: 'Studio Ivory Linen',
        wardrobeNote: 'Charcoal wool blazer & ivory knit',
        speakingSpeed: 1.0,
        voiceIntensity: 'Balanced',
        subtitlesEnabled: true,
        aiDisclosureWatermark: true,
        estimatedCostUsd: 0,
        actualCostUsd: 0,
        approvedPaidCharge: false,
        durationSec: 32,
        processingMs: 4200,
        status: 'completed',
        reviewStatus: 'approved',
        videoUrl: '/api/media/videos/demo_reel_portrait.mp4',
        thumbnailUrl: '/api/media/covers/demo_reel_portrait.jpg',
        provenanceNote: 'Free Hindi Neural Voice (Madhur) + 6-Shot FFmpeg Motion Director ($0.00)',
        createdAt: now,
      },
      {
        id: 'demo_video_2',
        title: 'Consent-First Digital Twin Standards',
        trendTopic: 'Mandatory AI Likeness Provenance & Watermarking Standards',
        qualityTier: 'local_free',
        voiceProvider: 'free_hindi_neural',
        voiceIdentity: 'en-IN-PrabhatNeural',
        visualProvider: 'ffmpeg_local',
        aspectRatio: '16:9',
        format: 'Presenter-Style',
        language: 'English',
        emotion: 'Authoritative',
        framing: 'Medium Editorial',
        backgroundStyle: 'Warm Charcoal',
        wardrobeNote: 'Charcoal wool blazer & ivory knit',
        speakingSpeed: 1.0,
        voiceIntensity: 'Measured',
        subtitlesEnabled: true,
        aiDisclosureWatermark: true,
        estimatedCostUsd: 0,
        actualCostUsd: 0,
        approvedPaidCharge: false,
        durationSec: 32,
        processingMs: 3900,
        status: 'completed',
        reviewStatus: 'pending',
        videoUrl: '/api/media/videos/demo_presenter_wide.mp4',
        thumbnailUrl: '/api/media/covers/demo_presenter_wide.jpg',
        provenanceNote: 'Free Indian Neural Voice (Prabhat) + 6-Shot FFmpeg Motion Director ($0.00)',
        createdAt: now,
      },
    ],
    benchmarks: defaultBenchmarks(),
    automationJobs: [
      {
        id: 'job_demo_9014',
        workflowName: 'Twin Render -> Instagram Reels Draft Queue',
        eventType: 'render.completed',
        targetWebhookUrl: 'https://n8n.example.internal/webhook/twinforge-reels',
        idempotencyKey: 'idem_demo_9014',
        payloadSummary: 'video=demo_video_1 · aspect=9:16 · disclosure=true',
        status: 'succeeded',
        attempts: 1,
        maxAttempts: 3,
        signaturePreview: 'sha256=9f82c1...e4b1',
        responseCode: 200,
        providerCostUsd: 0.02,
        createdAt: now,
        updatedAt: now,
        logs: [
          '[21:00:02] Prepared signed webhook payload (HMAC-SHA256)',
          '[21:00:03] Demo simulation receipt acknowledged (HTTP 200)',
        ],
      },
    ],
    publishingDrafts: [
      {
        id: 'pub_demo_1',
        videoId: 'demo_video_1',
        videoTitle: 'Hinglish Retention Blueprint — Studio Reel',
        thumbnailUrl: '/api/media/covers/demo_reel_portrait.jpg',
        videoUrl: '/api/media/videos/demo_reel_portrait.mp4',
        aspectRatio: '9:16',
        platform: 'Instagram Reels',
        caption: 'Seedha point pe aate hain: retention camera se nahi, clarity se aata hai. Built with my authorized digital twin.',
        hashtags: ['#CreatorEconomy', '#HinglishTech', '#DigitalTwin', '#ContentSystems'],
        scheduledFor: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
        approvalStatus: 'awaiting_approval',
        publishStatus: 'draft',
        statusNote: 'Awaiting creator sign-off before external webhook dispatch.',
      },
    ],
    analytics: [
      {
        id: 'an_demo_1',
        videoId: 'demo_video_1',
        title: 'Hinglish Retention Blueprint — Studio Reel',
        platform: 'Instagram Reels',
        format: 'Talking-Head',
        language: 'Hinglish',
        hookType: 'Direct Hinglish Question (2.5s)',
        aspectRatio: '9:16',
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
        loggedAt: now,
      },
      {
        id: 'an_demo_2',
        videoId: 'demo_video_2',
        title: 'Consent-First Digital Twin Standards',
        platform: 'Facebook Reels',
        format: 'Presenter-Style',
        language: 'English',
        hookType: 'Policy Contrarian Statement',
        aspectRatio: '16:9',
        views: 5410,
        reach: 4680,
        avgWatchSec: 15.1,
        retentionPct: 54.0,
        shares: 84,
        comments: 31,
        saves: 122,
        followerDelta: 48,
        engagementRate: 4.3,
        productionCostUsd: 0.0,
        loggedAt: now,
      },
    ],
    integrations: defaultIntegrations(geminiOk, ffmpegOk),
    auditLogs: [
      {
        id: 'demo_audit_1',
        timestamp: now,
        actor: 'Aarav Mehta (Demo)',
        category: 'consent',
        action: 'Demo Biometric Consent Active',
        detail: 'Demo showcase workspace active. Switch to Live Mode at top bar to work with your real assets.',
      },
    ],
    settings: {
      monthlyBudgetCapUsd: 25,
      currentMonthSpendUsd: 0.02,
      requireExplicitPaidApproval: true,
      defaultQualityTier: 'balanced',
      aiDisclosureDefault: true,
      watermarkText: 'AI DIGITAL TWIN · AUTHORIZED LIKENESS',
      sessionLockEnabled: false,
      creatorEmail: 'Samymehra071213@gmail.com',
      rssFeeds: defaultRssFeeds(),
    },
    capabilities: {
      geminiConfigured: geminiOk,
      ffmpegAvailable: ffmpegOk,
    },
  };
}

async function copyDemoImagesIfNeeded(): Promise<void> {
  await fs.mkdir(DEMO_ASSETS_DIR, { recursive: true });
  const imgDir = path.resolve(process.cwd(), 'src', 'assets', 'images');
  try {
    const files = await fs.readdir(imgDir);
    const frontFile = files.find((f) => f.startsWith('twin_portrait_front'));
    const talkFile = files.find((f) => f.startsWith('twin_portrait_talking'));
    const bannerFile = files.find((f) => f.startsWith('studio_editorial_banner'));

    if (frontFile) {
      await fs.copyFile(path.join(imgDir, frontFile), path.join(DEMO_ASSETS_DIR, 'twin_portrait_front.jpg'));
    }
    if (talkFile) {
      await fs.copyFile(path.join(imgDir, talkFile), path.join(DEMO_ASSETS_DIR, 'twin_portrait_talking.jpg'));
    }
    if (bannerFile) {
      await fs.copyFile(path.join(imgDir, bannerFile), path.join(DEMO_ASSETS_DIR, 'studio_editorial_banner.jpg'));
    }
  } catch {
    // Non-fatal if source directory doesn't exist
  }
}

export async function ensureInitialized(): Promise<void> {
  await Promise.all([
    fs.mkdir(DATA_ROOT, { recursive: true }),
    fs.mkdir(UPLOADS_DIR, { recursive: true }),
    fs.mkdir(AUDIO_DIR, { recursive: true }),
    fs.mkdir(VIDEOS_DIR, { recursive: true }),
    fs.mkdir(COVERS_DIR, { recursive: true }),
    copyDemoImagesIfNeeded(),
  ]);

  const geminiOk = isGeminiConfigured();
  const ffmpegOk = await checkFfmpegAvailable();

  try {
    await fs.access(LIVE_DB_PATH);
  } catch {
    await fs.writeFile(LIVE_DB_PATH, JSON.stringify(createInitialLiveState(geminiOk, ffmpegOk), null, 2));
  }

  try {
    await fs.access(DEMO_DB_PATH);
  } catch {
    await fs.writeFile(DEMO_DB_PATH, JSON.stringify(createInitialDemoState(geminiOk, ffmpegOk), null, 2));
  }

  // Background pre-render of demo MP4 reels so Demo Mode has genuinely playable H.264 MP4 files
  if (ffmpegOk) {
    void preRenderDemoVideos();
  }
}

async function preRenderDemoVideos(): Promise<void> {
  const portraitFront = path.join(DEMO_ASSETS_DIR, 'twin_portrait_front.jpg');
  const portraitTalking = path.join(DEMO_ASSETS_DIR, 'twin_portrait_talking.jpg');
  const studioBanner = path.join(DEMO_ASSETS_DIR, 'studio_editorial_banner.jpg');
  const reelOut = path.join(VIDEOS_DIR, 'demo_reel_portrait.mp4');
  const reelThumb = path.join(COVERS_DIR, 'demo_reel_portrait.jpg');
  const wideOut = path.join(VIDEOS_DIR, 'demo_presenter_wide.mp4');
  const wideThumb = path.join(COVERS_DIR, 'demo_presenter_wide.jpg');
  const markerPath = path.join(VIDEOS_DIR, '.demo_v3_hindi_30s');

  try {
    await fs.access(markerPath);
    await fs.access(reelOut);
    await fs.access(wideOut);
    return;
  } catch {
    // Re-render upgraded >=30s multi-scene dynamic demo videos with natural Hindi & Indian English speech
  }

  const sceneImages = [portraitFront, portraitTalking, studioBanner];
  let reelDuration = MIN_VIDEO_DURATION_SEC;
  let wideDuration = MIN_VIDEO_DURATION_SEC;
  let reelSpoken = false;
  let wideSpoken = false;

  const hindiReelScript =
    'सीधे पॉइंट पर आते हैं। आपकी रील लोग दो सेकंड में स्क्रॉल क्यों कर देते हैं? ज़्यादातर क्रिएटर्स महंगे कैमरे और लाइटिंग सेटअप पर घंटों खर्च करते हैं, लेकिन असली फर्क साफ़ विचार और प्राकृतिक हिंदी स्टोरीटेलिंग से पड़ता है। जब आपका डिजिटल ट्विन आपकी अपनी शैली, सही विराम और स्पष्ट उच्चारण के साथ कम से कम तीस सेकंड तक एक ठोस आइडिया समझाता है, तो दर्शक अंत तक जुड़े रहते हैं।';

  const wideEnglishScript =
    'Every creator digital twin should begin with verified biometric consent, transparent provenance watermarking, and genuine editorial perspective. Instead of burning hours on repetitive camera setups, structured thirty-second explainers combine multi-angle motion choreography, synchronized audio waveforms, and multilingual accessibility while keeping cost and quality transparent.';

  try {
    await fs.access(portraitFront);
    let reelAudioPath: string | undefined;
    try {
      const wavPath = path.join(AUDIO_DIR, 'demo_reel_voice.wav');
      await synthesizeEdgeNeuralSpeechWav({
        text: hindiReelScript,
        voiceIdentity: 'hi-IN-MadhurNeural',
        language: 'Hindi',
        outputWavPath: wavPath,
      });
      reelAudioPath = wavPath;
      reelSpoken = true;
    } catch {
      if (isGeminiConfigured()) {
        try {
          const wavPath = path.join(AUDIO_DIR, 'demo_reel_voice.wav');
          await synthesizeGeminiSpeechWav({
            text: 'Seedha point pe aate hain. Aapki reel log do second mein scroll kyun karte hain? Kyunki camera se zyada clarity aur natural Hinglish storytelling matter karti hai. Kam se kam tees second tak ek clear idea deliver karein.',
            provider: 'gemini_lite_tts',
            voiceIdentity: 'Charon',
            language: 'Hinglish',
            emotion: 'Conversational Editorial',
            outputWavPath: wavPath,
          });
          reelAudioPath = wavPath;
          reelSpoken = true;
        } catch {
          reelAudioPath = undefined;
        }
      }
    }

    const res1 = await renderTwinVideoFFmpeg({
      portraitPath: portraitFront,
      sceneImagePaths: sceneImages,
      audioPath: reelAudioPath,
      durationSec: 32,
      aspectRatio: '9:16',
      framing: 'Close-Up Studio',
      title: 'Hindi & Hinglish Retention Blueprint',
      captionExcerpt:
        'Seedha point pe aate hain. Camera se zyada clarity aur natural Hindi storytelling matter karti hai — delivering full 30-second creator insights without retakes.',
      backgroundStyle: 'Studio Ivory Linen',
      subtitlesEnabled: true,
      aiDisclosureWatermark: true,
      watermarkText: 'AI DIGITAL TWIN · DEMO SHOWCASE',
      outputVideoPath: reelOut,
      outputThumbPath: reelThumb,
    });
    reelDuration = res1.durationSec;
  } catch {
    // ignore if demo portrait missing
  }

  try {
    await fs.access(portraitTalking);
    let wideAudioPath: string | undefined;
    try {
      const wavPath = path.join(AUDIO_DIR, 'demo_wide_voice.wav');
      await synthesizeEdgeNeuralSpeechWav({
        text: wideEnglishScript,
        voiceIdentity: 'en-IN-PrabhatNeural',
        language: 'English',
        outputWavPath: wavPath,
      });
      wideAudioPath = wavPath;
      wideSpoken = true;
    } catch {
      if (isGeminiConfigured()) {
        try {
          const wavPath = path.join(AUDIO_DIR, 'demo_wide_voice.wav');
          await synthesizeGeminiSpeechWav({
            text: wideEnglishScript,
            provider: 'gemini_flash_tts',
            voiceIdentity: 'Puck',
            language: 'English',
            emotion: 'Authoritative',
            outputWavPath: wavPath,
          });
          wideAudioPath = wavPath;
          wideSpoken = true;
        } catch {
          wideAudioPath = undefined;
        }
      }
    }

    const res2 = await renderTwinVideoFFmpeg({
      portraitPath: portraitTalking,
      sceneImagePaths: [portraitTalking, studioBanner, portraitFront],
      audioPath: wideAudioPath,
      durationSec: 32,
      aspectRatio: '16:9',
      framing: 'Medium Editorial',
      title: 'Consent-First Twin Provenance',
      captionExcerpt:
        'Verified biometric consent, 6-shot dynamic motion cuts, natural voiceovers, and transparent AI disclosure on every 30-second export.',
      backgroundStyle: 'Warm Charcoal',
      subtitlesEnabled: true,
      aiDisclosureWatermark: true,
      watermarkText: 'AI DIGITAL TWIN · DEMO SHOWCASE',
      outputVideoPath: wideOut,
      outputThumbPath: wideThumb,
    });
    wideDuration = res2.durationSec;
  } catch {
    // ignore
  }

  // Update demo workspace metadata with accurate durations & spoken provenance
  try {
    const raw = await fs.readFile(DEMO_DB_PATH, 'utf8');
    const demoState: WorkspaceState = JSON.parse(raw);
    const v1 = demoState.videos.find((v) => v.id === 'demo_video_1');
    if (v1) {
      v1.durationSec = reelDuration;
      v1.qualityTier = 'local_free';
      v1.voiceProvider = 'free_hindi_neural';
      v1.voiceIdentity = 'hi-IN-MadhurNeural';
      v1.estimatedCostUsd = 0;
      v1.actualCostUsd = 0;
      v1.provenanceNote = reelSpoken
        ? 'Free Hindi Neural Voice (Madhur) + 6-Shot FFmpeg Motion Director ($0.00)'
        : '6-Shot FFmpeg Motion Director · Minimum 30s Demo ($0.00)';
    }
    const v2 = demoState.videos.find((v) => v.id === 'demo_video_2');
    if (v2) {
      v2.durationSec = wideDuration;
      v2.qualityTier = 'local_free';
      v2.voiceProvider = 'free_hindi_neural';
      v2.voiceIdentity = 'en-IN-PrabhatNeural';
      v2.estimatedCostUsd = 0;
      v2.actualCostUsd = 0;
      v2.provenanceNote = wideSpoken
        ? 'Free Indian Neural Voice (Prabhat) + 6-Shot FFmpeg Motion Director ($0.00)'
        : '6-Shot FFmpeg Motion Director · Minimum 30s Demo ($0.00)';
    }
    await fs.writeFile(DEMO_DB_PATH, JSON.stringify(demoState, null, 2));
    await fs.writeFile(markerPath, new Date().toISOString());
  } catch {
    // ignore
  }
}

export async function readWorkspace(mode: WorkspaceMode): Promise<WorkspaceState> {
  const target = mode === 'demo' ? DEMO_DB_PATH : LIVE_DB_PATH;
  const raw = await fs.readFile(target, 'utf8');
  const parsed: WorkspaceState = JSON.parse(raw);
  parsed.mode = mode;
  if (!Array.isArray(parsed.onlineIdeas) || (mode === 'demo' && parsed.onlineIdeas.length === 0)) {
    parsed.onlineIdeas = mode === 'demo' ? defaultDemoOnlineIdeas() : [];
  }
  if (!parsed.twin.personality.preferredVoiceProvider) {
    parsed.twin.personality.preferredVoiceProvider = 'free_hindi_neural';
  }
  if (!parsed.twin.personality.preferredVoiceId) {
    parsed.twin.personality.preferredVoiceId = 'hi-IN-MadhurNeural';
  }
  parsed.twin.readiness = computeReadiness(parsed.twin);
  parsed.capabilities = {
    geminiConfigured: isGeminiConfigured(),
    ffmpegAvailable: await checkFfmpegAvailable(),
  };

  // Backfill newly introduced free connectors, RSS feeds & benchmarks into existing saved workspaces
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

export async function writeWorkspace(mode: WorkspaceMode, state: WorkspaceState): Promise<WorkspaceState> {
  const target = mode === 'demo' ? DEMO_DB_PATH : LIVE_DB_PATH;
  state.mode = mode;
  state.twin.readiness = computeReadiness(state.twin);
  await fs.writeFile(target, JSON.stringify(state, null, 2));
  return state;
}

export async function resetLiveWorkspace(): Promise<WorkspaceState> {
  const geminiOk = isGeminiConfigured();
  const ffmpegOk = await checkFfmpegAvailable();
  const fresh = createInitialLiveState(geminiOk, ffmpegOk);
  await fs.writeFile(LIVE_DB_PATH, JSON.stringify(fresh, null, 2));
  return fresh;
}

export function appendAuditLog(
  state: WorkspaceState,
  entry: Omit<AuditLogEntry, 'id' | 'timestamp'>
): void {
  state.auditLogs.unshift({
    id: `aud_${crypto.randomUUID().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  });
  if (state.auditLogs.length > 200) {
    state.auditLogs = state.auditLogs.slice(0, 200);
  }
}

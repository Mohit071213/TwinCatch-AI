export type WorkspaceMode = 'demo' | 'live';

export type NavSection =
  | 'overview'
  | 'twin'
  | 'trends'
  | 'intelligence'
  | 'studio'
  | 'library'
  | 'automation'
  | 'publishing'
  | 'analytics'
  | 'integrations'
  | 'settings';

export type QualityTier = 'local_free' | 'balanced' | 'premium';

export type FaceCategory =
  | 'front'
  | 'left_profile'
  | 'right_profile'
  | 'expression_smiling'
  | 'expression_serious'
  | 'expression_talking'
  | 'lighting_variation'
  | 'reference_video';

export interface FaceAsset {
  id: string;
  category: FaceCategory;
  label: string;
  url: string;
  mimeType: string;
  filename: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  uploadedAt: string;
}

export type TwinLanguage = 'English' | 'Hindi' | 'Hinglish';

export interface VoiceSample {
  id: string;
  label: string;
  language: TwinLanguage;
  emotion: 'Conversational' | 'Authoritative' | 'Warm' | 'Energetic' | 'Reflective';
  url: string;
  mimeType: string;
  filename: string;
  sizeBytes: number;
  durationSec?: number;
  transcript?: string;
  verified: boolean;
  uploadedAt: string;
}

export type VoiceProsodyPreset =
  | 'warm_storyteller'
  | 'friendly_explainer'
  | 'calm_mentor'
  | 'lively_creator';

export type VoicePitchWarmth = 'warm' | 'natural' | 'bright';

export interface PersonalityProfile {
  creatorName: string;
  handle: string;
  niche: string;
  speakingStyle: string;
  vocabularyNotes: string;
  humourStyle: string;
  formalityLevel: 'Casual' | 'Conversational Editorial' | 'Authoritative' | 'Executive';
  accentAndPronunciation: string;
  catchphrases: string[];
  primaryLanguage: TwinLanguage;
  preferredVoiceProvider?: VoiceProviderId;
  preferredVoiceId?: string;
  voiceProsodyPreset?: VoiceProsodyPreset;
  voicePitchWarmth?: VoicePitchWarmth;
  voicePace?: number;
  naturalPausesEnabled?: boolean;
}

export interface ConsentRecord {
  attested: boolean;
  ownerFullName: string;
  attestedAt: string | null;
  likenessUsageScope: string;
  requireAiDisclosure: boolean;
}

export interface TwinReadiness {
  overallScore: number;
  faceScore: number;
  voiceScore: number;
  personalityScore: number;
  consentVerified: boolean;
  missingItems: string[];
  externalModelStatus: 'not_trained' | 'provider_pending' | 'local_ready';
}

export interface TwinProfile {
  faceAssets: FaceAsset[];
  voiceSamples: VoiceSample[];
  personality: PersonalityProfile;
  consent: ConsentRecord;
  readiness: TwinReadiness;
}

export type TrendPlatform = 'Instagram' | 'TikTok' | 'Facebook' | 'RSS / News' | 'Online Search' | 'Manual';

export type TrendCategory =
  | 'Rising'
  | 'Viral'
  | 'Comedy'
  | 'Science'
  | 'Knowledge'
  | 'Evergreen'
  | 'Educational'
  | 'Entertainment'
  | 'Business'
  | 'Technology'
  | 'Lifestyle';

export type ScriptGenre =
  | 'Comedy'
  | 'Knowledge'
  | 'Science'
  | 'Myth Busting'
  | 'Psychology'
  | 'Tech & AI'
  | 'Storytelling'
  | 'Business & Finance'
  | 'History & Facts';

export type WritingStyleMode =
  | 'Viral Hook & Curiosity'
  | 'Observational Comedy'
  | 'Mind-Blowing Science'
  | 'Deep Knowledge Explainer'
  | 'Rapid Myth-Buster'
  | 'Relatable Skit / Dialogue'
  | 'Cinematic Storytelling';

export type RewriteAction =
  | 'punch_hook'
  | 'add_comedy'
  | 'deepen_science'
  | 'expand_45s'
  | 'to_hindi'
  | 'to_hinglish'
  | 'to_english'
  | 'sharpen_cta';

export interface OnlineViralIdea {
  id: string;
  genre: ScriptGenre;
  language: TwinLanguage;
  title: string;
  hookIdea: string;
  viralTrigger: string;
  suggestedAngle: string;
  sourceTitle?: string;
  sourceUrl?: string;
  fetchedAt: string;
}

export interface TrendItem {
  id: string;
  topic: string;
  platform: TrendPlatform;
  category: TrendCategory;
  sourceUrl: string;
  sourceName: string;
  sourceType: 'rss' | 'manual' | 'curated' | 'web_search';
  discoveredAt: string;
  summary: string;
  metrics: {
    available: boolean;
    views?: string;
    engagementRate?: string;
    note?: string;
  };
  relevanceScore: number;
  opportunityScore: number;
}

export type VideoFormatType =
  | 'Talking-Head'
  | 'Presenter-Style'
  | 'Educational'
  | 'Original Reaction'
  | 'Storytelling'
  | 'Promotional'
  | 'Short-Form Social';

export interface ScriptVariant {
  id: string;
  toneName: 'Natural & Conversational' | 'Educational & Authoritative' | 'Entertaining & Engaging';
  hook3s: string;
  body: string;
  cta: string;
  estimatedDurationSec: number;
  wordCount: number;
}

export interface ContentScriptPack {
  id: string;
  trendId?: string;
  trendTopic: string;
  genre?: ScriptGenre;
  writingStyle?: WritingStyleMode;
  sourceUrl?: string;
  language: TwinLanguage;
  recommendedFormat: VideoFormatType;
  thesis: string;
  audiencePainPoint: string;
  ctaStrategy: string;
  selectedVariantId: string;
  variants: ScriptVariant[];
  approvalStatus: 'draft' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

export type VoiceProviderId =
  | 'free_hindi_neural'
  | 'gemini_lite_tts'
  | 'gemini_flash_tts'
  | 'ambient_studio'
  | 'kokoro_local'
  | 'piper_local'
  | 'elevenlabs_webhook';

export interface VoiceAudition {
  id: string;
  provider: VoiceProviderId;
  providerLabel: string;
  voiceIdentity: string;
  language: TwinLanguage;
  emotion: string;
  text: string;
  audioUrl: string;
  durationSec: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  usedFallbackNotice?: string;
  createdAt: string;
}

export type VisualProviderId =
  | 'free_canvas_animator'
  | 'ffmpeg_local'
  | 'free_hf_space'
  | 'gemini_omni_veo'
  | 'liveportrait_webhook'
  | 'heygen_webhook';

export interface CostEstimate {
  qualityTier: QualityTier;
  voiceProvider: VoiceProviderId;
  visualProvider: VisualProviderId;
  estimatedVoiceUsd: number;
  estimatedVisualUsd: number;
  estimatedTotalUsd: number;
  requiresExplicitPaidApproval: boolean;
  estimatedProcessingSec: number;
  qualityAdvisory: string;
  recommendedUpgradeTier?: QualityTier;
  recommendedUpgradeReason?: string;
}

export type PresenterVisualMode =
  | 'auto_match'
  | 'faceless_broll'
  | 'twin_owner'
  | 'cast_ananya'
  | 'cast_meera'
  | 'cast_kabir';

export type BackgroundStyleType =
  | 'Auto-Match Script Theme'
  | 'Studio Ivory Linen'
  | 'Warm Charcoal'
  | 'Architectural Daylight'
  | 'Cosmic & Science Lab'
  | 'Warm Comedy Stage';

export type ProductionStyle =
  | 'auto_genre'
  | 'comedy_skit'
  | 'visual_explainer'
  | 'story_cinema'
  | 'creator_reel';

export type VisualCardType =
  | 'reaction_chat'
  | 'stat_callout'
  | 'comparison_split'
  | 'comic_bubble'
  | 'kinetic_quote';

export type PromptLibraryCategory =
  | 'Comedy & Skit'
  | 'Science & Explainer'
  | 'Finance & Business'
  | 'Story & Cinema'
  | 'Creator Hooks';

export type ShootingAnglePreset =
  | 'auto_director'
  | 'eye_level_studio'
  | 'low_angle_hero'
  | 'over_shoulder_frame'
  | 'wide_establishing'
  | 'close_up_intimate'
  | 'dutch_dynamic'
  | 'macro_broll_insert';

export type ColorGradePreset =
  | 'warm_editorial'
  | 'teal_amber_cinema'
  | 'kodak_soft'
  | 'noir_contrast'
  | 'vibrant_creator';

export type AnimationPresetMode =
  | 'cinematic_layered'
  | 'dynamic_storyboard'
  | 'high_energy_reels'
  | 'minimal_documentary';

export type TransitionStylePreset =
  | 'auto_choreography'
  | 'cinematic_dissolve'
  | 'whip_pan'
  | 'film_fade'
  | 'geometric_iris';

export type CameraMotionType =
  | 'punch_zoom'
  | 'kinetic_pan'
  | 'split_reveal'
  | 'orbit_drift'
  | 'cinema_push';

export type MotionGraphicPreset =
  | 'comic_reaction_burst'
  | 'chat_thread_popup'
  | 'orbital_physics_sim'
  | 'neural_network_pulse'
  | 'compounding_curve_chart'
  | 'myth_reality_divider'
  | 'cinema_spotlight_sweep'
  | 'kinetic_waveform_banner';

export interface VisualPromptTemplate {
  id: string;
  name: string;
  category: PromptLibraryCategory;
  productionStyle: Exclude<ProductionStyle, 'auto_genre'>;
  themeMood: SceneVisualBeat['themeMood'];
  motionGraphicPreset: MotionGraphicPreset;
  cameraMotion: CameraMotionType;
  shootingAngle: Exclude<ShootingAnglePreset, 'auto_director'>;
  visualCardType: VisualCardType;
  colorAccent: string;
  clipKeywords: string[];
  directorPrompt: string;
  sampleCallout: string;
  sampleSubBadge: string;
}

export interface SceneVisualBeat {
  beatIndex: number;
  startPct: number;
  endPct: number;
  headline: string;
  spokenCue: string;
  searchQuery: string;
  themeMood:
    | 'cosmic_space'
    | 'science_tech'
    | 'comedy_office'
    | 'finance_business'
    | 'history_world'
    | 'mind_psychology'
    | 'nature_earth'
    | 'studio_editorial';
  bgHex: string;
  accentHex: string;
  imageUrl?: string;
  visualCardType?: VisualCardType;
  calloutText?: string;
  subBadge?: string;
  isPunchline?: boolean;
  promptTemplateId?: string;
  promptTemplateName?: string;
  motionGraphicPreset?: MotionGraphicPreset;
  cameraMotion?: CameraMotionType;
  shootingAngle?: Exclude<ShootingAnglePreset, 'auto_director'>;
  visionRationale?: string;
  mediaKind?: 'animated_clip' | 'motion_graphic' | 'curated_frame';
}

export interface VideoRenderJob {
  id: string;
  title: string;
  scriptId?: string;
  trendTopic: string;
  qualityTier: QualityTier;
  voiceProvider: VoiceProviderId;
  voiceIdentity: string;
  visualProvider: VisualProviderId;
  aspectRatio: '9:16' | '1:1' | '16:9';
  format: VideoFormatType;
  language: TwinLanguage;
  emotion: string;
  framing: 'Close-Up Studio' | 'Medium Editorial' | 'Presenter Bust';
  backgroundStyle: BackgroundStyleType | string;
  presenterMode?: PresenterVisualMode;
  productionStyle?: ProductionStyle;
  shootingAngle?: ShootingAnglePreset;
  colorGrade?: ColorGradePreset;
  animationMode?: AnimationPresetMode;
  transitionStyle?: TransitionStylePreset;
  wardrobeNote: string;
  speakingSpeed: number;
  voiceIntensity: 'Measured' | 'Balanced' | 'Dynamic';
  subtitlesEnabled: boolean;
  aiDisclosureWatermark: boolean;
  estimatedCostUsd: number;
  actualCostUsd: number;
  approvedPaidCharge: boolean;
  durationSec: number;
  processingMs: number;
  status: 'queued' | 'synthesizing_voice' | 'assembling_video' | 'completed' | 'failed';
  reviewStatus: 'pending' | 'approved' | 'rejected';
  videoUrl: string;
  thumbnailUrl: string;
  audioUrl?: string;
  provenanceNote: string;
  error?: string;
  createdAt: string;
}

export interface ProviderBenchmark {
  id: string;
  providerId: string;
  providerName: string;
  category: 'voice' | 'video' | 'lipsync';
  tier: QualityTier;
  referenceImageLabel: string;
  voiceSampleLabel: string;
  scriptExcerpt: string;
  sampleOutputUrl?: string;
  sampleType?: 'audio' | 'video';
  verified: boolean;
  processingMs: number | null;
  resolutionOrSampleRate: string;
  estimatedCostPerMinUsd: number;
  metrics: {
    faceSimilarity: number | null;
    voiceSimilarity: number | null;
    lipSync: number | null;
    naturalExpressions: number | null;
    renderingQuality: number | null;
  };
  notes: string;
  benchmarkedAt: string | null;
}

export interface AutomationJob {
  id: string;
  workflowName: string;
  eventType: 'trend.discovered' | 'script.approved' | 'render.completed' | 'publish.ready' | 'manual.test';
  targetWebhookUrl: string;
  idempotencyKey: string;
  payloadSummary: string;
  status: 'queued' | 'running' | 'retrying' | 'succeeded' | 'paused' | 'failed';
  attempts: number;
  maxAttempts: number;
  signaturePreview: string;
  responseCode?: number;
  providerCostUsd: number;
  createdAt: string;
  updatedAt: string;
  logs: string[];
}

export interface PublishingDraft {
  id: string;
  videoId: string;
  videoTitle: string;
  thumbnailUrl: string;
  videoUrl: string;
  aspectRatio: '9:16' | '1:1' | '16:9';
  platform: 'Instagram Reels' | 'TikTok' | 'Facebook Reels';
  caption: string;
  hashtags: string[];
  scheduledFor: string;
  approvalStatus: 'awaiting_approval' | 'approved' | 'rejected';
  publishStatus: 'draft' | 'scheduled' | 'dispatched' | 'published' | 'failed';
  receiptId?: string;
  receiptConfirmedAt?: string;
  statusNote: string;
}

export interface AnalyticsRecord {
  id: string;
  videoId: string;
  title: string;
  platform: 'Instagram Reels' | 'TikTok' | 'Facebook Reels';
  format: VideoFormatType;
  language: TwinLanguage;
  hookType: string;
  aspectRatio: '9:16' | '1:1' | '16:9';
  views: number;
  reach: number;
  avgWatchSec: number;
  retentionPct: number;
  shares: number;
  comments: number;
  saves: number;
  followerDelta: number;
  engagementRate: number;
  productionCostUsd: number;
  loggedAt: string;
}

export type ConnectorAuthType = 'none' | 'bearer' | 'header_key' | 'query_token' | 'basic';
export type ConnectorHttpMethod = 'POST' | 'PUT' | 'PATCH' | 'GET';

export interface IntegrationConnector {
  id: string;
  name: string;
  category: 'Voice Engine' | 'Avatar & Lip-Sync' | 'LLM Intelligence' | 'Automation' | 'Social Publishing';
  tier: QualityTier;
  description: string;
  configured: boolean;
  endpointUrl: string;
  status: 'connected' | 'unconfigured' | 'reachable' | 'unreachable';
  capabilities: string[];
  supportsVoiceCloning: boolean;
  lastCheckedAt: string | null;
  notes: string;
  // Direct Social Graph API & n8n-style HTTP Request Node configuration
  nodeKind?: 'standard' | 'http_node' | 'instagram_graph' | 'facebook_graph';
  httpMethod?: ConnectorHttpMethod;
  authType?: ConnectorAuthType;
  authHeaderName?: string;
  apiToken?: string;
  accountId?: string;
  publicMediaBaseUrl?: string;
  customHeadersJson?: string;
  payloadTemplateJson?: string;
  lastTestResult?: {
    ok: boolean;
    statusCode?: number;
    message: string;
    responsePreview?: string;
    testedAt: string;
  };
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  category: 'consent' | 'identity' | 'intelligence' | 'render' | 'cost' | 'automation' | 'publishing' | 'security';
  action: string;
  detail: string;
  costImpactUsd?: number;
}

export interface RssFeedSource {
  id: string;
  name: string;
  url: string;
  defaultCategory: TrendCategory;
  enabled: boolean;
}

export interface StudioSettings {
  monthlyBudgetCapUsd: number;
  currentMonthSpendUsd: number;
  requireExplicitPaidApproval: boolean;
  defaultQualityTier: QualityTier;
  aiDisclosureDefault: boolean;
  watermarkText: string;
  sessionLockEnabled: boolean;
  creatorEmail: string;
  rssFeeds: RssFeedSource[];
}

export interface WorkspaceState {
  mode: WorkspaceMode;
  twin: TwinProfile;
  trends: TrendItem[];
  onlineIdeas?: OnlineViralIdea[];
  scripts: ContentScriptPack[];
  auditions: VoiceAudition[];
  videos: VideoRenderJob[];
  benchmarks: ProviderBenchmark[];
  automationJobs: AutomationJob[];
  publishingDrafts: PublishingDraft[];
  analytics: AnalyticsRecord[];
  integrations: IntegrationConnector[];
  auditLogs: AuditLogEntry[];
  settings: StudioSettings;
  capabilities: {
    geminiConfigured: boolean;
    ffmpegAvailable: boolean;
  };
}

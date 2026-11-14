import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Film,
  FlaskConical,
  Image as ImageIcon,
  Mic,
  Play,
  RefreshCw,
  ShieldCheck,
  Users,
  Volume2,
} from 'lucide-react';
import type {
  BackgroundStyleType,
  CostEstimate,
  PresenterVisualMode,
  ProductionStyle,
  QualityTier,
  SceneVisualBeat,
  TwinLanguage,
  VideoFormatType,
  VideoRenderJob,
  VisualProviderId,
  VoiceAudition,
  VoiceProviderId,
  WorkspaceMode,
  WorkspaceState,
} from '../types';
import { apiRequest, formatCurrency } from '../lib/api';
import { renderCanvasMotionVideo } from '../lib/canvasAnimator';
import { FREE_HINDI_VOICES, GEMINI_STUDIO_VOICES, defaultVoiceForProvider } from '../lib/voices';

interface VideoStudioViewProps {
  workspace: WorkspaceState;
  mode: WorkspaceMode;
  preselectedScriptId?: string;
  onUpdateWorkspace: (w: WorkspaceState) => void;
}

const FORMATS: VideoFormatType[] = [
  'Talking-Head',
  'Presenter-Style',
  'Educational',
  'Original Reaction',
  'Storytelling',
  'Promotional',
  'Short-Form Social',
];

export const VideoStudioView: React.FC<VideoStudioViewProps> = ({
  workspace,
  mode,
  preselectedScriptId,
  onUpdateWorkspace,
}) => {
  const [studioTab, setStudioTab] = useState<'produce' | 'benchmarks'>('produce');
  const [qualityTier, setQualityTier] = useState<QualityTier>(workspace.settings.defaultQualityTier || 'balanced');

  const initialScript =
    workspace.scripts?.find((s) => s.id === preselectedScriptId) ||
    workspace.scripts?.find((s) => s.approvalStatus === 'approved') ||
    workspace.scripts?.[0];

  const initialVariant =
    initialScript?.variants?.find((v) => v.id === initialScript.selectedVariantId) || initialScript?.variants?.[0];

  const [selectedScriptId, setSelectedScriptId] = useState(initialScript?.id || '');
  const [title, setTitle] = useState(initialScript?.trendTopic.slice(0, 60) || 'TwinForge Studio Dispatch');
  const [scriptText, setScriptText] = useState(
    initialVariant ? `${initialVariant.hook3s} ${initialVariant.body} ${initialVariant.cta}` : ''
  );

  const [aspectRatio, setAspectRatio] = useState<'9:16' | '1:1' | '16:9'>('9:16');
  const [format, setFormat] = useState<VideoFormatType>(initialScript?.recommendedFormat || 'Talking-Head');
  const [language, setLanguage] = useState<TwinLanguage>(
    initialScript?.language || workspace.twin.personality.primaryLanguage || 'English'
  );
  const [emotion, setEmotion] = useState('Warm & Editorial');
  const [framing, setFraming] = useState<'Close-Up Studio' | 'Medium Editorial' | 'Presenter Bust'>('Close-Up Studio');
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyleType>('Auto-Match Script Theme');
  const [presenterMode, setPresenterMode] = useState<PresenterVisualMode>('auto_match');
  const [productionStyle, setProductionStyle] = useState<ProductionStyle>(
    initialScript?.genre === 'Comedy' || initialScript?.recommendedFormat === 'Original Reaction'
      ? 'comedy_skit'
      : 'auto_genre'
  );
  const [wardrobeNote, setWardrobeNote] = useState('Tailored charcoal blazer & ivory knit');
  const speedTouchedRef = useRef(false);
  const [speakingSpeed, setSpeakingSpeed] = useState(() => {
    const base = Math.max(1.05, workspace.twin.personality.voicePace ?? 1.08);
    return initialScript?.genre === 'Comedy' ? Math.max(1.14, base) : base;
  });
  const [targetDurationSec, setTargetDurationSec] = useState(32);
  const [voiceIntensity, setVoiceIntensity] = useState<'Measured' | 'Balanced' | 'Dynamic'>('Balanced');
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [aiWatermark, setAiWatermark] = useState(workspace.settings.aiDisclosureDefault);
  const [portraitAssetId, setPortraitAssetId] = useState(workspace.twin?.faceAssets?.[0]?.id || '');

  const personaProv = workspace.twin.personality.preferredVoiceProvider || 'free_hindi_neural';
  const personaVoice =
    workspace.twin.personality.preferredVoiceId || defaultVoiceForProvider(personaProv, language);

  const [voiceProvider, setVoiceProvider] = useState<VoiceProviderId>(
    qualityTier === 'local_free' ? 'free_hindi_neural' : personaProv
  );
  const [voiceIdentity, setVoiceIdentity] = useState(personaVoice);
  const [visualProvider, setVisualProvider] = useState<VisualProviderId>(
    qualityTier === 'local_free' ? 'free_canvas_animator' : 'ffmpeg_local'
  );

  const [activeAudition, setActiveAudition] = useState<VoiceAudition | null>(workspace.auditions?.[0] || null);
  const [latestVideo, setLatestVideo] = useState<VideoRenderJob | null>(workspace.videos?.[0] || null);
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);

  const [auditionBusy, setAuditionBusy] = useState(false);
  const [renderBusy, setRenderBusy] = useState(false);
  const [planningVisualsBusy, setPlanningVisualsBusy] = useState(false);
  const [plannedVisuals, setPlannedVisuals] = useState<{
    beats: SceneVisualBeat[];
    presenterModeResolved: PresenterVisualMode;
    presenterLabel: string;
    presenterImageUrls: string[];
  } | null>(null);
  const [canvasProgress, setCanvasProgress] = useState<{ pct: number; phase: string } | null>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [benchmarkBusyId, setBenchmarkBusyId] = useState<string | null>(null);
  const [benchmarkText, setBenchmarkText] = useState(
    'Every creator assumes camera gear drives retention, when clarity in the first three seconds decides everything.'
  );
  const [error, setError] = useState('');

  // Auto-align recommended providers when quality mode changes (preserving explicit user control)
  const applyQualityTier = (tier: QualityTier) => {
    setQualityTier(tier);
    setActiveAudition(null);
    if (tier === 'local_free') {
      setVoiceProvider('free_hindi_neural');
      const nextVoice =
        workspace.twin.personality.preferredVoiceProvider === 'free_hindi_neural' &&
        workspace.twin.personality.preferredVoiceId
          ? workspace.twin.personality.preferredVoiceId
          : defaultVoiceForProvider('free_hindi_neural', language);
      setVoiceIdentity(nextVoice);
      setVisualProvider('free_canvas_animator');
    } else if (tier === 'balanced') {
      setVoiceProvider('gemini_flash_tts');
      setVoiceIdentity(defaultVoiceForProvider('gemini_flash_tts', language));
      setVisualProvider('ffmpeg_local');
    } else {
      setVoiceProvider('gemini_flash_tts');
      setVoiceIdentity(defaultVoiceForProvider('gemini_flash_tts', language));
      setVisualProvider('gemini_omni_veo');
    }
  };

  useEffect(() => {
    if (!portraitAssetId && workspace.twin.faceAssets[0]?.id) {
      setPortraitAssetId(workspace.twin.faceAssets[0].id);
    }
  }, [workspace.twin.faceAssets, portraitAssetId]);

  useEffect(() => {
    const words = scriptText.trim().split(/\s+/).filter(Boolean).length;
    const estSec = Math.max(30, targetDurationSec, Math.round(words / 2.2) || 30);
    apiRequest<CostEstimate>('/api/studio/estimate', mode, {
      method: 'POST',
      body: JSON.stringify({ qualityTier, voiceProvider, visualProvider, durationSec: estSec }),
    })
      .then(setEstimate)
      .catch(() => {});
  }, [qualityTier, voiceProvider, visualProvider, scriptText, targetDurationSec, mode]);

  useEffect(() => {
    setPlannedVisuals(null);
  }, [
    title,
    scriptText,
    presenterMode,
    productionStyle,
    format,
    backgroundStyle,
    voiceIdentity,
    portraitAssetId,
    language,
  ]);

  const handleLoadScript = (id: string) => {
    setSelectedScriptId(id);
    const sc = workspace.scripts.find((s) => s.id === id);
    if (!sc) return;
    const v = sc.variants.find((x) => x.id === sc.selectedVariantId) || sc.variants[0];
    setTitle(sc.trendTopic.slice(0, 60));
    setLanguage(sc.language);
    setFormat(sc.recommendedFormat);
    const isComedyScript =
      sc.genre === 'Comedy' ||
      sc.recommendedFormat === 'Original Reaction' ||
      sc.writingStyle === 'Observational Comedy' ||
      sc.writingStyle === 'Relatable Skit / Dialogue';
    if (isComedyScript) {
      setProductionStyle('comedy_skit');
      if (!speedTouchedRef.current) setSpeakingSpeed(1.15);
    } else if (sc.genre === 'Science' || sc.genre === 'Knowledge' || sc.recommendedFormat === 'Educational') {
      setProductionStyle('visual_explainer');
      if (!speedTouchedRef.current) setSpeakingSpeed(1.08);
    } else {
      setProductionStyle('auto_genre');
    }
    if (v) setScriptText(`${v.hook3s} ${v.body} ${v.cta}`);
  };

  const handlePlanVisuals = async () => {
    if (!scriptText.trim() && !title.trim()) {
      setError('Enter a title or script before previewing scene visuals.');
      return null;
    }
    setError('');
    setPlanningVisualsBusy(true);
    try {
      const plan = await apiRequest<{
        beats: SceneVisualBeat[];
        presenterModeResolved: PresenterVisualMode;
        presenterLabel: string;
        presenterImageUrls: string[];
        productionStyleResolved?: Exclude<ProductionStyle, 'auto_genre'>;
      }>('/api/studio/plan-visuals', mode, {
        method: 'POST',
        body: JSON.stringify({
          title: title || 'TwinForge Studio Production',
          scriptText: scriptText || title,
          language,
          format,
          backgroundStyle,
          presenterMode,
          productionStyle,
          voiceIdentity,
          portraitAssetId,
        }),
      });
      if (!plan || !Array.isArray(plan.beats) || !Array.isArray(plan.presenterImageUrls)) {
        throw new Error('Visual planner returned an incomplete storyboard. Please try again.');
      }
      setPlannedVisuals(plan);
      return plan;
    } catch (err: any) {
      setError(err.message || 'Could not plan script-matched visuals.');
      return null;
    } finally {
      setPlanningVisualsBusy(false);
    }
  };

  const handleAuditionVoice = async () => {
    if (!scriptText.trim()) {
      setError('Enter or load a script excerpt before auditioning voice.');
      return;
    }
    setError('');
    setAuditionBusy(true);
    try {
      const res = await apiRequest<{ workspace: WorkspaceState; audition: VoiceAudition }>(
        '/api/voice/audition',
        mode,
        {
          method: 'POST',
          body: JSON.stringify({
            text: scriptText,
            provider: voiceProvider,
            voiceIdentity,
            language,
            emotion,
            speakingSpeed,
            productionStyle,
            prosodyPreset:
              productionStyle === 'comedy_skit'
                ? 'lively_creator'
                : workspace.twin.personality.voiceProsodyPreset || 'friendly_explainer',
            pitchWarmth:
              productionStyle === 'comedy_skit'
                ? 'bright'
                : workspace.twin.personality.voicePitchWarmth || 'warm',
            naturalPauses: workspace.twin.personality.naturalPausesEnabled !== false,
          }),
        }
      );
      onUpdateWorkspace(res.workspace);
      setActiveAudition(res.audition);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAuditionBusy(false);
    }
  };

  const executeRender = async (approvedPaidCharge: boolean) => {
    setError('');
    setShowApprovalModal(false);
    setRenderBusy(true);
    setCanvasProgress(null);
    try {
      if (visualProvider === 'free_canvas_animator') {
        setCanvasProgress({ pct: 3, phase: 'Matching Script Backgrounds & Presenter' });
        const visualPlan =
          plannedVisuals ||
          (await apiRequest<{
            beats: SceneVisualBeat[];
            presenterModeResolved: PresenterVisualMode;
            presenterLabel: string;
            presenterImageUrls: string[];
            productionStyleResolved?: Exclude<ProductionStyle, 'auto_genre'>;
          }>('/api/studio/plan-visuals', mode, {
            method: 'POST',
            body: JSON.stringify({
              title: title || 'TwinForge Studio Production',
              scriptText: scriptText || title,
              language,
              format,
              backgroundStyle,
              presenterMode,
              productionStyle,
              voiceIdentity,
              portraitAssetId,
            }),
          }));
        if (
          !visualPlan ||
          !Array.isArray(visualPlan.beats) ||
          !Array.isArray(visualPlan.presenterImageUrls)
        ) {
          throw new Error('Could not resolve script-matched visuals. Please try again.');
        }
        setPlannedVisuals(visualPlan);

        if (
          visualPlan.presenterModeResolved === 'twin_owner' &&
          (visualPlan.presenterImageUrls?.length || 0) === 0
        ) {
          throw new Error(
            'Upload at least one portrait in My Digital Twin or switch Presenter Visual to Auto-Match / Cast / Faceless Documentary.'
          );
        }

        // Synthesize matching audio track if missing or stale provider/voice mismatch
        const needsFreshAudio =
          !activeAudition ||
          activeAudition.provider !== voiceProvider ||
          !activeAudition.voiceIdentity.includes(voiceIdentity);
        let audioForCanvas = needsFreshAudio ? null : activeAudition;
        if (
          !audioForCanvas &&
          (voiceProvider === 'free_hindi_neural' ||
            voiceProvider === 'gemini_flash_tts' ||
            voiceProvider === 'gemini_lite_tts' ||
            voiceProvider === 'ambient_studio')
        ) {
          setCanvasProgress({ pct: 6, phase: 'Synthesizing Natural Voice Track' });
          const audRes = await apiRequest<{ workspace: WorkspaceState; audition: VoiceAudition }>(
            '/api/voice/audition',
            mode,
            {
              method: 'POST',
              body: JSON.stringify({
                text: scriptText || title,
                provider: voiceProvider,
                voiceIdentity,
                language,
                emotion,
                speakingSpeed,
                productionStyle,
                prosodyPreset:
                  productionStyle === 'comedy_skit'
                    ? 'lively_creator'
                    : workspace.twin.personality.voiceProsodyPreset || 'friendly_explainer',
                pitchWarmth:
                  productionStyle === 'comedy_skit'
                    ? 'bright'
                    : workspace.twin.personality.voicePitchWarmth || 'warm',
                naturalPauses: workspace.twin.personality.naturalPausesEnabled !== false,
              }),
            }
          );
          onUpdateWorkspace(audRes.workspace);
          setActiveAudition(audRes.audition);
          audioForCanvas = audRes.audition;
        }

        if (typeof MediaRecorder !== 'undefined') {
          setCanvasProgress({ pct: 10, phase: 'Animating Multi-Scene Script Visuals (>=30s)' });
          const effectiveDur = Math.max(30, targetDurationSec);
          const recorded = await renderCanvasMotionVideo({
            imageUrls: visualPlan.presenterImageUrls,
            visualBeats: visualPlan.beats,
            presenterMode: visualPlan.presenterModeResolved,
            productionStyle,
            format,
            audioUrl: audioForCanvas?.audioUrl,
            title: title || 'TwinForge Motion Production',
            scriptText: scriptText || title,
            aspectRatio,
            backgroundStyle,
            framing,
            speakingSpeed,
            subtitlesEnabled,
            aiDisclosureWatermark: aiWatermark,
            watermarkText: workspace.settings.watermarkText,
            language,
            targetDurationSec: effectiveDur,
            previewCanvas: liveCanvasRef.current,
            onProgress: (pct, phase) => setCanvasProgress({ pct, phase }),
          });

          setCanvasProgress({ pct: 98, phase: 'Mastering H.264 MP4 via FFmpeg' });
          if (recorded.blob.size <= 28 * 1024 * 1024) {
            try {
              const form = new FormData();
              form.append('video', recorded.blob, 'canvas_motion.webm');
              form.append('title', title || 'Free Live Motion Twin Video');
              if (selectedScriptId) form.append('scriptId', selectedScriptId);
              form.append('trendTopic', title);
              form.append('qualityTier', qualityTier);
              form.append('voiceProvider', voiceProvider);
              form.append('voiceIdentity', voiceIdentity);
              form.append('aspectRatio', aspectRatio);
              form.append('format', format);
              form.append('language', language);
              form.append('emotion', emotion);
              form.append('framing', framing);
              form.append('backgroundStyle', backgroundStyle);
              form.append('presenterMode', visualPlan.presenterModeResolved);
              form.append('productionStyle', productionStyle);
              form.append('wardrobeNote', wardrobeNote);
              form.append('speakingSpeed', String(speakingSpeed));
              form.append('targetDurationSec', String(effectiveDur));
              form.append('voiceIntensity', voiceIntensity);
              form.append('subtitlesEnabled', String(subtitlesEnabled));
              form.append('aiDisclosureWatermark', String(aiWatermark));
              if (audioForCanvas?.audioUrl) form.append('auditionAudioUrl', audioForCanvas.audioUrl);
              form.append('actualVoiceCostUsd', String(audioForCanvas?.actualCostUsd || 0));

              const uploaded = await apiRequest<{ workspace: WorkspaceState; video: VideoRenderJob }>(
                '/api/studio/upload-rendered',
                mode,
                {
                  method: 'POST',
                  body: form,
                }
              );
              onUpdateWorkspace(uploaded.workspace);
              setLatestVideo(uploaded.video);
              return;
            } catch {
              setCanvasProgress({ pct: 99, phase: 'Completing MP4 via Server Motion Director' });
            }
          } else {
            setCanvasProgress({ pct: 99, phase: 'Recording large — Completing via Server Director' });
          }

          // Resilient fallback: reuse already-synthesized audio with server 6-shot FFmpeg Motion Director
          const fallbackRes = await apiRequest<{ workspace: WorkspaceState; video: VideoRenderJob }>(
            '/api/studio/render',
            mode,
            {
              method: 'POST',
              body: JSON.stringify({
                title,
                scriptId: selectedScriptId || undefined,
                trendTopic: title,
                scriptText,
                qualityTier,
                voiceProvider,
                voiceIdentity,
                visualProvider: 'ffmpeg_local',
                aspectRatio,
                format,
                language,
                emotion,
                framing,
                backgroundStyle,
                presenterMode: visualPlan.presenterModeResolved,
                productionStyle,
                wardrobeNote,
                speakingSpeed,
                prosodyPreset:
                  productionStyle === 'comedy_skit'
                    ? 'lively_creator'
                    : workspace.twin.personality.voiceProsodyPreset || 'friendly_explainer',
                pitchWarmth:
                  productionStyle === 'comedy_skit'
                    ? 'bright'
                    : workspace.twin.personality.voicePitchWarmth || 'warm',
                naturalPauses: workspace.twin.personality.naturalPausesEnabled !== false,
                targetDurationSec: effectiveDur,
                voiceIntensity,
                subtitlesEnabled,
                aiDisclosureWatermark: aiWatermark,
                portraitAssetId,
                auditionAudioUrl: audioForCanvas?.audioUrl,
                approvedPaidCharge,
              }),
            }
          );
          onUpdateWorkspace(fallbackRes.workspace);
          setLatestVideo(fallbackRes.video);
          return;
        }
      }

      const matchingAuditionUrl =
        activeAudition &&
        activeAudition.provider === voiceProvider &&
        activeAudition.voiceIdentity.includes(voiceIdentity)
          ? activeAudition.audioUrl
          : undefined;

      const res = await apiRequest<{ workspace: WorkspaceState; video: VideoRenderJob }>(
        '/api/studio/render',
        mode,
        {
          method: 'POST',
          body: JSON.stringify({
            title,
            scriptId: selectedScriptId || undefined,
            trendTopic: title,
            scriptText,
            qualityTier,
            voiceProvider,
            voiceIdentity,
            visualProvider: visualProvider === 'free_canvas_animator' ? 'ffmpeg_local' : visualProvider,
            aspectRatio,
            format,
            language,
            emotion,
            framing,
            backgroundStyle,
            presenterMode,
            productionStyle,
            wardrobeNote,
            speakingSpeed,
            prosodyPreset:
              productionStyle === 'comedy_skit'
                ? 'lively_creator'
                : workspace.twin.personality.voiceProsodyPreset || 'friendly_explainer',
            pitchWarmth:
              productionStyle === 'comedy_skit'
                ? 'bright'
                : workspace.twin.personality.voicePitchWarmth || 'warm',
            naturalPauses: workspace.twin.personality.naturalPausesEnabled !== false,
            targetDurationSec: Math.max(30, targetDurationSec),
            voiceIntensity,
            subtitlesEnabled,
            aiDisclosureWatermark: aiWatermark,
            portraitAssetId,
            auditionAudioUrl: matchingAuditionUrl,
            approvedPaidCharge,
          }),
        }
      );
      onUpdateWorkspace(res.workspace);
      setLatestVideo(res.video);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRenderBusy(false);
      setCanvasProgress(null);
    }
  };

  const handleTriggerRender = () => {
    if (!workspace.twin.consent.attested) {
      setError('Sign biometric likeness consent in My Digital Twin before generating videos.');
      return;
    }
    if (estimate?.requiresExplicitPaidApproval) {
      setShowApprovalModal(true);
    } else {
      void executeRender(false);
    }
  };

  const handleRunBenchmark = async (providerId: string, tier: QualityTier) => {
    setError('');
    setBenchmarkBusyId(providerId);
    try {
      const res = await apiRequest<{ workspace: WorkspaceState }>('/api/benchmarks/run', mode, {
        method: 'POST',
        body: JSON.stringify({
          providerId,
          scriptExcerpt: benchmarkText,
          approvedPaidCharge: tier === 'premium',
        }),
      });
      onUpdateWorkspace(res.workspace);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBenchmarkBusyId(null);
    }
  };

  const handleRateBenchmark = async (id: string, field: string, val: number) => {
    try {
      const updated = await apiRequest<WorkspaceState>(`/api/benchmarks/${id}/rate`, mode, {
        method: 'PUT',
        body: JSON.stringify({ metrics: { [field]: val } }),
      });
      onUpdateWorkspace(updated);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header + Studio Mode Tabs */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#E4DDD0] pb-6">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#B69A65] font-semibold">
            Production &amp; Provider Benchmarking
          </div>
          <h1 className="font-editorial text-[34px] text-[#242421] mt-1">Video Studio</h1>
          <p className="text-[14px] text-[#77766F] mt-1">
            Audition speech, choose Local Free, Balanced, or Premium Realism quality, approve estimated cost, and
            render MP4 assets.
          </p>
        </div>

        <div className="inline-flex border border-[#E4DDD0] bg-[#FFFFFF] rounded-sm p-0.5 text-[12.5px] shrink-0">
          <button
            type="button"
            onClick={() => setStudioTab('produce')}
            className={`px-4 py-2 rounded-sm inline-flex items-center gap-1.5 ${
              studioTab === 'produce' ? 'bg-[#242421] text-[#F6F3EC] font-semibold' : 'text-[#77766F]'
            }`}
          >
            <Film className="w-3.5 h-3.5 text-[#B69A65]" />
            <span>Production Pipeline</span>
          </button>
          <button
            type="button"
            onClick={() => setStudioTab('benchmarks')}
            className={`px-4 py-2 rounded-sm inline-flex items-center gap-1.5 ${
              studioTab === 'benchmarks' ? 'bg-[#242421] text-[#F6F3EC] font-semibold' : 'text-[#77766F]'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5 text-[#B69A65]" />
            <span>Provider Benchmark Lab</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-[#9E3B33]/10 border border-[#9E3B33]/30 text-[#9E3B33] text-[13px] rounded-sm">
          {error}
        </div>
      )}

      {studioTab === 'produce' ? (
        <div className="space-y-6">
          {/* 3 Selectable Quality Tiers */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                id: 'local_free' as QualityTier,
                num: '01',
                title: 'LOCAL FREE MODE',
                subtitle: 'Free Hindi Neural Voices + 6-Shot Motion Animator (>=30s)',
                cost: '$0.00 / render',
              },
              {
                id: 'balanced' as QualityTier,
                num: '02',
                title: 'BALANCED QUALITY MODE',
                subtitle: 'Gemini 3.8 Expressive TTS + Multi-Scene FFmpeg Cuts',
                cost: '~$0.01–$0.03 / min',
              },
              {
                id: 'premium' as QualityTier,
                num: '03',
                title: 'PREMIUM REALISM MODE',
                subtitle: 'Gemini Omni / Veo or Lip-Sync + FFmpeg Mastering',
                cost: 'Explicit Cost Approval Required',
              },
            ].map((t) => {
              const active = qualityTier === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyQualityTier(t.id)}
                  className={`p-4 border rounded-sm text-left transition-colors ${
                    active
                      ? 'bg-[#FFFFFF] border-[#242421] ring-1 ring-[#242421]'
                      : 'bg-[#FAF8F4] border-[#E4DDD0] hover:border-[#B69A65]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#77766F]">
                    <span>{t.num}</span>
                    <span className={active ? 'text-[#B69A65] font-semibold' : ''}>{t.cost}</span>
                  </div>
                  <div className="font-semibold text-[13.5px] text-[#242421] mt-1">{t.title}</div>
                  <div className="text-[12px] text-[#77766F] mt-0.5">{t.subtitle}</div>
                </button>
              );
            })}
          </section>

          {/* Automatic Quality Fallback Recommendation Banner */}
          {estimate?.recommendedUpgradeReason && (
            <div className="p-4 bg-[#EFE8D8] border border-[#B69A65]/50 rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 text-[12.5px] text-[#242421]">
                <AlertTriangle className="w-4 h-4 text-[#A66E1E] shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Quality Advisory: </span>
                  {estimate.recommendedUpgradeReason}
                </div>
              </div>
              {estimate.recommendedUpgradeTier && (
                <button
                  type="button"
                  onClick={() => applyQualityTier(estimate.recommendedUpgradeTier!)}
                  className="px-3 py-1.5 bg-[#242421] text-[#F6F3EC] text-[11.5px] font-semibold rounded-sm shrink-0"
                >
                  Switch to {estimate.recommendedUpgradeTier.replace('_', ' ')}
                </button>
              )}
            </div>
          )}

          {/* Main Studio Split: Controls Left, Dark Preview Stage Right */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="xl:col-span-7 bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-6 space-y-5">
              {/* Script, Presenter Visual Mode & Twin Portrait Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                    Load Approved Script
                  </label>
                  <select
                    value={selectedScriptId}
                    onChange={(e) => handleLoadScript(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E4DDD0] bg-[#F6F3EC] text-[13px] rounded-sm"
                  >
                    <option value="">Custom Teleprompter Script</option>
                    {workspace.scripts.map((s) => (
                      <option key={s.id} value={s.id}>
                        [{s.approvalStatus}] {s.trendTopic.slice(0, 48)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                    Presenter Visual / Cast
                  </label>
                  <select
                    value={presenterMode}
                    onChange={(e) => setPresenterMode(e.target.value as PresenterVisualMode)}
                    className="w-full px-3 py-2 border border-[#E4DDD0] bg-[#F6F3EC] text-[13px] rounded-sm"
                  >
                    <option value="auto_match">Auto-Match Voice &amp; Script</option>
                    <option value="faceless_broll">Visual Documentary Only (No Face)</option>
                    <option value="cast_ananya">Ananya · Warm Hindi Host</option>
                    <option value="cast_meera">Meera · Science &amp; Tech Educator</option>
                    <option value="cast_kabir">Kabir · Comedy &amp; Story Host</option>
                    <option value="twin_owner">My Uploaded Twin Portrait</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                    My Twin Portrait
                  </label>
                  <select
                    value={portraitAssetId}
                    onChange={(e) => setPortraitAssetId(e.target.value)}
                    disabled={presenterMode !== 'twin_owner' && presenterMode !== 'auto_match'}
                    className="w-full px-3 py-2 border border-[#E4DDD0] bg-[#F6F3EC] text-[13px] rounded-sm disabled:opacity-60"
                  >
                    {workspace.twin.faceAssets.length === 0 ? (
                      <option value="">No portraits uploaded yet</option>
                    ) : (
                      workspace.twin.faceAssets.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                  Production Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E4DDD0] text-[13.5px] rounded-sm"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                  Spoken Script (for Voice Audition &amp; Subtitles)
                </label>
                <textarea
                  rows={4}
                  value={scriptText}
                  onChange={(e) => setScriptText(e.target.value)}
                  placeholder="Enter the spoken script for your digital twin..."
                  className="w-full px-3 py-2 border border-[#E4DDD0] text-[13.5px] leading-relaxed rounded-sm"
                />
              </div>

              {/* Interchangeable Voice Engine + Live Audition */}
              <div className="p-4 bg-[#F6F3EC] border border-[#E4DDD0] rounded-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#242421] inline-flex items-center gap-1.5">
                    <Mic className="w-3.5 h-3.5 text-[#B69A65]" />
                    <span>Realistic Voice Engine &amp; Audition</span>
                  </div>
                  <span className="text-[11px] font-mono text-[#77766F]">
                    Never silently swaps personal clone
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-[#77766F] mb-1">Voice Provider</label>
                    <select
                      value={voiceProvider}
                      onChange={(e) => {
                        const next = e.target.value as VoiceProviderId;
                        setVoiceProvider(next);
                        setVoiceIdentity(defaultVoiceForProvider(next, language));
                        setActiveAudition(null);
                      }}
                      className="w-full px-2.5 py-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[12.5px] rounded-sm"
                    >
                      <option value="free_hindi_neural">Free Natural Hindi / Indian Neural ($0.00)</option>
                      <option value="ambient_studio">Free Studio Rhythm Bed ($0.00)</option>
                      <option value="gemini_flash_tts">Gemini 3.8 Flash TTS</option>
                      <option value="gemini_lite_tts">Gemini 3.8 Flash Lite TTS</option>
                      <option value="kokoro_local">Local Kokoro / Piper Endpoint</option>
                      <option value="elevenlabs_webhook">ElevenLabs Personal Clone</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#77766F] mb-1">Voice Identity</label>
                    <select
                      value={voiceIdentity}
                      onChange={(e) => {
                        setVoiceIdentity(e.target.value);
                        setActiveAudition(null);
                      }}
                      className="w-full px-2.5 py-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[12.5px] rounded-sm"
                    >
                      {voiceProvider === 'free_hindi_neural' ? (
                        <>
                          <optgroup label="Male — Conversational Hindi / Hinglish">
                            {FREE_HINDI_VOICES.filter((v) => v.gender === 'Male').map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.label}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Female — Expressive Hindi / Hinglish">
                            {FREE_HINDI_VOICES.filter((v) => v.gender === 'Female').map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.label}
                              </option>
                            ))}
                          </optgroup>
                        </>
                      ) : voiceProvider === 'ambient_studio' ? (
                        <option value="Studio Beat">Warm Studio Harmonic Bed</option>
                      ) : (
                        GEMINI_STUDIO_VOICES.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.label}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      disabled={auditionBusy}
                      onClick={handleAuditionVoice}
                      className="w-full py-1.5 px-3 bg-[#FFFFFF] border border-[#242421] text-[#242421] text-[12.5px] font-semibold rounded-sm inline-flex items-center justify-center gap-1.5 hover:bg-[#EFE8D8]"
                    >
                      <Volume2 className="w-3.5 h-3.5 text-[#B69A65]" />
                      <span>{auditionBusy ? 'Synthesizing...' : 'Audition Voice'}</span>
                    </button>
                  </div>
                </div>

                {activeAudition && (
                  <div className="pt-2 border-t border-[#E4DDD0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-[11.5px] text-[#77766F]">
                      <div className="font-semibold text-[#242421]">
                        {activeAudition.providerLabel} · {activeAudition.voiceIdentity}
                      </div>
                      <div className="font-mono">
                        {activeAudition.durationSec}s WAV · Cost {formatCurrency(activeAudition.actualCostUsd)}
                      </div>
                      {activeAudition.usedFallbackNotice && (
                        <div className="text-[#A66E1E] mt-0.5">{activeAudition.usedFallbackNotice}</div>
                      )}
                    </div>
                    <audio controls src={activeAudition.audioUrl} className="h-8 max-w-[230px]" />
                  </div>
                )}
              </div>

              {/* Visual & Production Parameters */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                    Visual Engine
                  </label>
                  <select
                    value={visualProvider}
                    onChange={(e) => setVisualProvider(e.target.value as VisualProviderId)}
                    className="w-full px-2.5 py-2 border border-[#E4DDD0] text-[12.5px] rounded-sm"
                  >
                    <option value="free_canvas_animator">Free Live Motion Animator ($0.00)</option>
                    <option value="ffmpeg_local">Free Multi-Scene FFmpeg ($0.00)</option>
                    <option value="free_hf_space">Free HF ZeroGPU Space ($0.00)</option>
                    <option value="gemini_omni_veo">Gemini Omni / Veo (Paid)</option>
                    <option value="liveportrait_webhook">LivePortrait Worker</option>
                    <option value="heygen_webhook">HeyGen Webhook</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                    Format
                  </label>
                  <select
                    value={format}
                    onChange={(e) => {
                      const nextFmt = e.target.value as VideoFormatType;
                      setFormat(nextFmt);
                      if (nextFmt === 'Original Reaction') {
                        setProductionStyle('comedy_skit');
                        if (!speedTouchedRef.current) setSpeakingSpeed(1.15);
                      } else if (nextFmt === 'Educational') {
                        setProductionStyle('visual_explainer');
                      }
                    }}
                    className="w-full px-2.5 py-2 border border-[#E4DDD0] text-[12.5px] rounded-sm"
                  >
                    {FORMATS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                    Production Style
                  </label>
                  <select
                    value={productionStyle}
                    onChange={(e) => {
                      const next = e.target.value as ProductionStyle;
                      setProductionStyle(next);
                      setActiveAudition(null);
                      if (next === 'comedy_skit' && !speedTouchedRef.current) {
                        setSpeakingSpeed(1.15);
                      }
                    }}
                    className="w-full px-2.5 py-2 border border-[#E4DDD0] bg-[#FAF8F4] text-[12.5px] rounded-sm"
                  >
                    <option value="auto_genre">Auto-Match Script Genre</option>
                    <option value="comedy_skit">Comedy &amp; Skit Reaction (Fast Cuts + Bubbles)</option>
                    <option value="visual_explainer">Visual Explainer (Diagram / Stat Cards)</option>
                    <option value="story_cinema">Storytelling &amp; Cinema Quotes</option>
                    <option value="creator_reel">Fast Creator Reel</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                    Aspect Ratio
                  </label>
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value as any)}
                    className="w-full px-2.5 py-2 border border-[#E4DDD0] text-[12.5px] rounded-sm"
                  >
                    <option value="9:16">9:16 Vertical Reels</option>
                    <option value="1:1">1:1 Square Feed</option>
                    <option value="16:9">16:9 Widescreen</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                    Language
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as TwinLanguage)}
                    className="w-full px-2.5 py-2 border border-[#E4DDD0] text-[12.5px] rounded-sm"
                  >
                    <option value="English">English</option>
                    <option value="Hindi">Hindi</option>
                    <option value="Hinglish">Hinglish</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                    Emotion
                  </label>
                  <input
                    type="text"
                    value={emotion}
                    onChange={(e) => setEmotion(e.target.value)}
                    className="w-full px-2.5 py-2 border border-[#E4DDD0] text-[12.5px] rounded-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                    Background Scene Engine
                  </label>
                  <select
                    value={backgroundStyle}
                    onChange={(e) => setBackgroundStyle(e.target.value as BackgroundStyleType)}
                    className="w-full px-2.5 py-2 border border-[#E4DDD0] text-[12.5px] rounded-sm"
                  >
                    <option value="Auto-Match Script Theme">Auto-Match Script Theme (6-Beat B-Roll)</option>
                    <option value="Cosmic & Science Lab">Cosmic &amp; Science Lab</option>
                    <option value="Warm Comedy Stage">Warm Comedy Stage</option>
                    <option value="Studio Ivory Linen">Studio Ivory Linen</option>
                    <option value="Warm Charcoal">Warm Charcoal</option>
                    <option value="Architectural Daylight">Architectural Daylight</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                    Framing
                  </label>
                  <select
                    value={framing}
                    onChange={(e) => setFraming(e.target.value as any)}
                    className="w-full px-2.5 py-2 border border-[#E4DDD0] text-[12.5px] rounded-sm"
                  >
                    <option value="Close-Up Studio">Close-Up Studio</option>
                    <option value="Medium Editorial">Medium Editorial</option>
                    <option value="Presenter Bust">Presenter Bust</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                    Speaking Speed ({speakingSpeed.toFixed(2)}x)
                  </label>
                  <input
                    type="range"
                    min={0.85}
                    max={1.3}
                    step={0.05}
                    value={speakingSpeed}
                    onChange={(e) => {
                      speedTouchedRef.current = true;
                      setSpeakingSpeed(Number(e.target.value));
                      setActiveAudition(null);
                    }}
                    className="w-full mt-2 accent-[#B69A65]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 items-center">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                    Video Duration · Min 30s (<span className="text-[#242421] font-mono">{targetDurationSec}s</span>)
                  </label>
                  <input
                    type="range"
                    min={30}
                    max={90}
                    step={5}
                    value={targetDurationSec}
                    onChange={(e) => setTargetDurationSec(Number(e.target.value))}
                    className="w-full accent-[#B69A65]"
                  />
                </div>
                <input
                  type="text"
                  value={wardrobeNote}
                  onChange={(e) => setWardrobeNote(e.target.value)}
                  placeholder="Wardrobe / Style cue"
                  className="px-3 py-2 border border-[#E4DDD0] text-[12.5px] rounded-sm"
                />
                <div className="flex items-center gap-4 text-[12.5px]">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={subtitlesEnabled}
                      onChange={(e) => setSubtitlesEnabled(e.target.checked)}
                      className="accent-[#242421]"
                    />
                    <span>Burn Subtitles</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={aiWatermark}
                      onChange={(e) => setAiWatermark(e.target.checked)}
                      className="accent-[#242421]"
                    />
                    <span>AI Disclosure</span>
                  </label>
                </div>
              </div>

              {/* Script-Matched Storyboard & Presenter Preview */}
              <div className="p-4 bg-[#FAF8F4] border border-[#E4DDD0] rounded-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#242421] inline-flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-[#B69A65]" />
                      <span>Script-Matched 6-Beat Visual Storyboard</span>
                    </div>
                    <p className="text-[12px] text-[#77766F] mt-0.5">
                      Automatically switches presenters to match voice gender &amp; fetches topic photography for every
                      spoken beat.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={planningVisualsBusy}
                    onClick={handlePlanVisuals}
                    className="px-3.5 py-1.5 bg-[#FFFFFF] border border-[#242421] text-[#242421] text-[12px] font-semibold rounded-sm inline-flex items-center gap-1.5 hover:bg-[#EFE8D8] shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-[#B69A65] ${planningVisualsBusy ? 'animate-spin' : ''}`} />
                    <span>
                      {planningVisualsBusy
                        ? 'Matching Scenes...'
                        : plannedVisuals
                          ? 'Refresh Visuals'
                          : 'Preview Scene Visuals'}
                    </span>
                  </button>
                </div>

                {plannedVisuals && Array.isArray(plannedVisuals.beats) && (
                  <div className="space-y-3 pt-2 border-t border-[#E4DDD0]">
                    <div className="flex items-center gap-3 bg-[#FFFFFF] border border-[#E4DDD0] p-2.5 rounded-sm">
                      {plannedVisuals.presenterImageUrls?.[0] ? (
                        <img
                          src={plannedVisuals.presenterImageUrls?.[0]}
                          alt={plannedVisuals.presenterLabel || 'Active Presenter'}
                          className="w-11 h-11 object-cover rounded-sm border border-[#E4DDD0] shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 bg-[#242421] text-[#B69A65] flex items-center justify-center rounded-sm shrink-0">
                          <Film className="w-5 h-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-[10.5px] font-mono uppercase tracking-[0.12em] text-[#77766F] inline-flex items-center gap-1">
                          <Users className="w-3 h-3 text-[#B69A65]" />
                          <span>Active Presenter Cast</span>
                        </div>
                        <div className="text-[13px] font-semibold text-[#242421] truncate">
                          {plannedVisuals.presenterLabel || 'Dynamic Presenter Cast'}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {(plannedVisuals.beats || []).map((b) => (
                        <div
                          key={b.beatIndex}
                          className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm overflow-hidden flex flex-col"
                        >
                          <div className="h-20 bg-[#1A1917] relative overflow-hidden">
                            {b.imageUrl ? (
                              <img
                                src={b.imageUrl}
                                alt={b.headline}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div
                                className="w-full h-full flex items-center justify-center text-[10px] font-mono text-[#F6F3EC]/80 px-2 text-center"
                                style={{ backgroundColor: b.bgHex }}
                              >
                                {b.themeMood.replace('_', ' ').toUpperCase()}
                              </div>
                            )}
                            <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-[#1A1917]/85 text-[#F6F3EC] text-[9.5px] font-mono rounded-sm">
                              {Math.round(b.startPct * 100)}%–{Math.round(b.endPct * 100)}%
                            </div>
                          </div>
                          <div className="p-2 space-y-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[10.5px] font-semibold text-[#242421] leading-tight line-clamp-1">
                                {b.headline}
                              </span>
                              {b.isPunchline && (
                                <span className="text-[9px] font-mono uppercase px-1 bg-[#E09F5A]/25 text-[#7A4A10] rounded-sm shrink-0">
                                  Punch
                                </span>
                              )}
                            </div>
                            {b.calloutText && (
                              <div className="text-[10px] font-semibold text-[#8A5A1A] bg-[#EFE8D8] px-1.5 py-0.5 rounded-sm line-clamp-1">
                                {b.calloutText}
                              </div>
                            )}
                            <div className="text-[10px] text-[#77766F] line-clamp-2 leading-snug">
                              {b.spokenCue}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Cost Ledger & Render Action */}
              <div className="pt-4 border-t border-[#E4DDD0] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-0.5 text-[12px]">
                  <div className="font-mono text-[#242421] tabular-nums">
                    Estimated Total:{' '}
                    <span className="font-semibold">
                      {estimate ? formatCurrency(estimate.estimatedTotalUsd) : '$0.00'}
                    </span>{' '}
                    <span className="text-[#77766F]">
                      (Voice {estimate ? formatCurrency(estimate.estimatedVoiceUsd) : '$0.00'} + Visual{' '}
                      {estimate ? formatCurrency(estimate.estimatedVisualUsd) : '$0.00'})
                    </span>
                  </div>
                  <div className="text-[#77766F]">{estimate?.qualityAdvisory}</div>
                </div>

                <button
                  type="button"
                  disabled={renderBusy}
                  onClick={handleTriggerRender}
                  className="px-5 py-3 bg-[#242421] hover:bg-[#3A3934] text-[#F6F3EC] text-[12.5px] font-semibold uppercase tracking-[0.06em] rounded-sm inline-flex items-center justify-center gap-2 shrink-0"
                >
                  <Play className="w-3.5 h-3.5 text-[#B69A65]" />
                  <span>{renderBusy ? 'Rendering MP4...' : 'Render Twin Video'}</span>
                </button>
              </div>
            </div>

            {/* Dark Studio Screening Monitor */}
            <div className="xl:col-span-5 bg-[#1A1917] text-[#F6F3EC] border border-[#2E2C28] rounded-sm p-6 flex flex-col justify-between space-y-5">
              <div className="flex items-center justify-between border-b border-[#2E2C28] pb-3">
                <div>
                  <div className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-[#B69A65]">
                    Studio Screening Monitor
                  </div>
                  <div className="text-[14px] font-semibold mt-0.5 truncate">
                    {latestVideo ? latestVideo.title : 'Awaiting Studio Render'}
                  </div>
                </div>
                {latestVideo && (
                  <a
                    href={latestVideo.videoUrl}
                    download={`${latestVideo.id}.mp4`}
                    className="px-3 py-1.5 bg-[#2A2824] border border-[#3E3B35] text-[12px] rounded-sm inline-flex items-center gap-1.5 hover:border-[#B69A65]"
                  >
                    <Download className="w-3.5 h-3.5 text-[#B69A65]" />
                    <span>MP4</span>
                  </a>
                )}
              </div>

              <div className="flex-1 flex flex-col items-center justify-center bg-[#12110F] border border-[#2E2C28] rounded-sm min-h-[340px] overflow-hidden relative">
                <canvas
                  ref={liveCanvasRef}
                  className={
                    renderBusy && visualProvider === 'free_canvas_animator'
                      ? 'max-h-[420px] w-full object-contain'
                      : 'hidden'
                  }
                />
                {renderBusy && canvasProgress && (
                  <div className="absolute bottom-3 left-3 right-3 bg-[#1A1917]/90 border border-[#B69A65]/50 px-3 py-2 rounded-sm flex items-center justify-between text-[11.5px] font-mono text-[#F6F3EC]">
                    <span>{canvasProgress.phase}</span>
                    <span className="text-[#B69A65]">{canvasProgress.pct}%</span>
                  </div>
                )}
                {!(renderBusy && visualProvider === 'free_canvas_animator') &&
                  (latestVideo ? (
                    <video
                      key={latestVideo.videoUrl}
                      src={latestVideo.videoUrl}
                      poster={latestVideo.thumbnailUrl}
                      controls
                      playsInline
                      className="max-h-[420px] w-full object-contain"
                    />
                  ) : (
                    <div className="text-center px-6 space-y-2 text-[#77766F]">
                      <Film className="w-8 h-8 mx-auto text-[#B69A65]/60" />
                      <p className="text-[13px]">
                        Audition speech (or pick Free Studio Rhythm Bed) and click Render Twin Video to master a
                        playable MP4 here.
                      </p>
                    </div>
                  ))}
              </div>

              {latestVideo && (
                <div className="border-t border-[#2E2C28] pt-3 grid grid-cols-2 gap-2 text-[11.5px] font-mono text-[#BDB7AA] tabular-nums">
                  <div>Estimated: {formatCurrency(latestVideo.estimatedCostUsd)}</div>
                  <div>Actual Cost: {formatCurrency(latestVideo.actualCostUsd)}</div>
                  <div>Duration: {latestVideo.durationSec}s</div>
                  <div>Processed: {(latestVideo.processingMs / 1000).toFixed(2)}s</div>
                  <div className="col-span-2 text-[#B69A65] truncate">{latestVideo.provenanceNote}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Side-by-Side Provider Benchmark Lab */
        <section className="space-y-6">
          <div className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="font-editorial text-[22px] text-[#242421]">
                  Controlled Provider Comparison Suite
                </h2>
                <p className="text-[13px] text-[#77766F]">
                  Tests every provider against the exact same reference portrait, voice context, and benchmark
                  script. Unrun external providers remain honestly marked unverified.
                </p>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                Shared Benchmark Script
              </label>
              <input
                type="text"
                value={benchmarkText}
                onChange={(e) => setBenchmarkText(e.target.value)}
                className="w-full px-3.5 py-2 border border-[#E4DDD0] text-[13.5px] rounded-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {workspace.benchmarks.map((bm) => (
              <div key={bm.id} className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-5 space-y-4">
                <div className="flex items-start justify-between gap-3 border-b border-[#E4DDD0] pb-3">
                  <div>
                    <div className="text-[11px] font-mono uppercase text-[#B69A65]">
                      {bm.category} · {bm.tier.replace('_', ' ')} · Est ${bm.estimatedCostPerMinUsd.toFixed(3)}/min
                    </div>
                    <h3 className="font-editorial text-[20px] text-[#242421] mt-0.5">{bm.providerName}</h3>
                  </div>
                  <button
                    type="button"
                    disabled={benchmarkBusyId === bm.providerId}
                    onClick={() => handleRunBenchmark(bm.providerId, bm.tier)}
                    className="px-3.5 py-1.5 bg-[#242421] text-[#F6F3EC] text-[12px] font-semibold rounded-sm shrink-0 hover:bg-[#3A3934]"
                  >
                    {benchmarkBusyId === bm.providerId
                      ? 'Benchmarking...'
                      : bm.tier === 'premium'
                        ? 'Approve & Run Test'
                        : 'Run Live Test'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[12px] font-mono tabular-nums text-[#77766F]">
                  <div>
                    Status:{' '}
                    <span className={bm.verified ? 'text-[#777D68] font-semibold' : 'text-[#A66E1E]'}>
                      {bm.verified ? 'Verified Run' : 'Not Yet Benchmarked'}
                    </span>
                  </div>
                  <div>
                    Latency: <span className="text-[#242421]">{bm.processingMs ? `${bm.processingMs}ms` : '—'}</span>
                  </div>
                  <div className="col-span-2">Spec: {bm.resolutionOrSampleRate}</div>
                </div>

                <p className="text-[12.5px] text-[#77766F]">{bm.notes}</p>

                {bm.sampleOutputUrl && (
                  <div className="p-3 bg-[#1A1917] rounded-sm">
                    {bm.sampleType === 'audio' ? (
                      <audio controls src={bm.sampleOutputUrl} className="w-full h-9" />
                    ) : (
                      <video controls src={bm.sampleOutputUrl} className="w-full max-h-56 object-contain" />
                    )}
                  </div>
                )}

                {bm.verified && (
                  <div className="pt-2 border-t border-[#E4DDD0] space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F]">
                      Creator Observed Score (1–10)
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11.5px]">
                      {(['voiceSimilarity', 'lipSync', 'renderingQuality'] as const).map((metricKey) => (
                        <label key={metricKey} className="space-y-1">
                          <span className="block text-[#77766F] truncate">{metricKey}</span>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={bm.metrics[metricKey] ?? ''}
                            onChange={(e) => handleRateBenchmark(bm.id, metricKey, Number(e.target.value))}
                            placeholder="1-10"
                            className="w-full px-2 py-1 border border-[#E4DDD0] font-mono rounded-sm"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Explicit Paid Generation Approval Modal */}
      {showApprovalModal && estimate && (
        <div className="fixed inset-0 z-50 bg-[#242421]/60 flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm w-full max-w-lg p-6 space-y-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-6 h-6 text-[#B69A65] shrink-0 mt-0.5" />
              <div>
                <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#77766F]">
                  Explicit Cost Authorization Gate
                </div>
                <h2 className="font-editorial text-[24px] text-[#242421]">Confirm Studio Render Spend</h2>
              </div>
            </div>

            <div className="bg-[#F6F3EC] border border-[#E4DDD0] p-4 rounded-sm space-y-2 text-[13px] font-mono tabular-nums">
              <div className="flex justify-between">
                <span className="text-[#77766F]">Quality Mode</span>
                <span className="font-semibold text-[#242421]">{qualityTier.toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#77766F]">Voice Provider</span>
                <span>
                  {voiceProvider} ({formatCurrency(estimate.estimatedVoiceUsd)})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#77766F]">Visual Engine</span>
                <span>
                  {visualProvider} ({formatCurrency(estimate.estimatedVisualUsd)})
                </span>
              </div>
              <div className="border-t border-[#E4DDD0] pt-2 flex justify-between text-[14.5px] font-semibold text-[#242421]">
                <span>Estimated Charge</span>
                <span>{formatCurrency(estimate.estimatedTotalUsd)}</span>
              </div>
            </div>

            <p className="text-[12.5px] text-[#77766F] leading-relaxed">
              TwinForge AI never triggers paid generation without your explicit per-job confirmation. Local FFmpeg
              post-mastering and disclosure watermarking remain preserved.
            </p>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowApprovalModal(false)}
                className="px-4 py-2 border border-[#E4DDD0] text-[13px] rounded-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeRender(true)}
                className="px-5 py-2 bg-[#242421] text-[#F6F3EC] text-[13px] font-semibold rounded-sm inline-flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4 text-[#B69A65]" />
                <span>Authorize &amp; Render</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

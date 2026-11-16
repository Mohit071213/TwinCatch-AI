import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Mic,
  ShieldCheck,
  Square,
  Trash2,
  Upload,
  Video,
  Volume2,
} from 'lucide-react';
import type {
  FaceCategory,
  TwinLanguage,
  VoiceAudition,
  VoicePitchWarmth,
  VoiceProsodyPreset,
  VoiceProviderId,
  WorkspaceMode,
  WorkspaceState,
} from '../types';
import { apiRequest } from '../lib/api';
import {
  FREE_HINDI_VOICES,
  GEMINI_STUDIO_VOICES,
  PITCH_WARMTH_OPTIONS,
  VOICE_PROSODY_PRESETS,
  defaultVoiceForProvider,
  getFreeHindiVoiceOption,
  samplePreviewText,
} from '../lib/voices';

interface DigitalTwinViewProps {
  workspace: WorkspaceState;
  mode: WorkspaceMode;
  onUpdateWorkspace: (w: WorkspaceState) => void;
}

const FACE_SLOTS: Array<{ id: FaceCategory; title: string; hint: string }> = [
  { id: 'front', title: 'Front-Facing Portrait', hint: 'Neutral direct gaze, even daylight' },
  { id: 'left_profile', title: 'Left Profile', hint: '45–90° left angle for facial geometry' },
  { id: 'right_profile', title: 'Right Profile', hint: '45–90° right angle' },
  { id: 'expression_smiling', title: 'Smiling Expression', hint: 'Natural warm teeth/closed smile' },
  { id: 'expression_serious', title: 'Serious / Editorial', hint: 'Authoritative neutral gaze' },
  { id: 'expression_talking', title: 'Talking Mid-Thought', hint: 'Natural mouth openness & brow motion' },
  { id: 'lighting_variation', title: 'Lighting Variation', hint: 'Soft key / warm tungsten contrast' },
  { id: 'reference_video', title: 'Short Reference Video', hint: '5–15s MP4/WebM head movement clip' },
];

export const DigitalTwinView: React.FC<DigitalTwinViewProps> = ({
  workspace,
  mode,
  onUpdateWorkspace,
}) => {
  const { twin } = workspace;
  const [selectedFaceCategory, setSelectedFaceCategory] = useState<FaceCategory>('front');
  const [voiceLabel, setVoiceLabel] = useState('Studio Conversational Sample');
  const [voiceLang, setVoiceLang] = useState<TwinLanguage>(twin.personality.primaryLanguage || 'English');
  const [voiceEmotion, setVoiceEmotion] = useState<'Conversational' | 'Authoritative' | 'Warm' | 'Energetic' | 'Reflective'>('Conversational');

  const [personality, setPersonality] = useState(twin.personality);
  const [catchphraseInput, setCatchphraseInput] = useState(twin.personality.catchphrases.join('\n'));

  const [ownerFullName, setOwnerFullName] = useState(twin.consent.ownerFullName);
  const [attested, setAttested] = useState(twin.consent.attested);
  const [usageScope, setUsageScope] = useState(twin.consent.likenessUsageScope);
  const [requireDisclosure, setRequireDisclosure] = useState(twin.consent.requireAiDisclosure);

  useEffect(() => {
    setPersonality(workspace.twin.personality);
    setCatchphraseInput(workspace.twin.personality.catchphrases.join('\n'));
    setOwnerFullName(workspace.twin.consent.ownerFullName);
    setAttested(workspace.twin.consent.attested);
    setUsageScope(workspace.twin.consent.likenessUsageScope);
    setRequireDisclosure(workspace.twin.consent.requireAiDisclosure);
  }, [workspace.twin.personality, workspace.twin.consent]);

  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const [busyMsg, setBusyMsg] = useState('');
  const [savedNotice, setSavedNotice] = useState('');
  const [error, setError] = useState('');
  const [personaPreviewUrl, setPersonaPreviewUrl] = useState('');
  const [personaPreviewMeta, setPersonaPreviewMeta] = useState('');
  const [personaPreviewBusy, setPersonaPreviewBusy] = useState(false);

  const handlePreviewPersonaVoice = async () => {
    setError('');
    setPersonaPreviewBusy(true);
    try {
      const vp: VoiceProviderId = personality.preferredVoiceProvider || 'free_hindi_neural';
      const vid = personality.preferredVoiceId || defaultVoiceForProvider(vp, personality.primaryLanguage);
      const res = await apiRequest<{ workspace: WorkspaceState; audition: VoiceAudition }>(
        '/api/voice/audition',
        mode,
        {
          method: 'POST',
          body: JSON.stringify({
            text: samplePreviewText(personality.primaryLanguage || 'Hindi'),
            provider: vp,
            voiceIdentity: vid,
            language: personality.primaryLanguage || 'Hindi',
            emotion: 'Warm & Editorial',
            speakingSpeed: personality.voicePace ?? 0.95,
            prosodyPreset: personality.voiceProsodyPreset || 'warm_storyteller',
            pitchWarmth: personality.voicePitchWarmth || 'warm',
            naturalPauses: personality.naturalPausesEnabled !== false,
          }),
        }
      );
      onUpdateWorkspace(res.workspace);
      setPersonaPreviewUrl(res.audition.audioUrl);
      setPersonaPreviewMeta(`${res.audition.durationSec}s WAV · ${res.audition.voiceIdentity} · $0.00`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPersonaPreviewBusy(false);
    }
  };

  const handleFaceUpload = async (e: React.ChangeEvent<HTMLInputElement>, category: FaceCategory) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setBusyMsg(`Uploading ${file.name}...`);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', category);
      fd.append('label', `${FACE_SLOTS.find((s) => s.id === category)?.title || category} · ${file.name}`);
      const updated = await apiRequest<WorkspaceState>('/api/twin/upload-face', mode, {
        method: 'POST',
        body: fd,
      });
      onUpdateWorkspace(updated);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyMsg('');
      e.target.value = '';
    }
  };

  const handleDeleteFace = async (id: string) => {
    setError('');
    try {
      const updated = await apiRequest<WorkspaceState>(`/api/twin/face/${id}`, mode, { method: 'DELETE' });
      onUpdateWorkspace(updated);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleVoiceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setBusyMsg(`Uploading voice sample ${file.name}...`);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('label', voiceLabel || file.name);
      fd.append('language', voiceLang);
      fd.append('emotion', voiceEmotion);
      const updated = await apiRequest<WorkspaceState>('/api/twin/upload-voice', mode, {
        method: 'POST',
        body: fd,
      });
      onUpdateWorkspace(updated);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyMsg('');
      e.target.value = '';
    }
  };

  const toggleRecording = async () => {
    setError('');
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        const file = new File([blob], `mic_${Date.now()}.webm`, { type: blob.type });
        setBusyMsg('Saving recorded microphone sample...');
        try {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('label', voiceLabel || 'Microphone Recording');
          fd.append('language', voiceLang);
          fd.append('emotion', voiceEmotion);
          const updated = await apiRequest<WorkspaceState>('/api/twin/upload-voice', mode, {
            method: 'POST',
            body: fd,
          });
          onUpdateWorkspace(updated);
        } catch (err: any) {
          setError(err.message);
        } finally {
          setBusyMsg('');
        }
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      setError('Microphone permission denied or unavailable. Please upload an audio file instead.');
    }
  };

  const handleTranscribeVoice = async (id: string) => {
    setError('');
    setBusyMsg('Verifying speech clarity & transcript via Gemini 3.5 Transcribe...');
    try {
      const updated = await apiRequest<WorkspaceState>(`/api/twin/transcribe-voice/${id}`, mode, {
        method: 'POST',
      });
      onUpdateWorkspace(updated);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyMsg('');
    }
  };

  const handleQuickVerifyVoice = async (id: string) => {
    setError('');
    setBusyMsg('Marking voice sample verified for studio readiness...');
    try {
      const updated = await apiRequest<WorkspaceState>(`/api/twin/verify-voice/${id}`, mode, {
        method: 'POST',
      });
      onUpdateWorkspace(updated);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyMsg('');
    }
  };

  const handleDeleteVoice = async (id: string) => {
    try {
      const updated = await apiRequest<WorkspaceState>(`/api/twin/voice/${id}`, mode, { method: 'DELETE' });
      onUpdateWorkspace(updated);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSavePersonality = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSavedNotice('');
    setBusyMsg('Saving personality & Hindi voice prosody calibration...');
    try {
      const updated = await apiRequest<WorkspaceState>('/api/twin/personality', mode, {
        method: 'PUT',
        body: JSON.stringify({
          ...personality,
          catchphrases: catchphraseInput
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      onUpdateWorkspace(updated);
      setSavedNotice('Persona voice & prosody saved — automatically synced to Video Studio.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyMsg('');
    }
  };

  const handleSaveConsent = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusyMsg('Recording biometric likeness attestation...');
    try {
      const updated = await apiRequest<WorkspaceState>('/api/twin/consent', mode, {
        method: 'POST',
        body: JSON.stringify({
          ownerFullName,
          attested,
          likenessUsageScope: usageScope,
          requireAiDisclosure: requireDisclosure,
        }),
      });
      onUpdateWorkspace(updated);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyMsg('');
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Title & Honest Readiness Strip */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#E4DDD0] pb-6">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#B69A65] font-semibold">
            Personal Identity Studio
          </div>
          <h1 className="font-editorial text-[34px] text-[#242421] mt-1">My Digital Twin</h1>
          <p className="text-[14px] text-[#77766F] mt-1">
            Private vault for authorized face references, multilingual voice samples, speaking persona, and
            biometric provenance.
          </p>
        </div>
        <div className="bg-[#FFFFFF] border border-[#E4DDD0] px-5 py-3 rounded-sm text-right shrink-0">
          <div className="text-[11px] uppercase tracking-[0.12em] text-[#77766F]">
            Local Studio Readiness
          </div>
          <div className="font-mono text-[24px] font-semibold tabular-nums text-[#242421]">
            {twin.readiness.overallScore}%
          </div>
          <div className="text-[11px] font-mono tabular-nums text-[#77766F]">
            Face {twin.readiness.faceScore}% · Voice {twin.readiness.voiceScore}% · Persona{' '}
            {twin.readiness.personalityScore}% · Consent {twin.readiness.consentVerified ? '100%' : '0%'}
          </div>
          <div className="text-[11.5px] text-[#77766F] mt-0.5">
            {twin.readiness.overallScore === 100 ? (
              <span className="font-semibold text-[#777D68]">
                100% Complete · Multi-Angle &amp; Verified
              </span>
            ) : (
              <span>
                {twin.readiness.missingItems.length} item(s) left for 100%
              </span>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-[#9E3B33]/10 border border-[#9E3B33]/30 text-[#9E3B33] text-[13px] rounded-sm">
          {error}
        </div>
      )}
      {busyMsg && (
        <div className="p-3.5 bg-[#EFE8D8] border border-[#B69A65]/40 text-[#242421] text-[13px] rounded-sm">
          {busyMsg}
        </div>
      )}

      {/* 1. Face & Expression Reference Library */}
      <section className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E4DDD0] pb-4">
          <div>
            <h2 className="font-editorial text-[24px] text-[#242421]">
              Face Angles, Expressions &amp; Reference Video
            </h2>
            <p className="text-[13px] text-[#77766F]">
              Upload front, left/right profiles, smiling/serious/talking expressions, lighting variations, and
              short clips.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedFaceCategory}
              onChange={(e) => setSelectedFaceCategory(e.target.value as FaceCategory)}
              className="px-3 py-2 border border-[#E4DDD0] bg-[#F6F3EC] text-[13px] rounded-sm"
            >
              {FACE_SLOTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <label className="px-4 py-2 bg-[#242421] text-[#F6F3EC] text-[12.5px] font-semibold rounded-sm cursor-pointer inline-flex items-center gap-2 hover:bg-[#3A3934]">
              <Upload className="w-3.5 h-3.5 text-[#B69A65]" />
              <span>Upload Asset</span>
              <input
                type="file"
                accept="image/*,video/*"
                onChange={(e) => handleFaceUpload(e, selectedFaceCategory)}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Coverage Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {FACE_SLOTS.map((slot) => {
            const count = twin.faceAssets.filter((a) => a.category === slot.id).length;
            return (
              <div
                key={slot.id}
                className={`p-3 border rounded-sm ${
                  count > 0 ? 'border-[#777D68]/50 bg-[#E9ECE4]/40' : 'border-[#E4DDD0] bg-[#FAF8F4]'
                }`}
              >
                <div className="flex items-center justify-between text-[12px] font-semibold text-[#242421]">
                  <span className="truncate">{slot.title}</span>
                  <span className="font-mono text-[11px]">{count}</span>
                </div>
                <p className="text-[11px] text-[#77766F] mt-1">{slot.hint}</p>
              </div>
            );
          })}
        </div>

        {/* Uploaded Previews */}
        {twin.faceAssets.length === 0 ? (
          <div className="py-8 text-center text-[13.5px] text-[#77766F] border border-dashed border-[#E4DDD0] rounded-sm">
            No face photographs or reference videos uploaded yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {twin.faceAssets.map((asset) => (
              <div key={asset.id} className="border border-[#E4DDD0] rounded-sm overflow-hidden bg-[#FAF8F4]">
                <div className="aspect-[3/4] bg-[#1A1917] relative overflow-hidden">
                  {asset.mimeType.startsWith('video/') ? (
                    <video src={asset.url} controls className="w-full h-full object-cover" />
                  ) : (
                    <img
                      src={asset.url}
                      alt={asset.label}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="p-3 space-y-1.5">
                  <div className="text-[11px] font-mono uppercase text-[#B69A65]">
                    {asset.category.replace('_', ' ')}
                  </div>
                  <div className="text-[12.5px] font-semibold text-[#242421] truncate">{asset.label}</div>
                  <div className="flex items-center justify-between text-[11px] text-[#77766F]">
                    <span>{Math.round(asset.sizeBytes / 1024)} KB</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteFace(asset.id)}
                      className="text-[#9E3B33] hover:underline inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2. Voice Reference Studio */}
      <section className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-6 space-y-6">
        <div className="border-b border-[#E4DDD0] pb-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="font-editorial text-[24px] text-[#242421]">
              Voice Reference Vault (Hindi, Hinglish &amp; English)
            </h2>
            <p className="text-[13px] text-[#77766F]">
              Record directly or upload studio voice samples across speaking emotions, then verify transcripts.
            </p>
          </div>
        </div>

        {/* Upload / Record Bar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 p-4 bg-[#F6F3EC] border border-[#E4DDD0] rounded-sm items-end">
          <div className="md:col-span-4">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
              Sample Label
            </label>
            <input
              type="text"
              value={voiceLabel}
              onChange={(e) => setVoiceLabel(e.target.value)}
              className="w-full px-3 py-2 border border-[#E4DDD0] bg-[#FFFFFF] text-[13px] rounded-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
              Language
            </label>
            <select
              value={voiceLang}
              onChange={(e) => setVoiceLang(e.target.value as TwinLanguage)}
              className="w-full px-3 py-2 border border-[#E4DDD0] bg-[#FFFFFF] text-[13px] rounded-sm"
            >
              <option value="English">English</option>
              <option value="Hindi">Hindi</option>
              <option value="Hinglish">Hinglish</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
              Emotion
            </label>
            <select
              value={voiceEmotion}
              onChange={(e) => setVoiceEmotion(e.target.value as any)}
              className="w-full px-3 py-2 border border-[#E4DDD0] bg-[#FFFFFF] text-[13px] rounded-sm"
            >
              <option value="Conversational">Conversational</option>
              <option value="Authoritative">Authoritative</option>
              <option value="Warm">Warm</option>
              <option value="Energetic">Energetic</option>
              <option value="Reflective">Reflective</option>
            </select>
          </div>
          <div className="md:col-span-4 flex items-center gap-2">
            <button
              type="button"
              onClick={toggleRecording}
              className={`flex-1 py-2 px-3 text-[12.5px] font-semibold rounded-sm inline-flex items-center justify-center gap-1.5 border ${
                recording
                  ? 'bg-[#9E3B33] text-[#FFFFFF] border-[#9E3B33]'
                  : 'bg-[#FFFFFF] text-[#242421] border-[#E4DDD0] hover:border-[#B69A65]'
              }`}
            >
              {recording ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-[#B69A65]" />}
              <span>{recording ? 'Stop Recording' : 'Record Mic'}</span>
            </button>
            <label className="flex-1 py-2 px-3 bg-[#242421] text-[#F6F3EC] text-[12.5px] font-semibold rounded-sm cursor-pointer inline-flex items-center justify-center gap-1.5 hover:bg-[#3A3934]">
              <Upload className="w-3.5 h-3.5 text-[#B69A65]" />
              <span>Upload Audio</span>
              <input type="file" accept="audio/*" onChange={handleVoiceUpload} className="hidden" />
            </label>
          </div>
        </div>

        {/* Voice Sample List */}
        {twin.voiceSamples.length === 0 ? (
          <div className="py-6 text-center text-[13.5px] text-[#77766F] border border-dashed border-[#E4DDD0] rounded-sm">
            No voice samples recorded or uploaded yet.
          </div>
        ) : (
          <div className="divide-y divide-[#E4DDD0] border border-[#E4DDD0] rounded-sm">
            {twin.voiceSamples.map((vs) => (
              <div key={vs.id} className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[14px] text-[#242421]">{vs.label}</span>
                    <span className="font-mono text-[11px] text-[#77766F]">
                      {vs.language} · {vs.emotion} {vs.durationSec ? `· ${vs.durationSec}s` : ''}
                    </span>
                    {vs.verified && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#777D68]">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Verified Transcript
                      </span>
                    )}
                  </div>
                  {vs.transcript && (
                    <p className="text-[12.5px] italic text-[#77766F] bg-[#FAF8F4] px-3 py-1.5 border border-[#E4DDD0] rounded-sm">
                      "{vs.transcript}"
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0 flex-wrap">
                  {vs.url ? (
                    <audio controls src={vs.url} className="h-8 max-w-[210px]" />
                  ) : (
                    <span className="text-[11.5px] text-[#77766F] font-mono">Metadata-only demo sample</span>
                  )}
                  {!vs.verified && (
                    <button
                      type="button"
                      onClick={() => handleQuickVerifyVoice(vs.id)}
                      className="px-3 py-1.5 bg-[#FAF8F4] border border-[#777D68]/50 text-[#242421] text-[12px] font-semibold rounded-sm hover:bg-[#E9ECE4] whitespace-nowrap shrink-0"
                    >
                      Quick Verify
                    </button>
                  )}
                  {vs.url && (
                    <button
                      type="button"
                      onClick={() => handleTranscribeVoice(vs.id)}
                      className="px-3 py-1.5 border border-[#E4DDD0] text-[12px] font-semibold rounded-sm hover:border-[#B69A65] whitespace-nowrap shrink-0"
                    >
                      Verify via Transcribe
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteVoice(vs.id)}
                    className="p-1.5 text-[#9E3B33] hover:bg-[#9E3B33]/10 rounded-sm"
                    title="Delete sample"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. Personality Calibration + 4. Biometric Consent */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleSavePersonality}
          className="lg:col-span-7 bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-6 space-y-4"
        >
          <div className="border-b border-[#E4DDD0] pb-3">
            <h2 className="font-editorial text-[22px] text-[#242421]">
              Personality, Language &amp; Speaking Pattern
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                Creator Display Name
              </label>
              <input
                type="text"
                value={personality.creatorName}
                onChange={(e) => setPersonality({ ...personality, creatorName: e.target.value })}
                className="w-full px-3 py-2 border border-[#E4DDD0] text-[13.5px] rounded-sm"
              />
            </div>
            <div>
              <label className="block text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                Creator Handle
              </label>
              <input
                type="text"
                value={personality.handle}
                onChange={(e) => setPersonality({ ...personality, handle: e.target.value })}
                placeholder="@yourhandle"
                className="w-full px-3 py-2 border border-[#E4DDD0] text-[13.5px] rounded-sm"
              />
            </div>
            <div>
              <label className="block text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                Primary Language
              </label>
              <select
                value={personality.primaryLanguage}
                onChange={(e) =>
                  setPersonality({ ...personality, primaryLanguage: e.target.value as TwinLanguage })
                }
                className="w-full px-3 py-2 border border-[#E4DDD0] text-[13.5px] rounded-sm"
              >
                <option value="English">English</option>
                <option value="Hindi">Hindi</option>
                <option value="Hinglish">Hinglish</option>
              </select>
            </div>
            <div>
              <label className="block text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                Formality Register
              </label>
              <select
                value={personality.formalityLevel}
                onChange={(e) => setPersonality({ ...personality, formalityLevel: e.target.value as any })}
                className="w-full px-3 py-2 border border-[#E4DDD0] text-[13.5px] rounded-sm"
              >
                <option value="Casual">Casual</option>
                <option value="Conversational Editorial">Conversational Editorial</option>
                <option value="Authoritative">Authoritative</option>
                <option value="Executive">Executive</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
              Content Niche (used for Trend Radar scoring)
            </label>
            <input
              type="text"
              value={personality.niche}
              onChange={(e) => setPersonality({ ...personality, niche: e.target.value })}
              className="w-full px-3 py-2 border border-[#E4DDD0] text-[13.5px] rounded-sm"
            />
          </div>

          <div>
            <label className="block text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
              Speaking Style &amp; Vocabulary
            </label>
            <textarea
              rows={2}
              value={personality.speakingStyle}
              onChange={(e) => setPersonality({ ...personality, speakingStyle: e.target.value })}
              className="w-full px-3 py-2 border border-[#E4DDD0] text-[13.5px] rounded-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                Humour Style
              </label>
              <input
                type="text"
                value={personality.humourStyle}
                onChange={(e) => setPersonality({ ...personality, humourStyle: e.target.value })}
                className="w-full px-3 py-2 border border-[#E4DDD0] text-[13.5px] rounded-sm"
              />
            </div>
            <div>
              <label className="block text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                Accent &amp; Pronunciation
              </label>
              <input
                type="text"
                value={personality.accentAndPronunciation}
                onChange={(e) => setPersonality({ ...personality, accentAndPronunciation: e.target.value })}
                className="w-full px-3 py-2 border border-[#E4DDD0] text-[13.5px] rounded-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
              Signature Phrases / Common Expressions (one per line)
            </label>
            <textarea
              rows={2}
              value={catchphraseInput}
              onChange={(e) => setCatchphraseInput(e.target.value)}
              placeholder="Seedha point pe aate hain.&#10;Let us look at the real numbers."
              className="w-full px-3 py-2 border border-[#E4DDD0] text-[13.5px] rounded-sm"
            />
          </div>

          <div className="p-4 bg-[#FAF8F4] border border-[#E4DDD0] rounded-sm space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#242421] inline-flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-[#B69A65]" />
                <span>Default Persona Voice Engine (Free Conversational Hindi · $0.00)</span>
              </div>
              <span className="text-[11px] font-mono text-[#777D68]">Synced automatically to Video Studio</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
              <div className="sm:col-span-4">
                <label className="block text-[11px] text-[#77766F] mb-1">Voice Tier / Engine</label>
                <select
                  value={personality.preferredVoiceProvider || 'free_hindi_neural'}
                  onChange={(e) => {
                    const nextProv = e.target.value as VoiceProviderId;
                    setPersonality({
                      ...personality,
                      preferredVoiceProvider: nextProv,
                      preferredVoiceId: defaultVoiceForProvider(nextProv, personality.primaryLanguage),
                    });
                  }}
                  className="w-full px-2.5 py-2 border border-[#E4DDD0] bg-[#FFFFFF] text-[12.5px] rounded-sm"
                >
                  <option value="free_hindi_neural">Free Natural Hindi Neural ($0.00)</option>
                  <option value="gemini_flash_tts">Gemini 3.8 Flash TTS · Breath Cues (Free Tier $0.00)</option>
                  <option value="gemini_lite_tts">Gemini 3.8 Flash Lite TTS (Free Tier $0.00)</option>
                </select>
              </div>
              <div className="sm:col-span-5">
                <label className="block text-[11px] text-[#77766F] mb-1">Persona Voice Actor (Male &amp; Female)</label>
                <select
                  value={
                    personality.preferredVoiceId ||
                    defaultVoiceForProvider(
                      personality.preferredVoiceProvider || 'free_hindi_neural',
                      personality.primaryLanguage
                    )
                  }
                  onChange={(e) => {
                    const nextId = e.target.value;
                    const opt = FREE_HINDI_VOICES.find((v) => v.id === nextId);
                    const recPreset = opt?.recommendedPreset;
                    const presetCfg = recPreset
                      ? VOICE_PROSODY_PRESETS.find((p) => p.id === recPreset)
                      : undefined;
                    setPersonality({
                      ...personality,
                      preferredVoiceId: nextId,
                      ...(presetCfg
                        ? {
                            voiceProsodyPreset: presetCfg.id,
                            voicePitchWarmth: presetCfg.pitchWarmth,
                            voicePace: presetCfg.pace,
                            naturalPausesEnabled: presetCfg.naturalPauses,
                          }
                        : {}),
                    });
                  }}
                  className="w-full px-2.5 py-2 border border-[#E4DDD0] bg-[#FFFFFF] text-[12.5px] rounded-sm"
                >
                  {(personality.preferredVoiceProvider || 'free_hindi_neural') === 'free_hindi_neural' ? (
                    <>
                      <optgroup label="Male — Expressive & Conversational Hindi / Hinglish">
                        {FREE_HINDI_VOICES.filter((v) => v.gender === 'Male').map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Female — Expressive & Warm Hindi / Hinglish">
                        {FREE_HINDI_VOICES.filter((v) => v.gender === 'Female').map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.label}
                          </option>
                        ))}
                      </optgroup>
                    </>
                  ) : (
                    GEMINI_STUDIO_VOICES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className="sm:col-span-3">
                <button
                  type="button"
                  disabled={personaPreviewBusy}
                  onClick={handlePreviewPersonaVoice}
                  className="w-full py-2 px-3 bg-[#FFFFFF] border border-[#242421] text-[#242421] text-[12px] font-semibold rounded-sm hover:bg-[#EFE8D8] inline-flex items-center justify-center gap-1.5"
                >
                  <Volume2 className="w-3.5 h-3.5 text-[#B69A65]" />
                  <span>{personaPreviewBusy ? 'Synthesizing...' : 'Preview Voice'}</span>
                </button>
              </div>
            </div>

            {(personality.preferredVoiceProvider || 'free_hindi_neural') === 'free_hindi_neural' && (() => {
              const selectedMeta = getFreeHindiVoiceOption(personality.preferredVoiceId);
              const activePreset = personality.voiceProsodyPreset || 'warm_storyteller';
              const activeWarmth = personality.voicePitchWarmth || 'warm';
              const activePace = personality.voicePace ?? 1.08;
              const pausesOn = personality.naturalPausesEnabled !== false;
              const presetInfo = VOICE_PROSODY_PRESETS.find((p) => p.id === activePreset);
              return (
                <div className="space-y-3 border-t border-[#E4DDD0] pt-3">
                  <div className="text-[12px] text-[#77766F]">
                    <span className="font-semibold text-[#242421]">{selectedMeta.shortName}</span>
                    {' · '}
                    <span>{selectedMeta.gender}</span>
                    {' · '}
                    <span>{selectedMeta.style}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    <div className="sm:col-span-4">
                      <label className="block text-[11px] text-[#77766F] mb-1">
                        Conversational Delivery Preset
                      </label>
                      <select
                        value={activePreset}
                        onChange={(e) => {
                          const nextPresetId = e.target.value as VoiceProsodyPreset;
                          const cfg = VOICE_PROSODY_PRESETS.find((p) => p.id === nextPresetId);
                          setPersonality({
                            ...personality,
                            voiceProsodyPreset: nextPresetId,
                            voicePitchWarmth: cfg?.pitchWarmth || activeWarmth,
                            voicePace: cfg?.pace ?? activePace,
                            naturalPausesEnabled: cfg?.naturalPauses ?? pausesOn,
                          });
                        }}
                        className="w-full px-2.5 py-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[12.5px] rounded-sm"
                      >
                        {VOICE_PROSODY_PRESETS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-4">
                      <label className="block text-[11px] text-[#77766F] mb-1">
                        Pitch Warmth
                      </label>
                      <select
                        value={activeWarmth}
                        onChange={(e) =>
                          setPersonality({
                            ...personality,
                            voicePitchWarmth: e.target.value as VoicePitchWarmth,
                          })
                        }
                        className="w-full px-2.5 py-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[12.5px] rounded-sm"
                      >
                        {PITCH_WARMTH_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-4">
                      <div className="flex items-center justify-between text-[11px] text-[#77766F] mb-1">
                        <span>Speaking Pace</span>
                        <span className="font-mono tabular-nums font-semibold text-[#242421]">
                          {activePace.toFixed(2)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.85}
                        max={1.3}
                        step={0.05}
                        value={activePace}
                        onChange={(e) =>
                          setPersonality({
                            ...personality,
                            voicePace: Number(e.target.value),
                          })
                        }
                        className="w-full accent-[#242421]"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-0.5">
                    <label className="inline-flex items-center gap-2 text-[12px] text-[#242421] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pausesOn}
                        onChange={(e) =>
                          setPersonality({
                            ...personality,
                            naturalPausesEnabled: e.target.checked,
                          })
                        }
                        className="accent-[#242421]"
                      />
                      <span>
                        Natural breath &amp; thinking pauses (Hindi danda ।, commas &amp; conversational dashes)
                      </span>
                    </label>
                    {presetInfo && (
                      <span className="text-[11px] font-mono text-[#77766F]">{presetInfo.description}</span>
                    )}
                  </div>
                </div>
              );
            })()}

            {personaPreviewUrl && (
              <div className="space-y-1.5 border-t border-[#E4DDD0] pt-2.5">
                {personaPreviewMeta && (
                  <div className="text-[11px] font-mono tabular-nums text-[#777D68]">
                    {personaPreviewMeta}
                  </div>
                )}
                <audio controls src={personaPreviewUrl} className="w-full h-8" />
              </div>
            )}
          </div>

          {savedNotice && (
            <div className="p-3 bg-[#E9ECE4] border border-[#777D68]/40 text-[#242421] text-[12.5px] rounded-sm">
              {savedNotice}
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="px-5 py-2.5 bg-[#242421] text-[#F6F3EC] text-[12.5px] font-semibold rounded-sm hover:bg-[#3A3934]"
            >
              Save Persona Profile
            </button>
          </div>
        </form>

        {/* Biometric Consent & Ownership */}
        <form
          onSubmit={handleSaveConsent}
          className="lg:col-span-5 bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-6 space-y-4 flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="border-b border-[#E4DDD0] pb-3 flex items-center justify-between">
              <h2 className="font-editorial text-[22px] text-[#242421]">Consent &amp; Provenance</h2>
              <ShieldCheck
                className={`w-5 h-5 ${twin.consent.attested ? 'text-[#777D68]' : 'text-[#A66E1E]'}`}
              />
            </div>

            <p className="text-[13px] text-[#77766F] leading-relaxed">
              Video generation in Studio requires signed biometric likeness ownership attestation. TwinForge never
              claims external voice or avatar training unless confirmed by the provider.
            </p>

            <div>
              <label className="block text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                Authorized Likeness Owner Full Name
              </label>
              <input
                type="text"
                value={ownerFullName}
                onChange={(e) => setOwnerFullName(e.target.value)}
                placeholder="Legal Name"
                className="w-full px-3 py-2 border border-[#E4DDD0] text-[13.5px] rounded-sm"
              />
            </div>

            <div>
              <label className="block text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                Permitted Usage Scope
              </label>
              <textarea
                rows={2}
                value={usageScope}
                onChange={(e) => setUsageScope(e.target.value)}
                className="w-full px-3 py-2 border border-[#E4DDD0] text-[13px] rounded-sm"
              />
            </div>

            <label className="flex items-start gap-2.5 text-[13px] cursor-pointer">
              <input
                type="checkbox"
                checked={attested}
                onChange={(e) => setAttested(e.target.checked)}
                className="mt-0.5 accent-[#242421]"
              />
              <span>
                I attest that all uploaded facial and voice samples belong exclusively to me and grant render
                authorization.
              </span>
            </label>

            <label className="flex items-start gap-2.5 text-[13px] cursor-pointer">
              <input
                type="checkbox"
                checked={requireDisclosure}
                onChange={(e) => setRequireDisclosure(e.target.checked)}
                className="mt-0.5 accent-[#242421]"
              />
              <span>Embed AI Digital Twin provenance disclosure watermark by default.</span>
            </label>
          </div>

          <div className="pt-4 border-t border-[#E4DDD0] flex items-center justify-between gap-3">
            <span className="text-[11.5px] font-mono text-[#77766F]">
              {twin.consent.attestedAt
                ? `Signed ${new Date(twin.consent.attestedAt).toLocaleDateString()}`
                : 'Unsigned'}
            </span>
            <button
              type="submit"
              className="px-4 py-2.5 bg-[#777D68] text-[#FFFFFF] text-[12.5px] font-semibold rounded-sm hover:opacity-90 inline-flex items-center gap-1.5"
            >
              <Video className="w-3.5 h-3.5" />
              <span>Save Consent Gate</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

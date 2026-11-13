import React, { useState } from 'react';
import { CheckCircle2, ShieldCheck, Upload, Volume2, X } from 'lucide-react';
import type { TwinLanguage, VoiceAudition, VoiceProviderId, WorkspaceMode, WorkspaceState } from '../types';
import { apiRequest } from '../lib/api';
import { FREE_HINDI_VOICES, samplePreviewText } from '../lib/voices';

interface OnboardingModalProps {
  workspace: WorkspaceState;
  mode: WorkspaceMode;
  onUpdateWorkspace: (w: WorkspaceState) => void;
  onClose: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  workspace,
  mode,
  onUpdateWorkspace,
  onClose,
}) => {
  const [step, setStep] = useState(1);
  const [ownerName, setOwnerName] = useState(
    workspace.twin.consent.ownerFullName || workspace.twin.personality.creatorName || ''
  );
  const [attested, setAttested] = useState(workspace.twin.consent.attested);
  const [niche, setNiche] = useState(workspace.twin.personality.niche);
  const [speakingStyle, setSpeakingStyle] = useState(workspace.twin.personality.speakingStyle);
  const [primaryLang, setPrimaryLang] = useState<TwinLanguage>(
    workspace.twin.personality.primaryLanguage || 'Hindi'
  );
  const [preferredVoiceProvider, setPreferredVoiceProvider] = useState<VoiceProviderId>(
    workspace.twin.personality.preferredVoiceProvider || 'free_hindi_neural'
  );
  const [preferredVoiceId, setPreferredVoiceId] = useState<string>(
    workspace.twin.personality.preferredVoiceId || 'hi-IN-MadhurNeural'
  );
  const [previewAudioUrl, setPreviewAudioUrl] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSaveConsent = async () => {
    setError('');
    if (!ownerName.trim()) {
      setError('Please enter your legal creator name to attest likeness ownership.');
      return;
    }
    setBusy(true);
    try {
      const updated = await apiRequest<WorkspaceState>('/api/twin/consent', mode, {
        method: 'POST',
        body: JSON.stringify({
          ownerFullName: ownerName,
          attested,
          requireAiDisclosure: true,
          likenessUsageScope: 'Personal creator content production only.',
        }),
      });
      onUpdateWorkspace(updated);
      setStep(2);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleFaceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', 'front');
      fd.append('label', `Onboarding Portrait · ${file.name}`);
      const updated = await apiRequest<WorkspaceState>('/api/twin/upload-face', mode, {
        method: 'POST',
        body: fd,
      });
      onUpdateWorkspace(updated);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleVoiceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('label', `Onboarding Voice · ${file.name}`);
      fd.append('language', primaryLang);
      fd.append('emotion', 'Conversational');
      const updated = await apiRequest<WorkspaceState>('/api/twin/upload-voice', mode, {
        method: 'POST',
        body: fd,
      });
      onUpdateWorkspace(updated);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handlePreviewHindiVoice = async () => {
    setError('');
    setPreviewBusy(true);
    try {
      const res = await apiRequest<{ workspace: WorkspaceState; audition: VoiceAudition }>(
        '/api/voice/audition',
        mode,
        {
          method: 'POST',
          body: JSON.stringify({
            text: samplePreviewText(primaryLang),
            provider: preferredVoiceProvider,
            voiceIdentity: preferredVoiceId,
            language: primaryLang,
            emotion: 'Warm & Editorial',
          }),
        }
      );
      onUpdateWorkspace(res.workspace);
      setPreviewAudioUrl(res.audition.audioUrl);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPreviewBusy(false);
    }
  };

  const handleSavePersonality = async () => {
    setBusy(true);
    setError('');
    try {
      const updated = await apiRequest<WorkspaceState>('/api/twin/personality', mode, {
        method: 'PUT',
        body: JSON.stringify({
          creatorName: ownerName.trim() || workspace.twin.personality.creatorName,
          niche,
          speakingStyle,
          primaryLanguage: primaryLang,
          preferredVoiceProvider,
          preferredVoiceId,
        }),
      });
      onUpdateWorkspace(updated);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#242421]/50 flex items-center justify-center p-4">
      <div className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#E4DDD0] bg-[#F6F3EC] flex items-center justify-between">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#77766F]">
              Identity Setup · Step {step} of 4
            </div>
            <h2 className="font-editorial text-[24px] text-[#242421] mt-0.5">
              Personal Digital Twin Onboarding
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#77766F] hover:text-[#242421]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Progress Bar */}
        <div className="grid grid-cols-4 border-b border-[#E4DDD0] bg-[#FFFFFF] text-[11.5px]">
          {[
            { n: 1, title: '1. Consent' },
            { n: 2, title: '2. Likeness' },
            { n: 3, title: '3. Voice' },
            { n: 4, title: '4. Persona' },
          ].map((s) => (
            <button
              key={s.n}
              type="button"
              onClick={() => setStep(s.n)}
              className={`py-2.5 text-center border-r last:border-r-0 border-[#E4DDD0] transition-colors ${
                step === s.n
                  ? 'bg-[#EFE8D8] font-semibold text-[#242421]'
                  : 'text-[#77766F] hover:text-[#242421]'
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-[#9E3B33]/10 border border-[#9E3B33]/30 text-[#9E3B33] text-[13px] rounded-sm">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-[#F6F3EC] border border-[#E4DDD0] rounded-sm">
                <ShieldCheck className="w-5 h-5 text-[#777D68] shrink-0 mt-0.5" />
                <p className="text-[13px] text-[#242421] leading-relaxed">
                  TwinForge AI operates strictly on authorized personal likenesses. Confirm that all face and voice
                  samples uploaded belong solely to you.
                </p>
              </div>
              <div>
                <label className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1.5">
                  Creator Full Name (Biometric Owner)
                </label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full px-3.5 py-2.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[14px] rounded-sm focus:outline-none focus:border-[#B69A65]"
                />
              </div>
              <label className="flex items-start gap-2.5 cursor-pointer text-[13.5px]">
                <input
                  type="checkbox"
                  checked={attested}
                  onChange={(e) => setAttested(e.target.checked)}
                  className="mt-1 accent-[#242421]"
                />
                <span>
                  I confirm these likeness assets are my own identity and authorize TwinForge AI to assemble media
                  under explicit provenance controls.
                </span>
              </label>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleSaveConsent}
                  className="px-5 py-2.5 bg-[#242421] text-[#F6F3EC] text-[13px] font-semibold rounded-sm hover:bg-[#3A3934]"
                >
                  {busy ? 'Saving...' : 'Sign & Continue'}
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-[13.5px] text-[#77766F]">
                Upload a sharp front-facing studio photograph (more angles and expressions can be added anytime in My
                Digital Twin).
              </p>
              <label className="block border border-dashed border-[#B69A65] bg-[#F6F3EC] p-6 text-center rounded-sm cursor-pointer hover:bg-[#EFE8D8]/60 transition-colors">
                <Upload className="w-6 h-6 text-[#B69A65] mx-auto mb-2" />
                <div className="text-[13.5px] font-semibold text-[#242421]">
                  Upload Front Portrait Image (.jpg, .png)
                </div>
                <div className="text-[12px] text-[#77766F] mt-1">
                  Currently stored face assets: {workspace.twin.faceAssets.length}
                </div>
                <input type="file" accept="image/*,video/*" onChange={handleFaceUpload} className="hidden" />
              </label>
              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2 border border-[#E4DDD0] text-[13px] rounded-sm"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-5 py-2.5 bg-[#242421] text-[#F6F3EC] text-[13px] font-semibold rounded-sm"
                >
                  Continue to Voice
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-[13.5px] text-[#77766F]">
                Upload a clean 10–30 second voice sample in your primary spoken language.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(['English', 'Hindi', 'Hinglish'] as TwinLanguage[]).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setPrimaryLang(lang)}
                    className={`py-2 text-[13px] border rounded-sm ${
                      primaryLang === lang
                        ? 'bg-[#242421] text-[#F6F3EC] border-[#242421]'
                        : 'bg-[#FFFFFF] text-[#77766F] border-[#E4DDD0]'
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
              <label className="block border border-dashed border-[#B69A65] bg-[#F6F3EC] p-5 text-center rounded-sm cursor-pointer">
                <Upload className="w-6 h-6 text-[#B69A65] mx-auto mb-2" />
                <div className="text-[13.5px] font-semibold text-[#242421]">
                  Upload Voice Recording (.wav, .mp3, .webm)
                </div>
                <div className="text-[12px] text-[#77766F] mt-1">
                  Uploaded voice samples: {workspace.twin.voiceSamples.length}
                </div>
                <input type="file" accept="audio/*" onChange={handleVoiceUpload} className="hidden" />
              </label>

              <div className="p-4 bg-[#FAF8F4] border border-[#E4DDD0] rounded-sm space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#242421]">
                    Free Natural Hindi / Indian Voice Persona ($0.00)
                  </span>
                  <span className="text-[11px] font-mono text-[#777D68]">Free Tier Included</span>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={preferredVoiceId}
                    onChange={(e) => {
                      setPreferredVoiceProvider('free_hindi_neural');
                      setPreferredVoiceId(e.target.value);
                    }}
                    className="flex-1 px-3 py-2 border border-[#E4DDD0] bg-[#FFFFFF] text-[13px] rounded-sm"
                  >
                    {FREE_HINDI_VOICES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={previewBusy}
                    onClick={handlePreviewHindiVoice}
                    className="px-3.5 py-2 border border-[#242421] bg-[#FFFFFF] text-[#242421] text-[12.5px] font-semibold rounded-sm inline-flex items-center justify-center gap-1.5 hover:bg-[#EFE8D8]"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-[#B69A65]" />
                    <span>{previewBusy ? 'Testing...' : 'Preview ($0.00)'}</span>
                  </button>
                </div>
                {previewAudioUrl && <audio controls src={previewAudioUrl} className="w-full h-8" />}
              </div>
              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-2 border border-[#E4DDD0] text-[13px] rounded-sm"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="px-5 py-2.5 bg-[#242421] text-[#F6F3EC] text-[13px] font-semibold rounded-sm"
                >
                  Continue to Persona
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div>
                <label className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1.5">
                  Creator Content Niche
                </label>
                <input
                  type="text"
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-[#E4DDD0] text-[14px] rounded-sm"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1.5">
                  Speaking Style &amp; Cadence Notes
                </label>
                <textarea
                  rows={3}
                  value={speakingStyle}
                  onChange={(e) => setSpeakingStyle(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-[#E4DDD0] text-[14px] rounded-sm"
                />
              </div>
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-4 py-2 border border-[#E4DDD0] text-[13px] rounded-sm"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleSavePersonality}
                  className="px-5 py-2.5 bg-[#242421] text-[#F6F3EC] text-[13px] font-semibold rounded-sm inline-flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-[#B69A65]" />
                  <span>{busy ? 'Finishing...' : 'Complete Onboarding'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

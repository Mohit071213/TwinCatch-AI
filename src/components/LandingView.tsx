import React from 'react';
import { ArrowRight, CheckCircle2, ShieldCheck, SlidersHorizontal, Sparkles } from 'lucide-react';

interface LandingViewProps {
  onEnterStudio: () => void;
  onStartOnboarding: () => void;
}

export const LandingView: React.FC<LandingViewProps> = ({
  onEnterStudio,
  onStartOnboarding,
}) => {
  return (
    <div className="min-h-screen bg-[#F6F3EC] text-[#242421] flex flex-col">
      {/* Minimal Editorial Top Header */}
      <header className="border-b border-[#E4DDD0] px-6 sm:px-12 h-16 flex items-center justify-between">
        <div className="font-editorial text-[24px] tracking-tight text-[#242421]">
          TwinForge <span className="italic text-[#B69A65]">AI</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onStartOnboarding}
            className="text-[13px] font-medium text-[#77766F] hover:text-[#242421] hidden sm:inline"
          >
            Identity Onboarding
          </button>
          <button
            type="button"
            onClick={onEnterStudio}
            className="px-4 py-2 bg-[#242421] text-[#F6F3EC] text-[12px] font-semibold uppercase tracking-[0.06em] rounded-sm hover:bg-[#3A3934] transition-colors"
          >
            Open Studio Workspace
          </button>
        </div>
      </header>

      {/* Hero Editorial Split */}
      <section className="max-w-[1320px] w-full mx-auto px-6 sm:px-12 py-12 lg:py-20 grid lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-6 space-y-6">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#B69A65] font-semibold">
            Authorized Personal Digital Twin Studio
          </p>
          <h1 className="font-editorial text-[40px] sm:text-[52px] leading-[1.08] text-[#242421]">
            Your Identity. Your Intelligence. Your Content Studio.
          </h1>
          <p className="text-[16px] leading-relaxed text-[#77766F] max-w-xl">
            Build a consent-verified personal digital twin from your own face, voice, and linguistic cadence.
            Transform verified industry trends into English, Hindi, and Hinglish scripts, audition real speech,
            and master ready-to-publish reels with transparent cost governance.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onEnterStudio}
              className="px-6 py-3 bg-[#242421] text-[#F6F3EC] text-[13px] font-semibold tracking-[0.05em] uppercase rounded-sm inline-flex items-center gap-2 hover:bg-[#3A3934] transition-colors"
            >
              <span>Enter Studio Workspace</span>
              <ArrowRight className="w-4 h-4 text-[#B69A65]" />
            </button>
            <button
              type="button"
              onClick={onStartOnboarding}
              className="px-6 py-3 bg-[#FFFFFF] border border-[#E4DDD0] text-[#242421] text-[13px] font-semibold rounded-sm hover:border-[#B69A65] transition-colors"
            >
              Start Guided Twin Setup
            </button>
          </div>

          <div className="pt-4 border-t border-[#E4DDD0] flex flex-wrap gap-x-6 gap-y-2 text-[12px] text-[#77766F]">
            <span>Consent-First Likeness Provenance</span>
            <span>·</span>
            <span>English, Hindi &amp; Hinglish Fluency</span>
            <span>·</span>
            <span>Local FFmpeg + Gated Premium Render</span>
          </div>
        </div>

        <div className="lg:col-span-6">
          <div className="border border-[#E4DDD0] bg-[#FFFFFF] p-3 rounded-sm">
            <div className="aspect-video w-full overflow-hidden bg-[#1A1917]">
              <img
                src="/api/media/demo/studio_editorial_banner.jpg"
                alt="TwinForge AI creator studio desk"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="pt-3 px-1 flex items-center justify-between text-[12px] text-[#77766F]">
              <span>Editorial Production Desk · Warm Ivory &amp; Charcoal Suite</span>
              <span className="font-mono text-[#242421]">9:16 · 1:1 · 16:9</span>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities Asymmetric Grid */}
      <section className="max-w-[1320px] w-full mx-auto px-6 sm:px-12 pb-16">
        <div className="border-t border-[#E4DDD0] pt-10 grid md:grid-cols-3 gap-6">
          <div className="bg-[#FFFFFF] border border-[#E4DDD0] p-6 rounded-sm space-y-3">
            <ShieldCheck className="w-5 h-5 text-[#777D68]" />
            <div className="text-[11px] font-mono text-[#77766F]">01 · IDENTITY VAULT</div>
            <h3 className="font-editorial text-[22px] text-[#242421]">Verified Likeness &amp; Voice</h3>
            <p className="text-[13.5px] text-[#77766F] leading-relaxed">
              Capture multi-angle portraits, expressions, and Hindi/Hinglish/English audio verified by speech
              transcription with cryptographic owner attestation.
            </p>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E4DDD0] p-6 rounded-sm space-y-3">
            <Sparkles className="w-5 h-5 text-[#B69A65]" />
            <div className="text-[11px] font-mono text-[#77766F]">02 · CONTENT INTELLIGENCE</div>
            <h3 className="font-editorial text-[22px] text-[#242421]">Live Trend-to-Script Engine</h3>
            <p className="text-[13.5px] text-[#77766F] leading-relaxed">
              Ingest real RSS feeds or public post links and generate three distinct script variants calibrated to your
              authentic vocabulary and catchphrases.
            </p>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E4DDD0] p-6 rounded-sm space-y-3">
            <SlidersHorizontal className="w-5 h-5 text-[#242421]" />
            <div className="text-[11px] font-mono text-[#77766F]">03 · TIERED VIDEO STUDIO</div>
            <h3 className="font-editorial text-[22px] text-[#242421]">Quality &amp; Cost Discipline</h3>
            <p className="text-[13.5px] text-[#77766F] leading-relaxed">
              Switch seamlessly between Local Free FFmpeg, Balanced Speech Studio, and explicitly approved Premium
              Realism with side-by-side provider benchmarking.
            </p>
          </div>
        </div>
      </section>

      <footer className="mt-auto border-t border-[#E4DDD0] px-6 sm:px-12 py-6 flex flex-wrap items-center justify-between gap-4 text-[12px] text-[#77766F]">
        <div className="inline-flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#777D68]" />
          <span>Strict Honesty Policy · Zero Fabricated Metrics · Explicit Cost Approval</span>
        </div>
        <span>TwinForge AI Studio</span>
      </footer>
    </div>
  );
};

import React from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Compass,
  DollarSign,
  Film,
  Play,
  ShieldAlert,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import type { NavSection, WorkspaceState } from '../types';
import { formatCurrency, formatDateShort } from '../lib/api';

interface OverviewViewProps {
  workspace: WorkspaceState;
  onNavigate: (s: NavSection) => void;
  onSelectTrendForScript: (trendId: string) => void;
  onOpenOnboarding: () => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  workspace,
  onNavigate,
  onSelectTrendForScript,
  onOpenOnboarding,
}) => {
  const { twin, trends, scripts, videos, analytics, settings } = workspace;
  const pendingScripts = scripts.filter((s) => s.approvalStatus === 'draft');
  const pendingVideos = videos.filter((v) => v.reviewStatus === 'pending');
  const totalViews = analytics.reduce((acc, a) => acc + a.views, 0);
  const avgRetention =
    analytics.length > 0
      ? (analytics.reduce((acc, a) => acc + a.retentionPct, 0) / analytics.length).toFixed(1)
      : null;

  const creatorTitle =
    twin.personality.creatorName?.trim()
      ? `Welcome back, ${twin.personality.creatorName}`
      : 'Welcome to TwinForge Studio';

  return (
    <div className="space-y-8">
      {/* Editorial Header Banner */}
      <section className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#B69A65] font-semibold">
            {workspace.mode === 'demo' ? 'Demo Showcase Workspace' : 'Live Creator Workspace'} ·{' '}
            {twin.personality.primaryLanguage} Primary
          </div>
          <h1 className="font-editorial text-[32px] sm:text-[40px] leading-[1.12] text-[#242421]">
            {creatorTitle}
          </h1>
          <p className="text-[14.5px] text-[#77766F] leading-relaxed">
            {twin.readiness.consentVerified
              ? `Likeness consent verified for ${twin.consent.ownerFullName}. Active quality tier defaults to ${settings.defaultQualityTier.replace('_', ' ')}.`
              : 'Upload your authorized face angles, clean voice samples, and sign biometric ownership consent to unlock digital twin rendering.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {!twin.readiness.consentVerified && (
            <button
              type="button"
              onClick={onOpenOnboarding}
              className="px-4 py-3 bg-[#EFE8D8] border border-[#B69A65]/40 text-[#242421] text-[12.5px] font-semibold rounded-sm hover:bg-[#E7DEC9] transition-colors"
            >
              Start Guided Onboarding
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate('studio')}
            className="px-5 py-3 bg-[#242421] hover:bg-[#3A3934] text-[#F6F3EC] text-[12.5px] font-semibold uppercase tracking-[0.07em] rounded-sm inline-flex items-center gap-2 transition-colors"
          >
            <Sparkles className="w-4 h-4 text-[#B69A65]" />
            <span>CREATE WITH MY TWIN</span>
          </button>
        </div>
      </section>

      {/* Top Metrics Matrix — Flat Single-Elevation Hairline Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 border border-[#E4DDD0] bg-[#FFFFFF] rounded-sm divide-y sm:divide-y-0 sm:divide-x divide-[#E4DDD0]">
        <div className="p-5 space-y-2">
          <div className="flex items-center justify-between text-[11.5px] uppercase tracking-[0.12em] text-[#77766F]">
            <span>Digital Twin Readiness</span>
            <UserCheck className="w-4 h-4 text-[#B69A65]" />
          </div>
          <div className="font-mono text-[28px] font-semibold tabular-nums text-[#242421]">
            {twin.readiness.overallScore}%
          </div>
          <div className="text-[12px] text-[#77766F]">
            Face {twin.readiness.faceScore}% · Voice {twin.readiness.voiceScore}% · Persona{' '}
            {twin.readiness.personalityScore}%
          </div>
        </div>

        <div className="p-5 space-y-2">
          <div className="flex items-center justify-between text-[11.5px] uppercase tracking-[0.12em] text-[#77766F]">
            <span>Productions &amp; Queue</span>
            <Film className="w-4 h-4 text-[#777D68]" />
          </div>
          <div className="font-mono text-[28px] font-semibold tabular-nums text-[#242421]">
            {videos.length}
          </div>
          <div className="text-[12px] text-[#77766F]">
            {pendingScripts.length} scripts awaiting sign-off · {pendingVideos.length} renders in review
          </div>
        </div>

        <div className="p-5 space-y-2">
          <div className="flex items-center justify-between text-[11.5px] uppercase tracking-[0.12em] text-[#77766F]">
            <span>Monthly API Spend</span>
            <DollarSign className="w-4 h-4 text-[#B69A65]" />
          </div>
          <div className="font-mono text-[28px] font-semibold tabular-nums text-[#242421]">
            {formatCurrency(settings.currentMonthSpendUsd)}
          </div>
          <div className="text-[12px] text-[#77766F]">
            Budget cap {formatCurrency(settings.monthlyBudgetCapUsd)} · Explicit paid approval{' '}
            {settings.requireExplicitPaidApproval ? 'On' : 'Off'}
          </div>
        </div>

        <div className="p-5 space-y-2">
          <div className="flex items-center justify-between text-[11.5px] uppercase tracking-[0.12em] text-[#77766F]">
            <span>Tracked Performance</span>
            <Compass className="w-4 h-4 text-[#777D68]" />
          </div>
          <div className="font-mono text-[28px] font-semibold tabular-nums text-[#242421]">
            {analytics.length > 0 ? totalViews.toLocaleString() : '—'}
          </div>
          <div className="text-[12px] text-[#77766F]">
            {analytics.length > 0
              ? `${avgRetention}% avg retention across ${analytics.length} logged posts`
              : 'No published metrics logged yet'}
          </div>
        </div>
      </section>

      {/* Main Two-Column Editorial Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Recent Video Productions */}
        <section className="xl:col-span-7 bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm">
          <div className="px-6 py-4 border-b border-[#E4DDD0] flex items-center justify-between">
            <div>
              <h2 className="font-editorial text-[22px] text-[#242421]">Recent Video Productions</h2>
              <p className="text-[12.5px] text-[#77766F]">
                Rendered MP4 assets with provenance tags and cost records
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('library')}
              className="text-[12.5px] font-semibold text-[#242421] hover:text-[#B69A65] inline-flex items-center gap-1"
            >
              <span>View Library</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {videos.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-[14px] text-[#77766F]">
                No video renders generated in this workspace yet.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('studio')}
                className="px-4 py-2 bg-[#242421] text-[#F6F3EC] text-[12.5px] font-semibold rounded-sm"
              >
                Produce First Video
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[#E4DDD0]">
              {videos.slice(0, 4).map((vid) => (
                <div
                  key={vid.id}
                  className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#FAF8F4] transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-16 h-16 shrink-0 bg-[#1A1917] border border-[#E4DDD0] overflow-hidden relative rounded-sm">
                      {vid.thumbnailUrl ? (
                        <img
                          src={vid.thumbnailUrl}
                          alt={vid.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Play className="w-4 h-4 text-[#B69A65]" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-[14.5px] text-[#242421] truncate">
                        {vid.title}
                      </div>
                      <div className="mt-1 text-[12px] text-[#77766F] font-mono tabular-nums">
                        {vid.aspectRatio} · {vid.durationSec}s · {vid.language} ·{' '}
                        {formatCurrency(vid.actualCostUsd)}
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-[#77766F] truncate">
                        {vid.provenanceNote}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`text-[11.5px] font-semibold uppercase tracking-[0.08em] ${
                        vid.reviewStatus === 'approved'
                          ? 'text-[#777D68]'
                          : vid.reviewStatus === 'rejected'
                            ? 'text-[#9E3B33]'
                            : 'text-[#A66E1E]'
                      }`}
                    >
                      {vid.reviewStatus}
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigate('library')}
                      className="px-3 py-1.5 border border-[#E4DDD0] text-[12px] font-medium hover:border-[#B69A65] rounded-sm"
                    >
                      Screen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right Column: Readiness Checklist + Trending Opportunities */}
        <div className="xl:col-span-5 space-y-6">
          {/* Identity Readiness */}
          <section className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-editorial text-[20px] text-[#242421]">Identity Readiness</h2>
              <button
                type="button"
                onClick={() => onNavigate('twin')}
                className="text-[12px] font-semibold text-[#B69A65] hover:underline"
              >
                Manage Twin
              </button>
            </div>
            {twin.readiness.missingItems.length === 0 ? (
              <div className="flex items-center gap-2.5 text-[13px] text-[#777D68]">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Core studio references and consent attestation verified.</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[12.5px] text-[#A66E1E]">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>Missing items for full studio parity:</span>
                </div>
                <ul className="text-[12.5px] text-[#77766F] space-y-1 pl-6 list-disc">
                  {twin.readiness.missingItems.slice(0, 4).map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Trending Opportunities */}
          <section className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm">
            <div className="px-6 py-4 border-b border-[#E4DDD0] flex items-center justify-between">
              <h2 className="font-editorial text-[20px] text-[#242421]">Trending Opportunities</h2>
              <button
                type="button"
                onClick={() => onNavigate('trends')}
                className="text-[12px] font-semibold text-[#242421] hover:text-[#B69A65]"
              >
                Trend Radar
              </button>
            </div>
            {trends.length === 0 ? (
              <div className="p-6 text-center space-y-2.5">
                <p className="text-[13px] text-[#77766F]">
                  No trends loaded yet. Sync public RSS feeds or import a link in Trend Radar.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('trends')}
                  className="px-3.5 py-1.5 border border-[#E4DDD0] text-[12.5px] font-semibold rounded-sm hover:border-[#B69A65]"
                >
                  Open Trend Radar
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[#E4DDD0]">
                {trends.slice(0, 3).map((t) => (
                  <div key={t.id} className="p-4 sm:px-6 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono text-[#77766F]">
                      <span>
                        {t.platform} · {t.category}
                      </span>
                      <span className="text-[#242421] font-semibold">
                        Match {t.relevanceScore}%
                      </span>
                    </div>
                    <div className="text-[13.5px] font-semibold text-[#242421] leading-snug">
                      {t.topic}
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11.5px] text-[#77766F] inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDateShort(t.discoveredAt)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onSelectTrendForScript(t.id)}
                        className="text-[12px] font-semibold text-[#B69A65] hover:text-[#242421]"
                      >
                        Draft Scripts →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  Compass,
  Film,
  Layers,
  Lock,
  Menu,
  PlaySquare,
  Plug,
  Send,
  Settings,
  Sparkles,
  UserCheck,
  Workflow,
  X,
} from 'lucide-react';
import type { NavSection, WorkspaceMode, WorkspaceState } from '../types';

interface AppShellProps {
  workspace: WorkspaceState;
  activeSection: NavSection;
  onSelectSection: (s: NavSection) => void;
  mode: WorkspaceMode;
  onChangeMode: (m: WorkspaceMode) => void;
  onOpenLanding: () => void;
  onOpenOnboarding: () => void;
  onOpenProfileLock: () => void;
  onCreateWithTwin: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{ id: NavSection; label: string; group: 'studio' | 'pipeline' | 'system'; icon: any }> = [
  { id: 'overview', label: 'Overview', group: 'studio', icon: Activity },
  { id: 'twin', label: 'My Digital Twin', group: 'studio', icon: UserCheck },
  { id: 'trends', label: 'Trend Radar', group: 'pipeline', icon: Compass },
  { id: 'intelligence', label: 'Content Intelligence', group: 'pipeline', icon: Sparkles },
  { id: 'studio', label: 'Video Studio', group: 'pipeline', icon: Film },
  { id: 'library', label: 'Video Library', group: 'pipeline', icon: PlaySquare },
  { id: 'automation', label: 'Automation', group: 'system', icon: Workflow },
  { id: 'publishing', label: 'Publishing', group: 'system', icon: Send },
  { id: 'analytics', label: 'Analytics', group: 'system', icon: BarChart3 },
  { id: 'integrations', label: 'Integrations', group: 'system', icon: Plug },
  { id: 'settings', label: 'Settings & Provenance', group: 'system', icon: Settings },
];

export const AppShell: React.FC<AppShellProps> = ({
  workspace,
  activeSection,
  onSelectSection,
  mode,
  onChangeMode,
  onOpenLanding,
  onOpenOnboarding,
  onOpenProfileLock,
  onCreateWithTwin,
  children,
}) => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const activeLabel = NAV_ITEMS.find((i) => i.id === activeSection)?.label || 'Overview';
  const creatorDisplay =
    workspace.twin.personality.creatorName?.trim() ||
    (mode === 'demo' ? 'Aarav Mehta' : 'Unconfigured Creator');

  const renderNavList = () => (
    <div className="flex flex-col h-full justify-between py-6 px-4">
      <div>
        {/* Editorial Brand Wordmark */}
        <div className="px-2 pb-6 border-b border-[#E4DDD0]">
          <button
            type="button"
            onClick={() => {
              onSelectSection('overview');
              setMobileNavOpen(false);
            }}
            className="text-left group w-full"
          >
            <div className="font-editorial text-[22px] leading-tight text-[#242421] tracking-tight">
              TwinForge <span className="italic text-[#B69A65]">AI</span>
            </div>
            <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[#77766F]">
              Personal Content Studio
            </p>
          </button>
        </div>

        {/* Navigation Groups */}
        <nav className="mt-5 space-y-6">
          {(
            [
              { key: 'studio', heading: 'Identity' },
              { key: 'pipeline', heading: 'Production' },
              { key: 'system', heading: 'Operations' },
            ] as const
          ).map((grp) => (
            <div key={grp.key}>
              <div className="px-2.5 mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#77766F]">
                {grp.heading}
              </div>
              <div className="space-y-0.5">
                {NAV_ITEMS.filter((n) => n.group === grp.key).map((item) => {
                  const Icon = item.icon;
                  const active = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelectSection(item.id);
                        setMobileNavOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-2.5 py-2 text-[13.5px] transition-colors rounded-sm text-left ${
                        active
                          ? 'bg-[#FFFFFF] text-[#242421] font-semibold border border-[#E4DDD0]'
                          : 'text-[#77766F] hover:text-[#242421] hover:bg-[#EFEBE1] border border-transparent'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          active ? 'text-[#B69A65]' : 'text-[#77766F]'
                        }`}
                        strokeWidth={1.75}
                      />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Bottom Creator & Showcase Links */}
      <div className="pt-5 border-t border-[#E4DDD0] space-y-2">
        <div className="px-2.5 py-2 bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm">
          <div className="flex items-center justify-between text-[11px] text-[#77766F]">
            <span>Twin Readiness</span>
            <span className="font-mono font-semibold tabular-nums text-[#242421]">
              {workspace.twin.readiness.overallScore}%
            </span>
          </div>
          <div className="mt-1.5 h-1 w-full bg-[#EFEBE1] overflow-hidden">
            <div
              className="h-full bg-[#B69A65] transition-all duration-300"
              style={{ width: `${workspace.twin.readiness.overallScore}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className="truncate font-medium text-[#242421]">{creatorDisplay}</span>
            <button
              type="button"
              onClick={onOpenProfileLock}
              className="text-[#77766F] hover:text-[#242421] inline-flex items-center gap-1"
              title="Creator Session & Lock"
            >
              <Lock className="w-3 h-3" />
              <span>Access</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between px-2 pt-1 text-[11.5px] text-[#77766F]">
          <button
            type="button"
            onClick={() => {
              onOpenOnboarding();
              setMobileNavOpen(false);
            }}
            className="hover:text-[#242421] inline-flex items-center gap-1.5"
          >
            <Layers className="w-3.5 h-3.5 text-[#B69A65]" />
            <span>Guided Setup</span>
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => {
              onOpenLanding();
              setMobileNavOpen(false);
            }}
            className="hover:text-[#242421] inline-flex items-center gap-1.5"
          >
            <BookOpen className="w-3.5 h-3.5 text-[#777D68]" />
            <span>Editorial Intro</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F6F3EC] text-[#242421] flex">
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-[#E4DDD0] bg-[#F6F3EC] sticky top-0 h-screen overflow-y-auto">
        {renderNavList()}
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#242421]/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative z-10 w-72 max-w-[85vw] bg-[#F6F3EC] border-r border-[#E4DDD0] h-full overflow-y-auto">
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-[#77766F] hover:text-[#242421]"
              aria-label="Close navigation"
            >
              <X className="w-5 h-5" />
            </button>
            {renderNavList()}
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Three-Zone Top Bar */}
        <header className="sticky top-0 z-30 bg-[#F6F3EC]/95 backdrop-blur-sm border-b border-[#E4DDD0] px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[#242421] rounded-sm"
              aria-label="Open menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-[13px] truncate">
              <span className="text-[#77766F] hidden sm:inline">TwinForge Studio</span>
              <span className="text-[#B69A65] hidden sm:inline">/</span>
              <span className="font-semibold text-[#242421] truncate">{activeLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            {/* Demo vs Live Workspace Switcher */}
            <div
              className="inline-flex border border-[#E4DDD0] bg-[#FFFFFF] rounded-sm p-0.5 text-[11.5px]"
              role="group"
              aria-label="Workspace Data Mode"
            >
              <button
                type="button"
                onClick={() => onChangeMode('demo')}
                className={`px-2.5 py-1 rounded-sm transition-colors whitespace-nowrap ${
                  mode === 'demo'
                    ? 'bg-[#242421] text-[#F6F3EC] font-medium'
                    : 'text-[#77766F] hover:text-[#242421]'
                }`}
              >
                Demo Mode
              </button>
              <button
                type="button"
                onClick={() => onChangeMode('live')}
                className={`px-2.5 py-1 rounded-sm transition-colors whitespace-nowrap ${
                  mode === 'live'
                    ? 'bg-[#777D68] text-[#FFFFFF] font-medium'
                    : 'text-[#77766F] hover:text-[#242421]'
                }`}
              >
                Live Workspace
              </button>
            </div>

            <button
              type="button"
              onClick={onCreateWithTwin}
              className="px-3.5 sm:px-4 py-2 bg-[#242421] hover:bg-[#3A3934] text-[#F6F3EC] text-[12px] font-semibold tracking-[0.06em] uppercase rounded-sm whitespace-nowrap shrink-0 transition-colors border border-[#242421]"
            >
              Create With My Twin
            </button>
          </div>
        </header>

        {/* Honest Mode Banner when Demo Mode is active */}
        {mode === 'demo' && (
          <div className="bg-[#EFE8D8] border-b border-[#E4DDD0] px-4 sm:px-8 py-2 text-[12px] text-[#242421] flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong className="font-semibold">Demo Showcase Active:</strong> Viewing curated sample profile
              (Aarav Mehta), sample metrics, and pre-rendered studio reels. Switch to{' '}
              <button
                type="button"
                onClick={() => onChangeMode('live')}
                className="underline font-semibold hover:text-[#B69A65]"
              >
                Live Workspace
              </button>{' '}
              to build with your real uploads and zero-fabrication metrics.
            </span>
            <span className="font-mono text-[11px] text-[#77766F] tabular-nums">
              Mode · Demo Isolation
            </span>
          </div>
        )}

        {/* Viewport Container */}
        <main className="flex-1 px-4 sm:px-8 py-6 sm:py-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

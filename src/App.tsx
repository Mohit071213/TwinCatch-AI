/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import type { NavSection, WorkspaceMode, WorkspaceState } from './types';
import { apiRequest } from './lib/api';
import { AppShell } from './components/AppShell';
import { LandingView } from './components/LandingView';
import { OnboardingModal } from './components/OnboardingModal';
import { OverviewView } from './components/OverviewView';
import { DigitalTwinView } from './components/DigitalTwinView';
import { TrendRadarView } from './components/TrendRadarView';
import { ContentIntelligenceView } from './components/ContentIntelligenceView';
import { VideoStudioView } from './components/VideoStudioView';
import { VideoLibraryView } from './components/VideoLibraryView';
import { AutomationView } from './components/AutomationView';
import { PublishingView } from './components/PublishingView';
import { AnalyticsView } from './components/AnalyticsView';
import {
  IntegrationsView,
  ProfileLockModal,
  SettingsView,
} from './components/IntegrationsAndSettingsViews';

export default function App() {
  const [mode, setMode] = useState<WorkspaceMode>('demo');
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [showLanding, setShowLanding] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showProfileLock, setShowProfileLock] = useState(false);

  const [preselectedTrendId, setPreselectedTrendId] = useState<string | undefined>(undefined);
  const [preselectedScriptId, setPreselectedScriptId] = useState<string | undefined>(undefined);
  const [preselectedVideoId, setPreselectedVideoId] = useState<string | undefined>(undefined);

  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    setLoadError('');

    const loadWithRetry = async (attempt = 0) => {
      try {
        const data = await apiRequest<WorkspaceState>(`/api/workspace?mode=${mode}`, mode);
        if (active) setWorkspace(data);
      } catch (err: any) {
        if (!active) return;
        if (attempt < 4) {
          setTimeout(() => {
            if (active) void loadWithRetry(attempt + 1);
          }, 1200);
        } else {
          setLoadError(err.message || 'Unable to connect to TwinForge Studio server.');
        }
      }
    };

    void loadWithRetry(0);
    return () => {
      active = false;
    };
  }, [mode]);

  if (loadError) {
    return (
      <div className="min-h-screen bg-[#F6F3EC] text-[#242421] flex items-center justify-center p-6">
        <div className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-8 max-w-md space-y-4 text-center">
          <h1 className="font-editorial text-[28px]">TwinForge AI</h1>
          <p className="text-[13.5px] text-[#9E3B33]">{loadError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-[#242421] text-[#F6F3EC] text-[12.5px] font-semibold rounded-sm"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="min-h-screen bg-[#F6F3EC] text-[#242421] flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="font-editorial text-[28px]">
            TwinForge <span className="italic text-[#B69A65]">AI</span>
          </div>
          <div className="text-[12px] font-mono uppercase tracking-[0.16em] text-[#77766F]">
            Loading Personal Content Studio...
          </div>
        </div>
      </div>
    );
  }

  if (showLanding) {
    return (
      <>
        <LandingView
          onEnterStudio={() => setShowLanding(false)}
          onStartOnboarding={() => {
            setShowLanding(false);
            setShowOnboarding(true);
          }}
        />
        {showOnboarding && (
          <OnboardingModal
            workspace={workspace}
            mode={mode}
            onUpdateWorkspace={setWorkspace}
            onClose={() => setShowOnboarding(false)}
          />
        )}
      </>
    );
  }

  return (
    <AppShell
      workspace={workspace}
      activeSection={activeSection}
      onSelectSection={setActiveSection}
      mode={mode}
      onChangeMode={(m) => {
        setMode(m);
        setPreselectedTrendId(undefined);
        setPreselectedScriptId(undefined);
        setPreselectedVideoId(undefined);
      }}
      onOpenLanding={() => setShowLanding(true)}
      onOpenOnboarding={() => setShowOnboarding(true)}
      onOpenProfileLock={() => setShowProfileLock(true)}
      onCreateWithTwin={() => setActiveSection('studio')}
    >
      <div key={`${mode}:${workspace.mode}`}>
        {activeSection === 'overview' && (
          <OverviewView
            workspace={workspace}
            onNavigate={setActiveSection}
            onSelectTrendForScript={(trendId) => {
              setPreselectedTrendId(trendId);
              setActiveSection('intelligence');
            }}
            onOpenOnboarding={() => setShowOnboarding(true)}
          />
        )}

        {activeSection === 'twin' && (
          <DigitalTwinView workspace={workspace} mode={mode} onUpdateWorkspace={setWorkspace} />
        )}

        {activeSection === 'trends' && (
          <TrendRadarView
            workspace={workspace}
            mode={mode}
            onUpdateWorkspace={setWorkspace}
            onAnalyzeTrend={(trendId) => {
              setPreselectedTrendId(trendId);
              setActiveSection('intelligence');
            }}
          />
        )}

        {activeSection === 'intelligence' && (
          <ContentIntelligenceView
            workspace={workspace}
            mode={mode}
            preselectedTrendId={preselectedTrendId}
            onUpdateWorkspace={setWorkspace}
            onOpenStudioWithScript={(scriptId) => {
              setPreselectedScriptId(scriptId);
              setActiveSection('studio');
            }}
          />
        )}

        {activeSection === 'studio' && (
          <VideoStudioView
            workspace={workspace}
            mode={mode}
            preselectedScriptId={preselectedScriptId}
            onUpdateWorkspace={setWorkspace}
          />
        )}

        {activeSection === 'library' && (
          <VideoLibraryView
            workspace={workspace}
            mode={mode}
            onUpdateWorkspace={setWorkspace}
            onSendToPublishing={(videoId) => {
              setPreselectedVideoId(videoId);
              setActiveSection('publishing');
            }}
          />
        )}

        {activeSection === 'automation' && (
          <AutomationView workspace={workspace} mode={mode} onUpdateWorkspace={setWorkspace} />
        )}

        {activeSection === 'publishing' && (
          <PublishingView
            workspace={workspace}
            mode={mode}
            preselectedVideoId={preselectedVideoId}
            onUpdateWorkspace={setWorkspace}
          />
        )}

        {activeSection === 'analytics' && (
          <AnalyticsView workspace={workspace} mode={mode} onUpdateWorkspace={setWorkspace} />
        )}

        {activeSection === 'integrations' && (
          <IntegrationsView workspace={workspace} mode={mode} onUpdateWorkspace={setWorkspace} />
        )}

        {activeSection === 'settings' && (
          <SettingsView workspace={workspace} mode={mode} onUpdateWorkspace={setWorkspace} />
        )}
      </div>

      {showOnboarding && (
        <OnboardingModal
          workspace={workspace}
          mode={mode}
          onUpdateWorkspace={setWorkspace}
          onClose={() => setShowOnboarding(false)}
        />
      )}

      {showProfileLock && (
        <ProfileLockModal
          workspace={workspace}
          mode={mode}
          onUpdateWorkspace={setWorkspace}
          onClose={() => setShowProfileLock(false)}
        />
      )}
    </AppShell>
  );
}

import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  FilePlus2,
  Film,
  Globe,
  RefreshCw,
  Sparkles,
  Wand2,
} from 'lucide-react';
import type {
  ContentScriptPack,
  OnlineViralIdea,
  RewriteAction,
  ScriptGenre,
  TwinLanguage,
  WorkspaceMode,
  WorkspaceState,
  WritingStyleMode,
} from '../types';
import { apiRequest } from '../lib/api';

interface ContentIntelligenceViewProps {
  workspace: WorkspaceState;
  mode: WorkspaceMode;
  preselectedTrendId?: string;
  onUpdateWorkspace: (w: WorkspaceState) => void;
  onOpenStudioWithScript: (scriptId: string) => void;
}

const SCRIPT_GENRES: ScriptGenre[] = [
  'Comedy',
  'Knowledge',
  'Science',
  'Myth Busting',
  'Psychology',
  'Tech & AI',
  'Storytelling',
  'Business & Finance',
  'History & Facts',
];

const WRITING_STYLES: WritingStyleMode[] = [
  'Viral Hook & Curiosity',
  'Observational Comedy',
  'Mind-Blowing Science',
  'Deep Knowledge Explainer',
  'Rapid Myth-Buster',
  'Relatable Skit / Dialogue',
  'Cinematic Storytelling',
];

const DEFAULT_STYLE_BY_GENRE: Record<ScriptGenre, WritingStyleMode> = {
  Comedy: 'Observational Comedy',
  Knowledge: 'Deep Knowledge Explainer',
  Science: 'Mind-Blowing Science',
  'Myth Busting': 'Rapid Myth-Buster',
  Psychology: 'Viral Hook & Curiosity',
  'Tech & AI': 'Deep Knowledge Explainer',
  Storytelling: 'Cinematic Storytelling',
  'Business & Finance': 'Viral Hook & Curiosity',
  'History & Facts': 'Cinematic Storytelling',
};

const REWRITE_ACTIONS: Array<{ action: RewriteAction; label: string }> = [
  { action: 'punch_hook', label: 'Punch Up 3s Hook' },
  { action: 'add_comedy', label: 'Add Comedy Twist' },
  { action: 'deepen_science', label: 'Add Science / Fact' },
  { action: 'expand_45s', label: 'Expand to 45s+' },
  { action: 'to_hindi', label: 'Convert to Hindi' },
  { action: 'to_hinglish', label: 'Convert to Hinglish' },
  { action: 'to_english', label: 'Convert to English' },
  { action: 'sharpen_cta', label: 'Sharpen CTA' },
];

export const ContentIntelligenceView: React.FC<ContentIntelligenceViewProps> = ({
  workspace,
  mode,
  preselectedTrendId,
  onUpdateWorkspace,
  onOpenStudioWithScript,
}) => {
  const [selectedTrendId, setSelectedTrendId] = useState(preselectedTrendId || workspace.trends[0]?.id || '');
  const [customTopic, setCustomTopic] = useState('');
  const [genre, setGenre] = useState<ScriptGenre>('Science');
  const [writingStyle, setWritingStyle] = useState<WritingStyleMode>('Mind-Blowing Science');
  const [language, setLanguage] = useState<TwinLanguage>(
    workspace.twin.personality.primaryLanguage || 'English'
  );
  const [durationSec, setDurationSec] = useState(35);
  const [activeScriptId, setActiveScriptId] = useState(workspace.scripts[0]?.id || '');
  const [generating, setGenerating] = useState(false);
  const [creatingBlank, setCreatingBlank] = useState(false);

  // Online Viral Idea Hub state
  const [ideaGenreFilter, setIdeaGenreFilter] = useState<'All' | ScriptGenre>('All');
  const [onlineQuery, setOnlineQuery] = useState('');
  const [fetchingOnline, setFetchingOnline] = useState(false);
  const [generatingFromIdeaId, setGeneratingFromIdeaId] = useState<string | null>(null);
  const [rewritingAction, setRewritingAction] = useState<RewriteAction | null>(null);
  const [statusBanner, setStatusBanner] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (preselectedTrendId) setSelectedTrendId(preselectedTrendId);
  }, [preselectedTrendId]);

  const activeScript: ContentScriptPack | undefined =
    workspace.scripts.find((s) => s.id === activeScriptId) || workspace.scripts[0];

  const handleSelectGenre = (nextGenre: ScriptGenre) => {
    setGenre(nextGenre);
    setWritingStyle(DEFAULT_STYLE_BY_GENRE[nextGenre] || 'Viral Hook & Curiosity');
  };

  const handleFetchOnlineIdeas = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setStatusBanner('');
    setFetchingOnline(true);
    try {
      const res = await apiRequest<{
        workspace: WorkspaceState;
        ideas: OnlineViralIdea[];
        groundingSources: Array<{ title: string; url: string }>;
      }>('/api/intelligence/fetch-online', mode, {
        method: 'POST',
        body: JSON.stringify({
          genre,
          language,
          query: onlineQuery.trim() || undefined,
          count: 4,
          alsoImportToRadar: false,
        }),
      });
      onUpdateWorkspace(res.workspace);
      setIdeaGenreFilter(genre);
      setStatusBanner(
        `Fetched ${res.ideas.length} fresh ${genre} viral ideas in ${language}${
          res.groundingSources.length > 0
            ? ` grounded across ${res.groundingSources.length} live web sources`
            : ''
        }.`
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFetchingOnline(false);
    }
  };

  const handleGenerateFromIdea = async (idea: OnlineViralIdea) => {
    setError('');
    setStatusBanner('');
    setGeneratingFromIdeaId(idea.id);
    try {
      const style = DEFAULT_STYLE_BY_GENRE[idea.genre] || writingStyle;
      const res = await apiRequest<{ workspace: WorkspaceState; scriptId: string }>(
        '/api/intelligence/generate',
        mode,
        {
          method: 'POST',
          body: JSON.stringify({
            trendTopic: idea.title,
            trendSummary: `${idea.hookIdea} — ${idea.suggestedAngle}`,
            language: idea.language || language,
            genre: idea.genre,
            writingStyle: style,
            sourceUrl: idea.sourceUrl || '',
            targetDurationSec: durationSec,
          }),
        }
      );
      onUpdateWorkspace(res.workspace);
      setActiveScriptId(res.scriptId);
      setStatusBanner(`Generated 3 ${idea.genre} script variants for "${idea.title}".`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGeneratingFromIdeaId(null);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const chosenTrend = workspace.trends.find((t) => t.id === selectedTrendId);
    const topicText = customTopic.trim() || chosenTrend?.topic || '';
    if (!topicText) {
      setError('Select a trend from Trend Radar, pick an Online Viral Idea, or enter a custom content topic.');
      return;
    }
    setError('');
    setStatusBanner('');
    setGenerating(true);
    try {
      const res = await apiRequest<{ workspace: WorkspaceState; scriptId: string }>(
        '/api/intelligence/generate',
        mode,
        {
          method: 'POST',
          body: JSON.stringify({
            trendId: chosenTrend?.id,
            trendTopic: topicText,
            trendSummary: chosenTrend?.summary || topicText,
            language,
            genre,
            writingStyle,
            sourceUrl: chosenTrend?.sourceUrl || '',
            targetDurationSec: durationSec,
          }),
        }
      );
      onUpdateWorkspace(res.workspace);
      setActiveScriptId(res.scriptId);
      setCustomTopic('');
      setStatusBanner(`Generated 3 ${genre} script variants (${writingStyle}).`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleCreateBlank = async () => {
    setError('');
    setStatusBanner('');
    setCreatingBlank(true);
    try {
      const res = await apiRequest<{ workspace: WorkspaceState; scriptId: string }>(
        '/api/intelligence/create-blank',
        mode,
        {
          method: 'POST',
          body: JSON.stringify({
            title: customTopic.trim() || `Untitled ${genre} Script Draft`,
            genre,
            writingStyle,
            language,
            targetDurationSec: durationSec,
          }),
        }
      );
      onUpdateWorkspace(res.workspace);
      setActiveScriptId(res.scriptId);
      setCustomTopic('');
      setStatusBanner(`Created editable ${genre} draft. Edit freely or apply an AI writing tool below.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreatingBlank(false);
    }
  };

  const handleRewriteVariant = async (variantId: string, action: RewriteAction) => {
    if (!activeScript) return;
    setError('');
    setStatusBanner('');
    setRewritingAction(action);
    try {
      const res = await apiRequest<{ workspace: WorkspaceState; action: RewriteAction }>(
        `/api/intelligence/${activeScript.id}/rewrite`,
        mode,
        {
          method: 'POST',
          body: JSON.stringify({ variantId, action }),
        }
      );
      onUpdateWorkspace(res.workspace);
      const actionLabel = REWRITE_ACTIONS.find((a) => a.action === action)?.label || action;
      setStatusBanner(`Applied writing transformation: ${actionLabel}.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRewritingAction(null);
    }
  };

  const updateActiveVariant = async (
    variantId: string,
    field: 'hook3s' | 'body' | 'cta',
    value: string
  ) => {
    if (!activeScript) return;
    const nextVariants = activeScript.variants.map((v) => {
      if (v.id !== variantId) return v;
      const next = { ...v, [field]: value };
      const wc = `${next.hook3s} ${next.body} ${next.cta}`.trim().split(/\s+/).filter(Boolean).length;
      return { ...next, wordCount: wc, estimatedDurationSec: Math.max(30, Math.round(wc / 2.3)) };
    });
    const updated = await apiRequest<WorkspaceState>(`/api/intelligence/${activeScript.id}`, mode, {
      method: 'PUT',
      body: JSON.stringify({ variants: nextVariants }),
    });
    onUpdateWorkspace(updated);
  };

  const updateScriptTitle = async (newTitle: string) => {
    if (!activeScript) return;
    const updated = await apiRequest<WorkspaceState>(`/api/intelligence/${activeScript.id}`, mode, {
      method: 'PUT',
      body: JSON.stringify({ trendTopic: newTitle }),
    });
    onUpdateWorkspace(updated);
  };

  const selectAndApprove = async (variantId: string, status: 'approved' | 'draft') => {
    if (!activeScript) return;
    const updated = await apiRequest<WorkspaceState>(`/api/intelligence/${activeScript.id}`, mode, {
      method: 'PUT',
      body: JSON.stringify({
        selectedVariantId: variantId,
        approvalStatus: status,
      }),
    });
    onUpdateWorkspace(updated);
  };

  const selectedVariant =
    activeScript?.variants.find((v) => v.id === activeScript.selectedVariantId) ||
    activeScript?.variants[0];

  const onlineIdeas = workspace.onlineIdeas || [];
  const filteredIdeas =
    ideaGenreFilter === 'All'
      ? onlineIdeas
      : onlineIdeas.filter((idea) => idea.genre === ideaGenreFilter);

  const selectedWordCount = selectedVariant?.wordCount || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-[#E4DDD0] pb-6">
        <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#B69A65] font-semibold">
          Editorial Script Architecture
        </div>
        <h1 className="font-editorial text-[34px] text-[#242421] mt-1">Content Intelligence</h1>
        <p className="text-[14px] text-[#77766F] mt-1">
          Discover viral Comedy, Knowledge, and Science ideas from live web search, author custom drafts from scratch,
          and refine 30s+ scripts with your digital twin's voice.
        </p>
      </div>

      {error && (
        <div className="p-3.5 bg-[#9E3B33]/10 border border-[#9E3B33]/30 text-[#9E3B33] text-[13px] rounded-sm">
          {error}
        </div>
      )}

      {statusBanner && (
        <div className="p-3.5 bg-[#EFE8D8] border border-[#B69A65]/40 text-[#242421] text-[13px] rounded-sm">
          {statusBanner}
        </div>
      )}

      {/* Online Viral Idea Discovery Hub */}
      <section className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#B69A65] font-semibold">
              Live Web Search Discovery
            </div>
            <h2 className="font-editorial text-[22px] text-[#242421]">
              Online Viral Ideas &amp; Genre Angles
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11.5px] font-mono text-[#77766F]">
            <span>{onlineIdeas.length} discovered ideas saved</span>
          </div>
        </div>

        {/* Genre Selection Buttons */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setIdeaGenreFilter('All')}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-sm border transition-colors ${
              ideaGenreFilter === 'All'
                ? 'bg-[#242421] text-[#F6F3EC] border-[#242421]'
                : 'bg-[#F6F3EC] text-[#242421] border-[#E4DDD0] hover:border-[#B69A65]'
            }`}
          >
            All Saved ({onlineIdeas.length})
          </button>
          {SCRIPT_GENRES.map((g) => {
            const isSelectedForFetch = genre === g;
            const isFiltered = ideaGenreFilter === g;
            return (
              <button
                key={g}
                type="button"
                onClick={() => {
                  handleSelectGenre(g);
                  setIdeaGenreFilter(g);
                }}
                className={`px-3 py-1.5 text-[12px] font-semibold rounded-sm border transition-colors ${
                  isSelectedForFetch || isFiltered
                    ? 'bg-[#242421] text-[#F6F3EC] border-[#242421]'
                    : 'bg-[#FAF8F4] text-[#242421] border-[#E4DDD0] hover:border-[#B69A65]'
                }`}
              >
                {g}
              </button>
            );
          })}
        </div>

        {/* Search & Fetch Controls */}
        <form onSubmit={handleFetchOnlineIdeas} className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-6">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
              Optional Topic / Niche Keyword for Online Search ({genre})
            </label>
            <input
              type="text"
              value={onlineQuery}
              onChange={(e) => setOnlineQuery(e.target.value)}
              placeholder={`e.g., ${
                genre === 'Comedy'
                  ? 'relatable office WFH excuses or AI fails'
                  : genre === 'Science'
                  ? 'brain sleep trick or James Webb discovery'
                  : 'hidden cognitive bias or daily habit myth'
              }`}
              className="w-full px-3 py-2 border border-[#E4DDD0] text-[13px] rounded-sm"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
              Output Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as TwinLanguage)}
              className="w-full px-3 py-2 border border-[#E4DDD0] bg-[#F6F3EC] text-[13px] rounded-sm"
            >
              <option value="English">English</option>
              <option value="Hindi">Hindi</option>
              <option value="Hinglish">Hinglish</option>
            </select>
          </div>
          <div className="lg:col-span-4">
            <button
              type="submit"
              disabled={fetchingOnline}
              className="w-full py-2 px-4 bg-[#242421] text-[#F6F3EC] text-[12.5px] font-semibold rounded-sm inline-flex items-center justify-center gap-2 hover:bg-[#3A3934]"
            >
              <Globe className={`w-4 h-4 text-[#B69A65] ${fetchingOnline ? 'animate-spin' : ''}`} />
              <span>
                {fetchingOnline
                  ? `Searching Live Web for ${genre}...`
                  : `Fetch Online ${genre} Viral Ideas`}
              </span>
            </button>
          </div>
        </form>

        {/* Discovered Ideas Grid */}
        {filteredIdeas.length === 0 ? (
          <div className="p-6 bg-[#FAF8F4] border border-[#E4DDD0] rounded-sm text-center text-[13px] text-[#77766F]">
            No ideas in <strong>{ideaGenreFilter}</strong> yet. Click{' '}
            <strong>Fetch Online {genre} Viral Ideas</strong> above to pull real-time ideas from Google Search.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredIdeas.slice(0, 6).map((idea) => {
              const busy = generatingFromIdeaId === idea.id;
              return (
                <article
                  key={idea.id}
                  className="bg-[#FAF8F4] border border-[#E4DDD0] rounded-sm p-4 flex flex-col justify-between gap-3 hover:border-[#B69A65] transition-colors"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[10.5px] font-mono uppercase tracking-[0.08em]">
                      <span className="text-[#B69A65] font-semibold">
                        {idea.genre} · {idea.language}
                      </span>
                      {idea.sourceUrl && (
                        <a
                          href={idea.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#77766F] hover:text-[#242421] inline-flex items-center gap-1"
                        >
                          <span>Source</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    <h3 className="font-editorial text-[17.5px] leading-snug text-[#242421]">
                      {idea.title}
                    </h3>
                    <p className="text-[12px] text-[#242421] bg-[#FFFFFF] border border-[#E4DDD0] px-2.5 py-1.5 rounded-sm">
                      <span className="font-mono text-[10px] uppercase text-[#B69A65] mr-1">Hook:</span>
                      {idea.hookIdea}
                    </p>
                    <p className="text-[11.5px] text-[#77766F]">
                      <strong>Why it spreads:</strong> {idea.viralTrigger}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleGenerateFromIdea(idea)}
                    className="w-full py-1.5 px-3 bg-[#242421] text-[#F6F3EC] text-[12px] font-semibold rounded-sm inline-flex items-center justify-center gap-1.5 hover:bg-[#3A3934]"
                  >
                    <Sparkles className={`w-3.5 h-3.5 text-[#B69A65] ${busy ? 'animate-spin' : ''}`} />
                    <span>{busy ? 'Writing 3 Scripts...' : 'Generate 3 Scripts →'}</span>
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Generation & Blank Script Writing Form */}
      <form
        onSubmit={handleGenerate}
        className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-editorial text-[20px] text-[#242421]">
            Generate or Author Custom Script
          </div>
          <span className="text-[11.5px] font-mono text-[#77766F]">
            Minimum 30s spoken pacing enforced across all genres
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div className="lg:col-span-4">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
              Source Trend (Optional)
            </label>
            <select
              value={selectedTrendId}
              onChange={(e) => setSelectedTrendId(e.target.value)}
              className="w-full px-3 py-2 border border-[#E4DDD0] bg-[#F6F3EC] text-[13px] rounded-sm"
            >
              <option value="">-- Use custom topic below --</option>
              {workspace.trends.map((t) => (
                <option key={t.id} value={t.id}>
                  [{t.category}] {t.topic.slice(0, 65)}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-4">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
              Custom Topic / Script Headline
            </label>
            <input
              type="text"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="Enter custom comedy premise, science fact, or topic..."
              className="w-full px-3 py-2 border border-[#E4DDD0] text-[13px] rounded-sm"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
              Genre
            </label>
            <select
              value={genre}
              onChange={(e) => handleSelectGenre(e.target.value as ScriptGenre)}
              className="w-full px-3 py-2 border border-[#E4DDD0] text-[13px] rounded-sm"
            >
              {SCRIPT_GENRES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
              Writing Style
            </label>
            <select
              value={writingStyle}
              onChange={(e) => setWritingStyle(e.target.value as WritingStyleMode)}
              className="w-full px-3 py-2 border border-[#E4DDD0] text-[13px] rounded-sm"
            >
              {WRITING_STYLES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
          <div className="flex flex-wrap items-center gap-4 text-[12px] text-[#77766F]">
            <label className="inline-flex items-center gap-2">
              <span>Language:</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as TwinLanguage)}
                className="px-2.5 py-1 border border-[#E4DDD0] text-[12.5px] text-[#242421] rounded-sm"
              >
                <option value="English">English</option>
                <option value="Hindi">Hindi</option>
                <option value="Hinglish">Hinglish</option>
              </select>
            </label>
            <label className="inline-flex items-center gap-2">
              <span>Target Length (Min 30s):</span>
              <input
                type="range"
                min={30}
                max={90}
                step={5}
                value={durationSec}
                onChange={(e) => setDurationSec(Number(e.target.value))}
                className="accent-[#B69A65]"
              />
              <span className="font-mono tabular-nums text-[#242421]">{durationSec}s</span>
            </label>
            <span className="hidden sm:inline">·</span>
            <span>Persona: {workspace.twin.personality.creatorName || 'Default Creator'}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={creatingBlank}
              onClick={handleCreateBlank}
              className="py-2 px-4 bg-[#FFFFFF] border border-[#E4DDD0] text-[#242421] text-[12.5px] font-semibold rounded-sm inline-flex items-center gap-1.5 hover:border-[#B69A65]"
            >
              <FilePlus2 className="w-3.5 h-3.5 text-[#777D68]" />
              <span>{creatingBlank ? 'Creating...' : '+ Write Blank Script'}</span>
            </button>
            <button
              type="submit"
              disabled={generating}
              className="py-2 px-4 bg-[#242421] text-[#F6F3EC] text-[12.5px] font-semibold rounded-sm inline-flex items-center gap-2 hover:bg-[#3A3934]"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#B69A65]" />
              <span>{generating ? 'Synthesizing...' : 'Generate 3 Variants'}</span>
            </button>
          </div>
        </div>
      </form>

      {/* Main Split: History List + Active Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <aside className="lg:col-span-4 bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm divide-y divide-[#E4DDD0] h-fit">
          <div className="px-5 py-3.5 font-semibold text-[13px] uppercase tracking-[0.08em] text-[#77766F]">
            Generated Script Packs ({workspace.scripts.length})
          </div>
          {workspace.scripts.length === 0 ? (
            <div className="p-6 text-[13px] text-[#77766F]">No script packs generated yet.</div>
          ) : (
            workspace.scripts.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveScriptId(s.id)}
                className={`w-full text-left p-4 transition-colors ${
                  activeScript?.id === s.id ? 'bg-[#EFE8D8]/70' : 'hover:bg-[#FAF8F4]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-[#77766F]">
                  <span className="truncate">
                    {s.genre ? `${s.genre} · ` : ''}
                    {s.language} · {s.recommendedFormat}
                  </span>
                  <span
                    className={
                      s.approvalStatus === 'approved' ? 'text-[#777D68] font-semibold' : 'text-[#A66E1E]'
                    }
                  >
                    {s.approvalStatus}
                  </span>
                </div>
                <div className="text-[13.5px] font-semibold text-[#242421] mt-1 line-clamp-2">
                  {s.trendTopic}
                </div>
              </button>
            ))
          )}
        </aside>

        <section className="lg:col-span-8 space-y-6">
          {!activeScript ? (
            <div className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-12 text-center text-[#77766F] text-[14px]">
              Generate a script pack from any genre, click an Online Viral Idea, or create a blank draft to edit.
            </div>
          ) : (
            <div className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-6 space-y-6">
              {/* Strategic Angle Header */}
              <div className="border-b border-[#E4DDD0] pb-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono uppercase tracking-[0.12em] text-[#B69A65]">
                    <span>
                      {activeScript.genre ? `${activeScript.genre} · ` : ''}
                      {activeScript.writingStyle ? `${activeScript.writingStyle} · ` : ''}
                      {activeScript.language} · {activeScript.recommendedFormat}
                    </span>
                    {activeScript.sourceUrl && (
                      <a
                        href={activeScript.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#77766F] hover:text-[#242421] inline-flex items-center gap-1 normal-case"
                      >
                        <span>Grounded Source</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <span
                    className={`text-[11.5px] font-semibold uppercase tracking-[0.08em] ${
                      activeScript.approvalStatus === 'approved' ? 'text-[#777D68]' : 'text-[#A66E1E]'
                    }`}
                  >
                    Status: {activeScript.approvalStatus}
                  </span>
                </div>

                <input
                  type="text"
                  value={activeScript.trendTopic}
                  onChange={(e) => updateScriptTitle(e.target.value)}
                  className="w-full font-editorial text-[24px] text-[#242421] bg-transparent border-b border-transparent focus:border-[#B69A65] focus:outline-none pb-0.5"
                  aria-label="Script Title"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-[12.5px]">
                  <div className="p-3 bg-[#F6F3EC] border border-[#E4DDD0] rounded-sm">
                    <div className="font-semibold text-[#242421]">Unique Angle Thesis</div>
                    <p className="text-[#77766F] mt-1">{activeScript.thesis}</p>
                  </div>
                  <div className="p-3 bg-[#F6F3EC] border border-[#E4DDD0] rounded-sm">
                    <div className="font-semibold text-[#242421]">Audience Pain &amp; CTA</div>
                    <p className="text-[#77766F] mt-1">
                      {activeScript.audiencePainPoint} — {activeScript.ctaStrategy}
                    </p>
                  </div>
                </div>
              </div>

              {/* 3 Variant Tabs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {activeScript.variants.map((v) => {
                  const chosen = v.id === selectedVariant?.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => selectAndApprove(v.id, activeScript.approvalStatus === 'approved' ? 'approved' : 'draft')}
                      className={`p-3 border rounded-sm text-left transition-colors ${
                        chosen
                          ? 'bg-[#242421] text-[#F6F3EC] border-[#242421]'
                          : 'bg-[#FAF8F4] text-[#242421] border-[#E4DDD0] hover:border-[#B69A65]'
                      }`}
                    >
                      <div className="text-[12.5px] font-semibold">{v.toneName}</div>
                      <div
                        className={`text-[11px] font-mono mt-1 ${
                          chosen ? 'text-[#B69A65]' : 'text-[#77766F]'
                        }`}
                      >
                        {v.wordCount} words · ~{v.estimatedDurationSec}s
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Inline AI Writing & Rewrite Toolbar */}
              {selectedVariant && (
                <div className="p-3.5 bg-[#FAF8F4] border border-[#E4DDD0] rounded-sm space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.12em] text-[#242421] font-semibold">
                      <Wand2 className="w-3.5 h-3.5 text-[#B69A65]" />
                      <span>AI Writing &amp; Rewrite Toolbar</span>
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-[#77766F]">
                      Active Draft: {selectedWordCount} words · ~{selectedVariant.estimatedDurationSec}s
                      {selectedWordCount < 70 ? ' (Add detail for full 30s+ natural delivery)' : ' (30s+ Ready)'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {REWRITE_ACTIONS.map(({ action, label }) => {
                      const busy = rewritingAction === action;
                      return (
                        <button
                          key={action}
                          type="button"
                          disabled={Boolean(rewritingAction)}
                          onClick={() => handleRewriteVariant(selectedVariant.id, action)}
                          className="px-2.5 py-1.5 bg-[#FFFFFF] border border-[#E4DDD0] text-[11.5px] font-semibold text-[#242421] rounded-sm inline-flex items-center gap-1 hover:border-[#B69A65] disabled:opacity-50"
                        >
                          {busy && <RefreshCw className="w-3 h-3 animate-spin text-[#B69A65]" />}
                          <span>{busy ? 'Rewriting...' : label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Editable Script Fields */}
              {selectedVariant && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#B69A65] mb-1">
                      3-Second Opening Hook
                    </label>
                    <textarea
                      rows={2}
                      value={selectedVariant.hook3s}
                      onChange={(e) => updateActiveVariant(selectedVariant.id, 'hook3s', e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-[#E4DDD0] text-[14px] font-medium rounded-sm bg-[#FAF8F4]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                      Spoken Body Monologue
                    </label>
                    <textarea
                      rows={6}
                      value={selectedVariant.body}
                      onChange={(e) => updateActiveVariant(selectedVariant.id, 'body', e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-[#E4DDD0] text-[14px] leading-relaxed rounded-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                      Call to Action (CTA)
                    </label>
                    <input
                      type="text"
                      value={selectedVariant.cta}
                      onChange={(e) => updateActiveVariant(selectedVariant.id, 'cta', e.target.value)}
                      className="w-full px-3.5 py-2 border border-[#E4DDD0] text-[14px] rounded-sm"
                    />
                  </div>

                  {/* Approval Gate */}
                  <div className="pt-4 border-t border-[#E4DDD0] flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => selectAndApprove(selectedVariant.id, 'approved')}
                      className="px-4 py-2.5 bg-[#777D68] text-[#FFFFFF] text-[12.5px] font-semibold rounded-sm inline-flex items-center gap-1.5 hover:opacity-90"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {activeScript.approvalStatus === 'approved'
                          ? 'Script Approved'
                          : 'Approve Script for Video Studio'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        if (activeScript.approvalStatus !== 'approved') {
                          await selectAndApprove(selectedVariant.id, 'approved');
                        }
                        onOpenStudioWithScript(activeScript.id);
                      }}
                      className="px-5 py-2.5 bg-[#242421] text-[#F6F3EC] text-[12.5px] font-semibold rounded-sm inline-flex items-center gap-2 hover:bg-[#3A3934]"
                    >
                      <Film className="w-4 h-4 text-[#B69A65]" />
                      <span>Send to Video Studio →</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { ExternalLink, Globe, Plus, RefreshCw, Rss, Sparkles, Trash2 } from 'lucide-react';
import type {
  OnlineViralIdea,
  RssFeedSource,
  ScriptGenre,
  TrendCategory,
  TrendPlatform,
  WorkspaceMode,
  WorkspaceState,
} from '../types';
import { apiRequest, formatDateShort } from '../lib/api';

interface TrendRadarViewProps {
  workspace: WorkspaceState;
  mode: WorkspaceMode;
  onUpdateWorkspace: (w: WorkspaceState) => void;
  onAnalyzeTrend: (trendId: string) => void;
}

const CATEGORIES: Array<'All' | TrendCategory> = [
  'All',
  'Rising',
  'Viral',
  'Comedy',
  'Science',
  'Knowledge',
  'Evergreen',
  'Educational',
  'Entertainment',
  'Business',
  'Technology',
  'Lifestyle',
];

const PLATFORMS: Array<'All' | TrendPlatform> = [
  'All',
  'Online Search',
  'RSS / News',
  'Instagram',
  'TikTok',
  'Facebook',
  'Manual',
];

const ONLINE_GENRES: ScriptGenre[] = [
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

export const TrendRadarView: React.FC<TrendRadarViewProps> = ({
  workspace,
  mode,
  onUpdateWorkspace,
  onAnalyzeTrend,
}) => {
  const [catFilter, setCatFilter] = useState<'All' | TrendCategory>('All');
  const [platFilter, setPlatFilter] = useState<'All' | TrendPlatform>('All');
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [showFeeds, setShowFeeds] = useState(false);
  const [showOnlineSearch, setShowOnlineSearch] = useState(false);
  const [onlineGenre, setOnlineGenre] = useState<ScriptGenre>('Science');
  const [onlineQuery, setOnlineQuery] = useState('');
  const [searchingOnline, setSearchingOnline] = useState(false);
  const [newFeedName, setNewFeedName] = useState('');
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [newFeedCat, setNewFeedCat] = useState<TrendCategory>('Technology');

  const [topic, setTopic] = useState('');
  const [platform, setPlatform] = useState<TrendPlatform>('Instagram');
  const [category, setCategory] = useState<TrendCategory>('Rising');
  const [sourceUrl, setSourceUrl] = useState('');
  const [summary, setSummary] = useState('');
  const [observedViews, setObservedViews] = useState('');
  const [observedEng, setObservedEng] = useState('');

  const saveRssFeeds = async (feeds: RssFeedSource[]) => {
    const updated = await apiRequest<WorkspaceState>('/api/settings', mode, {
      method: 'PUT',
      body: JSON.stringify({ rssFeeds: feeds }),
    });
    onUpdateWorkspace(updated);
  };

  const handleAddFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFeedName.trim() || !newFeedUrl.trim()) return;
    const next: RssFeedSource[] = [
      ...workspace.settings.rssFeeds,
      {
        id: `rss_${Date.now()}`,
        name: newFeedName.trim(),
        url: newFeedUrl.trim(),
        defaultCategory: newFeedCat,
        enabled: true,
      },
    ];
    await saveRssFeeds(next);
    setNewFeedName('');
    setNewFeedUrl('');
  };

  const handleRefreshRss = async () => {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await apiRequest<{ workspace: WorkspaceState; fetchedCount: number; feedErrors: string[] }>(
        '/api/trends/refresh',
        mode,
        { method: 'POST' }
      );
      onUpdateWorkspace(res.workspace);
      setSyncMsg(
        `Synced ${res.fetchedCount} live public feed headlines.${
          res.feedErrors.length > 0 ? ` (${res.feedErrors.length} source warnings)` : ''
        }`
      );
    } catch (e: any) {
      setSyncMsg(e.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleOnlineSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchingOnline(true);
    setSyncMsg('');
    try {
      const res = await apiRequest<{
        workspace: WorkspaceState;
        ideas: OnlineViralIdea[];
        groundingSources: Array<{ title: string; url: string }>;
      }>('/api/intelligence/fetch-online', mode, {
        method: 'POST',
        body: JSON.stringify({
          genre: onlineGenre,
          language: workspace.twin.personality.primaryLanguage || 'English',
          query: onlineQuery.trim() || undefined,
          count: 4,
          alsoImportToRadar: true,
        }),
      });
      onUpdateWorkspace(res.workspace);
      setPlatFilter('All');
      setCatFilter('All');
      setSyncMsg(
        `Fetched ${res.ideas.length} ${onlineGenre} viral ideas via live web search${
          res.groundingSources.length > 0
            ? ` (${res.groundingSources.length} grounded web sources)`
            : ''
        } and added them to Trend Radar.`
      );
      setShowOnlineSearch(false);
    } catch (err: any) {
      setSyncMsg(err.message);
    } finally {
      setSearchingOnline(false);
    }
  };

  const handleManualImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    try {
      const updated = await apiRequest<WorkspaceState>('/api/trends/import', mode, {
        method: 'POST',
        body: JSON.stringify({
          topic,
          platform,
          category,
          sourceUrl,
          summary,
          views: observedViews,
          engagementRate: observedEng,
        }),
      });
      onUpdateWorkspace(updated);
      setTopic('');
      setSourceUrl('');
      setSummary('');
      setObservedViews('');
      setObservedEng('');
      setShowImport(false);
    } catch (err: any) {
      setSyncMsg(err.message);
    }
  };

  const filtered = workspace.trends.filter((t) => {
    if (catFilter !== 'All' && t.category !== catFilter) return false;
    if (platFilter !== 'All' && t.platform !== platFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return t.topic.toLowerCase().includes(q) || t.summary.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#E4DDD0] pb-6">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#B69A65] font-semibold">
            Permitted Trend Ingestion
          </div>
          <h1 className="font-editorial text-[34px] text-[#242421] mt-1">Trend Radar</h1>
          <p className="text-[14px] text-[#77766F] mt-1">
            Sync live Science, Knowledge &amp; Tech RSS feeds, search real-time web viral ideas, or import observed links.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowOnlineSearch((v) => !v)}
            className="px-3.5 py-2.5 bg-[#FFFFFF] border border-[#B69A65] text-[12.5px] font-semibold text-[#242421] rounded-sm inline-flex items-center gap-1.5 hover:bg-[#FAF8F4]"
          >
            <Globe className="w-4 h-4 text-[#B69A65]" />
            <span>Fetch Online Viral Ideas</span>
          </button>
          <button
            type="button"
            onClick={() => setShowFeeds((v) => !v)}
            className="px-3.5 py-2.5 bg-[#FFFFFF] border border-[#E4DDD0] text-[12.5px] font-semibold rounded-sm inline-flex items-center gap-1.5 hover:border-[#B69A65]"
          >
            <Rss className="w-4 h-4 text-[#777D68]" />
            <span>RSS Sources ({workspace.settings.rssFeeds.filter((f) => f.enabled).length})</span>
          </button>
          <button
            type="button"
            onClick={() => setShowImport((v) => !v)}
            className="px-4 py-2.5 bg-[#FFFFFF] border border-[#E4DDD0] text-[12.5px] font-semibold rounded-sm inline-flex items-center gap-1.5 hover:border-[#B69A65]"
          >
            <Plus className="w-4 h-4 text-[#B69A65]" />
            <span>Import Trend / URL</span>
          </button>
          <button
            type="button"
            disabled={syncing}
            onClick={handleRefreshRss}
            className="px-4 py-2.5 bg-[#242421] text-[#F6F3EC] text-[12.5px] font-semibold rounded-sm inline-flex items-center gap-2 hover:bg-[#3A3934]"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#B69A65] ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing Live Feeds...' : 'Sync Live RSS Feeds'}</span>
          </button>
        </div>
      </div>

      {showOnlineSearch && (
        <form
          onSubmit={handleOnlineSearch}
          className="bg-[#FFFFFF] border border-[#B69A65] rounded-sm p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-editorial text-[20px] text-[#242421]">
                Live Web Search — Viral Ideas by Genre
              </div>
              <p className="text-[12.5px] text-[#77766F]">
                Queries live web search grounding for fresh Comedy, Science, Knowledge, and creator topics and imports them directly into Trend Radar.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-3">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                Genre
              </label>
              <select
                value={onlineGenre}
                onChange={(e) => setOnlineGenre(e.target.value as ScriptGenre)}
                className="w-full px-3 py-2 border border-[#E4DDD0] bg-[#F6F3EC] text-[13px] rounded-sm"
              >
                {ONLINE_GENRES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-6">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                Keyword / Niche Focus (Optional)
              </label>
              <input
                type="text"
                value={onlineQuery}
                onChange={(e) => setOnlineQuery(e.target.value)}
                placeholder="e.g., sleep science, Indian office humor, quantum physics, AI habits..."
                className="w-full px-3 py-2 border border-[#E4DDD0] text-[13px] rounded-sm"
              />
            </div>
            <div className="md:col-span-3 flex gap-2">
              <button
                type="submit"
                disabled={searchingOnline}
                className="flex-1 py-2 px-4 bg-[#242421] text-[#F6F3EC] text-[12.5px] font-semibold rounded-sm inline-flex items-center justify-center gap-1.5 hover:bg-[#3A3934]"
              >
                <Globe className={`w-3.5 h-3.5 text-[#B69A65] ${searchingOnline ? 'animate-spin' : ''}`} />
                <span>{searchingOnline ? 'Searching Web...' : 'Search Online & Add'}</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {showFeeds && (
        <div className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-5 space-y-4">
          <div className="font-editorial text-[20px] text-[#242421]">Configured Public RSS / Atom Feeds</div>
          <div className="divide-y divide-[#E4DDD0] border border-[#E4DDD0] rounded-sm">
            {workspace.settings.rssFeeds.map((feed) => (
              <div key={feed.id} className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-[12.5px]">
                <label className="flex items-center gap-2.5 cursor-pointer min-w-0">
                  <input
                    type="checkbox"
                    checked={feed.enabled}
                    onChange={() =>
                      saveRssFeeds(
                        workspace.settings.rssFeeds.map((f) =>
                          f.id === feed.id ? { ...f, enabled: !f.enabled } : f
                        )
                      )
                    }
                    className="accent-[#242421]"
                  />
                  <span className="font-semibold text-[#242421]">{feed.name}</span>
                  <span className="font-mono text-[11px] text-[#77766F] truncate">{feed.url}</span>
                </label>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[11px] text-[#B69A65]">{feed.defaultCategory}</span>
                  <button
                    type="button"
                    onClick={() =>
                      saveRssFeeds(workspace.settings.rssFeeds.filter((f) => f.id !== feed.id))
                    }
                    className="text-[#9E3B33] hover:opacity-80"
                    title="Remove feed"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={handleAddFeed} className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1">
            <input
              type="text"
              placeholder="Feed Name (e.g., AI News)"
              value={newFeedName}
              onChange={(e) => setNewFeedName(e.target.value)}
              className="sm:col-span-3 px-3 py-1.5 border border-[#E4DDD0] text-[12.5px] rounded-sm"
            />
            <input
              type="url"
              placeholder="https://example.com/feed.xml"
              value={newFeedUrl}
              onChange={(e) => setNewFeedUrl(e.target.value)}
              className="sm:col-span-5 px-3 py-1.5 border border-[#E4DDD0] text-[12.5px] font-mono rounded-sm"
            />
            <select
              value={newFeedCat}
              onChange={(e) => setNewFeedCat(e.target.value as TrendCategory)}
              className="sm:col-span-2 px-2.5 py-1.5 border border-[#E4DDD0] text-[12.5px] rounded-sm"
            >
              {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="sm:col-span-2 py-1.5 bg-[#242421] text-[#F6F3EC] text-[12px] font-semibold rounded-sm"
            >
              Add Feed
            </button>
          </form>
        </div>
      )}

      {syncMsg && (
        <div className="p-3 bg-[#EFE8D8] border border-[#B69A65]/40 text-[13px] text-[#242421] rounded-sm">
          {syncMsg}
        </div>
      )}

      {/* Manual Import Form */}
      {showImport && (
        <form
          onSubmit={handleManualImport}
          className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-6 space-y-4"
        >
          <div className="font-editorial text-[20px] text-[#242421]">
            Import Observed Social Trend or Topic Brief
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                Topic Headline
              </label>
              <input
                type="text"
                required
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., Why voice-first AI notes are replacing long blog workflows"
                className="w-full px-3 py-2 border border-[#E4DDD0] text-[13.5px] rounded-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                Platform
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as TrendPlatform)}
                className="w-full px-3 py-2 border border-[#E4DDD0] text-[13.5px] rounded-sm"
              >
                <option value="Instagram">Instagram</option>
                <option value="TikTok">TikTok</option>
                <option value="Facebook">Facebook</option>
                <option value="RSS / News">RSS / News</option>
                <option value="Manual">Manual</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TrendCategory)}
                className="w-full px-3 py-2 border border-[#E4DDD0] text-[13.5px] rounded-sm"
              >
                {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                Source Link (Optional)
              </label>
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 border border-[#E4DDD0] text-[13.5px] rounded-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                Observed Views (Leave blank if unknown)
              </label>
              <input
                type="text"
                value={observedViews}
                onChange={(e) => setObservedViews(e.target.value)}
                placeholder="e.g., 145K"
                className="w-full px-3 py-2 border border-[#E4DDD0] text-[13.5px] rounded-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                Observed Engagement (Optional)
              </label>
              <input
                type="text"
                value={observedEng}
                onChange={(e) => setObservedEng(e.target.value)}
                placeholder="e.g., 5.2%"
                className="w-full px-3 py-2 border border-[#E4DDD0] text-[13.5px] rounded-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
              Context / Notes
            </label>
            <textarea
              rows={2}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full px-3 py-2 border border-[#E4DDD0] text-[13.5px] rounded-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowImport(false)}
              className="px-4 py-2 border border-[#E4DDD0] text-[12.5px] rounded-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#242421] text-[#F6F3EC] text-[12.5px] font-semibold rounded-sm"
            >
              Add to Radar
            </button>
          </div>
        </form>
      )}

      {/* Filter Bar */}
      <div className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={platFilter}
            onChange={(e) => setPlatFilter(e.target.value as any)}
            className="px-3 py-1.5 border border-[#E4DDD0] bg-[#F6F3EC] text-[12.5px] rounded-sm"
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                Platform: {p}
              </option>
            ))}
          </select>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value as any)}
            className="px-3 py-1.5 border border-[#E4DDD0] bg-[#F6F3EC] text-[12.5px] rounded-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                Category: {c}
              </option>
            ))}
          </select>
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter topics or keywords..."
          className="px-3.5 py-1.5 border border-[#E4DDD0] text-[13px] rounded-sm w-full lg:w-72"
        />
      </div>

      {/* Trend Results */}
      {filtered.length === 0 ? (
        <div className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-12 text-center space-y-3">
          <p className="text-[14.5px] text-[#77766F]">
            No trend items match your current filter. Click <strong>Sync Live RSS Feeds</strong> to fetch real
            articles from your enabled sources or import a social trend manually.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((t) => (
            <article
              key={t.id}
              className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-5 flex flex-col justify-between gap-4 hover:border-[#B69A65] transition-colors"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-[#77766F]">
                  <span>
                    {t.platform} · {t.category} · {t.sourceName}
                  </span>
                  <span className="text-[#242421] font-semibold tabular-nums">
                    Rel {t.relevanceScore}% · Opp {t.opportunityScore}%
                  </span>
                </div>
                <h3 className="font-editorial text-[20px] leading-snug text-[#242421]">{t.topic}</h3>
                <p className="text-[13px] text-[#77766F] leading-relaxed">{t.summary}</p>
              </div>

              <div className="pt-3 border-t border-[#E4DDD0] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[#77766F]">
                  <span>Discovered {formatDateShort(t.discoveredAt)}</span>
                  <span className="font-mono">
                    {t.metrics.available
                      ? `Observed: ${t.metrics.views || ''} ${t.metrics.engagementRate || ''}`
                      : 'Engagement: Unavailable from source'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  {t.sourceUrl ? (
                    <a
                      href={t.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[12px] text-[#77766F] hover:text-[#242421] inline-flex items-center gap-1"
                    >
                      <span>Source</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={() => onAnalyzeTrend(t.id)}
                    className="px-3.5 py-1.5 bg-[#242421] text-[#F6F3EC] text-[12px] font-semibold rounded-sm inline-flex items-center gap-1.5 hover:bg-[#3A3934]"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#B69A65]" />
                    <span>Generate Scripts</span>
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { BarChart3, Plus } from 'lucide-react';
import type { WorkspaceMode, WorkspaceState } from '../types';
import { apiRequest, formatCurrency } from '../lib/api';

interface AnalyticsViewProps {
  workspace: WorkspaceState;
  mode: WorkspaceMode;
  onUpdateWorkspace: (w: WorkspaceState) => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  workspace,
  mode,
  onUpdateWorkspace,
}) => {
  const [showLogForm, setShowLogForm] = useState(false);
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState<'Instagram Reels' | 'TikTok' | 'Facebook Reels'>('Instagram Reels');
  const [views, setViews] = useState(0);
  const [retentionPct, setRetentionPct] = useState(0);
  const [shares, setShares] = useState(0);
  const [comments, setComments] = useState(0);
  const [saves, setSaves] = useState(0);
  const [followerDelta, setFollowerDelta] = useState(0);

  const handleLog = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated = await apiRequest<WorkspaceState>('/api/analytics/log', mode, {
      method: 'POST',
      body: JSON.stringify({
        title: title || 'Published Twin Post',
        platform,
        views,
        reach: Math.round(views * 0.85),
        retentionPct,
        avgWatchSec: Math.round((retentionPct / 100) * 28),
        shares,
        comments,
        saves,
        followerDelta,
      }),
    });
    onUpdateWorkspace(updated);
    setShowLogForm(false);
    setTitle('');
  };

  const rows = workspace.analytics;
  const totals = rows.reduce(
    (acc, r) => ({
      views: acc.views + r.views,
      reach: acc.reach + r.reach,
      shares: acc.shares + r.shares,
      saves: acc.saves + r.saves,
      followers: acc.followers + r.followerDelta,
      cost: acc.cost + r.productionCostUsd,
    }),
    { views: 0, reach: 0, shares: 0, saves: 0, followers: 0, cost: 0 }
  );

  const avgRetention =
    rows.length > 0 ? (rows.reduce((a, r) => a + r.retentionPct, 0) / rows.length).toFixed(1) : '—';
  const avgEng =
    rows.length > 0 ? (rows.reduce((a, r) => a + r.engagementRate, 0) / rows.length).toFixed(2) : '—';

  const bestPost = [...rows].sort((a, b) => b.retentionPct - a.retentionPct)[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E4DDD0] pb-6">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#B69A65] font-semibold">
            {mode === 'demo' ? 'Demo Cohort Analytics' : 'Live Factual Ledger'}
          </div>
          <h1 className="font-editorial text-[34px] text-[#242421] mt-1">Analytics</h1>
          <p className="text-[14px] text-[#77766F] mt-1">
            Tracks views, reach, retention, shares, comments, saves, follower growth, and production cost
            efficiency strictly from logged records.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowLogForm((v) => !v)}
          className="px-4 py-2.5 bg-[#242421] text-[#F6F3EC] text-[12.5px] font-semibold rounded-sm inline-flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4 text-[#B69A65]" />
          <span>Log Post Metrics</span>
        </button>
      </div>

      {showLogForm && (
        <form
          onSubmit={handleLog}
          className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-6 grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          <div className="col-span-2">
            <label className="block text-[11px] font-semibold uppercase text-[#77766F] mb-1">Post Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-[#E4DDD0] text-[13px] rounded-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase text-[#77766F] mb-1">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as any)}
              className="w-full px-3 py-2 border border-[#E4DDD0] text-[13px] rounded-sm"
            >
              <option value="Instagram Reels">Instagram Reels</option>
              <option value="TikTok">TikTok</option>
              <option value="Facebook Reels">Facebook Reels</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase text-[#77766F] mb-1">Views</label>
            <input
              type="number"
              min={0}
              value={views}
              onChange={(e) => setViews(Number(e.target.value))}
              className="w-full px-3 py-2 border border-[#E4DDD0] font-mono text-[13px] rounded-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase text-[#77766F] mb-1">Retention %</label>
            <input
              type="number"
              min={0}
              max={100}
              value={retentionPct}
              onChange={(e) => setRetentionPct(Number(e.target.value))}
              className="w-full px-3 py-2 border border-[#E4DDD0] font-mono text-[13px] rounded-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase text-[#77766F] mb-1">Shares</label>
            <input
              type="number"
              min={0}
              value={shares}
              onChange={(e) => setShares(Number(e.target.value))}
              className="w-full px-3 py-2 border border-[#E4DDD0] font-mono text-[13px] rounded-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase text-[#77766F] mb-1">Saves</label>
            <input
              type="number"
              min={0}
              value={saves}
              onChange={(e) => setSaves(Number(e.target.value))}
              className="w-full px-3 py-2 border border-[#E4DDD0] font-mono text-[13px] rounded-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase text-[#77766F] mb-1">
              Follower Growth
            </label>
            <input
              type="number"
              value={followerDelta}
              onChange={(e) => setFollowerDelta(Number(e.target.value))}
              className="w-full px-3 py-2 border border-[#E4DDD0] font-mono text-[13px] rounded-sm"
            />
          </div>
          <div className="col-span-2 md:col-span-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowLogForm(false)}
              className="px-4 py-2 border border-[#E4DDD0] text-[12.5px] rounded-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#242421] text-[#F6F3EC] text-[12.5px] font-semibold rounded-sm"
            >
              Save Logged Metrics
            </button>
          </div>
        </form>
      )}

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border border-[#E4DDD0] bg-[#FFFFFF] rounded-sm divide-y lg:divide-y-0 lg:divide-x divide-[#E4DDD0]">
        <div className="p-5">
          <div className="text-[11px] uppercase tracking-[0.1em] text-[#77766F]">Total Views</div>
          <div className="font-mono text-[26px] font-semibold tabular-nums mt-1">
            {rows.length ? totals.views.toLocaleString() : '—'}
          </div>
        </div>
        <div className="p-5">
          <div className="text-[11px] uppercase tracking-[0.1em] text-[#77766F]">Avg Retention</div>
          <div className="font-mono text-[26px] font-semibold tabular-nums mt-1">
            {rows.length ? `${avgRetention}%` : '—'}
          </div>
        </div>
        <div className="p-5">
          <div className="text-[11px] uppercase tracking-[0.1em] text-[#77766F]">Avg Engagement</div>
          <div className="font-mono text-[26px] font-semibold tabular-nums mt-1">
            {rows.length ? `${avgEng}%` : '—'}
          </div>
        </div>
        <div className="p-5">
          <div className="text-[11px] uppercase tracking-[0.1em] text-[#77766F]">Net Follower Delta</div>
          <div className="font-mono text-[26px] font-semibold tabular-nums mt-1">
            {rows.length ? `+${totals.followers}` : '—'}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-12 text-center space-y-2">
          <BarChart3 className="w-7 h-7 text-[#B69A65] mx-auto" />
          <p className="text-[14px] text-[#77766F]">
            No live post performance logged yet. TwinForge never fabricates analytics—log real metrics once
            published.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {bestPost && (
            <div className="p-5 bg-[#EFE8D8] border border-[#B69A65]/40 rounded-sm text-[13.5px]">
              <strong className="font-semibold text-[#242421]">Historical Recommendation:</strong>{' '}
              <span className="text-[#242421]">
                {bestPost.language} {bestPost.format} ({bestPost.aspectRatio}) using "{bestPost.hookType}" led
                retention at <span className="font-mono font-semibold">{bestPost.retentionPct}%</span> on{' '}
                {bestPost.platform}.
              </span>
            </div>
          )}

          <div className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[#FAF8F4] border-b border-[#E4DDD0] text-[11px] uppercase tracking-[0.08em] text-[#77766F]">
                <tr>
                  <th className="py-3 px-4">Title</th>
                  <th className="py-3 px-4">Platform</th>
                  <th className="py-3 px-4">Format</th>
                  <th className="py-3 px-4 text-right">Views</th>
                  <th className="py-3 px-4 text-right">Retention</th>
                  <th className="py-3 px-4 text-right">Saves / Shares</th>
                  <th className="py-3 px-4 text-right">Eng. Rate</th>
                  <th className="py-3 px-4 text-right">Prod. Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4DDD0] font-mono tabular-nums">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-[#FAF8F4]">
                    <td className="py-3 px-4 font-sans font-semibold text-[#242421]">{r.title}</td>
                    <td className="py-3 px-4 font-sans text-[#77766F]">{r.platform}</td>
                    <td className="py-3 px-4 font-sans text-[#77766F]">
                      {r.language} · {r.aspectRatio}
                    </td>
                    <td className="py-3 px-4 text-right">{r.views.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right">{r.retentionPct}%</td>
                    <td className="py-3 px-4 text-right">
                      {r.saves} / {r.shares}
                    </td>
                    <td className="py-3 px-4 text-right">{r.engagementRate}%</td>
                    <td className="py-3 px-4 text-right">{formatCurrency(r.productionCostUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

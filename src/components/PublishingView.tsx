import React, { useEffect, useState } from 'react';
import { Calendar, CheckCircle2, Send } from 'lucide-react';
import type { WorkspaceMode, WorkspaceState } from '../types';
import { apiRequest } from '../lib/api';

interface PublishingViewProps {
  workspace: WorkspaceState;
  mode: WorkspaceMode;
  preselectedVideoId?: string;
  onUpdateWorkspace: (w: WorkspaceState) => void;
}

export const PublishingView: React.FC<PublishingViewProps> = ({
  workspace,
  mode,
  preselectedVideoId,
  onUpdateWorkspace,
}) => {
  const [videoId, setVideoId] = useState(preselectedVideoId || workspace.videos[0]?.id || '');
  const [platform, setPlatform] = useState<'Instagram Reels' | 'TikTok' | 'Facebook Reels'>('Instagram Reels');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('#DigitalTwin, #CreatorStudio, #ContentWorkflow');
  const [scheduledFor, setScheduledFor] = useState(
    new Date(Date.now() + 86400000).toISOString().slice(0, 16)
  );
  const [error, setError] = useState('');

  useEffect(() => {
    if (preselectedVideoId) setVideoId(preselectedVideoId);
  }, [preselectedVideoId]);

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoId) {
      setError('Select a rendered video from Video Library first.');
      return;
    }
    setError('');
    try {
      const updated = await apiRequest<WorkspaceState>('/api/publishing/draft', mode, {
        method: 'POST',
        body: JSON.stringify({
          videoId,
          platform,
          caption,
          hashtags: hashtags
            .split(',')
            .map((h) => h.trim())
            .filter(Boolean),
          scheduledFor,
        }),
      });
      onUpdateWorkspace(updated);
      setCaption('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleApproveDraft = async (id: string) => {
    const updated = await apiRequest<WorkspaceState>(`/api/publishing/${id}`, mode, {
      method: 'PUT',
      body: JSON.stringify({ approvalStatus: 'approved', publishStatus: 'scheduled' }),
    });
    onUpdateWorkspace(updated);
  };

  const handleDispatch = async (id: string) => {
    setError('');
    try {
      const updated = await apiRequest<WorkspaceState>(`/api/publishing/${id}/dispatch`, mode, {
        method: 'POST',
      });
      onUpdateWorkspace(updated);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E4DDD0] pb-6">
        <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#B69A65] font-semibold">
          Distribution &amp; Human Sign-Off
        </div>
        <h1 className="font-editorial text-[34px] text-[#242421] mt-1">Publishing</h1>
        <p className="text-[14px] text-[#77766F] mt-1">
          Prepare Instagram Reels, TikTok, and Facebook Reels packages. Posts remain Draft or Scheduled unless
          an external publisher confirms delivery.
        </p>
      </div>

      {error && (
        <div className="p-3.5 bg-[#9E3B33]/10 border border-[#9E3B33]/30 text-[#9E3B33] text-[13px] rounded-sm">
          {error}
        </div>
      )}

      {/* New Publishing Draft Composer */}
      <form
        onSubmit={handleCreateDraft}
        className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-6 space-y-4"
      >
        <h2 className="font-editorial text-[22px] text-[#242421]">Prepare Campaign Package</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
              Rendered Video
            </label>
            <select
              value={videoId}
              onChange={(e) => setVideoId(e.target.value)}
              className="w-full px-3 py-2 border border-[#E4DDD0] bg-[#F6F3EC] text-[13px] rounded-sm"
            >
              <option value="">Select video...</option>
              {workspace.videos.map((v) => (
                <option key={v.id} value={v.id}>
                  [{v.aspectRatio}] {v.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
              Target Platform
            </label>
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
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
              Schedule Slot
            </label>
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              className="w-full px-3 py-2 border border-[#E4DDD0] text-[13px] rounded-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
              Platform Caption
            </label>
            <textarea
              rows={2}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write your caption and call to action..."
              className="w-full px-3 py-2 border border-[#E4DDD0] text-[13.5px] rounded-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
              Hashtags (comma separated)
            </label>
            <textarea
              rows={2}
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              className="w-full px-3 py-2 border border-[#E4DDD0] text-[13px] rounded-sm"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="px-5 py-2.5 bg-[#242421] text-[#F6F3EC] text-[12.5px] font-semibold rounded-sm"
          >
            Create Publishing Draft
          </button>
        </div>
      </form>

      {/* Publishing Queue */}
      <section className="space-y-4">
        {workspace.publishingDrafts.length === 0 ? (
          <div className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-10 text-center text-[13.5px] text-[#77766F]">
            No publishing drafts created yet.
          </div>
        ) : (
          workspace.publishingDrafts.map((draft) => (
            <article
              key={draft.id}
              className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-5 flex flex-col md:flex-row gap-5 justify-between"
            >
              <div className="flex gap-4 min-w-0">
                <div className="w-20 h-28 bg-[#1A1917] shrink-0 border border-[#E4DDD0] overflow-hidden rounded-sm">
                  {draft.thumbnailUrl && (
                    <img
                      src={draft.thumbnailUrl}
                      alt={draft.videoTitle}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="space-y-1.5 min-w-0">
                  <div className="text-[11px] font-mono uppercase text-[#B69A65]">
                    {draft.platform} · {draft.aspectRatio} · Publish Status: {draft.publishStatus}
                  </div>
                  <h3 className="font-editorial text-[20px] text-[#242421]">{draft.videoTitle}</h3>
                  <p className="text-[13px] text-[#242421]">{draft.caption}</p>
                  <div className="text-[12px] font-mono text-[#77766F]">{draft.hashtags.join(' ')}</div>
                  <div className="text-[11.5px] text-[#77766F] inline-flex items-center gap-1.5 pt-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Scheduled {draft.scheduledFor.replace('T', ' ')}</span>
                    <span>·</span>
                    <span>{draft.statusNote}</span>
                  </div>
                </div>
              </div>

              <div className="flex sm:flex-col justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleApproveDraft(draft.id)}
                  disabled={draft.approvalStatus === 'approved'}
                  className={`px-3.5 py-2 text-[12px] font-semibold rounded-sm inline-flex items-center justify-center gap-1.5 ${
                    draft.approvalStatus === 'approved'
                      ? 'bg-[#E9ECE4] text-[#777D68] border border-[#777D68]/40'
                      : 'bg-[#777D68] text-[#FFFFFF]'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{draft.approvalStatus === 'approved' ? 'Human Approved' : 'Approve Draft'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDispatch(draft.id)}
                  className="px-3.5 py-2 bg-[#242421] text-[#F6F3EC] text-[12px] font-semibold rounded-sm inline-flex items-center justify-center gap-1.5 hover:bg-[#3A3934]"
                >
                  <Send className="w-3.5 h-3.5 text-[#B69A65]" />
                  <span>Dispatch Webhook</span>
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
};

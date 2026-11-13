import React, { useState } from 'react';
import { CheckCircle2, Download, Play, Send, Trash2, X, XCircle } from 'lucide-react';
import type { VideoRenderJob, WorkspaceMode, WorkspaceState } from '../types';
import { apiRequest, formatCurrency, formatDateShort } from '../lib/api';

interface VideoLibraryViewProps {
  workspace: WorkspaceState;
  mode: WorkspaceMode;
  onUpdateWorkspace: (w: WorkspaceState) => void;
  onSendToPublishing: (videoId: string) => void;
}

export const VideoLibraryView: React.FC<VideoLibraryViewProps> = ({
  workspace,
  mode,
  onUpdateWorkspace,
  onSendToPublishing,
}) => {
  const [filter, setFilter] = useState<'all' | 'approved' | 'pending' | 'rejected'>('all');
  const [screeningVideo, setScreeningVideo] = useState<VideoRenderJob | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const filtered = workspace.videos.filter((v) =>
    filter === 'all' ? true : v.reviewStatus === filter
  );

  const handleReview = async (id: string, reviewStatus: 'approved' | 'rejected' | 'pending') => {
    const updated = await apiRequest<WorkspaceState>(`/api/library/${id}/review`, mode, {
      method: 'PUT',
      body: JSON.stringify({ reviewStatus }),
    });
    onUpdateWorkspace(updated);
    if (screeningVideo?.id === id) {
      setScreeningVideo(updated.videos.find((v) => v.id === id) || null);
    }
  };

  const handleDelete = async (id: string) => {
    const updated = await apiRequest<WorkspaceState>(`/api/library/${id}`, mode, {
      method: 'DELETE',
    });
    onUpdateWorkspace(updated);
    if (screeningVideo?.id === id) setScreeningVideo(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E4DDD0] pb-6">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#B69A65] font-semibold">
            Completed Renders &amp; Approval
          </div>
          <h1 className="font-editorial text-[34px] text-[#242421] mt-1">Video Library</h1>
          <p className="text-[14px] text-[#77766F] mt-1">
            Hover any card to preview live motion, click to open the Screening Room with full audio, approve for
            publishing, or download MP4 masters.
          </p>
        </div>

        <div className="inline-flex border border-[#E4DDD0] bg-[#FFFFFF] rounded-sm p-0.5 text-[12px]">
          {(['all', 'approved', 'pending', 'rejected'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 capitalize rounded-sm ${
                filter === f ? 'bg-[#242421] text-[#F6F3EC] font-semibold' : 'text-[#77766F]'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-12 text-center text-[14px] text-[#77766F]">
          No rendered videos match this filter yet. Render your first twin video in Video Studio.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((vid) => (
            <article
              key={vid.id}
              onMouseEnter={() => setHoveredId(vid.id)}
              onMouseLeave={() => setHoveredId((prev) => (prev === vid.id ? null : prev))}
              className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm overflow-hidden flex flex-col justify-between"
            >
              <div>
                <div
                  onClick={() => setScreeningVideo(vid)}
                  className="aspect-video bg-[#1A1917] relative cursor-pointer group overflow-hidden"
                >
                  {hoveredId === vid.id ? (
                    <video
                      src={vid.videoUrl}
                      poster={vid.thumbnailUrl}
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    vid.thumbnailUrl && (
                      <img
                        src={vid.thumbnailUrl}
                        alt={vid.title}
                        className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                      />
                    )
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-[#1A1917]/25 group-hover:bg-transparent transition-colors">
                    <div className="w-11 h-11 rounded-full bg-[#242421]/90 border border-[#B69A65] flex items-center justify-center group-hover:opacity-0 transition-opacity">
                      <Play className="w-4 h-4 text-[#F6F3EC] ml-0.5" />
                    </div>
                  </div>
                  <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-[#1A1917]/85 text-[#F6F3EC] font-mono text-[11px] rounded-sm">
                    {vid.aspectRatio} · {vid.durationSec}s
                  </div>
                </div>

                <div className="p-5 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#77766F]">
                    <span>
                      {vid.qualityTier.replace('_', ' ')} · {vid.language}
                    </span>
                    <span
                      className={`font-semibold uppercase ${
                        vid.reviewStatus === 'approved'
                          ? 'text-[#777D68]'
                          : vid.reviewStatus === 'rejected'
                            ? 'text-[#9E3B33]'
                            : 'text-[#A66E1E]'
                      }`}
                    >
                      {vid.reviewStatus}
                    </span>
                  </div>
                  <h3 className="font-editorial text-[20px] text-[#242421] leading-snug">{vid.title}</h3>
                  <div className="text-[12px] text-[#77766F] font-mono tabular-nums">
                    Actual Cost {formatCurrency(vid.actualCostUsd)} · {formatDateShort(vid.createdAt)}
                  </div>
                </div>
              </div>

              <div className="px-5 py-3.5 border-t border-[#E4DDD0] bg-[#FAF8F4] flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleReview(vid.id, 'approved')}
                    className="p-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[#777D68] hover:border-[#777D68] rounded-sm"
                    title="Approve video"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReview(vid.id, 'rejected')}
                    className="p-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[#9E3B33] hover:border-[#9E3B33] rounded-sm"
                    title="Reject video"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                  <a
                    href={vid.videoUrl}
                    download={`${vid.id}.mp4`}
                    className="p-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[#242421] hover:border-[#B69A65] rounded-sm"
                    title="Download MP4"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDelete(vid.id)}
                    className="p-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[#77766F] hover:text-[#9E3B33] hover:border-[#9E3B33] rounded-sm"
                    title="Delete video"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => onSendToPublishing(vid.id)}
                  className="px-3 py-1.5 bg-[#242421] text-[#F6F3EC] text-[12px] font-semibold rounded-sm inline-flex items-center gap-1.5"
                >
                  <Send className="w-3 h-3 text-[#B69A65]" />
                  <span>Prep Publish</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Dark Screening Room Modal */}
      {screeningVideo && (
        <div className="fixed inset-0 z-50 bg-[#1A1917]/85 flex items-center justify-center p-4">
          <div className="bg-[#1A1917] text-[#F6F3EC] border border-[#34312B] rounded-sm w-full max-w-3xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#2E2C28] flex items-center justify-between">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#B69A65]">
                  Master Screening Room · {screeningVideo.aspectRatio}
                </div>
                <h2 className="font-editorial text-[22px] mt-0.5">{screeningVideo.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setScreeningVideo(null)}
                className="p-1.5 text-[#BDB7AA] hover:text-[#FFFFFF]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-[#0F0E0D] flex items-center justify-center p-4">
              <video
                key={screeningVideo.videoUrl}
                src={screeningVideo.videoUrl}
                poster={screeningVideo.thumbnailUrl}
                controls
                autoPlay
                playsInline
                preload="auto"
                className="max-h-[60vh] w-full object-contain"
              />
            </div>
            <div className="px-6 py-4 border-t border-[#2E2C28] flex flex-wrap items-center justify-between gap-4 text-[12px] font-mono text-[#BDB7AA]">
              <span>{screeningVideo.provenanceNote}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleReview(screeningVideo.id, 'approved')}
                  className="px-3 py-1.5 bg-[#777D68] text-[#FFFFFF] rounded-sm font-sans font-semibold"
                >
                  Approve
                </button>
                <a
                  href={screeningVideo.videoUrl}
                  download={`${screeningVideo.id}.mp4`}
                  className="px-3 py-1.5 bg-[#2A2824] border border-[#3E3B35] text-[#F6F3EC] rounded-sm font-sans font-semibold inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-[#B69A65]" />
                  <span>Download MP4</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

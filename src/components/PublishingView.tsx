import React, { useEffect, useState } from 'react';
import { Calendar, CheckCircle2, Link2, RefreshCw, Send, Share2, Workflow } from 'lucide-react';
import type {
  ConnectorAuthType,
  ConnectorHttpMethod,
  WorkspaceMode,
  WorkspaceState,
} from '../types';
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
  const [dispatchBusyId, setDispatchBusyId] = useState<string | null>(null);
  const [openConnectorId, setOpenConnectorId] = useState<string | null>(null);
  const [channelNotice, setChannelNotice] = useState('');
  const [error, setError] = useState('');

  const igConnector = workspace.integrations.find((i) => i.id === 'instagram_direct');
  const fbConnector = workspace.integrations.find((i) => i.id === 'facebook_direct');
  const n8nConnector = workspace.integrations.find((i) => i.id === 'n8n_http_node');

  const [igAccountId, setIgAccountId] = useState(igConnector?.accountId || '');
  const [igToken, setIgToken] = useState(igConnector?.apiToken || '');
  const [igBaseUrl, setIgBaseUrl] = useState(igConnector?.publicMediaBaseUrl || '');

  const [fbPageId, setFbPageId] = useState(fbConnector?.accountId || '');
  const [fbToken, setFbToken] = useState(fbConnector?.apiToken || '');
  const [fbBaseUrl, setFbBaseUrl] = useState(fbConnector?.publicMediaBaseUrl || '');

  const [n8nUrl, setN8nUrl] = useState(n8nConnector?.endpointUrl || '');
  const [n8nMethod, setN8nMethod] = useState<ConnectorHttpMethod>(n8nConnector?.httpMethod || 'POST');
  const [n8nAuthType, setN8nAuthType] = useState<ConnectorAuthType>(n8nConnector?.authType || 'bearer');
  const [n8nToken, setN8nToken] = useState(n8nConnector?.apiToken || '');
  const [nodeBusyId, setNodeBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (preselectedVideoId) setVideoId(preselectedVideoId);
  }, [preselectedVideoId]);

  useEffect(() => {
    if (igConnector) {
      setIgAccountId(igConnector.accountId || '');
      setIgToken(igConnector.apiToken || '');
      setIgBaseUrl(igConnector.publicMediaBaseUrl || '');
    }
    if (fbConnector) {
      setFbPageId(fbConnector.accountId || '');
      setFbToken(fbConnector.apiToken || '');
      setFbBaseUrl(fbConnector.publicMediaBaseUrl || '');
    }
    if (n8nConnector) {
      setN8nUrl(n8nConnector.endpointUrl || '');
      setN8nMethod(n8nConnector.httpMethod || 'POST');
      setN8nAuthType(n8nConnector.authType || 'bearer');
      setN8nToken(n8nConnector.apiToken || '');
    }
  }, [igConnector, fbConnector, n8nConnector]);

  const handleSaveAndTestConnector = async (connectorId: string) => {
    setError('');
    setChannelNotice('');
    setNodeBusyId(connectorId);
    try {
      const payload =
        connectorId === 'instagram_direct'
          ? { accountId: igAccountId, apiToken: igToken, publicMediaBaseUrl: igBaseUrl }
          : connectorId === 'facebook_direct'
            ? { accountId: fbPageId, apiToken: fbToken, publicMediaBaseUrl: fbBaseUrl }
            : { endpointUrl: n8nUrl, httpMethod: n8nMethod, authType: n8nAuthType, apiToken: n8nToken };

      await apiRequest<WorkspaceState>(`/api/integrations/${connectorId}`, mode, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      const tested = await apiRequest<WorkspaceState>(`/api/integrations/${connectorId}/test`, mode, {
        method: 'POST',
      });
      onUpdateWorkspace(tested);
      const updatedConn = tested.integrations.find((c) => c.id === connectorId);
      setChannelNotice(updatedConn?.lastTestResult?.message || 'Connector updated.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setNodeBusyId(null);
    }
  };

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

  const handleDispatch = async (id: string, targetConnectorId?: string) => {
    setError('');
    setChannelNotice('');
    setDispatchBusyId(`${id}:${targetConnectorId || 'auto'}`);
    try {
      const updated = await apiRequest<WorkspaceState>(`/api/publishing/${id}/dispatch`, mode, {
        method: 'POST',
        body: JSON.stringify({ targetConnectorId }),
      });
      onUpdateWorkspace(updated);
      const latest = updated.publishingDrafts.find((d) => d.id === id);
      if (latest?.statusNote) setChannelNotice(latest.statusNote);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDispatchBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E4DDD0] pb-6">
        <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#B69A65] font-semibold">
          Direct Social APIs · n8n HTTP Node · Human Sign-Off
        </div>
        <h1 className="font-editorial text-[34px] text-[#242421] mt-1">Publishing</h1>
        <p className="text-[14px] text-[#77766F] mt-1">
          Connect Instagram Graph API &amp; Facebook Page API directly with access tokens, or dispatch through an
          n8n-style HTTP Request Node. Drafts never report published without HTTP confirmation.
        </p>
      </div>

      {error && (
        <div className="p-3.5 bg-[#9E3B33]/10 border border-[#9E3B33]/30 text-[#9E3B33] text-[13px] rounded-sm">
          {error}
        </div>
      )}
      {channelNotice && (
        <div className="p-3.5 bg-[#EFE8D8] border border-[#B69A65]/50 text-[#242421] text-[13px] rounded-sm">
          {channelNotice}
        </div>
      )}

      {/* Direct Instagram, Facebook & n8n HTTP Node Quick Connect Bar */}
      <section className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E4DDD0] pb-3">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#B69A65] font-semibold">
              Connected Distribution Channels &amp; HTTP API Node
            </div>
            <p className="text-[12.5px] text-[#77766F]">
              Configure your Meta tokens or custom API HTTP node directly here before posting Reels.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              id: 'instagram_direct',
              title: 'Instagram Direct (Graph API)',
              conn: igConnector,
              icon: Share2,
              meta: igConnector?.accountId ? `IG ID ${igConnector.accountId}` : 'Requires IG Business ID + Token',
            },
            {
              id: 'facebook_direct',
              title: 'Facebook Page Reels (Graph API)',
              conn: fbConnector,
              icon: Link2,
              meta: fbConnector?.accountId ? `Page ID ${fbConnector.accountId}` : 'Requires Page ID + Token',
            },
            {
              id: 'n8n_http_node',
              title: 'n8n HTTP Request Node',
              conn: n8nConnector,
              icon: Workflow,
              meta: n8nConnector?.endpointUrl
                ? `${n8nConnector.httpMethod || 'POST'} · ${n8nConnector.authType || 'none'}`
                : 'Custom API / Webhook + Token',
            },
          ].map((item) => {
            const Icon = item.icon;
            const status = item.conn?.status || 'unconfigured';
            const expanded = openConnectorId === item.id;
            return (
              <div key={item.id} className="border border-[#E4DDD0] bg-[#FAF8F4] rounded-sm p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="w-4 h-4 text-[#B69A65] shrink-0" />
                    <div className="font-semibold text-[13.5px] text-[#242421] truncate">{item.title}</div>
                  </div>
                  <span
                    className={`text-[10.5px] font-mono uppercase font-semibold whitespace-nowrap shrink-0 ${
                      status === 'connected' || status === 'reachable'
                        ? 'text-[#777D68]'
                        : status === 'unreachable'
                          ? 'text-[#9E3B33]'
                          : 'text-[#A66E1E]'
                    }`}
                  >
                    {status}
                  </span>
                </div>
                <div className="text-[11.5px] font-mono text-[#77766F] truncate">{item.meta}</div>
                <button
                  type="button"
                  onClick={() => setOpenConnectorId(expanded ? null : item.id)}
                  className="w-full py-1.5 px-3 bg-[#FFFFFF] border border-[#E4DDD0] hover:border-[#242421] text-[12px] font-semibold text-[#242421] rounded-sm"
                >
                  {expanded ? 'Hide Credentials' : 'Connect / Edit API & Token'}
                </button>
              </div>
            );
          })}
        </div>

        {openConnectorId === 'instagram_direct' && (
          <div className="p-4 bg-[#F6F3EC] border border-[#E4DDD0] rounded-sm grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-3">
              <label className="block text-[10.5px] font-semibold uppercase text-[#77766F] mb-1">
                IG Business Account ID
              </label>
              <input
                type="text"
                value={igAccountId}
                onChange={(e) => setIgAccountId(e.target.value)}
                placeholder="178414..."
                className="w-full px-3 py-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[12.5px] font-mono rounded-sm"
              />
            </div>
            <div className="md:col-span-4">
              <label className="block text-[10.5px] font-semibold uppercase text-[#77766F] mb-1">
                Meta Graph Access Token
              </label>
              <input
                type="password"
                value={igToken}
                onChange={(e) => setIgToken(e.target.value)}
                placeholder="EAAG..."
                className="w-full px-3 py-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[12.5px] font-mono rounded-sm"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-[10.5px] font-semibold uppercase text-[#77766F] mb-1">
                Public Video URL Origin
              </label>
              <input
                type="url"
                value={igBaseUrl}
                onChange={(e) => setIgBaseUrl(e.target.value)}
                placeholder="https://studio.example.com"
                className="w-full px-3 py-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[12.5px] font-mono rounded-sm"
              />
            </div>
            <div className="md:col-span-2">
              <button
                type="button"
                disabled={nodeBusyId === 'instagram_direct'}
                onClick={() => void handleSaveAndTestConnector('instagram_direct')}
                className="w-full py-1.5 px-3 bg-[#242421] text-[#F6F3EC] text-[12px] font-semibold rounded-sm inline-flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`w-3 h-3 ${nodeBusyId === 'instagram_direct' ? 'animate-spin' : ''}`} />
                <span>Save &amp; Test</span>
              </button>
            </div>
          </div>
        )}

        {openConnectorId === 'facebook_direct' && (
          <div className="p-4 bg-[#F6F3EC] border border-[#E4DDD0] rounded-sm grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-3">
              <label className="block text-[10.5px] font-semibold uppercase text-[#77766F] mb-1">
                Facebook Page ID
              </label>
              <input
                type="text"
                value={fbPageId}
                onChange={(e) => setFbPageId(e.target.value)}
                placeholder="102938..."
                className="w-full px-3 py-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[12.5px] font-mono rounded-sm"
              />
            </div>
            <div className="md:col-span-4">
              <label className="block text-[10.5px] font-semibold uppercase text-[#77766F] mb-1">
                Page Access Token
              </label>
              <input
                type="password"
                value={fbToken}
                onChange={(e) => setFbToken(e.target.value)}
                placeholder="EAAG..."
                className="w-full px-3 py-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[12.5px] font-mono rounded-sm"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-[10.5px] font-semibold uppercase text-[#77766F] mb-1">
                Public Video URL Origin
              </label>
              <input
                type="url"
                value={fbBaseUrl}
                onChange={(e) => setFbBaseUrl(e.target.value)}
                placeholder="https://studio.example.com"
                className="w-full px-3 py-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[12.5px] font-mono rounded-sm"
              />
            </div>
            <div className="md:col-span-2">
              <button
                type="button"
                disabled={nodeBusyId === 'facebook_direct'}
                onClick={() => void handleSaveAndTestConnector('facebook_direct')}
                className="w-full py-1.5 px-3 bg-[#242421] text-[#F6F3EC] text-[12px] font-semibold rounded-sm inline-flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`w-3 h-3 ${nodeBusyId === 'facebook_direct' ? 'animate-spin' : ''}`} />
                <span>Save &amp; Test</span>
              </button>
            </div>
          </div>
        )}

        {openConnectorId === 'n8n_http_node' && (
          <div className="p-4 bg-[#F6F3EC] border border-[#E4DDD0] rounded-sm grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="block text-[10.5px] font-semibold uppercase text-[#77766F] mb-1">Method</label>
              <select
                value={n8nMethod}
                onChange={(e) => setN8nMethod(e.target.value as ConnectorHttpMethod)}
                className="w-full px-2.5 py-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[12.5px] font-mono rounded-sm"
              >
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="GET">GET</option>
              </select>
            </div>
            <div className="md:col-span-4">
              <label className="block text-[10.5px] font-semibold uppercase text-[#77766F] mb-1">
                HTTP Request Endpoint URL
              </label>
              <input
                type="url"
                value={n8nUrl}
                onChange={(e) => setN8nUrl(e.target.value)}
                placeholder="https://n8n.example.com/webhook/post-reel"
                className="w-full px-3 py-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[12.5px] font-mono rounded-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10.5px] font-semibold uppercase text-[#77766F] mb-1">Auth Type</label>
              <select
                value={n8nAuthType}
                onChange={(e) => setN8nAuthType(e.target.value as ConnectorAuthType)}
                className="w-full px-2.5 py-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[12.5px] rounded-sm"
              >
                <option value="bearer">Bearer</option>
                <option value="header_key">Header Key</option>
                <option value="query_token">Query Token</option>
                <option value="basic">Basic Auth</option>
                <option value="none">None</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10.5px] font-semibold uppercase text-[#77766F] mb-1">
                API Token / Key
              </label>
              <input
                type="password"
                value={n8nToken}
                onChange={(e) => setN8nToken(e.target.value)}
                placeholder="Token..."
                className="w-full px-3 py-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[12.5px] font-mono rounded-sm"
              />
            </div>
            <div className="md:col-span-2">
              <button
                type="button"
                disabled={nodeBusyId === 'n8n_http_node'}
                onClick={() => void handleSaveAndTestConnector('n8n_http_node')}
                className="w-full py-1.5 px-3 bg-[#242421] text-[#F6F3EC] text-[12px] font-semibold rounded-sm inline-flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`w-3 h-3 ${nodeBusyId === 'n8n_http_node' ? 'animate-spin' : ''}`} />
                <span>Save &amp; Test</span>
              </button>
            </div>
          </div>
        )}
      </section>

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
              <option value="Facebook Reels">Facebook Reels</option>
              <option value="TikTok">TikTok</option>
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
          workspace.publishingDrafts.map((draft) => {
            const directTargetId =
              draft.platform === 'Facebook Reels' ? 'facebook_direct' : 'instagram_direct';
            const directLabel =
              draft.platform === 'Facebook Reels'
                ? 'Post Direct to Facebook'
                : 'Post Direct to Instagram';
            return (
              <article
                key={draft.id}
                className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-5 flex flex-col lg:flex-row gap-5 justify-between"
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
                      {draft.platform} · {draft.aspectRatio} · Status: {draft.publishStatus}
                      {draft.receiptId ? ` · Receipt ${draft.receiptId}` : ''}
                    </div>
                    <h3 className="font-editorial text-[20px] text-[#242421]">{draft.videoTitle}</h3>
                    <p className="text-[13px] text-[#242421]">{draft.caption}</p>
                    <div className="text-[12px] font-mono text-[#77766F]">{draft.hashtags.join(' ')}</div>
                    <div className="text-[11.5px] text-[#77766F] flex flex-wrap items-center gap-1.5 pt-1">
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      <span>Scheduled {draft.scheduledFor.replace('T', ' ')}</span>
                      <span>·</span>
                      <span>{draft.statusNote}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col justify-end gap-2 shrink-0 min-w-[205px]">
                  <button
                    type="button"
                    onClick={() => void handleApproveDraft(draft.id)}
                    disabled={draft.approvalStatus === 'approved'}
                    className={`px-3.5 py-2 text-[12px] font-semibold rounded-sm inline-flex items-center justify-center gap-1.5 whitespace-nowrap ${
                      draft.approvalStatus === 'approved'
                        ? 'bg-[#E9ECE4] text-[#777D68] border border-[#777D68]/40'
                        : 'bg-[#777D68] text-[#FFFFFF]'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{draft.approvalStatus === 'approved' ? 'Human Approved' : 'Approve Draft'}</span>
                  </button>
                  {draft.platform !== 'TikTok' && (
                    <button
                      type="button"
                      disabled={dispatchBusyId === `${draft.id}:${directTargetId}`}
                      onClick={() => void handleDispatch(draft.id, directTargetId)}
                      className="px-3.5 py-2 bg-[#242421] text-[#F6F3EC] text-[12px] font-semibold rounded-sm inline-flex items-center justify-center gap-1.5 hover:bg-[#3A3934] whitespace-nowrap"
                    >
                      <Share2 className="w-3.5 h-3.5 text-[#B69A65]" />
                      <span>
                        {dispatchBusyId === `${draft.id}:${directTargetId}` ? 'Posting...' : directLabel}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={dispatchBusyId === `${draft.id}:n8n_http_node`}
                    onClick={() => void handleDispatch(draft.id, 'n8n_http_node')}
                    className="px-3.5 py-2 bg-[#FFFFFF] border border-[#242421] text-[#242421] text-[12px] font-semibold rounded-sm inline-flex items-center justify-center gap-1.5 hover:bg-[#EFE8D8] whitespace-nowrap"
                  >
                    <Send className="w-3.5 h-3.5 text-[#B69A65]" />
                    <span>
                      {dispatchBusyId === `${draft.id}:n8n_http_node`
                        ? 'Sending...'
                        : 'Dispatch via n8n HTTP Node'}
                    </span>
                  </button>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  Lock,
  Play,
  RefreshCw,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import type {
  ConnectorAuthType,
  ConnectorHttpMethod,
  IntegrationConnector,
  WorkspaceMode,
  WorkspaceState,
} from '../types';
import { apiRequest, formatCurrency, formatDateShort } from '../lib/api';

/* ============================================================================
 * INTEGRATIONS VIEW (Direct Social Graph API + n8n-Style HTTP Node + Workers)
 * ============================================================================ */

interface ConnectorDraft {
  endpointUrl: string;
  httpMethod: ConnectorHttpMethod;
  authType: ConnectorAuthType;
  authHeaderName: string;
  apiToken: string;
  accountId: string;
  publicMediaBaseUrl: string;
  customHeadersJson: string;
  payloadTemplateJson: string;
}

function draftFromConnector(c: IntegrationConnector): ConnectorDraft {
  return {
    endpointUrl: c.endpointUrl || '',
    httpMethod: c.httpMethod || 'POST',
    authType: c.authType || 'none',
    authHeaderName: c.authHeaderName || 'Authorization',
    apiToken: c.apiToken || '',
    accountId: c.accountId || '',
    publicMediaBaseUrl: c.publicMediaBaseUrl || '',
    customHeadersJson: c.customHeadersJson || '{}',
    payloadTemplateJson:
      c.payloadTemplateJson ||
      '{\n  "event": "twinforge.publish",\n  "platform": "{{platform}}",\n  "title": "{{title}}",\n  "video_url": "{{videoUrl}}",\n  "caption": "{{caption}}",\n  "hashtags": "{{hashtags}}"\n}',
  };
}

const TEMPLATE_TOKENS = [
  '{{videoUrl}}',
  '{{caption}}',
  '{{hashtags}}',
  '{{title}}',
  '{{platform}}',
  '{{aspectRatio}}',
];

export const IntegrationsView: React.FC<{
  workspace: WorkspaceState;
  mode: WorkspaceMode;
  onUpdateWorkspace: (w: WorkspaceState) => void;
}> = ({ workspace, mode, onUpdateWorkspace }) => {
  const [drafts, setDrafts] = useState<Record<string, ConnectorDraft>>(() =>
    Object.fromEntries(workspace.integrations.map((i) => [i.id, draftFromConnector(i)]))
  );
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setDrafts(Object.fromEntries(workspace.integrations.map((i) => [i.id, draftFromConnector(i)])));
  }, [workspace.integrations]);

  const updateDraft = (id: string, patch: Partial<ConnectorDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || ({} as ConnectorDraft)), ...patch },
    }));
  };

  const handleSave = async (conn: IntegrationConnector) => {
    const d = drafts[conn.id] || draftFromConnector(conn);
    setSavingId(conn.id);
    setNotice('');
    try {
      const updated = await apiRequest<WorkspaceState>(`/api/integrations/${conn.id}`, mode, {
        method: 'PUT',
        body: JSON.stringify({
          endpointUrl: d.endpointUrl,
          httpMethod: d.httpMethod,
          authType: d.authType,
          authHeaderName: d.authHeaderName,
          apiToken: d.apiToken,
          accountId: d.accountId,
          publicMediaBaseUrl: d.publicMediaBaseUrl,
          customHeadersJson: d.customHeadersJson,
          payloadTemplateJson: d.payloadTemplateJson,
        }),
      });
      onUpdateWorkspace(updated);
      setNotice(`Saved configuration for ${conn.name}.`);
    } finally {
      setSavingId(null);
    }
  };

  const handleTest = async (conn: IntegrationConnector) => {
    setTestingId(conn.id);
    setNotice('');
    try {
      // Save latest unsaved draft edits before testing so immediate edits are tested live
      const d = drafts[conn.id] || draftFromConnector(conn);
      await apiRequest<WorkspaceState>(`/api/integrations/${conn.id}`, mode, {
        method: 'PUT',
        body: JSON.stringify({
          endpointUrl: d.endpointUrl,
          httpMethod: d.httpMethod,
          authType: d.authType,
          authHeaderName: d.authHeaderName,
          apiToken: d.apiToken,
          accountId: d.accountId,
          publicMediaBaseUrl: d.publicMediaBaseUrl,
          customHeadersJson: d.customHeadersJson,
          payloadTemplateJson: d.payloadTemplateJson,
        }),
      });
      const updated = await apiRequest<WorkspaceState>(`/api/integrations/${conn.id}/test`, mode, {
        method: 'POST',
      });
      onUpdateWorkspace(updated);
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E4DDD0] pb-6">
        <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#B69A65] font-semibold">
          Direct Social APIs · n8n HTTP Node · Pluggable Engines
        </div>
        <h1 className="font-editorial text-[34px] text-[#242421] mt-1">Integrations</h1>
        <p className="text-[14px] text-[#77766F] mt-1">
          Connect Instagram &amp; Facebook Graph API directly with tokens, configure custom n8n-style HTTP Request
          Nodes (Method, Auth, Headers, JSON Payload), and verify external voice/avatar engines.
        </p>
      </div>

      {notice && (
        <div className="p-3 bg-[#E9ECE4] border border-[#777D68]/40 text-[#242421] text-[13px] rounded-sm">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {workspace.integrations.map((conn) => {
          const isInternal = conn.endpointUrl?.startsWith('server://') || conn.endpointUrl?.startsWith('local://');
          const d = drafts[conn.id] || draftFromConnector(conn);
          const isMetaGraph =
            conn.nodeKind === 'instagram_graph' ||
            conn.nodeKind === 'facebook_graph' ||
            conn.id === 'instagram_direct' ||
            conn.id === 'facebook_direct';
          const isHttpNode = conn.nodeKind === 'http_node' || conn.id === 'n8n_http_node';
          const tokenVisible = Boolean(showTokens[conn.id]);

          return (
            <div
              key={conn.id}
              className={`bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-5 space-y-4 ${
                isHttpNode ? 'lg:col-span-2' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-mono uppercase text-[#B69A65]">
                    {conn.category} · {conn.tier.replace('_', ' ')}
                  </div>
                  <h3 className="font-editorial text-[21px] text-[#242421] mt-0.5">{conn.name}</h3>
                </div>
                <span
                  className={`text-[11px] font-mono uppercase font-semibold whitespace-nowrap shrink-0 ${
                    conn.status === 'connected' || conn.status === 'reachable'
                      ? 'text-[#777D68]'
                      : conn.status === 'unreachable'
                        ? 'text-[#9E3B33]'
                        : 'text-[#A66E1E]'
                  }`}
                >
                  {conn.status}
                </span>
              </div>

              <p className="text-[13px] text-[#77766F] leading-relaxed">{conn.description}</p>

              <div className="text-[11.5px] font-mono text-[#242421]">{conn.capabilities.join(' · ')}</div>

              <div className="pt-3 border-t border-[#E4DDD0] space-y-3">
                {isMetaGraph ? (
                  <div className="space-y-3 bg-[#FAF8F4] border border-[#E4DDD0] p-3.5 rounded-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                          {conn.id === 'instagram_direct'
                            ? 'Instagram Business Account ID (IG_USER_ID)'
                            : 'Facebook Page ID'}
                        </label>
                        <input
                          type="text"
                          value={d.accountId}
                          onChange={(e) => updateDraft(conn.id, { accountId: e.target.value })}
                          placeholder={conn.id === 'instagram_direct' ? '17841400000000000' : '102938475610293'}
                          className="w-full px-3 py-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[12.5px] font-mono rounded-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                          Public Video URL Origin (for Reels Fetch)
                        </label>
                        <input
                          type="url"
                          value={d.publicMediaBaseUrl}
                          onChange={(e) => updateDraft(conn.id, { publicMediaBaseUrl: e.target.value })}
                          placeholder="https://your-studio-domain.example"
                          className="w-full px-3 py-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[12.5px] font-mono rounded-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                        Meta Graph API Access Token (v21.0)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type={tokenVisible ? 'text' : 'password'}
                          value={d.apiToken}
                          onChange={(e) => updateDraft(conn.id, { apiToken: e.target.value })}
                          placeholder="EAAG..."
                          className="flex-1 px-3 py-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[12.5px] font-mono rounded-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowTokens((p) => ({ ...p, [conn.id]: !p[conn.id] }))}
                          className="px-2.5 py-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[#77766F] hover:text-[#242421] rounded-sm"
                          title={tokenVisible ? 'Hide Token' : 'Show Token'}
                        >
                          {tokenVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] text-[#77766F] font-mono">
                        Endpoint: {d.endpointUrl || 'https://graph.facebook.com/v21.0'}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={savingId === conn.id}
                          onClick={() => void handleSave(conn)}
                          className="px-3 py-1.5 bg-[#242421] text-[#F6F3EC] text-[12px] font-semibold rounded-sm whitespace-nowrap shrink-0"
                        >
                          {savingId === conn.id ? 'Saving...' : 'Save Credentials'}
                        </button>
                        <button
                          type="button"
                          disabled={testingId === conn.id}
                          onClick={() => void handleTest(conn)}
                          className="px-3 py-1.5 bg-[#FFFFFF] border border-[#242421] text-[#242421] text-[12px] font-semibold rounded-sm inline-flex items-center gap-1.5 hover:bg-[#EFE8D8] whitespace-nowrap shrink-0"
                        >
                          <RefreshCw className={`w-3 h-3 ${testingId === conn.id ? 'animate-spin' : ''}`} />
                          <span>Test Graph API</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : isHttpNode ? (
                  <div className="space-y-3 bg-[#FAF8F4] border border-[#E4DDD0] p-4 rounded-sm">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                      <div className="md:col-span-2">
                        <label className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                          Method
                        </label>
                        <select
                          value={d.httpMethod}
                          onChange={(e) =>
                            updateDraft(conn.id, { httpMethod: e.target.value as ConnectorHttpMethod })
                          }
                          className="w-full px-2.5 py-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[12.5px] font-mono rounded-sm"
                        >
                          <option value="POST">POST</option>
                          <option value="PUT">PUT</option>
                          <option value="PATCH">PATCH</option>
                          <option value="GET">GET</option>
                        </select>
                      </div>
                      <div className="md:col-span-10">
                        <label className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                          HTTP Request URL (n8n Webhook / Custom Social API Endpoint)
                        </label>
                        <input
                          type="url"
                          value={d.endpointUrl}
                          onChange={(e) => updateDraft(conn.id, { endpointUrl: e.target.value })}
                          placeholder="https://n8n.yourdomain.com/webhook/instagram-publish"
                          className="w-full px-3 py-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[12.5px] font-mono rounded-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                      <div className="md:col-span-3">
                        <label className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                          Authentication
                        </label>
                        <select
                          value={d.authType}
                          onChange={(e) =>
                            updateDraft(conn.id, { authType: e.target.value as ConnectorAuthType })
                          }
                          className="w-full px-2.5 py-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[12.5px] rounded-sm"
                        >
                          <option value="none">None</option>
                          <option value="bearer">Bearer Token</option>
                          <option value="header_key">Header API Key</option>
                          <option value="query_token">Query Param Token</option>
                          <option value="basic">Basic Auth</option>
                        </select>
                      </div>
                      <div className="md:col-span-3">
                        <label className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                          Header / Query Name
                        </label>
                        <input
                          type="text"
                          value={d.authHeaderName}
                          onChange={(e) => updateDraft(conn.id, { authHeaderName: e.target.value })}
                          disabled={d.authType === 'none' || d.authType === 'bearer' || d.authType === 'basic'}
                          placeholder={d.authType === 'query_token' ? 'access_token' : 'X-API-Key'}
                          className="w-full px-3 py-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[12.5px] font-mono rounded-sm disabled:opacity-50"
                        />
                      </div>
                      <div className="md:col-span-6">
                        <label className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                          API Token / Secret Key
                        </label>
                        <div className="flex gap-2">
                          <input
                            type={tokenVisible ? 'text' : 'password'}
                            value={d.apiToken}
                            onChange={(e) => updateDraft(conn.id, { apiToken: e.target.value })}
                            disabled={d.authType === 'none'}
                            placeholder="Paste Bearer / API Key / Basic credentials..."
                            className="flex-1 px-3 py-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[12.5px] font-mono rounded-sm disabled:opacity-50"
                          />
                          <button
                            type="button"
                            onClick={() => setShowTokens((p) => ({ ...p, [conn.id]: !p[conn.id] }))}
                            className="px-2.5 py-1.5 border border-[#E4DDD0] bg-[#FFFFFF] text-[#77766F] hover:text-[#242421] rounded-sm"
                          >
                            {tokenVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
                          Custom Headers (JSON)
                        </label>
                        <textarea
                          rows={4}
                          value={d.customHeadersJson}
                          onChange={(e) => updateDraft(conn.id, { customHeadersJson: e.target.value })}
                          className="w-full px-3 py-2 border border-[#E4DDD0] bg-[#FFFFFF] text-[11.5px] font-mono rounded-sm"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#77766F]">
                            JSON Body Template (for POST/PUT/PATCH)
                          </label>
                        </div>
                        <textarea
                          rows={4}
                          value={d.payloadTemplateJson}
                          onChange={(e) => updateDraft(conn.id, { payloadTemplateJson: e.target.value })}
                          className="w-full px-3 py-2 border border-[#E4DDD0] bg-[#FFFFFF] text-[11.5px] font-mono rounded-sm"
                        />
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {TEMPLATE_TOKENS.map((tok) => (
                            <button
                              key={tok}
                              type="button"
                              onClick={() =>
                                updateDraft(conn.id, {
                                  payloadTemplateJson: `${d.payloadTemplateJson}${d.payloadTemplateJson.endsWith('\n') ? '' : '\n'}${tok}`,
                                })
                              }
                              className="text-[10px] font-mono text-[#8A5A1A] hover:underline"
                            >
                              {tok}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] text-[#77766F]">
                        Supports full template substitution during Publishing dispatch &amp; live test ping.
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={savingId === conn.id}
                          onClick={() => void handleSave(conn)}
                          className="px-3.5 py-1.5 bg-[#242421] text-[#F6F3EC] text-[12px] font-semibold rounded-sm whitespace-nowrap shrink-0"
                        >
                          {savingId === conn.id ? 'Saving...' : 'Save HTTP Node'}
                        </button>
                        <button
                          type="button"
                          disabled={testingId === conn.id}
                          onClick={() => void handleTest(conn)}
                          className="px-3.5 py-1.5 bg-[#FFFFFF] border border-[#242421] text-[#242421] text-[12px] font-semibold rounded-sm inline-flex items-center gap-1.5 hover:bg-[#EFE8D8] whitespace-nowrap shrink-0"
                        >
                          <Play className="w-3 h-3 text-[#B69A65]" />
                          <span>{testingId === conn.id ? 'Executing...' : 'Execute Test Request'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : !isInternal ? (
                  <div className="space-y-2.5">
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={d.endpointUrl}
                        onChange={(e) => updateDraft(conn.id, { endpointUrl: e.target.value })}
                        placeholder="https://worker-or-webhook.example/..."
                        className="flex-1 px-3 py-1.5 border border-[#E4DDD0] text-[12.5px] font-mono rounded-sm"
                      />
                      <button
                        type="button"
                        disabled={savingId === conn.id}
                        onClick={() => void handleSave(conn)}
                        className="px-3 py-1.5 bg-[#242421] text-[#F6F3EC] text-[12px] font-semibold rounded-sm whitespace-nowrap shrink-0"
                      >
                        Save
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type={tokenVisible ? 'text' : 'password'}
                        value={d.apiToken}
                        onChange={(e) => updateDraft(conn.id, { apiToken: e.target.value })}
                        placeholder="Optional Bearer / API Key Token..."
                        className="flex-1 px-3 py-1.5 border border-[#E4DDD0] text-[12px] font-mono rounded-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowTokens((p) => ({ ...p, [conn.id]: !p[conn.id] }))}
                        className="px-2.5 py-1.5 border border-[#E4DDD0] text-[#77766F] hover:text-[#242421] rounded-sm"
                      >
                        {tokenVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-[12px] font-mono text-[#77766F]">Server Runtime: {conn.endpointUrl}</div>
                )}

                {conn.lastTestResult && (
                  <div
                    className={`p-3 border rounded-sm text-[11.5px] font-mono space-y-1 ${
                      conn.lastTestResult.ok
                        ? 'bg-[#E9ECE4]/70 border-[#777D68]/50 text-[#242421]'
                        : 'bg-[#9E3B33]/10 border-[#9E3B33]/30 text-[#9E3B33]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 font-semibold">
                      <span>
                        {conn.lastTestResult.ok ? 'TEST PASSED' : 'TEST FAILED'}
                        {conn.lastTestResult.statusCode ? ` · HTTP ${conn.lastTestResult.statusCode}` : ''}
                      </span>
                      <span className="text-[10.5px] text-[#77766F]">
                        {formatDateShort(conn.lastTestResult.testedAt)}
                      </span>
                    </div>
                    <div>{conn.lastTestResult.message}</div>
                    {conn.lastTestResult.responsePreview && (
                      <pre className="text-[10.5px] text-[#77766F] bg-[#FFFFFF] border border-[#E4DDD0] p-2 rounded-sm overflow-x-auto max-h-24">
                        {conn.lastTestResult.responsePreview}
                      </pre>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between text-[11.5px] text-[#77766F]">
                  <span className="truncate">{conn.notes}</span>
                  {!isMetaGraph && !isHttpNode && (
                    <button
                      type="button"
                      disabled={testingId === conn.id}
                      onClick={() => void handleTest(conn)}
                      className="inline-flex items-center gap-1 font-semibold text-[#242421] hover:text-[#B69A65] shrink-0 ml-2 whitespace-nowrap"
                    >
                      <RefreshCw className={`w-3 h-3 ${testingId === conn.id ? 'animate-spin' : ''}`} />
                      <span>Verify</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ============================================================================
 * SETTINGS & PROVENANCE VIEW
 * ============================================================================ */

export const SettingsView: React.FC<{
  workspace: WorkspaceState;
  mode: WorkspaceMode;
  onUpdateWorkspace: (w: WorkspaceState) => void;
}> = ({ workspace, mode, onUpdateWorkspace }) => {
  const [settings, setSettings] = useState(workspace.settings);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [savedNotice, setSavedNotice] = useState('');

  useEffect(() => {
    setSettings(workspace.settings);
  }, [workspace.settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated = await apiRequest<WorkspaceState>('/api/settings', mode, {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
    onUpdateWorkspace(updated);
    setSavedNotice('Settings saved.');
    setTimeout(() => setSavedNotice(''), 2500);
  };

  const handleResetLive = async () => {
    const fresh = await apiRequest<WorkspaceState>('/api/settings/reset-live', 'live', {
      method: 'POST',
    });
    if (mode === 'live') onUpdateWorkspace(fresh);
    setConfirmWipe(false);
    setSavedNotice('Live workspace reset to clean zero-state.');
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E4DDD0] pb-6">
        <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#B69A65] font-semibold">
          Governance, Cost Caps &amp; Auditability
        </div>
        <h1 className="font-editorial text-[34px] text-[#242421] mt-1">Settings &amp; Provenance</h1>
        <p className="text-[14px] text-[#77766F] mt-1">
          Configure monthly budget caps, AI disclosure watermarks, data export, workspace erasure, and audit
          logs.
        </p>
      </div>

      {savedNotice && (
        <div className="p-3 bg-[#E9ECE4] border border-[#777D68]/40 text-[#242421] text-[13px] rounded-sm">
          {savedNotice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleSave}
          className="lg:col-span-6 bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-6 space-y-4"
        >
          <h2 className="font-editorial text-[22px] text-[#242421] border-b border-[#E4DDD0] pb-3">
            Cost Governance &amp; Disclosure
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase text-[#77766F] mb-1">
                Monthly Spend Cap (USD)
              </label>
              <input
                type="number"
                min={1}
                value={settings.monthlyBudgetCapUsd}
                onChange={(e) =>
                  setSettings({ ...settings, monthlyBudgetCapUsd: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-[#E4DDD0] font-mono text-[13.5px] rounded-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase text-[#77766F] mb-1">
                Default Quality Tier
              </label>
              <select
                value={settings.defaultQualityTier}
                onChange={(e) => setSettings({ ...settings, defaultQualityTier: e.target.value as any })}
                className="w-full px-3 py-2 border border-[#E4DDD0] text-[13px] rounded-sm"
              >
                <option value="local_free">Local Free Mode</option>
                <option value="balanced">Balanced Quality Mode</option>
                <option value="premium">Premium Realism Mode</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase text-[#77766F] mb-1">
              AI Disclosure Watermark Text
            </label>
            <input
              type="text"
              value={settings.watermarkText}
              onChange={(e) => setSettings({ ...settings, watermarkText: e.target.value })}
              className="w-full px-3 py-2 border border-[#E4DDD0] font-mono text-[12.5px] rounded-sm"
            />
          </div>

          <label className="flex items-start gap-2.5 text-[13px] cursor-pointer">
            <input
              type="checkbox"
              checked={settings.requireExplicitPaidApproval}
              onChange={(e) =>
                setSettings({ ...settings, requireExplicitPaidApproval: e.target.checked })
              }
              className="mt-0.5 accent-[#242421]"
            />
            <span>Require explicit pre-generation cost approval modal before paid API dispatch.</span>
          </label>

          <label className="flex items-start gap-2.5 text-[13px] cursor-pointer">
            <input
              type="checkbox"
              checked={settings.aiDisclosureDefault}
              onChange={(e) => setSettings({ ...settings, aiDisclosureDefault: e.target.checked })}
              className="mt-0.5 accent-[#242421]"
            />
            <span>Enable AI-generated likeness provenance watermark by default on studio renders.</span>
          </label>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="px-5 py-2 bg-[#242421] text-[#F6F3EC] text-[12.5px] font-semibold rounded-sm"
            >
              Save Governance Rules
            </button>
          </div>
        </form>

        {/* Data Portability & Erasure */}
        <div className="lg:col-span-6 bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-6 space-y-5">
          <h2 className="font-editorial text-[22px] text-[#242421] border-b border-[#E4DDD0] pb-3">
            Data Ownership, Export &amp; Erasure
          </h2>
          <p className="text-[13.5px] text-[#77766F] leading-relaxed">
            Your twin identity references, voice samples, scripts, and audit records live on your local studio
            server. Export a portable archive or wipe your Live Workspace cleanly anytime.
          </p>

          <div className="flex flex-wrap gap-3">
            <a
              href={`/api/settings/export?mode=${mode}`}
              className="px-4 py-2.5 bg-[#F6F3EC] border border-[#E4DDD0] text-[#242421] text-[12.5px] font-semibold rounded-sm inline-flex items-center gap-2 hover:border-[#B69A65]"
            >
              <Download className="w-4 h-4 text-[#B69A65]" />
              <span>Export Workspace JSON</span>
            </a>

            {!confirmWipe ? (
              <button
                type="button"
                onClick={() => setConfirmWipe(true)}
                className="px-4 py-2.5 border border-[#9E3B33]/40 text-[#9E3B33] text-[12.5px] font-semibold rounded-sm inline-flex items-center gap-2 hover:bg-[#9E3B33]/10"
              >
                <Trash2 className="w-4 h-4" />
                <span>Erase Live Workspace</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 p-2 bg-[#9E3B33]/10 border border-[#9E3B33]/40 rounded-sm">
                <ShieldAlert className="w-4 h-4 text-[#9E3B33]" />
                <button
                  type="button"
                  onClick={handleResetLive}
                  className="px-3 py-1 bg-[#9E3B33] text-[#FFFFFF] text-[12px] font-semibold rounded-sm"
                >
                  Confirm Permanent Wipe
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmWipe(false)}
                  className="px-2 py-1 text-[12px] text-[#242421]"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Audit Log */}
      <section className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm">
        <div className="px-6 py-4 border-b border-[#E4DDD0] flex items-center justify-between">
          <h2 className="font-editorial text-[22px] text-[#242421]">Immutable Activity &amp; Cost Audit Log</h2>
          <span className="font-mono text-[12px] text-[#77766F] tabular-nums">
            Month Total: {formatCurrency(workspace.settings.currentMonthSpendUsd)}
          </span>
        </div>
        <div className="divide-y divide-[#E4DDD0] max-h-96 overflow-y-auto">
          {workspace.auditLogs.map((log) => (
            <div
              key={log.id}
              className="px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[12.5px]"
            >
              <div>
                <span className="font-mono text-[11px] uppercase text-[#B69A65] mr-2">[{log.category}]</span>
                <span className="font-semibold text-[#242421]">{log.action}</span>
                <span className="text-[#77766F] ml-2">— {log.detail}</span>
              </div>
              <div className="font-mono text-[11.5px] text-[#77766F] tabular-nums shrink-0">
                {log.costImpactUsd !== undefined && log.costImpactUsd > 0
                  ? `${formatCurrency(log.costImpactUsd)} · `
                  : ''}
                {formatDateShort(log.timestamp)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

/* ============================================================================
 * CREATOR PROFILE & AUTHENTICATION / SESSION LOCK MODAL
 * ============================================================================ */

export const ProfileLockModal: React.FC<{
  workspace: WorkspaceState;
  mode: WorkspaceMode;
  onUpdateWorkspace: (w: WorkspaceState) => void;
  onClose: () => void;
}> = ({ workspace, mode, onUpdateWorkspace, onClose }) => {
  const [email, setEmail] = useState(workspace.settings.creatorEmail || 'Samymehra071213@gmail.com');
  const [lockEnabled, setLockEnabled] = useState(workspace.settings.sessionLockEnabled);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated = await apiRequest<WorkspaceState>('/api/settings', mode, {
      method: 'PUT',
      body: JSON.stringify({
        creatorEmail: email,
        sessionLockEnabled: lockEnabled,
      }),
    });
    onUpdateWorkspace(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#242421]/60 flex items-center justify-center p-4">
      <div className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 bg-[#F6F3EC] border-b border-[#E4DDD0] flex items-center justify-between">
          <div className="inline-flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#B69A65]" />
            <h2 className="font-editorial text-[22px] text-[#242421]">Creator Access &amp; Profile</h2>
          </div>
          <button type="button" onClick={onClose} className="text-[#77766F] hover:text-[#242421]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div className="p-3 bg-[#F6F3EC] border border-[#E4DDD0] rounded-sm text-[12.5px] text-[#77766F]">
            Single-creator local studio session. Biometric assets stay stored locally inside your server vault.
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase text-[#77766F] mb-1">
              Creator Account Identity
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-[#E4DDD0] text-[13.5px] rounded-sm"
            />
          </div>
          <label className="flex items-start gap-2.5 text-[13px] cursor-pointer">
            <input
              type="checkbox"
              checked={lockEnabled}
              onChange={(e) => setLockEnabled(e.target.checked)}
              className="mt-0.5 accent-[#242421]"
            />
            <span>Require creator session confirmation before exporting twin identity archive.</span>
          </label>
          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#E4DDD0] text-[12.5px] rounded-sm"
            >
              Close
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#242421] text-[#F6F3EC] text-[12.5px] font-semibold rounded-sm inline-flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-[#B69A65]" />
              <span>Save Profile</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

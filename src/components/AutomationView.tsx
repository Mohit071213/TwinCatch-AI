import React, { useState } from 'react';
import { Pause, Play, RefreshCw, Send } from 'lucide-react';
import type { WorkspaceMode, WorkspaceState } from '../types';
import { apiRequest, formatCurrency, formatDateShort } from '../lib/api';

interface AutomationViewProps {
  workspace: WorkspaceState;
  mode: WorkspaceMode;
  onUpdateWorkspace: (w: WorkspaceState) => void;
}

export const AutomationView: React.FC<AutomationViewProps> = ({
  workspace,
  mode,
  onUpdateWorkspace,
}) => {
  const n8nDefault = workspace.integrations.find((i) => i.id === 'n8n_webhook')?.endpointUrl || '';
  const [workflowName, setWorkflowName] = useState('TwinForge -> n8n Content Pipeline');
  const [eventType, setEventType] = useState<
    'trend.discovered' | 'script.approved' | 'render.completed' | 'publish.ready' | 'manual.test'
  >('manual.test');
  const [webhookUrl, setWebhookUrl] = useState(n8nDefault);
  const [busy, setBusy] = useState(false);

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const updated = await apiRequest<WorkspaceState>('/api/automation/dispatch', mode, {
        method: 'POST',
        body: JSON.stringify({
          workflowName,
          eventType,
          targetWebhookUrl: webhookUrl,
          payload: {
            creator: workspace.twin.personality.creatorName || 'Creator',
            readinessScore: workspace.twin.readiness.overallScore,
            mode,
          },
        }),
      });
      onUpdateWorkspace(updated);
    } finally {
      setBusy(false);
    }
  };

  const handleRetry = async (id: string) => {
    const updated = await apiRequest<WorkspaceState>(`/api/automation/retry/${id}`, mode, {
      method: 'POST',
    });
    onUpdateWorkspace(updated);
  };

  const handleToggle = async (id: string) => {
    const updated = await apiRequest<WorkspaceState>(`/api/automation/toggle/${id}`, mode, {
      method: 'POST',
    });
    onUpdateWorkspace(updated);
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E4DDD0] pb-6">
        <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#B69A65] font-semibold">
          n8n Webhook Orchestration
        </div>
        <h1 className="font-editorial text-[34px] text-[#242421] mt-1">Automation</h1>
        <p className="text-[14px] text-[#77766F] mt-1">
          Dispatch signed HMAC-SHA256 webhooks with idempotency keys, inspect execution logs, and manage retries.
        </p>
      </div>

      {/* Dispatch Builder */}
      <form
        onSubmit={handleDispatch}
        className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm p-6 grid grid-cols-1 lg:grid-cols-12 gap-4 items-end"
      >
        <div className="lg:col-span-3">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
            Workflow Name
          </label>
          <input
            type="text"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="w-full px-3 py-2 border border-[#E4DDD0] text-[13px] rounded-sm"
          />
        </div>
        <div className="lg:col-span-3">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
            Trigger Event
          </label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value as any)}
            className="w-full px-3 py-2 border border-[#E4DDD0] text-[13px] rounded-sm"
          >
            <option value="manual.test">manual.test</option>
            <option value="trend.discovered">trend.discovered</option>
            <option value="script.approved">script.approved</option>
            <option value="render.completed">render.completed</option>
            <option value="publish.ready">publish.ready</option>
          </select>
        </div>
        <div className="lg:col-span-4">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77766F] mb-1">
            Target n8n Webhook URL
          </label>
          <input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://your-n8n.example/webhook/..."
            className="w-full px-3 py-2 border border-[#E4DDD0] text-[13px] rounded-sm"
          />
        </div>
        <div className="lg:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2 px-4 bg-[#242421] text-[#F6F3EC] text-[12.5px] font-semibold rounded-sm inline-flex items-center justify-center gap-1.5 hover:bg-[#3A3934]"
          >
            <Send className="w-3.5 h-3.5 text-[#B69A65]" />
            <span>{busy ? 'Sending...' : 'Dispatch'}</span>
          </button>
        </div>
      </form>

      {/* Inbound Callback Reference */}
      <div className="p-4 bg-[#EFE8D8] border border-[#E4DDD0] rounded-sm flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
        <span>
          <strong className="font-semibold">Inbound Callback Receiver:</strong>{' '}
          <code className="font-mono text-[#242421]">POST /api/automation/webhook/callback</code>
        </span>
        <span className="font-mono text-[11.5px] text-[#77766F]">
          Signed Header: X-TwinForge-Signature · Idempotency: X-Idempotency-Key
        </span>
      </div>

      {/* Job Execution Ledger */}
      <section className="bg-[#FFFFFF] border border-[#E4DDD0] rounded-sm divide-y divide-[#E4DDD0]">
        <div className="px-6 py-4 flex items-center justify-between">
          <h2 className="font-editorial text-[22px] text-[#242421]">Job Execution Ledger</h2>
          <span className="font-mono text-[12px] text-[#77766F] tabular-nums">
            {workspace.automationJobs.length} jobs recorded
          </span>
        </div>
        {workspace.automationJobs.length === 0 ? (
          <div className="p-10 text-center text-[13.5px] text-[#77766F]">
            No automation jobs dispatched yet. Enter an n8n webhook URL above to dispatch a signed event.
          </div>
        ) : (
          workspace.automationJobs.map((job) => (
            <div key={job.id} className="p-5 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono text-[12px] font-semibold text-[#242421]">{job.id}</span>
                    <span className="font-semibold text-[14.5px] text-[#242421]">{job.workflowName}</span>
                    <span
                      className={`text-[11px] font-mono uppercase font-semibold ${
                        job.status === 'succeeded'
                          ? 'text-[#777D68]'
                          : job.status === 'failed'
                            ? 'text-[#9E3B33]'
                            : 'text-[#A66E1E]'
                      }`}
                    >
                      {job.status}
                    </span>
                  </div>
                  <div className="text-[12px] font-mono text-[#77766F] mt-1 tabular-nums">
                    {job.eventType} · {job.idempotencyKey} · Attempts {job.attempts}/{job.maxAttempts} · Cost{' '}
                    {formatCurrency(job.providerCostUsd)} · {formatDateShort(job.updatedAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRetry(job.id)}
                    className="px-3 py-1.5 border border-[#E4DDD0] text-[12px] font-semibold rounded-sm inline-flex items-center gap-1 hover:border-[#B69A65]"
                  >
                    <RefreshCw className="w-3 h-3" /> Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggle(job.id)}
                    className="px-3 py-1.5 border border-[#E4DDD0] text-[12px] font-semibold rounded-sm inline-flex items-center gap-1 hover:border-[#B69A65]"
                  >
                    {job.status === 'paused' ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                    <span>{job.status === 'paused' ? 'Resume' : 'Pause'}</span>
                  </button>
                </div>
              </div>
              <div className="bg-[#FAF8F4] border border-[#E4DDD0] p-3 rounded-sm font-mono text-[11.5px] text-[#77766F] space-y-1">
                {job.logs.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
};

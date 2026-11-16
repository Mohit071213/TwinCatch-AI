import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type express from 'express';
import type { BillingProtectionStatus } from '../src/types.ts';

const DATA_ROOT = path.resolve(process.cwd(), 'data');
const BILLING_LEDGER_PATH = path.join(DATA_ROOT, 'billing-ledger.json');
const RATE_LIMITS_PATH = path.join(DATA_ROOT, 'rate-limits.json');

interface BillingLedger {
  balances: Record<string, number>;
  processedStripeSessions: string[];
  transactions: Array<{
    id: string;
    sessionId: string;
    type: 'stripe_topup' | 'veo_charge' | 'refund';
    amountUsd: number;
    referenceId: string;
    createdAt: string;
  }>;
}

interface RateLimitStore {
  buckets: Record<string, number[]>;
}

let writeQueue: Promise<void> = Promise.resolve();
function serializeWrite<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(fn, fn);
  writeQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export function sanitizeSessionId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim();
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(cleaned)) return null;
  return cleaned;
}

export function resolveSessionId(req: express.Request): string | null {
  const fromHeader = req.headers['x-workspace-session'];
  const fromQuery = req.query.session;
  return sanitizeSessionId(typeof fromHeader === 'string' ? fromHeader : fromQuery);
}

export function isPaidVeoFlagEnabled(): boolean {
  return String(process.env.ALLOW_PAID_GEMINI_VEO || '').toLowerCase() === 'true';
}

export function isStripeConfigured(): boolean {
  const k = String(process.env.STRIPE_SECRET_KEY || '').trim();
  return k.startsWith('sk_live_') || k.startsWith('sk_test_');
}

export function isOwnerAuthorized(req?: express.Request): boolean {
  if (!req) return false;
  const expected = String(process.env.OWNER_UNLOCK_TOKEN || '').trim();
  if (expected.length < 8) return false;
  const supplied = String(req.headers['x-owner-unlock-token'] || '').trim();
  if (!supplied) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(supplied, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function getGeminiQuotaLimits(): { hourlyLimit: number; dailyLimit: number } {
  const hourly = Math.max(3, Math.min(200, Number(process.env.TESTER_GEMINI_HOURLY_LIMIT) || 18));
  const daily = Math.max(hourly, Math.min(1000, Number(process.env.TESTER_GEMINI_DAILY_LIMIT) || 45));
  return { hourlyLimit: hourly, dailyLimit: daily };
}

export function hasDeveloperPaidEnvSecrets(): boolean {
  return Boolean(
    process.env.ELEVENLABS_API_KEY ||
      process.env.ELEVENLABS_WEBHOOK_URL ||
      process.env.LIVEPORTRAIT_URL ||
      process.env.HEYGEN_API_KEY ||
      process.env.INSTAGRAM_ACCESS_TOKEN ||
      process.env.FACEBOOK_ACCESS_TOKEN
  );
}

async function readLedger(): Promise<BillingLedger> {
  try {
    const raw = await fs.readFile(BILLING_LEDGER_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      balances: parsed?.balances && typeof parsed.balances === 'object' ? parsed.balances : {},
      processedStripeSessions: Array.isArray(parsed?.processedStripeSessions) ? parsed.processedStripeSessions : [],
      transactions: Array.isArray(parsed?.transactions) ? parsed.transactions : [],
    };
  } catch {
    return { balances: {}, processedStripeSessions: [], transactions: [] };
  }
}

async function writeLedger(ledger: BillingLedger): Promise<void> {
  await fs.mkdir(DATA_ROOT, { recursive: true });
  await fs.writeFile(BILLING_LEDGER_PATH, JSON.stringify(ledger, null, 2));
}

async function readRateLimits(): Promise<RateLimitStore> {
  try {
    const raw = await fs.readFile(RATE_LIMITS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      buckets: parsed?.buckets && typeof parsed.buckets === 'object' ? parsed.buckets : {},
    };
  } catch {
    return { buckets: {} };
  }
}

async function writeRateLimits(store: RateLimitStore): Promise<void> {
  await fs.mkdir(DATA_ROOT, { recursive: true });
  await fs.writeFile(RATE_LIMITS_PATH, JSON.stringify(store, null, 2));
}

export async function getCreditBalanceUsd(sessionId: string | null): Promise<number> {
  if (!sessionId) return 0;
  const ledger = await readLedger();
  return Number((ledger.balances[sessionId] || 0).toFixed(4));
}

export async function deductTesterCredits(
  sessionId: string,
  amountUsd: number,
  referenceId: string
): Promise<{ ok: boolean; remainingUsd: number }> {
  return serializeWrite(async () => {
    const ledger = await readLedger();
    const current = Number(ledger.balances[sessionId] || 0);
    if (current + 1e-6 < amountUsd) {
      return { ok: false, remainingUsd: Number(current.toFixed(4)) };
    }
    const next = Math.max(0, Number((current - amountUsd).toFixed(4)));
    ledger.balances[sessionId] = next;
    ledger.transactions.unshift({
      id: `tx_${crypto.randomUUID().slice(0, 8)}`,
      sessionId,
      type: 'veo_charge',
      amountUsd: -Number(amountUsd.toFixed(4)),
      referenceId,
      createdAt: new Date().toISOString(),
    });
    ledger.transactions = ledger.transactions.slice(0, 500);
    await writeLedger(ledger);
    return { ok: true, remainingUsd: next };
  });
}

export async function refundTesterCredits(
  sessionId: string,
  amountUsd: number,
  referenceId: string
): Promise<number> {
  return serializeWrite(async () => {
    const ledger = await readLedger();
    const current = Number(ledger.balances[sessionId] || 0);
    const next = Number((current + amountUsd).toFixed(4));
    ledger.balances[sessionId] = next;
    ledger.transactions.unshift({
      id: `tx_${crypto.randomUUID().slice(0, 8)}`,
      sessionId,
      type: 'refund',
      amountUsd: Number(amountUsd.toFixed(4)),
      referenceId,
      createdAt: new Date().toISOString(),
    });
    ledger.transactions = ledger.transactions.slice(0, 500);
    await writeLedger(ledger);
    return next;
  });
}

export function resolveRateBucketKey(req: express.Request, sessionId: string | null): string {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = fwd || req.ip || 'local';
  return `${ip}:${sessionId || 'shared'}`;
}

export async function inspectFreeGeminiQuota(
  req: express.Request,
  sessionId: string | null
): Promise<{ hourlyRemaining: number; hourlyLimit: number; dailyRemaining: number; dailyLimit: number }> {
  const { hourlyLimit, dailyLimit } = getGeminiQuotaLimits();
  if (isOwnerAuthorized(req)) {
    return { hourlyRemaining: hourlyLimit, hourlyLimit, dailyRemaining: dailyLimit, dailyLimit };
  }
  const key = resolveRateBucketKey(req, sessionId);
  const store = await readRateLimits();
  const now = Date.now();
  const stamps = (store.buckets[key] || []).filter((ts) => now - ts < 86400_000);
  const lastHour = stamps.filter((ts) => now - ts < 3600_000).length;
  return {
    hourlyRemaining: Math.max(0, hourlyLimit - lastHour),
    hourlyLimit,
    dailyRemaining: Math.max(0, dailyLimit - stamps.length),
    dailyLimit,
  };
}

export async function consumeFreeGeminiQuota(
  req: express.Request,
  sessionId: string | null,
  weight = 1
): Promise<{ ok: boolean; error?: string }> {
  if (isOwnerAuthorized(req)) {
    return { ok: true };
  }
  return serializeWrite(async () => {
    const { hourlyLimit, dailyLimit } = getGeminiQuotaLimits();
    const key = resolveRateBucketKey(req, sessionId);
    const store = await readRateLimits();
    const now = Date.now();
    const stamps = (store.buckets[key] || []).filter((ts) => now - ts < 86400_000);
    const lastHourCount = stamps.filter((ts) => now - ts < 3600_000).length;

    if (lastHourCount + weight > hourlyLimit) {
      return {
        ok: false,
        error: `Hourly Free-Tier Gemini preview quota (${hourlyLimit}/hr) reached for this tester session. Switch to Free Natural Hindi Neural Voice ($0.00) or FFmpeg Cinema Local ($0.00) for unlimited zero-quota renders.`,
      };
    }
    if (stamps.length + weight > dailyLimit) {
      return {
        ok: false,
        error: `Daily Free-Tier Gemini preview quota (${dailyLimit}/day) reached. Free Hindi Neural Voice ($0.00) & FFmpeg Cinema ($0.00) remain unlimited.`,
      };
    }

    for (let i = 0; i < weight; i++) {
      stamps.push(now);
    }
    store.buckets[key] = stamps;
    await writeRateLimits(store);
    return { ok: true };
  });
}

export async function evaluatePaidVeoAccess(params: {
  req: express.Request;
  sessionId: string | null;
  estimatedUsd: number;
}): Promise<{
  allowed: boolean;
  billedTo: 'owner' | 'tester_credits' | 'blocked';
  reason?: string;
}> {
  const flagEnabled = isPaidVeoFlagEnabled();
  const ownerOk = isOwnerAuthorized(params.req);
  const stripeOn = isStripeConfigured();

  if (!flagEnabled) {
    return {
      allowed: false,
      billedTo: 'blocked',
      reason:
        'Developer Zero-Bill Shield is ACTIVE: Paid Gemini Omni / Veo is locked server-side (ALLOW_PAID_GEMINI_VEO != true). Zero developer charges possible. Use Free Cinema FFmpeg ($0.00), connect your own HeyGen/LivePortrait/Custom Paid API token in Integrations, or Remix in your own AI Studio account.',
    };
  }

  if (ownerOk) {
    return { allowed: true, billedTo: 'owner' };
  }

  if (!stripeOn) {
    return {
      allowed: false,
      billedTo: 'blocked',
      reason:
        'Stripe prepaid pass-through is not enabled on this server. To protect the developer from unbilled Gemini Veo charges, connect your own LivePortrait/HeyGen/Custom Paid Video API token in Integrations or Remix with your own Secrets.',
    };
  }

  if (!params.sessionId) {
    return {
      allowed: false,
      billedTo: 'blocked',
      reason: 'An isolated tester session ID is required to spend prepaid Veo credits.',
    };
  }

  const bal = await getCreditBalanceUsd(params.sessionId);
  if (bal + 1e-6 < params.estimatedUsd) {
    return {
      allowed: false,
      billedTo: 'blocked',
      reason: `Prepaid credit balance ($${bal.toFixed(2)}) is below the estimated Gemini Veo cost ($${params.estimatedUsd.toFixed(2)}). Top up credits via Stripe Checkout first so you pay your own render cost.`,
    };
  }

  return { allowed: true, billedTo: 'tester_credits' };
}

export async function getBillingProtectionStatus(params: {
  req?: express.Request;
  sessionId: string | null;
}): Promise<BillingProtectionStatus> {
  const paidFlag = isPaidVeoFlagEnabled();
  const ownerOk = isOwnerAuthorized(params.req);
  const stripeOn = isStripeConfigured();
  const creditBalance = await getCreditBalanceUsd(params.sessionId);
  const quota = params.req
    ? await inspectFreeGeminiQuota(params.req, params.sessionId)
    : {
        ...getGeminiQuotaLimits(),
        hourlyRemaining: getGeminiQuotaLimits().hourlyLimit,
        dailyRemaining: getGeminiQuotaLimits().dailyLimit,
      };

  return {
    paidVeoLocked: !paidFlag,
    stripeEnabled: stripeOn,
    sessionIsolated: Boolean(params.sessionId),
    sessionIdPreview: params.sessionId ? `${params.sessionId.slice(0, 8)}…` : 'shared-local',
    testerCreditBalanceUsd: creditBalance,
    geminiHourlyRemaining: quota.hourlyRemaining,
    geminiHourlyLimit: quota.hourlyLimit,
    geminiDailyRemaining: quota.dailyRemaining,
    geminiDailyLimit: quota.dailyLimit,
    developerEnvTokensCleared: true,
    ownerUnlockActive: ownerOk,
    freeDatabaseEngine: 'Local Free JSON Store (data/sessions/*.json — $0.00 DB cost)',
  };
}

export async function createStripeCheckoutSession(params: {
  sessionId: string;
  amountUsd: number;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ checkoutUrl: string; stripeSessionId: string }> {
  const key = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!isStripeConfigured()) {
    throw new Error('STRIPE_SECRET_KEY is not configured on the server.');
  }
  const cents = Math.round(Math.max(2, Math.min(100, params.amountUsd)) * 100);
  const body = new URLSearchParams();
  body.set('mode', 'payment');
  body.set('success_url', params.successUrl);
  body.set('cancel_url', params.cancelUrl);
  body.set('line_items[0][price_data][currency]', 'usd');
  body.set('line_items[0][price_data][product_data][name]', 'TwinForge Studio Prepaid AI Video Credits');
  body.set(
    'line_items[0][price_data][product_data][description]',
    `Prepaid credit wallet top-up for tester session ${params.sessionId.slice(0, 8)}`
  );
  body.set('line_items[0][price_data][unit_amount]', String(cents));
  body.set('line_items[0][quantity]', '1');
  body.set('metadata[twinforgeSessionId]', params.sessionId);
  body.set('metadata[creditUsd]', (cents / 100).toFixed(2));

  const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(12000),
  });
  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok || !data?.url || !data?.id) {
    throw new Error(data?.error?.message || `Stripe Checkout error (HTTP ${resp.status})`);
  }
  return { checkoutUrl: String(data.url), stripeSessionId: String(data.id) };
}

export async function verifyAndApplyStripeSession(params: {
  stripeSessionId: string;
  sessionId: string;
}): Promise<{ creditedUsd: number; balanceUsd: number; alreadyProcessed: boolean }> {
  const key = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!isStripeConfigured()) {
    throw new Error('STRIPE_SECRET_KEY is not configured on the server.');
  }
  const cleanStripeId = params.stripeSessionId.trim();
  if (!/^cs_(test|live)_[a-zA-Z0-9]+$/.test(cleanStripeId)) {
    throw new Error('Invalid Stripe Checkout session identifier.');
  }

  const resp = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(cleanStripeId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(12000),
  });
  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok || !data?.id) {
    throw new Error(data?.error?.message || `Unable to verify Stripe payment (HTTP ${resp.status}).`);
  }
  if (data.payment_status !== 'paid') {
    throw new Error(`Stripe payment is not completed yet (status: ${data.payment_status || 'unpaid'}).`);
  }
  const targetSession = String(data?.metadata?.twinforgeSessionId || '');
  if (targetSession !== params.sessionId) {
    throw new Error('Stripe Checkout session belongs to a different workspace session.');
  }
  const amountUsd = Number(((Number(data.amount_total) || 0) / 100).toFixed(2));
  if (amountUsd <= 0) {
    throw new Error('Stripe session amount is invalid.');
  }

  return serializeWrite(async () => {
    const ledger = await readLedger();
    if (ledger.processedStripeSessions.includes(cleanStripeId)) {
      return {
        creditedUsd: 0,
        balanceUsd: Number((ledger.balances[params.sessionId] || 0).toFixed(4)),
        alreadyProcessed: true,
      };
    }
    ledger.processedStripeSessions.push(cleanStripeId);
    const next = Number(((ledger.balances[params.sessionId] || 0) + amountUsd).toFixed(4));
    ledger.balances[params.sessionId] = next;
    ledger.transactions.unshift({
      id: `tx_${crypto.randomUUID().slice(0, 8)}`,
      sessionId: params.sessionId,
      type: 'stripe_topup',
      amountUsd,
      referenceId: cleanStripeId,
      createdAt: new Date().toISOString(),
    });
    ledger.transactions = ledger.transactions.slice(0, 500);
    await writeLedger(ledger);
    return { creditedUsd: amountUsd, balanceUsd: next, alreadyProcessed: false };
  });
}

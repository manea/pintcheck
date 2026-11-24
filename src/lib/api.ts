import {
  auditMasterDataCsv,
  buildCleanedMasterDataCsv,
} from '../core/batchCsv.ts';
import {
  buildExecutiveSummaryText,
  computeDossierDigestHex,
} from '../core/dossierDigest.ts';
import {
  PINTCHECK_PRESETS,
  createDossierFromPreset,
  type PintCheckPresetMeta,
} from '../core/presets.ts';
import {
  buildDefaultAspReadinessChecks,
  computeReadinessSummary,
} from '../core/readiness.ts';
import type {
  AspReadinessCheckItem,
  CurrencyCode,
  Locale,
  MasterDataCsvAudit,
  PintCheckDossier,
  PintInvoiceInput,
  RawXmlMeta,
  ReadinessCheckStatus,
  RevenueTier,
  ValidationReport,
} from '../core/types.ts';
import { generatePintAeXml, parsePintAeXml } from '../core/ublXml.ts';
import { validatePintAeInvoice } from '../core/validator.ts';
import { withBase } from './basePath.ts';

export interface PresetSummary {
  id: PintCheckPresetMeta['id'];
  nameEn: string;
  nameAr: string;
  badgeEn: string;
  badgeAr: string;
  defaultLocale: Locale;
}

export interface DossierEventRecord {
  id: number;
  dossierId: string;
  eventType: string;
  actor: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface DossierListRecord {
  id: string;
  slug: string;
  dossierNumber: string | null;
  status: 'draft' | 'locked';
  currency: CurrencyCode;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  dossier: PintCheckDossier;
}

export interface DossierStats {
  totalDossiers: number;
  draftDossiers: number;
  lockedDossiers: number;
  companyProfilesCount: number;
}

export interface DossierBundle {
  dossier: PintCheckDossier;
  viewCount: number;
  dossierEvents: DossierEventRecord[];
  publicReportUrl?: string;
  summaryAr?: string;
  summaryEn?: string;
}

export interface CompanyProfileRecord {
  id: string;
  name: string;
  profile: {
    legalName: string;
    trn: string;
    emirateCode: string;
    city: string;
    streetAddress: string;
    revenueTier: RevenueTier;
  };
  createdAt: string;
  updatedAt: string;
}

export interface UpdateDossierPayload {
  organizationName?: string;
  organizationTrn?: string;
  defaultLocale?: Locale;
  revenueTier?: RevenueTier;
  referenceDate?: string;
  invoice?: PintInvoiceInput;
  xmlText?: string;
  csvText?: string;
  readinessChecks?: Array<{ id: string; status: ReadinessCheckStatus; notes?: string }>;
  actor?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const LOCAL_STORE_KEY = 'pintcheck_local_store_v1';

interface LocalStoreState {
  seqByYear: Record<string, number>;
  dossiers: Array<{
    dossier: PintCheckDossier;
    viewCount: number;
    events: DossierEventRecord[];
  }>;
  profiles: CompanyProfileRecord[];
}

function readLocalStore(): LocalStoreState {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalStoreState>;
      if (parsed && Array.isArray(parsed.dossiers)) {
        return {
          seqByYear: parsed.seqByYear || {},
          dossiers: parsed.dossiers,
          profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
        };
      }
    }
  } catch {
    // ignore storage errors
  }
  return { seqByYear: {}, dossiers: [], profiles: [] };
}

function writeLocalStore(state: LocalStoreState) {
  try {
    window.localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

function localSlugify(text: string): string {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'dossier';
}

function buildLocalStats(state: LocalStoreState): DossierStats {
  const totalDossiers = state.dossiers.length;
  const lockedDossiers = state.dossiers.filter((e) => e.dossier.status === 'locked').length;
  return {
    totalDossiers,
    draftDossiers: totalDossiers - lockedDossiers,
    lockedDossiers,
    companyProfilesCount: state.profiles.length,
  };
}

function enrichBundle(
  dossier: PintCheckDossier,
  viewCount = 0,
  dossierEvents: DossierEventRecord[] = [],
): DossierBundle {
  return {
    dossier,
    viewCount,
    dossierEvents,
    summaryAr: buildExecutiveSummaryText(dossier, 'ar'),
    summaryEn: buildExecutiveSummaryText(dossier, 'en'),
    publicReportUrl: `${window.location.origin}${withBase(
      `/r/${encodeURIComponent(dossier.dossierNumber || dossier.slug)}`,
    )}`,
  };
}

function isStaticFallbackCandidate(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status === 404 || err.status === 405 || err.status >= 502;
  }
  return true;
}

async function requestJson<T>(urlPath: string, init?: RequestInit): Promise<T> {
  const res = await fetch(withBase(urlPath), init);
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  }
  if (!res.ok) {
    throw new ApiError(
      String(parsed.error || res.statusText || 'Request failed'),
      res.status,
      typeof parsed.code === 'string' ? parsed.code : undefined,
    );
  }
  return parsed as T;
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await requestJson<{ ok: boolean }>('/api/health');
    return Boolean(res.ok);
  } catch {
    return false;
  }
}

export async function fetchPresets(): Promise<PresetSummary[]> {
  try {
    const data = await requestJson<{ presets: PresetSummary[] }>('/api/presets');
    return data.presets;
  } catch {
    return PINTCHECK_PRESETS.map((p) => ({
      id: p.id,
      nameEn: p.nameEn,
      nameAr: p.nameAr,
      badgeEn: p.badgeEn,
      badgeAr: p.badgeAr,
      defaultLocale: p.defaultLocale,
    }));
  }
}

export async function listDossiers(): Promise<{
  dossiers: DossierListRecord[];
  stats: DossierStats;
  localOnly: boolean;
}> {
  try {
    const data = await requestJson<{ dossiers: DossierListRecord[]; stats: DossierStats }>('/api/dossiers');
    return { ...data, localOnly: false };
  } catch (err) {
    if (!isStaticFallbackCandidate(err)) throw err;
    const store = readLocalStore();
    const list: DossierListRecord[] = store.dossiers.map((entry) => ({
      id: entry.dossier.id,
      slug: entry.dossier.slug,
      dossierNumber: entry.dossier.dossierNumber ?? null,
      status: entry.dossier.status,
      currency: entry.dossier.invoice.currency,
      viewCount: entry.viewCount,
      createdAt: entry.dossier.createdAt || new Date().toISOString(),
      updatedAt: entry.dossier.updatedAt || new Date().toISOString(),
      dossier: entry.dossier,
    }));
    return { dossiers: list, stats: buildLocalStats(store), localOnly: true };
  }
}

export async function getDossierApi(idOrSlug: string): Promise<DossierBundle> {
  try {
    return await requestJson<DossierBundle>(`/api/dossiers/${encodeURIComponent(idOrSlug)}`);
  } catch (err) {
    if (!isStaticFallbackCandidate(err)) throw err;
    const store = readLocalStore();
    const entry = store.dossiers.find(
      (e) =>
        e.dossier.id === idOrSlug ||
        e.dossier.slug === idOrSlug ||
        e.dossier.dossierNumber === idOrSlug,
    );
    if (!entry) throw new ApiError('Dossier not found', 404);
    return enrichBundle(entry.dossier, entry.viewCount, entry.events);
  }
}

export async function getPublicReportApi(slugOrNumber: string): Promise<DossierBundle> {
  try {
    return await requestJson<DossierBundle>(`/api/public/reports/${encodeURIComponent(slugOrNumber)}`);
  } catch (err) {
    if (!isStaticFallbackCandidate(err)) throw err;
    const store = readLocalStore();
    const entry = store.dossiers.find(
      (e) => e.dossier.slug === slugOrNumber || e.dossier.dossierNumber === slugOrNumber,
    );
    if (!entry) throw new ApiError('Readiness report not found', 404);
    entry.viewCount += 1;
    writeLocalStore(store);
    return enrichBundle(entry.dossier, entry.viewCount, entry.events);
  }
}

export async function createDossierFromPresetApi(
  presetId: PintCheckPresetMeta['id'],
): Promise<DossierBundle> {
  const refDate = new Date().toISOString().slice(0, 10);
  try {
    return await requestJson<DossierBundle>('/api/dossiers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presetId, referenceDate: refDate }),
    });
  } catch (err) {
    if (!isStaticFallbackCandidate(err)) throw err;
    const dossier = createDossierFromPreset(presetId, refDate);
    const now = new Date().toISOString();
    dossier.createdAt = now;
    dossier.updatedAt = now;
    const store = readLocalStore();
    const events: DossierEventRecord[] = [
      {
        id: Date.now(),
        dossierId: dossier.id,
        eventType: 'DOSSIER_CREATED',
        actor: 'local-browser',
        meta: { presetId, xmlPassScore: dossier.validation.passScore },
        createdAt: now,
      },
    ];
    store.dossiers.unshift({ dossier, viewCount: 0, events });
    writeLocalStore(store);
    return enrichBundle(dossier, 0, events);
  }
}

export async function createDossierFromXmlApi(payload: {
  xmlText: string;
  organizationName?: string;
  defaultLocale?: Locale;
  revenueTier?: RevenueTier;
}): Promise<DossierBundle> {
  const refDate = new Date().toISOString().slice(0, 10);
  try {
    return await requestJson<DossierBundle>('/api/dossiers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, referenceDate: refDate }),
    });
  } catch (err) {
    if (!isStaticFallbackCandidate(err)) throw err;
    const parsed = parsePintAeXml(payload.xmlText);
    const validation = validatePintAeInvoice(parsed.invoice, parsed.rawXmlMeta);
    const checks: AspReadinessCheckItem[] = buildDefaultAspReadinessChecks();
    const tier: RevenueTier = payload.revenueTier === 'large_over_50m' ? 'large_over_50m' : 'sme_under_50m';
    const readinessSummary = computeReadinessSummary(validation, checks, tier, refDate);
    const now = new Date().toISOString();
    const id = `pin-${Date.now().toString(36)}`;
    const dossier: PintCheckDossier = {
      id,
      slug: `${localSlugify(parsed.invoice.invoiceNumber || 'xml')}-${id.slice(-4)}`,
      status: 'draft',
      defaultLocale: payload.defaultLocale || 'ar',
      organizationName:
        payload.organizationName?.trim() || parsed.invoice.seller.legalName || 'UAE Business LLC',
      organizationTrn: parsed.invoice.seller.trn || '',
      revenueTier: tier,
      referenceDate: refDate,
      invoice: parsed.invoice,
      rawXmlSource: payload.xmlText,
      rawXmlMeta: parsed.rawXmlMeta,
      validation,
      readinessChecks: checks,
      readinessSummary,
      batchAudit: null,
      createdAt: now,
      updatedAt: now,
    };
    const store = readLocalStore();
    const events: DossierEventRecord[] = [
      {
        id: Date.now(),
        dossierId: id,
        eventType: 'DOSSIER_CREATED',
        actor: 'local-browser',
        meta: { xmlPassScore: validation.passScore },
        createdAt: now,
      },
    ];
    store.dossiers.unshift({ dossier, viewCount: 0, events });
    writeLocalStore(store);
    return enrichBundle(dossier, 0, events);
  }
}

export async function updateDossierApi(
  id: string,
  patch: UpdateDossierPayload,
): Promise<DossierBundle> {
  try {
    return await requestJson<DossierBundle>(`/api/dossiers/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch (err) {
    if (!isStaticFallbackCandidate(err)) throw err;
    const store = readLocalStore();
    const entry = store.dossiers.find((e) => e.dossier.id === id);
    if (!entry) throw new ApiError('Dossier not found', 404);
    if (entry.dossier.status === 'locked') {
      throw new ApiError('Finalized dossier is sealed against edits', 409, 'DOSSIER_LOCKED');
    }

    const current = entry.dossier;
    let nextInvoice = patch.invoice ?? current.invoice;
    let nextRawXmlMeta = current.rawXmlMeta;
    let nextRawXmlSource = current.rawXmlSource;

    if (typeof patch.xmlText === 'string' && patch.xmlText.trim()) {
      const parsed = parsePintAeXml(patch.xmlText);
      nextInvoice = parsed.invoice;
      nextRawXmlMeta = parsed.rawXmlMeta;
      nextRawXmlSource = patch.xmlText;
    } else if (patch.invoice) {
      nextRawXmlMeta = undefined;
    }

    const nextValidation = validatePintAeInvoice(nextInvoice, nextRawXmlMeta);
    if (!(typeof patch.xmlText === 'string' && patch.xmlText.trim())) {
      nextRawXmlSource = generatePintAeXml(nextInvoice, nextValidation.calculation);
    }

    const nextChecks = patch.readinessChecks
      ? buildDefaultAspReadinessChecks(patch.readinessChecks)
      : current.readinessChecks;
    const nextTier = patch.revenueTier ?? current.revenueTier;
    const nextRefDate = patch.referenceDate ?? current.referenceDate;
    const nextSummary = computeReadinessSummary(nextValidation, nextChecks, nextTier, nextRefDate);
    const nextBatchAudit =
      typeof patch.csvText === 'string'
        ? patch.csvText.trim()
          ? auditMasterDataCsv(patch.csvText)
          : null
        : current.batchAudit ?? null;

    const now = new Date().toISOString();
    const updated: PintCheckDossier = {
      ...current,
      defaultLocale: patch.defaultLocale ?? current.defaultLocale,
      organizationName: patch.organizationName?.trim() || nextInvoice.seller.legalName || current.organizationName,
      organizationTrn: patch.organizationTrn?.trim() || nextInvoice.seller.trn || current.organizationTrn,
      revenueTier: nextTier,
      referenceDate: nextRefDate,
      invoice: nextInvoice,
      rawXmlSource: nextRawXmlSource,
      ...(nextRawXmlMeta ? { rawXmlMeta: nextRawXmlMeta } : { rawXmlMeta: undefined }),
      validation: nextValidation,
      readinessChecks: nextChecks,
      readinessSummary: nextSummary,
      batchAudit: nextBatchAudit,
      updatedAt: now,
    };

    entry.dossier = updated;
    entry.events.unshift({
      id: Date.now(),
      dossierId: updated.id,
      eventType: 'DOSSIER_UPDATED',
      actor: patch.actor || 'local-browser',
      meta: { xmlPassScore: nextValidation.passScore },
      createdAt: now,
    });
    writeLocalStore(store);
    return enrichBundle(updated, entry.viewCount, entry.events);
  }
}

export async function finalizeDossierApi(id: string): Promise<DossierBundle> {
  try {
    return await requestJson<DossierBundle>(`/api/dossiers/${encodeURIComponent(id)}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'finance' }),
    });
  } catch (err) {
    if (!isStaticFallbackCandidate(err)) throw err;
    const store = readLocalStore();
    const entry = store.dossiers.find((e) => e.dossier.id === id);
    if (!entry) throw new ApiError('Dossier not found', 404);
    if (entry.dossier.status === 'locked') {
      throw new ApiError('Already finalized', 409, 'ALREADY_LOCKED');
    }

    const year = new Date().getUTCFullYear();
    const nextSeq = (store.seqByYear[String(year)] ?? 0) + 1;
    store.seqByYear[String(year)] = nextSeq;
    const dossierNumber = `PINT-${year}-${String(nextSeq).padStart(4, '0')}`;
    const now = new Date().toISOString();

    const locked: PintCheckDossier = {
      ...entry.dossier,
      status: 'locked',
      dossierNumber,
      finalizedAt: now,
      updatedAt: now,
    };
    locked.scopeDigestHex = await computeDossierDigestHex(locked);
    entry.dossier = locked;
    entry.events.unshift({
      id: Date.now(),
      dossierId: locked.id,
      eventType: 'DOSSIER_FINALIZED',
      actor: 'local-browser',
      meta: { dossierNumber, scopeDigestHex: locked.scopeDigestHex },
      createdAt: now,
    });
    writeLocalStore(store);
    return enrichBundle(locked, entry.viewCount, entry.events);
  }
}

export async function duplicateDossierApi(id: string): Promise<DossierBundle> {
  try {
    return await requestJson<DossierBundle>(`/api/dossiers/${encodeURIComponent(id)}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'finance' }),
    });
  } catch (err) {
    if (!isStaticFallbackCandidate(err)) throw err;
    const store = readLocalStore();
    const src = store.dossiers.find((e) => e.dossier.id === id);
    if (!src) throw new ApiError('Dossier not found', 404);
    const now = new Date().toISOString();
    const copyId = `pin-${Date.now().toString(36)}`;
    const cloned: PintCheckDossier = {
      ...structuredClone(src.dossier),
      id: copyId,
      slug: `${src.dossier.slug}-copy-${copyId.slice(-4)}`,
      status: 'draft',
      dossierNumber: null,
      scopeDigestHex: undefined,
      finalizedAt: undefined,
      createdAt: now,
      updatedAt: now,
    };
    const events: DossierEventRecord[] = [
      {
        id: Date.now(),
        dossierId: copyId,
        eventType: 'DOSSIER_DUPLICATED',
        actor: 'local-browser',
        meta: { sourceId: id },
        createdAt: now,
      },
    ];
    store.dossiers.unshift({ dossier: cloned, viewCount: 0, events });
    writeLocalStore(store);
    return enrichBundle(cloned, 0, events);
  }
}

export async function deleteDossierApi(id: string): Promise<void> {
  try {
    await requestJson<{ deleted: boolean }>(`/api/dossiers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch (err) {
    if (!isStaticFallbackCandidate(err)) throw err;
    const store = readLocalStore();
    store.dossiers = store.dossiers.filter((e) => e.dossier.id !== id);
    writeLocalStore(store);
  }
}

export async function validateRawXmlApi(xmlText: string): Promise<{
  invoice: PintInvoiceInput;
  rawXmlMeta: RawXmlMeta;
  validation: ValidationReport;
}> {
  try {
    return await requestJson('/api/validate-xml', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xml: xmlText }),
    });
  } catch (err) {
    if (!isStaticFallbackCandidate(err)) throw err;
    const { invoice, rawXmlMeta } = parsePintAeXml(xmlText);
    const validation = validatePintAeInvoice(invoice, rawXmlMeta);
    return { invoice, rawXmlMeta, validation };
  }
}

export async function auditBatchCsvApi(csvText: string): Promise<MasterDataCsvAudit> {
  try {
    const res = await requestJson<{ audit: MasterDataCsvAudit }>('/api/batch-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csvText }),
    });
    return res.audit;
  } catch (err) {
    if (!isStaticFallbackCandidate(err)) throw err;
    return auditMasterDataCsv(csvText);
  }
}

export async function listProfilesApi(): Promise<CompanyProfileRecord[]> {
  try {
    const res = await requestJson<{ profiles: CompanyProfileRecord[] }>('/api/profiles');
    return res.profiles;
  } catch (err) {
    if (!isStaticFallbackCandidate(err)) throw err;
    return readLocalStore().profiles;
  }
}

export async function createProfileApi(input: {
  legalName: string;
  trn: string;
  emirateCode: string;
  city: string;
  streetAddress: string;
  revenueTier: RevenueTier;
}): Promise<CompanyProfileRecord> {
  try {
    const res = await requestJson<{ profile: CompanyProfileRecord }>('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return res.profile;
  } catch (err) {
    if (!isStaticFallbackCandidate(err)) throw err;
    const store = readLocalStore();
    const now = new Date().toISOString();
    const created: CompanyProfileRecord = {
      id: `ent-${Date.now().toString(36)}`,
      name: input.legalName.trim() || 'UAE Entity LLC',
      profile: { ...input },
      createdAt: now,
      updatedAt: now,
    };
    store.profiles.unshift(created);
    writeLocalStore(store);
    return created;
  }
}

export async function deleteProfileApi(id: string): Promise<void> {
  try {
    await requestJson(`/api/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch (err) {
    if (!isStaticFallbackCandidate(err)) throw err;
    const store = readLocalStore();
    store.profiles = store.profiles.filter((p) => p.id !== id);
    writeLocalStore(store);
  }
}

export function triggerTextDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildIssuesCsvClient(dossier: PintCheckDossier, locale: Locale): string {
  if (dossier.batchAudit && dossier.batchAudit.rows.length > 0) {
    return buildCleanedMasterDataCsv(dossier.batchAudit, locale);
  }
  const sanitize = (v: unknown) => {
    const s = String(v ?? '');
    const t = s.trimStart();
    const safe = ['=', '+', '-', '@', '\t', '\r'].some((ch) => t.startsWith(ch)) ? `'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const headers =
    locale === 'ar'
      ? ['رقم الملف', 'المنشأة', 'الرقم الضريبي', 'رقم الفاتورة', 'القاعدة', 'الخطورة', 'الحقل', 'الوصف', 'الإجراء']
      : ['Dossier', 'Organization', 'Seller TRN', 'Invoice #', 'Rule ID', 'Severity', 'Field', 'Title', 'Fix Hint'];
  const rows =
    dossier.validation.issues.length > 0
      ? dossier.validation.issues.map((iss) => [
          dossier.dossierNumber || dossier.slug,
          dossier.organizationName,
          dossier.invoice.seller.trn,
          dossier.invoice.invoiceNumber,
          iss.ruleId,
          iss.severity.toUpperCase(),
          iss.field,
          locale === 'ar' ? iss.titleAr : iss.titleEn,
          locale === 'ar' ? iss.fixHintAr : iss.fixHintEn,
        ])
      : [
          [
            dossier.dossierNumber || dossier.slug,
            dossier.organizationName,
            dossier.invoice.seller.trn,
            dossier.invoice.invoiceNumber,
            'NONE',
            'PASS',
            'all',
            locale === 'ar' ? 'نجاح كامل 100/100' : '100/100 Passed',
            '-',
          ],
        ];
  return (
    '\uFEFF' +
    [headers.map(sanitize).join(','), ...rows.map((r) => r.map(sanitize).join(','))].join('\r\n') +
    '\r\n'
  );
}

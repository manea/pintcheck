import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  FileCode2,
  FileSpreadsheet,
  Lock,
  Plus,
  Printer,
  Share2,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import type {
  AeVatCategoryCode,
  CurrencyCode,
  Locale,
  PintCheckDossier,
  PintDocTypeCode,
  PintInvoiceInput,
  PintInvoiceLine,
  RawXmlMeta,
  RevenueTier,
  ValidationReport,
} from '../core/types.ts';
import {
  AE_VAT_CATEGORIES,
  PINT_AE_ENDPOINT_SCHEME,
  PINT_DOC_TYPES,
  UAE_EMIRATES,
  getTimelineMilestones,
  normalizeEmirateCode,
  validateUaeTrn,
} from '../core/uaeRules.ts';
import { generatePintAeXml } from '../core/ublXml.ts';
import { validatePintAeInvoice } from '../core/validator.ts';
import {
  validateRawXmlApi,
  type CompanyProfileRecord,
  type UpdateDossierPayload,
} from '../lib/api.ts';
import { formatMoney, type UiCopy } from '../lib/i18n.ts';

interface Props {
  dossier: PintCheckDossier;
  locale: Locale;
  copy: UiCopy;
  busy: boolean;
  profiles: CompanyProfileRecord[];
  onUpdateDossier: (patch: UpdateDossierPayload) => Promise<void>;
  onFinalize: () => Promise<void>;
  onDuplicate: () => Promise<void>;
  onDelete: () => Promise<void>;
  onDownloadXml: () => void;
  onDownloadCsv: () => void;
  onCopyPublicLink: () => void;
  onPrintReport: () => void;
}

const DEFAULT_FX_RATES: Record<CurrencyCode, number> = {
  AED: 1,
  USD: 3.6725,
  SAR: 0.9793,
  EUR: 3.98,
  GBP: 4.65,
};

function makeUuidFallback(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pin-${Date.now().toString(16)}-4000-8000-000000000001`;
}

export function InvoiceValidationStudio({
  dossier,
  locale,
  copy,
  busy,
  profiles,
  onUpdateDossier,
  onFinalize,
  onDuplicate,
  onDelete,
  onDownloadXml,
  onDownloadCsv,
  onCopyPublicLink,
  onPrintReport,
}: Props) {
  const isLocked = dossier.status === 'locked';
  const [draftInvoice, setDraftInvoice] = useState<PintInvoiceInput>(() =>
    structuredClone(dossier.invoice),
  );
  const [orgName, setOrgName] = useState<string>(dossier.organizationName);
  const [revenueTier, setRevenueTier] = useState<RevenueTier>(dossier.revenueTier);
  const [dirty, setDirty] = useState(false);

  // Raw XML Inspector Panel
  const [showXmlImport, setShowXmlImport] = useState(false);
  const [rawXmlText, setRawXmlText] = useState(dossier.rawXmlSource || '');
  const [rawInspectError, setRawInspectError] = useState<string | null>(null);
  const [rawInspectResult, setRawInspectResult] = useState<{
    invoice: PintInvoiceInput;
    rawXmlMeta: RawXmlMeta;
    validation: ValidationReport;
  } | null>(null);
  const [copiedXml, setCopiedXml] = useState(false);

  useEffect(() => {
    setDraftInvoice(structuredClone(dossier.invoice));
    setOrgName(dossier.organizationName);
    setRevenueTier(dossier.revenueTier);
    setRawXmlText(dossier.rawXmlSource || '');
    setRawInspectResult(null);
    setRawInspectError(null);
    setDirty(false);
  }, [dossier.id, dossier.updatedAt, dossier.status]);

  const liveValidation = useMemo(() => {
    if (!dirty) return dossier.validation;
    return validatePintAeInvoice(draftInvoice);
  }, [dirty, dossier.validation, draftInvoice]);

  const liveXml = useMemo(() => {
    if (!dirty && dossier.rawXmlSource) return dossier.rawXmlSource;
    return generatePintAeXml(draftInvoice, liveValidation.calculation);
  }, [dirty, dossier.rawXmlSource, draftInvoice, liveValidation.calculation]);

  const milestones = useMemo(
    () => getTimelineMilestones(revenueTier, dossier.referenceDate),
    [revenueTier, dossier.referenceDate],
  );

  const canAutoFix = useMemo(() => {
    if (isLocked) return false;
    return liveValidation.issues.some((iss) =>
      [
        'AE-EMIRATE-SELLER',
        'AE-EMIRATE-BUYER',
        'AE-PEPPOL-SELLER',
        'AE-PEPPOL-SELLER-MISMATCH',
        'AE-PEPPOL-BUYER',
        'AE-PEPPOL-BUYER-MISMATCH',
        'AE-FX-AED',
        'AE-TAX-RATE',
        'AE-HDR-UUID',
      ].includes(iss.ruleId),
    );
  }, [isLocked, liveValidation.issues]);

  const updatePartyField = (
    role: 'seller' | 'buyer',
    field: 'legalName' | 'trn' | 'peppolSchemeId' | 'peppolEndpointId' | 'emirateCode' | 'city' | 'streetAddress',
    value: string,
  ) => {
    if (isLocked) return;
    setDirty(true);
    setDraftInvoice((prev) => {
      const nextParty = { ...prev[role], [field]: value };
      if (field === 'trn') {
        const check = validateUaeTrn(value);
        if (check.derivedTin && (!prev[role].peppolEndpointId || prev[role].peppolEndpointId === validateUaeTrn(prev[role].trn).derivedTin)) {
          nextParty.peppolSchemeId = PINT_AE_ENDPOINT_SCHEME;
          nextParty.peppolEndpointId = check.derivedTin;
        }
      }
      return { ...prev, [role]: nextParty };
    });
  };

  const updateLineField = <K extends keyof PintInvoiceLine>(
    idx: number,
    field: K,
    value: PintInvoiceLine[K],
  ) => {
    if (isLocked) return;
    setDirty(true);
    setDraftInvoice((prev) => {
      const lines = prev.lines.map((line, i) => {
        if (i !== idx) return line;
        const nextLine = { ...line, [field]: value };
        if (field === 'vatCategory') {
          const expected = AE_VAT_CATEGORIES[value as AeVatCategoryCode]?.expectedRatePct;
          if (expected !== null && expected !== undefined) {
            nextLine.vatRatePct = expected;
          }
        }
        return nextLine;
      });
      return { ...prev, lines };
    });
  };

  const addLineItem = () => {
    if (isLocked) return;
    setDirty(true);
    setDraftInvoice((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        {
          id: String(prev.lines.length + 1),
          description: locale === 'ar' ? 'خدمة استشارية خاضعة للضريبة' : 'VAT Taxable Consulting Service',
          quantity: 1,
          unitCode: 'EA',
          unitPrice: 1000,
          vatCategory: 'S',
          vatRatePct: 5,
        },
      ],
    }));
  };

  const removeLineItem = (idx: number) => {
    if (isLocked || draftInvoice.lines.length <= 1) return;
    setDirty(true);
    setDraftInvoice((prev) => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== idx),
    }));
  };

  const handleSave = async () => {
    if (isLocked) return;
    await onUpdateDossier({
      organizationName: orgName.trim() || draftInvoice.seller.legalName,
      organizationTrn: draftInvoice.seller.trn,
      revenueTier,
      invoice: draftInvoice,
    });
    setDirty(false);
  };

  const handleAutoFix = async () => {
    if (isLocked) return;
    const fixed = structuredClone(draftInvoice);

    for (const role of ['seller', 'buyer'] as const) {
      const party = fixed[role];
      const trnRes = validateUaeTrn(party.trn);
      if (trnRes.normalized) party.trn = trnRes.normalized;
      if (trnRes.valid) {
        party.peppolSchemeId = PINT_AE_ENDPOINT_SCHEME;
        party.peppolEndpointId = trnRes.derivedTin;
      }
      const emNorm = normalizeEmirateCode(party.emirateCode);
      if (!emNorm.validIsoCode && emNorm.suggestedCode) {
        party.emirateCode = emNorm.suggestedCode;
      }
    }

    if (fixed.currency !== 'AED' && (!fixed.fxRateToAed || fixed.fxRateToAed <= 0)) {
      fixed.fxRateToAed = DEFAULT_FX_RATES[fixed.currency] || 3.6725;
    }

    if (!fixed.uuid || fixed.uuid.trim().length < 8) {
      fixed.uuid = makeUuidFallback();
    }

    fixed.lines = fixed.lines.map((line) => {
      const meta = AE_VAT_CATEGORIES[line.vatCategory];
      const next = { ...line };
      if (meta && meta.expectedRatePct !== null) {
        next.vatRatePct = meta.expectedRatePct;
      }
      if (meta?.requiresExemptionReason && !next.exemptionReasonText?.trim()) {
        next.exemptionReasonText = 'Article 46 UAE VAT Decree-Law No. 8 of 2017';
      }
      return next;
    });

    setDraftInvoice(fixed);
    setDirty(false);
    await onUpdateDossier({
      organizationName: orgName.trim() || fixed.seller.legalName,
      organizationTrn: fixed.seller.trn,
      revenueTier,
      invoice: fixed,
    });
  };

  const handleDryRunXml = async () => {
    setRawInspectError(null);
    setRawInspectResult(null);
    try {
      const res = await validateRawXmlApi(rawXmlText);
      setRawInspectResult(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'XML validation failed';
      setRawInspectError(msg);
    }
  };

  const handleApplyRawXml = async () => {
    if (isLocked) return;
    setRawInspectError(null);
    try {
      await onUpdateDossier({ xmlText: rawXmlText });
      setDirty(false);
      setShowXmlImport(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'XML parse error';
      setRawInspectError(msg);
    }
  };

  const handleXmlFileUpload = async (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setRawXmlText(text);
    setShowXmlImport(true);
    setRawInspectError(null);
    setRawInspectResult(null);
    ev.target.value = '';
  };

  const applyProfileToSeller = (profileId: string) => {
    if (isLocked) return;
    const found = profiles.find((p) => p.id === profileId);
    if (!found) return;
    const trnCheck = validateUaeTrn(found.profile.trn);
    setDirty(true);
    setOrgName(found.profile.legalName || found.name);
    setRevenueTier(found.profile.revenueTier || 'sme_under_50m');
    setDraftInvoice((prev) => ({
      ...prev,
      seller: {
        ...prev.seller,
        legalName: found.profile.legalName || found.name,
        trn: found.profile.trn || prev.seller.trn,
        peppolSchemeId: PINT_AE_ENDPOINT_SCHEME,
        peppolEndpointId: trnCheck.derivedTin || prev.seller.peppolEndpointId,
        emirateCode: found.profile.emirateCode || prev.seller.emirateCode,
        city: found.profile.city || prev.seller.city,
        streetAddress: found.profile.streetAddress || prev.seller.streetAddress,
      },
    }));
  };

  const scoreTone =
    liveValidation.passScore >= 90
      ? 'text-[var(--accent-emerald)] bg-[var(--accent-emerald-soft)] border-[var(--accent-emerald)]/30'
      : liveValidation.passScore >= 60
        ? 'text-[var(--accent-amber)] bg-[var(--accent-amber-soft)] border-[var(--accent-amber)]/30'
        : 'text-[var(--accent-crimson)] bg-[var(--accent-crimson-soft)] border-[var(--accent-crimson)]/30';

  const calc = liveValidation.calculation;

  return (
    <div className="space-y-5">
      {/* Top Executive Dossier Header & Actions */}
      <section className="pc-card rounded-2xl p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  isLocked
                    ? 'bg-[var(--accent-emerald-soft)] text-[var(--accent-emerald)]'
                    : 'bg-[var(--accent-amber-soft)] text-[var(--accent-amber)]'
                }`}
              >
                {isLocked ? <Lock className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                {isLocked ? copy.lockedBadge : copy.draftBadge}
              </span>
              {dossier.dossierNumber && (
                <span className="pc-mono rounded-full border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1 text-xs font-bold" dir="ltr">
                  {dossier.dossierNumber}
                </span>
              )}
              <span className="pc-mono rounded-full bg-[var(--bg-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent-teal)]" dir="ltr">
                {PINT_DOC_TYPES[draftInvoice.docTypeCode]?.code} · {draftInvoice.currency}
              </span>
            </div>

            <h2 className="pc-display text-xl font-bold text-[var(--text-primary)] sm:text-2xl">
              {orgName || draftInvoice.seller.legalName}
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              <span className="pc-mono font-semibold" dir="ltr">
                {draftInvoice.invoiceNumber}
              </span>{' '}
              · <span dir="ltr" className="pc-mono">{draftInvoice.seller.trn || 'NO-TRN'}</span>{' '}
              ← <span dir="ltr" className="pc-mono">{draftInvoice.buyer.legalName}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 no-print">
            <button
              type="button"
              data-testid="toggle-xml-import-btn"
              onClick={() => setShowXmlImport((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
            >
              <Upload className="h-3.5 w-3.5 text-[var(--accent-teal)]" />
              {copy.importXmlBtn}
            </button>

            <button
              type="button"
              data-testid="export-xml-btn"
              onClick={onDownloadXml}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
            >
              <Download className="h-3.5 w-3.5 text-[var(--accent-teal)]" />
              {copy.exportXmlBtn}
            </button>

            <button
              type="button"
              data-testid="export-csv-btn"
              onClick={onDownloadCsv}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-[var(--accent-teal)]" />
              {copy.exportIssuesCsvBtn}
            </button>

            <button
              type="button"
              data-testid="copy-public-link-btn"
              onClick={onCopyPublicLink}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
            >
              <Share2 className="h-3.5 w-3.5 text-[var(--accent-teal)]" />
              {copy.copyPublicLinkBtn}
            </button>

            <button
              type="button"
              data-testid="print-report-btn"
              onClick={onPrintReport}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
            >
              <Printer className="h-3.5 w-3.5 text-[var(--accent-teal)]" />
              {copy.printPdfBtn}
            </button>

            {!isLocked ? (
              <button
                type="button"
                data-testid="finalize-dossier-btn"
                disabled={busy}
                onClick={onFinalize}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-teal)] px-3.5 py-2 text-xs font-bold text-[var(--accent-teal-fg)] hover:bg-[var(--accent-teal-hover)] disabled:opacity-50"
              >
                <Lock className="h-3.5 w-3.5" />
                {copy.finalizeBtn}
              </button>
            ) : (
              <button
                type="button"
                data-testid="duplicate-dossier-btn"
                disabled={busy}
                onClick={onDuplicate}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-teal)] px-3.5 py-2 text-xs font-bold text-[var(--accent-teal-fg)] hover:bg-[var(--accent-teal-hover)] disabled:opacity-50"
              >
                <Copy className="h-3.5 w-3.5" />
                {copy.duplicateBtn}
              </button>
            )}
          </div>
        </div>

        {isLocked && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--accent-emerald)]/30 bg-[var(--accent-emerald-soft)] px-4 py-2.5 text-xs font-medium text-[var(--accent-emerald)]">
            <span>{copy.finalizedNote}</span>
            {dossier.scopeDigestHex && (
              <span className="pc-mono text-[11px]" dir="ltr">
                SHA-256: {dossier.scopeDigestHex.slice(0, 18)}…
              </span>
            )}
          </div>
        )}

        {/* 4 Score & Timeline KPI Tiles */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className={`rounded-xl border p-3.5 ${scoreTone}`} data-testid="studio-score-badge">
            <div className="text-xs font-medium opacity-90">{copy.scoreLabel}</div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="pc-display num-tabular text-2xl font-extrabold whitespace-nowrap" dir="ltr">
                {liveValidation.passScore}/100
              </span>
              <span className="text-xs font-semibold whitespace-nowrap">
                {locale === 'ar'
                  ? `${liveValidation.errorsCount} خطأ · ${liveValidation.warningsCount} تنبيه`
                  : `${liveValidation.errorsCount}E · ${liveValidation.warningsCount}W`}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3.5">
            <div className="text-xs font-medium text-[var(--text-secondary)]">
              {copy.readinessLabel}
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="pc-display num-tabular text-2xl font-extrabold text-[var(--text-primary)]" dir="ltr">
                {dossier.readinessSummary.compositeScore}/100
              </span>
              <span className="text-xs text-[var(--text-secondary)]" dir="ltr">
                {dossier.readinessSummary.passedChecksCount}/{dossier.readinessSummary.totalChecksCount}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
              <CalendarClock className="h-3.5 w-3.5 text-[var(--accent-teal)]" />
              {copy.aspDeadlineLabel}
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="pc-mono num-tabular text-base font-bold text-[var(--text-primary)]" dir="ltr">
                {milestones.aspAppointmentDeadline}
              </span>
              <span className="text-xs font-semibold text-[var(--accent-teal)]">
                <span className="num-tabular" dir="ltr">{milestones.daysUntilAspAppointment}</span> {copy.daysRemaining}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3.5">
            <div className="text-xs font-medium text-[var(--text-secondary)]">
              {locale === 'ar' ? 'الإجمالي المستحق (مكافئ AED)' : 'Payable Total (AED Equiv.)'}
            </div>
            <div className="mt-1 flex flex-col">
              <span className="pc-display num-tabular text-lg font-extrabold text-[var(--text-primary)]" dir="ltr">
                {formatMoney(calc.payableAmount, calc.currency, locale)}
              </span>
              {calc.currency !== 'AED' && (
                <span className="pc-mono num-tabular text-xs text-[var(--text-secondary)]" dir="ltr">
                  ≈ {formatMoney(calc.payableAmountAed, 'AED', locale)}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Optional Raw XML Paste & Inspect Drawer */}
      {showXmlImport && (
        <section className="pc-card rounded-2xl border-[var(--accent-teal)]/40 p-5 no-print">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <FileCode2 className="h-4 w-4 text-[var(--accent-teal)]" />
              {copy.pasteXmlTitle}
            </h3>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--bg-soft)]">
              <Upload className="h-3.5 w-3.5" />
              {locale === 'ar' ? 'اختيار ملف .xml' : 'Upload .xml file'}
              <input type="file" accept=".xml,application/xml,text/xml" className="hidden" onChange={handleXmlFileUpload} />
            </label>
          </div>

          <textarea
            dir="ltr"
            rows={7}
            data-testid="raw-xml-textarea"
            value={rawXmlText}
            onChange={(e) => setRawXmlText(e.target.value)}
            className="pc-input pc-mono mt-3 text-xs leading-relaxed"
            placeholder="<Invoice xmlns=&quot;urn:oasis:names:specification:ubl:schema:xsd:Invoice-2&quot;>...</Invoice>"
          />

          {rawInspectError && (
            <div
              data-testid="dry-run-error"
              className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--accent-crimson)]/40 bg-[var(--accent-crimson-soft)] p-3 text-xs font-semibold text-[var(--accent-crimson)]"
            >
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>{rawInspectError}</span>
            </div>
          )}

          {rawInspectResult && (
            <div className="mt-3 rounded-xl border border-[var(--accent-teal)]/30 bg-[var(--bg-elevated)] p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 font-bold">
                <span>
                  {locale === 'ar' ? 'نتيجة الفحص الفوري للـ XML:' : 'Raw XML Dry-Run Validation:'}{' '}
                  <span dir="ltr">{rawInspectResult.validation.passScore}/100</span>
                </span>
                <span dir="ltr" className="pc-mono">
                  {rawInspectResult.rawXmlMeta.rootElement} · {rawInspectResult.validation.errorsCount}E / {rawInspectResult.validation.warningsCount}W
                </span>
              </div>
              {rawInspectResult.validation.issues.length > 0 && (
                <ul className="mt-2 list-inside list-disc space-y-1 text-[var(--text-secondary)]">
                  {rawInspectResult.validation.issues.slice(0, 5).map((iss) => (
                    <li key={iss.ruleId}>
                      <span className="pc-mono font-semibold" dir="ltr">[{iss.ruleId}]</span>{' '}
                      {locale === 'ar' ? iss.titleAr : iss.titleEn}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="dry-run-xml-btn"
              onClick={handleDryRunXml}
              className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-semibold hover:bg-[var(--bg-elevated)]"
            >
              {copy.validateRawXmlBtn}
            </button>
            {!isLocked && (
              <button
                type="button"
                data-testid="apply-raw-xml-btn"
                disabled={busy}
                onClick={handleApplyRawXml}
                className="rounded-xl bg-[var(--accent-teal)] px-3.5 py-2 text-xs font-bold text-[var(--accent-teal-fg)] hover:bg-[var(--accent-teal-hover)] disabled:opacity-50"
              >
                {copy.applyXmlToDossierBtn}
              </button>
            )}
          </div>
        </section>
      )}

      {/* Diagnostics Banner + One-Click Auto-Fix */}
      <section className="pc-card rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">{copy.issuesTitle}</h3>
            <p className="text-xs text-[var(--text-secondary)]">
              {locale === 'ar'
                ? `تم فحص ${liveValidation.rulesChecked} قاعدة من مواصفة PINT-AE وبيانات الأطراف والضريبة.`
                : `Evaluated ${liveValidation.rulesChecked} deterministic PINT-AE schema, TRN, Peppol, and VAT rules.`}
            </p>
          </div>
          {canAutoFix && (
            <button
              type="button"
              data-testid="auto-fix-btn"
              disabled={busy}
              onClick={handleAutoFix}
              className="no-print inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-amber)] px-3.5 py-2 text-xs font-bold text-[var(--accent-amber-fg)] hover:opacity-90 disabled:opacity-50"
            >
              <Wand2 className="h-3.5 w-3.5" />
              {copy.quickFixAllBtn}
            </button>
          )}
        </div>

        {liveValidation.issues.length === 0 ? (
          <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-[var(--accent-emerald)]/30 bg-[var(--accent-emerald-soft)] p-3.5 text-sm font-semibold text-[var(--accent-emerald)]">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span>{copy.issuesEmpty}</span>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {liveValidation.issues.map((issue) => (
              <div
                key={`${issue.ruleId}-${issue.field}`}
                className={`rounded-xl border p-3.5 text-xs ${
                  issue.severity === 'error'
                    ? 'border-[var(--accent-crimson)]/35 bg-[var(--accent-crimson-soft)]'
                    : 'border-[var(--accent-amber)]/35 bg-[var(--accent-amber-soft)]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="pc-mono font-bold text-[var(--text-primary)]" dir="ltr">
                    {issue.ruleId}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      issue.severity === 'error'
                        ? 'bg-[var(--accent-crimson)] text-white'
                        : 'bg-[var(--accent-amber)] text-white'
                    }`}
                  >
                    {issue.severity}
                  </span>
                </div>
                <div className="mt-1.5 font-bold text-[var(--text-primary)]">
                  {locale === 'ar' ? issue.titleAr : issue.titleEn}
                </div>
                <div className="mt-1 text-[var(--text-secondary)]">
                  {locale === 'ar' ? issue.detailAr : issue.detailEn}
                </div>
                <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-[var(--bg-surface)]/80 px-2.5 py-1.5 font-medium text-[var(--text-primary)]">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent-teal)]" />
                  <span>{locale === 'ar' ? issue.fixHintAr : issue.fixHintEn}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Main Split Grid: Form Editor (left/right) + Live XML Preview */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Editable Invoice & Party Forms */}
        <div className="space-y-5 xl:col-span-7">
          {/* Header & Currency */}
          <section className="pc-card rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                {copy.docHeaderSection}
              </h3>
              {!isLocked && (
                <button
                  type="button"
                  disabled={busy || !dirty}
                  onClick={handleSave}
                  className="no-print rounded-xl bg-[var(--accent-teal)] px-3.5 py-1.5 text-xs font-bold text-[var(--accent-teal-fg)] hover:bg-[var(--accent-teal-hover)] disabled:opacity-45"
                >
                  {busy ? copy.savingLabel : copy.saveChangesBtn}
                </button>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                  {locale === 'ar' ? 'اسم المنشأة المالكة' : 'Organization Name'}
                </label>
                <input
                  disabled={isLocked}
                  value={orgName}
                  onChange={(e) => {
                    setDirty(true);
                    setOrgName(e.target.value);
                  }}
                  className="pc-input"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                  {locale === 'ar' ? 'رقم الفاتورة / المستند' : 'Invoice / Doc #'}
                </label>
                <input
                  dir="ltr"
                  disabled={isLocked}
                  value={draftInvoice.invoiceNumber}
                  onChange={(e) => {
                    setDirty(true);
                    setDraftInvoice((p) => ({ ...p, invoiceNumber: e.target.value }));
                  }}
                  className="pc-input pc-mono"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                  {locale === 'ar' ? 'نوع المستند UNCL1001' : 'Document Type'}
                </label>
                <select
                  disabled={isLocked}
                  value={draftInvoice.docTypeCode}
                  onChange={(e) => {
                    setDirty(true);
                    setDraftInvoice((p) => ({
                      ...p,
                      docTypeCode: e.target.value as PintDocTypeCode,
                    }));
                  }}
                  className="pc-input"
                >
                  {Object.values(PINT_DOC_TYPES).map((dt) => (
                    <option key={dt.code} value={dt.code}>
                      {locale === 'ar' ? dt.labelAr : dt.labelEn}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                  {locale === 'ar' ? 'تاريخ الإصدار' : 'Issue Date'}
                </label>
                <input
                  type="date"
                  dir="ltr"
                  disabled={isLocked}
                  value={draftInvoice.issueDate}
                  onChange={(e) => {
                    setDirty(true);
                    setDraftInvoice((p) => ({ ...p, issueDate: e.target.value }));
                  }}
                  className="pc-input pc-mono"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                  {locale === 'ar' ? 'العملة' : 'Currency'}
                </label>
                <select
                  dir="ltr"
                  disabled={isLocked}
                  value={draftInvoice.currency}
                  onChange={(e) => {
                    const nextCurr = e.target.value as CurrencyCode;
                    setDirty(true);
                    setDraftInvoice((p) => ({
                      ...p,
                      currency: nextCurr,
                      fxRateToAed: nextCurr === 'AED' ? 1 : p.fxRateToAed || DEFAULT_FX_RATES[nextCurr],
                    }));
                  }}
                  className="pc-input pc-mono"
                >
                  <option value="AED">AED — UAE Dirham</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="GBP">GBP — British Pound</option>
                  <option value="SAR">SAR — Saudi Riyal</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                  {locale === 'ar' ? 'سعر الصرف إلى AED' : 'FX Rate to AED'}
                </label>
                <input
                  type="number"
                  step="0.0001"
                  dir="ltr"
                  disabled={isLocked || draftInvoice.currency === 'AED'}
                  value={draftInvoice.currency === 'AED' ? 1 : draftInvoice.fxRateToAed ?? ''}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setDirty(true);
                    setDraftInvoice((p) => ({
                      ...p,
                      fxRateToAed: Number.isFinite(n) && n > 0 ? n : undefined,
                    }));
                  }}
                  className="pc-input pc-mono"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                  {copy.revenueTierLabel}
                </label>
                <select
                  disabled={isLocked}
                  value={revenueTier}
                  onChange={(e) => {
                    setDirty(true);
                    setRevenueTier(e.target.value as RevenueTier);
                  }}
                  className="pc-input"
                >
                  <option value="sme_under_50m">{copy.tierSme}</option>
                  <option value="large_over_50m">{copy.tierLarge}</option>
                </select>
              </div>

              {draftInvoice.docTypeCode === '381' && (
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                    {locale === 'ar' ? 'رقم الفاتورة الأصلية (مرجع الدائن)' : 'Preceding Tax Invoice Reference'}
                  </label>
                  <input
                    dir="ltr"
                    disabled={isLocked}
                    value={draftInvoice.precedingInvoiceReference ?? ''}
                    onChange={(e) => {
                      setDirty(true);
                      setDraftInvoice((p) => ({ ...p, precedingInvoiceReference: e.target.value }));
                    }}
                    className="pc-input pc-mono"
                    placeholder="INV-2026-0118"
                  />
                </div>
              )}
            </div>
          </section>

          {/* Seller & Buyer Cards */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {/* Seller */}
            <section className="pc-card rounded-2xl p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[var(--text-primary)]">{copy.sellerSection}</h3>
                {!isLocked && profiles.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) applyProfileToSeller(e.target.value);
                      e.target.value = '';
                    }}
                    className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2 py-1 text-xs"
                  >
                    <option value="">
                      {locale === 'ar' ? 'تعبئة من ملف منشأة...' : 'Load company profile...'}
                    </option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="mt-3 space-y-2.5 text-xs">
                <div>
                  <label className="mb-1 block font-semibold text-[var(--text-secondary)]">
                    {locale === 'ar' ? 'الاسم القانوني' : 'Legal Name'}
                  </label>
                  <input
                    disabled={isLocked}
                    value={draftInvoice.seller.legalName}
                    onChange={(e) => updatePartyField('seller', 'legalName', e.target.value)}
                    className="pc-input"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-[var(--text-secondary)]">
                    {locale === 'ar' ? 'الرقم الضريبي UAE TRN (15 رقماً)' : 'UAE TRN (15 digits)'}
                  </label>
                  <input
                    dir="ltr"
                    disabled={isLocked}
                    value={draftInvoice.seller.trn}
                    onChange={(e) => updatePartyField('seller', 'trn', e.target.value)}
                    className="pc-input pc-mono"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-1 block font-semibold text-[var(--text-secondary)]">Scheme</label>
                    <input
                      dir="ltr"
                      disabled={isLocked}
                      value={draftInvoice.seller.peppolSchemeId}
                      onChange={(e) => updatePartyField('seller', 'peppolSchemeId', e.target.value)}
                      className="pc-input pc-mono"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block font-semibold text-[var(--text-secondary)]">
                      Peppol Endpoint (10-digit TIN)
                    </label>
                    <input
                      dir="ltr"
                      disabled={isLocked}
                      value={draftInvoice.seller.peppolEndpointId}
                      onChange={(e) => updatePartyField('seller', 'peppolEndpointId', e.target.value)}
                      className="pc-input pc-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-[var(--text-secondary)]">
                    {locale === 'ar' ? 'رمز الإمارة ISO 3166-2:AE' : 'Emirate (ISO 3166-2:AE)'}
                  </label>
                  <select
                    disabled={isLocked}
                    value={draftInvoice.seller.emirateCode}
                    onChange={(e) => updatePartyField('seller', 'emirateCode', e.target.value)}
                    className="pc-input"
                  >
                    {!UAE_EMIRATES.some((em) => em.code === draftInvoice.seller.emirateCode) && (
                      <option value={draftInvoice.seller.emirateCode}>
                        ⚠ {draftInvoice.seller.emirateCode} ({locale === 'ar' ? 'نص حر غير صالح' : 'Invalid free-text'})
                      </option>
                    )}
                    {UAE_EMIRATES.map((em) => (
                      <option key={em.code} value={em.code}>
                        {em.code} — {locale === 'ar' ? em.nameAr : em.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* Buyer */}
            <section className="pc-card rounded-2xl p-5">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">{copy.buyerSection}</h3>

              <div className="mt-3 space-y-2.5 text-xs">
                <div>
                  <label className="mb-1 block font-semibold text-[var(--text-secondary)]">
                    {locale === 'ar' ? 'الاسم القانوني للعميل' : 'Buyer Legal Name'}
                  </label>
                  <input
                    disabled={isLocked}
                    value={draftInvoice.buyer.legalName}
                    onChange={(e) => updatePartyField('buyer', 'legalName', e.target.value)}
                    className="pc-input"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-[var(--text-secondary)]">
                    {locale === 'ar' ? 'الرقم الضريبي للعميل UAE TRN' : 'Buyer TRN (15 digits)'}
                  </label>
                  <input
                    dir="ltr"
                    disabled={isLocked}
                    value={draftInvoice.buyer.trn}
                    onChange={(e) => updatePartyField('buyer', 'trn', e.target.value)}
                    className="pc-input pc-mono"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-1 block font-semibold text-[var(--text-secondary)]">Scheme</label>
                    <input
                      dir="ltr"
                      disabled={isLocked}
                      value={draftInvoice.buyer.peppolSchemeId}
                      onChange={(e) => updatePartyField('buyer', 'peppolSchemeId', e.target.value)}
                      className="pc-input pc-mono"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block font-semibold text-[var(--text-secondary)]">
                      Peppol Endpoint (10-digit TIN)
                    </label>
                    <input
                      dir="ltr"
                      disabled={isLocked}
                      value={draftInvoice.buyer.peppolEndpointId}
                      onChange={(e) => updatePartyField('buyer', 'peppolEndpointId', e.target.value)}
                      className="pc-input pc-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-[var(--text-secondary)]">
                    {locale === 'ar' ? 'رمز الإمارة ISO 3166-2:AE' : 'Buyer Emirate Code'}
                  </label>
                  <select
                    disabled={isLocked}
                    value={draftInvoice.buyer.emirateCode}
                    onChange={(e) => updatePartyField('buyer', 'emirateCode', e.target.value)}
                    className="pc-input"
                  >
                    {!UAE_EMIRATES.some((em) => em.code === draftInvoice.buyer.emirateCode) && (
                      <option value={draftInvoice.buyer.emirateCode}>
                        ⚠ {draftInvoice.buyer.emirateCode} ({locale === 'ar' ? 'نص حر غير صالح' : 'Invalid free-text'})
                      </option>
                    )}
                    {UAE_EMIRATES.map((em) => (
                      <option key={em.code} value={em.code}>
                        {em.code} — {locale === 'ar' ? em.nameAr : em.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>
          </div>

          {/* Line Items Editor */}
          <section className="pc-card rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">{copy.linesSection}</h3>
              {!isLocked && (
                <button
                  type="button"
                  onClick={addLineItem}
                  className="no-print inline-flex items-center gap-1 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--bg-soft)]"
                >
                  <Plus className="h-3.5 w-3.5 text-[var(--accent-teal)]" />
                  {copy.addLineBtn}
                </button>
              )}
            </div>

            <div className="mt-4 space-y-3">
              {draftInvoice.lines.map((line, idx) => (
                <div
                  key={`${line.id}-${idx}`}
                  className="grid grid-cols-1 gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:grid-cols-12"
                >
                  <div className="sm:col-span-5">
                    <label className="mb-1 block text-[11px] font-semibold text-[var(--text-secondary)]">
                      {locale === 'ar' ? 'الوصف' : 'Description'}
                    </label>
                    <input
                      disabled={isLocked}
                      value={line.description}
                      onChange={(e) => updateLineField(idx, 'description', e.target.value)}
                      className="pc-input text-xs"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-[11px] font-semibold text-[var(--text-secondary)]">
                      {locale === 'ar' ? 'الكمية' : 'Qty'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      dir="ltr"
                      disabled={isLocked}
                      value={line.quantity}
                      onChange={(e) => updateLineField(idx, 'quantity', Number(e.target.value) || 0)}
                      className="pc-input pc-mono text-xs"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-[11px] font-semibold text-[var(--text-secondary)]">
                      {locale === 'ar' ? 'سعر الوحدة' : 'Price'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      dir="ltr"
                      disabled={isLocked}
                      value={line.unitPrice}
                      onChange={(e) => updateLineField(idx, 'unitPrice', Number(e.target.value) || 0)}
                      className="pc-input pc-mono text-xs"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-[11px] font-semibold text-[var(--text-secondary)]">
                      {locale === 'ar' ? 'فئة VAT' : 'VAT Cat'}
                    </label>
                    <select
                      dir="ltr"
                      disabled={isLocked}
                      value={line.vatCategory}
                      onChange={(e) =>
                        updateLineField(idx, 'vatCategory', e.target.value as AeVatCategoryCode)
                      }
                      className="pc-input pc-mono text-xs"
                    >
                      {Object.values(AE_VAT_CATEGORIES).map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} ({c.expectedRatePct ?? 0}%)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end justify-end sm:col-span-1">
                    {!isLocked && draftInvoice.lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLineItem(idx)}
                        className="rounded-lg p-2 text-[var(--accent-crimson)] hover:bg-[var(--accent-crimson-soft)]"
                        title={locale === 'ar' ? 'حذف البند' : 'Remove line'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {!isLocked && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3 no-print">
                <button
                  type="button"
                  disabled={busy}
                  onClick={onDelete}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-[var(--accent-crimson)] hover:bg-[var(--accent-crimson-soft)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {copy.deleteBtn}
                </button>

                <button
                  type="button"
                  disabled={busy || !dirty}
                  onClick={handleSave}
                  className="rounded-xl bg-[var(--accent-teal)] px-4 py-2 text-xs font-bold text-[var(--accent-teal-fg)] hover:bg-[var(--accent-teal-hover)] disabled:opacity-45"
                >
                  {busy ? copy.savingLabel : copy.saveChangesBtn}
                </button>
              </div>
            )}
          </section>
        </div>

        {/* Live Peppol UBL 2.1 XML Output Column */}
        <aside className="space-y-4 xl:col-span-5">
          <section className="pc-card rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <Code2 className="h-4 w-4 text-[var(--accent-teal)]" />
                {copy.xmlPreviewTitle}
              </h3>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(liveXml);
                    setCopiedXml(true);
                    window.setTimeout(() => setCopiedXml(false), 1800);
                  } catch {
                    // ignore clipboard refusal
                  }
                }}
                className="no-print inline-flex items-center gap-1 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-semibold hover:bg-[var(--bg-soft)]"
              >
                <Copy className="h-3.5 w-3.5" />
                {copiedXml ? copy.copiedToast : copy.copyXmlBtn}
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-xs">
              <div>
                <div className="text-[11px] text-[var(--text-secondary)]">
                  {locale === 'ar' ? 'الصافي قبل الضريبة' : 'Taxable Subtotal'}
                </div>
                <div className="pc-mono num-tabular font-bold" dir="ltr">
                  {formatMoney(calc.lineExtensionTotal, calc.currency, locale)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[var(--text-secondary)]">
                  {locale === 'ar' ? 'ضريبة القيمة المضافة VAT' : 'Total VAT'}
                </div>
                <div className="pc-mono num-tabular font-bold" dir="ltr">
                  {formatMoney(calc.totalVat, calc.currency, locale)}
                </div>
              </div>
            </div>

            <pre
              dir="ltr"
              className="pc-mono mt-3 max-h-[540px] overflow-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-code)] p-3.5 text-[11px] leading-relaxed text-[var(--text-primary)]"
            >
              {liveXml}
            </pre>
          </section>
        </aside>
      </div>
    </div>
  );
}

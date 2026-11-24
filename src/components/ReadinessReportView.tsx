import { useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Copy,
  FileCheck2,
  Lock,
  Printer,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import {
  buildExecutiveSummaryText,
  verifyDossierIntegrity,
} from '../core/dossierDigest.ts';
import type {
  AspReadinessCheckItem,
  Locale,
  PintCheckDossier,
  ReadinessCheckStatus,
} from '../core/types.ts';
import type { DossierEventRecord, UpdateDossierPayload } from '../lib/api.ts';
import { formatMoney, formatShortDate, type UiCopy } from '../lib/i18n.ts';

interface Props {
  dossier: PintCheckDossier;
  events: DossierEventRecord[];
  locale: Locale;
  copy: UiCopy;
  busy?: boolean;
  readOnly?: boolean;
  onUpdateChecks?: (patch: UpdateDossierPayload) => Promise<void>;
  onPrintReport?: () => void;
}

const CATEGORY_LABELS: Record<
  AspReadinessCheckItem['category'],
  { ar: string; en: string }
> = {
  master_data: { ar: 'بيانات العملاء والأرقام الضريبية TRN', en: 'Master Data & TRN Hygiene' },
  erp_xml: { ar: 'توليد PINT-AE UBL 2.1 XML', en: 'ERP & UBL 2.1 XML Generation' },
  asp_selection: { ar: 'اختيار والتعاقد مع مزود ASP', en: 'MoF ASP Selection & Appointment' },
  testing: { ar: 'الاختبارات والتشغيل التجريبي Sandbox', en: '5-Corner Sandbox & SOP Testing' },
};

export function ReadinessReportView({
  dossier,
  events,
  locale,
  copy,
  busy = false,
  readOnly = false,
  onUpdateChecks,
  onPrintReport,
}: Props) {
  const isLocked = readOnly || dossier.status === 'locked';
  const [verifyState, setVerifyState] = useState<{
    checked: boolean;
    valid: boolean;
    computedHex: string;
  } | null>(null);
  const [copiedBrief, setCopiedBrief] = useState(false);

  const summaryText = buildExecutiveSummaryText(dossier, locale);
  const { readinessSummary, validation } = dossier;
  const { milestones } = readinessSummary;

  const handleStatusChange = async (checkId: string, status: ReadinessCheckStatus) => {
    if (isLocked || !onUpdateChecks) return;
    const nextOverrides = dossier.readinessChecks.map((c) => ({
      id: c.id,
      status: c.id === checkId ? status : c.status,
      ...(c.notes ? { notes: c.notes } : {}),
    }));
    await onUpdateChecks({ readinessChecks: nextOverrides });
  };

  const handleVerifySha = async () => {
    const res = await verifyDossierIntegrity(dossier);
    setVerifyState({ checked: true, valid: res.valid, computedHex: res.computedHex });
  };

  const groupedCategories: AspReadinessCheckItem['category'][] = [
    'master_data',
    'erp_xml',
    'asp_selection',
    'testing',
  ];

  return (
    <div className="space-y-5" data-testid="readiness-report-view">
      {/* Executive Printable A4 Brief Header */}
      <section className="pc-card print-avoid-break rounded-2xl p-6">
        <div className="flex flex-col gap-4 border-b border-[var(--border-subtle)] pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-soft)] px-3 py-1 text-xs font-bold text-[var(--accent-teal)]">
                <FileCheck2 className="h-3.5 w-3.5" />
                UAE PINT-AE Pre-Flight Brief
              </span>
              {dossier.dossierNumber ? (
                <span className="pc-mono rounded-full border border-[var(--accent-emerald)]/40 bg-[var(--accent-emerald-soft)] px-3 py-1 text-xs font-bold text-[var(--accent-emerald)]" dir="ltr">
                  <Lock className="me-1 inline h-3 w-3" />
                  {dossier.dossierNumber}
                </span>
              ) : (
                <span className="rounded-full bg-[var(--accent-amber-soft)] px-3 py-1 text-xs font-bold text-[var(--accent-amber)]">
                  {copy.draftBadge}
                </span>
              )}
            </div>
            <h2 className="pc-display mt-2 text-2xl font-extrabold text-[var(--text-primary)]">
              {dossier.organizationName}
            </h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              TRN: <span className="pc-mono font-semibold" dir="ltr">{dossier.organizationTrn || '—'}</span>
              {' · '}
              {locale === 'ar' ? 'مرجع الفاتورة:' : 'Audited Invoice:'}{' '}
              <span className="pc-mono font-semibold" dir="ltr">{dossier.invoice.invoiceNumber}</span>
              {' · '}
              {formatShortDate(dossier.referenceDate, locale)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 no-print">
            {onPrintReport && (
              <button
                type="button"
                onClick={onPrintReport}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-teal)] px-3.5 py-2 text-xs font-bold text-[var(--accent-teal-fg)] hover:bg-[var(--accent-teal-hover)]"
              >
                <Printer className="h-3.5 w-3.5" />
                {copy.printPdfBtn}
              </button>
            )}
          </div>
        </div>

        {/* Scores Row */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3.5">
            <div className="text-xs text-[var(--text-secondary)]">{copy.readinessLabel}</div>
            <div className="num-tabular mt-1 text-2xl font-extrabold text-[var(--accent-teal)]" dir="ltr">
              {readinessSummary.compositeScore}/100
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3.5">
            <div className="text-xs text-[var(--text-secondary)]">{copy.scoreLabel}</div>
            <div className="num-tabular mt-1 text-2xl font-extrabold" dir="ltr">
              {validation.passScore}/100
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3.5">
            <div className="text-xs text-[var(--text-secondary)]">{copy.aspDeadlineLabel}</div>
            <div className="pc-mono num-tabular mt-1 text-base font-bold" dir="ltr">
              {milestones.aspAppointmentDeadline}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3.5">
            <div className="text-xs text-[var(--text-secondary)]">{copy.goLiveDeadlineLabel}</div>
            <div className="pc-mono num-tabular mt-1 text-base font-bold" dir="ltr">
              {milestones.mandatoryGoLiveDate}
            </div>
          </div>
        </div>

        {/* Mandatory Regulatory Disclaimer */}
        <div className="mt-4 rounded-xl border border-[var(--accent-amber)]/40 bg-[var(--accent-amber-soft)] px-4 py-3 text-xs font-semibold text-[var(--text-primary)]">
          {copy.disclaimerBanner}
        </div>
      </section>

      {/* 12-Control MoF ASP Readiness Checklist */}
      <section className="pc-card rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <ClipboardCheck className="h-4 w-4 text-[var(--accent-teal)]" />
            {copy.checklistTitle}
          </h3>
          <span className="pc-mono num-tabular text-xs font-bold text-[var(--accent-teal)]" dir="ltr">
            {readinessSummary.passedChecksCount}/{readinessSummary.totalChecksCount} PASS · {readinessSummary.checklistScore}%
          </span>
        </div>

        <div className="mt-4 space-y-5">
          {groupedCategories.map((cat) => {
            const items = dossier.readinessChecks.filter((c) => c.category === cat);
            if (items.length === 0) return null;
            return (
              <div key={cat} className="print-avoid-break space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--accent-teal)]">
                  {locale === 'ar' ? CATEGORY_LABELS[cat].ar : CATEGORY_LABELS[cat].en}
                </h4>
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  {items.map((chk) => (
                    <div
                      key={chk.id}
                      className="flex flex-col justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3.5"
                    >
                      <div>
                        <div className="text-xs font-bold text-[var(--text-primary)]">
                          {locale === 'ar' ? chk.titleAr : chk.titleEn}
                        </div>
                        <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                          {locale === 'ar' ? chk.guidanceAr : chk.guidanceEn}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <span className="pc-mono text-[10px] text-[var(--text-secondary)]" dir="ltr">
                          wt {chk.weight}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {(['pass', 'in_progress', 'fail', 'not_started'] as const).map((st) => {
                            const active = chk.status === st;
                            const labelMap: Record<ReadinessCheckStatus, string> = {
                              pass: locale === 'ar' ? 'مكتمل' : 'Pass',
                              in_progress: locale === 'ar' ? 'جارٍ' : 'WIP',
                              fail: locale === 'ar' ? 'فجوة' : 'Gap',
                              not_started: locale === 'ar' ? 'لم يبدأ' : 'Open',
                            };
                            const colorCls = !active
                              ? 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                              : st === 'pass'
                                ? 'border-[var(--accent-emerald)] bg-[var(--accent-emerald)] text-white'
                                : st === 'in_progress'
                                  ? 'border-[var(--accent-amber)] bg-[var(--accent-amber)] text-white'
                                  : st === 'fail'
                                    ? 'border-[var(--accent-crimson)] bg-[var(--accent-crimson)] text-white'
                                    : 'border-[var(--border-strong)] bg-[var(--text-primary)] text-[var(--bg-canvas)]';
                            return (
                              <button
                                key={st}
                                type="button"
                                data-testid={`checklist-${chk.id}-${st}`}
                                disabled={isLocked || busy}
                                onClick={() => handleStatusChange(chk.id, st)}
                                className={`rounded-lg border px-2 py-0.5 text-[11px] font-semibold transition ${colorCls} disabled:cursor-default`}
                              >
                                {labelMap[st]}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Executive Summary Text + Monetary + SHA-256 Verification */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <section className="pc-card print-avoid-break rounded-2xl p-5 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">{copy.summaryTitle}</h3>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(summaryText);
                  setCopiedBrief(true);
                  window.setTimeout(() => setCopiedBrief(false), 1800);
                } catch {
                  // ignore clipboard restrictions
                }
              }}
              className="no-print inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--bg-soft)]"
            >
              <Copy className="h-3.5 w-3.5" />
              {copiedBrief ? copy.copiedToast : copy.copySummaryBtn}
            </button>
          </div>
          <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 text-xs leading-relaxed text-[var(--text-primary)]">
            {summaryText}
          </pre>
        </section>

        <section className="pc-card print-avoid-break space-y-4 rounded-2xl p-5 lg:col-span-5">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <ShieldCheck className="h-4 w-4 text-[var(--accent-teal)]" />
              {copy.shaIntegrityTitle}
            </h3>
            <div className="mt-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-xs">
              {dossier.scopeDigestHex ? (
                <>
                  <div
                    data-testid="dossier-scope-digest"
                    className="pc-mono break-all text-[11px] font-semibold"
                    dir="ltr"
                  >
                    {dossier.scopeDigestHex}
                  </div>
                  <button
                    type="button"
                    data-testid="verify-sha-btn"
                    onClick={handleVerifySha}
                    className="no-print mt-2.5 rounded-lg bg-[var(--accent-teal)] px-3 py-1.5 text-xs font-bold text-[var(--accent-teal-fg)] hover:bg-[var(--accent-teal-hover)]"
                  >
                    {copy.verifyIntegrityBtn}
                  </button>
                  {verifyState?.checked && (
                    <div
                      data-testid="sha-verify-result"
                      className={`mt-2 flex items-center gap-1.5 font-bold ${
                        verifyState.valid ? 'text-[var(--accent-emerald)]' : 'text-[var(--accent-crimson)]'
                      }`}
                    >
                      {verifyState.valid ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                      ) : (
                        <ShieldAlert className="h-4 w-4 shrink-0" />
                      )}
                      <span>{verifyState.valid ? copy.shaMatchLabel : copy.shaMismatchLabel}</span>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[var(--text-secondary)]">
                  {locale === 'ar'
                    ? 'يتم توليد بصمة SHA-256 غير القابلة للتعديل عند اعتماد وختم الملف برقم PINT-YYYY.'
                    : 'An immutable SHA-256 cryptographic seal is assigned when this dossier is finalized as PINT-YYYY.'}
                </p>
              )}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-[var(--text-secondary)]">
              {locale === 'ar' ? 'ملخص الضريبة المفحوصة' : 'Audited Tax Breakdown'}
            </h4>
            <div className="mt-2 space-y-1.5 text-xs">
              {validation.calculation.taxableByCategory.map((tb) => (
                <div
                  key={`${tb.vatCategory}-${tb.vatRatePct}`}
                  className="flex items-center justify-between rounded-lg bg-[var(--bg-elevated)] px-3 py-1.5"
                >
                  <span className="pc-mono font-bold" dir="ltr">
                    {tb.vatCategory} ({tb.vatRatePct}%)
                  </span>
                  <span className="pc-mono num-tabular" dir="ltr">
                    {formatMoney(tb.taxableAmount, validation.calculation.currency, locale)} · VAT{' '}
                    {formatMoney(tb.taxAmount, validation.calculation.currency, locale)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {events.length > 0 && (
            <div className="no-print">
              <h4 className="text-xs font-bold text-[var(--text-secondary)]">{copy.eventsLogTitle}</h4>
              <ul className="mt-2 max-h-36 space-y-1 overflow-auto text-[11px] text-[var(--text-secondary)]">
                {events.slice(0, 6).map((ev) => (
                  <li key={ev.id} className="flex items-center justify-between gap-2 rounded bg-[var(--bg-elevated)] px-2.5 py-1">
                    <span className="pc-mono font-semibold text-[var(--text-primary)]" dir="ltr">
                      {ev.eventType}
                    </span>
                    <span className="pc-mono" dir="ltr">{ev.createdAt.slice(0, 16)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

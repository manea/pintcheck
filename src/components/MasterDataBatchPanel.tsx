import { useState, type ChangeEvent } from 'react';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Link2,
  Sparkles,
  Upload,
  XCircle,
} from 'lucide-react';
import { buildCleanedMasterDataCsv } from '../core/batchCsv.ts';
import type { Locale, MasterDataCsvAudit, PintCheckDossier } from '../core/types.ts';
import { auditBatchCsvApi, triggerTextDownload } from '../lib/api.ts';
import type { UiCopy } from '../lib/i18n.ts';

interface Props {
  dossier: PintCheckDossier | null;
  locale: Locale;
  copy: UiCopy;
  busy: boolean;
  onAttachCsvToDossier: (csvText: string) => Promise<void>;
}

const SAMPLE_UAE_CSV = [
  'Company,TRN,Emirate,Currency,VAT_Rate',
  'Al Noor Hardware Trading LLC,100112233400003,AE-DU,AED,5',
  'Oasis Facilities Management LLC,100223344500003,Dubai,AED,5',
  'Emirates Horizon Logistics PJSC,100-7766 55400003,أبوظبي,AED,5',
  '=CMD("calc") Unverified Vendor Co,1004455,Sharjah,AED,15',
].join('\n');

export function MasterDataBatchPanel({
  dossier,
  locale,
  copy,
  busy,
  onAttachCsvToDossier,
}: Props) {
  const [csvText, setCsvText] = useState<string>(SAMPLE_UAE_CSV);
  const [audit, setAudit] = useState<MasterDataCsvAudit | null>(dossier?.batchAudit ?? null);
  const [running, setRunning] = useState(false);
  const [attachedMsg, setAttachedMsg] = useState(false);

  const handleRunAudit = async () => {
    if (!csvText.trim()) return;
    setRunning(true);
    setAttachedMsg(false);
    try {
      const result = await auditBatchCsvApi(csvText);
      setAudit(result);
    } finally {
      setRunning(false);
    }
  };

  const handleFileUpload = async (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    setRunning(true);
    try {
      const result = await auditBatchCsvApi(text);
      setAudit(result);
    } finally {
      setRunning(false);
      ev.target.value = '';
    }
  };

  const handleAttach = async () => {
    if (!dossier || dossier.status === 'locked' || !csvText.trim()) return;
    await onAttachCsvToDossier(csvText);
    const refreshed = await auditBatchCsvApi(csvText);
    setAudit(refreshed);
    setAttachedMsg(true);
    window.setTimeout(() => setAttachedMsg(false), 2500);
  };

  const handleDownloadCleaned = () => {
    if (!audit) return;
    const out = buildCleanedMasterDataCsv(audit, locale);
    triggerTextDownload(`pintcheck-cleaned-masterdata-${locale}.csv`, out, 'text/csv; charset=utf-8');
  };

  const activeAudit = audit ?? dossier?.batchAudit ?? null;

  return (
    <div className="space-y-5">
      <section className="pc-card rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--text-primary)]">
              <FileSpreadsheet className="h-5 w-5 text-[var(--accent-teal)]" />
              {copy.csvBatchTitle}
            </h2>
            <p className="mt-1 max-w-3xl text-xs text-[var(--text-secondary)]">
              {copy.csvBatchSubtitle}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCsvText(SAMPLE_UAE_CSV)}
              className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--bg-soft)]"
            >
              {copy.loadSampleCsvBtn}
            </button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--bg-elevated)]">
              <Upload className="h-3.5 w-3.5 text-[var(--accent-teal)]" />
              {locale === 'ar' ? 'رفع ملف .csv' : 'Upload .csv'}
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
        </div>

        <textarea
          dir="auto"
          rows={6}
          data-testid="csv-batch-textarea"
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          className="pc-input pc-mono mt-4 text-xs leading-relaxed"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="run-csv-audit-btn"
            disabled={running || !csvText.trim()}
            onClick={handleRunAudit}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-teal)] px-4 py-2 text-xs font-bold text-[var(--accent-teal-fg)] hover:bg-[var(--accent-teal-hover)] disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {copy.runCsvAuditBtn}
          </button>

          {dossier && dossier.status !== 'locked' && (
            <button
              type="button"
              data-testid="attach-csv-btn"
              disabled={busy || !csvText.trim()}
              onClick={handleAttach}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-semibold hover:bg-[var(--bg-elevated)] disabled:opacity-50"
            >
              <Link2 className="h-3.5 w-3.5 text-[var(--accent-teal)]" />
              {copy.attachCsvToDossierBtn}
            </button>
          )}

          {activeAudit && (
            <button
              type="button"
              data-testid="download-cleaned-csv-btn"
              onClick={handleDownloadCleaned}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-semibold hover:bg-[var(--bg-elevated)]"
            >
              <Download className="h-3.5 w-3.5 text-[var(--accent-teal)]" />
              {copy.downloadCleanedCsvBtn}
            </button>
          )}

          {attachedMsg && (
            <span className="text-xs font-bold text-[var(--accent-emerald)]">
              ✓ {locale === 'ar' ? 'تم إرفاق تدقيق CSV بالملف النشط' : 'CSV audit saved to dossier'}
            </span>
          )}
        </div>
      </section>

      {activeAudit && (
        <section className="pc-card rounded-2xl p-5" data-testid="csv-audit-summary">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
              <div className="text-xs text-[var(--text-secondary)]">
                {locale === 'ar' ? 'إجمالي السجلات' : 'Total Rows'}
              </div>
              <div className="num-tabular text-2xl font-extrabold" dir="ltr">
                {activeAudit.totalRows}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--accent-emerald)]/30 bg-[var(--accent-emerald-soft)] p-3 text-[var(--accent-emerald)]">
              <div className="text-xs font-medium">
                {locale === 'ar' ? 'جاهز لـ Peppol' : 'Valid & Ready'}
              </div>
              <div className="num-tabular text-2xl font-extrabold" dir="ltr">
                {activeAudit.validRowsCount}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--accent-amber)]/30 bg-[var(--accent-amber-soft)] p-3 text-[var(--accent-amber)]">
              <div className="text-xs font-medium">
                {locale === 'ar' ? 'قابل للتحويل الآلي ISO' : 'Auto-Fixable'}
              </div>
              <div className="num-tabular text-2xl font-extrabold" dir="ltr">
                {activeAudit.fixableRowsCount}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--accent-crimson)]/30 bg-[var(--accent-crimson-soft)] p-3 text-[var(--accent-crimson)]">
              <div className="text-xs font-medium">
                {locale === 'ar' ? 'مرفوض (يتطلب مراجعة)' : 'Blocked / Invalid'}
              </div>
              <div className="num-tabular text-2xl font-extrabold" dir="ltr">
                {activeAudit.invalidRowsCount}
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
            <table className="min-w-[700px] w-full border-collapse text-start text-xs">
              <thead>
                <tr className="border-b border-[var(--border-strong)] bg-[var(--bg-elevated)]/60 text-[var(--text-secondary)]">
                  <th className="p-2.5 font-semibold whitespace-nowrap">#</th>
                  <th className="p-2.5 font-semibold">{locale === 'ar' ? 'المنشأة' : 'Company'}</th>
                  <th className="p-2.5 font-semibold whitespace-nowrap">TRN</th>
                  <th className="p-2.5 font-semibold whitespace-nowrap">Peppol 0235</th>
                  <th className="p-2.5 font-semibold whitespace-nowrap">{locale === 'ar' ? 'الإمارة -> ISO' : 'Emirate -> ISO'}</th>
                  <th className="p-2.5 font-semibold whitespace-nowrap">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="p-2.5 font-semibold">{locale === 'ar' ? 'الملاحظات' : 'Notes'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {activeAudit.rows.map((r) => (
                  <tr key={r.rowIndex} className="hover:bg-[var(--bg-elevated)]/60">
                    <td className="pc-mono num-tabular p-2.5 whitespace-nowrap" dir="ltr">{r.rowIndex}</td>
                    <td className="p-2.5 font-medium" dir="auto">{r.companyName || '—'}</td>
                    <td className="pc-mono num-tabular p-2.5 whitespace-nowrap" dir="ltr">
                      <span className={r.trnValid ? 'text-[var(--accent-emerald)]' : 'text-[var(--accent-crimson)] font-bold'}>
                        {r.normalizedTrn || '—'}
                      </span>
                    </td>
                    <td className="pc-mono num-tabular p-2.5 whitespace-nowrap" dir="ltr">
                      {r.derivedPeppolEndpoint || '—'}
                    </td>
                    <td className="p-2.5">
                      <span className="text-[var(--text-secondary)]">{r.rawEmirate || '—'}</span>
                      {r.suggestedEmirateCode && (
                        <span className="pc-mono ms-1.5 rounded bg-[var(--bg-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--accent-teal)]" dir="ltr">
                          {r.suggestedEmirateCode}
                        </span>
                      )}
                    </td>
                    <td className="p-2.5">
                      {r.status === 'valid' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-emerald-soft)] px-2 py-0.5 font-bold text-[var(--accent-emerald)]">
                          <CheckCircle2 className="h-3 w-3" /> VALID
                        </span>
                      ) : r.status === 'fixable' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-amber-soft)] px-2 py-0.5 font-bold text-[var(--accent-amber)]">
                          FIXABLE
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-crimson-soft)] px-2 py-0.5 font-bold text-[var(--accent-crimson)]">
                          <XCircle className="h-3 w-3" /> INVALID
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 text-[var(--text-secondary)]">
                      {(locale === 'ar' ? r.issuesAr : r.issuesEn).join(' · ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

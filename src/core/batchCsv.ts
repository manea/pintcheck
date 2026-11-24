import type {
  Locale,
  MasterDataCsvAudit,
  MasterDataCsvRowResult,
} from './types.ts';
import { normalizeEmirateCode, validateUaeTrn } from './uaeRules.ts';

function parseRfc4180Rows(csvText: string): string[][] {
  const cleaned = String(csvText ?? '').replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\r') {
      if (cleaned[i + 1] === '\n') i += 1;
      row.push(cell.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  row.push(cell.trim());
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
}

function findHeaderIdx(headers: string[], candidates: string[]): number {
  const lowered = headers.map((h) => h.toLowerCase().trim());
  for (const c of candidates) {
    const idx = lowered.findIndex((h) => h === c || h.includes(c));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function sanitizeCsvCell(val: unknown): string {
  const s = String(val ?? '');
  const trimmedStart = s.trimStart();
  const safe =
    trimmedStart.startsWith('=') ||
    trimmedStart.startsWith('+') ||
    trimmedStart.startsWith('-') ||
    trimmedStart.startsWith('@') ||
    trimmedStart.startsWith('\t') ||
    trimmedStart.startsWith('\r')
      ? `'${s}`
      : s;
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function auditMasterDataCsv(csvText: string): MasterDataCsvAudit {
  const matrix = parseRfc4180Rows(csvText);
  if (matrix.length < 2) {
    return {
      totalRows: 0,
      validRowsCount: 0,
      fixableRowsCount: 0,
      invalidRowsCount: 0,
      rows: [],
    };
  }

  const headers = matrix[0]!;
  const colCompany = findHeaderIdx(headers, ['company', 'customer', 'name', 'buyer', 'العميل', 'الشركة', 'الاسم']);
  const colTrn = findHeaderIdx(headers, ['trn', 'tax', 'vat_number', 'الرقم الضريبي']);
  const colEmirate = findHeaderIdx(headers, ['emirate', 'subdivision', 'state', 'الإمارة']);
  const colCurrency = findHeaderIdx(headers, ['currency', 'العملة']);
  const colVatRate = findHeaderIdx(headers, ['vat_rate', 'tax_rate', 'vat', 'نسبة الضريبة', 'الضريبة']);

  const rows: MasterDataCsvRowResult[] = [];
  let validRowsCount = 0;
  let fixableRowsCount = 0;
  let invalidRowsCount = 0;

  for (let i = 1; i < matrix.length; i += 1) {
    const rec = matrix[i]!;
    const companyName = colCompany >= 0 ? (rec[colCompany] ?? '') : (rec[0] ?? '');
    const rawTrn = colTrn >= 0 ? (rec[colTrn] ?? '') : (rec[1] ?? '');
    const rawEmirate = colEmirate >= 0 ? (rec[colEmirate] ?? '') : (rec[2] ?? '');
    const currency = (colCurrency >= 0 ? (rec[colCurrency] ?? 'AED') : 'AED') || 'AED';
    const vatRateRaw = colVatRate >= 0 ? (rec[colVatRate] ?? '5') : '5';

    const trnCheck = validateUaeTrn(rawTrn);
    const emirateNorm = normalizeEmirateCode(rawEmirate);
    const numericVat = Number(vatRateRaw.replace('%', '').trim());
    const vatRateValid = Number.isFinite(numericVat) && (numericVat === 5 || numericVat === 0);

    const issuesAr: string[] = [];
    const issuesEn: string[] = [];

    if (!trnCheck.valid) {
      issuesAr.push(trnCheck.reasonAr);
      issuesEn.push(trnCheck.reasonEn);
    }

    if (!emirateNorm.validIsoCode) {
      if (emirateNorm.suggestedCode) {
        issuesAr.push(`نص حر "${rawEmirate}" — مقترح التحويل إلى ${emirateNorm.suggestedCode}`);
        issuesEn.push(`Free text "${rawEmirate}" — auto-map to ${emirateNorm.suggestedCode}`);
      } else {
        issuesAr.push(`رمز الإمارة "${rawEmirate}" مفقود أو غير معروف`);
        issuesEn.push(`Emirate code "${rawEmirate || '(empty)'}" missing or unknown`);
      }
    }

    if (!vatRateValid) {
      issuesAr.push(`نسبة ضريبة غير متوافقة "${vatRateRaw}" (المعتمد في الإمارات 5% أو 0%)`);
      issuesEn.push(`Unsupported VAT rate "${vatRateRaw}" (UAE standard rates: 5 or 0)`);
    }

    let status: MasterDataCsvRowResult['status'] = 'valid';
    if (!trnCheck.valid || !vatRateValid || (!emirateNorm.validIsoCode && !emirateNorm.suggestedCode)) {
      status = 'invalid';
      invalidRowsCount += 1;
    } else if (!emirateNorm.validIsoCode && emirateNorm.suggestedCode) {
      status = 'fixable';
      fixableRowsCount += 1;
    } else {
      validRowsCount += 1;
    }

    rows.push({
      rowIndex: i,
      companyName,
      rawTrn,
      normalizedTrn: trnCheck.normalized,
      trnValid: trnCheck.valid,
      derivedPeppolEndpoint: trnCheck.valid ? `0235:${trnCheck.derivedTin}` : '',
      rawEmirate,
      suggestedEmirateCode: emirateNorm.validIsoCode ?? emirateNorm.suggestedCode,
      emirateValid: Boolean(emirateNorm.validIsoCode),
      currency: currency.toUpperCase(),
      vatRateRaw,
      vatRateValid,
      status,
      issuesAr,
      issuesEn,
    });
  }

  return {
    totalRows: rows.length,
    validRowsCount,
    fixableRowsCount,
    invalidRowsCount,
    rows,
  };
}

export function buildCleanedMasterDataCsv(audit: MasterDataCsvAudit, locale: Locale): string {
  const headers =
    locale === 'ar'
      ? [
          'الصف',
          'اسم المنشأة',
          'الرقم الضريبي المنظف (15 خانة)',
          'صلاحية TRN',
          'معرف Peppol (0235:TIN)',
          'الإمارة الأصلية',
          'رمز ISO 3166-2 المقترح',
          'العملة',
          'نسبة الضريبة',
          'حالة السجل',
          'الملاحظات',
        ]
      : [
          'Row',
          'Company Name',
          'Normalized TRN (15 digits)',
          'TRN Valid',
          'Derived Peppol Endpoint',
          'Original Emirate',
          'Suggested ISO SubentityCode',
          'Currency',
          'VAT Rate',
          'Row Status',
          'Validation Notes',
        ];

  const lines = [headers.map(sanitizeCsvCell).join(',')];
  for (const r of audit.rows) {
    const notes = (locale === 'ar' ? r.issuesAr : r.issuesEn).join(' | ');
    lines.push(
      [
        r.rowIndex,
        r.companyName,
        r.normalizedTrn,
        r.trnValid ? 'YES' : 'NO',
        r.derivedPeppolEndpoint,
        r.rawEmirate,
        r.suggestedEmirateCode ?? '',
        r.currency,
        r.vatRateRaw,
        r.status.toUpperCase(),
        notes,
      ]
        .map(sanitizeCsvCell)
        .join(','),
    );
  }

  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

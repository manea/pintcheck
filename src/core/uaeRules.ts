import type {
  AeVatCategoryCode,
  PintDocTypeCode,
  RevenueTier,
  TimelineMilestones,
  UaeEmirateCode,
} from './types.ts';

export const PINT_AE_CUSTOMIZATION_ID = 'urn:peppol:pint:billing-1@ae-1';
export const PINT_AE_SELFBILLING_CUSTOMIZATION_ID = 'urn:peppol:pint:selfbilling-1@ae-1';
export const PINT_AE_PROFILE_ID = 'urn:peppol:bis:billing';
export const PINT_AE_ENDPOINT_SCHEME = '0235';

export interface UaeEmirateMeta {
  code: UaeEmirateCode;
  nameEn: string;
  nameAr: string;
  aliases: string[];
}

export const UAE_EMIRATES: UaeEmirateMeta[] = [
  {
    code: 'AE-AZ',
    nameEn: 'Abu Dhabi',
    nameAr: 'أبوظبي',
    aliases: ['abu dhabi', 'abudhabi', 'أبوظبي', 'أبو ظبي', 'ابوظبي', 'ابو ظبي', 'az', 'auh', 'ad'],
  },
  {
    code: 'AE-DU',
    nameEn: 'Dubai',
    nameAr: 'دبي',
    aliases: ['dubai', 'دبي', 'du', 'dxb'],
  },
  {
    code: 'AE-SH',
    nameEn: 'Sharjah',
    nameAr: 'الشارقة',
    aliases: ['sharjah', 'الشارقة', 'الشارقه', 'sh', 'shj'],
  },
  {
    code: 'AE-AJ',
    nameEn: 'Ajman',
    nameAr: 'عجمان',
    aliases: ['ajman', 'عجمان', 'aj', 'ajm'],
  },
  {
    code: 'AE-UQ',
    nameEn: 'Umm Al Quwain',
    nameAr: 'أم القيوين',
    aliases: ['umm al quwain', 'umm al-quwain', 'umm al qaiwain', 'أم القيوين', 'ام القيوين', 'uq', 'uaq'],
  },
  {
    code: 'AE-RK',
    nameEn: 'Ras Al Khaimah',
    nameAr: 'رأس الخيمة',
    aliases: ['ras al khaimah', 'ras al-khaimah', 'رأس الخيمة', 'راس الخيمه', 'راس الخيمة', 'rk', 'rak'],
  },
  {
    code: 'AE-FU',
    nameEn: 'Fujairah',
    nameAr: 'الفجيرة',
    aliases: ['fujairah', 'الفجيرة', 'الفجيره', 'fu', 'fuj'],
  },
];

export interface AeVatCategoryMeta {
  code: AeVatCategoryCode;
  nameEn: string;
  nameAr: string;
  expectedRatePct: number | null;
  requiresExemptionReason: boolean;
}

export const AE_VAT_CATEGORIES: Record<AeVatCategoryCode, AeVatCategoryMeta> = {
  S: {
    code: 'S',
    nameEn: 'Standard Rate (5% UAE VAT)',
    nameAr: 'النسبة القياسية (5% ضريبة القيمة المضافة)',
    expectedRatePct: 5,
    requiresExemptionReason: false,
  },
  Z: {
    code: 'Z',
    nameEn: 'Zero-Rated Supply (0%)',
    nameAr: 'توريد خاضع لنسبة الصفر (0%)',
    expectedRatePct: 0,
    requiresExemptionReason: false,
  },
  E: {
    code: 'E',
    nameEn: 'Exempt from VAT (0%)',
    nameAr: 'معفى من الضريبة (0%)',
    expectedRatePct: 0,
    requiresExemptionReason: true,
  },
  O: {
    code: 'O',
    nameEn: 'Out of Scope / Not Subject (0%)',
    nameAr: 'خارج نطاق الضريبة (0%)',
    expectedRatePct: 0,
    requiresExemptionReason: true,
  },
  AE: {
    code: 'AE',
    nameEn: 'UAE VAT Reverse Charge',
    nameAr: 'الاحتساب العكسي لضريبة القيمة المضافة',
    expectedRatePct: 0,
    requiresExemptionReason: false,
  },
  N: {
    code: 'N',
    nameEn: 'Standard Rate Additional VAT (5%)',
    nameAr: 'ضريبة إضافية قياسية (5%)',
    expectedRatePct: 5,
    requiresExemptionReason: false,
  },
};

export interface PintDocTypeMeta {
  code: PintDocTypeCode;
  labelEn: string;
  labelAr: string;
  ublRoot: 'Invoice' | 'CreditNote';
}

export const PINT_DOC_TYPES: Record<PintDocTypeCode, PintDocTypeMeta> = {
  '380': {
    code: '380',
    labelEn: 'Tax Invoice (UNCL 380)',
    labelAr: 'فاتورة ضريبية (380)',
    ublRoot: 'Invoice',
  },
  '381': {
    code: '381',
    labelEn: 'Tax Credit Note (UNCL 381)',
    labelAr: 'إشعار دائن ضريبي (381)',
    ublRoot: 'CreditNote',
  },
  '386': {
    code: '386',
    labelEn: 'Prepayment Tax Invoice (UNCL 386)',
    labelAr: 'فاتورة دفعة مقدمة (386)',
    ublRoot: 'Invoice',
  },
  '480': {
    code: '480',
    labelEn: 'Commercial / Out-of-Scope Invoice (UNCL 480)',
    labelAr: 'فاتورة تجارية / خارج النطاق (480)',
    ublRoot: 'Invoice',
  },
};

export interface TrnValidationResult {
  raw: string;
  normalized: string;
  valid: boolean;
  startsWith100: boolean;
  derivedTin: string;
  reasonEn: string;
  reasonAr: string;
}

const VALID_EMIRATE_SET = new Set<string>(UAE_EMIRATES.map((e) => e.code));

export function validateUaeTrn(raw: string): TrnValidationResult {
  const input = String(raw ?? '').trim();
  const compact = input.replace(/[\s-]+/g, '');

  if (!compact) {
    return {
      raw: input,
      normalized: '',
      valid: false,
      startsWith100: false,
      derivedTin: '',
      reasonEn: 'TRN is missing; UAE PINT-AE requires 15 numeric digits for B2B/B2G tax parties.',
      reasonAr: 'الرقم الضريبي مفقود؛ تتطلب مواصفة PINT-AE رقم تسجيل ضريبي إماراتي من 15 خانة.',
    };
  }

  if (!/^\d+$/.test(compact)) {
    return {
      raw: input,
      normalized: compact,
      valid: false,
      startsWith100: false,
      derivedTin: '',
      reasonEn: 'TRN contains non-numeric characters; remove letters or symbols.',
      reasonAr: 'الرقم الضريبي يحتوي على أحرف أو رموز غير رقمية.',
    };
  }

  if (compact.length !== 15) {
    return {
      raw: input,
      normalized: compact,
      valid: false,
      startsWith100: compact.startsWith('100'),
      derivedTin: compact.length >= 10 ? compact.slice(0, 10) : '',
      reasonEn: `TRN has ${compact.length} digits instead of the required 15 UAE FTA digits.`,
      reasonAr: `الرقم الضريبي مكوّن من ${compact.length} خانات والمطلوب نظامياً 15 خانة رقمية.`,
    };
  }

  const startsWith100 = compact.startsWith('100');
  return {
    raw: input,
    normalized: compact,
    valid: true,
    startsWith100,
    derivedTin: compact.slice(0, 10),
    reasonEn: startsWith100
      ? 'Valid 15-digit UAE FTA TRN.'
      : 'Valid 15-digit numeric TRN, though standard UAE FTA TRNs begin with 100.',
    reasonAr: startsWith100
      ? 'رقم تسجيل ضريبي إماراتي صحيح من 15 خانة.'
      : 'طول الرقم 15 خانة صحيحة، لكن الرقم الضريبي الإماراتي المعتاد يبدأ بـ 100.',
  };
}

export interface NormalizedEmirateResult {
  raw: string;
  validIsoCode: UaeEmirateCode | null;
  suggestedCode: UaeEmirateCode | null;
  wasFreeText: boolean;
}

export function normalizeEmirateCode(raw: string): NormalizedEmirateResult {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    return { raw: '', validIsoCode: null, suggestedCode: null, wasFreeText: false };
  }

  const upper = trimmed.toUpperCase();
  if (VALID_EMIRATE_SET.has(upper)) {
    return {
      raw: trimmed,
      validIsoCode: upper as UaeEmirateCode,
      suggestedCode: upper as UaeEmirateCode,
      wasFreeText: false,
    };
  }

  const lower = trimmed.toLowerCase();
  for (const emirate of UAE_EMIRATES) {
    if (emirate.aliases.includes(lower)) {
      return {
        raw: trimmed,
        validIsoCode: null,
        suggestedCode: emirate.code,
        wasFreeText: true,
      };
    }
  }

  return { raw: trimmed, validIsoCode: null, suggestedCode: null, wasFreeText: true };
}

function diffDaysUtc(fromIso: string, toIso: string): number {
  const fromMs = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const toMs = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  return Math.round((toMs - fromMs) / 86_400_000);
}

export function getTimelineMilestones(
  revenueTier: RevenueTier,
  referenceDateIso: string = new Date().toISOString().slice(0, 10),
): TimelineMilestones {
  // Per UAE Ministerial Decisions No. 243 & No. 244 of 2025:
  // Large (>= AED 50M): ASP appointment July 31, 2026 / mandatory go-live Jan 1, 2027
  // SME (< AED 50M): ASP appointment March 31, 2027 / mandatory go-live July 1, 2027
  const aspAppointmentDeadline = revenueTier === 'sme_under_50m' ? '2027-03-31' : '2026-07-31';
  const mandatoryGoLiveDate = revenueTier === 'sme_under_50m' ? '2027-07-01' : '2027-01-01';

  return {
    revenueTier,
    referenceDate: referenceDateIso.slice(0, 10),
    aspAppointmentDeadline,
    mandatoryGoLiveDate,
    daysUntilAspAppointment: diffDaysUtc(referenceDateIso, aspAppointmentDeadline),
    daysUntilGoLive: diffDaysUtc(referenceDateIso, mandatoryGoLiveDate),
  };
}

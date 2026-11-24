import type {
  AspReadinessCheckItem,
  Locale,
  PintCheckDossier,
  PintInvoiceInput,
  ReadinessCheckStatus,
  RevenueTier,
} from './types.ts';
import { buildDefaultAspReadinessChecks, computeReadinessSummary } from './readiness.ts';
import { generatePintAeXml } from './ublXml.ts';
import { validatePintAeInvoice } from './validator.ts';

export interface PintCheckPresetMeta {
  id: 'dubai-trading-compliant' | 'abudhabi-agency-errors' | 'sharjah-export-credit-note';
  nameEn: string;
  nameAr: string;
  badgeEn: string;
  badgeAr: string;
  defaultLocale: Locale;
  organizationName: string;
  revenueTier: RevenueTier;
  invoice: PintInvoiceInput;
  checklistOverrides: Array<{ id: string; status: ReadinessCheckStatus; notes?: string }>;
}

export const PINTCHECK_PRESETS: PintCheckPresetMeta[] = [
  {
    id: 'dubai-trading-compliant',
    nameEn: 'Dubai B2B Tax Invoice (Compliant PINT-AE 380)',
    nameAr: 'فاتورة ضريبية متوافقة — شركة تجارة عامة بدبي (380)',
    badgeEn: '100% Pass · AED · AE-DU -> AE-AZ',
    badgeAr: 'مطابقة 100% · درهم · دبي ← أبوظبي',
    defaultLocale: 'ar',
    organizationName: 'شركة المرفأ للتجارة والمستلزمات ذ.م.م',
    revenueTier: 'sme_under_50m',
    invoice: {
      id: 'inv-dxb-001',
      invoiceNumber: 'INV-DXB-2026-0412',
      uuid: '8b2c4e12-5a77-4d91-9f30-771234abcd01',
      issueDate: '2026-11-24',
      dueDate: '2026-12-24',
      docTypeCode: '380',
      transactionFlags: '00000000',
      currency: 'AED',
      fxRateToAed: 1,
      note: 'توريد تجهيزات مكتبية ومعايرة أجهزة شبكية — خاضع لضريبة القيمة المضافة 5%',
      seller: {
        legalName: 'Al Marfa General Trading LLC',
        trn: '100451289100003',
        peppolSchemeId: '0235',
        peppolEndpointId: '1004512891',
        streetAddress: 'Office 904, Business Bay Square',
        city: 'Dubai',
        emirateCode: 'AE-DU',
        countryCode: 'AE',
        contactEmail: 'finance@almarfa-trading.ae',
      },
      buyer: {
        legalName: 'Capital Infrastructure Holdings PJSC',
        trn: '100998877600003',
        peppolSchemeId: '0235',
        peppolEndpointId: '1009988776',
        streetAddress: 'Al Maryah Tower, Level 14',
        city: 'Abu Dhabi',
        emirateCode: 'AE-AZ',
        countryCode: 'AE',
        contactEmail: 'ap@capital-infra.ae',
      },
      lines: [
        {
          id: '1',
          description: 'Enterprise Network Switches (Batch A-24)',
          quantity: 10,
          unitCode: 'EA',
          unitPrice: 1200,
          vatCategory: 'S',
          vatRatePct: 5,
        },
        {
          id: '2',
          description: 'On-site Rack Cabling & Commissioning',
          quantity: 1,
          unitCode: 'ACT',
          unitPrice: 3500,
          vatCategory: 'S',
          vatRatePct: 5,
        },
      ],
    },
    checklistOverrides: [
      { id: 'chk-seller-trn', status: 'pass' },
      { id: 'chk-buyer-trns', status: 'pass' },
      { id: 'chk-iso-emirates', status: 'pass' },
      { id: 'chk-vat-categories', status: 'pass' },
      { id: 'chk-ubl-customid', status: 'pass' },
      { id: 'chk-fx-aed-tax', status: 'pass' },
      { id: 'chk-credit-note-ref', status: 'pass' },
      { id: 'chk-uuid-archive', status: 'pass' },
      { id: 'chk-asp-shortlist', status: 'pass' },
      { id: 'chk-asp-contract', status: 'in_progress', notes: 'مراجعة نهائية لعقد مزود الخدمة ASP قبل الربع الأول 2027.' },
      { id: 'chk-sandbox-e2e', status: 'not_started' },
      { id: 'chk-finance-sop', status: 'in_progress' },
    ],
  },
  {
    id: 'abudhabi-agency-errors',
    nameEn: 'Abu Dhabi Agency Draft (Common PINT-AE Rejection Errors)',
    nameAr: 'مسودة وكالة في أبوظبي — أخطاء رفض شائعة قبل الربط (TRN / ISO / FX)',
    badgeEn: 'Pre-Audit Issues · USD / TRN Fix',
    badgeAr: 'كشف أخطاء شائعة · دولار وتعديل بيانات',
    defaultLocale: 'en',
    organizationName: 'Horizon Advisory & Creative Studio',
    revenueTier: 'sme_under_50m',
    invoice: {
      id: 'inv-auh-err',
      invoiceNumber: 'INV-AUH-2026-089',
      uuid: '21f991a0-1b2c-44e5-8c00-998877665502',
      issueDate: '2026-11-24',
      docTypeCode: '380',
      currency: 'USD',
      // Intentional missing fxRateToAed to surface AE-FX-AED rule
      seller: {
        legalName: 'Horizon Advisory LLC',
        trn: '100223344500003',
        peppolSchemeId: '0235',
        peppolEndpointId: '1002233445',
        streetAddress: 'Corniche Road, Tower B',
        city: 'Abu Dhabi',
        emirateCode: 'Abu Dhabi', // Intentional free-text error -> should be AE-AZ
        countryCode: 'AE',
      },
      buyer: {
        legalName: 'Gulf Retail Platforms FZ-LLC',
        trn: '10044556677889', // Intentional 14 digits instead of 15
        peppolSchemeId: '0230', // Intentional wrong scheme -> should be 0235
        peppolEndpointId: '9999999999', // Intentional mismatch
        streetAddress: 'Media City Building 4',
        city: 'Dubai',
        emirateCode: 'Dubai', // Intentional free-text -> should be AE-DU
        countryCode: 'AE',
      },
      lines: [
        {
          id: '1',
          description: 'Q4 Digital Architecture & Compliance Retainer',
          quantity: 1,
          unitCode: 'MON',
          unitPrice: 4500,
          vatCategory: 'S',
          vatRatePct: 0, // Intentional rate conflict (S requires 5%)
        },
      ],
    },
    checklistOverrides: [
      { id: 'chk-seller-trn', status: 'pass' },
      { id: 'chk-buyer-trns', status: 'fail', notes: '12% من سجلات العملاء في ERP ناقصة أو بـ 14 رقماً.' },
      { id: 'chk-iso-emirates', status: 'fail', notes: 'النظام يخرج اسم المدينة كنص حر بدلاً من AE-AZ / AE-DU.' },
      { id: 'chk-fx-aed-tax', status: 'fail', notes: 'فواتير USD لا تعرض مكافئ الضريبة بالدرهم AED.' },
      { id: 'chk-asp-shortlist', status: 'in_progress' },
    ],
  },
  {
    id: 'sharjah-export-credit-note',
    nameEn: 'Sharjah Mixed Supply Tax Credit Note (381 · Standard + Zero Export)',
    nameAr: 'إشعار دائن ضريبي بالشارقة (381 · مبيعات محلية 5% وتصدير 0%)',
    badgeEn: 'Credit Note 381 · Mixed S + Z',
    badgeAr: 'إشعار دائن 381 · مختلط S و Z',
    defaultLocale: 'ar',
    organizationName: 'مصنع النخيل للتغليف الحديث ذ.م.م',
    revenueTier: 'sme_under_50m',
    invoice: {
      id: 'cn-shj-381',
      invoiceNumber: 'CN-SHJ-2026-0019',
      uuid: '99a1b2c3-7d4e-4111-a222-334455667703',
      issueDate: '2026-11-24',
      docTypeCode: '381',
      precedingInvoiceReference: 'INV-SHJ-2026-0118',
      currency: 'AED',
      fxRateToAed: 1,
      note: 'تسوية مرتجع دفعة من شحنة التغليف وفق إشعار استلام العميل.',
      seller: {
        legalName: 'Al Nakheel Modern Packaging LLC',
        trn: '100778899100003',
        peppolSchemeId: '0235',
        peppolEndpointId: '1007788991',
        streetAddress: 'Industrial Area 6, Plot 42',
        city: 'Sharjah',
        emirateCode: 'AE-SH',
        countryCode: 'AE',
      },
      buyer: {
        legalName: 'Emirates Food Logistics Co. LLC',
        trn: '100665544300003',
        peppolSchemeId: '0235',
        peppolEndpointId: '1006655443',
        streetAddress: 'Jebel Ali Free Zone',
        city: 'Dubai',
        emirateCode: 'AE-DU',
        countryCode: 'AE',
      },
      lines: [
        {
          id: '1',
          description: 'Returned Domestic Kraft Cartons (Standard Rated 5%)',
          quantity: 200,
          unitCode: 'EA',
          unitPrice: 12,
          vatCategory: 'S',
          vatRatePct: 5,
        },
        {
          id: '2',
          description: 'Export Shipping Crates Adjustment (Zero-Rated Export 0%)',
          quantity: 50,
          unitCode: 'EA',
          unitPrice: 40,
          vatCategory: 'Z',
          vatRatePct: 0,
        },
      ],
    },
    checklistOverrides: [
      { id: 'chk-seller-trn', status: 'pass' },
      { id: 'chk-buyer-trns', status: 'pass' },
      { id: 'chk-iso-emirates', status: 'pass' },
      { id: 'chk-vat-categories', status: 'pass' },
      { id: 'chk-credit-note-ref', status: 'pass' },
      { id: 'chk-ubl-customid', status: 'pass' },
    ],
  },
];

export function createDossierFromPreset(
  presetId: PintCheckPresetMeta['id'],
  referenceDateIso: string = '2026-11-24',
): PintCheckDossier {
  const preset = PINTCHECK_PRESETS.find((p) => p.id === presetId) ?? PINTCHECK_PRESETS[0]!;
  const invoiceCopy: PintInvoiceInput = structuredClone(preset.invoice);
  const checks: AspReadinessCheckItem[] = buildDefaultAspReadinessChecks(preset.checklistOverrides);
  const validation = validatePintAeInvoice(invoiceCopy);
  const generatedXml = generatePintAeXml(invoiceCopy, validation.calculation);
  const readinessSummary = computeReadinessSummary(
    validation,
    checks,
    preset.revenueTier,
    referenceDateIso,
  );
  const rand = Math.random().toString(36).slice(2, 7);

  return {
    id: `pin-${preset.id}-${rand}`,
    slug: `${preset.id}-${rand}`,
    status: 'draft',
    defaultLocale: preset.defaultLocale,
    organizationName: preset.organizationName,
    organizationTrn: invoiceCopy.seller.trn,
    revenueTier: preset.revenueTier,
    referenceDate: referenceDateIso,
    invoice: invoiceCopy,
    rawXmlSource: generatedXml,
    validation,
    readinessChecks: checks,
    readinessSummary,
  };
}

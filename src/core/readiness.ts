import type {
  AspReadinessCheckItem,
  ReadinessCheckStatus,
  ReadinessSummary,
  RevenueTier,
  ValidationReport,
} from './types.ts';
import { getTimelineMilestones } from './uaeRules.ts';

const DEFAULT_ASP_READINESS_CHECKS: ReadonlyArray<Omit<AspReadinessCheckItem, 'status' | 'notes'>> = [
  {
    id: 'chk-seller-trn',
    category: 'master_data',
    titleEn: 'Verify Seller 15-digit FTA TRN & 10-digit Peppol TIN (0235)',
    titleAr: 'التحقق من الرقم الضريبي للمورّد (15 خانة) ومعرّف Peppol (0235)',
    guidanceEn: 'Ensure exact match with FTA VAT certificate and derive the 10-digit prefix for EndpointID.',
    guidanceAr: 'مطابقة شهادة التسجيل الضريبي لدى FTA واستخراج أول 10 أرقام لمعرّف Peppol.',
    weight: 10,
  },
  {
    id: 'chk-buyer-trns',
    category: 'master_data',
    titleEn: 'Clean B2B/B2G Buyer TRNs in CRM / Accounting Master Data',
    titleAr: 'تنظيف الأرقام الضريبية لعملاء B2B وB2G في قاعدة البيانات',
    guidanceEn: 'Audit all customer accounts for valid 15-digit numeric TRNs with no spaces or placeholders.',
    guidanceAr: 'مراجعة جميع حسابات العملاء لضمان وجود 15 خانة رقمية خالية من المسافات والأخطاء.',
    weight: 10,
  },
  {
    id: 'chk-iso-emirates',
    category: 'master_data',
    titleEn: 'Normalize Addresses to ISO 3166-2:AE Emirate Codes (AE-AZ .. AE-FU)',
    titleAr: 'توحيد العناوين وفق رموز الإمارات السبعة المعتمدة (AE-AZ .. AE-FU)',
    guidanceEn: 'Replace free-text city labels ("Dubai", "Abu Dhabi") with CountrySubentityCode values.',
    guidanceAr: 'استبدال النصوص الحرة في حقل الإمارة برموز ISO القياسية لتجنب رفض Peppol.',
    weight: 10,
  },
  {
    id: 'chk-vat-categories',
    category: 'master_data',
    titleEn: 'Map Inventory/Service SKUs to AE VAT Categories (S / Z / E / O / AE)',
    titleAr: 'ربط الأصناف والخدمات بفئات ضريبة الإمارات (S / Z / E / O / AE)',
    guidanceEn: 'Tag zero-rated exports, exempt real estate/finance, and reverse charge items explicitly.',
    guidanceAr: 'تعيين فئة الضريبة المناسبة وسبب الإعفاء للمعاملات المعفاة والصفرية والاحتساب العكسي.',
    weight: 8,
  },
  {
    id: 'chk-ubl-customid',
    category: 'erp_xml',
    titleEn: 'Emit PINT-AE CustomizationID (urn:peppol:pint:billing-1@ae-1)',
    titleAr: 'توليد CustomizationID وProfileID وفق مواصفة PINT-AE في UBL 2.1 XML',
    guidanceEn: 'Configure ERP/billing export templates with official OpenPeppol PINT-AE identifiers.',
    guidanceAr: 'تهيئة قوالب تصدير الفواتير لإدراج معرّفات PINT-AE الرسمية بدقة.',
    weight: 10,
  },
  {
    id: 'chk-fx-aed-tax',
    category: 'erp_xml',
    titleEn: 'Include Dual AED TaxTotal & Exchange Rate on Foreign-Currency Invoices',
    titleAr: 'إظهار مكافئ الضريبة بالدرهم AED وسعر الصرف عند الفوترة بعملات أجنبية',
    guidanceEn: 'Verify USD/EUR/SAR invoices output TaxCurrencyCode=AED alongside CBUAE conversion.',
    guidanceAr: 'التأكد من إخراج TaxCurrencyCode=AED وسعر صرف المصرف المركزي للفواتير الأجنبية.',
    weight: 8,
  },
  {
    id: 'chk-credit-note-ref',
    category: 'erp_xml',
    titleEn: 'Link Credit Notes (381) to Preceding Tax Invoice Reference & Scope',
    titleAr: 'ربط إشعارات الدائن (381) برقم الفاتورة الأصلية وسبب التعديل',
    guidanceEn: 'Ensure BillingReference carries original Invoice ID for VAT adjustments and returns.',
    guidanceAr: 'إلزامية إدراج BillingReference في كل إشعار دائن مرتبط بفاتورة ضريبية سابقة.',
    weight: 7,
  },
  {
    id: 'chk-uuid-archive',
    category: 'erp_xml',
    titleEn: 'Assign Persistent Document UUID & 5+ Year Compliant Record Archival',
    titleAr: 'توليد معرّف UUID فريد والأرشفة النظامية للـ XML (5+ سنوات)',
    guidanceEn: 'Guarantee unique UUID generation and retain immutable XML + tax records per UAE tax law.',
    guidanceAr: 'ضمان تفرد المعرّف UUID وحفظ النسخ الإلكترونية وفق متطلبات الحفظ الضريبي.',
    weight: 7,
  },
  {
    id: 'chk-asp-shortlist',
    category: 'asp_selection',
    titleEn: 'Shortlist & Vet UAE MoF Accredited Service Providers (ASPs)',
    titleAr: 'تقييم واختيار مزود الخدمة المعتمد (ASP) من قائمة وزارة المالية',
    guidanceEn: 'Compare official MoF ASP pricing, ERP connectors, SLA, and onboarding timeline.',
    guidanceAr: 'مقارنة عروض الأسعار والتكامل التقني لدى قائمة الـ ASPs المعتمدة من وزارة المالية.',
    weight: 8,
  },
  {
    id: 'chk-asp-contract',
    category: 'asp_selection',
    titleEn: 'Appoint MoF ASP Officially Before Deadline (SMEs: Mar 31, 2027)',
    titleAr: 'تعيين مزود الخدمة المعتمد رسمياً قبل الموعد (الشركات < 50M: 31 مارس 2027)',
    guidanceEn: 'Finalize ASP appointment agreement and register entity Peppol participant ID (0235).',
    guidanceAr: 'إتمام التعاقد الرسمي وتفعيل معرّف Peppol الخاص بالشركة قبل الموعد النظامي.',
    weight: 8,
  },
  {
    id: 'chk-sandbox-e2e',
    category: 'testing',
    titleEn: 'Complete 5-Corner Peppol Sandbox Exchange Tests (380 & 381)',
    titleAr: 'إتمام اختبارات الإرسال والاستقبال التجريبية (Sandbox) للفواتير وإشعارات الدائن',
    guidanceEn: 'Verify end-to-end AP/AR round-trip XML delivery via your chosen ASP sandbox.',
    guidanceAr: 'اختبار دورة الإرسال والاستلام المتبادلة للفواتير 380 و381 في البيئة التجريبية.',
    weight: 8,
  },
  {
    id: 'chk-finance-sop',
    category: 'testing',
    titleEn: 'Train Accounting Team on Rejection Handling & Exception Workflows',
    titleAr: 'تدريب الفريق المالي على معالجة أخطاء ورفض الفواتير قبل الإلزام النهائي',
    guidanceEn: 'Establish SOPs for buyer TRN rejections, credit notes, and period-end FTA reconciliation.',
    guidanceAr: 'اعتماد دليل عمل داخلي لمعالجة الأخطاء ومطابقة إقرارات ضريبة القيمة المضافة.',
    weight: 6,
  },
];

export function buildDefaultAspReadinessChecks(
  overrides?: Array<{ id: string; status: ReadinessCheckStatus; notes?: string }>,
): AspReadinessCheckItem[] {
  const overrideMap = new Map<string, { status: ReadinessCheckStatus; notes?: string }>();
  if (overrides) {
    for (const o of overrides) {
      overrideMap.set(o.id, { status: o.status, notes: o.notes });
    }
  }

  return DEFAULT_ASP_READINESS_CHECKS.map((item) => {
    const ov = overrideMap.get(item.id);
    return {
      ...item,
      status: ov?.status ?? 'not_started',
      ...(ov?.notes ? { notes: ov.notes } : {}),
    };
  });
}

export function computeReadinessSummary(
  validation: ValidationReport,
  checks: AspReadinessCheckItem[],
  revenueTier: RevenueTier,
  referenceDateIso: string = new Date().toISOString().slice(0, 10),
): ReadinessSummary {
  let totalWeight = 0;
  let earnedWeight = 0;
  let passedChecksCount = 0;
  let failedChecksCount = 0;

  for (const chk of checks) {
    totalWeight += chk.weight;
    if (chk.status === 'pass') {
      earnedWeight += chk.weight;
      passedChecksCount += 1;
    } else if (chk.status === 'in_progress') {
      earnedWeight += chk.weight * 0.5;
    } else if (chk.status === 'fail') {
      failedChecksCount += 1;
    }
  }

  const checklistScore = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
  const xmlPassScore = validation.passScore;
  const compositeScore = Math.round(xmlPassScore * 0.6 + checklistScore * 0.4);

  let status: ReadinessSummary['status'] = 'not_ready';
  if (validation.valid && compositeScore >= 80 && failedChecksCount === 0) {
    status = 'ready_for_asp_sandbox';
  } else if (compositeScore >= 45 || xmlPassScore >= 60) {
    status = 'needs_remediation';
  }

  return {
    compositeScore,
    xmlPassScore,
    checklistScore,
    status,
    passedChecksCount,
    failedChecksCount,
    totalChecksCount: checks.length,
    milestones: getTimelineMilestones(revenueTier, referenceDateIso),
  };
}

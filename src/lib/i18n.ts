import type { CurrencyCode, Locale } from '../core/types.ts';

export function formatMoney(amount: number, currency: CurrencyCode, locale: Locale): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-AE' : 'en-AE', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  } catch {
    return `${currency} ${safe.toFixed(2)}`;
  }
}

export function formatShortDate(iso: string | undefined, locale: Locale): string {
  if (!iso) return '—';
  const clean = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return iso;
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-AE' : 'en-AE', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(new Date(`${clean}T00:00:00Z`));
  } catch {
    return clean;
  }
}

export interface UiCopy {
  brandTitle: string;
  brandSubtitle: string;
  disclaimerBanner: string;
  disclaimerShort: string;
  localModeBadge: string;
  serverModeBadge: string;
  navStudio: string;
  navBatchCsv: string;
  navReadiness: string;
  navProfiles: string;
  themePearl: string;
  themeNight: string;
  langSwitchLabel: string;
  newFromPreset: string;
  importXmlBtn: string;
  searchPlaceholder: string;
  filterAll: string;
  filterDraft: string;
  filterLocked: string;
  statsTotal: string;
  statsDrafts: string;
  statsLocked: string;
  noDossiersTitle: string;
  noDossiersBody: string;
  scoreLabel: string;
  readinessLabel: string;
  statusPass: string;
  statusNeedsFix: string;
  statusNotReady: string;
  lockedBadge: string;
  draftBadge: string;
  finalizeBtn: string;
  finalizedNote: string;
  duplicateBtn: string;
  deleteBtn: string;
  exportXmlBtn: string;
  exportIssuesCsvBtn: string;
  printPdfBtn: string;
  copyPublicLinkBtn: string;
  copiedToast: string;
  publicViewNotice: string;
  backToStudioBtn: string;
  aspTimelineTitle: string;
  revenueTierLabel: string;
  tierSme: string;
  tierLarge: string;
  aspDeadlineLabel: string;
  goLiveDeadlineLabel: string;
  daysRemaining: string;
  issuesTitle: string;
  issuesEmpty: string;
  quickFixAllBtn: string;
  quickFixSingleBtn: string;
  docHeaderSection: string;
  sellerSection: string;
  buyerSection: string;
  linesSection: string;
  addLineBtn: string;
  saveChangesBtn: string;
  savingLabel: string;
  xmlPreviewTitle: string;
  copyXmlBtn: string;
  pasteXmlTitle: string;
  validateRawXmlBtn: string;
  applyXmlToDossierBtn: string;
  csvBatchTitle: string;
  csvBatchSubtitle: string;
  loadSampleCsvBtn: string;
  runCsvAuditBtn: string;
  attachCsvToDossierBtn: string;
  downloadCleanedCsvBtn: string;
  checklistTitle: string;
  summaryTitle: string;
  copySummaryBtn: string;
  shaIntegrityTitle: string;
  verifyIntegrityBtn: string;
  shaMatchLabel: string;
  shaMismatchLabel: string;
  eventsLogTitle: string;
  profilesTitle: string;
  profilesSubtitle: string;
  createProfileBtn: string;
  applySellerProfileBtn: string;
}

const AR_COPY: UiCopy = {
  brandTitle: 'PINTCheck | فحص فاتورة الإمارات',
  brandSubtitle: 'مدقق الفوترة الإلكترونية PINT-AE / Peppol UBL 2.1 XML وتنظيف TRN قبل التعاقد مع ASP',
  disclaimerBanner:
    'تنويه تنظيمي إلزامي: «PINTCheck» أداة فحص مسبق وتجهيز بيانات واختبار UBL 2.1 XML محلية — وليست مزود خدمة معتمد (ASP) لدى وزارة المالية الإماراتية ولا ترسل فواتير حية عبر شبكة Peppol.',
  disclaimerShort: 'مدقق فحص مسبق لصيغة PINT-AE — وليس مزود خدمة معتمد (ASP)',
  localModeBadge: 'وضع المتصفح المحلي (0$)',
  serverModeBadge: 'متصل بالخادم المحلي SQLite WAL',
  navStudio: 'استوديو الفحص و XML',
  navBatchCsv: 'تنظيف دفعات CSV',
  navReadiness: 'جاهزية ASP والتقرير',
  navProfiles: 'ملفات المنشآت',
  themePearl: 'درهم لؤلؤي',
  themeNight: 'محطة ليلية',
  langSwitchLabel: 'English',
  newFromPreset: 'سيناريو إماراتي جديد',
  importXmlBtn: 'فحص ملف XML',
  searchPlaceholder: 'ابحث باسم المنشأة، رقم الفاتورة، أو PINT-YYYY...',
  filterAll: 'الكل',
  filterDraft: 'مسودات',
  filterLocked: 'مختومة',
  statsTotal: 'الإجمالي',
  statsDrafts: 'مسودات',
  statsLocked: 'مختومة',
  noDossiersTitle: 'اختر ملف فحص أو أنشئ نموذجاً إماراتياً',
  noDossiersBody: 'ابدأ بأحد السيناريوهات الجاهزة (فاتورة دبي المتوافقة، مسودة أخطاء أبوظبي بالدولار، أو إشعار دائن الشارقة 381).',
  scoreLabel: 'درجة توافق XML',
  readinessLabel: 'جاهزية ASP الإجمالية',
  statusPass: 'جاهز مبدئياً لبيئة الاختبار ASP',
  statusNeedsFix: 'يتطلب تصحيح حقول قبل الاعتماد',
  statusNotReady: 'غير جاهز — أخطاء بنيوية حرجة',
  lockedBadge: 'معتمد ومقفول',
  draftBadge: 'مسودة قابلة للتعديل',
  finalizeBtn: 'اعتماد وختم رقم PINT-YYYY',
  finalizedNote: 'هذا التقرير مختوم ببصمة SHA-256 ولا يمكن تعديله؛ يمكنك استنساخه لمسودة جديدة.',
  duplicateBtn: 'استنساخ لمسودة جديدة',
  deleteBtn: 'حذف المسودة',
  exportXmlBtn: 'تنزيل PINT-AE XML',
  exportIssuesCsvBtn: 'تصدير الأخطاء CSV (BOM)',
  printPdfBtn: 'طباعة / PDF رسمي A4',
  copyPublicLinkBtn: 'نسخ رابط التقرير العام',
  copiedToast: 'تم النسخ للحافظة',
  publicViewNotice: 'معاينة تقرير جاهزية عام للقراءة فقط',
  backToStudioBtn: 'العودة إلى استوديو PINTCheck',
  aspTimelineTitle: 'المهل النظامية — القراران الوزاريان 243 و244 لسنة 2025',
  revenueTierLabel: 'شريحة الإيرادات السنوية',
  tierSme: 'الشركات الصغيرة والمتوسطة (< 50 مليون د.إ)',
  tierLarge: 'الشركات الكبرى (>= 50 مليون د.إ)',
  aspDeadlineLabel: 'آخر موعد لتعيين مزود ASP',
  goLiveDeadlineLabel: 'الإلزام الفعلي للفوترة (B2B/B2G)',
  daysRemaining: 'يوماً متبقياً',
  issuesTitle: 'نتائج قواعد الفحص المسبق PINT-AE',
  issuesEmpty: 'ممتاز — جميع قواعد الفحص المسبق ناجحة بنسبة 100/100 بدون أخطاء أو تنبيهات.',
  quickFixAllBtn: 'تصحيح الأخطاء التلقائي السريع',
  quickFixSingleBtn: 'إصلاح',
  docHeaderSection: 'بيانات رأس المستند والعملة',
  sellerSection: 'بيانات المورّد (البائع — Corner 1)',
  buyerSection: 'بيانات المشتري (العميل — Corner 4)',
  linesSection: 'بنود الفاتورة وفئات ضريبة الإمارات (S / Z / E / O / AE)',
  addLineBtn: 'إضافة بند جديد',
  saveChangesBtn: 'حفظ وإعادة الفحص',
  savingLabel: 'جارٍ الحفظ والفحص...',
  xmlPreviewTitle: 'معاينة مخرجات Peppol UBL 2.1 XML',
  copyXmlBtn: 'نسخ XML',
  pasteXmlTitle: 'استيراد أو لصق ملف UBL 2.1 XML للفحص',
  validateRawXmlBtn: 'فحص XML فقط (بدون حفظ)',
  applyXmlToDossierBtn: 'اعتماد XML في الملف النشط',
  csvBatchTitle: 'مدقق ومطهر بيانات العملاء الدفعي (CSV Bulk Cleaner)',
  csvBatchSubtitle:
    'ارفع أو الصق ملف CSV لقائمة عملائك/مورّديك للتحقق من الـ TRN ذي الـ 15 خانة، واستخراج معرف Peppol 0235:TIN، وتحويل أسماء الإمارات النصية إلى رموز ISO 3166-2:AE مع تعقيم حقن Excel.',
  loadSampleCsvBtn: 'تحميل عينة CSV إماراتية للاختبار',
  runCsvAuditBtn: 'تشغيل تدقيق CSV الآن',
  attachCsvToDossierBtn: 'ربط نتيجة الدفعة بالملف النشط',
  downloadCleanedCsvBtn: 'تنزيل CSV المنظف (UTF-8 BOM)',
  checklistTitle: 'قائمة تحقق جاهزية مزود الخدمة المعتمد (12 بنداً)',
  summaryTitle: 'الملخص التنفيذي للمحاسب / مزود ASP',
  copySummaryBtn: 'نسخ الملخص النصي',
  shaIntegrityTitle: 'سلامة الختم الرقمي SHA-256',
  verifyIntegrityBtn: 'التحقق من البصمة الآن',
  shaMatchLabel: 'البصمة الرقمية مطابقة 100% — لا يوجد أي تلاعب بعد الختم.',
  shaMismatchLabel: 'تحذير: محتوى التقرير لا يطابق بصمة الختم المخزنة!',
  eventsLogTitle: 'سجل أحداث الملف والتدقيق',
  profilesTitle: 'ملفات المنشآت المحفوظة للمورّد',
  profilesSubtitle: 'احفظ بيانات منشأتك (TRN والإمارة والعنوان) لتعبئتها تلقائياً عند إنشاء أو تعديل أي فاتورة.',
  createProfileBtn: 'حفظ كملف منشأة',
  applySellerProfileBtn: 'استخدام كمورّد في الملف النشط',
};

const EN_COPY: UiCopy = {
  brandTitle: 'PINTCheck | UAE E-Invoicing Studio',
  brandSubtitle: 'Pre-Flight PINT-AE / Peppol UBL 2.1 XML Validator, TRN Cleaner & ASP Readiness Studio',
  disclaimerBanner:
    'Regulatory Disclaimer: PINTCheck is an offline/self-hosted pre-flight validator and UBL 2.1 XML preparation studio — it is NOT a UAE MoF Accredited Service Provider (ASP) and does not transmit live invoices over Peppol.',
  disclaimerShort: 'Pre-flight PINT-AE validator — NOT an MoF Accredited Service Provider (ASP)',
  localModeBadge: 'Local Browser Mode ($0)',
  serverModeBadge: 'Connected · SQLite WAL Server',
  navStudio: 'XML Validation Studio',
  navBatchCsv: 'CSV Master-Data Cleaner',
  navReadiness: 'ASP Readiness & PDF',
  navProfiles: 'Company Profiles',
  themePearl: 'Pearl Dirham',
  themeNight: 'Night Terminal',
  langSwitchLabel: 'العربية',
  newFromPreset: 'New UAE Preset',
  importXmlBtn: 'Validate Raw XML',
  searchPlaceholder: 'Search organization, invoice #, or PINT-YYYY...',
  filterAll: 'All',
  filterDraft: 'Drafts',
  filterLocked: 'Finalized PINT-YYYY',
  statsTotal: 'Total Dossiers',
  statsDrafts: 'In Review',
  statsLocked: 'SHA-256 Sealed',
  noDossiersTitle: 'Select a Dossier or Launch a UAE Scenario',
  noDossiersBody: 'Start with Dubai Compliant 380, Abu Dhabi Agency USD Draft Errors, or Sharjah Export Credit Note 381.',
  scoreLabel: 'XML Pass Score',
  readinessLabel: 'ASP Composite Readiness',
  statusPass: 'Aligned for ASP Sandbox Testing',
  statusNeedsFix: 'Remediation Required Before Seal',
  statusNotReady: 'Not Ready — Critical PINT-AE Blockers',
  lockedBadge: 'Finalized & Locked',
  draftBadge: 'Editable Draft',
  finalizeBtn: 'Finalize & Seal PINT-YYYY',
  finalizedNote: 'This dossier is sealed with SHA-256 and locked against edits. Duplicate it to iterate further.',
  duplicateBtn: 'Duplicate as Draft',
  deleteBtn: 'Delete Draft',
  exportXmlBtn: 'Download PINT-AE XML',
  exportIssuesCsvBtn: 'Export Issues CSV (BOM)',
  printPdfBtn: 'Print / A4 PDF Brief',
  copyPublicLinkBtn: 'Copy Public Brief Link',
  copiedToast: 'Copied to clipboard',
  publicViewNotice: 'Public Read-Only ASP Readiness Brief',
  backToStudioBtn: 'Return to PINTCheck Studio',
  aspTimelineTitle: 'UAE MoF Compliance Timeline — Ministerial Decisions 243 & 244 of 2025',
  revenueTierLabel: 'Annual Revenue Tier',
  tierSme: 'SME (< AED 50M)',
  tierLarge: 'Large Businesses (>= AED 50M)',
  aspDeadlineLabel: 'ASP Appointment Deadline',
  goLiveDeadlineLabel: 'Mandatory Go-Live (B2B/B2G)',
  daysRemaining: 'days left',
  issuesTitle: 'PINT-AE Pre-Flight Diagnostic Rules',
  issuesEmpty: 'Clean — all pre-flight PINT-AE & master-data checks passed 100/100.',
  quickFixAllBtn: 'Auto-Fix Common Issues',
  quickFixSingleBtn: 'Quick Fix',
  docHeaderSection: 'Document Header & Currency',
  sellerSection: 'Seller Party (Supplier — Corner 1)',
  buyerSection: 'Buyer Party (Customer — Corner 4)',
  linesSection: 'Line Items & UAE VAT Categories (S / Z / E / O / AE)',
  addLineBtn: 'Add Line Item',
  saveChangesBtn: 'Save & Re-Validate',
  savingLabel: 'Saving & Re-Validating...',
  xmlPreviewTitle: 'Live Peppol UBL 2.1 XML Output',
  copyXmlBtn: 'Copy XML',
  pasteXmlTitle: 'Import or Paste UBL 2.1 XML to Inspect',
  validateRawXmlBtn: 'Dry-Run Validate XML',
  applyXmlToDossierBtn: 'Load XML Into Active Dossier',
  csvBatchTitle: 'Master-Data CSV TRN & Emirate Batch Cleaner',
  csvBatchSubtitle:
    'Upload or paste customer/vendor master CSVs to validate 15-digit UAE TRNs, derive 0235:TIN Peppol IDs, normalize Emirate labels to ISO 3166-2:AE, and export formula-safe UTF-8 BOM CSV.',
  loadSampleCsvBtn: 'Load Sample UAE Customer CSV',
  runCsvAuditBtn: 'Run CSV Batch Audit',
  attachCsvToDossierBtn: 'Attach Audit to Active Dossier',
  downloadCleanedCsvBtn: 'Download Cleaned CSV (UTF-8 BOM)',
  checklistTitle: 'MoF ASP Appointment Readiness Checklist (12 Controls)',
  summaryTitle: 'Executive Readiness Brief for Finance / ASP',
  copySummaryBtn: 'Copy Brief Text',
  shaIntegrityTitle: 'SHA-256 Seal Integrity Verification',
  verifyIntegrityBtn: 'Verify Digest Now',
  shaMatchLabel: 'SHA-256 signature matches canonical record 100% — untampered.',
  shaMismatchLabel: 'Warning: canonical record digest does not match stored SHA-256 seal!',
  eventsLogTitle: 'Audit & Mutation Timeline',
  profilesTitle: 'Saved Seller Company Profiles',
  profilesSubtitle: 'Save reusable UAE legal entity profiles (TRN, ISO Emirate, Address) for fast invoice setup.',
  createProfileBtn: 'Save Company Profile',
  applySellerProfileBtn: 'Apply as Seller to Active Dossier',
};

export function getCopy(locale: Locale): UiCopy {
  return locale === 'ar' ? AR_COPY : EN_COPY;
}

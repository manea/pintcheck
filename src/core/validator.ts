import type {
  AeVatCategoryCode,
  InvoiceCalculationSummary,
  PintInvoiceInput,
  RawXmlMeta,
  TaxCategoryBreakdown,
  ValidationIssue,
  ValidationReport,
} from './types.ts';
import {
  AE_VAT_CATEGORIES,
  PINT_AE_CUSTOMIZATION_ID,
  PINT_AE_ENDPOINT_SCHEME,
  PINT_AE_PROFILE_ID,
  PINT_AE_SELFBILLING_CUSTOMIZATION_ID,
  PINT_DOC_TYPES,
  normalizeEmirateCode,
  validateUaeTrn,
} from './uaeRules.ts';

export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeInvoiceCalculation(invoice: PintInvoiceInput): InvoiceCalculationSummary {
  const fxRate =
    invoice.currency === 'AED'
      ? 1
      : typeof invoice.fxRateToAed === 'number' && invoice.fxRateToAed > 0
        ? invoice.fxRateToAed
        : 0;

  let lineExtensionTotal = 0;
  let totalVat = 0;
  const groupMap = new Map<string, TaxCategoryBreakdown>();

  for (const line of invoice.lines) {
    const qty = Math.max(0, Number(line.quantity) || 0);
    const price = Math.max(0, Number(line.unitPrice) || 0);
    const allowance = Math.max(0, Number(line.lineAllowance) || 0);
    const lineNet = round2(Math.max(0, qty * price - allowance));
    const rate = Number.isFinite(line.vatRatePct) ? line.vatRatePct : 0;
    const lineVat = round2(lineNet * (rate / 100));

    lineExtensionTotal = round2(lineExtensionTotal + lineNet);
    totalVat = round2(totalVat + lineVat);

    const cat: AeVatCategoryCode = line.vatCategory in AE_VAT_CATEGORIES ? line.vatCategory : 'S';
    const key = `${cat}:${rate}`;
    const existing = groupMap.get(key);
    if (existing) {
      existing.taxableAmount = round2(existing.taxableAmount + lineNet);
      existing.taxAmount = round2(existing.taxAmount + lineVat);
    } else {
      groupMap.set(key, {
        vatCategory: cat,
        vatRatePct: rate,
        taxableAmount: lineNet,
        taxAmount: lineVat,
      });
    }
  }

  const taxInclusiveTotal = round2(lineExtensionTotal + totalVat);
  const effectiveFx = invoice.currency === 'AED' ? 1 : fxRate;

  return {
    currency: invoice.currency,
    fxRateToAed: effectiveFx,
    lineExtensionTotal,
    totalVat,
    taxInclusiveTotal,
    payableAmount: taxInclusiveTotal,
    totalVatAed: round2(totalVat * effectiveFx),
    payableAmountAed: round2(taxInclusiveTotal * effectiveFx),
    taxableByCategory: Array.from(groupMap.values()),
  };
}

export function validatePintAeInvoice(
  invoice: PintInvoiceInput,
  rawXmlMeta?: RawXmlMeta,
): ValidationReport {
  const issues: ValidationIssue[] = [];
  const calc = computeInvoiceCalculation(invoice);
  let rulesChecked = 14;

  // 1. Optional Raw XML Root & PINT-AE Identifiers
  if (rawXmlMeta) {
    rulesChecked += 4;
    const expectedCustomId = invoice.selfBilling
      ? PINT_AE_SELFBILLING_CUSTOMIZATION_ID
      : PINT_AE_CUSTOMIZATION_ID;

    if (
      rawXmlMeta.customizationId !== PINT_AE_CUSTOMIZATION_ID &&
      rawXmlMeta.customizationId !== PINT_AE_SELFBILLING_CUSTOMIZATION_ID
    ) {
      issues.push({
        ruleId: 'AE-XML-CUST',
        severity: 'error',
        xpathHint: '/Invoice/cbc:CustomizationID',
        field: 'customizationId',
        titleEn: 'Missing or invalid PINT-AE CustomizationID',
        titleAr: 'معرّف التخصيص PINT-AE مفقود أو غير مطابق',
        detailEn: `Found "${rawXmlMeta.customizationId || '(empty)'}"; expected "${expectedCustomId}".`,
        detailAr: `تم رصد "${rawXmlMeta.customizationId || '(فارغ)'}" والمطلوب "${expectedCustomId}".`,
        fixHintEn: `Set <cbc:CustomizationID>${expectedCustomId}</cbc:CustomizationID>.`,
        fixHintAr: `اضبط العنصر إلى ${expectedCustomId}.`,
      });
    }

    if (rawXmlMeta.profileId !== PINT_AE_PROFILE_ID) {
      issues.push({
        ruleId: 'AE-XML-PROF',
        severity: 'error',
        xpathHint: '/Invoice/cbc:ProfileID',
        field: 'profileId',
        titleEn: 'Invalid Peppol ProfileID',
        titleAr: 'معرّف ملف Peppol غير مطابق',
        detailEn: `Found "${rawXmlMeta.profileId || '(empty)'}"; expected "${PINT_AE_PROFILE_ID}".`,
        detailAr: `تم رصد "${rawXmlMeta.profileId || '(فارغ)'}" والمطلوب "${PINT_AE_PROFILE_ID}".`,
        fixHintEn: `Set <cbc:ProfileID>${PINT_AE_PROFILE_ID}</cbc:ProfileID>.`,
        fixHintAr: `اضبط ProfileID إلى ${PINT_AE_PROFILE_ID}.`,
      });
    }

    if (invoice.currency !== 'AED') {
      if (rawXmlMeta.taxCurrencyCode !== 'AED' || !rawXmlMeta.hasAedTaxTotal) {
        issues.push({
          ruleId: 'AE-XML-TAXAED',
          severity: 'error',
          xpathHint: '/Invoice/cbc:TaxCurrencyCode',
          field: 'taxCurrencyCode',
          titleEn: 'Foreign currency invoice missing TaxCurrencyCode=AED & AED TaxTotal',
          titleAr: 'فاتورة بعملة أجنبية تفتقد عملة الضريبة AED وإجمالي الضريبة بالدرهم',
          detailEn: 'UAE PINT-AE requires TaxCurrencyCode="AED" plus an AED TaxTotal element when DocumentCurrencyCode != AED.',
          detailAr: 'تلزم مواصفة PINT-AE إظهار TaxCurrencyCode=AED وإجمالي ضريبة مكافئ بالدرهم عند الفوترة بعملة أجنبية.',
          fixHintEn: 'Include <cbc:TaxCurrencyCode>AED</cbc:TaxCurrencyCode> and dual <cac:TaxTotal>.',
          fixHintAr: 'أضف وسم TaxCurrencyCode بقيمة AED مع كتلة TaxTotal الثانية بالدرهم.',
        });
      }
    }

    if (
      typeof rawXmlMeta.detectedPayableAmount === 'number' &&
      Math.abs(round2(rawXmlMeta.detectedPayableAmount) - calc.payableAmount) > 0.02
    ) {
      issues.push({
        ruleId: 'AE-MATH-TOTAL',
        severity: 'error',
        xpathHint: '/Invoice/cac:LegalMonetaryTotal/cbc:PayableAmount',
        field: 'payableAmount',
        titleEn: 'Document payable total does not match computed lines + VAT',
        titleAr: 'المبلغ المستحق في XML لا يطابق مجموع البنود والضريبة المحسوب',
        detailEn: `XML PayableAmount (${rawXmlMeta.detectedPayableAmount}) differs from line sum (${calc.payableAmount}).`,
        detailAr: `المبلغ في XML (${rawXmlMeta.detectedPayableAmount}) يختلف عن مجموع البنود والضريبة (${calc.payableAmount}).`,
        fixHintEn: 'Recalculate LegalMonetaryTotal and TaxTotal from rounded line amounts.',
        fixHintAr: 'أعد احتساب LegalMonetaryTotal وTaxTotal من صافي البنود والضريبة.',
      });
    }
  }

  // 2. Document Header Checks
  if (!invoice.invoiceNumber.trim()) {
    issues.push({
      ruleId: 'AE-HDR-ID',
      severity: 'error',
      xpathHint: '/Invoice/cbc:ID',
      field: 'invoiceNumber',
      titleEn: 'Missing Invoice / Document ID',
      titleAr: 'رقم الفاتورة أو المستند مفقود',
      detailEn: 'cbc:ID must contain a unique supplier invoice number.',
      detailAr: 'يجب أن يحتوي الحقل cbc:ID على رقم فاتورة فريد للمورّد.',
      fixHintEn: 'Provide a sequential tax invoice number (e.g. INV-2026-0041).',
      fixHintAr: 'أدخل رقماً تسلسلياً للفاتورة مثل INV-2026-0041.',
    });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoice.issueDate.trim())) {
    issues.push({
      ruleId: 'AE-HDR-DATE',
      severity: 'error',
      xpathHint: '/Invoice/cbc:IssueDate',
      field: 'issueDate',
      titleEn: 'IssueDate must follow YYYY-MM-DD format',
      titleAr: 'تاريخ الإصدار يجب أن يكون بصيغة YYYY-MM-DD',
      detailEn: `Received "${invoice.issueDate}"; ISO 8601 date is mandatory in UBL 2.1.`,
      detailAr: `القيمة "${invoice.issueDate}" لا تطابق الصيغة القياسية YYYY-MM-DD.`,
      fixHintEn: 'Format IssueDate as YYYY-MM-DD.',
      fixHintAr: 'استخدم صيغة YYYY-MM-DD مثل 2026-11-24.',
    });
  }

  if (!invoice.uuid.trim() || invoice.uuid.trim().length < 8) {
    issues.push({
      ruleId: 'AE-HDR-UUID',
      severity: 'error',
      xpathHint: '/Invoice/cbc:UUID',
      field: 'uuid',
      titleEn: 'Missing unique document UUID',
      titleAr: 'المعرّف الفريد للمستند UUID مفقود أو قصير',
      detailEn: 'PINT-AE expects a globally unique UUID per invoice submission.',
      detailAr: 'تشترط مواصفة PINT-AE وجود معرّف UUID فريد لكل فاتورة.',
      fixHintEn: 'Generate a UUID v4 identifier for the document.',
      fixHintAr: 'ولّد معرّف UUID قياسياً للمستند.',
    });
  }

  if (!(invoice.docTypeCode in PINT_DOC_TYPES)) {
    issues.push({
      ruleId: 'AE-HDR-TYPE',
      severity: 'error',
      xpathHint: '/Invoice/cbc:InvoiceTypeCode',
      field: 'docTypeCode',
      titleEn: 'Unsupported UNCL1001 Document Type Code',
      titleAr: 'رمز نوع المستند غير مدعوم ضمن قائمة UNCL1001',
      detailEn: `Type code "${invoice.docTypeCode}" must be 380, 381, 386, or 480.`,
      detailAr: `الرمز "${invoice.docTypeCode}" يجب أن يكون أحد الرموز المعتمدة (380/381/386/480).`,
      fixHintEn: 'Use 380 for Tax Invoice or 381 for Tax Credit Note.',
      fixHintAr: 'اختر 380 للفاتورة الضريبية أو 381 لإشعار الدائن.',
    });
  }

  if (invoice.docTypeCode === '381' && !invoice.precedingInvoiceReference?.trim()) {
    issues.push({
      ruleId: 'AE-CN-REF',
      severity: 'warning',
      xpathHint: '/CreditNote/cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID',
      field: 'precedingInvoiceReference',
      titleEn: 'Credit Note (381) missing Preceding Invoice Reference',
      titleAr: 'إشعار الدائن (381) يفتقد مرجع الفاتورة الأصلية',
      detailEn: 'Credit notes adjusting prior tax supplies should reference the original Tax Invoice ID.',
      detailAr: 'ينبغي ربط إشعار الدائن (381) برقم الفاتورة الضريبية الأصلية.',
      fixHintEn: 'Enter the original invoice number in precedingInvoiceReference.',
      fixHintAr: 'أدخل رقم الفاتورة الضريبية الأصلية في حقل المرجع.',
    });
  }

  // 3. Seller & Buyer TRN + Peppol EndpointID (0235) + ISO Emirate Code Checks
  const partySpecs: Array<{
    role: 'seller' | 'buyer';
    labelEn: string;
    labelAr: string;
    trnRule: string;
    peppolRule: string;
    emirateRule: string;
    xpathPrefix: string;
    party: PintInvoiceInput['seller'];
  }> = [
    {
      role: 'seller',
      labelEn: 'Seller',
      labelAr: 'المورّد (البائع)',
      trnRule: 'AE-TRN-SELLER',
      peppolRule: 'AE-PEPPOL-SELLER',
      emirateRule: 'AE-EMIRATE-SELLER',
      xpathPrefix: 'cac:AccountingSupplierParty/cac:Party',
      party: invoice.seller,
    },
    {
      role: 'buyer',
      labelEn: 'Buyer',
      labelAr: 'المشتري (العميل)',
      trnRule: 'AE-TRN-BUYER',
      peppolRule: 'AE-PEPPOL-BUYER',
      emirateRule: 'AE-EMIRATE-BUYER',
      xpathPrefix: 'cac:AccountingCustomerParty/cac:Party',
      party: invoice.buyer,
    },
  ];

  for (const ps of partySpecs) {
    if (!ps.party.legalName.trim()) {
      issues.push({
        ruleId: `AE-NAME-${ps.role.toUpperCase()}`,
        severity: 'error',
        xpathHint: `${ps.xpathPrefix}/cac:PartyLegalEntity/cbc:RegistrationName`,
        field: `${ps.role}.legalName`,
        titleEn: `${ps.labelEn} registered legal name is required`,
        titleAr: `الاسم القانوني للمنشأة (${ps.labelAr}) مطلوب`,
        detailEn: 'Party legal registration name cannot be empty.',
        detailAr: 'لا يمكن ترك الاسم القانوني فارغاً في مستند PINT-AE.',
        fixHintEn: 'Match the legal entity name on the UAE Trade License / FTA certificate.',
        fixHintAr: 'أدخل الاسم التجاري المطابق للرخصة وشهادة الضريبة.',
      });
    }

    const trnCheck = validateUaeTrn(ps.party.trn);
    if (!trnCheck.valid) {
      issues.push({
        ruleId: ps.trnRule,
        severity: 'error',
        xpathHint: `${ps.xpathPrefix}/cac:PartyTaxScheme/cbc:CompanyID`,
        field: `${ps.role}.trn`,
        titleEn: `Invalid ${ps.labelEn} 15-digit UAE TRN`,
        titleAr: `الرقم الضريبي للمنشأة (${ps.labelAr}) غير صالح`,
        detailEn: trnCheck.reasonEn,
        detailAr: trnCheck.reasonAr,
        fixHintEn: 'Verify the exact 15-digit TRN registered with the UAE FTA.',
        fixHintAr: 'أدخل الرقم الضريبي الصحيح المكوّن من 15 رقماً.',
      });
    } else if (!trnCheck.startsWith100) {
      issues.push({
        ruleId: `${ps.trnRule}-PREFIX`,
        severity: 'warning',
        xpathHint: `${ps.xpathPrefix}/cac:PartyTaxScheme/cbc:CompanyID`,
        field: `${ps.role}.trn`,
        titleEn: `${ps.labelEn} TRN does not start with 100`,
        titleAr: `الرقم الضريبي (${ps.labelAr}) لا يبدأ بـ 100`,
        detailEn: trnCheck.reasonEn,
        detailAr: trnCheck.reasonAr,
        fixHintEn: 'Confirm whether this entity TRN begins with UAE FTA prefix 100.',
        fixHintAr: 'تأكد من صحة الرقم الضريبي المسجل لدى الهيئة الاتحادية للضرائب.',
      });
    }

    const endpoint = String(ps.party.peppolEndpointId ?? '').trim();
    const scheme = String(ps.party.peppolSchemeId ?? '').trim();
    if (scheme !== PINT_AE_ENDPOINT_SCHEME || !/^\d{10}$/.test(endpoint)) {
      issues.push({
        ruleId: ps.peppolRule,
        severity: 'error',
        xpathHint: `${ps.xpathPrefix}/cbc:EndpointID`,
        field: `${ps.role}.peppolEndpointId`,
        titleEn: `${ps.labelEn} Peppol EndpointID must use scheme 0235 & 10-digit TIN`,
        titleAr: `معرّف Peppol (${ps.labelAr}) يجب أن يستخدم الرمز 0235 و10 أرقام`,
        detailEn: `Found scheme="${scheme || '(empty)'}" value="${endpoint || '(empty)'}". Expected schemeID="0235" with the 10-digit TIN.`,
        detailAr: `القيمة الحالية ("${scheme}:${endpoint}")؛ يجب ضبط schemeID="0235" وأول 10 أرقام من TRN.`,
        fixHintEn: trnCheck.derivedTin
          ? `Set schemeID="0235" and EndpointID="${trnCheck.derivedTin}".`
          : 'Derive the 10-digit TIN from the first 10 digits of the 15-digit TRN.',
        fixHintAr: trnCheck.derivedTin
          ? `اضبط schemeID="0235" والقيمة إلى ${trnCheck.derivedTin}.`
          : 'استخرج أول 10 أرقام من الرقم الضريبي كمعرّف TIN.',
      });
    } else if (trnCheck.valid && endpoint !== trnCheck.derivedTin) {
      issues.push({
        ruleId: `${ps.peppolRule}-MISMATCH`,
        severity: 'error',
        xpathHint: `${ps.xpathPrefix}/cbc:EndpointID`,
        field: `${ps.role}.peppolEndpointId`,
        titleEn: `${ps.labelEn} Peppol 10-digit TIN does not match first 10 digits of TRN`,
        titleAr: `معرّف Peppol (${ps.labelAr}) لا يطابق أول 10 أرقام من الرقم الضريبي`,
        detailEn: `EndpointID="${endpoint}" differs from TRN prefix "${trnCheck.derivedTin}".`,
        detailAr: `القيمة "${endpoint}" تختلف عن أول 10 خانات في TRN (${trnCheck.derivedTin}).`,
        fixHintEn: `Update EndpointID to "${trnCheck.derivedTin}".`,
        fixHintAr: `عدّل EndpointID إلى ${trnCheck.derivedTin}.`,
      });
    }

    const emirateNorm = normalizeEmirateCode(ps.party.emirateCode);
    if (!emirateNorm.validIsoCode) {
      issues.push({
        ruleId: ps.emirateRule,
        severity: 'error',
        xpathHint: `${ps.xpathPrefix}/cac:PostalAddress/cbc:CountrySubentityCode`,
        field: `${ps.role}.emirateCode`,
        titleEn: `${ps.labelEn} Emirate must be an ISO 3166-2:AE code (not free text)`,
        titleAr: `رمز الإمارة (${ps.labelAr}) يجب أن يكون رمز ISO رسمي لا نصاً حراً`,
        detailEn: emirateNorm.suggestedCode
          ? `Free text "${ps.party.emirateCode}" fails PINT-AE; map to "${emirateNorm.suggestedCode}".`
          : `Unrecognized CountrySubentityCode "${ps.party.emirateCode}"; expected AE-AZ/DU/SH/AJ/UQ/RK/FU.`,
        detailAr: emirateNorm.suggestedCode
          ? `النص "${ps.party.emirateCode}" غير مقبول في PINT-AE؛ استبدله بالرمز ${emirateNorm.suggestedCode}.`
          : `القيمة "${ps.party.emirateCode}" غير صالحة؛ استخدم أحد الرموز AE-AZ إلى AE-FU.`,
        fixHintEn: emirateNorm.suggestedCode
          ? `Replace "${ps.party.emirateCode}" with "${emirateNorm.suggestedCode}".`
          : 'Select an official UAE Emirate code (e.g. AE-DU or AE-AZ).',
        fixHintAr: emirateNorm.suggestedCode
          ? `استبدل "${ps.party.emirateCode}" بالرمز ${emirateNorm.suggestedCode}.`
          : 'اختر رمز ISO للإمارة مثل AE-DU أو AE-AZ.',
      });
    }
  }

  // 4. FX Equivalent Requirement when Currency != AED
  if (invoice.currency !== 'AED' && (!invoice.fxRateToAed || invoice.fxRateToAed <= 0)) {
    issues.push({
      ruleId: 'AE-FX-AED',
      severity: 'error',
      xpathHint: '/Invoice/cbc:TaxCurrencyCode',
      field: 'fxRateToAed',
      titleEn: `Missing AED exchange rate for ${invoice.currency} invoice`,
      titleAr: `سعر الصرف إلى الدرهم (AED) مفقود للفاتورة بعملة ${invoice.currency}`,
      detailEn: 'UAE VAT law & PINT-AE require displaying VAT & equivalent values in AED using the UAE Central Bank exchange rate.',
      detailAr: 'يتطلب النظام الإماراتي احتساب وعرض ضريبة القيمة المضافة بالدرهم وفق سعر صرف المصرف المركزي.',
      fixHintEn: `Specify positive fxRateToAed (e.g. 3.6725 for USD).`,
      fixHintAr: 'أدخل سعر الصرف إلى الدرهم (مثلاً 3.6725 للدولار).',
    });
  }

  // 5. Line Items & VAT Category Rules
  if (invoice.lines.length === 0) {
    issues.push({
      ruleId: 'AE-LINES-EMPTY',
      severity: 'error',
      xpathHint: '/Invoice/cac:InvoiceLine',
      field: 'lines',
      titleEn: 'At least one invoice line item is required',
      titleAr: 'يجب إضافة بند واحد على الأقل في الفاتورة',
      detailEn: 'Empty invoice documents fail UBL 2.1 schema validation.',
      detailAr: 'الفاتورة الخالية من البنود تفشل في التحقق البنيوي لـ UBL 2.1.',
      fixHintEn: 'Add at least one line item with quantity > 0.',
      fixHintAr: 'أضف بنداً واحداً على الأقل بكمية وسعر صالحين.',
    });
  } else {
    for (let i = 0; i < invoice.lines.length; i += 1) {
      const line = invoice.lines[i]!;
      const lineNum = i + 1;
      const meta = AE_VAT_CATEGORIES[line.vatCategory];

      if (!line.description.trim()) {
        issues.push({
          ruleId: 'AE-LINE-DESC',
          severity: 'error',
          xpathHint: `/Invoice/cac:InvoiceLine[${lineNum}]/cac:Item/cbc:Name`,
          field: `lines[${i}].description`,
          titleEn: `Line ${lineNum} is missing item description`,
          titleAr: `البند #${lineNum} يفتقد وصف الخدمة أو السلعة`,
          detailEn: 'Every InvoiceLine requires an item name/description.',
          detailAr: 'يجب كتابة وصف واضح في كل بند فاتورة.',
          fixHintEn: 'Add a concise item or service name.',
          fixHintAr: 'أدخل اسم ووصف البند.',
        });
      }

      if (meta && meta.expectedRatePct !== null && Math.abs(line.vatRatePct - meta.expectedRatePct) > 0.01) {
        issues.push({
          ruleId: 'AE-TAX-RATE',
          severity: 'error',
          xpathHint: `/Invoice/cac:InvoiceLine[${lineNum}]/cac:Item/cac:ClassifiedTaxCategory/cbc:Percent`,
          field: `lines[${i}].vatRatePct`,
          titleEn: `Line ${lineNum}: VAT category "${line.vatCategory}" conflicts with ${line.vatRatePct}% rate`,
          titleAr: `البند #${lineNum}: فئة الضريبة "${line.vatCategory}" لا تتوافق مع نسبة ${line.vatRatePct}%`,
          detailEn: `Category "${line.vatCategory}" requires ${meta.expectedRatePct}% VAT (found ${line.vatRatePct}%).`,
          detailAr: `الفئة "${line.vatCategory}" تتطلب نسبة ${meta.expectedRatePct}% ضريبة (القيمة الحالية ${line.vatRatePct}%).`,
          fixHintEn: `Change VAT rate to ${meta.expectedRatePct}% or update the VAT category code.`,
          fixHintAr: `عدّل نسبة الضريبة إلى ${meta.expectedRatePct}% أو غيّر رمز الفئة.`,
        });
      }

      if (meta?.requiresExemptionReason && !line.exemptionReasonText?.trim()) {
        issues.push({
          ruleId: 'AE-TAX-EXEMPT-REASON',
          severity: 'warning',
          xpathHint: `/Invoice/cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:TaxExemptionReason`,
          field: `lines[${i}].exemptionReasonText`,
          titleEn: `Line ${lineNum}: Category "${line.vatCategory}" needs exemption reason`,
          titleAr: `البند #${lineNum}: الفئة "${line.vatCategory}" تتطلب توضيح سبب الإعفاء/الخروج عن النطاق`,
          detailEn: 'ALIGNED-IBRP-AE rules recommend explicit TaxExemptionReason text for E and O categories.',
          detailAr: 'توصي قواعد PINT-AE بكتابة سبب الإعفاء الضريبي بوضوح للفئتين E وO.',
          fixHintEn: 'Add TaxExemptionReasonText (e.g. Article 46 UAE VAT Decree-Law).',
          fixHintAr: 'أضف نص سبب الإعفاء الضريبي وفق المرسوم بقانون الاتحادي.',
        });
      }
    }
  }

  let errorsCount = 0;
  let warningsCount = 0;
  let infoCount = 0;
  for (const issue of issues) {
    if (issue.severity === 'error') errorsCount += 1;
    else if (issue.severity === 'warning') warningsCount += 1;
    else infoCount += 1;
  }

  const penalty = errorsCount * 14 + warningsCount * 4;
  const passScore = Math.max(0, Math.min(100, 100 - penalty));

  return {
    valid: errorsCount === 0,
    passScore,
    errorsCount,
    warningsCount,
    infoCount,
    rulesChecked,
    issues,
    calculation: calc,
  };
}

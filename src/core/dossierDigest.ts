import type { Locale, PintCheckDossier } from './types.ts';

export function buildDossierCanonicalText(dossier: PintCheckDossier): string {
  const payload = {
    dossierNumber: dossier.dossierNumber ?? null,
    organizationName: dossier.organizationName,
    organizationTrn: dossier.organizationTrn,
    revenueTier: dossier.revenueTier,
    referenceDate: dossier.referenceDate,
    invoice: {
      invoiceNumber: dossier.invoice.invoiceNumber,
      uuid: dossier.invoice.uuid,
      issueDate: dossier.invoice.issueDate,
      docTypeCode: dossier.invoice.docTypeCode,
      currency: dossier.invoice.currency,
      fxRateToAed: dossier.invoice.fxRateToAed ?? 1,
      seller: {
        legalName: dossier.invoice.seller.legalName,
        trn: dossier.invoice.seller.trn,
        peppolSchemeId: dossier.invoice.seller.peppolSchemeId,
        peppolEndpointId: dossier.invoice.seller.peppolEndpointId,
        emirateCode: dossier.invoice.seller.emirateCode,
      },
      buyer: {
        legalName: dossier.invoice.buyer.legalName,
        trn: dossier.invoice.buyer.trn,
        peppolSchemeId: dossier.invoice.buyer.peppolSchemeId,
        peppolEndpointId: dossier.invoice.buyer.peppolEndpointId,
        emirateCode: dossier.invoice.buyer.emirateCode,
      },
      lines: dossier.invoice.lines.map((l) => ({
        id: l.id,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        vatCategory: l.vatCategory,
        vatRatePct: l.vatRatePct,
      })),
    },
    validation: {
      valid: dossier.validation.valid,
      passScore: dossier.validation.passScore,
      errorsCount: dossier.validation.errorsCount,
      warningsCount: dossier.validation.warningsCount,
      calculation: dossier.validation.calculation,
    },
    readinessSummary: {
      compositeScore: dossier.readinessSummary.compositeScore,
      checklistScore: dossier.readinessSummary.checklistScore,
      status: dossier.readinessSummary.status,
    },
  };
  return JSON.stringify(payload);
}

export async function computeDossierDigestHex(dossier: PintCheckDossier): Promise<string> {
  const canonical = buildDossierCanonicalText(dossier);
  const bytes = new TextEncoder().encode(canonical);
  const hashBuf = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyDossierIntegrity(
  dossier: PintCheckDossier,
): Promise<{ valid: boolean; computedHex: string }> {
  const computedHex = await computeDossierDigestHex(dossier);
  if (!dossier.scopeDigestHex) {
    return { valid: false, computedHex };
  }
  return {
    valid: computedHex === dossier.scopeDigestHex,
    computedHex,
  };
}

export function buildExecutiveSummaryText(dossier: PintCheckDossier, locale: Locale): string {
  const { validation, readinessSummary, invoice } = dossier;
  const { milestones } = readinessSummary;
  const calc = validation.calculation;

  if (locale === 'ar') {
    const statusAr = validation.valid
      ? 'جاهزة مبدئياً لصيغة PINT-AE UBL 2.1'
      : `تتطلب معالجة (${validation.errorsCount} خطأ / ${validation.warningsCount} تنبيه)`;
    return [
      `ملخص جاهزية الفوترة الإلكترونية الإماراتية PINT-AE (${dossier.dossierNumber || dossier.organizationName})`,
      `المنشأة: ${dossier.organizationName} | الرقم الضريبي: ${dossier.organizationTrn}`,
      `- فاتورة الفحص: ${invoice.invoiceNumber} (${invoice.docTypeCode}) | الإجمالي: ${calc.currency} ${calc.payableAmount.toFixed(2)} (المكافئ: AED ${calc.payableAmountAed.toFixed(2)})`,
      `- نتيجة التحقق الهيكلي XML: ${validation.passScore}/100 — ${statusAr}`,
      `- الجاهزية الإجمالية لمزود الخدمة ASP: ${readinessSummary.compositeScore}/100 (${readinessSummary.passedChecksCount}/${readinessSummary.totalChecksCount} بنداً مكتملاً)`,
      `- المواعيد النظامية (القراران 243 و244): موعد تعيين ASP ${milestones.aspAppointmentDeadline} (متبقٍ ${milestones.daysUntilAspAppointment} يوماً) | الإلزام الفعلي ${milestones.mandatoryGoLiveDate}`,
      validation.issues.length > 0
        ? `أولويات التصحيح:\n${validation.issues
            .slice(0, 4)
            .map((iss, idx) => `${idx + 1}. [${iss.ruleId}] ${iss.titleAr}: ${iss.fixHintAr}`)
            .join('\n')}`
        : 'لا توجد أخطاء بنيوية في نموذج الفاتورة المفحوص.',
      'تنويه: هذه وثيقة فحص مسبق وتجهيز بيانات — PINTCheck ليس مزود خدمة معتمد (ASP) لدى وزارة المالية.',
    ].join('\n');
  }

  const statusEn = validation.valid
    ? 'Structurally aligned with PINT-AE UBL 2.1 pre-flight rules'
    : `Needs remediation (${validation.errorsCount} errors / ${validation.warningsCount} warnings)`;
  return [
    `UAE E-Invoicing PINT-AE Readiness Summary (${dossier.dossierNumber || dossier.organizationName})`,
    `Organization: ${dossier.organizationName} | Seller TRN: ${dossier.organizationTrn}`,
    `- Audited Invoice: ${invoice.invoiceNumber} (${invoice.docTypeCode}) | Payable: ${calc.currency} ${calc.payableAmount.toFixed(2)} (AED ${calc.payableAmountAed.toFixed(2)})`,
    `- Pre-Flight XML Score: ${validation.passScore}/100 — ${statusEn}`,
    `- Composite ASP Readiness: ${readinessSummary.compositeScore}/100 (${readinessSummary.passedChecksCount}/${readinessSummary.totalChecksCount} checks verified)`,
    `- UAE MoF Timeline: ASP Appointment ${milestones.aspAppointmentDeadline} (${milestones.daysUntilAspAppointment}d left) | Go-Live ${milestones.mandatoryGoLiveDate}`,
    validation.issues.length > 0
      ? `Top Remediation Actions:\n${validation.issues
          .slice(0, 4)
          .map((iss, idx) => `${idx + 1}. [${iss.ruleId}] ${iss.titleEn}: ${iss.fixHintEn}`)
          .join('\n')}`
      : 'Zero schema or master-data blockers detected in the audited document.',
    'Disclaimer: Pre-flight PINT-AE validator & readiness brief — NOT an MoF Accredited Service Provider (ASP).',
  ].join('\n');
}

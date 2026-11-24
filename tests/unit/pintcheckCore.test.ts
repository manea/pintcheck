import { describe, expect, it } from 'vitest';
import {
  auditMasterDataCsv,
  buildCleanedMasterDataCsv,
} from '../../src/core/batchCsv.ts';
import {
  buildExecutiveSummaryText,
  computeDossierDigestHex,
  verifyDossierIntegrity,
} from '../../src/core/dossierDigest.ts';
import { createDossierFromPreset } from '../../src/core/presets.ts';
import {
  buildDefaultAspReadinessChecks,
  computeReadinessSummary,
} from '../../src/core/readiness.ts';
import {
  PINT_AE_CUSTOMIZATION_ID,
  PINT_AE_PROFILE_ID,
  UAE_EMIRATES,
  getTimelineMilestones,
  normalizeEmirateCode,
  validateUaeTrn,
} from '../../src/core/uaeRules.ts';
import {
  PintCheckCoreError,
  generatePintAeXml,
  parsePintAeXml,
} from '../../src/core/ublXml.ts';
import {
  computeInvoiceCalculation,
  validatePintAeInvoice,
} from '../../src/core/validator.ts';

describe('PINTCheck UAE PINT-AE / UBL 2.1 Core Engine', () => {
  it('validates 15-digit UAE TRNs, derives 10-digit 0235 TIN, and normalizes all 7 Emirate ISO codes', () => {
    const valid = validateUaeTrn('100-4512 89100003');
    expect(valid.valid).toBe(true);
    expect(valid.normalized).toBe('100451289100003');
    expect(valid.derivedTin).toBe('1004512891');
    expect(valid.startsWith100).toBe(true);

    const shortTrn = validateUaeTrn('10044556677889');
    expect(shortTrn.valid).toBe(false);

    const alphaTrn = validateUaeTrn('100ABC566778890');
    expect(alphaTrn.valid).toBe(false);

    expect(UAE_EMIRATES).toHaveLength(7);
    for (const em of UAE_EMIRATES) {
      const exact = normalizeEmirateCode(em.code);
      expect(exact.validIsoCode).toBe(em.code);
      expect(exact.wasFreeText).toBe(false);
    }

    const freeDubai = normalizeEmirateCode('Dubai');
    expect(freeDubai.validIsoCode).toBeNull();
    expect(freeDubai.suggestedCode).toBe('AE-DU');
    expect(freeDubai.wasFreeText).toBe(true);

    const freeAbuDhabiAr = normalizeEmirateCode('أبوظبي');
    expect(freeAbuDhabiAr.validIsoCode).toBeNull();
    expect(freeAbuDhabiAr.suggestedCode).toBe('AE-AZ');
  });

  it('passes compliant Dubai B2B preset with 100/100 score and exact 5% VAT totals', () => {
    const dossier = createDossierFromPreset('dubai-trading-compliant', '2026-11-24');
    expect(dossier.validation.valid).toBe(true);
    expect(dossier.validation.passScore).toBe(100);
    expect(dossier.validation.errorsCount).toBe(0);
    expect(dossier.validation.warningsCount).toBe(0);

    // Lines: (10 * 1200) + 3500 = 15,500 net; 5% VAT = 775; total = 16,275 AED
    expect(dossier.validation.calculation.lineExtensionTotal).toBe(15500);
    expect(dossier.validation.calculation.totalVat).toBe(775);
    expect(dossier.validation.calculation.payableAmount).toBe(16275);
    expect(dossier.validation.calculation.payableAmountAed).toBe(16275);
  });

  it('detects common pre-flight errors in Abu Dhabi error preset (TRN, ISO Emirate, Peppol TIN, FX AED & VAT rate)', () => {
    const dossier = createDossierFromPreset('abudhabi-agency-errors', '2026-11-24');
    expect(dossier.validation.valid).toBe(false);
    expect(dossier.validation.errorsCount).toBeGreaterThanOrEqual(6);

    const ids = dossier.validation.issues.map((i) => i.ruleId);
    expect(ids).toContain('AE-EMIRATE-SELLER');
    expect(ids).toContain('AE-EMIRATE-BUYER');
    expect(ids).toContain('AE-TRN-BUYER');
    expect(ids).toContain('AE-PEPPOL-BUYER');
    expect(ids).toContain('AE-FX-AED');
    expect(ids).toContain('AE-TAX-RATE');
  });

  it('generates safe UBL 2.1 PINT-AE XML for 380 Invoice, 381 CreditNote, and foreign-currency dual AED TaxTotal', () => {
    const base = createDossierFromPreset('dubai-trading-compliant');
    const injected = structuredClone(base.invoice);
    injected.note = '<script>alert("xss")</script> & Commercial Supply';

    const calc = computeInvoiceCalculation(injected);
    const xml380 = generatePintAeXml(injected, calc);

    expect(xml380).toContain(`<cbc:CustomizationID>${PINT_AE_CUSTOMIZATION_ID}</cbc:CustomizationID>`);
    expect(xml380).toContain(`<cbc:ProfileID>${PINT_AE_PROFILE_ID}</cbc:ProfileID>`);
    expect(xml380).toContain('<cbc:EndpointID schemeID="0235">1004512891</cbc:EndpointID>');
    expect(xml380).toContain('<cbc:CountrySubentityCode>AE-DU</cbc:CountrySubentityCode>');
    expect(xml380).toContain('<cbc:CountrySubentityCode>AE-AZ</cbc:CountrySubentityCode>');
    expect(xml380).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; Commercial Supply');
    expect(xml380).not.toContain('<script>');

    // 381 CreditNote + USD with FX 3.6725 -> dual <cac:TaxTotal> in AED
    const cnDossier = createDossierFromPreset('sharjah-export-credit-note');
    const usdCreditNote = structuredClone(cnDossier.invoice);
    usdCreditNote.currency = 'USD';
    usdCreditNote.fxRateToAed = 3.6725;
    const cnCalc = computeInvoiceCalculation(usdCreditNote);
    const xml381 = generatePintAeXml(usdCreditNote, cnCalc);

    expect(xml381).toContain('<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"');
    expect(xml381).toContain('<cbc:CreditNoteTypeCode name="00000000">381</cbc:CreditNoteTypeCode>');
    expect(xml381).toContain('<cbc:DocumentCurrencyCode>USD</cbc:DocumentCurrencyCode>');
    expect(xml381).toContain('<cbc:TaxCurrencyCode>AED</cbc:TaxCurrencyCode>');
    expect(xml381).toContain('<cbc:TaxAmount currencyID="USD">120.00</cbc:TaxAmount>');
    expect(xml381).toContain(`<cbc:TaxAmount currencyID="AED">${cnCalc.totalVatAed.toFixed(2)}</cbc:TaxAmount>`);
  });

  it('parses valid UBL 2.1 XML back into structured validation cleanly and blocks XXE DTD payloads', () => {
    const dossier = createDossierFromPreset('dubai-trading-compliant');
    const parsed = parsePintAeXml(dossier.rawXmlSource!);
    const revalidated = validatePintAeInvoice(parsed.invoice, parsed.rawXmlMeta);

    expect(parsed.rawXmlMeta.rootElement).toBe('Invoice');
    expect(revalidated.valid).toBe(true);
    expect(revalidated.passScore).toBe(100);
    expect(revalidated.calculation.payableAmount).toBe(16275);

    const xxePayload = `<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<Invoice><cbc:ID>&xxe;</cbc:ID></Invoice>`;

    expect(() => parsePintAeXml(xxePayload)).toThrow(PintCheckCoreError);
    try {
      parsePintAeXml(xxePayload);
    } catch (err) {
      expect((err as PintCheckCoreError).code).toBe('XXE_BLOCKED');
    }
  });

  it('audits buyer master-data CSV rows and neutralizes CSV formula injection in BOM exports', () => {
    const csv = [
      'Company,TRN,Emirate,Currency,VAT_Rate',
      'Al Noor Trading LLC,100112233400003,AE-DU,AED,5',
      'Oasis Services LLC,100223344500003,Dubai,AED,5',
      '=CMD("calc") Bad Co,1004455,Sharjah,AED,15',
    ].join('\n');

    const audit = auditMasterDataCsv(csv);
    expect(audit.totalRows).toBe(3);
    expect(audit.validRowsCount).toBe(1);
    expect(audit.fixableRowsCount).toBe(1);
    expect(audit.invalidRowsCount).toBe(1);
    expect(audit.rows[1]!.suggestedEmirateCode).toBe('AE-DU');
    expect(audit.rows[0]!.derivedPeppolEndpoint).toBe('0235:1001122334');

    const cleanedCsv = buildCleanedMasterDataCsv(audit, 'en');
    expect(cleanedCsv.startsWith('\uFEFF')).toBe(true);
    expect(cleanedCsv).toContain("'=CMD");
    expect(cleanedCsv).toContain('0235:1001122334');
  });

  it('computes 2027 SME compliance milestones and composite ASP readiness score', () => {
    const milestones = getTimelineMilestones('sme_under_50m', '2026-11-24');
    expect(milestones.aspAppointmentDeadline).toBe('2027-03-31');
    expect(milestones.mandatoryGoLiveDate).toBe('2027-07-01');
    expect(milestones.daysUntilAspAppointment).toBe(127);
    expect(milestones.daysUntilGoLive).toBe(219);

    const dossier = createDossierFromPreset('dubai-trading-compliant', '2026-11-24');
    const allPassChecks = buildDefaultAspReadinessChecks(
      dossier.readinessChecks.map((c) => ({ id: c.id, status: 'pass' })),
    );
    const summary = computeReadinessSummary(
      dossier.validation,
      allPassChecks,
      'sme_under_50m',
      '2026-11-24',
    );
    expect(summary.compositeScore).toBe(100);
    expect(summary.status).toBe('ready_for_asp_sandbox');
    expect(summary.passedChecksCount).toBe(12);
  });

  it('seals PINT-YYYY-0001 dossier with SHA-256 fingerprint, detects tampering, and builds executive brief', async () => {
    const dossier = createDossierFromPreset('dubai-trading-compliant', '2026-11-24');
    dossier.dossierNumber = 'PINT-2026-0001';
    dossier.status = 'locked';
    dossier.scopeDigestHex = await computeDossierDigestHex(dossier);

    expect(dossier.scopeDigestHex).toMatch(/^[0-9a-f]{64}$/);
    const cleanVerify = await verifyDossierIntegrity(dossier);
    expect(cleanVerify.valid).toBe(true);

    const summaryAr = buildExecutiveSummaryText(dossier, 'ar');
    expect(summaryAr).toContain('PINT-2026-0001');
    expect(summaryAr).toContain('ليس مزود خدمة معتمد');

    // Mutate buyer TRN -> tamper verification must fail
    dossier.invoice.buyer.trn = '100000000000000';
    const tamperedVerify = await verifyDossierIntegrity(dossier);
    expect(tamperedVerify.valid).toBe(false);
  });
});

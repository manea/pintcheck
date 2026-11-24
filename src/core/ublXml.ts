import type {
  AeVatCategoryCode,
  CurrencyCode,
  InvoiceCalculationSummary,
  PintDocTypeCode,
  PintInvoiceInput,
  PintInvoiceLine,
  PintParty,
  RawXmlMeta,
} from './types.ts';
import {
  PINT_AE_CUSTOMIZATION_ID,
  PINT_AE_ENDPOINT_SCHEME,
  PINT_AE_PROFILE_ID,
  PINT_AE_SELFBILLING_CUSTOMIZATION_ID,
} from './uaeRules.ts';

export class PintCheckCoreError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'PintCheckCoreError';
    this.code = code;
  }
}

export function escapeXml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildPartyXml(party: PintParty, roleTag: 'cac:AccountingSupplierParty' | 'cac:AccountingCustomerParty'): string {
  const scheme = party.peppolSchemeId || PINT_AE_ENDPOINT_SCHEME;
  return [
    `  <${roleTag}>`,
    '    <cac:Party>',
    `      <cbc:EndpointID schemeID="${escapeXml(scheme)}">${escapeXml(party.peppolEndpointId)}</cbc:EndpointID>`,
    '      <cac:PartyIdentification>',
    `        <cbc:ID schemeID="${escapeXml(scheme)}">${escapeXml(party.peppolEndpointId)}</cbc:ID>`,
    '      </cac:PartyIdentification>',
    '      <cac:PostalAddress>',
    `        <cbc:StreetName>${escapeXml(party.streetAddress || 'Business Street')}</cbc:StreetName>`,
    `        <cbc:CityName>${escapeXml(party.city || 'Dubai')}</cbc:CityName>`,
    ...(party.postalCode ? [`        <cbc:PostalZone>${escapeXml(party.postalCode)}</cbc:PostalZone>`] : []),
    `        <cbc:CountrySubentityCode>${escapeXml(party.emirateCode)}</cbc:CountrySubentityCode>`,
    '        <cac:Country>',
    `          <cbc:IdentificationCode>${escapeXml(party.countryCode || 'AE')}</cbc:IdentificationCode>`,
    '        </cac:Country>',
    '      </cac:PostalAddress>',
    '      <cac:PartyTaxScheme>',
    `        <cbc:CompanyID>${escapeXml(party.trn)}</cbc:CompanyID>`,
    '        <cac:TaxScheme>',
    '          <cbc:ID>VAT</cbc:ID>',
    '        </cac:TaxScheme>',
    '      </cac:PartyTaxScheme>',
    '      <cac:PartyLegalEntity>',
    `        <cbc:RegistrationName>${escapeXml(party.legalName)}</cbc:RegistrationName>`,
    '      </cac:PartyLegalEntity>',
    ...(party.contactEmail
      ? [
          '      <cac:Contact>',
          `        <cbc:ElectronicMail>${escapeXml(party.contactEmail)}</cbc:ElectronicMail>`,
          '      </cac:Contact>',
        ]
      : []),
    '    </cac:Party>',
    `  </${roleTag}>`,
  ].join('\n');
}

export function generatePintAeXml(
  invoice: PintInvoiceInput,
  calc: InvoiceCalculationSummary,
): string {
  const isCreditNote = invoice.docTypeCode === '381';
  const rootTag = isCreditNote ? 'CreditNote' : 'Invoice';
  const rootNs = isCreditNote
    ? 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2'
    : 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
  const lineTag = isCreditNote ? 'cac:CreditNoteLine' : 'cac:InvoiceLine';
  const qtyTag = isCreditNote ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity';
  const typeTag = isCreditNote ? 'cbc:CreditNoteTypeCode' : 'cbc:InvoiceTypeCode';
  const customId = invoice.selfBilling
    ? PINT_AE_SELFBILLING_CUSTOMIZATION_ID
    : PINT_AE_CUSTOMIZATION_ID;
  const currency = invoice.currency;

  const linesXml = invoice.lines
    .map((line) => {
      const qty = Math.max(0, Number(line.quantity) || 0);
      const price = Math.max(0, Number(line.unitPrice) || 0);
      const allowance = Math.max(0, Number(line.lineAllowance) || 0);
      const lineNet = Math.round((Math.max(0, qty * price - allowance) + Number.EPSILON) * 100) / 100;

      return [
        `  <${lineTag}>`,
        `    <cbc:ID>${escapeXml(line.id)}</cbc:ID>`,
        `    <${qtyTag} unitCode="${escapeXml(line.unitCode || 'EA')}">${qty}</${qtyTag}>`,
        `    <cbc:LineExtensionAmount currencyID="${escapeXml(currency)}">${lineNet.toFixed(2)}</cbc:LineExtensionAmount>`,
        '    <cac:Item>',
        `      <cbc:Description>${escapeXml(line.description)}</cbc:Description>`,
        `      <cbc:Name>${escapeXml(line.description.slice(0, 80))}</cbc:Name>`,
        '      <cac:ClassifiedTaxCategory>',
        `        <cbc:ID>${escapeXml(line.vatCategory)}</cbc:ID>`,
        `        <cbc:Percent>${Number(line.vatRatePct || 0).toFixed(2)}</cbc:Percent>`,
        '        <cac:TaxScheme>',
        '          <cbc:ID>VAT</cbc:ID>',
        '        </cac:TaxScheme>',
        '      </cac:ClassifiedTaxCategory>',
        '    </cac:Item>',
        '    <cac:Price>',
        `      <cbc:PriceAmount currencyID="${escapeXml(currency)}">${price.toFixed(2)}</cbc:PriceAmount>`,
        '    </cac:Price>',
        `  </${lineTag}>`,
      ].join('\n');
    })
    .join('\n');

  const subtotalsXml = calc.taxableByCategory
    .map((grp) => {
      const reasonLine = invoice.lines.find(
        (l) => l.vatCategory === grp.vatCategory && l.exemptionReasonText?.trim(),
      );
      return [
        '    <cac:TaxSubtotal>',
        `      <cbc:TaxableAmount currencyID="${escapeXml(currency)}">${grp.taxableAmount.toFixed(2)}</cbc:TaxableAmount>`,
        `      <cbc:TaxAmount currencyID="${escapeXml(currency)}">${grp.taxAmount.toFixed(2)}</cbc:TaxAmount>`,
        '      <cac:TaxCategory>',
        `        <cbc:ID>${escapeXml(grp.vatCategory)}</cbc:ID>`,
        `        <cbc:Percent>${grp.vatRatePct.toFixed(2)}</cbc:Percent>`,
        ...(reasonLine?.exemptionReasonCode
          ? [`        <cbc:TaxExemptionReasonCode>${escapeXml(reasonLine.exemptionReasonCode)}</cbc:TaxExemptionReasonCode>`]
          : []),
        ...(reasonLine?.exemptionReasonText
          ? [`        <cbc:TaxExemptionReason>${escapeXml(reasonLine.exemptionReasonText)}</cbc:TaxExemptionReason>`]
          : []),
        '        <cac:TaxScheme>',
        '          <cbc:ID>VAT</cbc:ID>',
        '        </cac:TaxScheme>',
        '      </cac:TaxCategory>',
        '    </cac:TaxSubtotal>',
      ].join('\n');
    })
    .join('\n');

  const aedSecondTaxTotal =
    currency !== 'AED'
      ? [
          '  <cac:TaxTotal>',
          `    <cbc:TaxAmount currencyID="AED">${calc.totalVatAed.toFixed(2)}</cbc:TaxAmount>`,
          '  </cac:TaxTotal>',
        ].join('\n')
      : '';

  const flags = invoice.transactionFlags || '00000000';

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<${rootTag} xmlns="${rootNs}" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">`,
    `  <cbc:CustomizationID>${escapeXml(customId)}</cbc:CustomizationID>`,
    `  <cbc:ProfileID>${escapeXml(PINT_AE_PROFILE_ID)}</cbc:ProfileID>`,
    `  <cbc:ID>${escapeXml(invoice.invoiceNumber)}</cbc:ID>`,
    `  <cbc:UUID>${escapeXml(invoice.uuid)}</cbc:UUID>`,
    `  <cbc:IssueDate>${escapeXml(invoice.issueDate)}</cbc:IssueDate>`,
    ...(invoice.dueDate && !isCreditNote
      ? [`  <cbc:DueDate>${escapeXml(invoice.dueDate)}</cbc:DueDate>`]
      : []),
    `  <${typeTag} name="${escapeXml(flags)}">${escapeXml(invoice.docTypeCode)}</${typeTag}>`,
    ...(invoice.note ? [`  <cbc:Note>${escapeXml(invoice.note)}</cbc:Note>`] : []),
    `  <cbc:DocumentCurrencyCode>${escapeXml(currency)}</cbc:DocumentCurrencyCode>`,
    '  <cbc:TaxCurrencyCode>AED</cbc:TaxCurrencyCode>',
    ...(isCreditNote && invoice.precedingInvoiceReference
      ? [
          '  <cac:BillingReference>',
          '    <cac:InvoiceDocumentReference>',
          `      <cbc:ID>${escapeXml(invoice.precedingInvoiceReference)}</cbc:ID>`,
          '    </cac:InvoiceDocumentReference>',
          '  </cac:BillingReference>',
        ]
      : []),
    buildPartyXml(invoice.seller, 'cac:AccountingSupplierParty'),
    buildPartyXml(invoice.buyer, 'cac:AccountingCustomerParty'),
    '  <cac:TaxTotal>',
    `    <cbc:TaxAmount currencyID="${escapeXml(currency)}">${calc.totalVat.toFixed(2)}</cbc:TaxAmount>`,
    subtotalsXml,
    '  </cac:TaxTotal>',
    ...(aedSecondTaxTotal ? [aedSecondTaxTotal] : []),
    '  <cac:LegalMonetaryTotal>',
    `    <cbc:LineExtensionAmount currencyID="${escapeXml(currency)}">${calc.lineExtensionTotal.toFixed(2)}</cbc:LineExtensionAmount>`,
    `    <cbc:TaxExclusiveAmount currencyID="${escapeXml(currency)}">${calc.lineExtensionTotal.toFixed(2)}</cbc:TaxExclusiveAmount>`,
    `    <cbc:TaxInclusiveAmount currencyID="${escapeXml(currency)}">${calc.taxInclusiveTotal.toFixed(2)}</cbc:TaxInclusiveAmount>`,
    `    <cbc:PayableAmount currencyID="${escapeXml(currency)}">${calc.payableAmount.toFixed(2)}</cbc:PayableAmount>`,
    '  </cac:LegalMonetaryTotal>',
    linesXml,
    `</${rootTag}>`,
    '',
  ].join('\n');
}

function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .trim();
}

function extractTagValue(xmlSegment: string, localTag: string): string {
  const re = new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${localTag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?${localTag}>`, 'i');
  const match = re.exec(xmlSegment);
  return match?.[1] ? decodeXmlEntities(match[1]) : '';
}

function extractTagWithAttr(xmlSegment: string, localTag: string, attrName: string): { value: string; attr: string } {
  const re = new RegExp(
    `<(?:[a-zA-Z0-9_-]+:)?${localTag}\\b([^>]*)>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?${localTag}>`,
    'i',
  );
  const match = re.exec(xmlSegment);
  if (!match) return { value: '', attr: '' };
  const attrs = match[1] ?? '';
  const attrRe = new RegExp(`${attrName}\\s*=\\s*["']([^"']*)["']`, 'i');
  const attrMatch = attrRe.exec(attrs);
  return {
    value: decodeXmlEntities(match[2] ?? ''),
    attr: attrMatch?.[1] ? decodeXmlEntities(attrMatch[1]) : '',
  };
}

function extractBlock(xmlText: string, localTag: string): string {
  const re = new RegExp(
    `<(?:[a-zA-Z0-9_-]+:)?${localTag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?${localTag}>`,
    'i',
  );
  const match = re.exec(xmlText);
  return match?.[1] ?? '';
}

function extractAllBlocks(xmlText: string, localTag: string): string[] {
  const re = new RegExp(
    `<(?:[a-zA-Z0-9_-]+:)?${localTag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?${localTag}>`,
    'gi',
  );
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(xmlText)) !== null) {
    if (match[1]) results.push(match[1]);
  }
  return results;
}

function parsePartyBlock(block: string): PintParty {
  const endpoint = extractTagWithAttr(block, 'EndpointID', 'schemeID');
  const addrBlock = extractBlock(block, 'PostalAddress') || block;
  const taxSchemeBlock = extractBlock(block, 'PartyTaxScheme') || block;
  const legalBlock = extractBlock(block, 'PartyLegalEntity') || block;
  const countryBlock = extractBlock(addrBlock, 'Country') || addrBlock;

  return {
    legalName: extractTagValue(legalBlock, 'RegistrationName') || extractTagValue(block, 'Name'),
    trn: extractTagValue(taxSchemeBlock, 'CompanyID'),
    peppolSchemeId: endpoint.attr,
    peppolEndpointId: endpoint.value,
    streetAddress: extractTagValue(addrBlock, 'StreetName'),
    city: extractTagValue(addrBlock, 'CityName'),
    emirateCode: extractTagValue(addrBlock, 'CountrySubentityCode'),
    postalCode: extractTagValue(addrBlock, 'PostalZone') || undefined,
    countryCode: extractTagValue(countryBlock, 'IdentificationCode') || 'AE',
    contactEmail: extractTagValue(block, 'ElectronicMail') || undefined,
  };
}

export function parsePintAeXml(xmlText: string): { invoice: PintInvoiceInput; rawXmlMeta: RawXmlMeta } {
  const src = String(xmlText ?? '').trim();
  if (!src || !src.includes('<')) {
    throw new PintCheckCoreError('Empty or invalid XML payload', 'INVALID_XML');
  }

  // Strictly block XML External Entities (XXE) & DTD declarations
  if (/<!DOCTYPE\b/i.test(src) || /<!ENTITY\b/i.test(src)) {
    throw new PintCheckCoreError(
      'XML DOCTYPE and ENTITY declarations are blocked for XXE security',
      'XXE_BLOCKED',
    );
  }

  const isCreditNote = /<(?:[a-zA-Z0-9_-]+:)?CreditNote\b/i.test(src);
  const isInvoice = /<(?:[a-zA-Z0-9_-]+:)?Invoice\b/i.test(src);
  const rootElement: RawXmlMeta['rootElement'] = isCreditNote
    ? 'CreditNote'
    : isInvoice
      ? 'Invoice'
      : 'Unknown';

  if (rootElement === 'Unknown') {
    throw new PintCheckCoreError(
      'Expected UBL 2.1 <Invoice> or <CreditNote> root element',
      'UNSUPPORTED_XML_ROOT',
    );
  }

  // Strip line blocks and party blocks cleanly to avoid matching nested line IDs at header level
  const strippedHeader = src
    .replace(/<(?:[a-zA-Z0-9_-]+:)?(InvoiceLine|CreditNoteLine|AccountingSupplierParty|AccountingCustomerParty|BillingReference|TaxTotal|LegalMonetaryTotal)\b[\s\S]*?<\/(?:[a-zA-Z0-9_-]+:)?\1>/gi, '');

  const customizationId = extractTagValue(strippedHeader, 'CustomizationID');
  const profileId = extractTagValue(strippedHeader, 'ProfileID');
  const invoiceNumber = extractTagValue(strippedHeader, 'ID');
  const uuid = extractTagValue(strippedHeader, 'UUID');
  const issueDate = extractTagValue(strippedHeader, 'IssueDate');
  const dueDate = extractTagValue(strippedHeader, 'DueDate') || undefined;
  const docCurrencyRaw = (extractTagValue(strippedHeader, 'DocumentCurrencyCode') || 'AED').toUpperCase();
  const currency: CurrencyCode = (['AED', 'USD', 'EUR', 'GBP', 'SAR'].includes(docCurrencyRaw)
    ? docCurrencyRaw
    : 'AED') as CurrencyCode;
  const taxCurrencyCode = extractTagValue(strippedHeader, 'TaxCurrencyCode').toUpperCase() || undefined;

  const docTypeInfo = extractTagWithAttr(
    strippedHeader,
    isCreditNote ? 'CreditNoteTypeCode' : 'InvoiceTypeCode',
    'name',
  );
  const rawType = (docTypeInfo.value || (isCreditNote ? '381' : '380')) as PintDocTypeCode;

  const supplierBlock = extractBlock(src, 'AccountingSupplierParty');
  const customerBlock = extractBlock(src, 'AccountingCustomerParty');
  const billingRefBlock = extractBlock(src, 'BillingReference');

  const lineBlocks = extractAllBlocks(src, isCreditNote ? 'CreditNoteLine' : 'InvoiceLine');
  const lines: PintInvoiceLine[] = lineBlocks.map((lb, idx) => {
    const qtyVal = Number(
      extractTagValue(lb, isCreditNote ? 'CreditedQuantity' : 'InvoicedQuantity') || '1',
    );
    const qtyAttr = extractTagWithAttr(
      lb,
      isCreditNote ? 'CreditedQuantity' : 'InvoicedQuantity',
      'unitCode',
    ).attr;
    const priceBlock = extractBlock(lb, 'Price') || lb;
    const priceVal = Number(extractTagValue(priceBlock, 'PriceAmount') || '0');
    const itemBlock = extractBlock(lb, 'Item') || lb;
    const taxCatBlock = extractBlock(itemBlock, 'ClassifiedTaxCategory') || itemBlock;
    const catCode = (extractTagValue(taxCatBlock, 'ID') || 'S').toUpperCase() as AeVatCategoryCode;
    const vatPct = Number(extractTagValue(taxCatBlock, 'Percent') || '0');

    return {
      id: extractTagValue(lb, 'ID') || String(idx + 1),
      description: extractTagValue(itemBlock, 'Name') || extractTagValue(itemBlock, 'Description'),
      quantity: Number.isFinite(qtyVal) ? qtyVal : 1,
      unitCode: qtyAttr || 'EA',
      unitPrice: Number.isFinite(priceVal) ? priceVal : 0,
      vatCategory: (['S', 'Z', 'E', 'O', 'AE', 'N'].includes(catCode) ? catCode : 'S') as AeVatCategoryCode,
      vatRatePct: Number.isFinite(vatPct) ? vatPct : 0,
    };
  });

  const taxTotalMatches = src.match(/<(?:[a-zA-Z0-9_-]+:)?TaxAmount\b[^>]*>[^<]+<\/(?:[a-zA-Z0-9_-]+:)?TaxAmount>/gi) ?? [];
  const hasAedTaxTotal = taxTotalMatches.some((t) => /currencyID\s*=\s*["']AED["']/i.test(t));
  const monetaryBlock = extractBlock(src, 'LegalMonetaryTotal');
  const payableStr = monetaryBlock ? extractTagValue(monetaryBlock, 'PayableAmount') : '';
  const payableNum = payableStr ? Number(payableStr) : undefined;

  const firstTaxAmtMatch = /<(?:[a-zA-Z0-9_-]+:)?TaxAmount\b[^>]*>([^<]+)<\/(?:[a-zA-Z0-9_-]+:)?TaxAmount>/i.exec(
    extractBlock(src, 'TaxTotal'),
  );
  const firstTaxNum = firstTaxAmtMatch?.[1] ? Number(firstTaxAmtMatch[1]) : undefined;

  let inferredFxRate: number | undefined = undefined;
  if (currency !== 'AED' && hasAedTaxTotal && firstTaxNum && firstTaxNum > 0) {
    const aedTaxMatch = /<cbc:TaxAmount\s+currencyID=["']AED["']>([^<]+)<\/cbc:TaxAmount>/i.exec(src);
    if (aedTaxMatch?.[1]) {
      const aedAmt = Number(aedTaxMatch[1]);
      if (Number.isFinite(aedAmt) && aedAmt > 0) {
        inferredFxRate = Math.round((aedAmt / firstTaxNum + Number.EPSILON) * 10000) / 10000;
      }
    }
  }

  return {
    invoice: {
      id: `xml-${Date.now().toString(36)}`,
      invoiceNumber,
      uuid,
      issueDate,
      dueDate,
      docTypeCode: rawType,
      selfBilling: customizationId === PINT_AE_SELFBILLING_CUSTOMIZATION_ID,
      transactionFlags: docTypeInfo.attr || '00000000',
      precedingInvoiceReference: billingRefBlock ? extractTagValue(billingRefBlock, 'ID') : undefined,
      currency,
      fxRateToAed: currency === 'AED' ? 1 : inferredFxRate,
      note: extractTagValue(strippedHeader, 'Note') || undefined,
      seller: parsePartyBlock(supplierBlock),
      buyer: parsePartyBlock(customerBlock),
      lines,
    },
    rawXmlMeta: {
      rootElement,
      customizationId,
      profileId,
      taxCurrencyCode,
      hasAedTaxTotal,
      detectedTaxTotalAmount: Number.isFinite(firstTaxNum) ? firstTaxNum : undefined,
      detectedPayableAmount: Number.isFinite(payableNum) ? payableNum : undefined,
    },
  };
}

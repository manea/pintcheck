export type Locale = 'ar' | 'en';

export type UaeEmirateCode =
  | 'AE-AZ'
  | 'AE-DU'
  | 'AE-SH'
  | 'AE-AJ'
  | 'AE-UQ'
  | 'AE-RK'
  | 'AE-FU';

export type PintDocTypeCode = '380' | '381' | '386' | '480';

export type AeVatCategoryCode = 'S' | 'Z' | 'E' | 'O' | 'AE' | 'N';

export type CurrencyCode = 'AED' | 'USD' | 'EUR' | 'GBP' | 'SAR';

export type RevenueTier = 'sme_under_50m' | 'large_over_50m';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export type ReadinessCheckStatus = 'pass' | 'fail' | 'in_progress' | 'not_started';

export interface PintParty {
  legalName: string;
  trn: string;
  peppolSchemeId: string;
  peppolEndpointId: string;
  streetAddress: string;
  city: string;
  emirateCode: string;
  postalCode?: string;
  countryCode: string;
  contactEmail?: string;
}

export interface PintInvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitCode: string;
  unitPrice: number;
  lineAllowance?: number;
  vatCategory: AeVatCategoryCode;
  vatRatePct: number;
  exemptionReasonCode?: string;
  exemptionReasonText?: string;
}

export interface PintInvoiceInput {
  id: string;
  invoiceNumber: string;
  uuid: string;
  issueDate: string;
  dueDate?: string;
  docTypeCode: PintDocTypeCode;
  selfBilling?: boolean;
  transactionFlags?: string;
  precedingInvoiceReference?: string;
  currency: CurrencyCode;
  fxRateToAed?: number;
  note?: string;
  seller: PintParty;
  buyer: PintParty;
  lines: PintInvoiceLine[];
}

export interface RawXmlMeta {
  rootElement: 'Invoice' | 'CreditNote' | 'Unknown';
  customizationId?: string;
  profileId?: string;
  taxCurrencyCode?: string;
  hasAedTaxTotal?: boolean;
  detectedTaxTotalAmount?: number;
  detectedPayableAmount?: number;
}

export interface ValidationIssue {
  ruleId: string;
  severity: ValidationSeverity;
  xpathHint: string;
  field: string;
  titleEn: string;
  titleAr: string;
  detailEn: string;
  detailAr: string;
  fixHintEn: string;
  fixHintAr: string;
}

export interface TaxCategoryBreakdown {
  vatCategory: AeVatCategoryCode;
  vatRatePct: number;
  taxableAmount: number;
  taxAmount: number;
}

export interface InvoiceCalculationSummary {
  currency: CurrencyCode;
  fxRateToAed: number;
  lineExtensionTotal: number;
  totalVat: number;
  taxInclusiveTotal: number;
  payableAmount: number;
  totalVatAed: number;
  payableAmountAed: number;
  taxableByCategory: TaxCategoryBreakdown[];
}

export interface ValidationReport {
  valid: boolean;
  passScore: number;
  errorsCount: number;
  warningsCount: number;
  infoCount: number;
  rulesChecked: number;
  issues: ValidationIssue[];
  calculation: InvoiceCalculationSummary;
}

export interface MasterDataCsvRowResult {
  rowIndex: number;
  companyName: string;
  rawTrn: string;
  normalizedTrn: string;
  trnValid: boolean;
  derivedPeppolEndpoint: string;
  rawEmirate: string;
  suggestedEmirateCode: UaeEmirateCode | null;
  emirateValid: boolean;
  currency: string;
  vatRateRaw: string;
  vatRateValid: boolean;
  status: 'valid' | 'fixable' | 'invalid';
  issuesAr: string[];
  issuesEn: string[];
}

export interface MasterDataCsvAudit {
  totalRows: number;
  validRowsCount: number;
  fixableRowsCount: number;
  invalidRowsCount: number;
  rows: MasterDataCsvRowResult[];
}

export interface AspReadinessCheckItem {
  id: string;
  category: 'master_data' | 'erp_xml' | 'asp_selection' | 'testing';
  titleEn: string;
  titleAr: string;
  guidanceEn: string;
  guidanceAr: string;
  weight: number;
  status: ReadinessCheckStatus;
  notes?: string;
}

export interface TimelineMilestones {
  revenueTier: RevenueTier;
  referenceDate: string;
  aspAppointmentDeadline: string;
  mandatoryGoLiveDate: string;
  daysUntilAspAppointment: number;
  daysUntilGoLive: number;
}

export interface ReadinessSummary {
  compositeScore: number;
  xmlPassScore: number;
  checklistScore: number;
  status: 'ready_for_asp_sandbox' | 'needs_remediation' | 'not_ready';
  passedChecksCount: number;
  failedChecksCount: number;
  totalChecksCount: number;
  milestones: TimelineMilestones;
}

export interface PintCheckDossier {
  id: string;
  slug: string;
  dossierNumber?: string | null;
  status: 'draft' | 'locked';
  defaultLocale: Locale;
  organizationName: string;
  organizationTrn: string;
  revenueTier: RevenueTier;
  referenceDate: string;
  invoice: PintInvoiceInput;
  rawXmlSource?: string;
  rawXmlMeta?: RawXmlMeta;
  validation: ValidationReport;
  readinessChecks: AspReadinessCheckItem[];
  readinessSummary: ReadinessSummary;
  batchAudit?: MasterDataCsvAudit | null;
  scopeDigestHex?: string;
  finalizedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

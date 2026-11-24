import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  auditMasterDataCsv,
  buildCleanedMasterDataCsv,
  sanitizeCsvCell,
} from '../src/core/batchCsv.ts';
import {
  buildDossierCanonicalText,
  buildExecutiveSummaryText,
} from '../src/core/dossierDigest.ts';
import { PINTCHECK_PRESETS, createDossierFromPreset } from '../src/core/presets.ts';
import {
  buildDefaultAspReadinessChecks,
  computeReadinessSummary,
} from '../src/core/readiness.ts';
import {
  PintCheckCoreError,
  generatePintAeXml,
  parsePintAeXml,
} from '../src/core/ublXml.ts';
import { validatePintAeInvoice } from '../src/core/validator.ts';
import { openPintCheckDatabase, slugify } from './db.mjs';

const __serverDir = path.dirname(fileURLToPath(import.meta.url));
let APP_VERSION = '0.2.0';
try {
  const pkgJson = JSON.parse(
    fs.readFileSync(path.resolve(__serverDir, '../package.json'), 'utf8'),
  );
  if (typeof pkgJson.version === 'string' && pkgJson.version.trim()) {
    APP_VERSION = pkgJson.version.trim();
  }
} catch {
  // fallback version
}

const MAX_JSON_BODY = 5 * 1024 * 1024; // 5 MB limit
const VALID_CURRENCIES = new Set(['AED', 'USD', 'EUR', 'GBP', 'SAR']);

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'SAMEORIGIN',
};

const MIME_BY_EXT = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_JSON_BODY) {
      const err = new Error('JSON payload exceeds 5 MB limit');
      err.statusCode = 413;
      err.code = 'PAYLOAD_TOO_LARGE';
      throw err;
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const err = new Error('Invalid JSON payload');
    err.statusCode = 400;
    err.code = 'INVALID_JSON';
    throw err;
  }
}

function normalizeBasePath(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let trimmed = raw.trim();
  if (!trimmed || trimmed === '/') return '';
  if (!trimmed.startsWith('/')) trimmed = `/${trimmed}`;
  return trimmed.replace(/\/+$/, '');
}

function resolveBaseUrl(req, normalizedAppOrigin, normalizedBasePath = '') {
  if (normalizedAppOrigin) return normalizedAppOrigin;
  const protoHeader = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const proto = protoHeader || (req.socket?.encrypted ? 'https' : 'http');
  const hostHeader = String(req.headers['x-forwarded-host'] || req.headers.host || '127.0.0.1:4191')
    .split(',')[0]
    .trim();
  return `${proto}://${hostHeader}${normalizedBasePath}`;
}

function mergeParty(patchParty, fallbackParty) {
  const fb = fallbackParty || {
    legalName: 'UAE Entity LLC',
    trn: '',
    peppolSchemeId: '0235',
    peppolEndpointId: '',
    streetAddress: '',
    city: 'Dubai',
    emirateCode: 'AE-DU',
    countryCode: 'AE',
  };
  const src = patchParty && typeof patchParty === 'object' ? patchParty : {};
  return {
    ...fb,
    ...src,
    legalName: String(src.legalName ?? fb.legalName).trim(),
    trn: String(src.trn ?? fb.trn).trim(),
    peppolSchemeId: String(src.peppolSchemeId ?? fb.peppolSchemeId).trim(),
    peppolEndpointId: String(src.peppolEndpointId ?? fb.peppolEndpointId).trim(),
    streetAddress: String(src.streetAddress ?? fb.streetAddress).trim(),
    city: String(src.city ?? fb.city).trim(),
    emirateCode: String(src.emirateCode ?? fb.emirateCode).trim(),
    countryCode: String(src.countryCode ?? fb.countryCode ?? 'AE').trim() || 'AE',
  };
}

function mergeInvoice(patchInvoice, fallbackInvoice) {
  const fb = fallbackInvoice || {
    id: `inv-${Date.now().toString(36)}`,
    invoiceNumber: `INV-${new Date().getUTCFullYear()}-0001`,
    uuid: '00000000-0000-4000-8000-000000000001',
    issueDate: new Date().toISOString().slice(0, 10),
    docTypeCode: '380',
    currency: 'AED',
    fxRateToAed: 1,
    seller: mergeParty(null, null),
    buyer: mergeParty(null, null),
    lines: [],
  };
  const src = patchInvoice && typeof patchInvoice === 'object' ? patchInvoice : {};
  const rawCurrency = String(src.currency ?? fb.currency).toUpperCase();
  const currency = VALID_CURRENCIES.has(rawCurrency) ? rawCurrency : fb.currency;

  let fxRateToAed = fb.fxRateToAed;
  if (src.fxRateToAed !== undefined) {
    fxRateToAed = Number(src.fxRateToAed) > 0 ? Number(src.fxRateToAed) : undefined;
  } else if (currency === 'AED') {
    fxRateToAed = 1;
  }

  return {
    ...fb,
    ...src,
    currency,
    fxRateToAed,
    seller: mergeParty(src.seller, fb.seller),
    buyer: mergeParty(src.buyer, fb.buyer),
    lines: Array.isArray(src.lines) ? src.lines : fb.lines,
  };
}

function exportValidationIssuesToCsv(dossier, locale = 'ar') {
  const { validation, invoice } = dossier;
  const headers =
    locale === 'ar'
      ? [
          'رقم الملف',
          'المنشأة',
          'الرقم الضريبي للمورّد',
          'رقم الفاتورة',
          'العملة',
          'الإجمالي المستحق',
          'رمز القاعدة',
          'الخطورة',
          'الحقل',
          'المسار XPath',
          'الوصف',
          'الإجراء المطلوب',
        ]
      : [
          'Dossier',
          'Organization',
          'Seller TRN',
          'Invoice #',
          'Currency',
          'Payable Total',
          'Rule ID',
          'Severity',
          'Field',
          'XPath',
          'Issue Title',
          'Fix Hint',
        ];

  const rows =
    validation.issues.length > 0
      ? validation.issues.map((iss) => [
          dossier.dossierNumber || dossier.slug,
          dossier.organizationName,
          invoice.seller.trn,
          invoice.invoiceNumber,
          validation.calculation.currency,
          validation.calculation.payableAmount.toFixed(2),
          iss.ruleId,
          iss.severity.toUpperCase(),
          iss.field,
          iss.xpathHint,
          locale === 'ar' ? iss.titleAr : iss.titleEn,
          locale === 'ar' ? iss.fixHintAr : iss.fixHintEn,
        ])
      : [
          [
            dossier.dossierNumber || dossier.slug,
            dossier.organizationName,
            invoice.seller.trn,
            invoice.invoiceNumber,
            validation.calculation.currency,
            validation.calculation.payableAmount.toFixed(2),
            'NONE',
            'PASS',
            'all',
            '/Invoice',
            locale === 'ar'
              ? 'جميع قواعد الفحص المسبق PINT-AE ناجحة (100/100)'
              : 'All PINT-AE pre-flight rules passed (100/100)',
            '-',
          ],
        ];

  const lines = [headers.map(sanitizeCsvCell).join(',')];
  for (const r of rows) {
    lines.push(r.map(sanitizeCsvCell).join(','));
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

function serveStaticAsset(res, pathname, resolvedDist, method = 'GET', normalizedBasePath = '') {
  if (!resolvedDist || !fs.existsSync(resolvedDist)) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  let decodedPath = '/';
  try {
    decodedPath = decodeURIComponent(pathname || '/');
  } catch {
    sendJson(res, 400, { error: 'Malformed path' });
    return;
  }

  const cleanRel = decodedPath.replace(/^\/+/, '');
  const candidate = path.resolve(resolvedDist, cleanRel || 'index.html');
  if (candidate !== resolvedDist && !candidate.startsWith(resolvedDist + path.sep)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  let fileToServe = null;
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    fileToServe = candidate;
  } else {
    const indexFallback = path.join(resolvedDist, 'index.html');
    if (fs.existsSync(indexFallback) && fs.statSync(indexFallback).isFile()) {
      fileToServe = indexFallback;
    }
  }

  if (!fileToServe) {
    sendJson(res, 404, { error: 'Static asset not found' });
    return;
  }

  const ext = path.extname(fileToServe).toLowerCase();
  const contentType = MIME_BY_EXT[ext] || 'application/octet-stream';

  if (ext === '.html' && normalizedBasePath) {
    let html = fs.readFileSync(fileToServe, 'utf8');
    html = html
      .replaceAll('href="/', `href="${normalizedBasePath}/`)
      .replaceAll('src="/', `src="${normalizedBasePath}/`);
    const baseScript = `<script>window.__PINTCHECK_BASE__=${JSON.stringify(normalizedBasePath)};</script>`;
    html = html.includes('</head>') ? html.replace('</head>', `${baseScript}</head>`) : `${baseScript}${html}`;
    const bodyBuf = Buffer.from(html, 'utf8');
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': bodyBuf.byteLength,
      'Cache-Control': 'no-cache',
      ...SECURITY_HEADERS,
    });
    if (method === 'HEAD') {
      res.end();
      return;
    }
    res.end(bodyBuf);
    return;
  }

  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    ...SECURITY_HEADERS,
  });
  if (method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(fileToServe).pipe(res);
}

function mapCoreErrorStatus(err) {
  if (err?.statusCode) return err.statusCode;
  if (err instanceof PintCheckCoreError) return 400;
  return 500;
}

export function createPintCheckServer({ dataDir, distDir = '', appOrigin = '', basePath = '' }) {
  const db = openPintCheckDatabase(dataDir);
  const resolvedDist = distDir ? path.resolve(distDir) : null;
  const normalizedAppOrigin = String(appOrigin || '').replace(/\/+$/, '');
  const normalizedBasePath = normalizeBasePath(basePath);

  function buildPublicReportUrl(req, slugOrNum) {
    return `${resolveBaseUrl(req, normalizedAppOrigin, normalizedBasePath)}/r/${encodeURIComponent(slugOrNum)}`;
  }

  async function handleApiRequest(req, res, method, pathname, searchParams) {
    // 1. Health & Presets
    if (method === 'GET' && pathname === '/api/health') {
      const stats = db.getStats();
      return sendJson(res, 200, {
        ok: true,
        service: 'pintcheck',
        version: APP_VERSION,
        basePath: normalizedBasePath || '/',
        ...stats,
        timestamp: new Date().toISOString(),
      });
    }

    if (method === 'GET' && pathname === '/api/presets') {
      return sendJson(res, 200, {
        presets: PINTCHECK_PRESETS.map((p) => ({
          id: p.id,
          nameEn: p.nameEn,
          nameAr: p.nameAr,
          badgeEn: p.badgeEn,
          badgeAr: p.badgeAr,
          defaultLocale: p.defaultLocale,
        })),
      });
    }

    // 2. Stateless Validators (XML & CSV)
    if (method === 'POST' && pathname === '/api/validate-xml') {
      const body = await readJsonBody(req);
      const xml = String(body?.xml ?? body?.xmlText ?? '');
      const { invoice, rawXmlMeta } = parsePintAeXml(xml);
      const validation = validatePintAeInvoice(invoice, rawXmlMeta);
      return sendJson(res, 200, {
        invoice,
        rawXmlMeta,
        validation,
      });
    }

    if (method === 'POST' && pathname === '/api/batch-csv') {
      const body = await readJsonBody(req);
      const csvText = String(body?.csvText ?? '');
      const audit = auditMasterDataCsv(csvText);
      return sendJson(res, 200, { audit });
    }

    // 3. Company Profiles CRUD
    if (method === 'GET' && pathname === '/api/profiles') {
      return sendJson(res, 200, { profiles: db.listProfiles() });
    }

    if (method === 'POST' && pathname === '/api/profiles') {
      const body = await readJsonBody(req);
      const created = db.createProfile(body || {});
      return sendJson(res, 201, { profile: created });
    }

    const profileMatch = pathname.match(/^\/api\/profiles\/([^/]+)$/);
    if (profileMatch) {
      const profileId = decodeURIComponent(profileMatch[1] || '');
      if (method === 'PATCH') {
        const body = await readJsonBody(req);
        const updated = db.updateProfile(profileId, body || {});
        if (!updated) return sendJson(res, 404, { error: 'Profile not found' });
        return sendJson(res, 200, { profile: updated });
      }
      if (method === 'DELETE') {
        const del = db.deleteProfile(profileId);
        if (!del.deleted) return sendJson(res, 404, { error: 'Profile not found' });
        return sendJson(res, 200, { deleted: true, id: profileId });
      }
    }

    // 4. Dossiers List & Creation
    if (method === 'GET' && pathname === '/api/dossiers') {
      return sendJson(res, 200, {
        dossiers: db.listDossiers(),
        stats: db.getStats(),
      });
    }

    if (method === 'POST' && pathname === '/api/dossiers') {
      const body = await readJsonBody(req);
      const actor = String(body?.actor || 'finance').trim() || 'finance';
      const refDate =
        typeof body?.referenceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.referenceDate)
          ? body.referenceDate
          : new Date().toISOString().slice(0, 10);

      if (body?.presetId) {
        const presetMeta = PINTCHECK_PRESETS.find((p) => p.id === body.presetId);
        if (!presetMeta) {
          return sendJson(res, 400, { error: 'Unknown presetId', code: 'UNKNOWN_PRESET' });
        }
        const dossier = createDossierFromPreset(presetMeta.id, refDate);
        const bundle = db.createDossier(dossier, actor);
        return sendJson(res, 201, {
          ...bundle,
          publicReportUrl: buildPublicReportUrl(req, bundle.dossier.slug),
        });
      }

      let invoice;
      let rawXmlMeta;
      let rawXmlSource;

      if (typeof body?.xmlText === 'string' && body.xmlText.trim()) {
        const parsed = parsePintAeXml(body.xmlText);
        invoice = parsed.invoice;
        rawXmlMeta = parsed.rawXmlMeta;
        rawXmlSource = body.xmlText;
      } else if (body?.invoice && typeof body.invoice === 'object') {
        invoice = mergeInvoice(body.invoice, null);
      } else {
        return sendJson(res, 400, {
          error: 'Provide presetId, xmlText, or invoice payload.',
          code: 'MISSING_DOSSIER_INPUT',
        });
      }

      const defaultLocale = body?.defaultLocale === 'en' ? 'en' : 'ar';
      const revenueTier = body?.revenueTier === 'large_over_50m' ? 'large_over_50m' : 'sme_under_50m';
      const validation = validatePintAeInvoice(invoice, rawXmlMeta);
      if (!rawXmlSource) {
        rawXmlSource = generatePintAeXml(invoice, validation.calculation);
      }

      const checks = buildDefaultAspReadinessChecks(
        Array.isArray(body?.checklistOverrides) ? body.checklistOverrides : undefined,
      );
      const readinessSummary = computeReadinessSummary(validation, checks, revenueTier, refDate);
      const batchAudit =
        typeof body?.csvText === 'string' && body.csvText.trim()
          ? auditMasterDataCsv(body.csvText)
          : null;

      const orgName =
        String(body?.organizationName || invoice.seller.legalName || 'UAE Business LLC').trim();
      const orgTrn = String(body?.organizationTrn || invoice.seller.trn || '').trim();

      const bundle = db.createDossier(
        {
          slug: slugify(body?.slug || invoice.invoiceNumber || orgName, 'dossier'),
          defaultLocale,
          organizationName: orgName,
          organizationTrn: orgTrn,
          revenueTier,
          referenceDate: refDate,
          invoice,
          rawXmlSource,
          ...(rawXmlMeta ? { rawXmlMeta } : {}),
          validation,
          readinessChecks: checks,
          readinessSummary,
          batchAudit,
        },
        actor,
      );

      return sendJson(res, 201, {
        ...bundle,
        publicReportUrl: buildPublicReportUrl(req, bundle.dossier.slug),
      });
    }

    // 5. Dossier Actions: Duplicate & Finalize
    const dupMatch = pathname.match(/^\/api\/dossiers\/([^/]+)\/duplicate$/);
    if (method === 'POST' && dupMatch) {
      const id = decodeURIComponent(dupMatch[1] || '');
      const body = await readJsonBody(req);
      const cloned = db.duplicateDossier(id, String(body?.actor || 'finance').trim() || 'finance');
      if (!cloned) return sendJson(res, 404, { error: 'Dossier not found' });
      return sendJson(res, 201, {
        ...cloned,
        publicReportUrl: buildPublicReportUrl(req, cloned.dossier.slug),
      });
    }

    const finalizeMatch = pathname.match(/^\/api\/dossiers\/([^/]+)\/finalize$/);
    if (method === 'POST' && finalizeMatch) {
      const id = decodeURIComponent(finalizeMatch[1] || '');
      const body = await readJsonBody(req);
      const actor = String(body?.actor || 'finance').trim() || 'finance';
      const lockedBundle = db.finalizeDossier(id, buildDossierCanonicalText, actor);
      if (!lockedBundle) return sendJson(res, 404, { error: 'Dossier not found' });
      return sendJson(res, 200, {
        ...lockedBundle,
        publicReportUrl: buildPublicReportUrl(
          req,
          lockedBundle.dossier.dossierNumber || lockedBundle.dossier.slug,
        ),
      });
    }

    // 6. Exports & Summary (XML, BOM CSV, Executive Brief)
    const xmlMatch = pathname.match(/^\/api\/dossiers\/([^/]+)\/export\.xml$/);
    if (method === 'GET' && xmlMatch) {
      const id = decodeURIComponent(xmlMatch[1] || '');
      const bundle = db.getDossierById(id) || db.getDossierBySlugOrNumber(id);
      if (!bundle) return sendJson(res, 404, { error: 'Dossier not found' });
      const d = bundle.dossier;
      const xmlOut =
        d.rawXmlSource && d.rawXmlMeta
          ? d.rawXmlSource
          : generatePintAeXml(d.invoice, d.validation.calculation);
      const fname = slugify(d.dossierNumber || d.slug || d.id, 'dossier');
      res.writeHead(200, {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="pintcheck-${fname}.xml"`,
        'Cache-Control': 'no-store',
        ...SECURITY_HEADERS,
      });
      res.end(xmlOut);
      return;
    }

    const csvMatch = pathname.match(/^\/api\/dossiers\/([^/]+)\/export\.csv$/);
    if (method === 'GET' && csvMatch) {
      const id = decodeURIComponent(csvMatch[1] || '');
      const locale = searchParams.get('locale') === 'en' ? 'en' : 'ar';
      const bundle = db.getDossierById(id) || db.getDossierBySlugOrNumber(id);
      if (!bundle) return sendJson(res, 404, { error: 'Dossier not found' });
      const d = bundle.dossier;
      const csvOut =
        d.batchAudit && Array.isArray(d.batchAudit.rows) && d.batchAudit.rows.length > 0
          ? buildCleanedMasterDataCsv(d.batchAudit, locale)
          : exportValidationIssuesToCsv(d, locale);
      const fname = slugify(d.dossierNumber || d.slug || d.id, 'dossier');
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="pintcheck-${fname}-${locale}.csv"`,
        'Cache-Control': 'no-store',
        ...SECURITY_HEADERS,
      });
      res.end(csvOut);
      return;
    }

    const summaryMatch = pathname.match(/^\/api\/dossiers\/([^/]+)\/summary$/);
    if (method === 'GET' && summaryMatch) {
      const id = decodeURIComponent(summaryMatch[1] || '');
      const locale = searchParams.get('locale') === 'en' ? 'en' : 'ar';
      const bundle = db.getDossierById(id) || db.getDossierBySlugOrNumber(id);
      if (!bundle) return sendJson(res, 404, { error: 'Dossier not found' });
      return sendJson(res, 200, {
        locale,
        summary: buildExecutiveSummaryText(bundle.dossier, locale),
      });
    }

    // 7. Single Dossier Read, Update & Delete
    const dossierMatch = pathname.match(/^\/api\/dossiers\/([^/]+)$/);
    if (dossierMatch) {
      const id = decodeURIComponent(dossierMatch[1] || '');
      if (method === 'GET') {
        const bundle = db.getDossierById(id) || db.getDossierBySlugOrNumber(id);
        if (!bundle) return sendJson(res, 404, { error: 'Dossier not found' });
        return sendJson(res, 200, {
          ...bundle,
          publicReportUrl: buildPublicReportUrl(
            req,
            bundle.dossier.dossierNumber || bundle.dossier.slug,
          ),
        });
      }
      if (method === 'PATCH') {
        const patch = await readJsonBody(req);
        const updated = db.updateDossier(
          id,
          (current) => {
            let nextInvoice = current.invoice;
            let nextRawXmlMeta = current.rawXmlMeta;
            let nextRawXmlSource = current.rawXmlSource;

            if (typeof patch?.xmlText === 'string' && patch.xmlText.trim()) {
              const parsed = parsePintAeXml(patch.xmlText);
              nextInvoice = parsed.invoice;
              nextRawXmlMeta = parsed.rawXmlMeta;
              nextRawXmlSource = patch.xmlText;
            } else if (patch?.invoice && typeof patch.invoice === 'object') {
              nextInvoice = mergeInvoice(patch.invoice, current.invoice);
              nextRawXmlMeta = undefined;
            }

            const nextValidation = validatePintAeInvoice(nextInvoice, nextRawXmlMeta);
            if (!(typeof patch?.xmlText === 'string' && patch.xmlText.trim())) {
              if (patch?.invoice || !nextRawXmlSource) {
                nextRawXmlSource = generatePintAeXml(nextInvoice, nextValidation.calculation);
              }
            }

            const nextRevenueTier =
              patch?.revenueTier === 'large_over_50m' || patch?.revenueTier === 'sme_under_50m'
                ? patch.revenueTier
                : current.revenueTier;
            const nextRefDate =
              typeof patch?.referenceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(patch.referenceDate)
                ? patch.referenceDate
                : current.referenceDate;

            const checkOverrides = Array.isArray(patch?.readinessChecks)
              ? patch.readinessChecks
              : current.readinessChecks;
            const nextChecks = buildDefaultAspReadinessChecks(checkOverrides);
            const nextSummary = computeReadinessSummary(
              nextValidation,
              nextChecks,
              nextRevenueTier,
              nextRefDate,
            );

            let nextBatchAudit = current.batchAudit ?? null;
            if (typeof patch?.csvText === 'string') {
              nextBatchAudit = patch.csvText.trim() ? auditMasterDataCsv(patch.csvText) : null;
            }

            return {
              ...current,
              ...(typeof patch?.slug === 'string' && patch.slug.trim() ? { slug: patch.slug.trim() } : {}),
              ...(patch?.defaultLocale === 'ar' || patch?.defaultLocale === 'en'
                ? { defaultLocale: patch.defaultLocale }
                : {}),
              organizationName:
                patch?.organizationName !== undefined
                  ? String(patch.organizationName).trim() || current.organizationName
                  : current.organizationName,
              organizationTrn:
                patch?.organizationTrn !== undefined
                  ? String(patch.organizationTrn).trim()
                  : nextInvoice.seller.trn || current.organizationTrn,
              revenueTier: nextRevenueTier,
              referenceDate: nextRefDate,
              invoice: nextInvoice,
              rawXmlSource: nextRawXmlSource,
              ...(nextRawXmlMeta ? { rawXmlMeta: nextRawXmlMeta } : { rawXmlMeta: undefined }),
              validation: nextValidation,
              readinessChecks: nextChecks,
              readinessSummary: nextSummary,
              batchAudit: nextBatchAudit,
            };
          },
          String(patch?.actor || 'finance').trim() || 'finance',
        );
        if (!updated) return sendJson(res, 404, { error: 'Dossier not found' });
        return sendJson(res, 200, {
          ...updated,
          publicReportUrl: buildPublicReportUrl(req, updated.dossier.slug),
        });
      }
      if (method === 'DELETE') {
        const del = db.deleteDossier(id);
        if (!del.deleted) return sendJson(res, 404, { error: 'Dossier not found' });
        return sendJson(res, 200, { deleted: true, id });
      }
    }

    // 8. Public Shareable Client / ASP Readiness Report (/api/public/reports/:slugOrNumber)
    const pubMatch = pathname.match(/^\/api\/public\/reports\/([^/]+)$/);
    if (method === 'GET' && pubMatch) {
      const slugOrNumber = decodeURIComponent(pubMatch[1] || '');
      const bundle = db.getDossierBySlugOrNumber(slugOrNumber, { incrementView: true });
      if (!bundle) return sendJson(res, 404, { error: 'Readiness dossier not found' });
      return sendJson(res, 200, {
        ...bundle,
        summaryAr: buildExecutiveSummaryText(bundle.dossier, 'ar'),
        summaryEn: buildExecutiveSummaryText(bundle.dossier, 'en'),
        publicReportUrl: buildPublicReportUrl(
          req,
          bundle.dossier.dossierNumber || bundle.dossier.slug,
        ),
      });
    }

    return sendJson(res, 404, { error: 'API endpoint not found' });
  }

  async function handler(req, res) {
    try {
      const parsedUrl = new URL(req.url || '/', 'http://localhost');
      let pathname = parsedUrl.pathname;
      if (
        normalizedBasePath &&
        (pathname === normalizedBasePath || pathname.startsWith(`${normalizedBasePath}/`))
      ) {
        pathname = pathname.slice(normalizedBasePath.length) || '/';
      }
      const method = String(req.method || 'GET').toUpperCase();

      if (pathname.startsWith('/api/')) {
        await handleApiRequest(req, res, method, pathname, parsedUrl.searchParams);
        return;
      }

      if (method !== 'GET' && method !== 'HEAD') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
      }

      serveStaticAsset(res, pathname, resolvedDist, method, normalizedBasePath);
    } catch (err) {
      const statusCode = mapCoreErrorStatus(err);
      const payload = {
        error: err?.message || 'Internal server error',
        ...(err?.code ? { code: err.code } : {}),
      };
      if (!res.headersSent) {
        sendJson(res, statusCode, payload);
      } else {
        res.end();
      }
    }
  }

  return {
    handler,
    close: () => db.close(),
  };
}

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPintCheckServer } from '../../server/app.mjs';
import { verifyDossierIntegrity } from '../../src/core/dossierDigest.ts';
import { createDossierFromPreset } from '../../src/core/presets.ts';
import type { PintCheckDossier } from '../../src/core/types.ts';

describe('PINTCheck Node 22 + SQLite WAL Server Integration', () => {
  let tmpDataDir = '';
  let tmpDistDir = '';
  let server: http.Server;
  let closeDb: () => void;
  let baseUrl = '';
  let pkgVersion = '0.2.0';

  const currentYear = new Date().getUTCFullYear();

  beforeAll(async () => {
    const pkgRaw = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'),
    );
    if (typeof pkgRaw.version === 'string') {
      pkgVersion = pkgRaw.version;
    }

    tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pintcheck-data-'));
    tmpDistDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pintcheck-dist-'));
    fs.writeFileSync(
      path.join(tmpDistDir, 'index.html'),
      '<!doctype html><html><head><link rel="icon" href="/favicon.svg" /><script type="module" src="/assets/app.js"></script></head><body><div id="root"></div></body></html>',
      'utf8',
    );

    const instance = createPintCheckServer({
      dataDir: tmpDataDir,
      distDir: tmpDistDir,
    });
    closeDb = instance.close;
    server = http.createServer(instance.handler);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('Failed to resolve ephemeral port');
    }
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    closeDb();
    fs.rmSync(tmpDataDir, { recursive: true, force: true });
    fs.rmSync(tmpDistDir, { recursive: true, force: true });
  });

  async function apiJson(urlPath: string, init?: RequestInit) {
    const res = await fetch(`${baseUrl}${urlPath}`, init);
    const data = (await res.json()) as Record<string, unknown>;
    return { res, data };
  }

  it('serves /api/health, 3 UAE presets, stateless /api/validate-xml (with XXE protection) & /api/batch-csv', async () => {
    const health = await apiJson('/api/health');
    expect(health.res.status).toBe(200);
    expect(health.data.ok).toBe(true);
    expect(health.data.service).toBe('pintcheck');
    expect(health.data.version).toBe(pkgVersion);
    expect(health.data.basePath).toBe('/');

    const presets = await apiJson('/api/presets');
    expect(presets.res.status).toBe(200);
    const list = presets.data.presets as Array<{ id: string }>;
    expect(list.map((p) => p.id)).toEqual([
      'dubai-trading-compliant',
      'abudhabi-agency-errors',
      'sharjah-export-credit-note',
    ]);

    const sampleDossier = createDossierFromPreset('dubai-trading-compliant');
    const validXmlRes = await apiJson('/api/validate-xml', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xml: sampleDossier.rawXmlSource }),
    });
    expect(validXmlRes.res.status).toBe(200);
    expect((validXmlRes.data.validation as { valid: boolean; passScore: number }).valid).toBe(true);
    expect((validXmlRes.data.validation as { passScore: number }).passScore).toBe(100);

    const xxeRes = await apiJson('/api/validate-xml', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        xml: '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><Invoice><cbc:ID>1</cbc:ID></Invoice>',
      }),
    });
    expect(xxeRes.res.status).toBe(400);
    expect(xxeRes.data.code).toBe('XXE_BLOCKED');

    const csvRes = await apiJson('/api/batch-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        csvText: 'Company,TRN,Emirate,Currency,VAT_Rate\nAl Marfa LLC,100451289100003,Dubai,AED,5',
      }),
    });
    expect(csvRes.res.status).toBe(200);
    expect((csvRes.data.audit as { fixableRowsCount: number }).fixableRowsCount).toBe(1);
  });

  it('supports UAE company profile CRUD via /api/profiles', async () => {
    const created = await apiJson('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Al Wasl Engineering',
        legalName: 'Al Wasl Engineering Services LLC',
        trn: '100334455600003',
        emirateCode: 'AE-DU',
        city: 'Dubai',
        streetAddress: 'Sheikh Zayed Rd',
        revenueTier: 'sme_under_50m',
      }),
    });
    expect(created.res.status).toBe(201);
    const pid = (created.data.profile as { id: string }).id;

    const listed = await apiJson('/api/profiles');
    expect((listed.data.profiles as unknown[]).length).toBe(1);

    const patched = await apiJson(`/api/profiles/${pid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emirateCode: 'AE-AZ', city: 'Abu Dhabi' }),
    });
    expect(patched.res.status).toBe(200);
    expect((patched.data.profile as { profile: { emirateCode: string } }).profile.emirateCode).toBe(
      'AE-AZ',
    );

    const del = await apiJson(`/api/profiles/${pid}`, { method: 'DELETE' });
    expect(del.res.status).toBe(200);
    expect(del.data.deleted).toBe(true);
  });

  it('repairs abudhabi-agency-errors dossier via PATCH, exports compliant PINT-AE XML, formula-safe BOM CSV & Arabic summary', async () => {
    const created = await apiJson('/api/dossiers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presetId: 'abudhabi-agency-errors' }),
    });
    expect(created.res.status).toBe(201);
    const errDraft = created.data.dossier as PintCheckDossier;
    expect(errDraft.validation.valid).toBe(false);
    expect(errDraft.validation.errorsCount).toBeGreaterThanOrEqual(6);

    const fixed = await apiJson(`/api/dossiers/${errDraft.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationName: '=SUM(1,1) Horizon Studio LLC',
        invoice: {
          fxRateToAed: 3.6725,
          seller: { emirateCode: 'AE-AZ' },
          buyer: {
            trn: '100445566700003',
            peppolSchemeId: '0235',
            peppolEndpointId: '1004455667',
            emirateCode: 'AE-DU',
          },
          lines: [
            {
              id: '1',
              description: 'Q4 Digital Architecture & Compliance Retainer',
              quantity: 1,
              unitCode: 'MON',
              unitPrice: 4500,
              vatCategory: 'S',
              vatRatePct: 5,
            },
          ],
        },
      }),
    });
    expect(fixed.res.status).toBe(200);
    const updated = fixed.data.dossier as PintCheckDossier;
    expect(updated.validation.valid).toBe(true);
    expect(updated.validation.passScore).toBe(100);
    expect(updated.validation.calculation.payableAmount).toBe(4725);

    const xmlRes = await fetch(`${baseUrl}/api/dossiers/${errDraft.id}/export.xml`);
    expect(xmlRes.status).toBe(200);
    expect(xmlRes.headers.get('content-type')).toContain('application/xml');
    const xmlText = await xmlRes.text();
    expect(xmlText).toContain('urn:peppol:pint:billing-1@ae-1');
    expect(xmlText).toContain('<cbc:TaxCurrencyCode>AED</cbc:TaxCurrencyCode>');

    const csvRes = await fetch(`${baseUrl}/api/dossiers/${errDraft.id}/export.csv?locale=ar`);
    expect(csvRes.status).toBe(200);
    const csvBuf = Buffer.from(await csvRes.arrayBuffer());
    expect(csvBuf[0]).toBe(0xef);
    expect(csvBuf[1]).toBe(0xbb);
    expect(csvBuf[2]).toBe(0xbf);
    const csvStr = csvBuf.toString('utf8');
    expect(csvStr).toContain("'=SUM(1,1)");

    const sumRes = await apiJson(`/api/dossiers/${errDraft.id}/summary?locale=ar`);
    expect(sumRes.res.status).toBe(200);
    expect(String(sumRes.data.summary)).toContain('PINT-AE');
    expect(String(sumRes.data.summary)).toContain('ليس مزود خدمة معتمد');
  });

  it('issues atomic PINT-YYYY-0001 dossier with SHA-256 seal, enforces 409 lock, clones into draft, and increments public views', async () => {
    const created = await apiJson('/api/dossiers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presetId: 'dubai-trading-compliant' }),
    });
    expect(created.res.status).toBe(201);
    const draft = created.data.dossier as PintCheckDossier;

    const fin1 = await apiJson(`/api/dossiers/${draft.id}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'cfo' }),
    });
    expect(fin1.res.status).toBe(200);
    const sealed = fin1.data.dossier as PintCheckDossier;
    const expectedNum = `PINT-${currentYear}-0001`;
    expect(sealed.dossierNumber).toBe(expectedNum);
    expect(sealed.status).toBe('locked');
    expect(sealed.scopeDigestHex).toMatch(/^[0-9a-f]{64}$/);
    const digestVerify = await verifyDossierIntegrity(sealed);
    expect(digestVerify.valid).toBe(true);

    // Double finalize blocked
    const fin2 = await apiJson(`/api/dossiers/${draft.id}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(fin2.res.status).toBe(409);
    expect(fin2.data.code).toBe('ALREADY_LOCKED');

    // Mutation and deletion blocked after sealing
    const patchLocked = await apiJson(`/api/dossiers/${draft.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationName: 'Tamper Try' }),
    });
    expect(patchLocked.res.status).toBe(409);
    expect(patchLocked.data.code).toBe('DOSSIER_LOCKED');

    const delLocked = await apiJson(`/api/dossiers/${draft.id}`, { method: 'DELETE' });
    expect(delLocked.res.status).toBe(409);
    expect(delLocked.data.code).toBe('DOSSIER_LOCKED');

    // Clone locked dossier into editable draft
    const dup = await apiJson(`/api/dossiers/${draft.id}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'accountant' }),
    });
    expect(dup.res.status).toBe(201);
    const cloned = dup.data.dossier as PintCheckDossier;
    expect(cloned.status).toBe('draft');
    expect(cloned.dossierNumber).toBeNull();
    expect(cloned.scopeDigestHex).toBeUndefined();

    // Public report view counter increments
    const pub1 = await apiJson(`/api/public/reports/${expectedNum}`);
    expect(pub1.res.status).toBe(200);
    expect(pub1.data.viewCount).toBe(1);

    const pub2 = await apiJson(`/api/public/reports/${expectedNum}`);
    expect(pub2.res.status).toBe(200);
    expect(pub2.data.viewCount).toBe(2);
  });

  it('supports subpath BASE_PATH=/pintcheck mounting for APIs and HTML injection', async () => {
    const subDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pintcheck-sub-'));
    const instance = createPintCheckServer({
      dataDir: subDataDir,
      distDir: tmpDistDir,
      basePath: '/pintcheck',
    });
    const subSrv = http.createServer(instance.handler);
    await new Promise<void>((resolve) => subSrv.listen(0, '127.0.0.1', () => resolve()));
    const addr = subSrv.address();
    if (!addr || typeof addr === 'string') throw new Error('Failed subserver listen');
    const subOrigin = `http://127.0.0.1:${addr.port}`;

    try {
      const healthRes = await fetch(`${subOrigin}/pintcheck/api/health`);
      expect(healthRes.status).toBe(200);
      const hJson = (await healthRes.json()) as { basePath: string; service: string };
      expect(hJson.service).toBe('pintcheck');
      expect(hJson.basePath).toBe('/pintcheck');

      const rootHtml = await fetch(`${subOrigin}/pintcheck/`);
      expect(rootHtml.status).toBe(200);
      const htmlBody = await rootHtml.text();
      expect(htmlBody).toContain('window.__PINTCHECK_BASE__="/pintcheck"');
      expect(htmlBody).toContain('/pintcheck/assets/app.js');

      const spaRoute = await fetch(`${subOrigin}/pintcheck/r/PINT-2026-0001`);
      expect(spaRoute.status).toBe(200);
      expect(await spaRoute.text()).toContain('<div id="root"></div>');
    } finally {
      await new Promise<void>((resolve) => subSrv.close(() => resolve()));
      instance.close();
      fs.rmSync(subDataDir, { recursive: true, force: true });
    }
  });
});

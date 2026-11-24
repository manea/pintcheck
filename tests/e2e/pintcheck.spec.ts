import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

async function assertNoHorizontalOverflow(page: Page) {
  const dims = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(dims.scrollWidth).toBeLessThanOrEqual(dims.innerWidth);
}

test.describe('PINTCheck — UAE PINT-AE Pre-Flight Validator, TRN Cleaner & ASP Readiness Studio E2E', () => {
  test('defaults to Arabic RTL / Pearl Dirham, toggles English LTR / Night Terminal, and persists across reload', async ({
    page,
  }) => {
    const errors: string[] = [];
    let expectPlanned400 = false;
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (expectPlanned400 && text.includes('400 (Bad Request)')) {
          expectPlanned400 = false;
          return;
        }
        errors.push(text);
      }
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    await expect(page.getByTestId('preset-btn-dubai-trading-compliant')).toBeVisible();
    await expect(page.getByTestId('studio-score-badge')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'pearl');

    await page.screenshot({
      path: 'test-results/qa-screenshots/01-studio-ar-pearl.png',
      animations: 'disabled',
    });

    await page.getByTestId('toggle-locale-btn').click();
    await page.getByTestId('toggle-theme-btn').click();

    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');

    await page.screenshot({
      path: 'test-results/qa-screenshots/02-studio-en-night.png',
      animations: 'disabled',
    });

    await page.reload();
    await expect(page.getByTestId('preset-btn-dubai-trading-compliant')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');

    // Restore Arabic RTL / Pearl Dirham defaults
    await page.getByTestId('toggle-locale-btn').click();
    await page.getByTestId('toggle-theme-btn').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'pearl');

    expect(errors).toEqual([]);
  });

  test('executes full PINT-AE audit: Abu Dhabi errors preset -> 1-click Auto-Fix -> XXE block -> BOM CSV & XML downloads -> PINT-YYYY-0001 SHA-256 finalization & /r/ route', async ({
    page,
  }) => {
    const errors: string[] = [];
    let expectPlanned400 = false;
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (expectPlanned400 && text.includes('400 (Bad Request)')) {
          expectPlanned400 = false;
          return;
        }
        errors.push(text);
      }
    });

    const year = new Date().getUTCFullYear();
    const expectedNumber = `PINT-${year}-0001`;

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // 1. Launch Abu Dhabi USD Errors preset -> detects TRN, Emirate free text, FX & VAT rate errors
    await page.getByTestId('preset-btn-abudhabi-agency-errors').click();
    await expect(page.getByTestId('studio-score-badge')).not.toContainText('100/100');
    await expect(page.getByTestId('auto-fix-btn')).toBeVisible();

    const scoreBeforeFix = ((await page.getByTestId('studio-score-badge').textContent()) ?? '').trim();

    // 2. Run 1-Click Auto-Fix -> normalizes Emirate ISO codes, FX rate & 5% VAT
    await page.getByTestId('auto-fix-btn').click();
    await expect(page.getByTestId('studio-score-badge')).not.toHaveText(scoreBeforeFix);

    // 3. Test Raw XML Importer XXE DTD protection
    await page.getByTestId('toggle-xml-import-btn').click();
    await page
      .getByTestId('raw-xml-textarea')
      .fill('<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><Invoice><cbc:ID>&xxe;</cbc:ID></Invoice>');
    expectPlanned400 = true;
    const [xxeRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/validate-xml')),
      page.getByTestId('dry-run-xml-btn').click(),
    ]);
    expect(xxeRes.status()).toBe(400);
    await expect(page.getByTestId('dry-run-error')).toBeVisible();
    await expect(page.getByTestId('dry-run-error')).toContainText(/DOCTYPE|XXE/i);
    await page.getByTestId('toggle-xml-import-btn').click();

    // 4. Launch Dubai Compliant 100/100 preset and verify XML + UTF-8 BOM CSV downloads
    await page.getByTestId('preset-btn-dubai-trading-compliant').click();
    await expect(page.getByTestId('studio-score-badge')).toContainText('100/100');

    const xmlDlPromise = page.waitForEvent('download');
    await page.getByTestId('export-xml-btn').click();
    const xmlDl = await xmlDlPromise;
    expect(xmlDl.suggestedFilename()).toContain('.xml');
    const xmlPath = await xmlDl.path();
    expect(xmlPath).toBeTruthy();
    if (xmlPath) {
      const xmlContent = fs.readFileSync(xmlPath, 'utf8');
      expect(xmlContent).toContain('urn:peppol:pint:billing-1@ae-1');
      expect(xmlContent).toContain('<cbc:CountrySubentityCode>AE-DU</cbc:CountrySubentityCode>');
    }

    const csvDlPromise = page.waitForEvent('download');
    await page.getByTestId('export-csv-btn').click();
    const csvDl = await csvDlPromise;
    expect(csvDl.suggestedFilename()).toContain('.csv');
    const csvPath = await csvDl.path();
    expect(csvPath).toBeTruthy();
    if (csvPath) {
      const bytes = fs.readFileSync(csvPath);
      expect(bytes[0]).toBe(0xef);
      expect(bytes[1]).toBe(0xbb);
      expect(bytes[2]).toBe(0xbf);
    }

    // 5. Switch to ASP Readiness tab -> update a checklist item -> finalize atomically
    await page.getByTestId('nav-tab-readiness').click();
    await expect(page.getByTestId('readiness-report-view')).toBeVisible();
    await page.getByTestId('checklist-chk-sandbox-e2e-pass').click();

    await page.getByTestId('nav-tab-studio').click();
    await page.getByTestId('finalize-dossier-btn').click();
    await expect(page.getByTestId('duplicate-dossier-btn')).toBeVisible();
    await expect(page.locator('main')).toContainText(expectedNumber);

    await page.getByTestId('nav-tab-readiness').click();
    await expect(page.getByTestId('dossier-scope-digest')).toHaveText(/^[0-9a-f]{64}$/);
    await page.getByTestId('verify-sha-btn').click();
    await expect(page.getByTestId('sha-verify-result')).toBeVisible();

    await page.screenshot({
      path: 'test-results/qa-screenshots/03-readiness-desktop.png',
      fullPage: true,
      animations: 'disabled',
    });

    // 6. Visit public read-only route /r/PINT-YYYY-0001 directly & reload
    await page.goto(`/r/${expectedNumber}`);
    await expect(page.getByTestId('readiness-report-view')).toBeVisible();
    await expect(page.getByTestId('dossier-scope-digest')).toHaveText(/^[0-9a-f]{64}$/);
    await expect(page.getByTestId('finalize-dossier-btn')).toHaveCount(0);

    await page.screenshot({
      path: 'test-results/qa-screenshots/04-public-report-desktop.png',
      fullPage: true,
      animations: 'disabled',
    });

    await page.reload();
    await expect(page.getByTestId('dossier-scope-digest')).toHaveText(/^[0-9a-f]{64}$/);

    expect(errors).toEqual([]);
  });

  test('runs CSV master-data cleaner with safe BOM export and maintains zero horizontal overflow on 390x844 mobile', async ({
    page,
  }) => {
    const errors: string[] = [];
    let expectPlanned400 = false;
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (expectPlanned400 && text.includes('400 (Bad Request)')) {
          expectPlanned400 = false;
          return;
        }
        errors.push(text);
      }
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByTestId('studio-score-badge')).toBeVisible();
    await assertNoHorizontalOverflow(page);

    // 1. Open Batch CSV Cleaner on mobile 390x844
    await page.getByTestId('nav-tab-batch').click();
    await expect(page.getByTestId('csv-batch-textarea')).toBeVisible();
    await page.getByTestId('run-csv-audit-btn').click();
    await expect(page.getByTestId('csv-audit-summary')).toBeVisible();
    await expect(page.getByTestId('csv-audit-summary')).toContainText('0235:1001122334');
    await assertNoHorizontalOverflow(page);

    await page.screenshot({
      path: 'test-results/qa-screenshots/05-csv-batch-mobile.png',
      fullPage: true,
      animations: 'disabled',
    });

    // Download cleaned CSV and assert BOM + formula neutralization ('=CMD)
    const cleanedPromise = page.waitForEvent('download');
    await page.getByTestId('download-cleaned-csv-btn').click();
    const cleanedDl = await cleanedPromise;
    const cleanedPath = await cleanedDl.path();
    expect(cleanedPath).toBeTruthy();
    if (cleanedPath) {
      const bytes = fs.readFileSync(cleanedPath);
      expect(bytes[0]).toBe(0xef);
      expect(bytes[1]).toBe(0xbb);
      expect(bytes[2]).toBe(0xbf);
      const txt = bytes.toString('utf8');
      expect(txt).toContain("'=CMD");
      expect(txt).toContain('AE-AZ');
    }

    // 2. Switch to Studio tab in Night Terminal AR RTL on mobile 390x844
    await page.getByTestId('nav-tab-studio').click();
    await page.getByTestId('toggle-theme-btn').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
    await assertNoHorizontalOverflow(page);

    await page.screenshot({
      path: 'test-results/qa-screenshots/06-studio-mobile-ar-night.png',
      fullPage: true,
      animations: 'disabled',
    });

    // Check Readiness & Profiles tabs on mobile -> zero overflow
    await page.getByTestId('nav-tab-readiness').click();
    await expect(page.getByTestId('readiness-report-view')).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await page.getByTestId('nav-tab-profiles').click();
    await assertNoHorizontalOverflow(page);

    expect(errors).toEqual([]);
  });
});

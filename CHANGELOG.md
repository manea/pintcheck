# سجل التغييرات — «PINTCheck | فحص فاتورة الإمارات»

يُوثَّق في هذا الملف كل تغيير برمجي أو معماري في مشروع **«PINTCheck»** (`projects/pintcheck/`).

---

## [0.5.0] — 2026-11-24 — المرحلة 5: الإطلاق الإنتاجي المفتوح المصدر والمصدر المفتوح (GitHub)

### المضاف
- ترقية الإصدار إلى `0.5.0` وإضافة رخصة [`LICENSE`](LICENSE) (`MIT`) وسير عمل التحقق التلقائي [`GitHub Actions CI`](.github/workflows/ci.yml) على Node 22 (`typecheck`, `test`, `build`).
- إضافة معرض اللقطات الموثقة في [`docs/screenshots/`](docs/screenshots/) (6 شاشات على سطح المكتب `1280x800` والجوال `390x844` بمظهري `Pearl Dirham` و`Night Terminal`).
- بناء سكربت التصدير المنقّى وبوابة الخصوصية [`deploy/export-public-github.sh`](deploy/export-public-github.sh) لتعقيم المسارات وتوليد معرض اللقطات والشارات والتحقق الآلي من خلو المستودع العام من أي مراجع خاصة (`EXPORT_CLEAN_OK`).
- تحديث [`README.md`](README.md) و[`launch/DEPLOY-AND-SHARE.md`](launch/DEPLOY-AND-SHARE.md) للإصدار المفتوح المصدر.

---

## [0.4.0] — 2026-11-24 — المرحلة 4: اختبارات Playwright E2E والفحص البصري وحزمة النشر $0

### المضاف
- إضافة معرفات `data-testid` محكمة في [`src/App.tsx`](src/App.tsx) و[`InvoiceValidationStudio.tsx`](src/components/InvoiceValidationStudio.tsx) و[`MasterDataBatchPanel.tsx`](src/components/MasterDataBatchPanel.tsx) و[`ReadinessReportView.tsx`](src/components/ReadinessReportView.tsx).
- إنشاء حزمة اختبارات `Playwright` الشاملة في [`tests/e2e/pintcheck.spec.ts`](tests/e2e/pintcheck.spec.ts) عبر سطح المكتب (`1280x800`) والجوال (`390x844`) على المنفذ `:4192`، تشمل: تبديل العربية `RTL`/الدرهم اللؤلؤي مع الإنجليزية `LTR`/المحطة الليلية وحفظ التفضيل، سيناريو أخطاء أبوظبي والتصحيح التلقائي السريع وحظر `XXE` (`400 XXE_BLOCKED`)، تنزيل `XML` و`UTF-8 BOM CSV`، ختم `PINT-YYYY-0001` ببصمة `SHA-256`، فتح مسار `/r/PINT-YYYY-0001` مباشرة، ومدقق CSV الدفعي دون أي طفح أفقي على الجوال.
- تحسينات المراجعة البصرية بناءً على 6 لقطات حية: تقصير مسميات الفلتر والإحصاءات لمنع التفاف السطرين في الشريط الجانبي، وتنسيق جدول مدقق CSV على الجوال بحد أدنى للعرض مع تمرير سلس (`min-w-[700px]`)، وعزل أرقام الأخطاء العربية بنص طبيعي.
- تجهيز حزمة النشر المجاني `$0`: [`wrangler.jsonc`](wrangler.jsonc) (`Cloudflare Workers Static Assets`)، [`Dockerfile`](Dockerfile)، [`.dockerignore`](.dockerignore)، [`docker-compose.yml`](docker-compose.yml)، ملفات [`deploy/`](deploy/) (`.env.example`, `Caddyfile`, `pintcheck.service`, `backup-sqlite.sh`)، [`README.md`](README.md)، ودليل [`launch/DEPLOY-AND-SHARE.md`](launch/DEPLOY-AND-SHARE.md).

### المُتحقّق منه
- `bash -n deploy/backup-sqlite.sh`: خروج `0`.
- `npm run typecheck` (`tsc --noEmit`): خروج `0`.
- `npm test` (`vitest run`): اجتياز **13/13** اختباراً عبر ملفين خلال `427ms`.
- `npm run build` (`vite build`): تحويل `2145 modules` وبناء `dist/` (`28.29 kB` CSS + `375.27 kB` JS) خلال `1.09s`.
- `npm run test:e2e`: اجتياز **3/3** اختبارات `Playwright E2E` خلال `8.1s` مع مراجعة اللقطات الست الحية في `test-results/qa-screenshots/`.

---

## [0.3.0] — 2026-11-24 — المرحلة 3: واجهة Pearl Dirham & Night Terminal (AR/EN) واستوديو الفحص XML/CSV وتقارير PDF

### المضاف
- القاعدة البصرية والتوجيه الأساسي في `index.html` و`public/favicon.svg` و`src/index.css` بمظهري **Pearl Dirham** (`#FAFAF7` + `Emirates Deep Teal #0F766E`) افتراضياً و**Night Terminal** (`#09111A`) ودعم الخطوط (`IBM Plex Sans Arabic`, `Plus Jakarta Sans`, `JetBrains Mono`) واتجاهي `AR RTL` / `EN LTR` مع عزل `.pc-*` وتنسيق الطباعة `@media print` بمقاس `A4`.
- طبقة المساعدات وعميل API الهجين في `src/lib/basePath.ts` (`window.__PINTCHECK_BASE__`)، `src/lib/i18n.ts`، و`src/lib/api.ts` (تكامل REST الكامل مع الخادم + بديل محلي متكامل عبر `localStorage` للنشر الساكن `$0` يشمل إصدار `PINT-YYYY-0001` وبصمة `SHA-256`).
- استوديو الفحص التفاعلي [`src/components/InvoiceValidationStudio.tsx`](src/components/InvoiceValidationStudio.tsx) مع حساب حي للضريبة والمكافئ بالدرهم، واستيراد/لصق `UBL 2.1 XML` مع فحص مسبق، وأداة **التصحيح التلقائي السريع** (`AE-EMIRATE`, `0235 EndpointID`, `FX AED`, `VAT Rate`)، ومهلة 2027 التنازلية.
- مدقق دفعات العملاء [`src/components/MasterDataBatchPanel.tsx`](src/components/MasterDataBatchPanel.tsx) لفحص وتطهير `CSV`، وعرض الجاهزية [`src/components/ReadinessReportView.tsx`](src/components/ReadinessReportView.tsx) لقائمة الـ 12 بنداً والتحقق من بصمة `SHA-256` والطباعة `A4 PDF` وإخلاء المسؤولية الإلزامي.
- التطبيق الرئيسي [`src/App.tsx`](src/App.tsx) مع مساري `/` و`/r/:slugOrNumber` وإدارة ملفات المنشآت `company_profiles`.

### المُتحقّق منه
- `npm run typecheck` (`tsc --noEmit`): خروج `0`.
- `npm test` (`vitest run`): اجتياز **13/13** اختباراً عبر ملفين خلال `401ms`.
- `npm run build` (`vite build`): تحويل `2145 modules` وبناء `dist/` (`28.22 kB` CSS + `374.01 kB` JS) خلال `969ms`.
- فحص تشغيل حي للـ SPA المبني على `127.0.0.1:4194`: `HTML_STATUS=200 SPA_STATUS=200 FAV_STATUS=200`, `HEALTH` (`ok: true`, `version: "0.3.0"`), `UI_SMOKE_OK`.

---

## [0.2.0] — 2026-11-24 — المرحلة 2: خادم Node 22 + SQLite WAL وواجهات API وتقارير PINT-YYYY-0001 الذرية

### المضاف
- قاعدة بيانات `SQLite` عبر `node:sqlite` في `server/db.mjs` (`WAL`, `FULL`, `busy_timeout=5000`, `foreign_keys=ON`) تشمل الجداول `dossiers`, `company_profiles`, `dossier_counters`, `dossier_events` وإصداراً ذرياً `BEGIN IMMEDIATE ... COMMIT` للأرقام التسلسلية `PINT-YYYY-0001` مع بصمة `SHA-256` وأقفال `409 DOSSIER_LOCKED` / `ALREADY_LOCKED`.
- خادم HTTP وإطار الواجهات في `server/app.mjs` و`server/app.d.mts` و`server/index.mjs` على المنفذ الافتراضي `4191` مع دعم `PINTCHECK_DATA_DIR` و`BASE_PATH` وحقن `window.__PINTCHECK_BASE__` وترويسات الأمان وحد حمولة `5 MB`.
- نقاط النهاية: `/api/health`، `/api/presets`، `/api/validate-xml` (مع حظر XXE برمز `400 XXE_BLOCKED`)، `/api/batch-csv`، CRUD لـ `/api/profiles*` و`/api/dossiers*`، `/duplicate`، `/finalize`، `/export.xml`، `/export.csv` (`UTF-8 BOM` + تعطيل حقن الصيغ)، `/summary`، و`/api/public/reports/:slugOrNumber`.
- حزمة اختبارات التكامل `tests/unit/pintcheckServer.test.ts` (5 اختبارات شاملة).

### المُتحقّق منه
- `npm run typecheck` (`tsc --noEmit`): خروج `0`.
- `npm test`: اجتياز **13/13** اختباراً عبر ملفين (`pintcheckCore.test.ts` 8 اختبارات + `pintcheckServer.test.ts` 5 اختبارات) خلال `477ms`.
- فحص تشغيل حي معزول على `127.0.0.1:4193`: `HEALTH` (`ok: true`, `version: "0.2.0"`), `PRESETS_STATUS=200`, `SERVER_SMOKE_OK`.

---

## [0.1.0] — 2026-11-24 — المرحلة 1: التوثيق وهيكلة المشروع والمحرك الأساسي PINT AE / UBL 2.1 XML

### الإضافات والتغييرات
- إعداد التوثيق المعماري والتنظيمي الكامل لمتطلبات الفوترة الإلكترونية الإماراتية (`PINT-AE / OpenPeppol UBL 2.1`) ومهل 2027 داخل [`../../research/10-pintcheck-spec-and-architecture.md`](../../research/10-pintcheck-spec-and-architecture.md).
- تأسيس بنية المشروع (`package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `.gitignore`) للمنفذ المحلي `:4191` ومنفذ E2E `:4192`.
- بناء المحرك الأساسي المتماثل والصفري الاعتماديات داخل [`src/core/`](src/core/): `types.ts`, `uaeRules.ts`, `validator.ts`, `ublXml.ts`, `batchCsv.ts`, `readiness.ts`, `dossierDigest.ts`, و`presets.ts`.

### التحقق والاختبار
- `npm run typecheck`: نجاح كامل (`tsc --noEmit` بخروج `0`).
- `npm test`: اجتياز **8/8** اختبارات Vitest في [`tests/unit/pintcheckCore.test.ts`](tests/unit/pintcheckCore.test.ts) خلال `490ms` (تشمل قواعد TRN ذي الـ 15 خانة ورموز الإمارات السبعة `AE-*` وتوليد/تحليل `UBL 2.1 XML` ومنع `XXE` وتنظيف دفعات CSV ومحاسبة مهل 2027 وبصمة `SHA-256`).
- التحقق من استيراد `Node 22` المباشر لوحدات `src/core/*.ts` (`NODE22_CORE_PRESETS=3`).

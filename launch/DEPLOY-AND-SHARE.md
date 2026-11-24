# دليل النشر المجاني ($0) والمشاركة الأخلاقية — PINTCheck | فحص فاتورة الإمارات

يوفّر هذا الدليل مسارَي نشر عمليين بميزانية ابتدائية **\$0** لتشغيل **PINTCheck** للشركات الإماراتية ومكاتب المحاسبة ومطوري أنظمة الفوترة، مع مسودات مشاركة مجتمعية أخلاقية وشفافية تنظيمية كاملة.

---

## المسار أ: النشر الساكن المجاني والآمن تجارياً ($0 — Cloudflare Workers Static Assets)

> **ضوابط التراخيص التجارية**: يعتمد الاستوديو حصراً على **Cloudflare Workers Static Assets / Pages** للنشر المجاني الآمن تجارياً؛ ويُحظر استخدام **Vercel Hobby** (غير تجاري فقط) أو **GitHub Pages** (مقيّد تجارياً للمشاريع التجارية).

في وضع الاستضافة الساكنة يعمل **PINTCheck** بالكامل داخل متصفح المستخدم (`src/core/*` + `localStorage` عبر `src/lib/api.ts`) دون إرسال أي أرقام ضريبية أو فواتير أو قوائم عملاء إلى خادم خارجي.

```bash
cd projects/pintcheck
npm ci
npm run build
npx wrangler login
npx wrangler deploy
```

ملف التهيئة الجاهز: [`wrangler.jsonc`](../wrangler.jsonc) (`assets.directory = "./dist"`, `not_found_handling = "single-page-application"`).

---

## المسار ب: التشغيل المتكامل الكامل (Node 22 + SQLite WAL + تقارير `PINT-YYYY-0001`)

لتفعيل قاعدة البيانات المشتركة `SQLite WAL` على المنفذ **4191**، وحفظ ملفات المنشآت `company_profiles`، وإصدار تقارير الجاهزية المرقمة ذرياً (`PINT-YYYY-0001`) والمختومة ببصمة `SHA-256` مع روابط مشاركة عامة `/r/:slugOrNumber`:

### 1) عبر Docker Compose (خادم شخصي أو VPS اقتصادي)
```bash
cd projects/pintcheck
cp deploy/.env.example .env
# عدّل APP_ORIGIN و BASE_PATH عند الحاجة
docker compose up -d --build
curl -sf http://127.0.0.1:4191/api/health
```

### 2) عبر Node 22 + systemd + Caddy HTTPS (:4191)
1. انسخ [`deploy/.env.example`](../deploy/.env.example) إلى مجلد البيانات (مثلاً `~/srv-data/pintcheck/.env`) واضبط `PINTCHECK_DATA_DIR` و`BASE_PATH` (مثلاً `/pintcheck`) و`APP_ORIGIN`.
2. ابْنِ الواجهة الإنتاجية:
   ```bash
   npm ci && npm run build
   ```
3. ثبّت وحدة الخدمة [`deploy/pintcheck.service`](../deploy/pintcheck.service) واربطها خلف [`deploy/Caddyfile`](../deploy/Caddyfile).
4. جدوِل النسخ الاحتياطي الآمن عبر `VACUUM INTO` باستخدام [`deploy/backup-sqlite.sh`](../deploy/backup-sqlite.sh):
   ```bash
   PINTCHECK_DATA_DIR=/path/to/data ./deploy/backup-sqlite.sh
   ```

---

## مسودات المشاركة الأخلاقية ($0 Zero-Budget Community Sharing)

### 1) LinkedIn / X Post (عربي — رواد الأعمال والمحاسبون في الإمارات)
> مع اقتراب المواعيد الإلزامية لمنظومة الفوترة الإلكترونية الإماراتية (تعيين مزود الخدمة المعتمد **ASP** للشركات `< 50 مليون درهم` بحلول **31 مارس 2027** والتطبيق الإلزامي **1 يوليو 2027**)، أكثر أسباب رفض الفواتير شيوعاً ليست في واجهة النظام، بل في بيانات `TRN` الناقصة ورموز الإمارات المكتوبة كنص حر مثل `"Dubai"` بدلاً من `AE-DU`!
>
> لذلك طوّرنا أداة **«PINTCheck | فحص فاتورة الإمارات»** المجانية ومفتوحة المصدر (`0$`):
> - فحص فوري للفواتير وإشعارات الدائن بصيغة **PINT-AE / Peppol UBL 2.1 XML** ومطابقة `EndpointID schemeID="0235"` مع أول 10 أرقام من الـ TRN.
> - مطهر دفعات **CSV** لتنظيف الأرقام الضريبية وأسماء الإمارات قبل تسليم البيانات لأي مزود ASP.
> - التحقق من ضريبة القيمة المضافة بالدرهم `TaxCurrencyCode=AED` في الفواتير الأجنبية + قائمة تحقق من 12 بنداً وتقرير `A4 PDF` مختوم ببصمة `SHA-256`.
> - (*تنويه واضح: أداة فحص مسبق وتجهيز بيانات — وليست مزود خدمة معتمد ASP لدى وزارة المالية*).

### 2) LinkedIn / Dev Community Post (English — UAE ERP Teams, Accountants & CTOs)
> Preparing for **UAE Ministry of Finance E-Invoicing (Ministerial Decisions 243 & 244)** (`Mar 31, 2027` ASP deadline & `Jul 1, 2027` go-live for SMEs < AED 50M)?
>
> Unlike centralized clearance portals, UAE's **Peppol 5-Corner DCTCE** model rejects documents over silent master-data & XML gaps (`EndpointID schemeID="0235"`, free-text `"Abu Dhabi"` instead of ISO `AE-AZ`, missing dual `TaxTotal currencyID="AED"` on USD invoices).
>
> We built **PINTCheck** (`$0`, runs locally in browser or self-hosted with `Node 22 + SQLite WAL`):
> - Deterministic PINT-AE pre-flight validator with 1-click Auto-Fix & live **UBL 2.1 XML** generator/XXE-safe parser.
> - Bulk **CSV Master-Data TRN & Emirate Cleaner** exporting formula-safe UTF-8 BOM sheets.
> - **12-control ASP Readiness Checklist**, `SHA-256` sealed dossiers (`PINT-YYYY-0001`), and bilingual **AR RTL / EN LTR** `A4 PDF` briefs.
> - *(Clear regulatory disclaimer: pre-flight preparation tool — NOT an MoF Accredited Service Provider).*

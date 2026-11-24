import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileCheck2,
  FileSpreadsheet,
  Languages,
  Lock,
  Moon,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Sun,
  Trash2,
} from 'lucide-react';
import { InvoiceValidationStudio } from './components/InvoiceValidationStudio.tsx';
import { MasterDataBatchPanel } from './components/MasterDataBatchPanel.tsx';
import { ReadinessReportView } from './components/ReadinessReportView.tsx';
import type { PintCheckPresetMeta } from './core/presets.ts';
import type { Locale, RevenueTier } from './core/types.ts';
import { UAE_EMIRATES } from './core/uaeRules.ts';
import { generatePintAeXml } from './core/ublXml.ts';
import {
  buildIssuesCsvClient,
  createDossierFromPresetApi,
  createProfileApi,
  deleteDossierApi,
  deleteProfileApi,
  duplicateDossierApi,
  fetchPresets,
  finalizeDossierApi,
  getDossierApi,
  getPublicReportApi,
  listDossiers,
  listProfilesApi,
  triggerTextDownload,
  updateDossierApi,
  type CompanyProfileRecord,
  type DossierBundle,
  type DossierListRecord,
  type DossierStats,
  type PresetSummary,
  type UpdateDossierPayload,
} from './lib/api.ts';
import { stripBase, withBase } from './lib/basePath.ts';
import { formatMoney, getCopy } from './lib/i18n.ts';

type ThemeMode = 'pearl' | 'night';
type StudioTab = 'studio' | 'batch' | 'readiness' | 'profiles';
type DossierFilter = 'all' | 'draft' | 'locked';

type AppRoute =
  | { kind: 'studio' }
  | { kind: 'public'; slugOrNumber: string };

function parseRoute(pathname: string): AppRoute {
  const clean = stripBase(pathname).replace(/\/+$/, '') || '/';
  const match = /^\/r\/([^/]+)$/.exec(clean);
  if (match?.[1]) {
    try {
      return { kind: 'public', slugOrNumber: decodeURIComponent(match[1]) };
    } catch {
      return { kind: 'public', slugOrNumber: match[1] };
    }
  }
  return { kind: 'studio' };
}

function readInitialLocale(): Locale {
  try {
    const saved = window.localStorage.getItem('pintcheck_locale');
    if (saved === 'en' || saved === 'ar') return saved;
  } catch {
    // ignore storage errors
  }
  return 'ar';
}

function readInitialTheme(): ThemeMode {
  try {
    const saved = window.localStorage.getItem('pintcheck_theme');
    if (saved === 'night' || saved === 'pearl') return saved;
  } catch {
    // ignore storage errors
  }
  return 'pearl';
}

export function App() {
  const [locale, setLocale] = useState<Locale>(readInitialLocale);
  const [theme, setTheme] = useState<ThemeMode>(readInitialTheme);
  const [route, setRoute] = useState<AppRoute>(() => parseRoute(window.location.pathname));

  const [activeTab, setActiveTab] = useState<StudioTab>('studio');
  const [activeDossierId, setActiveDossierId] = useState<string | null>(null);
  const [filter, setFilter] = useState<DossierFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [dossiers, setDossiers] = useState<DossierListRecord[]>([]);
  const [stats, setStats] = useState<DossierStats>({
    totalDossiers: 0,
    draftDossiers: 0,
    lockedDossiers: 0,
    companyProfilesCount: 0,
  });
  const [profiles, setProfiles] = useState<CompanyProfileRecord[]>([]);
  const [localOnly, setLocalOnly] = useState(false);

  const [activeBundle, setActiveBundle] = useState<DossierBundle | null>(null);
  const [publicBundle, setPublicBundle] = useState<DossierBundle | null>(null);
  const [publicError, setPublicError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Company profile form state
  const [profName, setProfName] = useState('');
  const [profTrn, setProfTrn] = useState('');
  const [profEmirate, setProfEmirate] = useState('AE-DU');
  const [profCity, setProfCity] = useState('Dubai');
  const [profAddress, setProfAddress] = useState('');
  const [profTier, setProfTier] = useState<RevenueTier>('sme_under_50m');

  const copy = useMemo(() => getCopy(locale), [locale]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((curr) => (curr === msg ? null : curr)), 2400);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    try {
      window.localStorage.setItem('pintcheck_locale', locale);
    } catch {
      // ignore
    }
  }, [locale]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'night' ? '#09111A' : '#FAFAF7');
    }
    try {
      window.localStorage.setItem('pintcheck_theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const refreshStudioData = useCallback(async (preferredId?: string | null) => {
    setLoading(true);
    setBannerError(null);
    try {
      const [presetList, listRes, profList] = await Promise.all([
        fetchPresets(),
        listDossiers(),
        listProfilesApi(),
      ]);
      setPresets(presetList);
      setProfiles(profList);
      setLocalOnly(listRes.localOnly);

      if (listRes.dossiers.length === 0) {
        const seeded = await createDossierFromPresetApi('dubai-trading-compliant');
        const reloaded = await listDossiers();
        setDossiers(reloaded.dossiers);
        setStats(reloaded.stats);
        setActiveDossierId(seeded.dossier.id);
        setActiveBundle(seeded);
      } else {
        setDossiers(listRes.dossiers);
        setStats(listRes.stats);
        const targetId =
          preferredId && listRes.dossiers.some((d) => d.id === preferredId)
            ? preferredId
            : activeDossierId && listRes.dossiers.some((d) => d.id === activeDossierId)
              ? activeDossierId
              : listRes.dossiers[0]!.id;
        setActiveDossierId(targetId);
        const bundle = await getDossierApi(targetId);
        setActiveBundle(bundle);
      }
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to load workspace');
    } finally {
      setLoading(false);
    }
  }, [activeDossierId]);

  useEffect(() => {
    if (route.kind === 'public') {
      setLoading(true);
      setPublicError(null);
      getPublicReportApi(route.slugOrNumber)
        .then((bundle) => {
          setPublicBundle(bundle);
          setLocale(bundle.dossier.defaultLocale || 'ar');
        })
        .catch((err) => {
          setPublicError(err instanceof Error ? err.message : 'Report not found');
        })
        .finally(() => setLoading(false));
    } else {
      void refreshStudioData();
    }
  }, [route.kind, route.kind === 'public' ? route.slugOrNumber : '']);

  const selectDossier = async (id: string) => {
    setActiveDossierId(id);
    setBannerError(null);
    try {
      const bundle = await getDossierApi(id);
      setActiveBundle(bundle);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to load dossier');
    }
  };

  const handleLaunchPreset = async (presetId: PintCheckPresetMeta['id']) => {
    setBusy(true);
    setBannerError(null);
    try {
      const created = await createDossierFromPresetApi(presetId);
      setActiveDossierId(created.dossier.id);
      setActiveBundle(created);
      setActiveTab('studio');
      await refreshStudioData(created.dossier.id);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to create dossier');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateDossier = async (patch: UpdateDossierPayload) => {
    if (!activeBundle) return;
    setBusy(true);
    setBannerError(null);
    try {
      const updated = await updateDossierApi(activeBundle.dossier.id, patch);
      setActiveBundle(updated);
      const listRes = await listDossiers();
      setDossiers(listRes.dossiers);
      setStats(listRes.stats);
      showToast(locale === 'ar' ? 'تم الحفظ وإعادة الفحص بنجاح' : 'Saved & re-validated');
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const handleFinalize = async () => {
    if (!activeBundle) return;
    setBusy(true);
    setBannerError(null);
    try {
      const locked = await finalizeDossierApi(activeBundle.dossier.id);
      setActiveBundle(locked);
      const listRes = await listDossiers();
      setDossiers(listRes.dossiers);
      setStats(listRes.stats);
      showToast(`${locked.dossier.dossierNumber || ''} ✓`);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Finalize failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDuplicate = async () => {
    if (!activeBundle) return;
    setBusy(true);
    setBannerError(null);
    try {
      const cloned = await duplicateDossierApi(activeBundle.dossier.id);
      setActiveDossierId(cloned.dossier.id);
      setActiveBundle(cloned);
      await refreshStudioData(cloned.dossier.id);
      showToast(locale === 'ar' ? 'تم إنشاء مسودة مستنسخة' : 'Draft duplicated');
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Duplicate failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!activeBundle || activeBundle.dossier.status === 'locked') return;
    setBusy(true);
    setBannerError(null);
    try {
      await deleteDossierApi(activeBundle.dossier.id);
      setActiveDossierId(null);
      setActiveBundle(null);
      await refreshStudioData(null);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadXml = () => {
    if (!activeBundle) return;
    const d = activeBundle.dossier;
    const xmlOut =
      d.rawXmlSource && d.rawXmlMeta
        ? d.rawXmlSource
        : generatePintAeXml(d.invoice, d.validation.calculation);
    const fname = d.dossierNumber || d.slug || d.id;
    triggerTextDownload(`pintcheck-${fname}.xml`, xmlOut, 'application/xml; charset=utf-8');
  };

  const handleDownloadCsv = () => {
    if (!activeBundle) return;
    const d = activeBundle.dossier;
    const csvOut = buildIssuesCsvClient(d, locale);
    const fname = d.dossierNumber || d.slug || d.id;
    triggerTextDownload(`pintcheck-${fname}-${locale}.csv`, csvOut, 'text/csv; charset=utf-8');
  };

  const handleCopyPublicLink = async () => {
    if (!activeBundle) return;
    const url =
      activeBundle.publicReportUrl ||
      `${window.location.origin}${withBase(
        `/r/${encodeURIComponent(activeBundle.dossier.dossierNumber || activeBundle.dossier.slug)}`,
      )}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast(copy.copiedToast);
    } catch {
      showToast(url);
    }
  };

  const handleCreateProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!profName.trim()) return;
    setBusy(true);
    setBannerError(null);
    try {
      const created = await createProfileApi({
        legalName: profName.trim(),
        trn: profTrn.trim(),
        emirateCode: profEmirate,
        city: profCity.trim() || 'Dubai',
        streetAddress: profAddress.trim(),
        revenueTier: profTier,
      });
      setProfiles((prev) => [created, ...prev]);
      setProfName('');
      setProfTrn('');
      setProfAddress('');
      showToast(locale === 'ar' ? 'تم حفظ ملف المنشأة' : 'Company profile saved');
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Profile save failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveCurrentSellerAsProfile = async () => {
    if (!activeBundle) return;
    const s = activeBundle.dossier.invoice.seller;
    setBusy(true);
    try {
      const created = await createProfileApi({
        legalName: s.legalName,
        trn: s.trn,
        emirateCode: s.emirateCode,
        city: s.city,
        streetAddress: s.streetAddress,
        revenueTier: activeBundle.dossier.revenueTier,
      });
      setProfiles((prev) => [created, ...prev]);
      showToast(locale === 'ar' ? 'تم حفظ بيانات المورّد الحالي' : 'Active seller saved as profile');
    } finally {
      setBusy(false);
    }
  };

  const filteredDossiers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return dossiers.filter((d) => {
      if (filter !== 'all' && d.status !== filter) return false;
      if (!q) return true;
      return (
        d.dossier.organizationName.toLowerCase().includes(q) ||
        d.dossier.invoice.invoiceNumber.toLowerCase().includes(q) ||
        (d.dossierNumber || '').toLowerCase().includes(q) ||
        d.dossier.organizationTrn.toLowerCase().includes(q)
      );
    });
  }, [dossiers, filter, searchQuery]);

  // Top Controls Bar Shared Helper
  const renderTopControls = () => (
    <div className="flex flex-wrap items-center gap-2 no-print">
      <button
        type="button"
        data-testid="toggle-locale-btn"
        onClick={() => setLocale((l) => (l === 'ar' ? 'en' : 'ar'))}
        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
      >
        <Languages className="h-3.5 w-3.5 text-[var(--accent-teal)]" />
        {copy.langSwitchLabel}
      </button>

      <button
        type="button"
        data-testid="toggle-theme-btn"
        onClick={() => setTheme((t) => (t === 'pearl' ? 'night' : 'pearl'))}
        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
      >
        {theme === 'pearl' ? (
          <>
            <Moon className="h-3.5 w-3.5 text-[var(--accent-teal)]" />
            {copy.themeNight}
          </>
        ) : (
          <>
            <Sun className="h-3.5 w-3.5 text-[var(--accent-amber)]" />
            {copy.themePearl}
          </>
        )}
      </button>
    </div>
  );

  // PUBLIC READ-ONLY VIEW (/r/:slugOrNumber)
  if (route.kind === 'public') {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)]">
        <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] no-print">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-teal)] text-[var(--accent-teal-fg)]">
                <FileCheck2 className="h-5 w-5" />
              </div>
              <div>
                <div className="pc-display text-sm font-extrabold">{copy.brandTitle}</div>
                <div className="text-[11px] text-[var(--text-secondary)]">{copy.publicViewNotice}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {renderTopControls()}
              <button
                type="button"
                onClick={() => {
                  window.history.pushState(null, '', withBase('/'));
                  setRoute({ kind: 'studio' });
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-teal)] px-3 py-1.5 text-xs font-bold text-[var(--accent-teal-fg)]"
              >
                {locale === 'ar' ? <ArrowRight className="h-3.5 w-3.5" /> : <ArrowLeft className="h-3.5 w-3.5" />}
                {copy.backToStudioBtn}
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6">
          {loading ? (
            <div className="pc-card rounded-2xl p-8 text-center text-sm text-[var(--text-secondary)]">
              {locale === 'ar' ? 'جارٍ تحميل التقرير...' : 'Loading readiness report...'}
            </div>
          ) : publicError || !publicBundle ? (
            <div className="pc-card rounded-2xl p-8 text-center">
              <ShieldAlert className="mx-auto h-8 w-8 text-[var(--accent-crimson)]" />
              <p className="mt-2 text-sm font-bold text-[var(--accent-crimson)]">
                {publicError || 'Report not found'}
              </p>
            </div>
          ) : (
            <ReadinessReportView
              dossier={publicBundle.dossier}
              events={publicBundle.dossierEvents}
              locale={locale}
              copy={copy}
              readOnly
              onPrintReport={() => window.print()}
            />
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      {/* Top App Bar */}
      <header className="sticky top-0 z-20 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 backdrop-blur no-print">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-teal)] text-[var(--accent-teal-fg)] shadow-sm">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="pc-display text-base font-extrabold tracking-tight sm:text-lg">
                  {copy.brandTitle}
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--accent-teal)]">
                  <Database className="h-3 w-3" />
                  {localOnly ? copy.localModeBadge : copy.serverModeBadge}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)]">{copy.brandSubtitle}</p>
            </div>
          </div>

          {renderTopControls()}
        </div>

        {/* Navigation Tabs & Presets Quick Launcher */}
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-4 py-2">
          <nav className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'studio', label: copy.navStudio, icon: Sparkles },
                { id: 'batch', label: copy.navBatchCsv, icon: FileSpreadsheet },
                { id: 'readiness', label: copy.navReadiness, icon: ClipboardCheck },
                { id: 'profiles', label: copy.navProfiles, icon: Building2 },
              ] as const
            ).map(({ id, label, icon: Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`nav-tab-${id}`}
                  onClick={() => setActiveTab(id)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    active
                      ? 'bg-[var(--accent-teal)] text-[var(--accent-teal-fg)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </nav>

          <div className="flex flex-wrap items-center gap-1.5">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                data-testid={`preset-btn-${p.id}`}
                disabled={busy}
                onClick={() => handleLaunchPreset(p.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[11px] font-semibold hover:bg-[var(--bg-soft)] disabled:opacity-50"
                title={locale === 'ar' ? p.nameAr : p.nameEn}
              >
                <Plus className="h-3 w-3 text-[var(--accent-teal)]" />
                {locale === 'ar' ? p.badgeAr : p.badgeEn}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Alerts & Toast */}
      {toast && (
        <div className="fixed bottom-5 end-5 z-50 flex items-center gap-2 rounded-xl bg-[var(--accent-teal)] px-4 py-2.5 text-xs font-bold text-[var(--accent-teal-fg)] shadow-lg no-print">
          <CheckCircle2 className="h-4 w-4" />
          <span>{toast}</span>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-5">
        {bannerError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-[var(--accent-crimson)]/40 bg-[var(--accent-crimson-soft)] px-4 py-3 text-xs font-bold text-[var(--accent-crimson)] no-print">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{bannerError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Dossier Sidebar */}
          <aside className="space-y-4 lg:col-span-3 no-print">
            <section className="pc-card rounded-2xl p-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-[var(--bg-elevated)] p-2">
                  <div className="num-tabular text-base font-extrabold" dir="ltr">{stats.totalDossiers}</div>
                  <div className="text-[10px] text-[var(--text-secondary)]">{copy.statsTotal}</div>
                </div>
                <div className="rounded-xl bg-[var(--bg-elevated)] p-2">
                  <div className="num-tabular text-base font-extrabold text-[var(--accent-amber)]" dir="ltr">
                    {stats.draftDossiers}
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)]">{copy.statsDrafts}</div>
                </div>
                <div className="rounded-xl bg-[var(--bg-elevated)] p-2">
                  <div className="num-tabular text-base font-extrabold text-[var(--accent-emerald)]" dir="ltr">
                    {stats.lockedDossiers}
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)]">{copy.statsLocked}</div>
                </div>
              </div>

              <div className="relative mt-3">
                <Search className="pointer-events-none absolute top-2.5 start-2.5 h-3.5 w-3.5 text-[var(--text-secondary)]" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={copy.searchPlaceholder}
                  className="pc-input ps-8 text-xs"
                />
              </div>

              <div className="mt-2.5 flex gap-1">
                {(['all', 'draft', 'locked'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={`flex-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition ${
                      filter === f
                        ? 'bg-[var(--accent-teal)] text-[var(--accent-teal-fg)]'
                        : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {f === 'all' ? copy.filterAll : f === 'draft' ? copy.filterDraft : copy.filterLocked}
                  </button>
                ))}
              </div>

              <div className="mt-3 max-h-[520px] space-y-2 overflow-y-auto" data-testid="dossiers-list">
                {loading && dossiers.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[var(--text-secondary)]">...</div>
                ) : (
                  filteredDossiers.map((rec) => {
                    const selected = rec.id === activeBundle?.dossier.id;
                    const calc = rec.dossier.validation.calculation;
                    return (
                      <button
                        key={rec.id}
                        type="button"
                        onClick={() => selectDossier(rec.id)}
                        className={`w-full rounded-xl border p-3 text-start transition ${
                          selected
                            ? 'border-[var(--accent-teal)] bg-[var(--bg-soft)]'
                            : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 hover:bg-[var(--bg-elevated)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="pc-mono text-[11px] font-bold text-[var(--accent-teal)]" dir="ltr">
                            {rec.dossierNumber || rec.dossier.invoice.invoiceNumber}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              rec.dossier.validation.valid
                                ? 'bg-[var(--accent-emerald-soft)] text-[var(--accent-emerald)]'
                                : 'bg-[var(--accent-crimson-soft)] text-[var(--accent-crimson)]'
                            }`}
                            dir="ltr"
                          >
                            {rec.dossier.validation.passScore}%
                          </span>
                        </div>
                        <div className="mt-1 truncate text-xs font-bold text-[var(--text-primary)]">
                          {rec.dossier.organizationName}
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                          <span className="pc-mono num-tabular" dir="ltr">
                            {formatMoney(calc.payableAmount, calc.currency, locale)}
                          </span>
                          {rec.status === 'locked' && <Lock className="h-3 w-3 text-[var(--accent-emerald)]" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            {/* Always-Visible Compact Regulatory Notice */}
            <div className="rounded-2xl border border-[var(--accent-amber)]/35 bg-[var(--accent-amber-soft)] p-3.5 text-[11px] leading-relaxed text-[var(--text-primary)]">
              <strong className="block font-bold">
                {locale === 'ar' ? 'إخلاء مسؤولية تنظيمي:' : 'Regulatory Scope:'}
              </strong>
              {copy.disclaimerShort}
            </div>
          </aside>

          {/* Main Workspace Area */}
          <div className="lg:col-span-9">
            {activeTab === 'studio' && activeBundle && (
              <InvoiceValidationStudio
                dossier={activeBundle.dossier}
                locale={locale}
                copy={copy}
                busy={busy}
                profiles={profiles}
                onUpdateDossier={handleUpdateDossier}
                onFinalize={handleFinalize}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
                onDownloadXml={handleDownloadXml}
                onDownloadCsv={handleDownloadCsv}
                onCopyPublicLink={handleCopyPublicLink}
                onPrintReport={() => {
                  setActiveTab('readiness');
                  window.setTimeout(() => window.print(), 150);
                }}
              />
            )}

            {activeTab === 'batch' && (
              <MasterDataBatchPanel
                dossier={activeBundle?.dossier ?? null}
                locale={locale}
                copy={copy}
                busy={busy}
                onAttachCsvToDossier={async (csvText) => {
                  await handleUpdateDossier({ csvText });
                }}
              />
            )}

            {activeTab === 'readiness' && activeBundle && (
              <ReadinessReportView
                dossier={activeBundle.dossier}
                events={activeBundle.dossierEvents}
                locale={locale}
                copy={copy}
                busy={busy}
                onUpdateChecks={handleUpdateDossier}
                onPrintReport={() => window.print()}
              />
            )}

            {activeTab === 'profiles' && (
              <section className="pc-card rounded-2xl p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-bold">
                      <Building2 className="h-5 w-5 text-[var(--accent-teal)]" />
                      {copy.profilesTitle}
                    </h2>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">{copy.profilesSubtitle}</p>
                  </div>
                  {activeBundle && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleSaveCurrentSellerAsProfile}
                      className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3.5 py-2 text-xs font-semibold hover:bg-[var(--bg-soft)]"
                    >
                      + {locale === 'ar' ? 'حفظ المورّد النشط كملف' : 'Save Active Seller as Profile'}
                    </button>
                  )}
                </div>

                <form onSubmit={handleCreateProfile} className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 sm:grid-cols-3">
                  <input
                    required
                    value={profName}
                    onChange={(e) => setProfName(e.target.value)}
                    placeholder={locale === 'ar' ? 'الاسم القانوني للشركة' : 'Company Legal Name'}
                    className="pc-input text-xs"
                  />
                  <input
                    dir="ltr"
                    value={profTrn}
                    onChange={(e) => setProfTrn(e.target.value)}
                    placeholder="TRN (100xxxxxxxxx003)"
                    className="pc-input pc-mono text-xs"
                  />
                  <select
                    value={profEmirate}
                    onChange={(e) => setProfEmirate(e.target.value)}
                    className="pc-input text-xs"
                  >
                    {UAE_EMIRATES.map((em) => (
                      <option key={em.code} value={em.code}>
                        {em.code} — {locale === 'ar' ? em.nameAr : em.nameEn}
                      </option>
                    ))}
                  </select>
                  <input
                    value={profCity}
                    onChange={(e) => setProfCity(e.target.value)}
                    placeholder={locale === 'ar' ? 'المدينة' : 'City'}
                    className="pc-input text-xs"
                  />
                  <input
                    value={profAddress}
                    onChange={(e) => setProfAddress(e.target.value)}
                    placeholder={locale === 'ar' ? 'العنوان التفصيلي' : 'Street Address'}
                    className="pc-input text-xs"
                  />
                  <div className="flex gap-2">
                    <select
                      value={profTier}
                      onChange={(e) => setProfTier(e.target.value as RevenueTier)}
                      className="pc-input text-xs"
                    >
                      <option value="sme_under_50m">{copy.tierSme}</option>
                      <option value="large_over_50m">{copy.tierLarge}</option>
                    </select>
                    <button
                      type="submit"
                      disabled={busy}
                      className="shrink-0 rounded-xl bg-[var(--accent-teal)] px-4 py-2 text-xs font-bold text-[var(--accent-teal-fg)] hover:bg-[var(--accent-teal-hover)]"
                    >
                      {copy.createProfileBtn}
                    </button>
                  </div>
                </form>

                {profiles.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--border-strong)] p-6 text-center text-xs text-[var(--text-secondary)]">
                    {locale === 'ar'
                      ? 'لا توجد ملفات منشآت محفوظة بعد. احفظ بيانات المورّد لإعادة استخدامها.'
                      : 'No saved seller profiles yet. Create one above or import from the active dossier.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {profiles.map((prof) => (
                      <div
                        key={prof.id}
                        className="flex flex-col justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4"
                      >
                        <div>
                          <div className="font-bold text-sm">{prof.name}</div>
                          <div className="pc-mono mt-1 text-xs text-[var(--text-secondary)]" dir="ltr">
                            TRN: {prof.profile.trn || '—'} · {prof.profile.emirateCode}
                          </div>
                          {prof.profile.streetAddress && (
                            <div className="mt-1 text-xs text-[var(--text-secondary)]">
                              {prof.profile.streetAddress} ({prof.profile.city})
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          {activeBundle && activeBundle.dossier.status !== 'locked' && (
                            <button
                              type="button"
                              onClick={async () => {
                                const trnRaw = prof.profile.trn.replace(/[\s-]+/g, '');
                                await handleUpdateDossier({
                                  organizationName: prof.profile.legalName || prof.name,
                                  revenueTier: prof.profile.revenueTier,
                                  invoice: {
                                    ...activeBundle.dossier.invoice,
                                    seller: {
                                      ...activeBundle.dossier.invoice.seller,
                                      legalName: prof.profile.legalName || prof.name,
                                      trn: prof.profile.trn,
                                      peppolSchemeId: '0235',
                                      peppolEndpointId: trnRaw.length >= 10 ? trnRaw.slice(0, 10) : '',
                                      emirateCode: prof.profile.emirateCode,
                                      city: prof.profile.city,
                                      streetAddress: prof.profile.streetAddress,
                                    },
                                  },
                                });
                                setActiveTab('studio');
                              }}
                              className="rounded-lg bg-[var(--accent-teal)] px-3 py-1.5 text-xs font-bold text-[var(--accent-teal-fg)]"
                            >
                              {copy.applySellerProfileBtn}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              await deleteProfileApi(prof.id);
                              setProfiles((prev) => prev.filter((x) => x.id !== prof.id));
                            }}
                            className="rounded-lg p-1.5 text-[var(--accent-crimson)] hover:bg-[var(--accent-crimson-soft)]"
                            title={locale === 'ar' ? 'حذف' : 'Delete'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {!activeBundle && !loading && activeTab !== 'batch' && activeTab !== 'profiles' && (
              <section className="pc-card rounded-2xl p-8 text-center">
                <h2 className="text-lg font-bold">{copy.noDossiersTitle}</h2>
                <p className="mt-2 text-xs text-[var(--text-secondary)]">{copy.noDossiersBody}</p>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

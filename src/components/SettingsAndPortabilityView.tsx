import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  LogOut,
  Moon,
  ShieldAlert,
  Smartphone,
  Sun,
  Target,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  ImportConflictStrategy,
  ImportValidationResult,
  MeasurementSystem,
  ThemePreference,
  UserProfile,
} from '../types/domain';
import {
  buildImportExecutionPlan,
  createBackupPayload,
  generateFoodDiaryCsv,
  serializeBackupToJson,
  validateAndPreviewBackupJson,
} from '../services/dataPortabilityService';
import { calculateCaloriesFromMacros } from '../utils/nutritionCalculator';
import { useApp } from '../context/AppContext';
import { pwaManager, PwaState } from '../services/pwaService';

export const SettingsAndPortabilityView: React.FC = () => {
  const {
    user,
    profile,
    foodEntries,
    recipes,
    savedMeals,
    weightEntries,
    theme,
    setThemePreference,
    saveProfileAndGoals,
    addFoodEntry,
    saveRecipeItem,
    saveSavedMealItem,
    saveWeightItem,
    signOutUser,
    deleteAccountAndAllData,
    notify,
  } = useApp();

  // Profile & Goals State
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [preferredUnits, setPreferredUnits] = useState<MeasurementSystem>(
    profile?.preferredUnits || 'metric'
  );
  const [dailyCalorieGoal, setDailyCalorieGoal] = useState<number>(
    profile?.dailyCalorieGoal || 2100
  );
  const [proteinGrams, setProteinGrams] = useState<number>(
    profile?.macroGoals.proteinGrams || 140
  );
  const [carbsGrams, setCarbsGrams] = useState<number>(
    profile?.macroGoals.carbsGrams || 220
  );
  const [fatGrams, setFatGrams] = useState<number>(profile?.macroGoals.fatGrams || 70);
  const [dietaryNotes, setDietaryNotes] = useState<string>(profile?.dietaryNotes || '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Data Portability / Import State
  const [rawImportJson, setRawImportJson] = useState<string>('');
  const [validationResult, setValidationResult] = useState<ImportValidationResult | null>(null);
  const [conflictStrategy, setConflictStrategy] =
    useState<ImportConflictStrategy>('skip_existing');
  const [restoreProfileGoals, setRestoreProfileGoals] = useState<boolean>(false);
  const [importing, setImporting] = useState<boolean>(false);

  // Account Deletion Confirmation State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>('');
  const [deletingAccount, setDeletingAccount] = useState<boolean>(false);

  // PWA State
  const [pwaState, setPwaState] = useState<PwaState>({
    isInstallable: false,
    isInstalled: false,
    swUpdateAvailable: false,
    swRegistered: false,
  });

  useEffect(() => {
    return pwaManager.subscribe(setPwaState);
  }, []);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setPreferredUnits(profile.preferredUnits);
      setDailyCalorieGoal(profile.dailyCalorieGoal);
      setProteinGrams(profile.macroGoals.proteinGrams);
      setCarbsGrams(profile.macroGoals.carbsGrams);
      setFatGrams(profile.macroGoals.fatGrams);
      setDietaryNotes(profile.dietaryNotes || '');
    }
  }, [profile]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    if (dailyCalorieGoal < 500 || dailyCalorieGoal > 15000) {
      notify({
        type: 'error',
        title: 'Invalid calorie target',
        message: 'Daily calorie goal must be between 500 and 15,000 kcal.',
      });
      return;
    }

    setSavingProfile(true);
    try {
      const updated: UserProfile = {
        ...profile,
        displayName: displayName.trim() || user.displayName,
        preferredUnits,
        dailyCalorieGoal: Math.round(dailyCalorieGoal),
        macroGoals: {
          proteinGrams: Math.round(proteinGrams),
          carbsGrams: Math.round(carbsGrams),
          fatGrams: Math.round(fatGrams),
        },
        dietaryNotes: dietaryNotes.trim(),
        updatedAt: new Date().toISOString(),
      };
      await saveProfileAndGoals(updated);
    } finally {
      setSavingProfile(false);
    }
  };

  const triggerBrowserDownload = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportFullJsonBackup = () => {
    if (!user) return;
    const payload = createBackupPayload({
      uid: user.uid,
      profile,
      foodEntries,
      recipes,
      savedMeals,
      weightEntries,
      exportType: 'full_backup',
    });
    const jsonString = serializeBackupToJson(payload);
    const dateStamp = new Date().toISOString().slice(0, 10);
    triggerBrowserDownload(
      jsonString,
      `nutripulse-full-backup-${dateStamp}.json`,
      'application/json;charset=utf-8'
    );
    notify({
      type: 'success',
      title: 'Full JSON Backup Exported',
      message: `Exported ${foodEntries.length} diary entries, ${recipes.length} recipes, ${savedMeals.length} saved meals, and your profile.`,
    });
  };

  const handleExportDiaryCsv = () => {
    const csvString = generateFoodDiaryCsv(foodEntries);
    const dateStamp = new Date().toISOString().slice(0, 10);
    triggerBrowserDownload(
      csvString,
      `nutripulse-food-diary-${dateStamp}.csv`,
      'text/csv;charset=utf-8'
    );
    notify({
      type: 'success',
      title: 'Food Diary CSV Exported',
      message: `Exported ${foodEntries.length} food diary rows for spreadsheet analysis.`,
    });
  };

  const handleValidateImportText = (jsonText: string) => {
    setRawImportJson(jsonText);
    if (!jsonText.trim()) {
      setValidationResult(null);
      return;
    }
    const result = validateAndPreviewBackupJson(jsonText, {
      foodEntries,
      recipes,
      savedMeals,
      weightEntries,
    });
    setValidationResult(result);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      handleValidateImportText(content);
    };
    reader.readAsText(file);
  };

  const handleExecuteImport = async () => {
    if (!user || !validationResult?.isValid || !validationResult.payload) return;

    setImporting(true);
    try {
      const plan = buildImportExecutionPlan({
        targetUid: user.uid,
        payload: validationResult.payload,
        strategy: conflictStrategy,
        restoreProfileGoals,
        existingIds: {
          foodEntries: new Set(foodEntries.map((e) => e.id)),
          recipes: new Set(recipes.map((r) => r.id)),
          savedMeals: new Set(savedMeals.map((m) => m.id)),
          weightEntries: new Set(weightEntries.map((w) => w.id)),
        },
      });

      if (plan.profileToSave) {
        await saveProfileAndGoals(plan.profileToSave);
      }

      for (const entry of plan.foodEntriesToSave) {
        const { id, uid: _u, createdAt: _c, updatedAt: _up, _meta, ...draft } = entry;
        await addFoodEntry(draft, id);
      }

      for (const rcp of plan.recipesToSave) {
        const { id, uid: _u, createdAt, updatedAt: _up, _meta, ...draft } = rcp;
        await saveRecipeItem(draft, id, createdAt);
      }

      for (const meal of plan.savedMealsToSave) {
        const { id, uid: _u, createdAt, updatedAt: _up, _meta, ...draft } = meal;
        await saveSavedMealItem(draft, id, createdAt);
      }

      for (const wt of plan.weightEntriesToSave) {
        const { id, uid: _u, createdAt, updatedAt: _up, _meta, ...draft } = wt;
        await saveWeightItem(draft, id, createdAt);
      }

      notify({
        type: 'success',
        title: 'Backup Restore Complete',
        message: `Imported ${plan.summary.importedFoodEntries} food entries (${plan.summary.skippedFoodEntries} skipped), ${plan.summary.importedRecipes} recipes, and ${plan.summary.importedSavedMeals} saved meals.`,
      });

      setRawImportJson('');
      setValidationResult(null);
    } catch (err) {
      notify({
        type: 'error',
        title: 'Import failed',
        message: err instanceof Error ? err.message : 'Unable to apply backup.',
      });
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmAccountDeletion = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setDeletingAccount(true);
    try {
      await deleteAccountAndAllData();
    } catch (err) {
      notify({
        type: 'error',
        title: 'Account deletion error',
        message: err instanceof Error ? err.message : 'Could not complete account deletion.',
      });
    } finally {
      setDeletingAccount(false);
    }
  };

  const macroKcal = calculateCaloriesFromMacros(proteinGrams, carbsGrams, fatGrams);

  return (
    <div className="space-y-8 pb-24">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
          Profile, Goals, Data Portability & Security
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Customize your daily nutrition targets, appearance, backups, and account security.
        </p>
      </div>

      {/* 1. Nutrition Goals & Profile Settings */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex items-center gap-2.5">
          <Target className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
            Nutrition Profile & Daily Targets
          </h2>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="settings-display-name"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Display Name
              </label>
              <input
                id="settings-display-name"
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Preferred Measurement Units
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['metric', 'imperial'] as MeasurementSystem[]).map((sys) => (
                  <button
                    key={sys}
                    type="button"
                    onClick={() => setPreferredUnits(sys)}
                    className={`rounded-xl py-2 px-3 text-xs font-semibold border transition capitalize ${
                      preferredUnits === sys
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {sys === 'metric' ? 'Metric (g, ml, kg)' : 'Imperial (oz, fl oz, lb)'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label
                htmlFor="settings-calorie-goal"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Daily Calories (kcal)
              </label>
              <input
                id="settings-calorie-goal"
                type="number"
                min={500}
                max={15000}
                value={dailyCalorieGoal}
                onChange={(e) => setDailyCalorieGoal(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-bold text-emerald-700 dark:text-emerald-400"
              />
            </div>
            <div>
              <label
                htmlFor="settings-protein-goal"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Protein Target (g)
              </label>
              <input
                id="settings-protein-goal"
                type="number"
                min={0}
                max={2000}
                value={proteinGrams}
                onChange={(e) => setProteinGrams(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="settings-carbs-goal"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Carbs Target (g)
              </label>
              <input
                id="settings-carbs-goal"
                type="number"
                min={0}
                max={2000}
                value={carbsGrams}
                onChange={(e) => setCarbsGrams(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="settings-fat-goal"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Fat Target (g)
              </label>
              <input
                id="settings-fat-goal"
                type="number"
                min={0}
                max={2000}
                value={fatGrams}
                onChange={(e) => setFatGrams(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-slate-500">
            <span>
              Combined macro energy: <strong>{macroKcal} kcal</strong> ({proteinGrams * 4} kcal P •{' '}
              {carbsGrams * 4} kcal C • {fatGrams * 9} kcal F)
            </span>
            <button
              type="submit"
              disabled={savingProfile}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 text-xs transition"
            >
              {savingProfile ? 'Saving…' : 'Save Profile & Goals'}
            </button>
          </div>
        </form>
      </section>

      {/* 2. Theme & PWA App Installation */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Appearance & Installable PWA
            </h2>
            <p className="text-xs text-slate-500">
              Theme preference is stored in your Firestore profile (never in localStorage).
            </p>
          </div>

          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
            {(
              [
                { id: 'light', label: 'Light', icon: Sun },
                { id: 'dark', label: 'Dark', icon: Moon },
                { id: 'system', label: 'System', icon: Smartphone },
              ] as Array<{ id: ThemePreference; label: string; icon: React.FC<{ className?: string }> }>
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setThemePreference(id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  theme === id
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {pwaState.isInstallable && !pwaState.isInstalled && (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 p-4 flex items-center justify-between gap-4">
            <div className="text-xs text-emerald-900 dark:text-emerald-200">
              <strong>Install NutriPulse on your device:</strong> Add NutriPulse to your home screen or desktop for standalone launch and faster offline access.
            </div>
            <button
              type="button"
              onClick={() => pwaManager.promptInstall()}
              className="shrink-0 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 text-xs"
            >
              Install App
            </button>
          </div>
        )}
      </section>

      {/* 3. Data Portability: Backup Export, CSV Export & Validated Restore */}
      <section
        aria-label="Data portability and backup"
        className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-6"
      >
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
            Data Portability — Export & Validated Restore
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Export your data at any time. Notice the distinction between a{' '}
            <strong>Full Restorable Backup (JSON)</strong> and a{' '}
            <strong>Spreadsheet Data Export (CSV)</strong>.
          </p>
        </div>

        {/* Export Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-4 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
                <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>Full Restorable Backup (JSON v1.0.0)</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Includes your complete nutrition profile, daily goals, {foodEntries.length} food
                diary entries, {recipes.length} custom recipes, {savedMeals.length} saved meals, and{' '}
                {weightEntries.length} weight entries. Can be used to restore your account.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportFullJsonBackup}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-4 text-xs transition"
            >
              <Download className="h-4 w-4" />
              <span>Download Full JSON Backup</span>
            </button>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-4 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
                <FileSpreadsheet className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                <span>Food Diary Spreadsheet Export (CSV)</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Exports {foodEntries.length} food diary rows with dates, meals, serving weights,
                macros, and data quality flags for Excel or Google Sheets.{' '}
                <em>(Note: CSV is a tabular data export, not a full restorable backup.)</em>
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportDiaryCsv}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 text-white dark:text-slate-900 font-semibold py-2.5 px-4 text-xs transition"
            >
              <Download className="h-4 w-4" />
              <span>Export Food Diary CSV</span>
            </button>
          </div>
        </div>

        {/* Restore / Import Section with Schema Validation & Conflict Preview */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Upload className="h-4 w-4 text-emerald-600" />
                <span>Restore from JSON Backup (Validated Preview)</span>
              </h3>
              <p className="text-xs text-slate-500">
                Upload a NutriPulse JSON backup file or paste JSON below to validate schema version and preview changes before applying.
              </p>
            </div>

            <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50">
              <Upload className="h-3.5 w-3.5" />
              <span>Select .json Backup File</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          <textarea
            rows={4}
            aria-label="Backup JSON input"
            value={rawImportJson}
            onChange={(e) => handleValidateImportText(e.target.value)}
            placeholder='Paste NutriPulse backup JSON here (or click "Select .json Backup File" above) to validate and preview…'
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 p-3 font-mono text-xs text-slate-800 dark:text-slate-200"
          />

          {/* Validation Errors */}
          {validationResult && !validationResult.isValid && (
            <div
              role="alert"
              className="rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 p-4 text-xs text-rose-800 dark:text-rose-200 space-y-1.5"
            >
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                <span>Backup Validation Failed — No Changes Applied</span>
              </div>
              <ul className="list-disc pl-5 space-y-0.5">
                {validationResult.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Validated Preview & Explicit Conflict Decision */}
          {validationResult && validationResult.isValid && validationResult.preview && (
            <div className="rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="font-bold text-sm text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>
                    Backup Validated (Schema v{validationResult.preview.schemaVersion} •{' '}
                    {validationResult.preview.exportType === 'full_backup'
                      ? 'Full Restorable Backup'
                      : 'Partial Export'}
                    )
                  </span>
                </div>
                <span className="text-slate-500">
                  Exported: {validationResult.preview.exportedAt}
                </span>
              </div>

              {validationResult.warnings.length > 0 && (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 p-3 text-amber-900 dark:text-amber-200 space-y-1">
                  {validationResult.warnings.map((w, idx) => (
                    <div key={idx} className="flex items-start gap-1.5">
                      <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Preview Counts Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="rounded-xl bg-white dark:bg-slate-900 p-3 border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500">Food Entries</div>
                  <div className="text-base font-extrabold text-slate-900 dark:text-white">
                    {validationResult.preview.incomingCounts.foodEntries}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {validationResult.preview.newCounts.foodEntries} new •{' '}
                    {validationResult.preview.conflictCounts.foodEntries} existing IDs
                  </div>
                </div>

                <div className="rounded-xl bg-white dark:bg-slate-900 p-3 border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500">Custom Recipes</div>
                  <div className="text-base font-extrabold text-slate-900 dark:text-white">
                    {validationResult.preview.incomingCounts.recipes}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {validationResult.preview.newCounts.recipes} new •{' '}
                    {validationResult.preview.conflictCounts.recipes} existing IDs
                  </div>
                </div>

                <div className="rounded-xl bg-white dark:bg-slate-900 p-3 border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500">Saved Meals</div>
                  <div className="text-base font-extrabold text-slate-900 dark:text-white">
                    {validationResult.preview.incomingCounts.savedMeals}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {validationResult.preview.newCounts.savedMeals} new •{' '}
                    {validationResult.preview.conflictCounts.savedMeals} existing IDs
                  </div>
                </div>

                <div className="rounded-xl bg-white dark:bg-slate-900 p-3 border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500">Weight Entries</div>
                  <div className="text-base font-extrabold text-slate-900 dark:text-white">
                    {validationResult.preview.incomingCounts.weightEntries}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {validationResult.preview.newCounts.weightEntries} new •{' '}
                    {validationResult.preview.conflictCounts.weightEntries} existing IDs
                  </div>
                </div>
              </div>

              {/* Explicit Conflict Resolution Decision (Never overwrites without explicit choice) */}
              <div className="rounded-xl bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="font-bold text-slate-900 dark:text-white">
                  How should existing records with matching IDs be handled?
                </div>
                <div className="space-y-2">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="conflict-strategy"
                      checked={conflictStrategy === 'skip_existing'}
                      onChange={() => setConflictStrategy('skip_existing')}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        Skip existing records (Safe Default — Never Overwrites)
                      </span>
                      <p className="text-slate-500">
                        Only imports records whose IDs do not already exist in your account.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="conflict-strategy"
                      checked={conflictStrategy === 'keep_both'}
                      onChange={() => setConflictStrategy('keep_both')}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        Keep both (Import conflicting items with new IDs)
                      </span>
                      <p className="text-slate-500">
                        Preserves your current records and assigns fresh IDs to conflicting backup records.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="conflict-strategy"
                      checked={conflictStrategy === 'overwrite_existing'}
                      onChange={() => setConflictStrategy('overwrite_existing')}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="font-semibold text-amber-700 dark:text-amber-400">
                        Overwrite matching records with backup versions
                      </span>
                      <p className="text-slate-500">
                        Replaces existing records that have the same ID with the data from the backup file.
                      </p>
                    </div>
                  </label>
                </div>

                {validationResult.preview.hasProfile && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <label className="inline-flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={restoreProfileGoals}
                        onChange={(e) => setRestoreProfileGoals(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      <span>
                        Also overwrite my current Profile & Daily Calorie Goal with backup profile (
                        {validationResult.preview.profileDisplayName} —{' '}
                        {validationResult.preview.profileCalorieGoal} kcal)
                      </span>
                    </label>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRawImportJson('');
                    setValidationResult(null);
                  }}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 font-semibold text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={importing}
                  onClick={handleExecuteImport}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2 transition"
                >
                  {importing ? 'Applying Backup…' : 'Confirm & Apply Restore'}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 4. Account Security, Sign Out & Two-Phase Account Deletion */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-slate-700 dark:text-slate-300" />
              <span>Account & Data Security</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Signed in as <strong>{user?.email || user?.displayName}</strong> (UID:{' '}
              <code>{user?.uid}</code>)
            </p>
          </div>

          <button
            type="button"
            onClick={signOutUser}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 transition"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>

        {/* Account & Data Deletion Explanation & Action */}
        <div className="rounded-xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/70 p-4 space-y-3 text-xs">
          <div className="font-bold text-rose-900 dark:text-rose-200 flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-rose-600" />
            <span>Delete Account & Associated Cloud Data</span>
          </div>
          <p className="text-rose-800 dark:text-rose-300 leading-relaxed">
            <strong>Important Architecture Note:</strong> In Firebase, deleting a Firebase
            Authentication account (<code>deleteUser</code>) and deleting its associated Cloud
            Firestore documents (<code>users/&#123;uid&#125;</code> and subcollections{' '}
            <code>foodEntries</code>, <code>recipes</code>, <code>savedMeals</code>, and{' '}
            <code>weightEntries</code>) are two separate operations that must both be executed.
            When you confirm deletion below, NutriPulse first purges all of your Firestore
            collections in batches and then deletes your Firebase Authentication user record.
          </p>

          {!showDeleteConfirm ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold px-4 py-2 text-xs transition"
            >
              Delete My Account & All Data…
            </button>
          ) : (
            <div className="rounded-xl bg-white dark:bg-slate-900 p-4 border border-rose-300 dark:border-rose-800 space-y-3">
              <label
                htmlFor="confirm-delete-input"
                className="block font-semibold text-slate-900 dark:text-white"
              >
                Type <code>DELETE</code> to permanently erase all Firestore records and close your
                account:
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  id="confirm-delete-input"
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE"
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-mono"
                />
                <button
                  type="button"
                  disabled={deleteConfirmText !== 'DELETE' || deletingAccount}
                  onClick={handleConfirmAccountDeletion}
                  className="rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-bold px-4 py-1.5 text-xs"
                >
                  {deletingAccount ? 'Deleting Data & Account…' : 'Permanently Delete Everything'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText('');
                  }}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

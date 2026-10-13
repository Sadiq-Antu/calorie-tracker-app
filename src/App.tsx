import React, { useEffect, useState } from 'react';
import {
  Activity,
  BookOpen,
  Calendar,
  CloudOff,
  LayoutDashboard,
  Moon,
  Plus,
  RefreshCw,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import { FoodEntry, MealType } from './types/domain';
import { AppProvider, useApp } from './context/AppContext';
import { AuthScreen } from './components/AuthScreen';
import { OnboardingFlow } from './components/OnboardingFlow';
import { DailyDashboard } from './components/DailyDashboard';
import { HistoryView } from './components/HistoryView';
import { RecipesAndMealsView } from './components/RecipesAndMealsView';
import { SettingsAndPortabilityView } from './components/SettingsAndPortabilityView';
import { FoodEntryModal, FoodModalTab } from './components/FoodEntryModal';
import {
  GlobalSyncStatusHeaderPill,
  SyncDiagnosticsModal,
} from './components/SyncStatusBadge';
import { pwaManager, PwaState } from './services/pwaService';
import { inferMealTypeFromTime } from './utils/dateUtils';

export type NavigationTab = 'dashboard' | 'history' | 'recipes' | 'settings';

export const MainTrackerShell: React.FC = () => {
  const {
    user,
    authLoading,
    dataLoading,
    profile,
    selectedDate,
    setSelectedDate,
    resolvedDarkMode,
    setThemePreference,
    syncDiagnostics,
    dismissFailedWrite,
    toggleSimulatedOffline,
    toasts,
    dismissToast,
  } = useApp();

  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [foodModalOpen, setFoodModalOpen] = useState<boolean>(false);
  const [foodModalMeal, setFoodModalMeal] = useState<MealType>(() =>
    inferMealTypeFromTime()
  );
  const [foodModalInitialTab, setFoodModalInitialTab] = useState<FoodModalTab>('search');
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null);
  const [syncModalOpen, setSyncModalOpen] = useState<boolean>(false);

  const [pwaState, setPwaState] = useState<PwaState>({
    isInstallable: false,
    isInstalled: false,
    swUpdateAvailable: false,
    swRegistered: false,
  });

  useEffect(() => {
    pwaManager.init();
    return pwaManager.subscribe(setPwaState);
  }, []);

  const handleOpenAddFood = (
    mealType: MealType = inferMealTypeFromTime(),
    tab: FoodModalTab = 'search'
  ) => {
    setEditingEntry(null);
    setFoodModalMeal(mealType);
    setFoodModalInitialTab(tab);
    setFoodModalOpen(true);
  };

  const handleEditFoodEntry = (entry: FoodEntry) => {
    setEditingEntry(entry);
    setFoodModalMeal(entry.mealType);
    setFoodModalInitialTab('manual');
    setFoodModalOpen(true);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 text-center">
        <div className="h-10 w-10 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
        <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-400">
          Initializing NutriPulse Authentication…
        </p>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  if (dataLoading && !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 text-center">
        <div className="h-10 w-10 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
        <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-400">
          Loading your nutrition diary…
        </p>
      </div>
    );
  }

  if (!profile || !profile.onboardingCompleted) {
    return <OnboardingFlow />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Offline or Pending Sync Banner */}
      {!syncDiagnostics.isOnline && (
        <div
          role="status"
          className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-semibold flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <CloudOff className="h-4 w-4 shrink-0" />
            <span>
              You are working offline. Viewing cached records — changes are queued locally as “Pending Cloud Sync” and will synchronize automatically when online.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSyncModalOpen(true)}
            className="shrink-0 underline font-bold"
          >
            Sync Details
          </button>
        </div>
      )}

      {/* Service Worker Update Notification Banner */}
      {pwaState.swUpdateAvailable && (
        <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-semibold flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            <span>A new version of NutriPulse is cached and ready.</span>
          </div>
          <button
            type="button"
            onClick={() => pwaManager.applyUpdate()}
            className="rounded-lg bg-white text-emerald-800 px-3 py-1 font-bold"
          >
            Reload to Update
          </button>
        </div>
      )}

      {/* Top Navigation Header */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          {/* Brand Logo */}
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-xs">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-slate-900 dark:text-white">
                  NutriPulse
                </span>
                {user.isSandbox && (
                  <span className="rounded-md bg-amber-100 dark:bg-amber-950 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                    Sandbox
                  </span>
                )}
              </div>
              <span className="hidden sm:block text-[11px] text-slate-500 dark:text-slate-400 leading-none">
                {profile.displayName} • {profile.dailyCalorieGoal} kcal target
              </span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1"
          >
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                activeTab === 'dashboard'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              <span>Dashboard</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                activeTab === 'history'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>History</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('recipes')}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                activeTab === 'recipes'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>Recipes & Meals</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                activeTab === 'settings'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Settings className="h-3.5 w-3.5" />
              <span>Settings & Backup</span>
            </button>
          </nav>

          {/* Right Status & Quick Actions */}
          <div className="flex items-center gap-2">
            <GlobalSyncStatusHeaderPill
              diagnostics={syncDiagnostics}
              onOpenDetails={() => setSyncModalOpen(true)}
            />

            <button
              type="button"
              onClick={() => setThemePreference(resolvedDarkMode ? 'light' : 'dark')}
              className="rounded-xl p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              aria-label={resolvedDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              title={resolvedDarkMode ? 'Light mode' : 'Dark mode'}
            >
              {resolvedDarkMode ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-6 pt-6">
        {activeTab === 'dashboard' && (
          <DailyDashboard
            onOpenAddFood={handleOpenAddFood}
            onEditFoodEntry={handleEditFoodEntry}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView
            onSelectDateForDiary={(dateStr) => {
              setSelectedDate(dateStr);
              setActiveTab('dashboard');
            }}
          />
        )}

        {activeTab === 'recipes' && <RecipesAndMealsView />}

        {activeTab === 'settings' && <SettingsAndPortabilityView />}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile bottom navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-2 py-1.5 grid grid-cols-5 items-center"
      >
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center justify-center py-1 text-[11px] font-semibold ${
            activeTab === 'dashboard'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <LayoutDashboard className="h-5 w-5" />
          <span className="mt-0.5">Diary</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center justify-center py-1 text-[11px] font-semibold ${
            activeTab === 'history'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Calendar className="h-5 w-5" />
          <span className="mt-0.5">History</span>
        </button>

        {/* Prominent Mobile Center Add Food Action */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => handleOpenAddFood()}
            aria-label="Log food"
            className="h-12 w-12 -mt-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg flex items-center justify-center transition"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('recipes')}
          className={`flex flex-col items-center justify-center py-1 text-[11px] font-semibold ${
            activeTab === 'recipes'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <BookOpen className="h-5 w-5" />
          <span className="mt-0.5">Recipes</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center justify-center py-1 text-[11px] font-semibold ${
            activeTab === 'settings'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Settings className="h-5 w-5" />
          <span className="mt-0.5">Settings</span>
        </button>
      </nav>

      {/* Food Search / Manual Logging / Edit Modal */}
      <FoodEntryModal
        isOpen={foodModalOpen}
        onClose={() => {
          setFoodModalOpen(false);
          setEditingEntry(null);
        }}
        initialDate={selectedDate}
        initialMealType={foodModalMeal}
        initialTab={foodModalInitialTab}
        editingEntry={editingEntry}
      />

      {/* Offline & Sync Diagnostics Modal */}
      <SyncDiagnosticsModal
        isOpen={syncModalOpen}
        onClose={() => setSyncModalOpen(false)}
        diagnostics={syncDiagnostics}
        onDismissFailure={dismissFailedWrite}
        onToggleSimulatedOffline={toggleSimulatedOffline}
      />

      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-20 md:bottom-6 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto rounded-xl border p-3.5 shadow-lg flex items-start justify-between gap-3 text-xs ${
                t.type === 'error'
                  ? 'bg-rose-950 text-rose-100 border-rose-800'
                  : t.type === 'warning'
                    ? 'bg-amber-950 text-amber-100 border-amber-800'
                    : 'bg-slate-900 text-white border-slate-700'
              }`}
            >
              <div>
                <div className="font-bold">{t.title}</div>
                {t.message && <div className="mt-0.5 opacity-90">{t.message}</div>}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                className="opacity-70 hover:opacity-100"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AppProvider>
      <MainTrackerShell />
    </AppProvider>
  );
};

export default App;

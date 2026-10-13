import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  deleteUser,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  FoodEntry,
  FoodEntryDraft,
  MealType,
  Recipe,
  RecipeDraft,
  SavedMeal,
  SavedMealDraft,
  SyncDiagnosticsState,
  ThemePreference,
  UserProfile,
  WeightEntry,
  WeightEntryDraft,
} from '../types/domain';
import {
  AppDataRepository,
  AuthenticatedUser,
  FirestoreAppDataRepository,
  InMemoryAppDataRepository,
  WriteOperationResult,
} from '../services/firestoreRepository';
import {
  initializeFirebaseServices,
  isFirebaseConfigured,
} from '../services/firebaseConfig';
import { getTodayDateString } from '../utils/dateUtils';

export interface ToastNotification {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message?: string;
}

export interface AppContextValue {
  user: AuthenticatedUser | null;
  authLoading: boolean;
  dataLoading: boolean;
  firebaseConfigured: boolean;
  authError: string | null;

  profile: UserProfile | null;
  foodEntries: FoodEntry[];
  recipes: Recipe[];
  savedMeals: SavedMeal[];
  weightEntries: WeightEntry[];
  recentFoods: FoodEntry[];

  selectedDate: string;
  setSelectedDate: (date: string) => void;

  theme: ThemePreference;
  resolvedDarkMode: boolean;
  setThemePreference: (theme: ThemePreference) => Promise<void>;

  syncDiagnostics: SyncDiagnosticsState;
  dismissFailedWrite: (failureId: string) => void;
  toggleSimulatedOffline: (offline: boolean) => Promise<void>;

  signInWithGoogle: () => Promise<void>;
  signInWithSandbox: (withSampleData?: boolean) => Promise<void>;
  signOutUser: () => Promise<void>;
  deleteAccountAndAllData: () => Promise<{ deletedRecords: number }>;

  saveProfileAndGoals: (profile: UserProfile) => Promise<WriteOperationResult<UserProfile>>;
  addFoodEntry: (draft: FoodEntryDraft, customId?: string) => Promise<WriteOperationResult<FoodEntry>>;
  editFoodEntry: (
    entryId: string,
    existingEntry: FoodEntry,
    updates: Partial<FoodEntryDraft>
  ) => Promise<WriteOperationResult<FoodEntry>>;
  removeFoodEntry: (entry: FoodEntry) => Promise<WriteOperationResult>;
  duplicateEntry: (
    entry: FoodEntry,
    targetDate?: string,
    targetMealType?: MealType
  ) => Promise<WriteOperationResult<FoodEntry>>;

  saveRecipeItem: (
    draft: RecipeDraft,
    existingId?: string,
    existingCreatedAt?: string
  ) => Promise<WriteOperationResult<Recipe>>;
  removeRecipeItem: (recipeId: string) => Promise<WriteOperationResult>;

  saveSavedMealItem: (
    draft: SavedMealDraft,
    existingId?: string,
    existingCreatedAt?: string
  ) => Promise<WriteOperationResult<SavedMeal>>;
  removeSavedMealItem: (mealId: string) => Promise<WriteOperationResult>;

  saveWeightItem: (
    draft: WeightEntryDraft,
    existingId?: string,
    existingCreatedAt?: string
  ) => Promise<WriteOperationResult<WeightEntry>>;
  removeWeightItem: (entryId: string) => Promise<WriteOperationResult>;

  toasts: ToastNotification[];
  notify: (toast: Omit<ToastNotification, 'id'>) => void;
  dismissToast: (id: string) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export interface AppProviderProps {
  children: React.ReactNode;
  customRepository?: AppDataRepository;
  initialUser?: AuthenticatedUser | null;
}

export const AppProvider: React.FC<AppProviderProps> = ({
  children,
  customRepository,
  initialUser = null,
}) => {
  const firebaseConfigured = isFirebaseConfigured();
  const firebaseServices = useMemo(
    () => (customRepository ? null : initializeFirebaseServices()),
    [customRepository]
  );

  const [fallbackRepo] = useState<InMemoryAppDataRepository>(
    () => new InMemoryAppDataRepository('sandbox_demo_uid', getTodayDateString())
  );

  const repository: AppDataRepository = useMemo(() => {
    if (customRepository) return customRepository;
    if (firebaseServices) {
      return new FirestoreAppDataRepository(
        firebaseServices.db,
        firebaseServices.persistenceMode,
        firebaseServices.persistenceWarning
      );
    }
    return fallbackRepo;
  }, [customRepository, firebaseServices, fallbackRepo]);

  const [user, setUser] = useState<AuthenticatedUser | null>(initialUser);
  const [authLoading, setAuthLoading] = useState<boolean>(
    Boolean(firebaseServices && !initialUser)
  );
  const [dataLoading, setDataLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [foodEntries, setFoodEntries] = useState<FoodEntry[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());

  // Theme preference stored in memory and synchronized with Firestore UserProfile (never localStorage)
  const [localTheme, setLocalTheme] = useState<ThemePreference>('system');
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  const [syncDiagnostics, setSyncDiagnostics] = useState<SyncDiagnosticsState>(() =>
    repository.getSyncDiagnostics()
  );

  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const notify = useCallback((toast: Omit<ToastNotification, 'id'>) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [{ ...toast, id }, ...prev.slice(0, 3)]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Listen to OS color scheme changes
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const activeTheme: ThemePreference = profile?.themePreference || localTheme;
  const resolvedDarkMode =
    activeTheme === 'dark' || (activeTheme === 'system' && systemPrefersDark);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (resolvedDarkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [resolvedDarkMode]);

  // Subscribe to Sync Diagnostics
  useEffect(() => {
    return repository.subscribeSyncDiagnostics((diag) => {
      setSyncDiagnostics(diag);
    });
  }, [repository]);

  // Subscribe to Firebase Auth state changes when Firebase is configured
  useEffect(() => {
    if (!firebaseServices) {
      setAuthLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(
      firebaseServices.auth,
      (fbUser) => {
        if (fbUser) {
          setUser({
            uid: fbUser.uid,
            displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'NutriPulse User',
            email: fbUser.email || '',
            photoURL: fbUser.photoURL,
            isSandbox: false,
          });
        } else {
          setUser((prev) => (prev?.isSandbox ? prev : null));
        }
        setAuthLoading(false);
      },
      (err) => {
        setAuthError(err.message);
        setAuthLoading(false);
      }
    );

    return unsubscribe;
  }, [firebaseServices]);

  // Subscribe to user's Firestore collections when authenticated
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setFoodEntries([]);
      setRecipes([]);
      setSavedMeals([]);
      setWeightEntries([]);
      setDataLoading(false);
      return;
    }

    setDataLoading(true);
    let profileLoaded = false;
    let entriesLoaded = false;

    const checkLoaded = () => {
      if (profileLoaded && entriesLoaded) {
        setDataLoading(false);
      }
    };

    const unsubProfile = repository.subscribeUserProfile(
      user.uid,
      (prof) => {
        setProfile(prof);
        if (prof?.themePreference) {
          setLocalTheme(prof.themePreference);
        }
        profileLoaded = true;
        checkLoaded();
      },
      (err) => {
        notify({
          type: 'error',
          title: 'Profile sync error',
          message: err.message,
        });
        profileLoaded = true;
        checkLoaded();
      }
    );

    const unsubEntries = repository.subscribeFoodEntries(
      user.uid,
      (entries) => {
        setFoodEntries(entries);
        entriesLoaded = true;
        checkLoaded();
      },
      (err) => {
        notify({
          type: 'error',
          title: 'Diary sync error',
          message: err.message,
        });
        entriesLoaded = true;
        checkLoaded();
      }
    );

    const unsubRecipes = repository.subscribeRecipes(user.uid, (items) => {
      setRecipes(items);
    });

    const unsubMeals = repository.subscribeSavedMeals(user.uid, (items) => {
      setSavedMeals(items);
    });

    const unsubWeights = repository.subscribeWeightEntries(user.uid, (items) => {
      setWeightEntries(items);
    });

    return () => {
      unsubProfile();
      unsubEntries();
      unsubRecipes();
      unsubMeals();
      unsubWeights();
    };
  }, [user, repository, notify]);

  // Deduplicated recent foods derived from the user's logged entries
  const recentFoods = useMemo(() => {
    const seen = new Set<string>();
    const result: FoodEntry[] = [];
    const sortedByRecent = [...foodEntries].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );
    for (const entry of sortedByRecent) {
      const key = `${entry.name.toLowerCase().trim()}|${entry.unit}|${entry.servingGrams}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(entry);
      }
      if (result.length >= 20) break;
    }
    return result;
  }, [foodEntries]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    if (!firebaseServices) {
      setAuthError(
        'Firebase credentials are not configured in .env.local. Configure VITE_FIREBASE_* variables or use the Sandbox session to explore the app.'
      );
      return;
    }

    try {
      await signInWithPopup(firebaseServices.auth, firebaseServices.googleProvider);
      notify({
        type: 'success',
        title: 'Signed in with Google',
        message: 'Connected to Cloud Firestore with offline persistence.',
      });
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: unknown }).code)
          : '';
      if (code === 'auth/popup-blocked') {
        await signInWithRedirect(firebaseServices.auth, firebaseServices.googleProvider);
        return;
      }
      if (code === 'auth/configuration-not-found' || code === 'auth/operation-not-allowed') {
        setAuthError(
          'Google Sign-In is almost ready! Open https://console.firebase.google.com/project/nutripulse-tracker-antu/authentication/providers, click "Get started" -> "Google" -> Enable -> Save (or use the Sandbox buttons below right now).'
        );
        return;
      }
      const message =
        err instanceof Error ? err.message : 'Google Sign-In failed. Please try again.';
      setAuthError(message);
    }
  }, [firebaseServices, notify]);

  const signInWithSandbox = useCallback(
    async (withSampleData: boolean = true) => {
      setAuthError(null);
      const uid = withSampleData ? 'sandbox_demo_uid' : `sandbox_new_${Date.now()}`;
      setUser({
        uid,
        displayName: withSampleData ? 'Alex Rivera' : 'New Tracker User',
        email: withSampleData ? 'alex.rivera@example.com' : 'user@example.com',
        photoURL: null,
        isSandbox: true,
      });
      notify({
        type: 'info',
        title: withSampleData ? 'Sandbox Session Active' : 'New Onboarding Session',
        message: withSampleData
          ? 'Loaded sample profile and diary entries.'
          : 'Complete onboarding to set your custom calorie and macro targets.',
      });
    },
    [notify]
  );

  const signOutUser = useCallback(async () => {
    if (firebaseServices && !user?.isSandbox) {
      await firebaseSignOut(firebaseServices.auth);
    }
    setUser(null);
    notify({
      type: 'info',
      title: 'Signed out',
      message: 'You have been signed out of your account.',
    });
  }, [firebaseServices, user, notify]);

  /**
   * Deletes both:
   * 1. All associated user records in Cloud Firestore (`foodEntries`, `recipes`, `savedMeals`, `weightEntries`, and `users/{uid}`)
   * 2. The Firebase Authentication account itself (`deleteUser`)
   */
  const deleteAccountAndAllData = useCallback(async (): Promise<{ deletedRecords: number }> => {
    if (!user) {
      throw new Error('No authenticated user to delete.');
    }

    // If using real Firebase Auth, ensure recent login before deleting data if needed
    const fbUser = firebaseServices?.auth.currentUser;

    const { deletedCount } = await repository.deleteAllUserData(user.uid);

    if (fbUser && !user.isSandbox && firebaseServices) {
      try {
        await deleteUser(fbUser);
      } catch (err: unknown) {
        const code =
          err && typeof err === 'object' && 'code' in err
            ? String((err as { code: unknown }).code)
            : '';
        if (code === 'auth/requires-recent-login') {
          await reauthenticateWithPopup(fbUser, firebaseServices.googleProvider);
          await deleteUser(fbUser);
        } else {
          throw err;
        }
      }
    }

    setUser(null);
    notify({
      type: 'info',
      title: 'Account & data deleted',
      message: `Permanently removed ${deletedCount} database record(s) and closed your account.`,
    });

    return { deletedRecords: deletedCount };
  }, [user, firebaseServices, repository, notify]);

  const setThemePreference = useCallback(
    async (newTheme: ThemePreference) => {
      setLocalTheme(newTheme);
      if (user && profile) {
        await repository.saveUserProfile(user.uid, {
          ...profile,
          themePreference: newTheme,
        });
      }
    },
    [user, profile, repository]
  );

  const saveProfileAndGoals = useCallback(
    async (updatedProfile: UserProfile) => {
      if (!user) throw new Error('Must be signed in to save profile.');
      const res = await repository.saveUserProfile(user.uid, updatedProfile);
      notify({
        type: res.confirmedByServer ? 'success' : 'info',
        title: res.confirmedByServer ? 'Profile saved to cloud' : 'Profile queued offline',
        message: res.confirmedByServer
          ? 'Your nutrition targets have been confirmed by Cloud Firestore.'
          : 'Saved to local cache (Pending cloud sync when back online).',
      });
      return res;
    },
    [user, repository, notify]
  );

  const addFoodEntry = useCallback(
    async (draft: FoodEntryDraft, customId?: string) => {
      if (!user) throw new Error('Must be signed in to log food.');
      const res = await repository.createFoodEntry(user.uid, draft, customId);
      notify({
        type: res.confirmedByServer ? 'success' : 'info',
        title: res.confirmedByServer ? `Logged "${draft.name}"` : `Queued "${draft.name}" (Offline)`,
        message: res.confirmedByServer
          ? `${draft.nutrition.calories} kcal confirmed in cloud diary.`
          : `${draft.nutrition.calories} kcal saved locally — pending cloud sync.`,
      });
      return res;
    },
    [user, repository, notify]
  );

  const editFoodEntry = useCallback(
    async (entryId: string, existingEntry: FoodEntry, updates: Partial<FoodEntryDraft>) => {
      if (!user) throw new Error('Must be signed in to edit food entries.');
      const res = await repository.updateFoodEntry(user.uid, entryId, existingEntry, updates);
      notify({
        type: res.confirmedByServer ? 'success' : 'info',
        title: res.confirmedByServer ? 'Entry updated' : 'Update queued offline',
        message: res.confirmedByServer
          ? 'Changes confirmed by Cloud Firestore.'
          : 'Changes saved locally — pending cloud sync.',
      });
      return res;
    },
    [user, repository, notify]
  );

  const removeFoodEntry = useCallback(
    async (entry: FoodEntry) => {
      if (!user) throw new Error('Must be signed in to delete food entries.');
      const res = await repository.deleteFoodEntry(user.uid, entry.id, entry);
      notify({
        type: res.confirmedByServer ? 'info' : 'warning',
        title: res.confirmedByServer ? `Deleted "${entry.name}"` : `Deletion queued offline`,
        message: res.confirmedByServer
          ? 'Removed from your food diary.'
          : 'Removal queued — will sync when connectivity returns.',
      });
      return res;
    },
    [user, repository, notify]
  );

  const duplicateEntry = useCallback(
    async (entry: FoodEntry, targetDate?: string, targetMealType?: MealType) => {
      if (!user) throw new Error('Must be signed in to duplicate food entries.');
      const res = await repository.duplicateFoodEntry(
        user.uid,
        entry,
        targetDate,
        targetMealType
      );
      notify({
        type: res.confirmedByServer ? 'success' : 'info',
        title: res.confirmedByServer
          ? `Duplicated "${entry.name}"`
          : `Duplicated "${entry.name}" (Pending Sync)`,
        message: `Added to ${targetMealType || entry.mealType} on ${targetDate || entry.date}.`,
      });
      return res;
    },
    [user, repository, notify]
  );

  const saveRecipeItem = useCallback(
    async (draft: RecipeDraft, existingId?: string, existingCreatedAt?: string) => {
      if (!user) throw new Error('Must be signed in to save recipes.');
      const res = await repository.saveRecipe(user.uid, draft, existingId, existingCreatedAt);
      notify({
        type: res.confirmedByServer ? 'success' : 'info',
        title: res.confirmedByServer ? `Saved recipe "${draft.name}"` : `Recipe queued offline`,
      });
      return res;
    },
    [user, repository, notify]
  );

  const removeRecipeItem = useCallback(
    async (recipeId: string) => {
      if (!user) throw new Error('Must be signed in.');
      return repository.deleteRecipe(user.uid, recipeId);
    },
    [user, repository]
  );

  const saveSavedMealItem = useCallback(
    async (draft: SavedMealDraft, existingId?: string, existingCreatedAt?: string) => {
      if (!user) throw new Error('Must be signed in to save custom foods.');
      const res = await repository.saveSavedMeal(user.uid, draft, existingId, existingCreatedAt);
      notify({
        type: res.confirmedByServer ? 'success' : 'info',
        title: res.confirmedByServer ? `Saved "${draft.name}"` : `Custom food queued offline`,
      });
      return res;
    },
    [user, repository, notify]
  );

  const removeSavedMealItem = useCallback(
    async (mealId: string) => {
      if (!user) throw new Error('Must be signed in.');
      return repository.deleteSavedMeal(user.uid, mealId);
    },
    [user, repository]
  );

  const saveWeightItem = useCallback(
    async (draft: WeightEntryDraft, existingId?: string, existingCreatedAt?: string) => {
      if (!user) throw new Error('Must be signed in to log weight.');
      const res = await repository.saveWeightEntry(user.uid, draft, existingId, existingCreatedAt);
      notify({
        type: res.confirmedByServer ? 'success' : 'info',
        title: res.confirmedByServer ? 'Weight logged' : 'Weight entry queued offline',
      });
      return res;
    },
    [user, repository, notify]
  );

  const removeWeightItem = useCallback(
    async (entryId: string) => {
      if (!user) throw new Error('Must be signed in.');
      return repository.deleteWeightEntry(user.uid, entryId);
    },
    [user, repository]
  );

  const dismissFailedWrite = useCallback(
    (failureId: string) => {
      repository.dismissFailedWrite(failureId);
    },
    [repository]
  );

  const toggleSimulatedOffline = useCallback(
    async (offline: boolean) => {
      await repository.setSimulatedOffline(offline);
      notify({
        type: offline ? 'warning' : 'success',
        title: offline ? 'Offline Mode Active' : 'Online — Synced with Cloud',
        message: offline
          ? 'Writes will be queued in local cache as "Pending Sync" until reconnected.'
          : 'All queued offline changes have been synchronized and confirmed.',
      });
    },
    [repository, notify]
  );

  const value: AppContextValue = {
    user,
    authLoading,
    dataLoading,
    firebaseConfigured,
    authError,
    profile,
    foodEntries,
    recipes,
    savedMeals,
    weightEntries,
    recentFoods,
    selectedDate,
    setSelectedDate,
    theme: activeTheme,
    resolvedDarkMode,
    setThemePreference,
    syncDiagnostics,
    dismissFailedWrite,
    toggleSimulatedOffline,
    signInWithGoogle,
    signInWithSandbox,
    signOutUser,
    deleteAccountAndAllData,
    saveProfileAndGoals,
    addFoodEntry,
    editFoodEntry,
    removeFoodEntry,
    duplicateEntry,
    saveRecipeItem,
    removeRecipeItem,
    saveSavedMealItem,
    removeSavedMealItem,
    saveWeightItem,
    removeWeightItem,
    toasts,
    notify,
    dismissToast,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return ctx;
}

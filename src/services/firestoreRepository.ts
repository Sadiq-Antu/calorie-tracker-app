import {
  collection,
  deleteDoc,
  disableNetwork,
  doc,
  enableNetwork,
  Firestore,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  SnapshotMetadata,
  waitForPendingWrites,
  writeBatch,
} from 'firebase/firestore';
import {
  FoodEntry,
  FoodEntryDraft,
  PersistenceSupportMode,
  Recipe,
  RecipeDraft,
  RecordMetadata,
  RecordSyncState,
  SavedMeal,
  SavedMealDraft,
  SyncDiagnosticsState,
  SyncFailureRecord,
  UserProfile,
  WeightEntry,
  WeightEntryDraft,
} from '../types/domain';
import { getCurrentTimeHHMM } from '../utils/dateUtils';
import { VERIFIED_REFERENCE_FOODS } from '../data/referenceFoods';
import { scaleNutritionFromPer100g } from '../utils/nutritionCalculator';

export interface AuthenticatedUser {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  isSandbox?: boolean;
}

export interface WriteOperationResult<T = void> {
  data?: T;
  confirmedByServer: boolean;
  syncState: RecordSyncState;
}

export interface AppDataRepository {
  subscribeUserProfile(
    uid: string,
    onUpdate: (profile: UserProfile | null) => void,
    onError?: (err: Error) => void
  ): () => void;
  saveUserProfile(uid: string, profile: UserProfile): Promise<WriteOperationResult<UserProfile>>;

  subscribeFoodEntries(
    uid: string,
    onUpdate: (entries: FoodEntry[]) => void,
    onError?: (err: Error) => void
  ): () => void;
  createFoodEntry(
    uid: string,
    draft: FoodEntryDraft,
    customId?: string
  ): Promise<WriteOperationResult<FoodEntry>>;
  updateFoodEntry(
    uid: string,
    entryId: string,
    existingEntry: FoodEntry,
    updates: Partial<FoodEntryDraft>
  ): Promise<WriteOperationResult<FoodEntry>>;
  deleteFoodEntry(
    uid: string,
    entryId: string,
    preservedEntry?: FoodEntry
  ): Promise<WriteOperationResult>;
  duplicateFoodEntry(
    uid: string,
    sourceEntry: FoodEntry,
    targetDate?: string,
    targetMealType?: FoodEntry['mealType']
  ): Promise<WriteOperationResult<FoodEntry>>;

  subscribeRecipes(
    uid: string,
    onUpdate: (recipes: Recipe[]) => void,
    onError?: (err: Error) => void
  ): () => void;
  saveRecipe(
    uid: string,
    draft: RecipeDraft,
    existingId?: string,
    existingCreatedAt?: string
  ): Promise<WriteOperationResult<Recipe>>;
  deleteRecipe(uid: string, recipeId: string): Promise<WriteOperationResult>;

  subscribeSavedMeals(
    uid: string,
    onUpdate: (meals: SavedMeal[]) => void,
    onError?: (err: Error) => void
  ): () => void;
  saveSavedMeal(
    uid: string,
    draft: SavedMealDraft,
    existingId?: string,
    existingCreatedAt?: string
  ): Promise<WriteOperationResult<SavedMeal>>;
  deleteSavedMeal(uid: string, mealId: string): Promise<WriteOperationResult>;

  subscribeWeightEntries(
    uid: string,
    onUpdate: (entries: WeightEntry[]) => void,
    onError?: (err: Error) => void
  ): () => void;
  saveWeightEntry(
    uid: string,
    draft: WeightEntryDraft,
    existingId?: string,
    existingCreatedAt?: string
  ): Promise<WriteOperationResult<WeightEntry>>;
  deleteWeightEntry(uid: string, entryId: string): Promise<WriteOperationResult>;

  deleteAllUserData(uid: string): Promise<{ deletedCount: number }>;

  subscribeSyncDiagnostics(listener: (state: SyncDiagnosticsState) => void): () => void;
  getSyncDiagnostics(): SyncDiagnosticsState;
  dismissFailedWrite(failureId: string): void;
  setSimulatedOffline(offline: boolean): Promise<void>;
}

export function generateDocumentId(prefix: string = 'rec'): string {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${randomPart}`;
}

/**
 * Strips undefined keys and transient `_meta` fields before sending to Firestore
 * so documents strictly satisfy `firestore.rules`.
 */
export function sanitizeForFirestore<T extends object>(obj: T): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === '_meta' || value === undefined) {
      continue;
    }
    clean[key] = value;
  }
  return clean;
}

export function deriveRecordMetadata(
  docMeta: SnapshotMetadata,
  collectionMeta: SnapshotMetadata,
  isOnline: boolean
): RecordMetadata {
  if (docMeta.hasPendingWrites) {
    return {
      syncState: 'pending_sync',
      hasPendingWrites: true,
      fromCache: true,
    };
  }
  if (docMeta.fromCache || collectionMeta.fromCache || !isOnline) {
    return {
      syncState: 'cached_offline',
      hasPendingWrites: false,
      fromCache: true,
    };
  }
  return {
    syncState: 'confirmed',
    hasPendingWrites: false,
    fromCache: false,
  };
}

/**
 * Production Cloud Firestore Implementation of `AppDataRepository`.
 * Relies directly on Firestore's IndexedDB `persistentLocalCache` and metadata events.
 */
export class FirestoreAppDataRepository implements AppDataRepository {
  private db: Firestore;
  private diagnostics: SyncDiagnosticsState;
  private diagnosticsListeners = new Set<(state: SyncDiagnosticsState) => void>();
  private simulatedOffline = false;

  constructor(
    db: Firestore,
    persistenceMode: PersistenceSupportMode,
    persistenceWarning?: string
  ) {
    this.db = db;
    const browserOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    this.diagnostics = {
      isOnline: browserOnline,
      persistenceMode,
      persistenceWarning,
      pendingWritesCount: 0,
      hasUncachedViews: false,
      failedWrites: [],
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (!this.simulatedOffline) {
          this.updateDiagnostics({ isOnline: true });
          waitForPendingWrites(this.db)
            .then(() => {
              this.updateDiagnostics({
                lastServerSyncAt: new Date().toISOString(),
              });
            })
            .catch(() => {
              // Handled per-write
            });
        }
      });

      window.addEventListener('offline', () => {
        this.updateDiagnostics({ isOnline: false });
      });
    }
  }

  private updateDiagnostics(partial: Partial<SyncDiagnosticsState>): void {
    this.diagnostics = {
      ...this.diagnostics,
      ...partial,
    };
    for (const listener of this.diagnosticsListeners) {
      listener(this.diagnostics);
    }
  }

  getSyncDiagnostics(): SyncDiagnosticsState {
    return this.diagnostics;
  }

  subscribeSyncDiagnostics(listener: (state: SyncDiagnosticsState) => void): () => void {
    this.diagnosticsListeners.add(listener);
    listener(this.diagnostics);
    return () => {
      this.diagnosticsListeners.delete(listener);
    };
  }

  dismissFailedWrite(failureId: string): void {
    this.updateDiagnostics({
      failedWrites: this.diagnostics.failedWrites.filter((f) => f.id !== failureId),
    });
  }

  async setSimulatedOffline(offline: boolean): Promise<void> {
    this.simulatedOffline = offline;
    if (offline) {
      await disableNetwork(this.db);
      this.updateDiagnostics({ isOnline: false });
    } else {
      await enableNetwork(this.db);
      const browserOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      this.updateDiagnostics({ isOnline: browserOnline });
      if (browserOnline) {
        await waitForPendingWrites(this.db);
        this.updateDiagnostics({ lastServerSyncAt: new Date().toISOString() });
      }
    }
  }

  /**
   * Executes a Firestore write operation while accurately tracking pending writes and
   * offline queueing. Never claims cloud confirmation while offline or before server ack.
   */
  private async trackFirestoreWrite<T>(params: {
    collection: SyncFailureRecord['collection'];
    documentId: string;
    operation: SyncFailureRecord['operation'];
    writePromise: Promise<void>;
    data?: T;
    preservedData?: unknown;
  }): Promise<WriteOperationResult<T>> {
    this.updateDiagnostics({
      pendingWritesCount: this.diagnostics.pendingWritesCount + 1,
    });

    let settled = false;
    let rejectedError: unknown = null;

    const trackedPromise = params.writePromise
      .then(() => {
        settled = true;
        this.updateDiagnostics({
          pendingWritesCount: Math.max(0, this.diagnostics.pendingWritesCount - 1),
          lastServerSyncAt: new Date().toISOString(),
        });
      })
      .catch((err) => {
        settled = true;
        rejectedError = err;
        const errorCode =
          err && typeof err === 'object' && 'code' in err
            ? String((err as { code: unknown }).code)
            : 'firestore/write-rejected';
        const errorMessage =
          err instanceof Error ? err.message : 'Write rejected by Cloud Firestore security rules or server.';

        const failureRecord: SyncFailureRecord = {
          id: generateDocumentId('err'),
          collection: params.collection,
          documentId: params.documentId,
          operation: params.operation,
          errorCode,
          errorMessage,
          occurredAt: new Date().toISOString(),
          preservedData: params.preservedData ?? params.data,
        };

        this.updateDiagnostics({
          pendingWritesCount: Math.max(0, this.diagnostics.pendingWritesCount - 1),
          failedWrites: [failureRecord, ...this.diagnostics.failedWrites],
        });
      });

    // When offline, Firestore queues the write immediately in IndexedDB and resolves
    // `writePromise` only when connectivity returns. Do not block UI while offline.
    if (!this.diagnostics.isOnline) {
      return {
        data: params.data,
        confirmedByServer: false,
        syncState: 'pending_sync',
      };
    }

    // When online, wait up to 1500ms for immediate server confirmation; if network is slow,
    // return pending_sync and let onSnapshot update the UI when confirmed.
    await Promise.race([
      trackedPromise,
      new Promise<void>((resolve) => setTimeout(resolve, 1500)),
    ]);

    if (rejectedError) {
      throw rejectedError instanceof Error
        ? rejectedError
        : new Error('Write rejected by Cloud Firestore.');
    }

    return {
      data: params.data,
      confirmedByServer: settled,
      syncState: settled ? 'confirmed' : 'pending_sync',
    };
  }

  subscribeUserProfile(
    uid: string,
    onUpdate: (profile: UserProfile | null) => void,
    onError?: (err: Error) => void
  ): () => void {
    const profileRef = doc(this.db, 'users', uid);
    return onSnapshot(
      profileRef,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!snapshot.exists()) {
          onUpdate(null);
          return;
        }
        const raw = snapshot.data() as UserProfile;
        const meta = deriveRecordMetadata(
          snapshot.metadata,
          snapshot.metadata,
          this.diagnostics.isOnline
        );
        onUpdate({
          ...raw,
          _meta: meta,
        });
      },
      (err) => {
        if (onError) onError(err);
      }
    );
  }

  async saveUserProfile(
    uid: string,
    profile: UserProfile
  ): Promise<WriteOperationResult<UserProfile>> {
    if (profile.uid !== uid) {
      throw new Error('Unauthorized: Profile UID does not match authenticated user UID.');
    }
    const nowIso = new Date().toISOString();
    const updatedProfile: UserProfile = {
      ...profile,
      uid,
      createdAt: profile.createdAt || nowIso,
      updatedAt: nowIso,
    };
    const profileRef = doc(this.db, 'users', uid);
    const writePromise = setDoc(profileRef, sanitizeForFirestore(updatedProfile));

    return this.trackFirestoreWrite({
      collection: 'users',
      documentId: uid,
      operation: 'update',
      writePromise,
      data: updatedProfile,
    });
  }

  subscribeFoodEntries(
    uid: string,
    onUpdate: (entries: FoodEntry[]) => void,
    onError?: (err: Error) => void
  ): () => void {
    const entriesCol = collection(this.db, 'users', uid, 'foodEntries');
    const q = query(entriesCol, orderBy('date', 'desc'));

    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snapshot) => {
        const items: FoodEntry[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as FoodEntry;
          const meta = deriveRecordMetadata(
            docSnap.metadata,
            snapshot.metadata,
            this.diagnostics.isOnline
          );
          return {
            ...data,
            id: docSnap.id,
            _meta: meta,
          };
        });

        items.sort((a, b) => {
          if (a.date !== b.date) return b.date.localeCompare(a.date);
          return a.loggedAt.localeCompare(b.loggedAt);
        });

        onUpdate(items);
      },
      (err) => {
        if (onError) onError(err);
      }
    );
  }

  async createFoodEntry(
    uid: string,
    draft: FoodEntryDraft,
    customId?: string
  ): Promise<WriteOperationResult<FoodEntry>> {
    const entryId = customId || generateDocumentId('food');
    const nowIso = new Date().toISOString();
    const entry: FoodEntry = {
      ...draft,
      id: entryId,
      uid,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const docRef = doc(this.db, 'users', uid, 'foodEntries', entryId);
    const writePromise = setDoc(docRef, sanitizeForFirestore(entry));

    return this.trackFirestoreWrite({
      collection: 'foodEntries',
      documentId: entryId,
      operation: 'create',
      writePromise,
      data: entry,
    });
  }

  async updateFoodEntry(
    uid: string,
    entryId: string,
    existingEntry: FoodEntry,
    updates: Partial<FoodEntryDraft>
  ): Promise<WriteOperationResult<FoodEntry>> {
    if (existingEntry.uid !== uid) {
      throw new Error('Unauthorized: Cannot modify another user’s food entry.');
    }
    const nowIso = new Date().toISOString();
    const updated: FoodEntry = {
      ...existingEntry,
      ...updates,
      id: entryId,
      uid,
      createdAt: existingEntry.createdAt,
      updatedAt: nowIso,
    };

    const docRef = doc(this.db, 'users', uid, 'foodEntries', entryId);
    const writePromise = setDoc(docRef, sanitizeForFirestore(updated));

    return this.trackFirestoreWrite({
      collection: 'foodEntries',
      documentId: entryId,
      operation: 'update',
      writePromise,
      data: updated,
    });
  }

  async deleteFoodEntry(
    uid: string,
    entryId: string,
    preservedEntry?: FoodEntry
  ): Promise<WriteOperationResult> {
    const docRef = doc(this.db, 'users', uid, 'foodEntries', entryId);
    const writePromise = deleteDoc(docRef);

    return this.trackFirestoreWrite({
      collection: 'foodEntries',
      documentId: entryId,
      operation: 'delete',
      writePromise,
      preservedData: preservedEntry,
    });
  }

  async duplicateFoodEntry(
    uid: string,
    sourceEntry: FoodEntry,
    targetDate?: string,
    targetMealType?: FoodEntry['mealType']
  ): Promise<WriteOperationResult<FoodEntry>> {
    const draft: FoodEntryDraft = {
      date: targetDate || sourceEntry.date,
      mealType: targetMealType || sourceEntry.mealType,
      loggedAt: getCurrentTimeHHMM(),
      name: sourceEntry.name,
      brand: sourceEntry.brand,
      referenceId: sourceEntry.referenceId,
      quantity: sourceEntry.quantity,
      unit: sourceEntry.unit,
      servingGrams: sourceEntry.servingGrams,
      servingDescription: sourceEntry.servingDescription,
      nutrition: { ...sourceEntry.nutrition },
      baseNutritionPer100g: sourceEntry.baseNutritionPer100g
        ? { ...sourceEntry.baseNutritionPer100g }
        : undefined,
      dataQuality: sourceEntry.dataQuality,
      sourceType: sourceEntry.sourceType,
      notes: sourceEntry.notes,
      aiMetadata: sourceEntry.aiMetadata,
    };

    return this.createFoodEntry(uid, draft);
  }

  subscribeRecipes(
    uid: string,
    onUpdate: (recipes: Recipe[]) => void,
    onError?: (err: Error) => void
  ): () => void {
    const colRef = collection(this.db, 'users', uid, 'recipes');
    return onSnapshot(
      colRef,
      { includeMetadataChanges: true },
      (snapshot) => {
        const items: Recipe[] = snapshot.docs.map((docSnap) => ({
          ...(docSnap.data() as Recipe),
          id: docSnap.id,
          _meta: deriveRecordMetadata(
            docSnap.metadata,
            snapshot.metadata,
            this.diagnostics.isOnline
          ),
        }));
        items.sort((a, b) => a.name.localeCompare(b.name));
        onUpdate(items);
      },
      (err) => {
        if (onError) onError(err);
      }
    );
  }

  async saveRecipe(
    uid: string,
    draft: RecipeDraft,
    existingId?: string,
    existingCreatedAt?: string
  ): Promise<WriteOperationResult<Recipe>> {
    const recipeId = existingId || generateDocumentId('rcp');
    const nowIso = new Date().toISOString();
    const recipe: Recipe = {
      ...draft,
      id: recipeId,
      uid,
      createdAt: existingCreatedAt || nowIso,
      updatedAt: nowIso,
    };

    const docRef = doc(this.db, 'users', uid, 'recipes', recipeId);
    const writePromise = setDoc(docRef, sanitizeForFirestore(recipe));

    return this.trackFirestoreWrite({
      collection: 'recipes',
      documentId: recipeId,
      operation: existingId ? 'update' : 'create',
      writePromise,
      data: recipe,
    });
  }

  async deleteRecipe(uid: string, recipeId: string): Promise<WriteOperationResult> {
    const docRef = doc(this.db, 'users', uid, 'recipes', recipeId);
    const writePromise = deleteDoc(docRef);
    return this.trackFirestoreWrite({
      collection: 'recipes',
      documentId: recipeId,
      operation: 'delete',
      writePromise,
    });
  }

  subscribeSavedMeals(
    uid: string,
    onUpdate: (meals: SavedMeal[]) => void,
    onError?: (err: Error) => void
  ): () => void {
    const colRef = collection(this.db, 'users', uid, 'savedMeals');
    return onSnapshot(
      colRef,
      { includeMetadataChanges: true },
      (snapshot) => {
        const items: SavedMeal[] = snapshot.docs.map((docSnap) => ({
          ...(docSnap.data() as SavedMeal),
          id: docSnap.id,
          _meta: deriveRecordMetadata(
            docSnap.metadata,
            snapshot.metadata,
            this.diagnostics.isOnline
          ),
        }));
        items.sort((a, b) => a.name.localeCompare(b.name));
        onUpdate(items);
      },
      (err) => {
        if (onError) onError(err);
      }
    );
  }

  async saveSavedMeal(
    uid: string,
    draft: SavedMealDraft,
    existingId?: string,
    existingCreatedAt?: string
  ): Promise<WriteOperationResult<SavedMeal>> {
    const mealId = existingId || generateDocumentId('meal');
    const nowIso = new Date().toISOString();
    const meal: SavedMeal = {
      ...draft,
      id: mealId,
      uid,
      createdAt: existingCreatedAt || nowIso,
      updatedAt: nowIso,
    };

    const docRef = doc(this.db, 'users', uid, 'savedMeals', mealId);
    const writePromise = setDoc(docRef, sanitizeForFirestore(meal));

    return this.trackFirestoreWrite({
      collection: 'savedMeals',
      documentId: mealId,
      operation: existingId ? 'update' : 'create',
      writePromise,
      data: meal,
    });
  }

  async deleteSavedMeal(uid: string, mealId: string): Promise<WriteOperationResult> {
    const docRef = doc(this.db, 'users', uid, 'savedMeals', mealId);
    const writePromise = deleteDoc(docRef);
    return this.trackFirestoreWrite({
      collection: 'savedMeals',
      documentId: mealId,
      operation: 'delete',
      writePromise,
    });
  }

  subscribeWeightEntries(
    uid: string,
    onUpdate: (entries: WeightEntry[]) => void,
    onError?: (err: Error) => void
  ): () => void {
    const colRef = collection(this.db, 'users', uid, 'weightEntries');
    const q = query(colRef, orderBy('date', 'desc'));
    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snapshot) => {
        const items: WeightEntry[] = snapshot.docs.map((docSnap) => ({
          ...(docSnap.data() as WeightEntry),
          id: docSnap.id,
          _meta: deriveRecordMetadata(
            docSnap.metadata,
            snapshot.metadata,
            this.diagnostics.isOnline
          ),
        }));
        onUpdate(items);
      },
      (err) => {
        if (onError) onError(err);
      }
    );
  }

  async saveWeightEntry(
    uid: string,
    draft: WeightEntryDraft,
    existingId?: string,
    existingCreatedAt?: string
  ): Promise<WriteOperationResult<WeightEntry>> {
    const entryId = existingId || generateDocumentId('wt');
    const nowIso = new Date().toISOString();
    const entry: WeightEntry = {
      ...draft,
      id: entryId,
      uid,
      createdAt: existingCreatedAt || nowIso,
      updatedAt: nowIso,
    };

    const docRef = doc(this.db, 'users', uid, 'weightEntries', entryId);
    const writePromise = setDoc(docRef, sanitizeForFirestore(entry));

    return this.trackFirestoreWrite({
      collection: 'weightEntries',
      documentId: entryId,
      operation: existingId ? 'update' : 'create',
      writePromise,
      data: entry,
    });
  }

  async deleteWeightEntry(uid: string, entryId: string): Promise<WriteOperationResult> {
    const docRef = doc(this.db, 'users', uid, 'weightEntries', entryId);
    const writePromise = deleteDoc(docRef);
    return this.trackFirestoreWrite({
      collection: 'weightEntries',
      documentId: entryId,
      operation: 'delete',
      writePromise,
    });
  }

  /**
   * Deletes all user-owned Firestore documents (`foodEntries`, `recipes`, `savedMeals`,
   * `weightEntries`, and the root `users/{uid}` profile document) in batches.
   * Used during account deletion so no orphaned personal health records remain in Firestore.
   */
  async deleteAllUserData(uid: string): Promise<{ deletedCount: number }> {
    const subcollections = ['foodEntries', 'recipes', 'savedMeals', 'weightEntries'] as const;
    let deletedCount = 0;

    for (const sub of subcollections) {
      const colRef = collection(this.db, 'users', uid, sub);
      const snap = await getDocs(colRef);
      const docs = snap.docs;

      // Firestore writeBatch limit is 500 operations per batch
      for (let i = 0; i < docs.length; i += 400) {
        const chunk = docs.slice(i, i + 400);
        const batch = writeBatch(this.db);
        for (const d of chunk) {
          batch.delete(d.ref);
          deletedCount += 1;
        }
        await batch.commit();
      }
    }

    const userDocRef = doc(this.db, 'users', uid);
    await deleteDoc(userDocRef);
    deletedCount += 1;

    return { deletedCount };
  }
}

/**
 * In-Memory Repository used for automated testing and interactive preview when `.env.local`
 * Firebase credentials have not been configured yet.
 *
 * Strictly uses in-memory Maps (NEVER `localStorage`) and faithfully models:
 * - UID ownership isolation
 * - Online vs. Offline pending-sync queuing (`pending_sync` -> `confirmed`)
 * - Rejected write error capture without data loss
 */
export class InMemoryAppDataRepository implements AppDataRepository {
  private profiles = new Map<string, UserProfile>();
  private foodEntries = new Map<string, Map<string, FoodEntry>>();
  private recipes = new Map<string, Map<string, Recipe>>();
  private savedMeals = new Map<string, Map<string, SavedMeal>>();
  private weightEntries = new Map<string, Map<string, WeightEntry>>();

  private profileListeners = new Map<string, Set<(profile: UserProfile | null) => void>>();
  private foodListeners = new Map<string, Set<(entries: FoodEntry[]) => void>>();
  private recipeListeners = new Map<string, Set<(recipes: Recipe[]) => void>>();
  private savedMealListeners = new Map<string, Set<(meals: SavedMeal[]) => void>>();
  private weightListeners = new Map<string, Set<(entries: WeightEntry[]) => void>>();
  private diagnosticsListeners = new Set<(state: SyncDiagnosticsState) => void>();

  private diagnostics: SyncDiagnosticsState = {
    isOnline: true,
    persistenceMode: 'indexeddb_persistent',
    pendingWritesCount: 0,
    hasUncachedViews: false,
    lastServerSyncAt: new Date().toISOString(),
    failedWrites: [],
  };

  private simulateNextWriteRejection: { code: string; message: string } | null = null;

  constructor(seedDemoUid?: string, todayDateStr?: string) {
    if (seedDemoUid && todayDateStr) {
      this.seedSampleData(seedDemoUid, todayDateStr);
    }
  }

  /**
   * Test helper to simulate server rejection (e.g. security rule violation on sync).
   */
  public setSimulateNextWriteRejection(rejection: { code: string; message: string } | null): void {
    this.simulateNextWriteRejection = rejection;
  }

  private seedSampleData(uid: string, todayDateStr: string): void {
    const nowIso = new Date().toISOString();
    const profile: UserProfile = {
      uid,
      displayName: 'Alex Rivera',
      email: 'alex.rivera@example.com',
      preferredUnits: 'metric',
      dailyCalorieGoal: 2150,
      macroGoals: {
        proteinGrams: 150,
        carbsGrams: 220,
        fatGrams: 70,
      },
      dietaryPreferences: ['High-Protein', 'Whole Foods'],
      dietaryNotes: 'Prioritize whole-food protein sources and fiber.',
      weightGoal: {
        currentWeightKg: 76.5,
        targetWeightKg: 73.0,
        direction: 'lose',
        weeklyRateKg: 0.4,
      },
      themePreference: 'system',
      onboardingCompleted: true,
      schemaVersion: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      _meta: {
        syncState: 'confirmed',
        hasPendingWrites: false,
        fromCache: false,
      },
    };
    this.profiles.set(uid, profile);

    const oatsRef = VERIFIED_REFERENCE_FOODS.find((f) => f.id === 'usda-rolled-oats-dry')!;
    const eggRef = VERIFIED_REFERENCE_FOODS.find((f) => f.id === 'usda-egg-whole-large')!;
    const chickenRef = VERIFIED_REFERENCE_FOODS.find((f) => f.id === 'usda-chicken-breast-cooked')!;
    const riceRef = VERIFIED_REFERENCE_FOODS.find((f) => f.id === 'usda-white-rice-cooked')!;

    const sampleEntries: FoodEntry[] = [
      {
        id: 'food_demo_breakfast_1',
        uid,
        date: todayDateStr,
        mealType: 'breakfast',
        loggedAt: '08:15',
        name: oatsRef.name,
        referenceId: oatsRef.usdaFdcId,
        quantity: 1,
        unit: 'cup',
        servingGrams: 80,
        servingDescription: '1 cup dry (80g)',
        nutrition: scaleNutritionFromPer100g(oatsRef.nutritionPer100g, 80),
        baseNutritionPer100g: oatsRef.nutritionPer100g,
        dataQuality: 'verified',
        sourceType: 'reference_db',
        createdAt: nowIso,
        updatedAt: nowIso,
        _meta: { syncState: 'confirmed', hasPendingWrites: false, fromCache: false },
      },
      {
        id: 'food_demo_breakfast_2',
        uid,
        date: todayDateStr,
        mealType: 'breakfast',
        loggedAt: '08:20',
        name: eggRef.name,
        referenceId: eggRef.usdaFdcId,
        quantity: 2,
        unit: 'piece',
        servingGrams: 100,
        servingDescription: '2 large eggs (100g)',
        nutrition: scaleNutritionFromPer100g(eggRef.nutritionPer100g, 100),
        baseNutritionPer100g: eggRef.nutritionPer100g,
        dataQuality: 'verified',
        sourceType: 'reference_db',
        createdAt: nowIso,
        updatedAt: nowIso,
        _meta: { syncState: 'confirmed', hasPendingWrites: false, fromCache: false },
      },
      {
        id: 'food_demo_lunch_1',
        uid,
        date: todayDateStr,
        mealType: 'lunch',
        loggedAt: '13:05',
        name: chickenRef.name,
        referenceId: chickenRef.usdaFdcId,
        quantity: 1,
        unit: 'serving',
        servingGrams: 160,
        servingDescription: '160g roasted breast',
        nutrition: scaleNutritionFromPer100g(chickenRef.nutritionPer100g, 160),
        baseNutritionPer100g: chickenRef.nutritionPer100g,
        dataQuality: 'verified',
        sourceType: 'reference_db',
        createdAt: nowIso,
        updatedAt: nowIso,
        _meta: { syncState: 'confirmed', hasPendingWrites: false, fromCache: false },
      },
      {
        id: 'food_demo_lunch_2',
        uid,
        date: todayDateStr,
        mealType: 'lunch',
        loggedAt: '13:10',
        name: riceRef.name,
        referenceId: riceRef.usdaFdcId,
        quantity: 1,
        unit: 'cup',
        servingGrams: 158,
        servingDescription: '1 cup cooked (158g)',
        nutrition: scaleNutritionFromPer100g(riceRef.nutritionPer100g, 158),
        baseNutritionPer100g: riceRef.nutritionPer100g,
        dataQuality: 'verified',
        sourceType: 'reference_db',
        createdAt: nowIso,
        updatedAt: nowIso,
        _meta: { syncState: 'confirmed', hasPendingWrites: false, fromCache: false },
      },
      {
        id: 'food_demo_snack_1',
        uid,
        date: todayDateStr,
        mealType: 'snacks',
        loggedAt: '16:30',
        name: 'Cafe Oat Milk Latte (Barista Estimate)',
        quantity: 1,
        unit: 'cup',
        servingGrams: 350,
        servingDescription: '1 medium cup (350ml)',
        nutrition: {
          calories: 140,
          proteinGrams: 3.5,
          carbsGrams: 18.0,
          fatGrams: 5.5,
        },
        dataQuality: 'user_estimate',
        sourceType: 'manual',
        notes: 'Estimated from local coffee shop menu',
        createdAt: nowIso,
        updatedAt: nowIso,
        _meta: { syncState: 'confirmed', hasPendingWrites: false, fromCache: false },
      },
    ];

    const userFoodMap = new Map<string, FoodEntry>();
    for (const entry of sampleEntries) {
      userFoodMap.set(entry.id, entry);
    }
    this.foodEntries.set(uid, userFoodMap);

    const userRecipes = new Map<string, Recipe>();
    userRecipes.set('rcp_demo_power_bowl', {
      id: 'rcp_demo_power_bowl',
      uid,
      name: 'High-Protein Mediterranean Quinoa Bowl',
      servingsCount: 2,
      totalWeightGrams: 650,
      ingredients: [
        {
          id: 'ing_1',
          name: 'Cooked Quinoa',
          quantity: 300,
          unit: 'g',
          weightGrams: 300,
          nutrition: { calories: 360, proteinGrams: 13.2, carbsGrams: 63.9, fatGrams: 5.7 },
          dataQuality: 'verified',
        },
        {
          id: 'ing_2',
          name: 'Roasted Chicken Breast',
          quantity: 250,
          unit: 'g',
          weightGrams: 250,
          nutrition: { calories: 413, proteinGrams: 77.5, carbsGrams: 0, fatGrams: 9.0 },
          dataQuality: 'verified',
        },
        {
          id: 'ing_3',
          name: 'Extra Virgin Olive Oil & Herbs',
          quantity: 1,
          unit: 'tbsp',
          weightGrams: 14,
          nutrition: { calories: 119, proteinGrams: 0, carbsGrams: 0, fatGrams: 13.5 },
          dataQuality: 'verified',
        },
      ],
      nutritionPerServing: {
        calories: 446,
        proteinGrams: 45.4,
        carbsGrams: 32.0,
        fatGrams: 14.1,
      },
      dataQuality: 'verified',
      notes: 'Great post-workout meal prep bowl.',
      createdAt: nowIso,
      updatedAt: nowIso,
      _meta: { syncState: 'confirmed', hasPendingWrites: false, fromCache: false },
    });
    this.recipes.set(uid, userRecipes);

    const userMeals = new Map<string, SavedMeal>();
    userMeals.set('meal_demo_recovery_shake', {
      id: 'meal_demo_recovery_shake',
      uid,
      name: 'Post-Workout Whey & Banana Shake',
      brand: 'Homemade',
      defaultQuantity: 1,
      defaultUnit: 'serving',
      servingGrams: 390,
      servingDescription: '1 shake (1 scoop whey + 1 banana + water)',
      nutrition: {
        calories: 216,
        proteinGrams: 26.3,
        carbsGrams: 28.0,
        fatGrams: 0.9,
      },
      defaultMealType: 'snacks',
      dataQuality: 'verified',
      createdAt: nowIso,
      updatedAt: nowIso,
      _meta: { syncState: 'confirmed', hasPendingWrites: false, fromCache: false },
    });
    this.savedMeals.set(uid, userMeals);

    const userWeights = new Map<string, WeightEntry>();
    userWeights.set('wt_demo_1', {
      id: 'wt_demo_1',
      uid,
      date: todayDateStr,
      weightKg: 76.5,
      notes: 'Morning weigh-in',
      createdAt: nowIso,
      updatedAt: nowIso,
      _meta: { syncState: 'confirmed', hasPendingWrites: false, fromCache: false },
    });
    this.weightEntries.set(uid, userWeights);
  }

  private emitDiagnostics(): void {
    for (const listener of this.diagnosticsListeners) {
      listener(this.diagnostics);
    }
  }

  private emitProfile(uid: string): void {
    const listeners = this.profileListeners.get(uid);
    if (!listeners) return;
    const profile = this.profiles.get(uid) ?? null;
    for (const cb of listeners) cb(profile);
  }

  private emitFoodEntries(uid: string): void {
    const listeners = this.foodListeners.get(uid);
    if (!listeners) return;
    const map = this.foodEntries.get(uid) ?? new Map<string, FoodEntry>();
    const list = Array.from(map.values()).sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return a.loggedAt.localeCompare(b.loggedAt);
    });
    for (const cb of listeners) cb(list);
  }

  private emitRecipes(uid: string): void {
    const listeners = this.recipeListeners.get(uid);
    if (!listeners) return;
    const map = this.recipes.get(uid) ?? new Map<string, Recipe>();
    const list = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    for (const cb of listeners) cb(list);
  }

  private emitSavedMeals(uid: string): void {
    const listeners = this.savedMealListeners.get(uid);
    if (!listeners) return;
    const map = this.savedMeals.get(uid) ?? new Map<string, SavedMeal>();
    const list = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    for (const cb of listeners) cb(list);
  }

  private emitWeightEntries(uid: string): void {
    const listeners = this.weightListeners.get(uid);
    if (!listeners) return;
    const map = this.weightEntries.get(uid) ?? new Map<string, WeightEntry>();
    const list = Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
    for (const cb of listeners) cb(list);
  }

  private getCurrentMetaForWrite(): RecordMetadata {
    if (!this.diagnostics.isOnline) {
      return {
        syncState: 'pending_sync',
        hasPendingWrites: true,
        fromCache: true,
      };
    }
    return {
      syncState: 'confirmed',
      hasPendingWrites: false,
      fromCache: false,
    };
  }

  private checkSimulatedRejection(
    collectionName: SyncFailureRecord['collection'],
    documentId: string,
    operation: SyncFailureRecord['operation'],
    preservedData?: unknown
  ): void {
    if (this.simulateNextWriteRejection) {
      const { code, message } = this.simulateNextWriteRejection;
      this.simulateNextWriteRejection = null;
      const failure: SyncFailureRecord = {
        id: generateDocumentId('err'),
        collection: collectionName,
        documentId,
        operation,
        errorCode: code,
        errorMessage: message,
        occurredAt: new Date().toISOString(),
        preservedData,
      };
      this.diagnostics = {
        ...this.diagnostics,
        failedWrites: [failure, ...this.diagnostics.failedWrites],
      };
      this.emitDiagnostics();
      throw new Error(message);
    }
  }

  getSyncDiagnostics(): SyncDiagnosticsState {
    return this.diagnostics;
  }

  subscribeSyncDiagnostics(listener: (state: SyncDiagnosticsState) => void): () => void {
    this.diagnosticsListeners.add(listener);
    listener(this.diagnostics);
    return () => {
      this.diagnosticsListeners.delete(listener);
    };
  }

  dismissFailedWrite(failureId: string): void {
    this.diagnostics = {
      ...this.diagnostics,
      failedWrites: this.diagnostics.failedWrites.filter((f) => f.id !== failureId),
    };
    this.emitDiagnostics();
  }

  async setSimulatedOffline(offline: boolean): Promise<void> {
    if (offline) {
      this.diagnostics = {
        ...this.diagnostics,
        isOnline: false,
      };
      // Mark existing confirmed records as cached_offline if they have no pending writes
      for (const [uid, map] of this.foodEntries.entries()) {
        for (const [id, entry] of map.entries()) {
          if (!entry._meta?.hasPendingWrites) {
            map.set(id, {
              ...entry,
              _meta: { syncState: 'cached_offline', hasPendingWrites: false, fromCache: true },
            });
          }
        }
        this.emitFoodEntries(uid);
      }
      this.emitDiagnostics();
    } else {
      // Reconnecting: flush all pending writes to confirmed
      this.diagnostics = {
        ...this.diagnostics,
        isOnline: true,
        pendingWritesCount: 0,
        lastServerSyncAt: new Date().toISOString(),
      };

      for (const [uid, profile] of this.profiles.entries()) {
        this.profiles.set(uid, {
          ...profile,
          _meta: { syncState: 'confirmed', hasPendingWrites: false, fromCache: false },
        });
        this.emitProfile(uid);
      }

      for (const [uid, map] of this.foodEntries.entries()) {
        for (const [id, entry] of map.entries()) {
          map.set(id, {
            ...entry,
            _meta: { syncState: 'confirmed', hasPendingWrites: false, fromCache: false },
          });
        }
        this.emitFoodEntries(uid);
      }

      for (const [uid, map] of this.recipes.entries()) {
        for (const [id, r] of map.entries()) {
          map.set(id, {
            ...r,
            _meta: { syncState: 'confirmed', hasPendingWrites: false, fromCache: false },
          });
        }
        this.emitRecipes(uid);
      }

      for (const [uid, map] of this.savedMeals.entries()) {
        for (const [id, m] of map.entries()) {
          map.set(id, {
            ...m,
            _meta: { syncState: 'confirmed', hasPendingWrites: false, fromCache: false },
          });
        }
        this.emitSavedMeals(uid);
      }

      for (const [uid, map] of this.weightEntries.entries()) {
        for (const [id, w] of map.entries()) {
          map.set(id, {
            ...w,
            _meta: { syncState: 'confirmed', hasPendingWrites: false, fromCache: false },
          });
        }
        this.emitWeightEntries(uid);
      }

      this.emitDiagnostics();
    }
  }

  subscribeUserProfile(
    uid: string,
    onUpdate: (profile: UserProfile | null) => void
  ): () => void {
    if (!this.profileListeners.has(uid)) {
      this.profileListeners.set(uid, new Set());
    }
    const set = this.profileListeners.get(uid)!;
    set.add(onUpdate);
    onUpdate(this.profiles.get(uid) ?? null);
    return () => {
      set.delete(onUpdate);
    };
  }

  async saveUserProfile(
    uid: string,
    profile: UserProfile
  ): Promise<WriteOperationResult<UserProfile>> {
    if (profile.uid !== uid) {
      throw new Error('Unauthorized: Profile UID mismatch.');
    }
    this.checkSimulatedRejection('users', uid, 'update', profile);

    const meta = this.getCurrentMetaForWrite();
    const nowIso = new Date().toISOString();
    const saved: UserProfile = {
      ...profile,
      uid,
      createdAt: profile.createdAt || nowIso,
      updatedAt: nowIso,
      _meta: meta,
    };
    this.profiles.set(uid, saved);

    if (!this.diagnostics.isOnline) {
      this.diagnostics = {
        ...this.diagnostics,
        pendingWritesCount: this.diagnostics.pendingWritesCount + 1,
      };
      this.emitDiagnostics();
    }

    this.emitProfile(uid);
    return {
      data: saved,
      confirmedByServer: this.diagnostics.isOnline,
      syncState: meta.syncState,
    };
  }

  subscribeFoodEntries(
    uid: string,
    onUpdate: (entries: FoodEntry[]) => void
  ): () => void {
    if (!this.foodListeners.has(uid)) {
      this.foodListeners.set(uid, new Set());
    }
    const set = this.foodListeners.get(uid)!;
    set.add(onUpdate);
    this.emitFoodEntries(uid);
    return () => {
      set.delete(onUpdate);
    };
  }

  async createFoodEntry(
    uid: string,
    draft: FoodEntryDraft,
    customId?: string
  ): Promise<WriteOperationResult<FoodEntry>> {
    const entryId = customId || generateDocumentId('food');
    this.checkSimulatedRejection('foodEntries', entryId, 'create', draft);

    const nowIso = new Date().toISOString();
    const meta = this.getCurrentMetaForWrite();
    const entry: FoodEntry = {
      ...draft,
      id: entryId,
      uid,
      createdAt: nowIso,
      updatedAt: nowIso,
      _meta: meta,
    };

    if (!this.foodEntries.has(uid)) {
      this.foodEntries.set(uid, new Map());
    }
    this.foodEntries.get(uid)!.set(entryId, entry);

    if (!this.diagnostics.isOnline) {
      this.diagnostics = {
        ...this.diagnostics,
        pendingWritesCount: this.diagnostics.pendingWritesCount + 1,
      };
      this.emitDiagnostics();
    } else {
      this.diagnostics = {
        ...this.diagnostics,
        lastServerSyncAt: nowIso,
      };
      this.emitDiagnostics();
    }

    this.emitFoodEntries(uid);
    return {
      data: entry,
      confirmedByServer: this.diagnostics.isOnline,
      syncState: meta.syncState,
    };
  }

  async updateFoodEntry(
    uid: string,
    entryId: string,
    existingEntry: FoodEntry,
    updates: Partial<FoodEntryDraft>
  ): Promise<WriteOperationResult<FoodEntry>> {
    if (existingEntry.uid !== uid) {
      throw new Error('Unauthorized: Cannot modify another user’s food entry.');
    }
    this.checkSimulatedRejection('foodEntries', entryId, 'update', { ...existingEntry, ...updates });

    const nowIso = new Date().toISOString();
    const meta = this.getCurrentMetaForWrite();
    const updated: FoodEntry = {
      ...existingEntry,
      ...updates,
      id: entryId,
      uid,
      createdAt: existingEntry.createdAt,
      updatedAt: nowIso,
      _meta: meta,
    };

    if (!this.foodEntries.has(uid)) {
      this.foodEntries.set(uid, new Map());
    }
    this.foodEntries.get(uid)!.set(entryId, updated);

    if (!this.diagnostics.isOnline) {
      this.diagnostics = {
        ...this.diagnostics,
        pendingWritesCount: this.diagnostics.pendingWritesCount + 1,
      };
      this.emitDiagnostics();
    }

    this.emitFoodEntries(uid);
    return {
      data: updated,
      confirmedByServer: this.diagnostics.isOnline,
      syncState: meta.syncState,
    };
  }

  async deleteFoodEntry(
    uid: string,
    entryId: string,
    preservedEntry?: FoodEntry
  ): Promise<WriteOperationResult> {
    this.checkSimulatedRejection('foodEntries', entryId, 'delete', preservedEntry);

    const map = this.foodEntries.get(uid);
    if (map) {
      const existing = map.get(entryId);
      if (existing && existing.uid !== uid) {
        throw new Error('Unauthorized: Cannot delete another user’s food entry.');
      }
      map.delete(entryId);
    }

    if (!this.diagnostics.isOnline) {
      this.diagnostics = {
        ...this.diagnostics,
        pendingWritesCount: this.diagnostics.pendingWritesCount + 1,
      };
      this.emitDiagnostics();
    }

    this.emitFoodEntries(uid);
    return {
      confirmedByServer: this.diagnostics.isOnline,
      syncState: this.diagnostics.isOnline ? 'confirmed' : 'pending_sync',
    };
  }

  async duplicateFoodEntry(
    uid: string,
    sourceEntry: FoodEntry,
    targetDate?: string,
    targetMealType?: FoodEntry['mealType']
  ): Promise<WriteOperationResult<FoodEntry>> {
    const draft: FoodEntryDraft = {
      date: targetDate || sourceEntry.date,
      mealType: targetMealType || sourceEntry.mealType,
      loggedAt: getCurrentTimeHHMM(),
      name: sourceEntry.name,
      brand: sourceEntry.brand,
      referenceId: sourceEntry.referenceId,
      quantity: sourceEntry.quantity,
      unit: sourceEntry.unit,
      servingGrams: sourceEntry.servingGrams,
      servingDescription: sourceEntry.servingDescription,
      nutrition: { ...sourceEntry.nutrition },
      baseNutritionPer100g: sourceEntry.baseNutritionPer100g
        ? { ...sourceEntry.baseNutritionPer100g }
        : undefined,
      dataQuality: sourceEntry.dataQuality,
      sourceType: sourceEntry.sourceType,
      notes: sourceEntry.notes,
      aiMetadata: sourceEntry.aiMetadata,
    };
    return this.createFoodEntry(uid, draft);
  }

  subscribeRecipes(uid: string, onUpdate: (recipes: Recipe[]) => void): () => void {
    if (!this.recipeListeners.has(uid)) {
      this.recipeListeners.set(uid, new Set());
    }
    const set = this.recipeListeners.get(uid)!;
    set.add(onUpdate);
    this.emitRecipes(uid);
    return () => {
      set.delete(onUpdate);
    };
  }

  async saveRecipe(
    uid: string,
    draft: RecipeDraft,
    existingId?: string,
    existingCreatedAt?: string
  ): Promise<WriteOperationResult<Recipe>> {
    const recipeId = existingId || generateDocumentId('rcp');
    this.checkSimulatedRejection('recipes', recipeId, existingId ? 'update' : 'create', draft);

    const nowIso = new Date().toISOString();
    const meta = this.getCurrentMetaForWrite();
    const recipe: Recipe = {
      ...draft,
      id: recipeId,
      uid,
      createdAt: existingCreatedAt || nowIso,
      updatedAt: nowIso,
      _meta: meta,
    };
    if (!this.recipes.has(uid)) {
      this.recipes.set(uid, new Map());
    }
    this.recipes.get(uid)!.set(recipeId, recipe);

    if (!this.diagnostics.isOnline) {
      this.diagnostics = {
        ...this.diagnostics,
        pendingWritesCount: this.diagnostics.pendingWritesCount + 1,
      };
      this.emitDiagnostics();
    }

    this.emitRecipes(uid);
    return {
      data: recipe,
      confirmedByServer: this.diagnostics.isOnline,
      syncState: meta.syncState,
    };
  }

  async deleteRecipe(uid: string, recipeId: string): Promise<WriteOperationResult> {
    this.recipes.get(uid)?.delete(recipeId);
    this.emitRecipes(uid);
    return {
      confirmedByServer: this.diagnostics.isOnline,
      syncState: this.diagnostics.isOnline ? 'confirmed' : 'pending_sync',
    };
  }

  subscribeSavedMeals(uid: string, onUpdate: (meals: SavedMeal[]) => void): () => void {
    if (!this.savedMealListeners.has(uid)) {
      this.savedMealListeners.set(uid, new Set());
    }
    const set = this.savedMealListeners.get(uid)!;
    set.add(onUpdate);
    this.emitSavedMeals(uid);
    return () => {
      set.delete(onUpdate);
    };
  }

  async saveSavedMeal(
    uid: string,
    draft: SavedMealDraft,
    existingId?: string,
    existingCreatedAt?: string
  ): Promise<WriteOperationResult<SavedMeal>> {
    const mealId = existingId || generateDocumentId('meal');
    this.checkSimulatedRejection('savedMeals', mealId, existingId ? 'update' : 'create', draft);

    const nowIso = new Date().toISOString();
    const meta = this.getCurrentMetaForWrite();
    const meal: SavedMeal = {
      ...draft,
      id: mealId,
      uid,
      createdAt: existingCreatedAt || nowIso,
      updatedAt: nowIso,
      _meta: meta,
    };
    if (!this.savedMeals.has(uid)) {
      this.savedMeals.set(uid, new Map());
    }
    this.savedMeals.get(uid)!.set(mealId, meal);

    if (!this.diagnostics.isOnline) {
      this.diagnostics = {
        ...this.diagnostics,
        pendingWritesCount: this.diagnostics.pendingWritesCount + 1,
      };
      this.emitDiagnostics();
    }

    this.emitSavedMeals(uid);
    return {
      data: meal,
      confirmedByServer: this.diagnostics.isOnline,
      syncState: meta.syncState,
    };
  }

  async deleteSavedMeal(uid: string, mealId: string): Promise<WriteOperationResult> {
    this.savedMeals.get(uid)?.delete(mealId);
    this.emitSavedMeals(uid);
    return {
      confirmedByServer: this.diagnostics.isOnline,
      syncState: this.diagnostics.isOnline ? 'confirmed' : 'pending_sync',
    };
  }

  subscribeWeightEntries(uid: string, onUpdate: (entries: WeightEntry[]) => void): () => void {
    if (!this.weightListeners.has(uid)) {
      this.weightListeners.set(uid, new Set());
    }
    const set = this.weightListeners.get(uid)!;
    set.add(onUpdate);
    this.emitWeightEntries(uid);
    return () => {
      set.delete(onUpdate);
    };
  }

  async saveWeightEntry(
    uid: string,
    draft: WeightEntryDraft,
    existingId?: string,
    existingCreatedAt?: string
  ): Promise<WriteOperationResult<WeightEntry>> {
    const entryId = existingId || generateDocumentId('wt');
    this.checkSimulatedRejection('weightEntries', entryId, existingId ? 'update' : 'create', draft);

    const nowIso = new Date().toISOString();
    const meta = this.getCurrentMetaForWrite();
    const entry: WeightEntry = {
      ...draft,
      id: entryId,
      uid,
      createdAt: existingCreatedAt || nowIso,
      updatedAt: nowIso,
      _meta: meta,
    };
    if (!this.weightEntries.has(uid)) {
      this.weightEntries.set(uid, new Map());
    }
    this.weightEntries.get(uid)!.set(entryId, entry);

    if (!this.diagnostics.isOnline) {
      this.diagnostics = {
        ...this.diagnostics,
        pendingWritesCount: this.diagnostics.pendingWritesCount + 1,
      };
      this.emitDiagnostics();
    }

    this.emitWeightEntries(uid);
    return {
      data: entry,
      confirmedByServer: this.diagnostics.isOnline,
      syncState: meta.syncState,
    };
  }

  async deleteWeightEntry(uid: string, entryId: string): Promise<WriteOperationResult> {
    this.weightEntries.get(uid)?.delete(entryId);
    this.emitWeightEntries(uid);
    return {
      confirmedByServer: this.diagnostics.isOnline,
      syncState: this.diagnostics.isOnline ? 'confirmed' : 'pending_sync',
    };
  }

  async deleteAllUserData(uid: string): Promise<{ deletedCount: number }> {
    let deletedCount = 0;
    const fMap = this.foodEntries.get(uid);
    if (fMap) {
      deletedCount += fMap.size;
      this.foodEntries.delete(uid);
    }
    const rMap = this.recipes.get(uid);
    if (rMap) {
      deletedCount += rMap.size;
      this.recipes.delete(uid);
    }
    const mMap = this.savedMeals.get(uid);
    if (mMap) {
      deletedCount += mMap.size;
      this.savedMeals.delete(uid);
    }
    const wMap = this.weightEntries.get(uid);
    if (wMap) {
      deletedCount += wMap.size;
      this.weightEntries.delete(uid);
    }
    if (this.profiles.has(uid)) {
      deletedCount += 1;
      this.profiles.delete(uid);
    }

    this.emitProfile(uid);
    this.emitFoodEntries(uid);
    this.emitRecipes(uid);
    this.emitSavedMeals(uid);
    this.emitWeightEntries(uid);

    return { deletedCount };
  }
}

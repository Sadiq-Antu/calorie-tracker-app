/**
 * Core Domain Types & Data Contracts for NutriPulse Calorie Tracker PWA
 * Matches Firestore Security Rules (`firestore.rules`) 1-to-1.
 */

export type MeasurementSystem = 'metric' | 'imperial';

export type ThemePreference = 'light' | 'dark' | 'system';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export type ServingUnit =
  | 'g'
  | 'ml'
  | 'oz'
  | 'lb'
  | 'fl_oz'
  | 'cup'
  | 'tbsp'
  | 'tsp'
  | 'serving'
  | 'piece'
  | 'slice'
  | 'bowl';

/**
 * Distinguishes verified reference nutrition data from user-entered estimates
 * and future Phase 2 AI-derived estimates.
 */
export type DataQuality =
  | 'verified'        // Verified USDA / official nutrition reference database
  | 'verified_label'  // User entered directly from a package Nutrition Facts label
  | 'user_estimate'   // User-estimated values (unverified / restaurant / homemade estimate)
  | 'ai_estimate';    // Phase 2: AI vision/text recognition estimate

export type FoodSourceType =
  | 'reference_db'
  | 'manual'
  | 'recipe'
  | 'saved_meal'
  | 'ai_recognition'; // Phase 2 extension hook

/**
 * Cloud vs. Local Cache Synchronization State
 * Never falsely claims that an offline write has been confirmed by the cloud.
 */
export type RecordSyncState =
  | 'confirmed'      // Acknowledged by Cloud Firestore server (hasPendingWrites=false, fromCache=false)
  | 'cached_offline' // Loaded from local IndexedDB cache while offline (hasPendingWrites=false, fromCache=true)
  | 'pending_sync'   // Queued locally in IndexedDB awaiting cloud sync (hasPendingWrites=true)
  | 'sync_error';    // Write was rejected by server or failed synchronization

export interface RecordMetadata {
  syncState: RecordSyncState;
  hasPendingWrites: boolean;
  fromCache: boolean;
  errorMessage?: string;
}

export interface NutritionValues {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams?: number;
  sugarGrams?: number;
  sodiumMg?: number;
}

export interface MacroGoals {
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
}

export type WeightDirection = 'lose' | 'maintain' | 'gain';

export interface WeightGoal {
  currentWeightKg: number;
  targetWeightKg: number;
  direction: WeightDirection;
  weeklyRateKg?: number;
}

export type BiologicalSex = 'female' | 'male' | 'other' | 'prefer_not_to_say';

export type ActivityLevel =
  | 'sedentary'
  | 'lightly_active'
  | 'moderately_active'
  | 'very_active'
  | 'extra_active';

export interface OptionalProfileMetrics {
  age?: number;
  sex?: BiologicalSex;
  heightCm?: number;
  activityLevel?: ActivityLevel;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string | null;
  preferredUnits: MeasurementSystem;
  dailyCalorieGoal: number;
  macroGoals: MacroGoals;
  dietaryPreferences?: string[];
  dietaryNotes?: string;
  weightGoal?: WeightGoal | null;
  optionalMetrics?: OptionalProfileMetrics | null;
  themePreference?: ThemePreference;
  onboardingCompleted: boolean;
  schemaVersion?: number;
  createdAt: string;
  updatedAt: string;
  _meta?: RecordMetadata;
}

/**
 * Phase 2 Extension Metadata for AI Food Recognition
 * Allows Phase 2 AI modules to attach recognition provenance without schema changes.
 */
export interface AiRecognitionMetadata {
  providerId?: string;
  modelVersion?: string;
  confidenceScore?: number; // 0.0 to 1.0
  recognizedAt?: string;
  userReviewed?: boolean;
  rawDetectedLabel?: string;
}

export interface FoodEntry {
  id: string;
  uid: string;
  date: string; // YYYY-MM-DD
  mealType: MealType;
  loggedAt: string; // HH:mm or ISO string
  name: string;
  brand?: string;
  referenceId?: string;
  quantity: number;
  unit: ServingUnit;
  servingGrams: number;
  servingDescription: string;
  nutrition: NutritionValues;
  baseNutritionPer100g?: NutritionValues | null;
  dataQuality: DataQuality;
  sourceType: FoodSourceType;
  notes?: string;
  aiMetadata?: AiRecognitionMetadata | null;
  createdAt: string;
  updatedAt: string;
  _meta?: RecordMetadata;
}

export type FoodEntryDraft = Omit<FoodEntry, 'id' | 'uid' | 'createdAt' | 'updatedAt' | '_meta'>;

export interface RecipeIngredient {
  id: string;
  name: string;
  quantity: number;
  unit: ServingUnit;
  weightGrams: number;
  nutrition: NutritionValues;
  dataQuality: DataQuality;
}

export interface Recipe {
  id: string;
  uid: string;
  name: string;
  servingsCount: number;
  totalWeightGrams: number;
  ingredients: RecipeIngredient[];
  nutritionPerServing: NutritionValues;
  dataQuality: DataQuality;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  _meta?: RecordMetadata;
}

export type RecipeDraft = Omit<Recipe, 'id' | 'uid' | 'createdAt' | 'updatedAt' | '_meta'>;

export interface SavedMeal {
  id: string;
  uid: string;
  name: string;
  brand?: string;
  defaultQuantity: number;
  defaultUnit: ServingUnit;
  servingGrams: number;
  servingDescription: string;
  nutrition: NutritionValues;
  defaultMealType?: MealType;
  dataQuality: DataQuality;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  _meta?: RecordMetadata;
}

export type SavedMealDraft = Omit<SavedMeal, 'id' | 'uid' | 'createdAt' | 'updatedAt' | '_meta'>;

export interface WeightEntry {
  id: string;
  uid: string;
  date: string; // YYYY-MM-DD
  weightKg: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  _meta?: RecordMetadata;
}

export type WeightEntryDraft = Omit<WeightEntry, 'id' | 'uid' | 'createdAt' | 'updatedAt' | '_meta'>;

/**
 * Curated Reference Food Item (USDA FoodData Central verified foundation/SR items)
 */
export interface HouseholdServingOption {
  unit: ServingUnit;
  label: string;
  gramsEquivalent: number;
  defaultQuantity: number;
}

export interface ReferenceFoodItem {
  id: string;
  usdaFdcId: string;
  name: string;
  category:
    | 'Produce & Fruit'
    | 'Proteins & Meat'
    | 'Dairy & Eggs'
    | 'Grains & Bread'
    | 'Legumes, Nuts & Seeds'
    | 'Fats & Oils'
    | 'Beverages'
    | 'Prepared & Staples';
  brand?: string;
  isLiquid?: boolean;
  nutritionPer100g: NutritionValues;
  defaultServing: HouseholdServingOption;
  alternateServings: HouseholdServingOption[];
  dataQuality: 'verified';
}

/**
 * Daily Nutrition Summary computed dynamically from individual FoodEntries
 */
export interface DailyNutritionSummary {
  date: string;
  consumed: NutritionValues;
  calorieGoal: number;
  remainingCalories: number; // Positive when under goal, negative when over goal
  isOverCalorieGoal: boolean;
  overCalorieAmount: number;
  calorieProgressPercent: number;
  macroGoals: MacroGoals;
  macroProgressPercent: {
    protein: number;
    carbs: number;
    fat: number;
  };
  macroCalorieDistribution: {
    proteinKcal: number;
    carbsKcal: number;
    fatKcal: number;
    proteinPercent: number;
    carbsPercent: number;
    fatPercent: number;
  };
  mealSubtotals: Record<MealType, NutritionValues>;
  mealCounts: Record<MealType, number>;
  dataQualityBreakdown: {
    verifiedCount: number;
    estimateCount: number;
    verifiedCalories: number;
    estimatedCalories: number;
  };
  syncBreakdown: {
    confirmedCount: number;
    pendingCount: number;
    cachedOfflineCount: number;
    errorCount: number;
  };
}

/**
 * Rejected / Failed Write Tracking so user data is never silently lost
 */
export interface SyncFailureRecord {
  id: string;
  collection: 'users' | 'foodEntries' | 'recipes' | 'savedMeals' | 'weightEntries';
  documentId: string;
  operation: 'create' | 'update' | 'delete';
  errorCode: string;
  errorMessage: string;
  occurredAt: string;
  preservedData?: unknown;
}

/**
 * Persistence & Connectivity Diagnostics
 */
export type PersistenceSupportMode =
  | 'indexeddb_persistent' // Full multi-tab IndexedDB persistence active
  | 'memory_fallback'      // Browser blocked IndexedDB or private mode; in-memory only
  | 'initializing';

export interface SyncDiagnosticsState {
  isOnline: boolean;
  persistenceMode: PersistenceSupportMode;
  persistenceWarning?: string;
  pendingWritesCount: number;
  hasUncachedViews: boolean;
  lastServerSyncAt?: string;
  failedWrites: SyncFailureRecord[];
}

/**
 * Data Portability — Backup & Export Schema
 */
export const CURRENT_BACKUP_SCHEMA_VERSION = '1.0.0';

export interface BackupPayloadV1 {
  schemaVersion: '1.0.0';
  exportType: 'full_backup' | 'partial_export';
  appName: 'NutriPulse';
  exportedAt: string;
  sourceUid: string;
  counts: {
    foodEntries: number;
    recipes: number;
    savedMeals: number;
    weightEntries: number;
  };
  data: {
    profile: UserProfile | null;
    foodEntries: FoodEntry[];
    recipes: Recipe[];
    savedMeals: SavedMeal[];
    weightEntries: WeightEntry[];
  };
}

export type ImportConflictStrategy = 'skip_existing' | 'keep_both' | 'overwrite_existing';

export interface ImportPreviewSummary {
  schemaVersion: string;
  exportType: string;
  exportedAt: string;
  hasProfile: boolean;
  profileDisplayName?: string;
  profileCalorieGoal?: number;
  incomingCounts: {
    foodEntries: number;
    recipes: number;
    savedMeals: number;
    weightEntries: number;
  };
  conflictCounts: {
    foodEntries: number;
    recipes: number;
    savedMeals: number;
    weightEntries: number;
    totalConflicts: number;
  };
  newCounts: {
    foodEntries: number;
    recipes: number;
    savedMeals: number;
    weightEntries: number;
  };
}

export interface ImportValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  payload?: BackupPayloadV1;
  preview?: ImportPreviewSummary;
}

/**
 * Phase 2 Architecture Contract: AI Food Recognition Provider Interface
 * Designed so Phase 2 photo/text AI recognition plugs directly into the food logging flow
 * without modifying Firestore schemas, calculation engines, or diary UI.
 */
export interface FoodRecognitionCandidate {
  name: string;
  estimatedQuantity: number;
  estimatedUnit: ServingUnit;
  estimatedServingGrams: number;
  nutrition: NutritionValues;
  confidenceScore: number;
  notes?: string;
}

export interface FoodRecognitionResult {
  providerId: string;
  modelVersion: string;
  recognizedAt: string;
  candidates: FoodRecognitionCandidate[];
}

export interface FoodRecognitionProvider {
  readonly id: string;
  readonly displayName: string;
  readonly isAvailable: boolean;
  analyzeImage?(imageBlob: Blob): Promise<FoodRecognitionResult>;
  analyzeDescription?(textPrompt: string): Promise<FoodRecognitionResult>;
  candidateToFoodEntryDraft(
    candidate: FoodRecognitionCandidate,
    date: string,
    mealType: MealType,
    loggedAt: string
  ): FoodEntryDraft;
}

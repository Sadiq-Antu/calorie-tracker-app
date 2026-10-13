import {
  BackupPayloadV1,
  CURRENT_BACKUP_SCHEMA_VERSION,
  DataQuality,
  FoodEntry,
  FoodSourceType,
  ImportConflictStrategy,
  ImportPreviewSummary,
  ImportValidationResult,
  MealType,
  NutritionValues,
  Recipe,
  SavedMeal,
  ServingUnit,
  UserProfile,
  WeightEntry,
} from '../types/domain';

const VALID_MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snacks'];
const VALID_UNITS: ServingUnit[] = [
  'g',
  'ml',
  'oz',
  'lb',
  'fl_oz',
  'cup',
  'tbsp',
  'tsp',
  'serving',
  'piece',
  'slice',
  'bowl',
];
const VALID_DATA_QUALITIES: DataQuality[] = [
  'verified',
  'verified_label',
  'user_estimate',
  'ai_estimate',
];
const VALID_SOURCE_TYPES: FoodSourceType[] = [
  'reference_db',
  'manual',
  'recipe',
  'saved_meal',
  'ai_recognition',
];

function stripMeta<T extends { _meta?: unknown }>(record: T): Omit<T, '_meta'> {
  const clone = { ...record };
  delete clone._meta;
  return clone;
}

/**
 * Generates a full restorable JSON backup or partial JSON export.
 */
export function createBackupPayload(params: {
  uid: string;
  profile: UserProfile | null;
  foodEntries: FoodEntry[];
  recipes: Recipe[];
  savedMeals: SavedMeal[];
  weightEntries: WeightEntry[];
  exportType?: 'full_backup' | 'partial_export';
}): BackupPayloadV1 {
  const cleanProfile = params.profile ? (stripMeta(params.profile) as UserProfile) : null;
  const cleanFoodEntries = params.foodEntries.map((e) => stripMeta(e) as FoodEntry);
  const cleanRecipes = params.recipes.map((r) => stripMeta(r) as Recipe);
  const cleanSavedMeals = params.savedMeals.map((m) => stripMeta(m) as SavedMeal);
  const cleanWeightEntries = params.weightEntries.map((w) => stripMeta(w) as WeightEntry);

  return {
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    exportType: params.exportType ?? 'full_backup',
    appName: 'NutriPulse',
    exportedAt: new Date().toISOString(),
    sourceUid: params.uid,
    counts: {
      foodEntries: cleanFoodEntries.length,
      recipes: cleanRecipes.length,
      savedMeals: cleanSavedMeals.length,
      weightEntries: cleanWeightEntries.length,
    },
    data: {
      profile: cleanProfile,
      foodEntries: cleanFoodEntries,
      recipes: cleanRecipes,
      savedMeals: cleanSavedMeals,
      weightEntries: cleanWeightEntries,
    },
  };
}

export function serializeBackupToJson(payload: BackupPayloadV1): string {
  return JSON.stringify(payload, null, 2);
}

/**
 * Escapes a CSV cell safely, including protection against spreadsheet formula injection
 * (cells starting with =, +, -, or @).
 */
export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  let str = String(value);
  // Mitigate CSV injection in spreadsheet applications for string values
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }

  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates a CSV export for food diary entries.
 * Note: A CSV export is a flat tabular data export for spreadsheets and analysis,
 * NOT a full restorable backup (which requires the structured JSON backup format).
 */
export function generateFoodDiaryCsv(entries: FoodEntry[]): string {
  const headers = [
    'Date',
    'Time',
    'Meal',
    'Food Name',
    'Brand',
    'Quantity',
    'Unit',
    'Serving Weight (g)',
    'Calories (kcal)',
    'Protein (g)',
    'Carbs (g)',
    'Fat (g)',
    'Fiber (g)',
    'Sugar (g)',
    'Sodium (mg)',
    'Data Quality',
    'Source Type',
    'Sync Status',
    'Notes',
  ];

  const sorted = [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.loggedAt.localeCompare(b.loggedAt);
  });

  const rows = sorted.map((entry) => [
    escapeCsvCell(entry.date),
    escapeCsvCell(entry.loggedAt),
    escapeCsvCell(entry.mealType),
    escapeCsvCell(entry.name),
    escapeCsvCell(entry.brand ?? ''),
    escapeCsvCell(entry.quantity),
    escapeCsvCell(entry.unit),
    escapeCsvCell(entry.servingGrams),
    escapeCsvCell(entry.nutrition.calories),
    escapeCsvCell(entry.nutrition.proteinGrams),
    escapeCsvCell(entry.nutrition.carbsGrams),
    escapeCsvCell(entry.nutrition.fatGrams),
    escapeCsvCell(entry.nutrition.fiberGrams ?? ''),
    escapeCsvCell(entry.nutrition.sugarGrams ?? ''),
    escapeCsvCell(entry.nutrition.sodiumMg ?? ''),
    escapeCsvCell(entry.dataQuality),
    escapeCsvCell(entry.sourceType),
    escapeCsvCell(entry._meta?.syncState ?? 'confirmed'),
    escapeCsvCell(entry.notes ?? ''),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

function isValidNutritionObject(obj: unknown): obj is NutritionValues {
  if (!obj || typeof obj !== 'object') return false;
  const n = obj as Record<string, unknown>;
  return (
    typeof n.calories === 'number' &&
    Number.isFinite(n.calories) &&
    n.calories >= 0 &&
    n.calories <= 50000 &&
    typeof n.proteinGrams === 'number' &&
    Number.isFinite(n.proteinGrams) &&
    n.proteinGrams >= 0 &&
    n.proteinGrams <= 5000 &&
    typeof n.carbsGrams === 'number' &&
    Number.isFinite(n.carbsGrams) &&
    n.carbsGrams >= 0 &&
    n.carbsGrams <= 5000 &&
    typeof n.fatGrams === 'number' &&
    Number.isFinite(n.fatGrams) &&
    n.fatGrams >= 0 &&
    n.fatGrams <= 5000
  );
}

/**
 * Validates a JSON string against the NutriPulse Backup Schema and computes a detailed
 * preview with conflict counts before any changes are applied.
 */
export function validateAndPreviewBackupJson(
  rawJson: string,
  existingData: {
    foodEntries: FoodEntry[];
    recipes: Recipe[];
    savedMeals: SavedMeal[];
    weightEntries: WeightEntry[];
  }
): ImportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!rawJson || !rawJson.trim()) {
    return { isValid: false, errors: ['Backup file is empty.'], warnings: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return {
      isValid: false,
      errors: ['Invalid JSON syntax. Please select a valid NutriPulse .json backup file.'],
      warnings: [],
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      isValid: false,
      errors: ['Backup root must be a JSON object.'],
      warnings: [],
    };
  }

  const root = parsed as Record<string, unknown>;

  if (root.appName !== 'NutriPulse') {
    errors.push('Missing or unrecognized "appName". Expected "NutriPulse".');
  }

  if (typeof root.schemaVersion !== 'string') {
    errors.push('Missing "schemaVersion" field in backup file.');
  } else if (root.schemaVersion !== CURRENT_BACKUP_SCHEMA_VERSION) {
    errors.push(
      `Unsupported backup schemaVersion "${root.schemaVersion}". Supported version is "${CURRENT_BACKUP_SCHEMA_VERSION}".`
    );
  }

  if (root.exportType !== 'full_backup' && root.exportType !== 'partial_export') {
    warnings.push('Backup "exportType" not specified; assuming partial export.');
  } else if (root.exportType === 'partial_export') {
    warnings.push(
      'This file is a partial data export rather than a full restorable backup. Some collections or profile settings may not be included.'
    );
  }

  if (!root.data || typeof root.data !== 'object' || Array.isArray(root.data)) {
    errors.push('Missing "data" container object in backup file.');
    return { isValid: false, errors, warnings };
  }

  const data = root.data as Record<string, unknown>;

  // Validate profile if present
  if (data.profile !== null && data.profile !== undefined) {
    if (typeof data.profile !== 'object' || Array.isArray(data.profile)) {
      errors.push('Invalid "data.profile" format.');
    } else {
      const p = data.profile as Record<string, unknown>;
      if (typeof p.displayName !== 'string' || p.displayName.trim().length === 0) {
        errors.push('Profile "displayName" must be a non-empty string.');
      }
      if (
        typeof p.dailyCalorieGoal !== 'number' ||
        p.dailyCalorieGoal < 500 ||
        p.dailyCalorieGoal > 15000
      ) {
        errors.push('Profile "dailyCalorieGoal" must be a number between 500 and 15,000 kcal.');
      }
      if (!p.macroGoals || typeof p.macroGoals !== 'object') {
        errors.push('Profile "macroGoals" is missing or invalid.');
      }
    }
  }

  const foodEntriesRaw = Array.isArray(data.foodEntries) ? data.foodEntries : [];
  const recipesRaw = Array.isArray(data.recipes) ? data.recipes : [];
  const savedMealsRaw = Array.isArray(data.savedMeals) ? data.savedMeals : [];
  const weightEntriesRaw = Array.isArray(data.weightEntries) ? data.weightEntries : [];

  if (!Array.isArray(data.foodEntries)) {
    errors.push('"data.foodEntries" must be an array.');
  }
  if (!Array.isArray(data.recipes)) {
    errors.push('"data.recipes" must be an array.');
  }
  if (!Array.isArray(data.savedMeals)) {
    errors.push('"data.savedMeals" must be an array.');
  }
  if (!Array.isArray(data.weightEntries)) {
    errors.push('"data.weightEntries" must be an array.');
  }

  // Validate each food entry
  foodEntriesRaw.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      errors.push(`foodEntries[${index}] is not a valid object.`);
      return;
    }
    const e = item as Record<string, unknown>;
    if (typeof e.id !== 'string' || !e.id.trim()) {
      errors.push(`foodEntries[${index}] is missing a valid string "id".`);
    }
    if (typeof e.name !== 'string' || !e.name.trim()) {
      errors.push(`foodEntries[${index}] is missing a valid food "name".`);
    }
    if (typeof e.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
      errors.push(`foodEntries[${index}] ("${e.name || 'unnamed'}") has an invalid date "${String(e.date)}". Expected YYYY-MM-DD.`);
    }
    if (!VALID_MEAL_TYPES.includes(e.mealType as MealType)) {
      errors.push(`foodEntries[${index}] has an invalid mealType "${String(e.mealType)}".`);
    }
    if (typeof e.quantity !== 'number' || e.quantity <= 0 || e.quantity > 10000) {
      errors.push(`foodEntries[${index}] has an invalid quantity "${String(e.quantity)}".`);
    }
    if (!VALID_UNITS.includes(e.unit as ServingUnit)) {
      errors.push(`foodEntries[${index}] has an invalid unit "${String(e.unit)}".`);
    }
    if (!isValidNutritionObject(e.nutrition)) {
      errors.push(`foodEntries[${index}] ("${e.name || 'unnamed'}") has invalid nutrition values.`);
    }
    if (!VALID_DATA_QUALITIES.includes(e.dataQuality as DataQuality)) {
      errors.push(`foodEntries[${index}] has an invalid dataQuality "${String(e.dataQuality)}".`);
    }
    if (!VALID_SOURCE_TYPES.includes(e.sourceType as FoodSourceType)) {
      errors.push(`foodEntries[${index}] has an invalid sourceType "${String(e.sourceType)}".`);
    }
  });

  // Validate each recipe
  recipesRaw.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      errors.push(`recipes[${index}] is not a valid object.`);
      return;
    }
    const r = item as Record<string, unknown>;
    if (typeof r.id !== 'string' || !r.id.trim()) {
      errors.push(`recipes[${index}] is missing a valid "id".`);
    }
    if (typeof r.name !== 'string' || !r.name.trim()) {
      errors.push(`recipes[${index}] is missing a valid "name".`);
    }
    if (typeof r.servingsCount !== 'number' || r.servingsCount <= 0) {
      errors.push(`recipes[${index}] has an invalid "servingsCount".`);
    }
    if (!Array.isArray(r.ingredients) || r.ingredients.length === 0) {
      errors.push(`recipes[${index}] must contain at least one ingredient.`);
    }
    if (!isValidNutritionObject(r.nutritionPerServing)) {
      errors.push(`recipes[${index}] has invalid "nutritionPerServing" values.`);
    }
  });

  // Validate each savedMeal
  savedMealsRaw.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      errors.push(`savedMeals[${index}] is not a valid object.`);
      return;
    }
    const m = item as Record<string, unknown>;
    if (typeof m.id !== 'string' || !m.id.trim()) {
      errors.push(`savedMeals[${index}] is missing a valid "id".`);
    }
    if (typeof m.name !== 'string' || !m.name.trim()) {
      errors.push(`savedMeals[${index}] is missing a valid "name".`);
    }
    if (!isValidNutritionObject(m.nutrition)) {
      errors.push(`savedMeals[${index}] has invalid "nutrition" values.`);
    }
  });

  // Validate each weightEntry
  weightEntriesRaw.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      errors.push(`weightEntries[${index}] is not a valid object.`);
      return;
    }
    const w = item as Record<string, unknown>;
    if (typeof w.id !== 'string' || !w.id.trim()) {
      errors.push(`weightEntries[${index}] is missing a valid "id".`);
    }
    if (typeof w.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(w.date)) {
      errors.push(`weightEntries[${index}] has an invalid date.`);
    }
    if (typeof w.weightKg !== 'number' || w.weightKg < 15 || w.weightKg > 600) {
      errors.push(`weightEntries[${index}] has an out-of-range weightKg.`);
    }
  });

  if (errors.length > 0) {
    return { isValid: false, errors, warnings };
  }

  const typedPayload = parsed as BackupPayloadV1;

  // Compute conflict counts against existing user records
  const existingFoodIds = new Set(existingData.foodEntries.map((e) => e.id));
  const existingRecipeIds = new Set(existingData.recipes.map((r) => r.id));
  const existingSavedMealIds = new Set(existingData.savedMeals.map((m) => m.id));
  const existingWeightIds = new Set(existingData.weightEntries.map((w) => w.id));

  const foodConflicts = typedPayload.data.foodEntries.filter((e) => existingFoodIds.has(e.id)).length;
  const recipeConflicts = typedPayload.data.recipes.filter((r) => existingRecipeIds.has(r.id)).length;
  const savedMealConflicts = typedPayload.data.savedMeals.filter((m) => existingSavedMealIds.has(m.id)).length;
  const weightConflicts = typedPayload.data.weightEntries.filter((w) => existingWeightIds.has(w.id)).length;

  const totalConflicts = foodConflicts + recipeConflicts + savedMealConflicts + weightConflicts;
  if (totalConflicts > 0) {
    warnings.push(
      `${totalConflicts} record(s) in this backup share IDs with records already in your account. Choose how to handle existing records before restoring.`
    );
  }

  const preview: ImportPreviewSummary = {
    schemaVersion: typedPayload.schemaVersion,
    exportType: typedPayload.exportType,
    exportedAt: typedPayload.exportedAt || 'Unknown',
    hasProfile: Boolean(typedPayload.data.profile),
    profileDisplayName: typedPayload.data.profile?.displayName,
    profileCalorieGoal: typedPayload.data.profile?.dailyCalorieGoal,
    incomingCounts: {
      foodEntries: typedPayload.data.foodEntries.length,
      recipes: typedPayload.data.recipes.length,
      savedMeals: typedPayload.data.savedMeals.length,
      weightEntries: typedPayload.data.weightEntries.length,
    },
    conflictCounts: {
      foodEntries: foodConflicts,
      recipes: recipeConflicts,
      savedMeals: savedMealConflicts,
      weightEntries: weightConflicts,
      totalConflicts,
    },
    newCounts: {
      foodEntries: typedPayload.data.foodEntries.length - foodConflicts,
      recipes: typedPayload.data.recipes.length - recipeConflicts,
      savedMeals: typedPayload.data.savedMeals.length - savedMealConflicts,
      weightEntries: typedPayload.data.weightEntries.length - weightConflicts,
    },
  };

  return {
    isValid: true,
    errors: [],
    warnings,
    payload: typedPayload,
    preview,
  };
}

/**
 * Prepares the exact list of records to write based on the user's explicit conflict resolution decision.
 * Never overwrites existing records unless `strategy === 'overwrite_existing'` is explicitly chosen.
 */
export function buildImportExecutionPlan(params: {
  targetUid: string;
  payload: BackupPayloadV1;
  strategy: ImportConflictStrategy;
  restoreProfileGoals: boolean;
  existingIds: {
    foodEntries: Set<string>;
    recipes: Set<string>;
    savedMeals: Set<string>;
    weightEntries: Set<string>;
  };
}): {
  profileToSave: UserProfile | null;
  foodEntriesToSave: FoodEntry[];
  recipesToSave: Recipe[];
  savedMealsToSave: SavedMeal[];
  weightEntriesToSave: WeightEntry[];
  summary: {
    importedFoodEntries: number;
    skippedFoodEntries: number;
    importedRecipes: number;
    importedSavedMeals: number;
    importedWeightEntries: number;
    profileUpdated: boolean;
  };
} {
  const { targetUid, payload, strategy, restoreProfileGoals, existingIds } = params;
  const nowIso = new Date().toISOString();

  let profileToSave: UserProfile | null = null;
  if (restoreProfileGoals && payload.data.profile) {
    profileToSave = {
      ...stripMeta(payload.data.profile),
      uid: targetUid,
      onboardingCompleted: true,
      updatedAt: nowIso,
    };
  }

  let skippedFoodEntries = 0;

  function resolveCollection<T extends { id: string; uid: string; updatedAt: string; _meta?: unknown }>(
    items: T[],
    existingSet: Set<string>,
    onSkip?: () => void
  ): T[] {
    const out: T[] = [];
    for (const rawItem of items) {
      const item = stripMeta(rawItem) as T;
      const isConflict = existingSet.has(item.id);
      if (isConflict) {
        if (strategy === 'skip_existing') {
          if (onSkip) onSkip();
          continue;
        }
        if (strategy === 'keep_both') {
          const newId = `${item.id}-imp-${Math.random().toString(36).slice(2, 8)}`;
          out.push({
            ...item,
            id: newId,
            uid: targetUid,
            updatedAt: nowIso,
          });
          continue;
        }
      }
      //Either not a conflict, or strategy === 'overwrite_existing'
      out.push({
        ...item,
        uid: targetUid,
        updatedAt: nowIso,
      });
    }
    return out;
  }

  const foodEntriesToSave = resolveCollection(
    payload.data.foodEntries,
    existingIds.foodEntries,
    () => {
      skippedFoodEntries += 1;
    }
  );
  const recipesToSave = resolveCollection(payload.data.recipes, existingIds.recipes);
  const savedMealsToSave = resolveCollection(payload.data.savedMeals, existingIds.savedMeals);
  const weightEntriesToSave = resolveCollection(
    payload.data.weightEntries,
    existingIds.weightEntries
  );

  return {
    profileToSave,
    foodEntriesToSave,
    recipesToSave,
    savedMealsToSave,
    weightEntriesToSave,
    summary: {
      importedFoodEntries: foodEntriesToSave.length,
      skippedFoodEntries,
      importedRecipes: recipesToSave.length,
      importedSavedMeals: savedMealsToSave.length,
      importedWeightEntries: weightEntriesToSave.length,
      profileUpdated: Boolean(profileToSave),
    },
  };
}

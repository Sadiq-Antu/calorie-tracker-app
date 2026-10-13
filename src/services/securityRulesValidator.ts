/**
 * Firestore Security Rules Engine Evaluator for Automated Security Testing
 * Mirrors and verifies the exact rules defined in `firestore.rules`.
 */

export interface SecurityRuleRequestContext {
  auth: {
    uid: string;
  } | null;
  path: string; // e.g., "/users/user_123/foodEntries/entry_456"
  method: 'read' | 'create' | 'update' | 'delete';
  resourceData?: Record<string, unknown>; // Existing document data on server (for update)
  requestResourceData?: Record<string, unknown>; // Incoming document data (for create/update)
}

export interface SecurityRuleEvaluationResult {
  allowed: boolean;
  reason: string;
}

const VALID_MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snacks']);
const VALID_UNITS = new Set([
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
]);
const VALID_DATA_QUALITIES = new Set([
  'verified',
  'verified_label',
  'user_estimate',
  'ai_estimate',
]);
const VALID_SOURCE_TYPES = new Set([
  'reference_db',
  'manual',
  'recipe',
  'saved_meal',
  'ai_recognition',
]);

function isNonNegativeNumber(val: unknown, maxVal: number): boolean {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0 && val <= maxVal;
}

function isPositiveNumber(val: unknown, maxVal: number): boolean {
  return typeof val === 'number' && Number.isFinite(val) && val > 0 && val <= maxVal;
}

function isValidIsoString(val: unknown): boolean {
  return typeof val === 'string' && val.length >= 10 && val.length <= 40;
}

function isValidDateString(val: unknown): boolean {
  return typeof val === 'string' && val.length === 10 && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(val);
}

function hasAllKeys(obj: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((k) => Object.prototype.hasOwnProperty.call(obj, k));
}

function hasOnlyKeys(obj: Record<string, unknown>, allowedKeys: string[]): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(obj).every((k) => allowed.has(k));
}

function isValidNutritionMap(nutr: unknown): boolean {
  if (!nutr || typeof nutr !== 'object' || Array.isArray(nutr)) return false;
  const n = nutr as Record<string, unknown>;
  const req = ['calories', 'proteinGrams', 'carbsGrams', 'fatGrams'];
  const allowed = [
    'calories',
    'proteinGrams',
    'carbsGrams',
    'fatGrams',
    'fiberGrams',
    'sugarGrams',
    'sodiumMg',
  ];
  if (!hasAllKeys(n, req) || !hasOnlyKeys(n, allowed)) return false;
  if (!isNonNegativeNumber(n.calories, 50000)) return false;
  if (!isNonNegativeNumber(n.proteinGrams, 5000)) return false;
  if (!isNonNegativeNumber(n.carbsGrams, 5000)) return false;
  if (!isNonNegativeNumber(n.fatGrams, 5000)) return false;
  if ('fiberGrams' in n && n.fiberGrams !== null && !isNonNegativeNumber(n.fiberGrams, 2000))
    return false;
  if ('sugarGrams' in n && n.sugarGrams !== null && !isNonNegativeNumber(n.sugarGrams, 5000))
    return false;
  if ('sodiumMg' in n && n.sodiumMg !== null && !isNonNegativeNumber(n.sodiumMg, 100000))
    return false;
  return true;
}

function isValidMacroGoals(goals: unknown): boolean {
  if (!goals || typeof goals !== 'object' || Array.isArray(goals)) return false;
  const g = goals as Record<string, unknown>;
  const keys = ['proteinGrams', 'carbsGrams', 'fatGrams'];
  return (
    hasAllKeys(g, keys) &&
    hasOnlyKeys(g, keys) &&
    isNonNegativeNumber(g.proteinGrams, 2000) &&
    isNonNegativeNumber(g.carbsGrams, 2000) &&
    isNonNegativeNumber(g.fatGrams, 2000)
  );
}

function validateUserProfileData(uid: string, data: Record<string, unknown>): SecurityRuleEvaluationResult {
  const requiredKeys = [
    'uid',
    'displayName',
    'email',
    'preferredUnits',
    'dailyCalorieGoal',
    'macroGoals',
    'onboardingCompleted',
    'createdAt',
    'updatedAt',
  ];
  const allowedKeys = [
    ...requiredKeys,
    'photoURL',
    'dietaryPreferences',
    'dietaryNotes',
    'weightGoal',
    'optionalMetrics',
    'themePreference',
    'schemaVersion',
  ];

  if (!hasAllKeys(data, requiredKeys)) {
    return { allowed: false, reason: 'Missing required user profile fields' };
  }
  if (!hasOnlyKeys(data, allowedKeys)) {
    return { allowed: false, reason: 'Unexpected extra fields in user profile' };
  }
  if (data.uid !== uid) {
    return { allowed: false, reason: 'Profile uid field must match document path uid' };
  }
  if (typeof data.displayName !== 'string' || data.displayName.length < 1 || data.displayName.length > 100) {
    return { allowed: false, reason: 'Invalid displayName' };
  }
  if (typeof data.email !== 'string' || data.email.length > 254) {
    return { allowed: false, reason: 'Invalid email' };
  }
  if (data.preferredUnits !== 'metric' && data.preferredUnits !== 'imperial') {
    return { allowed: false, reason: 'Invalid preferredUnits' };
  }
  if (
    typeof data.dailyCalorieGoal !== 'number' ||
    data.dailyCalorieGoal < 500 ||
    data.dailyCalorieGoal > 15000
  ) {
    return { allowed: false, reason: 'dailyCalorieGoal out of allowed range (500–15000)' };
  }
  if (!isValidMacroGoals(data.macroGoals)) {
    return { allowed: false, reason: 'Invalid macroGoals map' };
  }
  if (typeof data.onboardingCompleted !== 'boolean') {
    return { allowed: false, reason: 'onboardingCompleted must be boolean' };
  }
  if (!isValidIsoString(data.createdAt) || !isValidIsoString(data.updatedAt)) {
    return { allowed: false, reason: 'Invalid createdAt or updatedAt timestamp' };
  }
  return { allowed: true, reason: 'Valid user profile' };
}

function validateFoodEntryData(
  uid: string,
  entryId: string,
  data: Record<string, unknown>
): SecurityRuleEvaluationResult {
  const requiredKeys = [
    'id',
    'uid',
    'date',
    'mealType',
    'loggedAt',
    'name',
    'quantity',
    'unit',
    'servingGrams',
    'servingDescription',
    'nutrition',
    'dataQuality',
    'sourceType',
    'createdAt',
    'updatedAt',
  ];
  const allowedKeys = [
    ...requiredKeys,
    'brand',
    'referenceId',
    'baseNutritionPer100g',
    'notes',
    'aiMetadata',
  ];

  if (!hasAllKeys(data, requiredKeys)) {
    return { allowed: false, reason: 'Missing required foodEntry fields' };
  }
  if (!hasOnlyKeys(data, allowedKeys)) {
    return { allowed: false, reason: 'Unexpected extra fields on foodEntry' };
  }
  if (data.id !== entryId) {
    return { allowed: false, reason: 'foodEntry id must match entryId path parameter' };
  }
  if (data.uid !== uid) {
    return { allowed: false, reason: 'foodEntry uid must match user path parameter' };
  }
  if (!isValidDateString(data.date)) {
    return { allowed: false, reason: 'Invalid date format (expected YYYY-MM-DD)' };
  }
  if (typeof data.mealType !== 'string' || !VALID_MEAL_TYPES.has(data.mealType)) {
    return { allowed: false, reason: 'Invalid mealType' };
  }
  if (typeof data.loggedAt !== 'string' || data.loggedAt.length < 1 || data.loggedAt.length > 40) {
    return { allowed: false, reason: 'Invalid loggedAt' };
  }
  if (typeof data.name !== 'string' || data.name.length < 1 || data.name.length > 200) {
    return { allowed: false, reason: 'Invalid food name' };
  }
  if (!isPositiveNumber(data.quantity, 10000)) {
    return { allowed: false, reason: 'Invalid quantity (must be > 0 and <= 10000)' };
  }
  if (typeof data.unit !== 'string' || !VALID_UNITS.has(data.unit)) {
    return { allowed: false, reason: 'Invalid serving unit' };
  }
  if (!isNonNegativeNumber(data.servingGrams, 50000)) {
    return { allowed: false, reason: 'Invalid servingGrams' };
  }
  if (typeof data.servingDescription !== 'string' || data.servingDescription.length > 120) {
    return { allowed: false, reason: 'Invalid servingDescription' };
  }
  if (!isValidNutritionMap(data.nutrition)) {
    return { allowed: false, reason: 'Invalid nutrition map' };
  }
  if (typeof data.dataQuality !== 'string' || !VALID_DATA_QUALITIES.has(data.dataQuality)) {
    return { allowed: false, reason: 'Invalid dataQuality' };
  }
  if (typeof data.sourceType !== 'string' || !VALID_SOURCE_TYPES.has(data.sourceType)) {
    return { allowed: false, reason: 'Invalid sourceType' };
  }
  if (!isValidIsoString(data.createdAt) || !isValidIsoString(data.updatedAt)) {
    return { allowed: false, reason: 'Invalid createdAt or updatedAt' };
  }
  return { allowed: true, reason: 'Valid foodEntry' };
}

function validateRecipeData(
  uid: string,
  recipeId: string,
  data: Record<string, unknown>
): SecurityRuleEvaluationResult {
  const requiredKeys = [
    'id',
    'uid',
    'name',
    'servingsCount',
    'totalWeightGrams',
    'ingredients',
    'nutritionPerServing',
    'dataQuality',
    'createdAt',
    'updatedAt',
  ];
  const allowedKeys = [...requiredKeys, 'notes'];

  if (!hasAllKeys(data, requiredKeys) || !hasOnlyKeys(data, allowedKeys)) {
    return { allowed: false, reason: 'Invalid recipe keys' };
  }
  if (data.id !== recipeId || data.uid !== uid) {
    return { allowed: false, reason: 'Mismatched id or uid on recipe' };
  }
  if (typeof data.name !== 'string' || data.name.length < 1 || data.name.length > 200) {
    return { allowed: false, reason: 'Invalid recipe name' };
  }
  if (!isPositiveNumber(data.servingsCount, 500)) {
    return { allowed: false, reason: 'Invalid servingsCount' };
  }
  if (!isNonNegativeNumber(data.totalWeightGrams, 100000)) {
    return { allowed: false, reason: 'Invalid totalWeightGrams' };
  }
  if (!Array.isArray(data.ingredients) || data.ingredients.length < 1 || data.ingredients.length > 100) {
    return { allowed: false, reason: 'Invalid ingredients list' };
  }
  if (!isValidNutritionMap(data.nutritionPerServing)) {
    return { allowed: false, reason: 'Invalid nutritionPerServing' };
  }
  if (typeof data.dataQuality !== 'string' || !VALID_DATA_QUALITIES.has(data.dataQuality)) {
    return { allowed: false, reason: 'Invalid dataQuality' };
  }
  if (!isValidIsoString(data.createdAt) || !isValidIsoString(data.updatedAt)) {
    return { allowed: false, reason: 'Invalid timestamps' };
  }
  return { allowed: true, reason: 'Valid recipe' };
}

function validateSavedMealData(
  uid: string,
  mealId: string,
  data: Record<string, unknown>
): SecurityRuleEvaluationResult {
  const requiredKeys = [
    'id',
    'uid',
    'name',
    'defaultQuantity',
    'defaultUnit',
    'servingGrams',
    'servingDescription',
    'nutrition',
    'dataQuality',
    'createdAt',
    'updatedAt',
  ];
  const allowedKeys = [...requiredKeys, 'brand', 'defaultMealType', 'notes'];

  if (!hasAllKeys(data, requiredKeys) || !hasOnlyKeys(data, allowedKeys)) {
    return { allowed: false, reason: 'Invalid savedMeal keys' };
  }
  if (data.id !== mealId || data.uid !== uid) {
    return { allowed: false, reason: 'Mismatched id or uid on savedMeal' };
  }
  if (typeof data.name !== 'string' || data.name.length < 1 || data.name.length > 200) {
    return { allowed: false, reason: 'Invalid savedMeal name' };
  }
  if (!isPositiveNumber(data.defaultQuantity, 10000)) {
    return { allowed: false, reason: 'Invalid defaultQuantity' };
  }
  if (typeof data.defaultUnit !== 'string' || !VALID_UNITS.has(data.defaultUnit)) {
    return { allowed: false, reason: 'Invalid defaultUnit' };
  }
  if (!isNonNegativeNumber(data.servingGrams, 50000)) {
    return { allowed: false, reason: 'Invalid servingGrams' };
  }
  if (!isValidNutritionMap(data.nutrition)) {
    return { allowed: false, reason: 'Invalid nutrition map' };
  }
  return { allowed: true, reason: 'Valid savedMeal' };
}

function validateWeightEntryData(
  uid: string,
  entryId: string,
  data: Record<string, unknown>
): SecurityRuleEvaluationResult {
  const requiredKeys = ['id', 'uid', 'date', 'weightKg', 'createdAt', 'updatedAt'];
  const allowedKeys = [...requiredKeys, 'notes'];

  if (!hasAllKeys(data, requiredKeys) || !hasOnlyKeys(data, allowedKeys)) {
    return { allowed: false, reason: 'Invalid weightEntry keys' };
  }
  if (data.id !== entryId || data.uid !== uid) {
    return { allowed: false, reason: 'Mismatched id or uid on weightEntry' };
  }
  if (!isValidDateString(data.date)) {
    return { allowed: false, reason: 'Invalid date on weightEntry' };
  }
  if (typeof data.weightKg !== 'number' || data.weightKg < 15 || data.weightKg > 600) {
    return { allowed: false, reason: 'weightKg out of allowed range (15–600)' };
  }
  if (!isValidIsoString(data.createdAt) || !isValidIsoString(data.updatedAt)) {
    return { allowed: false, reason: 'Invalid timestamps on weightEntry' };
  }
  return { allowed: true, reason: 'Valid weightEntry' };
}

/**
 * Evaluates a Firestore operation against our Security Rules contract.
 */
export function evaluateFirestoreSecurityRule(
  ctx: SecurityRuleRequestContext
): SecurityRuleEvaluationResult {
  const cleanPath = ctx.path.replace(/^\/+/, '').replace(/\/+$/, '');
  const segments = cleanPath.split('/');

  // Require authentication for all routes
  if (!ctx.auth || !ctx.auth.uid || typeof ctx.auth.uid !== 'string') {
    return { allowed: false, reason: 'Unauthenticated request denied' };
  }

  // Match /users/{uid}
  if (segments.length === 2 && segments[0] === 'users') {
    const uid = segments[1];
    if (ctx.auth.uid !== uid) {
      return { allowed: false, reason: 'Cross-user access denied: caller is not document owner' };
    }
    if (ctx.method === 'read' || ctx.method === 'delete') {
      return { allowed: true, reason: 'Authenticated owner read/delete allowed' };
    }
    if (!ctx.requestResourceData) {
      return { allowed: false, reason: 'Missing request.resource.data' };
    }
    if (ctx.method === 'update' && ctx.resourceData && ctx.requestResourceData.uid !== ctx.resourceData.uid) {
      return { allowed: false, reason: 'Cannot mutate uid on existing user profile' };
    }
    return validateUserProfileData(uid, ctx.requestResourceData);
  }

  // Match /users/{uid}/{subcollection}/{docId}
  if (segments.length === 4 && segments[0] === 'users') {
    const uid = segments[1];
    const subcol = segments[2];
    const docId = segments[3];

    if (ctx.auth.uid !== uid) {
      return { allowed: false, reason: 'Cross-user access denied: caller is not owner of subcollection' };
    }

    if (
      subcol !== 'foodEntries' &&
      subcol !== 'recipes' &&
      subcol !== 'savedMeals' &&
      subcol !== 'weightEntries'
    ) {
      return { allowed: false, reason: `Unknown subcollection "${subcol}" denied by default rule` };
    }

    if (ctx.method === 'read' || ctx.method === 'delete') {
      return { allowed: true, reason: 'Authenticated owner read/delete allowed' };
    }

    if (!ctx.requestResourceData) {
      return { allowed: false, reason: 'Missing request.resource.data' };
    }

    if (ctx.method === 'update' && ctx.resourceData) {
      if (
        ctx.requestResourceData.uid !== ctx.resourceData.uid ||
        ctx.requestResourceData.id !== ctx.resourceData.id
      ) {
        return { allowed: false, reason: 'Cannot mutate immutable id or uid fields on update' };
      }
    }

    if (subcol === 'foodEntries') {
      return validateFoodEntryData(uid, docId, ctx.requestResourceData);
    }
    if (subcol === 'recipes') {
      return validateRecipeData(uid, docId, ctx.requestResourceData);
    }
    if (subcol === 'savedMeals') {
      return validateSavedMealData(uid, docId, ctx.requestResourceData);
    }
    if (subcol === 'weightEntries') {
      return validateWeightEntryData(uid, docId, ctx.requestResourceData);
    }
  }

  return { allowed: false, reason: 'Denied by default fallback rule' };
}

import {
  ActivityLevel,
  BiologicalSex,
  DailyNutritionSummary,
  FoodEntry,
  HouseholdServingOption,
  MacroGoals,
  MealType,
  MeasurementSystem,
  NutritionValues,
  RecipeIngredient,
  ServingUnit,
  WeightDirection,
} from '../types/domain';

/**
 * Standard conversion factors to grams (or milliliters for volume units, assuming 1g/ml density
 * unless a food-specific household serving option overrides it).
 */
export const STANDARD_UNIT_GRAM_EQUIVALENTS: Record<ServingUnit, number> = {
  g: 1,
  ml: 1,
  oz: 28.3495,
  lb: 453.592,
  fl_oz: 29.5735,
  cup: 240,
  tbsp: 15,
  tsp: 5,
  serving: 100,
  piece: 100,
  slice: 35,
  bowl: 300,
};

export const UNIT_LABELS: Record<ServingUnit, { short: string; full: string; system: 'metric' | 'imperial' | 'household' }> = {
  g: { short: 'g', full: 'Grams (g)', system: 'metric' },
  ml: { short: 'ml', full: 'Milliliters (ml)', system: 'metric' },
  oz: { short: 'oz', full: 'Ounces (oz)', system: 'imperial' },
  lb: { short: 'lb', full: 'Pounds (lb)', system: 'imperial' },
  fl_oz: { short: 'fl oz', full: 'Fluid Ounces (fl oz)', system: 'imperial' },
  cup: { short: 'cup', full: 'Cup (240 ml)', system: 'household' },
  tbsp: { short: 'tbsp', full: 'Tablespoon (15 ml)', system: 'household' },
  tsp: { short: 'tsp', full: 'Teaspoon (5 ml)', system: 'household' },
  serving: { short: 'serving', full: 'Serving', system: 'household' },
  piece: { short: 'piece', full: 'Piece / Item', system: 'household' },
  slice: { short: 'slice', full: 'Slice', system: 'household' },
  bowl: { short: 'bowl', full: 'Bowl', system: 'household' },
};

export function roundToOneDecimal(val: number): number {
  if (!Number.isFinite(val) || val < 0) return 0;
  return Math.round(val * 10) / 10;
}

export function roundCalories(val: number): number {
  if (!Number.isFinite(val) || val < 0) return 0;
  return Math.round(val);
}

/**
 * Resolves the total weight in grams for a given quantity and unit,
 * honoring food-specific household serving equivalents when available.
 */
export function resolveServingGrams(
  quantity: number,
  unit: ServingUnit,
  servingOptions?: HouseholdServingOption[],
  customSingleServingGrams?: number
): number {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return 0;
  }

  if (servingOptions && servingOptions.length > 0) {
    const matched = servingOptions.find((opt) => opt.unit === unit);
    if (matched) {
      return roundToOneDecimal(quantity * matched.gramsEquivalent);
    }
  }

  if (
    (unit === 'serving' || unit === 'piece' || unit === 'slice' || unit === 'bowl') &&
    customSingleServingGrams &&
    customSingleServingGrams > 0
  ) {
    return roundToOneDecimal(quantity * customSingleServingGrams);
  }

  const factor = STANDARD_UNIT_GRAM_EQUIVALENTS[unit] ?? 1;
  return roundToOneDecimal(quantity * factor);
}

/**
 * Scales nutrition values defined per 100g (or 100ml) to a target gram weight.
 */
export function scaleNutritionFromPer100g(
  per100g: NutritionValues,
  servingGrams: number
): NutritionValues {
  const safeGrams = Math.max(0, Number.isFinite(servingGrams) ? servingGrams : 0);
  const ratio = safeGrams / 100;

  return scaleNutritionByRatio(per100g, ratio);
}

/**
 * Scales a NutritionValues object by a numeric multiplier.
 */
export function scaleNutritionByRatio(
  base: NutritionValues,
  ratio: number
): NutritionValues {
  const safeRatio = Math.max(0, Number.isFinite(ratio) ? ratio : 0);

  const result: NutritionValues = {
    calories: roundCalories(base.calories * safeRatio),
    proteinGrams: roundToOneDecimal(base.proteinGrams * safeRatio),
    carbsGrams: roundToOneDecimal(base.carbsGrams * safeRatio),
    fatGrams: roundToOneDecimal(base.fatGrams * safeRatio),
  };

  if (typeof base.fiberGrams === 'number') {
    result.fiberGrams = roundToOneDecimal(base.fiberGrams * safeRatio);
  }
  if (typeof base.sugarGrams === 'number') {
    result.sugarGrams = roundToOneDecimal(base.sugarGrams * safeRatio);
  }
  if (typeof base.sodiumMg === 'number') {
    result.sodiumMg = Math.round(base.sodiumMg * safeRatio);
  }

  return result;
}

/**
 * Calculates physiological calorie estimate from macronutrients (4-4-9 Atwater factors).
 * Used to validate or assist manual entries.
 */
export function calculateCaloriesFromMacros(
  proteinGrams: number,
  carbsGrams: number,
  fatGrams: number
): number {
  const p = Math.max(0, Number.isFinite(proteinGrams) ? proteinGrams : 0);
  const c = Math.max(0, Number.isFinite(carbsGrams) ? carbsGrams : 0);
  const f = Math.max(0, Number.isFinite(fatGrams) ? fatGrams : 0);
  return roundCalories(p * 4 + c * 4 + f * 9);
}

/**
 * Sums an array of NutritionValues without mutating inputs.
 */
export function sumNutritionValues(items: NutritionValues[]): NutritionValues {
  let calories = 0;
  let proteinGrams = 0;
  let carbsGrams = 0;
  let fatGrams = 0;
  let fiberGrams = 0;
  let sugarGrams = 0;
  let sodiumMg = 0;
  let hasFiber = false;
  let hasSugar = false;
  let hasSodium = false;

  for (const item of items) {
    calories += item.calories || 0;
    proteinGrams += item.proteinGrams || 0;
    carbsGrams += item.carbsGrams || 0;
    fatGrams += item.fatGrams || 0;
    if (typeof item.fiberGrams === 'number') {
      fiberGrams += item.fiberGrams;
      hasFiber = true;
    }
    if (typeof item.sugarGrams === 'number') {
      sugarGrams += item.sugarGrams;
      hasSugar = true;
    }
    if (typeof item.sodiumMg === 'number') {
      sodiumMg += item.sodiumMg;
      hasSodium = true;
    }
  }

  const summed: NutritionValues = {
    calories: roundCalories(calories),
    proteinGrams: roundToOneDecimal(proteinGrams),
    carbsGrams: roundToOneDecimal(carbsGrams),
    fatGrams: roundToOneDecimal(fatGrams),
  };

  if (hasFiber) summed.fiberGrams = roundToOneDecimal(fiberGrams);
  if (hasSugar) summed.sugarGrams = roundToOneDecimal(sugarGrams);
  if (hasSodium) summed.sodiumMg = Math.round(sodiumMg);

  return summed;
}

/**
 * Calculates total weight and per-serving nutrition for a multi-ingredient Recipe.
 */
export function calculateRecipeNutrition(
  ingredients: RecipeIngredient[],
  servingsCount: number
): {
  totalNutrition: NutritionValues;
  nutritionPerServing: NutritionValues;
  totalWeightGrams: number;
} {
  const safeServings = Math.max(1, Number.isFinite(servingsCount) && servingsCount > 0 ? servingsCount : 1);
  const totalNutrition = sumNutritionValues(ingredients.map((i) => i.nutrition));
  const totalWeightGrams = roundToOneDecimal(
    ingredients.reduce((acc, item) => acc + (item.weightGrams || 0), 0)
  );
  const nutritionPerServing = scaleNutritionByRatio(totalNutrition, 1 / safeServings);

  return {
    totalNutrition,
    nutritionPerServing,
    totalWeightGrams,
  };
}

/**
 * Computes the complete DailyNutritionSummary dynamically from individual FoodEntries.
 * Never relies on denormalized/cached daily totals so there is a single source of truth.
 */
export function calculateDailySummary(
  date: string,
  entries: FoodEntry[],
  calorieGoal: number,
  macroGoals: MacroGoals
): DailyNutritionSummary {
  const dayEntries = entries.filter((e) => e.date === date);
  const consumed = sumNutritionValues(dayEntries.map((e) => e.nutrition));

  const safeCalorieGoal = Math.max(500, calorieGoal || 2000);
  const remainingCalories = Math.round(safeCalorieGoal - consumed.calories);
  const isOverCalorieGoal = consumed.calories > safeCalorieGoal;
  const overCalorieAmount = isOverCalorieGoal ? roundCalories(consumed.calories - safeCalorieGoal) : 0;
  const calorieProgressPercent = Math.min(
    100,
    Math.round((consumed.calories / safeCalorieGoal) * 100)
  );

  const safeProteinGoal = Math.max(1, macroGoals.proteinGrams || 120);
  const safeCarbsGoal = Math.max(1, macroGoals.carbsGrams || 200);
  const safeFatGoal = Math.max(1, macroGoals.fatGrams || 65);

  const proteinKcal = roundCalories(consumed.proteinGrams * 4);
  const carbsKcal = roundCalories(consumed.carbsGrams * 4);
  const fatKcal = roundCalories(consumed.fatGrams * 9);
  const totalMacroKcal = proteinKcal + carbsKcal + fatKcal;

  const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner', 'snacks'];
  const mealSubtotals: Record<MealType, NutritionValues> = {
    breakfast: { calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0 },
    lunch: { calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0 },
    dinner: { calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0 },
    snacks: { calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0 },
  };
  const mealCounts: Record<MealType, number> = {
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    snacks: 0,
  };

  for (const meal of mealTypes) {
    const mealEntries = dayEntries.filter((e) => e.mealType === meal);
    mealSubtotals[meal] = sumNutritionValues(mealEntries.map((e) => e.nutrition));
    mealCounts[meal] = mealEntries.length;
  }

  let verifiedCount = 0;
  let estimateCount = 0;
  let verifiedCalories = 0;
  let estimatedCalories = 0;

  let confirmedCount = 0;
  let pendingCount = 0;
  let cachedOfflineCount = 0;
  let errorCount = 0;

  for (const entry of dayEntries) {
    if (entry.dataQuality === 'verified' || entry.dataQuality === 'verified_label') {
      verifiedCount += 1;
      verifiedCalories += entry.nutrition.calories;
    } else {
      estimateCount += 1;
      estimatedCalories += entry.nutrition.calories;
    }

    const syncState = entry._meta?.syncState ?? 'confirmed';
    if (syncState === 'pending_sync') {
      pendingCount += 1;
    } else if (syncState === 'cached_offline') {
      cachedOfflineCount += 1;
    } else if (syncState === 'sync_error') {
      errorCount += 1;
    } else {
      confirmedCount += 1;
    }
  }

  return {
    date,
    consumed,
    calorieGoal: safeCalorieGoal,
    remainingCalories,
    isOverCalorieGoal,
    overCalorieAmount,
    calorieProgressPercent,
    macroGoals,
    macroProgressPercent: {
      protein: Math.min(100, Math.round((consumed.proteinGrams / safeProteinGoal) * 100)),
      carbs: Math.min(100, Math.round((consumed.carbsGrams / safeCarbsGoal) * 100)),
      fat: Math.min(100, Math.round((consumed.fatGrams / safeFatGoal) * 100)),
    },
    macroCalorieDistribution: {
      proteinKcal,
      carbsKcal,
      fatKcal,
      proteinPercent: totalMacroKcal > 0 ? Math.round((proteinKcal / totalMacroKcal) * 100) : 0,
      carbsPercent: totalMacroKcal > 0 ? Math.round((carbsKcal / totalMacroKcal) * 100) : 0,
      fatPercent: totalMacroKcal > 0 ? Math.round((fatKcal / totalMacroKcal) * 100) : 0,
    },
    mealSubtotals,
    mealCounts,
    dataQualityBreakdown: {
      verifiedCount,
      estimateCount,
      verifiedCalories: roundCalories(verifiedCalories),
      estimatedCalories: roundCalories(estimatedCalories),
    },
    syncBreakdown: {
      confirmedCount,
      pendingCount,
      cachedOfflineCount,
      errorCount,
    },
  };
}

/**
 * Optional Nutrition Target Suggestion Helper (Mifflin-St Jeor Equation).
 * Never imposed automatically — users always control their own targets directly,
 * and this function returns transparent assumptions and limitations.
 */
export interface TargetSuggestionInput {
  age: number;
  sex: BiologicalSex;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goalDirection: WeightDirection;
}

export interface TargetSuggestionOutput {
  bmrCalories: number;
  tdeeCalories: number;
  suggestedCalorieGoal: number;
  suggestedMacros: MacroGoals;
  assumptions: string[];
  limitations: string[];
}

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, { factor: number; label: string }> = {
  sedentary: { factor: 1.2, label: 'Sedentary (desk job, little formal exercise)' },
  lightly_active: { factor: 1.375, label: 'Lightly active (light exercise 1–3 days/week)' },
  moderately_active: { factor: 1.55, label: 'Moderately active (moderate exercise 3–5 days/week)' },
  very_active: { factor: 1.725, label: 'Very active (hard training 6–7 days/week)' },
  extra_active: { factor: 1.9, label: 'Extra active (physical job or twice-daily training)' },
};

export function calculateOptionalTargetSuggestion(
  input: TargetSuggestionInput
): TargetSuggestionOutput {
  const safeWeight = Math.min(400, Math.max(30, input.weightKg));
  const safeHeight = Math.min(250, Math.max(120, input.heightCm));
  const safeAge = Math.min(110, Math.max(18, input.age));

  // Mifflin-St Jeor BMR formula:
  // Male: (10 * weight_kg) + (6.25 * height_cm) - (5 * age) + 5
  // Female: (10 * weight_kg) + (6.25 * height_cm) - (5 * age) - 161
  // Unspecified/Other: midpoint (-78)
  let sexConstant = -78;
  if (input.sex === 'male') sexConstant = 5;
  if (input.sex === 'female') sexConstant = -161;

  const bmrCalories = Math.round(10 * safeWeight + 6.25 * safeHeight - 5 * safeAge + sexConstant);
  const activityInfo = ACTIVITY_MULTIPLIERS[input.activityLevel] ?? ACTIVITY_MULTIPLIERS.moderately_active;
  const tdeeCalories = Math.round(bmrCalories * activityInfo.factor);

  let delta = 0;
  if (input.goalDirection === 'lose') delta = -400; // Moderate ~400 kcal/day deficit
  if (input.goalDirection === 'gain') delta = 300;  // Moderate ~300 kcal/day surplus

  const suggestedCalorieGoal = Math.max(1200, Math.round((tdeeCalories + delta) / 10) * 10);

  // Balanced starting macro distribution: 30% Protein, 40% Carbs, 30% Fat
  const proteinGrams = Math.round((suggestedCalorieGoal * 0.3) / 4);
  const fatGrams = Math.round((suggestedCalorieGoal * 0.3) / 9);
  const remainingKcal = Math.max(0, suggestedCalorieGoal - proteinGrams * 4 - fatGrams * 9);
  const carbsGrams = Math.round(remainingKcal / 4);

  return {
    bmrCalories,
    tdeeCalories,
    suggestedCalorieGoal,
    suggestedMacros: {
      proteinGrams,
      carbsGrams,
      fatGrams,
    },
    assumptions: [
      `Uses the Mifflin-St Jeor resting metabolic rate equation (${bmrCalories} kcal/day BMR).`,
      `Applies a ${activityInfo.factor}× activity multiplier for "${activityInfo.label}" (${tdeeCalories} kcal/day TDEE).`,
      input.goalDirection === 'lose'
        ? 'Applies a moderate 400 kcal/day energy deficit for gradual weight reduction.'
        : input.goalDirection === 'gain'
          ? 'Applies a moderate 300 kcal/day energy surplus for gradual weight gain.'
          : 'Maintains estimated Total Daily Energy Expenditure (0 kcal adjustment).',
      'Splits macronutrients using a general 30% protein / 40% carbohydrate / 30% fat starting ratio.',
    ],
    limitations: [
      'Population equations do not measure lean body mass, body fat percentage, or individual metabolic adaptation.',
      'Activity multipliers are broad approximations and can vary by ±15–25% between individuals.',
      'Not medical or clinical dietetic advice — you can freely edit any calorie or macro target below.',
    ],
  };
}

/**
 * Measurement Unit Conversion Helpers (Metric <-> Imperial)
 */
export function kgToLbs(kg: number): number {
  return roundToOneDecimal(kg * 2.20462);
}

export function lbsToKg(lbs: number): number {
  return roundToOneDecimal(lbs / 2.20462);
}

export function cmToInches(cm: number): number {
  return roundToOneDecimal(cm / 2.54);
}

export function inchesToCm(inches: number): number {
  return roundToOneDecimal(inches * 2.54);
}

export function formatWeightDisplay(weightKg: number, preferredUnits: MeasurementSystem): string {
  if (preferredUnits === 'imperial') {
    return `${kgToLbs(weightKg)} lb`;
  }
  return `${roundToOneDecimal(weightKg)} kg`;
}

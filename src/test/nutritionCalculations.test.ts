import { describe, expect, it } from 'vitest';
import {
  calculateCaloriesFromMacros,
  calculateDailySummary,
  calculateOptionalTargetSuggestion,
  calculateRecipeNutrition,
  kgToLbs,
  lbsToKg,
  resolveServingGrams,
  scaleNutritionByRatio,
  scaleNutritionFromPer100g,
  sumNutritionValues,
} from '../utils/nutritionCalculator';
import { FoodEntry, RecipeIngredient } from '../types/domain';

describe('Nutrition Calculation Engine', () => {
  it('converts standard and household units to grams accurately', () => {
    expect(resolveServingGrams(150, 'g')).toBe(150);
    expect(resolveServingGrams(250, 'ml')).toBe(250);
    expect(resolveServingGrams(2, 'oz')).toBe(56.7);
    expect(resolveServingGrams(1, 'cup')).toBe(240);
    expect(resolveServingGrams(2, 'tbsp')).toBe(30);
    expect(resolveServingGrams(3, 'tsp')).toBe(15);

    // Custom food-specific serving option override
    const bananaOptions = [
      { unit: 'piece' as const, label: '1 medium banana (118g)', gramsEquivalent: 118, defaultQuantity: 1 },
    ];
    expect(resolveServingGrams(1.5, 'piece', bananaOptions)).toBe(177);
    expect(resolveServingGrams(-5, 'g')).toBe(0);
  });

  it('scales per-100g nutrition values accurately across quantities', () => {
    const chickenPer100g = {
      calories: 165,
      proteinGrams: 31.0,
      carbsGrams: 0,
      fatGrams: 3.6,
      fiberGrams: 0,
      sodiumMg: 74,
    };

    const scaled150g = scaleNutritionFromPer100g(chickenPer100g, 150);
    expect(scaled150g.calories).toBe(248);
    expect(scaled150g.proteinGrams).toBe(46.5);
    expect(scaled150g.carbsGrams).toBe(0);
    expect(scaled150g.fatGrams).toBe(5.4);
    expect(scaled150g.sodiumMg).toBe(111);
  });

  it('calculates calories from macronutrients using 4-4-9 Atwater factors', () => {
    // 30g P (120) + 40g C (160) + 10g F (90) = 370 kcal
    expect(calculateCaloriesFromMacros(30, 40, 10)).toBe(370);
    expect(calculateCaloriesFromMacros(0, 0, 0)).toBe(0);
  });

  it('sums multiple nutrition items and calculates multi-ingredient recipe per-serving values', () => {
    const ingredients: RecipeIngredient[] = [
      {
        id: '1',
        name: 'Rolled Oats',
        quantity: 80,
        unit: 'g',
        weightGrams: 80,
        nutrition: { calories: 303, proteinGrams: 10.6, carbsGrams: 54.2, fatGrams: 5.2 },
        dataQuality: 'verified',
      },
      {
        id: '2',
        name: 'Whey Isolate',
        quantity: 60,
        unit: 'g',
        weightGrams: 60,
        nutrition: { calories: 222, proteinGrams: 50.0, carbsGrams: 2.0, fatGrams: 1.0 },
        dataQuality: 'verified',
      },
    ];

    const recipeResult = calculateRecipeNutrition(ingredients, 2);
    expect(recipeResult.totalWeightGrams).toBe(140);
    expect(recipeResult.totalNutrition.calories).toBe(525);
    expect(recipeResult.nutritionPerServing.calories).toBe(263);
    expect(recipeResult.nutritionPerServing.proteinGrams).toBe(30.3);
    expect(recipeResult.nutritionPerServing.carbsGrams).toBe(28.1);
    expect(recipeResult.nutritionPerServing.fatGrams).toBe(3.1);
  });

  it('computes daily summary, remaining calories, meal subtotals, and verified vs estimate breakdown', () => {
    const date = '2026-10-13';
    const entries: FoodEntry[] = [
      {
        id: 'e1',
        uid: 'u1',
        date,
        mealType: 'breakfast',
        loggedAt: '08:00',
        name: 'Oatmeal',
        quantity: 1,
        unit: 'cup',
        servingGrams: 80,
        servingDescription: '1 cup',
        nutrition: { calories: 300, proteinGrams: 10, carbsGrams: 54, fatGrams: 5 },
        dataQuality: 'verified',
        sourceType: 'reference_db',
        createdAt: '2026-10-13T08:00:00.000Z',
        updatedAt: '2026-10-13T08:00:00.000Z',
        _meta: { syncState: 'confirmed', hasPendingWrites: false, fromCache: false },
      },
      {
        id: 'e2',
        uid: 'u1',
        date,
        mealType: 'lunch',
        loggedAt: '12:30',
        name: 'Restaurant Burrito Bowl',
        quantity: 1,
        unit: 'bowl',
        servingGrams: 420,
        servingDescription: '1 bowl',
        nutrition: { calories: 750, proteinGrams: 42, carbsGrams: 78, fatGrams: 28 },
        dataQuality: 'user_estimate',
        sourceType: 'manual',
        createdAt: '2026-10-13T12:30:00.000Z',
        updatedAt: '2026-10-13T12:30:00.000Z',
        _meta: { syncState: 'pending_sync', hasPendingWrites: true, fromCache: true },
      },
    ];

    const summary = calculateDailySummary(date, entries, 2000, {
      proteinGrams: 150,
      carbsGrams: 200,
      fatGrams: 65,
    });

    expect(summary.consumed.calories).toBe(1050);
    expect(summary.consumed.proteinGrams).toBe(52);
    expect(summary.consumed.carbsGrams).toBe(132);
    expect(summary.consumed.fatGrams).toBe(33);
    expect(summary.remainingCalories).toBe(950);
    expect(summary.isOverCalorieGoal).toBe(false);

    expect(summary.mealSubtotals.breakfast.calories).toBe(300);
    expect(summary.mealSubtotals.lunch.calories).toBe(750);
    expect(summary.mealSubtotals.dinner.calories).toBe(0);

    // Verified vs estimate distinction
    expect(summary.dataQualityBreakdown.verifiedCount).toBe(1);
    expect(summary.dataQualityBreakdown.verifiedCalories).toBe(300);
    expect(summary.dataQualityBreakdown.estimateCount).toBe(1);
    expect(summary.dataQualityBreakdown.estimatedCalories).toBe(750);

    // Sync state distinction
    expect(summary.syncBreakdown.confirmedCount).toBe(1);
    expect(summary.syncBreakdown.pendingCount).toBe(1);
  });

  it('detects over-calorie goal state accurately', () => {
    const date = '2026-10-13';
    const entries: FoodEntry[] = [
      {
        id: 'e1',
        uid: 'u1',
        date,
        mealType: 'dinner',
        loggedAt: '19:00',
        name: 'Feast Meal',
        quantity: 1,
        unit: 'serving',
        servingGrams: 800,
        servingDescription: '1 meal',
        nutrition: { calories: 2350, proteinGrams: 110, carbsGrams: 240, fatGrams: 95 },
        dataQuality: 'user_estimate',
        sourceType: 'manual',
        createdAt: '2026-10-13T19:00:00.000Z',
        updatedAt: '2026-10-13T19:00:00.000Z',
      },
    ];

    const summary = calculateDailySummary(date, entries, 2000, {
      proteinGrams: 140,
      carbsGrams: 200,
      fatGrams: 65,
    });

    expect(summary.isOverCalorieGoal).toBe(true);
    expect(summary.overCalorieAmount).toBe(350);
    expect(summary.remainingCalories).toBe(-350);
    expect(summary.calorieProgressPercent).toBe(100);
  });

  it('calculates optional target suggestions with transparent assumptions and limitations', () => {
    const result = calculateOptionalTargetSuggestion({
      age: 30,
      sex: 'male',
      heightCm: 180,
      weightKg: 80,
      activityLevel: 'moderately_active',
      goalDirection: 'lose',
    });

    // BMR = 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
    expect(result.bmrCalories).toBe(1780);
    expect(result.tdeeCalories).toBe(Math.round(1780 * 1.55));
    expect(result.suggestedCalorieGoal).toBeLessThan(result.tdeeCalories);
    expect(result.assumptions.length).toBeGreaterThanOrEqual(3);
    expect(result.limitations.length).toBeGreaterThanOrEqual(2);
  });

  it('converts between metric kg and imperial lbs', () => {
    const lbs = kgToLbs(75);
    expect(lbs).toBe(165.3);
    expect(lbsToKg(lbs)).toBe(75);
    expect(scaleNutritionByRatio({ calories: 100, proteinGrams: 10, carbsGrams: 10, fatGrams: 2 }, 2).calories).toBe(200);
    expect(sumNutritionValues([]).calories).toBe(0);
  });
});

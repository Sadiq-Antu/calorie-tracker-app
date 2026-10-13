import React, { useState } from 'react';
import {
  BookOpen,
  ChefHat,
  Plus,
  Scale,
  Trash2,
  Utensils,
} from 'lucide-react';
import {
  DataQuality,
  MealType,
  Recipe,
  RecipeIngredient,
  SavedMeal,
  ServingUnit,
} from '../types/domain';
import {
  calculateRecipeNutrition,
  formatWeightDisplay,
  lbsToKg,
  roundCalories,
  roundToOneDecimal,
  scaleNutritionByRatio,
} from '../utils/nutritionCalculator';
import { getCurrentTimeHHMM, getTodayDateString } from '../utils/dateUtils';
import { useApp } from '../context/AppContext';
import { DataQualityBadge, RecordSyncBadge } from './SyncStatusBadge';

export const RecipesAndMealsView: React.FC = () => {
  const {
    profile,
    recipes,
    savedMeals,
    weightEntries,
    selectedDate,
    addFoodEntry,
    saveRecipeItem,
    removeRecipeItem,
    saveSavedMealItem,
    removeSavedMealItem,
    saveWeightItem,
    removeWeightItem,
  } = useApp();

  const preferredUnits = profile?.preferredUnits ?? 'metric';

  // Recipe Builder State
  const [showNewRecipeForm, setShowNewRecipeForm] = useState(false);
  const [recipeName, setRecipeName] = useState('');
  const [recipeServings, setRecipeServings] = useState(2);
  const [recipeDataQuality, setRecipeDataQuality] = useState<DataQuality>('verified_label');
  const [recipeNotes, setRecipeNotes] = useState('');
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([
    {
      id: 'ing_init_1',
      name: 'Chicken Breast (Cooked)',
      quantity: 200,
      unit: 'g',
      weightGrams: 200,
      nutrition: { calories: 330, proteinGrams: 62, carbsGrams: 0, fatGrams: 7.2 },
      dataQuality: 'verified',
    },
  ]);

  // New Ingredient Draft State
  const [ingName, setIngName] = useState('');
  const [ingGrams, setIngGrams] = useState(100);
  const [ingCalories, setIngCalories] = useState(150);
  const [ingProtein, setIngProtein] = useState(10);
  const [ingCarbs, setIngCarbs] = useState(15);
  const [ingFat, setIngFat] = useState(5);

  // Saved Meal Builder State
  const [showNewMealForm, setShowNewMealForm] = useState(false);
  const [mealName, setMealName] = useState('');
  const [mealBrand, setMealBrand] = useState('');
  const [mealQuantity, setMealQuantity] = useState(1);
  const [mealUnit, setMealUnit] = useState<ServingUnit>('serving');
  const [mealGrams, setMealGrams] = useState(150);
  const [mealCalories, setMealCalories] = useState(250);
  const [mealProtein, setMealProtein] = useState(20);
  const [mealCarbs, setMealCarbs] = useState(25);
  const [mealFat, setMealFat] = useState(8);
  const [mealQuality, setMealQuality] = useState<DataQuality>('verified_label');

  // Weight Log State
  const [weightDate, setWeightDate] = useState(getTodayDateString());
  const [weightValueInput, setWeightValueInput] = useState<number>(
    preferredUnits === 'imperial' ? 165 : 75
  );
  const [weightNotes, setWeightNotes] = useState('');

  const recipeCalc = calculateRecipeNutrition(ingredients, recipeServings);

  const handleAddIngredient = () => {
    if (!ingName.trim()) return;
    const newIng: RecipeIngredient = {
      id: `ing_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: ingName.trim(),
      quantity: ingGrams,
      unit: 'g',
      weightGrams: Math.max(1, ingGrams),
      nutrition: {
        calories: roundCalories(ingCalories),
        proteinGrams: roundToOneDecimal(ingProtein),
        carbsGrams: roundToOneDecimal(ingCarbs),
        fatGrams: roundToOneDecimal(ingFat),
      },
      dataQuality: recipeDataQuality,
    };
    setIngredients((prev) => [...prev, newIng]);
    setIngName('');
    setIngGrams(100);
    setIngCalories(120);
    setIngProtein(8);
    setIngCarbs(12);
    setIngFat(4);
  };

  const handleSaveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipeName.trim() || ingredients.length === 0) return;

    await saveRecipeItem({
      name: recipeName.trim(),
      servingsCount: Math.max(1, recipeServings),
      totalWeightGrams: recipeCalc.totalWeightGrams,
      ingredients,
      nutritionPerServing: recipeCalc.nutritionPerServing,
      dataQuality: recipeDataQuality,
      notes: recipeNotes.trim() || undefined,
    });

    setRecipeName('');
    setRecipeNotes('');
    setShowNewRecipeForm(false);
  };

  const handleLogRecipeToDiary = async (recipe: Recipe, mealType: MealType = 'lunch') => {
    const gramsPerServing =
      recipe.servingsCount > 0
        ? roundToOneDecimal(recipe.totalWeightGrams / recipe.servingsCount)
        : 200;

    await addFoodEntry({
      date: selectedDate,
      mealType,
      loggedAt: getCurrentTimeHHMM(),
      name: recipe.name,
      quantity: 1,
      unit: 'serving',
      servingGrams: gramsPerServing,
      servingDescription: `1 serving (${gramsPerServing}g)`,
      nutrition: scaleNutritionByRatio(recipe.nutritionPerServing, 1),
      dataQuality: recipe.dataQuality,
      sourceType: 'recipe',
      notes: recipe.notes,
    });
  };

  const handleSaveCustomMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mealName.trim()) return;

    await saveSavedMealItem({
      name: mealName.trim(),
      brand: mealBrand.trim() || undefined,
      defaultQuantity: mealQuantity,
      defaultUnit: mealUnit,
      servingGrams: mealGrams,
      servingDescription: `${mealQuantity} ${mealUnit} (${mealGrams}g)`,
      nutrition: {
        calories: roundCalories(mealCalories),
        proteinGrams: roundToOneDecimal(mealProtein),
        carbsGrams: roundToOneDecimal(mealCarbs),
        fatGrams: roundToOneDecimal(mealFat),
      },
      dataQuality: mealQuality,
    });

    setMealName('');
    setMealBrand('');
    setShowNewMealForm(false);
  };

  const handleLogSavedMealToDiary = async (meal: SavedMeal, mealType: MealType = 'snacks') => {
    await addFoodEntry({
      date: selectedDate,
      mealType: meal.defaultMealType || mealType,
      loggedAt: getCurrentTimeHHMM(),
      name: meal.name,
      brand: meal.brand,
      quantity: meal.defaultQuantity,
      unit: meal.defaultUnit,
      servingGrams: meal.servingGrams,
      servingDescription: meal.servingDescription,
      nutrition: { ...meal.nutrition },
      dataQuality: meal.dataQuality,
      sourceType: 'saved_meal',
      notes: meal.notes,
    });
  };

  const handleLogWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    const weightKg =
      preferredUnits === 'imperial' ? lbsToKg(weightValueInput) : weightValueInput;
    if (weightKg < 15 || weightKg > 600) return;

    await saveWeightItem({
      date: weightDate,
      weightKg,
      notes: weightNotes.trim() || undefined,
    });
    setWeightNotes('');
  };

  return (
    <div className="space-y-8 pb-24">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
          Recipes, Saved Meals & Weight Log
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Build reusable multi-ingredient recipes, manage custom foods, and track body weight.
        </p>
      </div>

      {/* 1. Custom Recipes Section */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <ChefHat className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Custom Multi-Ingredient Recipes ({recipes.length})
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowNewRecipeForm(!showNewRecipeForm)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3.5 py-2 text-xs transition"
          >
            <Plus className="h-4 w-4" />
            <span>{showNewRecipeForm ? 'Cancel Recipe' : 'Create Recipe'}</span>
          </button>
        </div>

        {showNewRecipeForm && (
          <form
            onSubmit={handleSaveRecipe}
            className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-4 space-y-4 text-xs"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Recipe Name *
                </label>
                <input
                  type="text"
                  required
                  value={recipeName}
                  onChange={(e) => setRecipeName(e.target.value)}
                  placeholder="e.g., Meal-Prep Turkey & Sweet Potato Skillet"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Total Servings Yielded *
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  required
                  value={recipeServings}
                  onChange={(e) => setRecipeServings(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* Ingredients List */}
            <div className="space-y-2">
              <div className="font-semibold text-slate-700 dark:text-slate-300">
                Ingredients ({ingredients.length})
              </div>
              <ul className="space-y-1.5">
                {ingredients.map((ing) => (
                  <li
                    key={ing.id}
                    className="flex items-center justify-between rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2"
                  >
                    <span>
                      <strong>{ing.name}</strong> ({ing.weightGrams}g) — {ing.nutrition.calories}{' '}
                      kcal ({ing.nutrition.proteinGrams}g P • {ing.nutrition.carbsGrams}g C •{' '}
                      {ing.nutrition.fatGrams}g F)
                    </span>
                    {ingredients.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setIngredients((prev) => prev.filter((i) => i.id !== ing.id))
                        }
                        className="text-rose-600 hover:underline ml-2"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              {/* Add Ingredient Row */}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-2 items-end">
                <div className="col-span-2">
                  <label className="block text-[11px] text-slate-500">Ingredient Name</label>
                  <input
                    type="text"
                    value={ingName}
                    onChange={(e) => setIngName(e.target.value)}
                    placeholder="e.g., Sweet Potato"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500">Grams (g)</label>
                  <input
                    type="number"
                    value={ingGrams}
                    onChange={(e) => setIngGrams(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500">kcal</label>
                  <input
                    type="number"
                    value={ingCalories}
                    onChange={(e) => setIngCalories(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500">P / C / F (g)</label>
                  <div className="grid grid-cols-3 gap-1">
                    <input
                      type="number"
                      value={ingProtein}
                      onChange={(e) => setIngProtein(Number(e.target.value))}
                      title="Protein (g)"
                      className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-1 py-1.5 text-center"
                    />
                    <input
                      type="number"
                      value={ingCarbs}
                      onChange={(e) => setIngCarbs(Number(e.target.value))}
                      title="Carbs (g)"
                      className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-1 py-1.5 text-center"
                    />
                    <input
                      type="number"
                      value={ingFat}
                      onChange={(e) => setIngFat(Number(e.target.value))}
                      title="Fat (g)"
                      className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-1 py-1.5 text-center"
                    />
                  </div>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={handleAddIngredient}
                    className="w-full rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold py-1.5 px-2.5"
                  >
                    + Add Ingredient
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3 rounded-xl bg-white dark:bg-slate-900 p-3 border border-emerald-200 dark:border-emerald-800">
              <div>
                <span className="text-slate-500">Per Serving (1/{recipeServings}):</span>{' '}
                <strong className="text-emerald-700 dark:text-emerald-400">
                  {recipeCalc.nutritionPerServing.calories} kcal
                </strong>{' '}
                ({recipeCalc.nutritionPerServing.proteinGrams}g P •{' '}
                {recipeCalc.nutritionPerServing.carbsGrams}g C •{' '}
                {recipeCalc.nutritionPerServing.fatGrams}g F)
              </div>
              <button
                type="submit"
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2"
              >
                Save Recipe
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {recipes.map((recipe) => (
            <div
              key={recipe.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    {recipe.name}
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <DataQualityBadge quality={recipe.dataQuality} />
                    <RecordSyncBadge syncState={recipe._meta?.syncState} compact />
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Yields {recipe.servingsCount} servings ({recipe.totalWeightGrams}g total) •{' '}
                  {recipe.ingredients.length} ingredients
                </p>
                <div className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                  Per serving:{' '}
                  <strong className="text-emerald-600 dark:text-emerald-400">
                    {recipe.nutritionPerServing.calories} kcal
                  </strong>{' '}
                  • {recipe.nutritionPerServing.proteinGrams}g P •{' '}
                  {recipe.nutritionPerServing.carbsGrams}g C •{' '}
                  {recipe.nutritionPerServing.fatGrams}g F
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => handleLogRecipeToDiary(recipe, 'lunch')}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 font-semibold px-3 py-1.5 text-xs hover:bg-emerald-100"
                >
                  <Utensils className="h-3.5 w-3.5" />
                  <span>Log 1 Serving to Diary</span>
                </button>
                <button
                  type="button"
                  onClick={() => removeRecipeItem(recipe.id)}
                  className="text-slate-400 hover:text-rose-600 p-1"
                  aria-label={`Delete recipe ${recipe.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Saved Meals & Custom Foods Section */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <BookOpen className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Saved Meals & Custom Foods ({savedMeals.length})
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowNewMealForm(!showNewMealForm)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3.5 py-2 text-xs transition"
          >
            <Plus className="h-4 w-4" />
            <span>{showNewMealForm ? 'Cancel' : 'Add Saved Food'}</span>
          </button>
        </div>

        {showNewMealForm && (
          <form
            onSubmit={handleSaveCustomMeal}
            className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-4 space-y-3 text-xs"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold mb-1">Food Name *</label>
                <input
                  type="text"
                  required
                  value={mealName}
                  onChange={(e) => setMealName(e.target.value)}
                  placeholder="e.g., Protein Overnight Oats"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Brand (Optional)</label>
                <input
                  type="text"
                  value={mealBrand}
                  onChange={(e) => setMealBrand(e.target.value)}
                  placeholder="Homemade"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Data Reliability</label>
                <select
                  value={mealQuality}
                  onChange={(e) => setMealQuality(e.target.value as DataQuality)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5"
                >
                  <option value="verified_label">Verified Nutrition Label</option>
                  <option value="user_estimate">User Estimate</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
              <div>
                <label className="block text-[11px] text-slate-500">Quantity</label>
                <input
                  type="number"
                  step="any"
                  value={mealQuantity}
                  onChange={(e) => setMealQuantity(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500">Grams (g)</label>
                <input
                  type="number"
                  value={mealGrams}
                  onChange={(e) => setMealGrams(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500">Calories</label>
                <input
                  type="number"
                  value={mealCalories}
                  onChange={(e) => setMealCalories(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500">Protein (g)</label>
                <input
                  type="number"
                  value={mealProtein}
                  onChange={(e) => setMealProtein(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500">Carbs (g)</label>
                <input
                  type="number"
                  value={mealCarbs}
                  onChange={(e) => setMealCarbs(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500">Fat (g)</label>
                <input
                  type="number"
                  value={mealFat}
                  onChange={(e) => setMealFat(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2"
              >
                Save Custom Meal
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {savedMeals.map((meal) => (
            <div
              key={meal.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    {meal.name}
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <DataQualityBadge quality={meal.dataQuality} />
                    <RecordSyncBadge syncState={meal._meta?.syncState} compact />
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-1">{meal.servingDescription}</p>
                <div className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <strong className="text-emerald-600 dark:text-emerald-400">
                    {meal.nutrition.calories} kcal
                  </strong>{' '}
                  • {meal.nutrition.proteinGrams}g P • {meal.nutrition.carbsGrams}g C •{' '}
                  {meal.nutrition.fatGrams}g F
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => handleLogSavedMealToDiary(meal)}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 font-semibold px-3 py-1.5 text-xs hover:bg-emerald-100"
                >
                  <Utensils className="h-3.5 w-3.5" />
                  <span>Quick Log to Diary</span>
                </button>
                <button
                  type="button"
                  onClick={() => removeSavedMealItem(meal.id)}
                  className="text-slate-400 hover:text-rose-600 p-1"
                  aria-label={`Delete saved meal ${meal.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Weight Entries Tracker */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2.5">
          <Scale className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
            Weight Log ({weightEntries.length})
          </h2>
        </div>

        <form onSubmit={handleLogWeight} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end text-xs">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Date
            </label>
            <input
              type="date"
              value={weightDate}
              onChange={(e) => setWeightDate(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Weight ({preferredUnits === 'imperial' ? 'lb' : 'kg'})
            </label>
            <input
              type="number"
              step="0.1"
              min={20}
              max={600}
              value={weightValueInput}
              onChange={(e) => setWeightValueInput(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Notes (Optional)
            </label>
            <input
              type="text"
              value={weightNotes}
              onChange={(e) => setWeightNotes(e.target.value)}
              placeholder="Morning weigh-in"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
            />
          </div>
          <div>
            <button
              type="submit"
              className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 transition"
            >
              Log Weight
            </button>
          </div>
        </form>

        {weightEntries.length > 0 && (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {weightEntries.map((w) => (
              <li key={w.id} className="py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-slate-500">{w.date}</span>
                  <strong className="text-sm text-slate-900 dark:text-white">
                    {formatWeightDisplay(w.weightKg, preferredUnits)}
                  </strong>
                  {w.notes && <span className="text-slate-500">({w.notes})</span>}
                  <RecordSyncBadge syncState={w._meta?.syncState} compact />
                </div>
                <button
                  type="button"
                  onClick={() => removeWeightItem(w.id)}
                  className="text-slate-400 hover:text-rose-600 p-1"
                  aria-label={`Delete weight entry ${w.date}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

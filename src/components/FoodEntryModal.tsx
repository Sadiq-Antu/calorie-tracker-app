import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Calculator,
  Check,
  Clock,
  PenTool,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Utensils,
  X,
} from 'lucide-react';
import {
  DataQuality,
  FoodEntry,
  FoodEntryDraft,
  HouseholdServingOption,
  MealType,
  NutritionValues,
  Recipe,
  ReferenceFoodItem,
  SavedMeal,
  ServingUnit,
} from '../types/domain';
import {
  REFERENCE_FOOD_CATEGORIES,
  searchReferenceFoods,
} from '../data/referenceFoods';
import {
  calculateCaloriesFromMacros,
  resolveServingGrams,
  roundCalories,
  roundToOneDecimal,
  scaleNutritionByRatio,
  scaleNutritionFromPer100g,
  UNIT_LABELS,
} from '../utils/nutritionCalculator';
import { getCurrentTimeHHMM } from '../utils/dateUtils';
import { useApp } from '../context/AppContext';
import { aiFoodRecognitionRegistry } from '../services/aiFoodRecognitionService';

export type FoodModalTab = 'search' | 'recent' | 'manual' | 'saved' | 'ai_phase2';

export interface FoodEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDate: string;
  initialMealType?: MealType;
  initialTab?: FoodModalTab;
  editingEntry?: FoodEntry | null;
}

const ALL_UNITS: ServingUnit[] = [
  'serving',
  'g',
  'ml',
  'oz',
  'cup',
  'tbsp',
  'tsp',
  'piece',
  'slice',
  'bowl',
  'fl_oz',
  'lb',
];

export const FoodEntryModal: React.FC<FoodEntryModalProps> = ({
  isOpen,
  onClose,
  initialDate,
  initialMealType = 'breakfast',
  initialTab = 'search',
  editingEntry = null,
}) => {
  const {
    addFoodEntry,
    editFoodEntry,
    saveSavedMealItem,
    recentFoods,
    recipes,
    savedMeals,
  } = useApp();

  const [activeTab, setActiveTab] = useState<FoodModalTab>(
    editingEntry ? 'manual' : initialTab
  );

  // Target Meal & Date/Time
  const [date, setDate] = useState<string>(initialDate);
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [loggedAt, setLoggedAt] = useState<string>(getCurrentTimeHHMM());

  // Tab 1: Search Verified Reference Foods
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedRefFood, setSelectedRefFood] = useState<ReferenceFoodItem | null>(null);
  const [refQuantity, setRefQuantity] = useState<number>(1);
  const [refUnit, setRefUnit] = useState<ServingUnit>('serving');

  // Tab 3 & Edit Mode: Manual / Custom Food State
  const [manualName, setManualName] = useState<string>('');
  const [manualBrand, setManualBrand] = useState<string>('');
  const [manualQuantity, setManualQuantity] = useState<number>(1);
  const [manualUnit, setManualUnit] = useState<ServingUnit>('serving');
  const [manualServingGrams, setManualServingGrams] = useState<number>(100);
  const [manualCalories, setManualCalories] = useState<number>(200);
  const [manualProtein, setManualProtein] = useState<number>(15);
  const [manualCarbs, setManualCarbs] = useState<number>(20);
  const [manualFat, setManualFat] = useState<number>(7);
  const [manualFiber, setManualFiber] = useState<string>('');
  const [manualSugar, setManualSugar] = useState<string>('');
  const [manualDataQuality, setManualDataQuality] = useState<DataQuality>('user_estimate');
  const [manualNotes, setManualNotes] = useState<string>('');
  const [alsoSaveToMyFoods, setAlsoSaveToMyFoods] = useState<boolean>(false);
  const [editBasePer100g, setEditBasePer100g] = useState<NutritionValues | null>(null);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setFormError(null);
    if (editingEntry) {
      setActiveTab('manual');
      setDate(editingEntry.date);
      setMealType(editingEntry.mealType);
      setLoggedAt(editingEntry.loggedAt);
      setManualName(editingEntry.name);
      setManualBrand(editingEntry.brand || '');
      setManualQuantity(editingEntry.quantity);
      setManualUnit(editingEntry.unit);
      setManualServingGrams(editingEntry.servingGrams);
      setManualCalories(editingEntry.nutrition.calories);
      setManualProtein(editingEntry.nutrition.proteinGrams);
      setManualCarbs(editingEntry.nutrition.carbsGrams);
      setManualFat(editingEntry.nutrition.fatGrams);
      setManualFiber(
        typeof editingEntry.nutrition.fiberGrams === 'number'
          ? String(editingEntry.nutrition.fiberGrams)
          : ''
      );
      setManualSugar(
        typeof editingEntry.nutrition.sugarGrams === 'number'
          ? String(editingEntry.nutrition.sugarGrams)
          : ''
      );
      setManualDataQuality(editingEntry.dataQuality);
      setManualNotes(editingEntry.notes || '');
      setEditBasePer100g(editingEntry.baseNutritionPer100g ?? null);
      setAlsoSaveToMyFoods(false);
    } else {
      setActiveTab(initialTab);
      setDate(initialDate);
      setMealType(initialMealType);
      setLoggedAt(getCurrentTimeHHMM());
      setSelectedRefFood(null);
      setManualName('');
      setManualBrand('');
      setManualQuantity(1);
      setManualUnit('serving');
      setManualServingGrams(100);
      setManualCalories(250);
      setManualProtein(15);
      setManualCarbs(25);
      setManualFat(8);
      setManualFiber('');
      setManualSugar('');
      setManualDataQuality('user_estimate');
      setManualNotes('');
      setEditBasePer100g(null);
      setAlsoSaveToMyFoods(false);
    }
  }, [isOpen, editingEntry, initialDate, initialMealType, initialTab]);

  const filteredRefFoods = useMemo(
    () => searchReferenceFoods(searchQuery, selectedCategory),
    [searchQuery, selectedCategory]
  );

  const handleSelectReferenceFood = (food: ReferenceFoodItem) => {
    setSelectedRefFood(food);
    setRefUnit(food.defaultServing.unit);
    setRefQuantity(food.defaultServing.defaultQuantity);
  };

  const refServingOptions: HouseholdServingOption[] = useMemo(() => {
    if (!selectedRefFood) return [];
    const list: HouseholdServingOption[] = [
      selectedRefFood.defaultServing,
      ...selectedRefFood.alternateServings.filter(
        (alt) => alt.unit !== selectedRefFood.defaultServing.unit
      ),
    ];
    return list;
  }, [selectedRefFood]);

  const computedRefGrams = useMemo(() => {
    if (!selectedRefFood) return 0;
    return resolveServingGrams(refQuantity, refUnit, refServingOptions);
  }, [selectedRefFood, refQuantity, refUnit, refServingOptions]);

  const computedRefNutrition = useMemo(() => {
    if (!selectedRefFood) {
      return { calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0 };
    }
    return scaleNutritionFromPer100g(selectedRefFood.nutritionPer100g, computedRefGrams);
  }, [selectedRefFood, computedRefGrams]);

  const handleLogReferenceFood = async () => {
    if (!selectedRefFood) return;
    if (refQuantity <= 0 || computedRefGrams <= 0) {
      setFormError('Quantity must be greater than zero.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const matchedOpt = refServingOptions.find((o) => o.unit === refUnit);
      const desc = matchedOpt
        ? `${refQuantity} × ${matchedOpt.label} (${computedRefGrams}g)`
        : `${refQuantity} ${refUnit} (${computedRefGrams}g)`;

      const draft: FoodEntryDraft = {
        date,
        mealType,
        loggedAt,
        name: selectedRefFood.name,
        brand: selectedRefFood.brand,
        referenceId: selectedRefFood.usdaFdcId,
        quantity: refQuantity,
        unit: refUnit,
        servingGrams: computedRefGrams,
        servingDescription: desc,
        nutrition: computedRefNutrition,
        baseNutritionPer100g: selectedRefFood.nutritionPer100g,
        dataQuality: 'verified',
        sourceType: 'reference_db',
      };
      await addFoodEntry(draft);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to log food.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickLogRecent = async (recent: FoodEntry) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const draft: FoodEntryDraft = {
        date,
        mealType,
        loggedAt,
        name: recent.name,
        brand: recent.brand,
        referenceId: recent.referenceId,
        quantity: recent.quantity,
        unit: recent.unit,
        servingGrams: recent.servingGrams,
        servingDescription: recent.servingDescription,
        nutrition: { ...recent.nutrition },
        baseNutritionPer100g: recent.baseNutritionPer100g
          ? { ...recent.baseNutritionPer100g }
          : undefined,
        dataQuality: recent.dataQuality,
        sourceType: recent.sourceType,
        notes: recent.notes,
      };
      await addFoodEntry(draft);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to log recent food.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogRecipe = async (recipe: Recipe, servingsToLog: number = 1) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const scaledNutrition = scaleNutritionByRatio(recipe.nutritionPerServing, servingsToLog);
      const gramsPerServing =
        recipe.servingsCount > 0
          ? roundToOneDecimal(recipe.totalWeightGrams / recipe.servingsCount)
          : 200;
      const totalGrams = roundToOneDecimal(gramsPerServing * servingsToLog);

      const draft: FoodEntryDraft = {
        date,
        mealType,
        loggedAt,
        name: recipe.name,
        quantity: servingsToLog,
        unit: 'serving',
        servingGrams: totalGrams,
        servingDescription: `${servingsToLog} serving(s) (${totalGrams}g)`,
        nutrition: scaledNutrition,
        dataQuality: recipe.dataQuality,
        sourceType: 'recipe',
        notes: recipe.notes,
      };
      await addFoodEntry(draft);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to log recipe.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogSavedMeal = async (meal: SavedMeal) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const draft: FoodEntryDraft = {
        date,
        mealType,
        loggedAt,
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
      };
      await addFoodEntry(draft);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to log saved meal.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleManualOrEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!manualName.trim()) {
      setFormError('Please enter a food name.');
      return;
    }
    if (manualQuantity <= 0) {
      setFormError('Quantity must be greater than zero.');
      return;
    }
    if (manualCalories < 0 || manualProtein < 0 || manualCarbs < 0 || manualFat < 0) {
      setFormError('Calories and macronutrients cannot be negative.');
      return;
    }

    const nutrition: NutritionValues = {
      calories: roundCalories(manualCalories),
      proteinGrams: roundToOneDecimal(manualProtein),
      carbsGrams: roundToOneDecimal(manualCarbs),
      fatGrams: roundToOneDecimal(manualFat),
    };

    if (manualFiber.trim() !== '' && Number.isFinite(Number(manualFiber))) {
      nutrition.fiberGrams = roundToOneDecimal(Number(manualFiber));
    }
    if (manualSugar.trim() !== '' && Number.isFinite(Number(manualSugar))) {
      nutrition.sugarGrams = roundToOneDecimal(Number(manualSugar));
    }

    const safeGrams = Math.max(1, roundToOneDecimal(manualServingGrams));
    const servingDescription = `${manualQuantity} ${UNIT_LABELS[manualUnit]?.short || manualUnit} (${safeGrams}g)`;

    const draft: FoodEntryDraft = {
      date,
      mealType,
      loggedAt,
      name: manualName.trim(),
      brand: manualBrand.trim() || undefined,
      quantity: roundToOneDecimal(manualQuantity),
      unit: manualUnit,
      servingGrams: safeGrams,
      servingDescription,
      nutrition,
      baseNutritionPer100g: editBasePer100g ?? undefined,
      dataQuality: manualDataQuality,
      sourceType: editingEntry ? editingEntry.sourceType : 'manual',
      notes: manualNotes.trim() || undefined,
    };

    setSubmitting(true);
    try {
      if (editingEntry) {
        await editFoodEntry(editingEntry.id, editingEntry, draft);
      } else {
        await addFoodEntry(draft);
        if (alsoSaveToMyFoods) {
          await saveSavedMealItem({
            name: manualName.trim(),
            brand: manualBrand.trim() || undefined,
            defaultQuantity: roundToOneDecimal(manualQuantity),
            defaultUnit: manualUnit,
            servingGrams: safeGrams,
            servingDescription,
            nutrition,
            defaultMealType: mealType,
            dataQuality: manualDataQuality === 'ai_estimate' ? 'user_estimate' : manualDataQuality,
            notes: manualNotes.trim() || undefined,
          });
        }
      }
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save food entry.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const aiProvider = aiFoodRecognitionRegistry.getProvider();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="food-modal-title"
    >
      <div className="w-full max-w-2xl rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4">
          <div>
            <h2 id="food-modal-title" className="text-lg font-bold text-slate-900 dark:text-white">
              {editingEntry ? `Edit "${editingEntry.name}"` : 'Log Food to Diary'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {editingEntry
                ? 'Adjust quantity, serving unit, meal, or nutrition values'
                : 'Search verified USDA foods, re-log recent meals, or enter manually'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close food logging modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Target Meal, Date & Time Strip */}
        <div className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 px-5 py-3 grid grid-cols-3 gap-2.5 text-xs">
          <div>
            <label
              htmlFor="modal-meal-select"
              className="block font-semibold text-slate-600 dark:text-slate-400 mb-1"
            >
              Meal
            </label>
            <select
              id="modal-meal-select"
              value={mealType}
              onChange={(e) => setMealType(e.target.value as MealType)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-medium text-slate-900 dark:text-white capitalize"
            >
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snacks">Snacks</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="modal-date-input"
              className="block font-semibold text-slate-600 dark:text-slate-400 mb-1"
            >
              Date
            </label>
            <input
              id="modal-date-input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-medium text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label
              htmlFor="modal-time-input"
              className="block font-semibold text-slate-600 dark:text-slate-400 mb-1"
            >
              Time
            </label>
            <input
              id="modal-time-input"
              type="time"
              value={loggedAt}
              onChange={(e) => setLoggedAt(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-medium text-slate-900 dark:text-white"
            />
          </div>
        </div>

        {/* Navigation Tabs (Hidden when editing an existing entry directly) */}
        {!editingEntry && (
          <div
            className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 overflow-x-auto"
            role="tablist"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'search'}
              onClick={() => setActiveTab('search')}
              className={`flex items-center gap-1.5 border-b-2 px-3.5 py-3 text-xs font-semibold whitespace-nowrap transition ${
                activeTab === 'search'
                  ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Search className="h-3.5 w-3.5" />
              <span>Verified Search</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'recent'}
              onClick={() => setActiveTab('recent')}
              className={`flex items-center gap-1.5 border-b-2 px-3.5 py-3 text-xs font-semibold whitespace-nowrap transition ${
                activeTab === 'recent'
                  ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>Recent ({recentFoods.length})</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'manual'}
              onClick={() => setActiveTab('manual')}
              className={`flex items-center gap-1.5 border-b-2 px-3.5 py-3 text-xs font-semibold whitespace-nowrap transition ${
                activeTab === 'manual'
                  ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <PenTool className="h-3.5 w-3.5" />
              <span>Manual Entry</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'saved'}
              onClick={() => setActiveTab('saved')}
              className={`flex items-center gap-1.5 border-b-2 px-3.5 py-3 text-xs font-semibold whitespace-nowrap transition ${
                activeTab === 'saved'
                  ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>Recipes & Saved ({recipes.length + savedMeals.length})</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'ai_phase2'}
              onClick={() => setActiveTab('ai_phase2')}
              className={`flex items-center gap-1.5 border-b-2 px-3.5 py-3 text-xs font-semibold whitespace-nowrap transition ${
                activeTab === 'ai_phase2'
                  ? 'border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>AI Scan (Phase 2)</span>
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {formError && (
            <div
              role="alert"
              className="rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 p-3 text-xs text-rose-800 dark:text-rose-200"
            >
              {formError}
            </div>
          )}

          {/* ================= TAB 1: SEARCH VERIFIED FOODS ================= */}
          {activeTab === 'search' && !editingEntry && (
            <div className="space-y-4">
              {!selectedRefFood ? (
                <>
                  <div className="relative">
                    <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="search"
                      aria-label="Search verified foods"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search verified foods (e.g., chicken breast, oats, banana, egg, rice)…"
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  {/* Category Filter Pills */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {REFERENCE_FOOD_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap border transition ${
                          selectedCategory === cat
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Results List */}
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {filteredRefFoods.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center space-y-2">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          No verified reference foods matched "{searchQuery}"
                        </p>
                        <p className="text-xs text-slate-500">
                          Do not guess or use wrong food items — switch to Manual Entry to log from a package label or record an explicit estimate.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setManualName(searchQuery);
                            setActiveTab('manual');
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white"
                        >
                          <PenTool className="h-3.5 w-3.5" />
                          <span>Create "{searchQuery || 'Custom Food'}" Manually</span>
                        </button>
                      </div>
                    ) : (
                      filteredRefFoods.map((food) => {
                        const defaultPreview = scaleNutritionFromPer100g(
                          food.nutritionPer100g,
                          food.defaultServing.gramsEquivalent * food.defaultServing.defaultQuantity
                        );
                        return (
                          <div
                            key={food.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/50 p-3.5 hover:border-emerald-400 transition"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm text-slate-900 dark:text-white">
                                  {food.name}
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 dark:bg-sky-950/80 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                                  <ShieldCheck className="h-3 w-3" />
                                  USDA #{food.usdaFdcId}
                                </span>
                              </div>
                              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                Default: {food.defaultServing.defaultQuantity} ×{' '}
                                {food.defaultServing.label} •{' '}
                                <strong className="text-slate-800 dark:text-slate-200">
                                  {defaultPreview.calories} kcal
                                </strong>{' '}
                                ({defaultPreview.proteinGrams}g P • {defaultPreview.carbsGrams}g C •{' '}
                                {defaultPreview.fatGrams}g F)
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleSelectReferenceFood(food)}
                              className="shrink-0 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3.5 py-2 text-xs transition"
                            >
                              Select
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              ) : (
                /* Selected Reference Food Serving & Quantity Configurator */
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 dark:bg-sky-950 px-2.5 py-0.5 text-xs font-semibold text-sky-800 dark:text-sky-300">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Verified USDA FoodData (#{selectedRefFood.usdaFdcId})
                      </span>
                      <h3 className="mt-1.5 text-base font-bold text-slate-900 dark:text-white">
                        {selectedRefFood.name}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Base per 100g: {selectedRefFood.nutritionPer100g.calories} kcal •{' '}
                        {selectedRefFood.nutritionPer100g.proteinGrams}g P •{' '}
                        {selectedRefFood.nutritionPer100g.carbsGrams}g C •{' '}
                        {selectedRefFood.nutritionPer100g.fatGrams}g F
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedRefFood(null)}
                      className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      Change Food
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="ref-quantity-input"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Quantity
                      </label>
                      <input
                        id="ref-quantity-input"
                        type="number"
                        step="any"
                        min={0.1}
                        max={10000}
                        value={refQuantity}
                        onChange={(e) => setRefQuantity(Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3.5 py-2 text-sm font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="ref-unit-select"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Serving Size / Unit
                      </label>
                      <select
                        id="ref-unit-select"
                        value={refUnit}
                        onChange={(e) => {
                          const newUnit = e.target.value as ServingUnit;
                          setRefUnit(newUnit);
                          const opt = refServingOptions.find((o) => o.unit === newUnit);
                          if (opt) {
                            setRefQuantity(opt.defaultQuantity);
                          } else if (newUnit === 'g' || newUnit === 'ml') {
                            setRefQuantity(100);
                          } else {
                            setRefQuantity(1);
                          }
                        }}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3.5 py-2 text-sm font-medium text-slate-900 dark:text-white"
                      >
                        {refServingOptions.map((opt) => (
                          <option key={opt.unit} value={opt.unit}>
                            {opt.label}
                          </option>
                        ))}
                        {ALL_UNITS.filter(
                          (u) => !refServingOptions.some((o) => o.unit === u)
                        ).map((u) => (
                          <option key={u} value={u}>
                            {UNIT_LABELS[u].full}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Quick Multiplier Chips */}
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="text-slate-500">Quick amounts:</span>
                    {refUnit === 'g' || refUnit === 'ml'
                      ? [50, 100, 150, 200, 250].map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setRefQuantity(amt)}
                            className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2.5 py-1 font-medium hover:border-emerald-500"
                          >
                            {amt}
                            {refUnit}
                          </button>
                        ))
                      : [0.5, 1, 1.5, 2, 3].map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setRefQuantity(amt)}
                            className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2.5 py-1 font-medium hover:border-emerald-500"
                          >
                            {amt}×
                          </button>
                        ))}
                  </div>

                  {/* Scaled Nutrition Live Preview */}
                  <div className="rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/70 p-4">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                      <span>Calculated Nutrition for {computedRefGrams}g</span>
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        Verified Reference
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/60 p-2">
                        <div className="text-lg font-extrabold text-emerald-700 dark:text-emerald-300">
                          {computedRefNutrition.calories}
                        </div>
                        <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                          kcal
                        </div>
                      </div>
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-2">
                        <div className="text-base font-bold text-slate-900 dark:text-white">
                          {computedRefNutrition.proteinGrams}g
                        </div>
                        <div className="text-[11px] text-slate-500">Protein</div>
                      </div>
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-2">
                        <div className="text-base font-bold text-slate-900 dark:text-white">
                          {computedRefNutrition.carbsGrams}g
                        </div>
                        <div className="text-[11px] text-slate-500">Carbs</div>
                      </div>
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-2">
                        <div className="text-base font-bold text-slate-900 dark:text-white">
                          {computedRefNutrition.fatGrams}g
                        </div>
                        <div className="text-[11px] text-slate-500">Fat</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedRefFood(null)}
                      className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Back to Results
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={handleLogReferenceFood}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 text-xs shadow-xs transition"
                    >
                      <Plus className="h-4 w-4" />
                      <span>{submitting ? 'Logging…' : `Add to ${mealType}`}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 2: RECENT FOODS ================= */}
          {activeTab === 'recent' && !editingEntry && (
            <div className="space-y-2.5">
              {recentFoods.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500">
                  No recent foods logged yet. Foods you log will appear here for one-tap re-logging.
                </div>
              ) : (
                recentFoods.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 bg-white dark:bg-slate-800/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                        {item.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {item.servingDescription} •{' '}
                        <strong className="text-slate-800 dark:text-slate-200">
                          {item.nutrition.calories} kcal
                        </strong>{' '}
                        ({item.nutrition.proteinGrams}g P • {item.nutrition.carbsGrams}g C •{' '}
                        {item.nutrition.fatGrams}g F)
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleQuickLogRecent(item)}
                      className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3.5 py-2 text-xs transition"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Log Again</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ================= TAB 3: MANUAL ENTRY & EDIT MODE ================= */}
          {(activeTab === 'manual' || Boolean(editingEntry)) && (
            <form onSubmit={handleManualOrEditSubmit} className="space-y-4">
              {/* Data Quality Selector: Verified Label vs User Estimate */}
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3.5 space-y-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Nutrition Data Reliability *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setManualDataQuality('user_estimate')}
                    className={`flex items-start gap-2.5 rounded-xl p-3 text-left border transition ${
                      manualDataQuality === 'user_estimate' || manualDataQuality === 'ai_estimate'
                        ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-400 dark:border-amber-700 text-amber-900 dark:text-amber-200'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold">User Estimate</div>
                      <div className="text-[11px] opacity-80">
                        Restaurant meal, homemade dish, or rough estimate. Badged as “Estimate” so you can refine later.
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setManualDataQuality('verified_label')}
                    className={`flex items-start gap-2.5 rounded-xl p-3 text-left border transition ${
                      manualDataQuality === 'verified_label' || manualDataQuality === 'verified'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold">Verified Nutrition Label</div>
                      <div className="text-[11px] opacity-80">
                        Copied directly from a package Nutrition Facts panel or official nutrition table.
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="manual-food-name"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Food or Meal Name *
                  </label>
                  <input
                    id="manual-food-name"
                    type="text"
                    required
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="e.g., Homemade Turkey Chili or Greek Yogurt Bowl"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="manual-food-brand"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Brand / Source (Optional)
                  </label>
                  <input
                    id="manual-food-brand"
                    type="text"
                    value={manualBrand}
                    onChange={(e) => setManualBrand(e.target.value)}
                    placeholder="e.g., Trader Joe's"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Quantity, Unit & Serving Grams */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="manual-quantity"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Quantity *
                  </label>
                  <input
                    id="manual-quantity"
                    type="number"
                    step="any"
                    min={0.01}
                    max={10000}
                    required
                    value={manualQuantity}
                    onChange={(e) => {
                      const q = Number(e.target.value);
                      setManualQuantity(q);
                      const g = resolveServingGrams(q, manualUnit);
                      if (g > 0) {
                        setManualServingGrams(g);
                        if (editBasePer100g) {
                          const scaled = scaleNutritionFromPer100g(editBasePer100g, g);
                          setManualCalories(scaled.calories);
                          setManualProtein(scaled.proteinGrams);
                          setManualCarbs(scaled.carbsGrams);
                          setManualFat(scaled.fatGrams);
                        }
                      }
                    }}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="manual-unit"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Unit *
                  </label>
                  <select
                    id="manual-unit"
                    value={manualUnit}
                    onChange={(e) => {
                      const u = e.target.value as ServingUnit;
                      setManualUnit(u);
                      const g = resolveServingGrams(manualQuantity, u);
                      if (g > 0) setManualServingGrams(g);
                    }}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
                  >
                    {ALL_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {UNIT_LABELS[u].full}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="manual-grams"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Total Weight (g/ml)
                  </label>
                  <input
                    id="manual-grams"
                    type="number"
                    step="any"
                    min={1}
                    max={50000}
                    value={manualServingGrams}
                    onChange={(e) => {
                      const g = Number(e.target.value);
                      setManualServingGrams(g);
                      if (editBasePer100g && g > 0) {
                        const scaled = scaleNutritionFromPer100g(editBasePer100g, g);
                        setManualCalories(scaled.calories);
                        setManualProtein(scaled.proteinGrams);
                        setManualCarbs(scaled.carbsGrams);
                        setManualFat(scaled.fatGrams);
                      }
                    }}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Calories & Macronutrients */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Nutrition Values (for this serving)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setManualCalories(
                        calculateCaloriesFromMacros(manualProtein, manualCarbs, manualFat)
                      )
                    }
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    <Calculator className="h-3.5 w-3.5" />
                    <span>Auto-calc kcal from macros</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label
                      htmlFor="manual-calories"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Calories (kcal) *
                    </label>
                    <input
                      id="manual-calories"
                      type="number"
                      min={0}
                      max={50000}
                      required
                      value={manualCalories}
                      onChange={(e) => setManualCalories(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-bold text-emerald-700 dark:text-emerald-400"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="manual-protein"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Protein (g) *
                    </label>
                    <input
                      id="manual-protein"
                      type="number"
                      step="any"
                      min={0}
                      max={5000}
                      required
                      value={manualProtein}
                      onChange={(e) => setManualProtein(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="manual-carbs"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Carbs (g) *
                    </label>
                    <input
                      id="manual-carbs"
                      type="number"
                      step="any"
                      min={0}
                      max={5000}
                      required
                      value={manualCarbs}
                      onChange={(e) => setManualCarbs(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="manual-fat"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Fat (g) *
                    </label>
                    <input
                      id="manual-fat"
                      type="number"
                      step="any"
                      min={0}
                      max={5000}
                      required
                      value={manualFat}
                      onChange={(e) => setManualFat(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">
                      Fiber (g, optional)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min={0}
                      value={manualFiber}
                      onChange={(e) => setManualFiber(e.target.value)}
                      placeholder="Optional"
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">
                      Sugar (g, optional)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min={0}
                      value={manualSugar}
                      onChange={(e) => setManualSugar(e.target.value)}
                      placeholder="Optional"
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs text-slate-500 mb-1">
                      Notes (optional)
                    </label>
                    <input
                      type="text"
                      value={manualNotes}
                      onChange={(e) => setManualNotes(e.target.value)}
                      placeholder="e.g., Post-workout meal"
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs"
                    />
                  </div>
                </div>
              </div>

              {!editingEntry && (
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alsoSaveToMyFoods}
                    onChange={(e) => setAlsoSaveToMyFoods(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                  />
                  <span>Also save to “My Saved Meals & Custom Foods” for future 1-tap logging</span>
                </label>
              )}

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 text-xs shadow-xs transition"
                >
                  <Check className="h-4 w-4" />
                  <span>
                    {submitting
                      ? 'Saving…'
                      : editingEntry
                        ? 'Save Changes'
                        : `Log to ${mealType}`}
                  </span>
                </button>
              </div>
            </form>
          )}

          {/* ================= TAB 4: RECIPES & SAVED MEALS ================= */}
          {activeTab === 'saved' && !editingEntry && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Saved Custom Foods & Meals ({savedMeals.length})
                </h3>
                {savedMeals.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No saved meals yet. Check “Also save to My Saved Meals” in Manual Entry or create one in the Recipes & Meals tab.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {savedMeals.map((meal) => (
                      <div
                        key={meal.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-800/50"
                      >
                        <div>
                          <div className="font-semibold text-sm text-slate-900 dark:text-white">
                            {meal.name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {meal.servingDescription} •{' '}
                            <strong>{meal.nutrition.calories} kcal</strong> ({meal.nutrition.proteinGrams}g P •{' '}
                            {meal.nutrition.carbsGrams}g C • {meal.nutrition.fatGrams}g F)
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleLogSavedMeal(meal)}
                          className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3.5 py-2 text-xs"
                        >
                          Log Meal
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Custom Multi-Ingredient Recipes ({recipes.length})
                </h3>
                {recipes.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No custom recipes yet. You can build multi-ingredient recipes in the “Recipes & Meals” tab.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recipes.map((rcp) => (
                      <div
                        key={rcp.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-800/50"
                      >
                        <div>
                          <div className="font-semibold text-sm text-slate-900 dark:text-white">
                            {rcp.name}
                          </div>
                          <div className="text-xs text-slate-500">
                            1 serving of {rcp.servingsCount} •{' '}
                            <strong>{rcp.nutritionPerServing.calories} kcal</strong> (
                            {rcp.nutritionPerServing.proteinGrams}g P •{' '}
                            {rcp.nutritionPerServing.carbsGrams}g C •{' '}
                            {rcp.nutritionPerServing.fatGrams}g F)
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleLogRecipe(rcp, 1)}
                          className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3.5 py-2 text-xs"
                        >
                          Log 1 Serving
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= TAB 5: PHASE 2 AI ARCHITECTURE SLOT ================= */}
          {activeTab === 'ai_phase2' && !editingEntry && (
            <div className="rounded-2xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/70 p-6 text-center space-y-3">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-purple-600/10 flex items-center justify-center text-purple-600 dark:text-purple-400">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {aiProvider.displayName}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
                NutriPulse’s domain model (<code>sourceType: 'ai_recognition'</code>,{' '}
                <code>dataQuality: 'ai_estimate'</code>, and <code>aiMetadata</code>) and{' '}
                <code>FoodRecognitionProvider</code> adapter pipeline are pre-wired so Phase 2
                camera & natural-language meal recognition plug directly into this modal without
                changing the database, calculations, or diary UI.
              </p>
              <div className="pt-2 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('search')}
                  className="rounded-xl bg-emerald-600 text-white px-4 py-2 text-xs font-semibold"
                >
                  Use Verified Food Search
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('manual')}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  Use Manual Entry
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

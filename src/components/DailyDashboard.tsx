import React, { useMemo, useState } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Copy,
  Cookie,
  Edit3,
  Flame,
  Moon,
  Plus,
  ShieldCheck,
  Sun,
  Trash2,
  Utensils,
} from 'lucide-react';
import { FoodEntry, MealType } from '../types/domain';
import { calculateDailySummary } from '../utils/nutritionCalculator';
import {
  formatFullDateSubheading,
  formatReadableDate,
  getSevenDayWindow,
  getTodayDateString,
  shiftDateString,
} from '../utils/dateUtils';
import { useApp } from '../context/AppContext';
import { DataQualityBadge, RecordSyncBadge } from './SyncStatusBadge';
import { FoodModalTab } from './FoodEntryModal';

export interface DailyDashboardProps {
  onOpenAddFood: (mealType?: MealType, tab?: FoodModalTab) => void;
  onEditFoodEntry: (entry: FoodEntry) => void;
}

const MEAL_CONFIG: Array<{
  type: MealType;
  label: string;
  timeHint: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { type: 'breakfast', label: 'Breakfast', timeHint: 'Morning energy', icon: Coffee },
  { type: 'lunch', label: 'Lunch', timeHint: 'Midday meal', icon: Sun },
  { type: 'dinner', label: 'Dinner', timeHint: 'Evening meal', icon: Moon },
  { type: 'snacks', label: 'Snacks', timeHint: 'Between meals', icon: Cookie },
];

export const DailyDashboard: React.FC<DailyDashboardProps> = ({
  onOpenAddFood,
  onEditFoodEntry,
}) => {
  const {
    profile,
    foodEntries,
    selectedDate,
    setSelectedDate,
    removeFoodEntry,
    duplicateEntry,
  } = useApp();

  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const todayStr = getTodayDateString();
  const isToday = selectedDate === todayStr;

  const calorieGoal = profile?.dailyCalorieGoal ?? 2000;
  const macroGoals = profile?.macroGoals ?? {
    proteinGrams: 140,
    carbsGrams: 200,
    fatGrams: 65,
  };

  const summary = useMemo(
    () => calculateDailySummary(selectedDate, foodEntries, calorieGoal, macroGoals),
    [selectedDate, foodEntries, calorieGoal, macroGoals]
  );

  const dayEntries = useMemo(
    () =>
      foodEntries
        .filter((e) => e.date === selectedDate)
        .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt)),
    [foodEntries, selectedDate]
  );

  const sevenDays = useMemo(() => getSevenDayWindow(selectedDate), [selectedDate]);

  // SVG Calorie Ring Geometry
  const ringRadius = 58;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const strokeDashoffset =
    ringCircumference - (summary.calorieProgressPercent / 100) * ringCircumference;

  return (
    <div className="space-y-6 pb-24">
      {/* 1. Date Navigation Bar & 7-Day Strip */}
      <section
        aria-label="Date navigation"
        className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedDate(shiftDateString(selectedDate, -1))}
              className="rounded-xl border border-slate-200 dark:border-slate-700 p-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              aria-label="Previous day"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
                  {formatReadableDate(selectedDate, todayStr)}
                </h1>
                {!isToday && (
                  <button
                    type="button"
                    onClick={() => setSelectedDate(todayStr)}
                    className="rounded-full bg-emerald-100 dark:bg-emerald-950 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-200 transition"
                  >
                    Jump to Today
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {formatFullDateSubheading(selectedDate)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedDate(shiftDateString(selectedDate, 1))}
              className="rounded-xl border border-slate-200 dark:border-slate-700 p-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              aria-label="Next day"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <Calendar className="h-4 w-4 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                type="date"
                aria-label="Select diary date"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(e.target.value);
                }}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-9 pr-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200"
              />
            </div>

            <button
              type="button"
              onClick={() => onOpenAddFood()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 text-xs sm:text-sm shadow-sm transition"
            >
              <Plus className="h-4 w-4" />
              <span>Add Food</span>
            </button>
          </div>
        </div>

        {/* 7-Day Interactive Strip */}
        <div className="grid grid-cols-7 gap-1.5 pt-1">
          {sevenDays.map((d) => {
            const hasEntries = foodEntries.some((e) => e.date === d.dateStr);
            return (
              <button
                key={d.dateStr}
                type="button"
                onClick={() => setSelectedDate(d.dateStr)}
                className={`flex flex-col items-center justify-center rounded-xl py-2 px-1 text-xs transition border ${
                  d.isSelected
                    ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-xs'
                    : d.isToday
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 font-semibold'
                      : 'bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span className="text-[10px] uppercase opacity-80">{d.dayShort}</span>
                <span className="text-sm mt-0.5">{d.dayNumber}</span>
                <span
                  className={`mt-1 h-1.5 w-1.5 rounded-full ${
                    hasEntries
                      ? d.isSelected
                        ? 'bg-white'
                        : 'bg-emerald-500'
                      : 'bg-transparent'
                  }`}
                />
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Daily Calories & Macronutrient Progress Dashboard Card */}
      <section
        aria-label="Daily nutrition summary"
        className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-5"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Calorie Ring & Remaining Summary */}
          <div className="lg:col-span-5 flex items-center gap-5">
            <div className="relative h-36 w-36 shrink-0 flex items-center justify-center">
              <svg className="h-36 w-36 -rotate-90 transform" viewBox="0 0 140 140">
                <circle
                  cx="70"
                  cy="70"
                  r={ringRadius}
                  fill="transparent"
                  stroke="currentColor"
                  strokeWidth="12"
                  className="text-slate-100 dark:text-slate-800"
                />
                <circle
                  cx="70"
                  cy="70"
                  r={ringRadius}
                  fill="transparent"
                  stroke="currentColor"
                  strokeWidth="12"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className={
                    summary.isOverCalorieGoal
                      ? 'text-amber-500 transition-all duration-500'
                      : 'text-emerald-500 transition-all duration-500'
                  }
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <Flame
                  className={`h-4 w-4 ${
                    summary.isOverCalorieGoal ? 'text-amber-500' : 'text-emerald-500'
                  }`}
                />
                <span
                  data-testid="consumed-calories-value"
                  className="text-2xl font-extrabold text-slate-900 dark:text-white leading-none mt-1"
                >
                  {summary.consumed.calories}
                </span>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                  of {summary.calorieGoal} kcal
                </span>
              </div>
            </div>

            <div className="space-y-2.5 flex-1">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3 border border-slate-200/70 dark:border-slate-700/70">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {summary.isOverCalorieGoal ? 'Calories Above Target' : 'Remaining Calories'}
                </div>
                <div
                  data-testid="remaining-calories-value"
                  className={`text-xl font-extrabold mt-0.5 ${
                    summary.isOverCalorieGoal
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {summary.isOverCalorieGoal
                    ? `+${summary.overCalorieAmount} kcal`
                    : `${summary.remainingCalories} kcal`}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-2.5 py-1.5">
                  <span className="text-slate-500 block text-[10px]">Daily Target</span>
                  <strong className="text-slate-900 dark:text-white">
                    {summary.calorieGoal} kcal
                  </strong>
                </div>
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-2.5 py-1.5">
                  <span className="text-slate-500 block text-[10px]">Items Logged</span>
                  <strong className="text-slate-900 dark:text-white">
                    {dayEntries.length} {dayEntries.length === 1 ? 'item' : 'items'}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Macronutrient Progress Bars */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Protein */}
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 dark:text-slate-200">Protein</span>
                <span className="text-slate-500">
                  {summary.macroCalorieDistribution.proteinPercent}% kcal
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span
                  data-testid="consumed-protein-value"
                  className="text-lg font-extrabold text-sky-600 dark:text-sky-400"
                >
                  {summary.consumed.proteinGrams}g
                </span>
                <span className="text-xs text-slate-500">/ {summary.macroGoals.proteinGrams}g</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all duration-300"
                  style={{ width: `${summary.macroProgressPercent.protein}%` }}
                />
              </div>
              <div className="text-[11px] text-slate-500">
                {Math.max(
                  0,
                  Math.round(summary.macroGoals.proteinGrams - summary.consumed.proteinGrams)
                )}
                g remaining
              </div>
            </div>

            {/* Carbohydrates */}
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 dark:text-slate-200">Carbs</span>
                <span className="text-slate-500">
                  {summary.macroCalorieDistribution.carbsPercent}% kcal
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span
                  data-testid="consumed-carbs-value"
                  className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400"
                >
                  {summary.consumed.carbsGrams}g
                </span>
                <span className="text-xs text-slate-500">/ {summary.macroGoals.carbsGrams}g</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${summary.macroProgressPercent.carbs}%` }}
                />
              </div>
              <div className="text-[11px] text-slate-500">
                {Math.max(
                  0,
                  Math.round(summary.macroGoals.carbsGrams - summary.consumed.carbsGrams)
                )}
                g remaining
              </div>
            </div>

            {/* Fat */}
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 dark:text-slate-200">Fat</span>
                <span className="text-slate-500">
                  {summary.macroCalorieDistribution.fatPercent}% kcal
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span
                  data-testid="consumed-fat-value"
                  className="text-lg font-extrabold text-violet-600 dark:text-violet-400"
                >
                  {summary.consumed.fatGrams}g
                </span>
                <span className="text-xs text-slate-500">/ {summary.macroGoals.fatGrams}g</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-violet-500 transition-all duration-300"
                  style={{ width: `${summary.macroProgressPercent.fat}%` }}
                />
              </div>
              <div className="text-[11px] text-slate-500">
                {Math.max(0, Math.round(summary.macroGoals.fatGrams - summary.consumed.fatGrams))}g
                remaining
              </div>
            </div>
          </div>
        </div>

        {/* Data Quality & Sync Breakdown Footer */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-3.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
              <span>
                Verified data: <strong>{summary.dataQualityBreakdown.verifiedCalories} kcal</strong> (
                {summary.dataQualityBreakdown.verifiedCount} items)
              </span>
            </span>
            {summary.dataQualityBreakdown.estimateCount > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                • User estimates:{' '}
                <strong>{summary.dataQualityBreakdown.estimatedCalories} kcal</strong> (
                {summary.dataQualityBreakdown.estimateCount} items)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {summary.syncBreakdown.pendingCount > 0 ? (
              <span className="text-amber-700 dark:text-amber-300 font-medium">
                {summary.syncBreakdown.pendingCount} entry(s) pending cloud sync
              </span>
            ) : summary.syncBreakdown.cachedOfflineCount > 0 ? (
              <span className="text-slate-500 font-medium">
                Viewing {summary.syncBreakdown.cachedOfflineCount} locally cached record(s)
              </span>
            ) : (
              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                All {dayEntries.length} diary entries confirmed by cloud
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 3. Food Diary Sections by Meal */}
      <div className="space-y-4">
        {MEAL_CONFIG.map(({ type, label, timeHint, icon: MealIcon }) => {
          const mealEntries = dayEntries.filter((e) => e.mealType === type);
          const subtotal = summary.mealSubtotals[type];

          return (
            <section
              key={type}
              aria-label={`${label} food diary`}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden"
            >
              {/* Meal Section Header */}
              <div className="flex items-center justify-between gap-2 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
                    <MealIcon className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">
                        {label}
                      </h2>
                      <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        {subtotal.calories} kcal
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {mealEntries.length === 0
                        ? timeHint
                        : `${subtotal.proteinGrams}g P • ${subtotal.carbsGrams}g C • ${subtotal.fatGrams}g F`}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenAddFood(type)}
                  className="inline-flex items-center gap-1 rounded-xl bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add {label}</span>
                </button>
              </div>

              {/* Meal Entries List */}
              {mealEntries.length === 0 ? (
                <div className="px-5 py-6 text-center text-xs text-slate-400 dark:text-slate-500 flex flex-col items-center gap-2">
                  <Utensils className="h-5 w-5 opacity-40" />
                  <span>No food logged for {label.toLowerCase()} on this date.</span>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {mealEntries.map((entry) => {
                    const isConfirmingDelete = confirmDeleteId === entry.id;
                    const isDuplicating = duplicatingId === entry.id;

                    return (
                      <li
                        key={entry.id}
                        className="px-5 py-3.5 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-mono text-slate-400 dark:text-slate-500">
                                {entry.loggedAt}
                              </span>
                              <span className="font-semibold text-sm text-slate-900 dark:text-white">
                                {entry.name}
                              </span>
                              {entry.brand && (
                                <span className="text-xs text-slate-500">({entry.brand})</span>
                              )}
                              <DataQualityBadge quality={entry.dataQuality} />
                              <RecordSyncBadge
                                syncState={entry._meta?.syncState}
                                compact
                              />
                            </div>

                            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
                              <span>{entry.servingDescription}</span>
                              <span>•</span>
                              <span className="text-sky-700 dark:text-sky-400 font-medium">
                                {entry.nutrition.proteinGrams}g P
                              </span>
                              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                                {entry.nutrition.carbsGrams}g C
                              </span>
                              <span className="text-violet-700 dark:text-violet-400 font-medium">
                                {entry.nutrition.fatGrams}g F
                              </span>
                              {entry.notes && (
                                <span className="italic text-slate-400">“{entry.notes}”</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right mr-1">
                              <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                                {entry.nutrition.calories}
                              </div>
                              <div className="text-[10px] text-slate-400">kcal</div>
                            </div>

                            {/* Edit Button */}
                            <button
                              type="button"
                              onClick={() => onEditFoodEntry(entry)}
                              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition"
                              aria-label={`Edit ${entry.name}`}
                              title="Edit entry"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>

                            {/* Duplicate Button */}
                            <button
                              type="button"
                              onClick={() =>
                                setDuplicatingId(isDuplicating ? null : entry.id)
                              }
                              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-emerald-600 transition"
                              aria-label={`Duplicate ${entry.name}`}
                              title="Duplicate entry"
                            >
                              <Copy className="h-4 w-4" />
                            </button>

                            {/* Delete Button */}
                            {!isConfirmingDelete ? (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(entry.id)}
                                className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 dark:hover:bg-rose-950/60 hover:text-rose-600 transition"
                                aria-label={`Delete ${entry.name}`}
                                title="Delete entry"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            ) : (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setConfirmDeleteId(null);
                                    await removeFoodEntry(entry);
                                  }}
                                  className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700"
                                >
                                  Confirm Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="rounded-lg bg-slate-200 dark:bg-slate-700 px-2 py-1 text-xs font-medium"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Duplicate Target Bar */}
                        {isDuplicating && (
                          <div className="mt-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 p-2.5 flex items-center justify-between gap-2 flex-wrap text-xs">
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              Duplicate "{entry.name}" to:
                            </span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {(['breakfast', 'lunch', 'dinner', 'snacks'] as MealType[]).map(
                                (targetMeal) => (
                                  <button
                                    key={targetMeal}
                                    type="button"
                                    onClick={async () => {
                                      setDuplicatingId(null);
                                      await duplicateEntry(entry, selectedDate, targetMeal);
                                    }}
                                    className="rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 px-2.5 py-1 font-semibold capitalize hover:border-emerald-500"
                                  >
                                    {targetMeal}
                                  </button>
                                )
                              )}
                              {!isToday && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setDuplicatingId(null);
                                    await duplicateEntry(entry, todayStr, entry.mealType);
                                  }}
                                  className="rounded-lg bg-emerald-600 text-white px-2.5 py-1 font-semibold"
                                >
                                  Copy to Today
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};

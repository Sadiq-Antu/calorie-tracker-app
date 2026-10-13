import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Flame,
  TrendingUp,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { calculateDailySummary } from '../utils/nutritionCalculator';
import {
  formatFullDateSubheading,
  formatReadableDate,
  getTodayDateString,
  shiftDateString,
} from '../utils/dateUtils';

export interface HistoryViewProps {
  onSelectDateForDiary: (dateStr: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  onSelectDateForDiary,
}) => {
  const { foodEntries, profile } = useApp();
  const [rangeDays, setRangeDays] = useState<7 | 14 | 30>(14);

  const todayStr = getTodayDateString();
  const calorieGoal = profile?.dailyCalorieGoal ?? 2000;
  const macroGoals = profile?.macroGoals ?? {
    proteinGrams: 140,
    carbsGrams: 200,
    fatGrams: 65,
  };

  // Collect dates in the selected lookback window plus any older dates that have logged entries
  const dailySummaries = useMemo(() => {
    const dateSet = new Set<string>();
    for (let i = 0; i < rangeDays; i++) {
      dateSet.add(shiftDateString(todayStr, -i));
    }
    for (const entry of foodEntries) {
      dateSet.add(entry.date);
    }

    const sortedDates = Array.from(dateSet)
      .sort((a, b) => b.localeCompare(a))
      .slice(0, rangeDays);

    return sortedDates.map((d) => ({
      date: d,
      summary: calculateDailySummary(d, foodEntries, calorieGoal, macroGoals),
      entryCount: foodEntries.filter((e) => e.date === d).length,
    }));
  }, [foodEntries, rangeDays, todayStr, calorieGoal, macroGoals]);

  const loggedDays = useMemo(
    () => dailySummaries.filter((d) => d.entryCount > 0),
    [dailySummaries]
  );

  const averages = useMemo(() => {
    if (loggedDays.length === 0) {
      return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    }
    const totalCal = loggedDays.reduce((acc, d) => acc + d.summary.consumed.calories, 0);
    const totalP = loggedDays.reduce((acc, d) => acc + d.summary.consumed.proteinGrams, 0);
    const totalC = loggedDays.reduce((acc, d) => acc + d.summary.consumed.carbsGrams, 0);
    const totalF = loggedDays.reduce((acc, d) => acc + d.summary.consumed.fatGrams, 0);

    return {
      calories: Math.round(totalCal / loggedDays.length),
      protein: Math.round(totalP / loggedDays.length),
      carbs: Math.round(totalC / loggedDays.length),
      fat: Math.round(totalF / loggedDays.length),
    };
  }, [loggedDays]);

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
            Food Diary History
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Review previous days’ food diaries, macro totals, and goal adherence.
          </p>
        </div>

        <div className="inline-flex rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1">
          {([7, 14, 30] as const).map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setRangeDays(days)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                rangeDays === days
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Last {days} Days
            </button>
          ))}
        </div>
      </div>

      {/* Averages Overview Card */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-xs">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-emerald-500" />
            <span>Active Diary Days</span>
          </div>
          <div className="mt-1 text-xl font-extrabold text-slate-900 dark:text-white">
            {loggedDays.length} / {rangeDays}
          </div>
          <div className="text-[11px] text-slate-400">days with logged meals</div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-xs">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Flame className="h-3.5 w-3.5 text-emerald-500" />
            <span>Avg Daily Calories</span>
          </div>
          <div className="mt-1 text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {averages.calories} kcal
          </div>
          <div className="text-[11px] text-slate-400">Target: {calorieGoal} kcal</div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-xs">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-sky-500" />
            <span>Avg Daily Protein</span>
          </div>
          <div className="mt-1 text-xl font-extrabold text-sky-600 dark:text-sky-400">
            {averages.protein}g
          </div>
          <div className="text-[11px] text-slate-400">Target: {macroGoals.proteinGrams}g</div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-xs">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-violet-500" />
            <span>Avg Carbs / Fat</span>
          </div>
          <div className="mt-1 text-xl font-extrabold text-slate-900 dark:text-white">
            {averages.carbs}g / {averages.fat}g
          </div>
          <div className="text-[11px] text-slate-400">
            Targets: {macroGoals.carbsGrams}g / {macroGoals.fatGrams}g
          </div>
        </div>
      </div>

      {/* Day-by-Day List */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-500">
          Daily Breakdown (Click any day to view or edit its diary)
        </div>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {dailySummaries.map(({ date, summary, entryCount }) => (
            <li key={date}>
              <button
                type="button"
                onClick={() => onSelectDateForDiary(date)}
                className="w-full text-left px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition flex items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                      {formatReadableDate(date, todayStr)}
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatFullDateSubheading(date)}
                    </span>
                  </div>

                  {entryCount === 0 ? (
                    <p className="text-xs text-slate-400 mt-1">
                      No meals logged on this day — click to add entries
                    </p>
                  ) : (
                    <div className="mt-1.5 flex items-center gap-3 flex-wrap text-xs">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
                      </span>
                      <span>•</span>
                      <span className="text-sky-600 dark:text-sky-400 font-medium">
                        {summary.consumed.proteinGrams}g Protein
                      </span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        {summary.consumed.carbsGrams}g Carbs
                      </span>
                      <span className="text-violet-600 dark:text-violet-400 font-medium">
                        {summary.consumed.fatGrams}g Fat
                      </span>
                      {summary.dataQualityBreakdown.estimateCount > 0 && (
                        <span className="text-amber-600 dark:text-amber-400">
                          ({summary.dataQualityBreakdown.estimateCount} estimate)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <div
                      className={`text-sm font-extrabold ${
                        entryCount === 0
                          ? 'text-slate-400'
                          : summary.isOverCalorieGoal
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {summary.consumed.calories} / {summary.calorieGoal} kcal
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {entryCount === 0
                        ? 'Empty'
                        : summary.isOverCalorieGoal
                          ? `+${summary.overCalorieAmount} kcal over`
                          : `${summary.remainingCalories} kcal remaining`}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  Calculator,
  Check,
  ChevronDown,
  ChevronUp,
  Info,
  Scale,
  Sparkles,
  Target,
  User,
} from 'lucide-react';
import {
  ActivityLevel,
  BiologicalSex,
  MeasurementSystem,
  UserProfile,
  WeightDirection,
} from '../types/domain';
import {
  calculateCaloriesFromMacros,
  calculateOptionalTargetSuggestion,
  lbsToKg,
} from '../utils/nutritionCalculator';
import { useApp } from '../context/AppContext';

const DIETARY_OPTIONS = [
  'Omnivore',
  'High-Protein',
  'Mediterranean',
  'Vegetarian',
  'Vegan',
  'Pescatarian',
  'Low-Carb',
  'Gluten-Free',
  'Dairy-Free',
];

export const OnboardingFlow: React.FC = () => {
  const { user, saveProfileAndGoals, signOutUser } = useApp();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [preferredUnits, setPreferredUnits] = useState<MeasurementSystem>('metric');

  // Primary user-controlled calorie & macro targets (never locked to a universal formula)
  const [dailyCalorieGoal, setDailyCalorieGoal] = useState<number>(2100);
  const [proteinGrams, setProteinGrams] = useState<number>(140);
  const [carbsGrams, setCarbsGrams] = useState<number>(220);
  const [fatGrams, setFatGrams] = useState<number>(70);

  // Optional Suggestion Helper State
  const [showSuggestionHelper, setShowSuggestionHelper] = useState<boolean>(false);
  const [calcAge, setCalcAge] = useState<number>(30);
  const [calcSex, setCalcSex] = useState<BiologicalSex>('prefer_not_to_say');
  const [calcHeightCm, setCalcHeightCm] = useState<number>(172);
  const [calcWeightInput, setCalcWeightInput] = useState<number>(72);
  const [calcActivity, setCalcActivity] = useState<ActivityLevel>('moderately_active');
  const [calcDirection, setCalcDirection] = useState<WeightDirection>('maintain');

  // Optional Dietary Preferences & Weight Goal
  const [selectedDiets, setSelectedDiets] = useState<string[]>([]);
  const [dietaryNotes, setDietaryNotes] = useState<string>('');
  const [enableWeightGoal, setEnableWeightGoal] = useState<boolean>(false);
  const [currentWeightInput, setCurrentWeightInput] = useState<number>(72);
  const [targetWeightInput, setTargetWeightInput] = useState<number>(68);
  const [weightDirection, setWeightDirection] = useState<WeightDirection>('lose');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const calcWeightKg = preferredUnits === 'imperial' ? lbsToKg(calcWeightInput) : calcWeightInput;
  const suggestion = calculateOptionalTargetSuggestion({
    age: calcAge,
    sex: calcSex,
    heightCm: calcHeightCm,
    weightKg: calcWeightKg,
    activityLevel: calcActivity,
    goalDirection: calcDirection,
  });

  const applySuggestion = () => {
    setDailyCalorieGoal(suggestion.suggestedCalorieGoal);
    setProteinGrams(suggestion.suggestedMacros.proteinGrams);
    setCarbsGrams(suggestion.suggestedMacros.carbsGrams);
    setFatGrams(suggestion.suggestedMacros.fatGrams);
  };

  const toggleDiet = (option: string) => {
    setSelectedDiets((prev) =>
      prev.includes(option) ? prev.filter((d) => d !== option) : [...prev, option]
    );
  };

  const macroKcalSum = calculateCaloriesFromMacros(proteinGrams, carbsGrams, fatGrams);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!user) return;
    if (!displayName.trim()) {
      setErrorMsg('Please enter a display name.');
      return;
    }
    if (dailyCalorieGoal < 500 || dailyCalorieGoal > 15000) {
      setErrorMsg('Daily calorie target must be between 500 and 15,000 kcal.');
      return;
    }
    if (proteinGrams < 0 || carbsGrams < 0 || fatGrams < 0) {
      setErrorMsg('Macronutrient targets cannot be negative.');
      return;
    }

    const nowIso = new Date().toISOString();
    const curKg =
      preferredUnits === 'imperial' ? lbsToKg(currentWeightInput) : currentWeightInput;
    const targKg =
      preferredUnits === 'imperial' ? lbsToKg(targetWeightInput) : targetWeightInput;

    const newProfile: UserProfile = {
      uid: user.uid,
      displayName: displayName.trim(),
      email: user.email,
      photoURL: user.photoURL,
      preferredUnits,
      dailyCalorieGoal: Math.round(dailyCalorieGoal),
      macroGoals: {
        proteinGrams: Math.round(proteinGrams),
        carbsGrams: Math.round(carbsGrams),
        fatGrams: Math.round(fatGrams),
      },
      dietaryPreferences: selectedDiets,
      dietaryNotes: dietaryNotes.trim(),
      weightGoal: enableWeightGoal
        ? {
            currentWeightKg: curKg,
            targetWeightKg: targKg,
            direction: weightDirection,
          }
        : null,
      optionalMetrics: showSuggestionHelper
        ? {
            age: calcAge,
            sex: calcSex,
            heightCm: calcHeightCm,
            activityLevel: calcActivity,
          }
        : null,
      themePreference: 'system',
      onboardingCompleted: true,
      schemaVersion: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    setSubmitting(true);
    try {
      await saveProfileAndGoals(newProfile);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save profile.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-10 px-4 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950 px-3 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" />
              Profile & Goal Setup
            </span>
            <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              Configure your nutrition tracker
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Enter your custom daily targets below. You can change these at any time in Settings.
            </p>
          </div>
          <button
            type="button"
            onClick={signOutUser}
            className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline"
          >
            Sign Out
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {errorMsg && (
            <div
              role="alert"
              className="rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 p-4 text-sm text-rose-800 dark:text-rose-200"
            >
              {errorMsg}
            </div>
          )}

          {/* Section 1: Identity & Units */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
              <User className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <h2>1. Profile & Measurement Units</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="onboard-display-name"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5"
                >
                  Display Name *
                </label>
                <input
                  id="onboard-display-name"
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Preferred Units *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPreferredUnits('metric')}
                    className={`rounded-xl py-2.5 px-3 text-xs font-semibold border transition ${
                      preferredUnits === 'metric'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Metric (g, ml, kg)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreferredUnits('imperial')}
                    className={`rounded-xl py-2.5 px-3 text-xs font-semibold border transition ${
                      preferredUnits === 'imperial'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Imperial (oz, lb)
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Daily Calorie & Macronutrient Goals */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <Target className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <h2>2. Daily Calorie & Macronutrient Targets</h2>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Custom targets — no universal calorie target is imposed
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="sm:col-span-1">
                <label
                  htmlFor="onboard-calorie-goal"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Daily Calories (kcal) *
                </label>
                <input
                  id="onboard-calorie-goal"
                  type="number"
                  min={500}
                  max={15000}
                  required
                  value={dailyCalorieGoal}
                  onChange={(e) => setDailyCalorieGoal(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-base font-bold text-emerald-700 dark:text-emerald-400 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="onboard-protein-goal"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Protein (g) *
                </label>
                <input
                  id="onboard-protein-goal"
                  type="number"
                  min={0}
                  max={2000}
                  required
                  value={proteinGrams}
                  onChange={(e) => setProteinGrams(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm font-semibold text-slate-900 dark:text-white"
                />
                <span className="text-[11px] text-slate-500">{proteinGrams * 4} kcal</span>
              </div>

              <div>
                <label
                  htmlFor="onboard-carbs-goal"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Carbohydrates (g) *
                </label>
                <input
                  id="onboard-carbs-goal"
                  type="number"
                  min={0}
                  max={2000}
                  required
                  value={carbsGrams}
                  onChange={(e) => setCarbsGrams(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm font-semibold text-slate-900 dark:text-white"
                />
                <span className="text-[11px] text-slate-500">{carbsGrams * 4} kcal</span>
              </div>

              <div>
                <label
                  htmlFor="onboard-fat-goal"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Fat (g) *
                </label>
                <input
                  id="onboard-fat-goal"
                  type="number"
                  min={0}
                  max={2000}
                  required
                  value={fatGrams}
                  onChange={(e) => setFatGrams(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm font-semibold text-slate-900 dark:text-white"
                />
                <span className="text-[11px] text-slate-500">{fatGrams * 9} kcal</span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/60 px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400">
              <span>
                Combined macro energy (4–4–9 formula):{' '}
                <strong className="text-slate-900 dark:text-white">{macroKcalSum} kcal</strong>
              </span>
              {Math.abs(macroKcalSum - dailyCalorieGoal) > 150 && (
                <button
                  type="button"
                  onClick={() => setDailyCalorieGoal(macroKcalSum)}
                  className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
                >
                  Match calorie goal to macros ({macroKcalSum} kcal)
                </button>
              )}
            </div>

            {/* Optional Target Suggestion Calculator with Explicit Assumptions & Limitations */}
            <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
              <button
                type="button"
                onClick={() => setShowSuggestionHelper(!showSuggestionHelper)}
                className="flex items-center justify-between w-full text-left text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                <span className="flex items-center gap-1.5">
                  <Calculator className="h-4 w-4" />
                  Need a starting reference? Open Optional Target Suggestion Calculator (Mifflin-St Jeor)
                </span>
                {showSuggestionHelper ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {showSuggestionHelper && (
                <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-4 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Age (years)
                      </label>
                      <input
                        type="number"
                        min={18}
                        max={100}
                        value={calcAge}
                        onChange={(e) => setCalcAge(Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Sex Input (for BMR equation)
                      </label>
                      <select
                        value={calcSex}
                        onChange={(e) => setCalcSex(e.target.value as BiologicalSex)}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5"
                      >
                        <option value="prefer_not_to_say">Midpoint / Unspecified</option>
                        <option value="female">Female equation (-161)</option>
                        <option value="male">Male equation (+5)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Height (cm)
                      </label>
                      <input
                        type="number"
                        min={120}
                        max={240}
                        value={calcHeightCm}
                        onChange={(e) => setCalcHeightCm(Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Weight ({preferredUnits === 'imperial' ? 'lb' : 'kg'})
                      </label>
                      <input
                        type="number"
                        min={30}
                        max={500}
                        value={calcWeightInput}
                        onChange={(e) => setCalcWeightInput(Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Activity Level
                      </label>
                      <select
                        value={calcActivity}
                        onChange={(e) => setCalcActivity(e.target.value as ActivityLevel)}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5"
                      >
                        <option value="sedentary">Sedentary (1.2×)</option>
                        <option value="lightly_active">Lightly Active (1.375×)</option>
                        <option value="moderately_active">Moderately Active (1.55×)</option>
                        <option value="very_active">Very Active (1.725×)</option>
                        <option value="extra_active">Extra Active (1.9×)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Goal Direction
                      </label>
                      <select
                        value={calcDirection}
                        onChange={(e) => setCalcDirection(e.target.value as WeightDirection)}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5"
                      >
                        <option value="maintain">Maintain Weight</option>
                        <option value="lose">Gradual Loss (-400 kcal)</option>
                        <option value="gain">Gradual Gain (+300 kcal)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white dark:bg-slate-900 p-3.5 border border-slate-200 dark:border-slate-700">
                    <div className="text-xs">
                      <span className="text-slate-500">Estimated Suggestion:</span>{' '}
                      <strong className="text-emerald-700 dark:text-emerald-400 text-sm">
                        {suggestion.suggestedCalorieGoal} kcal/day
                      </strong>{' '}
                      <span className="text-slate-600 dark:text-slate-300">
                        ({suggestion.suggestedMacros.proteinGrams}g P •{' '}
                        {suggestion.suggestedMacros.carbsGrams}g C •{' '}
                        {suggestion.suggestedMacros.fatGrams}g F)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={applySuggestion}
                      className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white transition"
                    >
                      Apply Suggestion to Fields Above
                    </button>
                  </div>

                  {/* Assumptions & Limitations Disclosure */}
                  <div className="rounded-lg bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 p-3 text-[11px] text-amber-900 dark:text-amber-200 space-y-1.5">
                    <div className="font-semibold flex items-center gap-1.5">
                      <Info className="h-3.5 w-3.5 shrink-0" />
                      <span>Assumptions & Limitations of This Suggestion</span>
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {suggestion.assumptions.map((item, idx) => (
                        <li key={`a-${idx}`}>{item}</li>
                      ))}
                      {suggestion.limitations.map((item, idx) => (
                        <li key={`l-${idx}`} className="font-medium">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Optional Dietary Preferences & Weight Goal */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <Scale className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <h2>3. Optional Dietary Preferences & Weight Goal</h2>
              </div>
              <span className="text-xs text-slate-500">Optional</span>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                Dietary Preferences (Optional)
              </label>
              <div className="flex flex-wrap gap-2">
                {DIETARY_OPTIONS.map((option) => {
                  const active = selectedDiets.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => toggleDiet(option)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition ${
                        active
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {active && <Check className="h-3 w-3" />}
                      <span>{option}</span>
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                value={dietaryNotes}
                onChange={(e) => setDietaryNotes(e.target.value)}
                placeholder="Optional dietary notes (e.g., nut allergy, low sodium)…"
                className="mt-3 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableWeightGoal}
                  onChange={(e) => setEnableWeightGoal(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>Configure an optional weight goal</span>
              </label>

              {enableWeightGoal && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Current Weight ({preferredUnits === 'imperial' ? 'lb' : 'kg'})
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={currentWeightInput}
                      onChange={(e) => setCurrentWeightInput(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Target Weight ({preferredUnits === 'imperial' ? 'lb' : 'kg'})
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={targetWeightInput}
                      onChange={(e) => setTargetWeightInput(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Goal Direction
                    </label>
                    <select
                      value={weightDirection}
                      onChange={(e) => setWeightDirection(e.target.value as WeightDirection)}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                    >
                      <option value="lose">Lose Weight</option>
                      <option value="maintain">Maintain Weight</option>
                      <option value="gain">Gain Weight</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 px-8 text-sm shadow-md transition disabled:opacity-50"
            >
              {submitting ? 'Saving Profile…' : 'Complete Setup & Open Tracker'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

import { describe, expect, it } from 'vitest';
import {
  buildImportExecutionPlan,
  createBackupPayload,
  escapeCsvCell,
  generateFoodDiaryCsv,
  serializeBackupToJson,
  validateAndPreviewBackupJson,
} from '../services/dataPortabilityService';
import { FoodEntry, UserProfile } from '../types/domain';

describe('Data Portability: JSON Backup, CSV Export & Validated Import', () => {
  const sampleProfile: UserProfile = {
    uid: 'user_1',
    displayName: 'Jordan Lee',
    email: 'jordan@example.com',
    preferredUnits: 'metric',
    dailyCalorieGoal: 2200,
    macroGoals: { proteinGrams: 160, carbsGrams: 220, fatGrams: 70 },
    onboardingCompleted: true,
    createdAt: '2026-10-13T08:00:00.000Z',
    updatedAt: '2026-10-13T08:00:00.000Z',
  };

  const sampleEntry: FoodEntry = {
    id: 'food_existing_1',
    uid: 'user_1',
    date: '2026-10-13',
    mealType: 'breakfast',
    loggedAt: '08:15',
    name: 'Scrambled Eggs, 2 Large',
    quantity: 2,
    unit: 'piece',
    servingGrams: 100,
    servingDescription: '2 eggs (100g)',
    nutrition: { calories: 155, proteinGrams: 12.6, carbsGrams: 1.1, fatGrams: 10.6 },
    dataQuality: 'verified',
    sourceType: 'reference_db',
    createdAt: '2026-10-13T08:15:00.000Z',
    updatedAt: '2026-10-13T08:15:00.000Z',
  };

  it('creates a valid v1.0.0 full backup JSON and validates it with conflict preview', () => {
    const payload = createBackupPayload({
      uid: 'user_1',
      profile: sampleProfile,
      foodEntries: [sampleEntry],
      recipes: [],
      savedMeals: [],
      weightEntries: [],
      exportType: 'full_backup',
    });

    const jsonStr = serializeBackupToJson(payload);
    expect(jsonStr).toContain('"schemaVersion": "1.0.0"');
    expect(jsonStr).toContain('"exportType": "full_backup"');

    // Validate against an account that already has `food_existing_1`
    const validation = validateAndPreviewBackupJson(jsonStr, {
      foodEntries: [sampleEntry],
      recipes: [],
      savedMeals: [],
      weightEntries: [],
    });

    expect(validation.isValid).toBe(true);
    expect(validation.preview?.incomingCounts.foodEntries).toBe(1);
    expect(validation.preview?.conflictCounts.foodEntries).toBe(1);
    expect(validation.preview?.newCounts.foodEntries).toBe(0);
  });

  it('rejects invalid JSON, unsupported schemaVersion, or malformed records', () => {
    const badJson = validateAndPreviewBackupJson('{ malformed json', {
      foodEntries: [],
      recipes: [],
      savedMeals: [],
      weightEntries: [],
    });
    expect(badJson.isValid).toBe(false);

    const unsupportedVersion = validateAndPreviewBackupJson(
      JSON.stringify({
        appName: 'NutriPulse',
        schemaVersion: '99.0.0',
        exportType: 'full_backup',
        data: {
          profile: null,
          foodEntries: [],
          recipes: [],
          savedMeals: [],
          weightEntries: [],
        },
      }),
      { foodEntries: [], recipes: [], savedMeals: [], weightEntries: [] }
    );
    expect(unsupportedVersion.isValid).toBe(false);
    expect(unsupportedVersion.errors.join(' ')).toMatch(/Unsupported backup schemaVersion/i);
  });

  it('enforces non-destructive conflict resolution unless overwrite is explicitly selected', () => {
    const newEntry: FoodEntry = {
      ...sampleEntry,
      id: 'food_new_2',
      name: 'Fresh Blueberries',
    };

    const payload = createBackupPayload({
      uid: 'old_uid',
      profile: sampleProfile,
      foodEntries: [sampleEntry, newEntry],
      recipes: [],
      savedMeals: [],
      weightEntries: [],
    });

    const existingIds = {
      foodEntries: new Set(['food_existing_1']),
      recipes: new Set<string>(),
      savedMeals: new Set<string>(),
      weightEntries: new Set<string>(),
    };

    // 1. Default skip_existing: skips `food_existing_1` and only imports `food_new_2`
    const skipPlan = buildImportExecutionPlan({
      targetUid: 'target_uid',
      payload,
      strategy: 'skip_existing',
      restoreProfileGoals: false,
      existingIds,
    });
    expect(skipPlan.foodEntriesToSave).toHaveLength(1);
    expect(skipPlan.foodEntriesToSave[0].id).toBe('food_new_2');
    expect(skipPlan.foodEntriesToSave[0].uid).toBe('target_uid');
    expect(skipPlan.summary.skippedFoodEntries).toBe(1);
    expect(skipPlan.profileToSave).toBeNull();

    // 2. keep_both: imports both, assigning a fresh ID to the conflicting item
    const keepBothPlan = buildImportExecutionPlan({
      targetUid: 'target_uid',
      payload,
      strategy: 'keep_both',
      restoreProfileGoals: true,
      existingIds,
    });
    expect(keepBothPlan.foodEntriesToSave).toHaveLength(2);
    expect(keepBothPlan.foodEntriesToSave[0].id).not.toBe('food_existing_1');
    expect(keepBothPlan.profileToSave?.uid).toBe('target_uid');
  });

  it('generates valid CSV diary exports and escapes CSV formula injection characters', () => {
    expect(escapeCsvCell('=SUM(A1:A5)')).toBe("'=SUM(A1:A5)");
    expect(escapeCsvCell('=cmd|"/c calc"!A0')).toBe('"\'=cmd|""/c calc""!A0"');
    expect(escapeCsvCell('Scrambled Eggs, 2 Large')).toBe('"Scrambled Eggs, 2 Large"');

    const csv = generateFoodDiaryCsv([sampleEntry]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Date,Time,Meal,Food Name');
    expect(lines[1]).toContain('"Scrambled Eggs, 2 Large"');
    expect(lines[1]).toContain('155');
  });
});

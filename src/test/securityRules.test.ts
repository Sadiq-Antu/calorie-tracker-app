import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateFirestoreSecurityRule } from '../services/securityRulesValidator';

describe('Firestore Security Rules & Storage Security Audit', () => {
  const validTimestamp = '2026-10-13T10:00:00.000Z';

  const validProfilePayload = {
    uid: 'user_alice',
    displayName: 'Alice',
    email: 'alice@example.com',
    preferredUnits: 'metric',
    dailyCalorieGoal: 2000,
    macroGoals: {
      proteinGrams: 140,
      carbsGrams: 200,
      fatGrams: 65,
    },
    onboardingCompleted: true,
    createdAt: validTimestamp,
    updatedAt: validTimestamp,
  };

  const validFoodEntryPayload = {
    id: 'entry_101',
    uid: 'user_alice',
    date: '2026-10-13',
    mealType: 'lunch',
    loggedAt: '12:45',
    name: 'Grilled Salmon Bowl',
    quantity: 1,
    unit: 'bowl',
    servingGrams: 350,
    servingDescription: '1 bowl (350g)',
    nutrition: {
      calories: 520,
      proteinGrams: 42,
      carbsGrams: 45,
      fatGrams: 18,
    },
    dataQuality: 'verified',
    sourceType: 'reference_db',
    createdAt: validTimestamp,
    updatedAt: validTimestamp,
  };

  it('verifies firestore.rules file exists and enforces strict ownership and schema validation', () => {
    const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
    expect(fs.existsSync(rulesPath)).toBe(true);
    const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

    expect(rulesContent).toContain("rules_version = '2';");
    expect(rulesContent).toContain('function isOwner(uid)');
    expect(rulesContent).toContain('function isValidUserProfile(data)');
    expect(rulesContent).toContain('function isValidFoodEntry(data)');
    expect(rulesContent).toContain('function isValidRecipe(data)');
    expect(rulesContent).toContain('function isValidSavedMeal(data)');
    expect(rulesContent).toContain('function isValidWeightEntry(data)');
    expect(rulesContent).toContain('allow read, write: if false;');
  });

  it('denies all unauthenticated requests across users and subcollections', () => {
    expect(
      evaluateFirestoreSecurityRule({
        auth: null,
        path: '/users/user_alice',
        method: 'read',
      }).allowed
    ).toBe(false);

    expect(
      evaluateFirestoreSecurityRule({
        auth: null,
        path: '/users/user_alice/foodEntries/entry_101',
        method: 'create',
        requestResourceData: validFoodEntryPayload,
      }).allowed
    ).toBe(false);
  });

  it('allows authenticated owner to read and write valid records', () => {
    const profileCreate = evaluateFirestoreSecurityRule({
      auth: { uid: 'user_alice' },
      path: '/users/user_alice',
      method: 'create',
      requestResourceData: validProfilePayload,
    });
    expect(profileCreate.allowed).toBe(true);

    const foodCreate = evaluateFirestoreSecurityRule({
      auth: { uid: 'user_alice' },
      path: '/users/user_alice/foodEntries/entry_101',
      method: 'create',
      requestResourceData: validFoodEntryPayload,
    });
    expect(foodCreate.allowed).toBe(true);
  });

  it('prevents cross-user access (Mallory cannot read, create, update, or delete Alice’s records)', () => {
    const crossRead = evaluateFirestoreSecurityRule({
      auth: { uid: 'user_mallory' },
      path: '/users/user_alice/foodEntries/entry_101',
      method: 'read',
    });
    expect(crossRead.allowed).toBe(false);

    const crossCreate = evaluateFirestoreSecurityRule({
      auth: { uid: 'user_mallory' },
      path: '/users/user_alice/foodEntries/entry_101',
      method: 'create',
      requestResourceData: validFoodEntryPayload,
    });
    expect(crossCreate.allowed).toBe(false);

    const crossDelete = evaluateFirestoreSecurityRule({
      auth: { uid: 'user_mallory' },
      path: '/users/user_alice',
      method: 'delete',
    });
    expect(crossDelete.allowed).toBe(false);
  });

  it('rejects malformed or out-of-range writes even from the authenticated owner', () => {
    // 1. Negative calories
    const negativeCalories = evaluateFirestoreSecurityRule({
      auth: { uid: 'user_alice' },
      path: '/users/user_alice/foodEntries/entry_101',
      method: 'create',
      requestResourceData: {
        ...validFoodEntryPayload,
        nutrition: {
          ...validFoodEntryPayload.nutrition,
          calories: -200,
        },
      },
    });
    expect(negativeCalories.allowed).toBe(false);

    // 2. Unexpected extra field injection
    const unexpectedField = evaluateFirestoreSecurityRule({
      auth: { uid: 'user_alice' },
      path: '/users/user_alice/foodEntries/entry_101',
      method: 'create',
      requestResourceData: {
        ...validFoodEntryPayload,
        isAdminHack: true,
      },
    });
    expect(unexpectedField.allowed).toBe(false);

    // 3. Invalid mealType
    const invalidMeal = evaluateFirestoreSecurityRule({
      auth: { uid: 'user_alice' },
      path: '/users/user_alice/foodEntries/entry_101',
      method: 'create',
      requestResourceData: {
        ...validFoodEntryPayload,
        mealType: 'midnight_feast',
      },
    });
    expect(invalidMeal.allowed).toBe(false);

    // 4. Out-of-bounds dailyCalorieGoal on profile
    const invalidCalorieGoal = evaluateFirestoreSecurityRule({
      auth: { uid: 'user_alice' },
      path: '/users/user_alice',
      method: 'create',
      requestResourceData: {
        ...validProfilePayload,
        dailyCalorieGoal: 100, // Below 500 minimum
      },
    });
    expect(invalidCalorieGoal.allowed).toBe(false);

    // 5. Attempting to mutate immutable uid on update
    const mutatedUidOnUpdate = evaluateFirestoreSecurityRule({
      auth: { uid: 'user_alice' },
      path: '/users/user_alice/foodEntries/entry_101',
      method: 'update',
      resourceData: validFoodEntryPayload,
      requestResourceData: {
        ...validFoodEntryPayload,
        uid: 'user_other',
      },
    });
    expect(mutatedUidOnUpdate.allowed).toBe(false);
  });

  it('verifies that localStorage is never used anywhere in the application source code', () => {
    const srcDir = path.resolve(process.cwd(), 'src');

    function getAllSourceFiles(dir: string): string[] {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'test') {
            files.push(...getAllSourceFiles(fullPath));
          }
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const sourceFiles = getAllSourceFiles(srcDir);
    expect(sourceFiles.length).toBeGreaterThan(5);

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      // Strip comments before checking for localStorage calls
      const withoutComments = content
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*/g, '');
      expect(withoutComments).not.toMatch(/localStorage\s*\./);
      expect(withoutComments).not.toMatch(/window\.localStorage/);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { InMemoryAppDataRepository } from '../services/firestoreRepository';
import { FoodEntry, FoodEntryDraft, UserProfile } from '../types/domain';

describe('CRUD Operations, UID Authorization & Offline Synchronization', () => {
  const uidAlice = 'uid_alice_001';
  const uidBob = 'uid_bob_002';

  const baseDraft: FoodEntryDraft = {
    date: '2026-10-13',
    mealType: 'breakfast',
    loggedAt: '08:30',
    name: 'Greek Yogurt & Blueberries',
    quantity: 1,
    unit: 'cup',
    servingGrams: 220,
    servingDescription: '1 cup (220g)',
    nutrition: {
      calories: 145,
      proteinGrams: 18,
      carbsGrams: 16,
      fatGrams: 1,
    },
    dataQuality: 'verified',
    sourceType: 'reference_db',
  };

  it('creates, reads, updates, duplicates, and deletes food entries for the authenticated owner', async () => {
    const repo = new InMemoryAppDataRepository();
    let latestEntries: FoodEntry[] = [];

    const unsub = repo.subscribeFoodEntries(uidAlice, (entries) => {
      latestEntries = entries;
    });

    // Create
    const createRes = await repo.createFoodEntry(uidAlice, baseDraft);
    expect(createRes.confirmedByServer).toBe(true);
    expect(createRes.syncState).toBe('confirmed');
    expect(latestEntries).toHaveLength(1);
    expect(latestEntries[0].name).toBe('Greek Yogurt & Blueberries');
    expect(latestEntries[0]._meta?.syncState).toBe('confirmed');

    const createdEntry = latestEntries[0];

    // Update
    const updateRes = await repo.updateFoodEntry(uidAlice, createdEntry.id, createdEntry, {
      quantity: 1.5,
      servingGrams: 330,
      nutrition: { calories: 218, proteinGrams: 27, carbsGrams: 24, fatGrams: 1.5 },
    });
    expect(updateRes.confirmedByServer).toBe(true);
    expect(latestEntries[0].nutrition.calories).toBe(218);

    // Duplicate to dinner
    const dupRes = await repo.duplicateFoodEntry(
      uidAlice,
      latestEntries[0],
      '2026-10-13',
      'dinner'
    );
    expect(dupRes.confirmedByServer).toBe(true);
    expect(latestEntries).toHaveLength(2);
    expect(latestEntries.some((e) => e.mealType === 'dinner')).toBe(true);

    // Delete original entry
    await repo.deleteFoodEntry(uidAlice, createdEntry.id);
    expect(latestEntries).toHaveLength(1);

    unsub();
  });

  it('isolates data by UID and blocks cross-user modification', async () => {
    const repo = new InMemoryAppDataRepository();
    let aliceEntries: FoodEntry[] = [];
    let bobEntries: FoodEntry[] = [];

    repo.subscribeFoodEntries(uidAlice, (e) => {
      aliceEntries = e;
    });
    repo.subscribeFoodEntries(uidBob, (e) => {
      bobEntries = e;
    });

    const created = await repo.createFoodEntry(uidAlice, baseDraft);
    expect(aliceEntries).toHaveLength(1);
    expect(bobEntries).toHaveLength(0);

    // Bob cannot update Alice's entry
    await expect(
      repo.updateFoodEntry(uidBob, created.data!.id, created.data!, {
        name: 'Tampered by Bob',
      })
    ).rejects.toThrow(/Unauthorized/i);
  });

  it('queues writes as pending_sync when offline and never claims cloud confirmation until reconnected', async () => {
    const repo = new InMemoryAppDataRepository();
    let aliceEntries: FoodEntry[] = [];

    repo.subscribeFoodEntries(uidAlice, (entries) => {
      aliceEntries = entries;
    });

    // Go offline
    await repo.setSimulatedOffline(true);
    expect(repo.getSyncDiagnostics().isOnline).toBe(false);

    // Log food while offline
    const offlineWrite = await repo.createFoodEntry(uidAlice, {
      ...baseDraft,
      name: 'Offline Logged Banana',
    });

    // Must NOT claim cloud confirmation while offline
    expect(offlineWrite.confirmedByServer).toBe(false);
    expect(offlineWrite.syncState).toBe('pending_sync');
    expect(repo.getSyncDiagnostics().pendingWritesCount).toBe(1);

    expect(aliceEntries).toHaveLength(1);
    expect(aliceEntries[0]._meta?.syncState).toBe('pending_sync');
    expect(aliceEntries[0]._meta?.hasPendingWrites).toBe(true);

    // Reconnect to cloud
    await repo.setSimulatedOffline(false);
    expect(repo.getSyncDiagnostics().isOnline).toBe(true);
    expect(repo.getSyncDiagnostics().pendingWritesCount).toBe(0);

    // Entry transitions to cloud confirmed
    expect(aliceEntries[0]._meta?.syncState).toBe('confirmed');
    expect(aliceEntries[0]._meta?.hasPendingWrites).toBe(false);
  });

  it('captures rejected writes in failedWrites with preserved user data instead of silently discarding', async () => {
    const repo = new InMemoryAppDataRepository();

    repo.setSimulateNextWriteRejection({
      code: 'permission-denied',
      message: 'Simulated Firestore Security Rule rejection',
    });

    await expect(repo.createFoodEntry(uidAlice, baseDraft)).rejects.toThrow(
      /Simulated Firestore Security Rule rejection/
    );

    const diag = repo.getSyncDiagnostics();
    expect(diag.failedWrites).toHaveLength(1);
    expect(diag.failedWrites[0].errorCode).toBe('permission-denied');
    expect(diag.failedWrites[0].preservedData).toEqual(baseDraft);

    // Dismiss failure after inspection
    repo.dismissFailedWrite(diag.failedWrites[0].id);
    expect(repo.getSyncDiagnostics().failedWrites).toHaveLength(0);
  });

  it('deletes all user subcollections and profile document during account deletion', async () => {
    const repo = new InMemoryAppDataRepository(uidAlice, '2026-10-13');
    let profileState: UserProfile | null = null;
    let foodState: FoodEntry[] = [];

    repo.subscribeUserProfile(uidAlice, (p) => {
      profileState = p;
    });
    repo.subscribeFoodEntries(uidAlice, (f) => {
      foodState = f;
    });

    expect(profileState).not.toBeNull();
    expect(foodState.length).toBeGreaterThan(0);

    const { deletedCount } = await repo.deleteAllUserData(uidAlice);
    expect(deletedCount).toBeGreaterThanOrEqual(8);
    expect(profileState).toBeNull();
    expect(foodState).toHaveLength(0);
  });
});

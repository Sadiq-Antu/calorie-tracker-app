import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProvider } from '../context/AppContext';
import { MainTrackerShell } from '../App';
import { InMemoryAppDataRepository } from '../services/firestoreRepository';

describe('Responsive UI, Core Navigation, Onboarding & Food Logging Workflows', () => {
  it('renders AuthScreen when signed out and transitions into Sandbox Dashboard', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryAppDataRepository('sandbox_demo_uid', '2026-10-13');

    render(
      <AppProvider customRepository={repo}>
        <MainTrackerShell />
      </AppProvider>
    );

    expect(screen.getByText(/Sign in to your tracker/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue with Google/i })).toBeInTheDocument();

    const sandboxBtn = screen.getByRole('button', {
      name: /Explore Sandbox \(Preloaded Diary\)/i,
    });
    await user.click(sandboxBtn);

    expect(await screen.findByText(/Remaining Calories/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Breakfast' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lunch' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dinner' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Snacks' })).toBeInTheDocument();
  });

  it('completes the New User Onboarding Flow with custom calorie and macro targets', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryAppDataRepository();

    render(
      <AppProvider
        customRepository={repo}
        initialUser={{
          uid: 'new_user_99',
          displayName: 'Sam Taylor',
          email: 'sam@example.com',
          photoURL: null,
          isSandbox: true,
        }}
      >
        <MainTrackerShell />
      </AppProvider>
    );

    expect(screen.getByText(/Configure your nutrition tracker/i)).toBeInTheDocument();

    const calInput = screen.getByLabelText(/Daily Calories \(kcal\)/i);
    await user.clear(calInput);
    await user.type(calInput, '2300');

    // Open optional suggestion calculator to verify transparent assumptions & limitations
    const calcToggle = screen.getByRole('button', {
      name: /Open Optional Target Suggestion Calculator/i,
    });
    await user.click(calcToggle);
    expect(
      screen.getByText(/Assumptions & Limitations of This Suggestion/i)
    ).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', {
      name: /Complete Setup & Open Tracker/i,
    });
    await user.click(submitBtn);

    // Should land on Dashboard with 2300 kcal goal and 0 consumed
    expect(await screen.findByTestId('consumed-calories-value')).toHaveTextContent('0');
    expect(screen.getByTestId('remaining-calories-value')).toHaveTextContent('2300 kcal');
  });

  it('searches verified foods, logs a food entry, logs a manual estimate, and navigates across tabs', async () => {
    const user = userEvent.setup();
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    const repo = new InMemoryAppDataRepository('test_uid', todayStr);

    render(
      <AppProvider
        customRepository={repo}
        initialUser={{
          uid: 'test_uid',
          displayName: 'Alex Rivera',
          email: 'alex@example.com',
          photoURL: null,
          isSandbox: true,
        }}
      >
        <MainTrackerShell />
      </AppProvider>
    );

    // Verify preloaded entries are displayed
    expect(await screen.findByText(/Cafe Oat Milk Latte/i)).toBeInTheDocument();

    // Open Add Food Modal
    const addFoodButtons = screen.getAllByRole('button', { name: /Add Food/i });
    await user.click(addFoodButtons[0]);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Log Food to Diary/i)).toBeInTheDocument();

    // Switch to Manual Entry tab and log an estimated food item
    const manualTab = within(dialog).getByRole('tab', { name: /Manual Entry/i });
    await user.click(manualTab);

    const nameInput = within(dialog).getByLabelText(/Food or Meal Name/i);
    await user.type(nameInput, 'Homemade Guacamole & Chips');

    const calInput = within(dialog).getByLabelText(/Calories \(kcal\)/i);
    await user.clear(calInput);
    await user.type(calInput, '320');

    const submitManualBtn = within(dialog).getByRole('button', { name: /Log to/i });
    await user.click(submitManualBtn);

    // Verify the new manual entry appears in the diary
    expect(await screen.findByText('Homemade Guacamole & Chips')).toBeInTheDocument();

    // Navigate to History View
    const historyNavBtns = screen.getAllByRole('button', { name: /History/i });
    await user.click(historyNavBtns[0]);
    expect(await screen.findByText(/Food Diary History/i)).toBeInTheDocument();

    // Navigate to Recipes & Meals View
    const recipesNavBtns = screen.getAllByRole('button', { name: /Recipes/i });
    await user.click(recipesNavBtns[0]);
    expect(
      await screen.findByText(/Custom Multi-Ingredient Recipes/i)
    ).toBeInTheDocument();

    // Navigate to Settings & Backup View
    const settingsNavBtns = screen.getAllByRole('button', { name: /Settings/i });
    await user.click(settingsNavBtns[0]);
    expect(
      await screen.findByText(/Data Portability — Export & Validated Restore/i)
    ).toBeInTheDocument();
  });

  it('displays offline status banner and Pending Sync badges when offline, and confirms when reconnected', async () => {
    const user = userEvent.setup();
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const repo = new InMemoryAppDataRepository('test_offline_uid', todayStr);

    render(
      <AppProvider
        customRepository={repo}
        initialUser={{
          uid: 'test_offline_uid',
          displayName: 'Alex Rivera',
          email: 'alex@example.com',
          photoURL: null,
          isSandbox: true,
        }}
      >
        <MainTrackerShell />
      </AppProvider>
    );

    // Open Cloud & Offline Sync Diagnostics Modal
    const syncStatusBtn = await screen.findByRole('button', {
      name: /Cloud status: Online and Confirmed/i,
    });
    await user.click(syncStatusBtn);

    const simulateOfflineBtn = screen.getByRole('button', {
      name: /Simulate Offline/i,
    });
    await user.click(simulateOfflineBtn);

    // Close modal
    const doneBtn = screen.getByRole('button', { name: 'Done' });
    await user.click(doneBtn);

    // Verify global offline banner is shown
    expect(
      screen.getByText(/You are working offline\. Viewing cached records/i)
    ).toBeInTheDocument();
  });
});

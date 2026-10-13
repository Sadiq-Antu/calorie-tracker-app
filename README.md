# NutriPulse — Calorie & Macronutrient Tracker PWA (Phase 1 MVP)

A cloud-first, offline-capable, installable Progressive Web App (PWA) for tracking daily calories, macronutrients (protein, carbohydrates, fat), custom multi-ingredient recipes, saved meals, and body weight. Built with **React 18**, **TypeScript**, **Tailwind CSS**, **Firebase Authentication**, and **Cloud Firestore**.

---

## 1. Architecture & Core Design Principles

- **Cloud-First with Native Firestore Offline Persistence**:
  - Uses Cloud Firestore (`firebase/firestore`) as the single authoritative database and synchronization engine.
  - Deliberately configures `initializeFirestore` with `persistentLocalCache({ tabManager: persistentMultipleTabManager() })` backed by IndexedDB, with automatic graceful fallback to `memoryLocalCache()` if a browser environment blocks IndexedDB (e.g., strict private browsing).
  - Does **not** create a conflicting secondary offline database or custom sync engine alongside Firestore.
- **Zero `localStorage` Usage**:
  - `localStorage` is never used for application data, user preferences, theme settings, API keys, authentication state, or database persistence.
  - Firebase Authentication is initialized explicitly with `indexedDBLocalPersistence` and `inMemoryPersistence`.
- **Honest Cloud vs. Offline State Indicators**:
  - Every record tracks its real-time Firestore snapshot metadata (`hasPendingWrites` and `fromCache`):
    - **Confirmed by Cloud (`confirmed`)**: Acknowledged by Cloud Firestore servers (`hasPendingWrites === false` and `fromCache === false`).
    - **Pending Cloud Sync (`pending_sync`)**: Queued locally in IndexedDB while offline (`hasPendingWrites === true`). NutriPulse never claims an offline write is confirmed by the cloud until server acknowledgment arrives.
    - **Cached Locally (`cached_offline`)**: Loaded from local IndexedDB cache while offline (`fromCache === true`).
    - **Sync Error (`sync_error`)**: Captures rejected writes in `failedWrites` with the preserved user payload so data is never silently discarded.
- **Verified Nutrition vs. User Estimate Distinction**:
  - Clearly badges whether a food entry comes from the **Verified Reference Database** (`verified` — USDA FoodData Central SR Legacy / Foundation Foods), a **Package Nutrition Facts Label** (`verified_label`), a **User Estimate** (`user_estimate`), or a future **Phase 2 AI Estimate** (`ai_estimate`).
  - Daily totals are computed dynamically from individual entries (`calculateDailySummary`) rather than storing redundant/inconsistent copies of daily totals.
- **Phase 2 AI Food Recognition Ready**:
  - Includes a pluggable `FoodRecognitionProvider` contract and `aiFoodRecognitionRegistry` (`src/services/aiFoodRecognitionService.ts`) plus `sourceType: 'ai_recognition'` and `aiMetadata` schema support so Phase 2 camera/LLM food recognition plugs directly into the food logging pipeline without rewriting Firestore schemas, calculations, or diary UI.

---

## 2. Project Structure

```text
├── public/
│   ├── icons/
│   │   ├── icon-192.svg              # 192x192 PWA icon
│   │   ├── icon-512.svg              # 512x512 PWA icon
│   │   └── maskable-icon.svg         # 512x512 maskable PWA icon
│   ├── manifest.webmanifest          # Installable PWA manifest & shortcuts
│   ├── offline.html                  # Offline navigation fallback page
│   └── sw.js                         # Versioned Service Worker (bypasses Firebase API traffic)
├── src/
│   ├── components/
│   │   ├── AuthScreen.tsx            # Google Sign-In & Local Evaluation Sandbox entry
│   │   ├── DailyDashboard.tsx        # Date strip, calorie ring, macro bars & meal diary
│   │   ├── FoodEntryModal.tsx        # Verified search, recent foods, manual entry, recipes & AI slot
│   │   ├── HistoryView.tsx           # Multi-day diary history & adherence summary
│   │   ├── OnboardingFlow.tsx        # Initial profile & custom target configuration
│   │   ├── RecipesAndMealsView.tsx   # Multi-ingredient recipe builder, saved meals & weight log
│   │   ├── SettingsAndPortabilityView.tsx # Goals, theme, JSON/CSV export, validated import & account deletion
│   │   └── SyncStatusBadge.tsx       # Cloud/offline badges & Sync Diagnostics modal
│   ├── context/
│   │   └── AppContext.tsx            # Auth lifecycle, real-time Firestore subscriptions & CRUD actions
│   ├── data/
│   │   └── referenceFoods.ts         # Verified USDA FoodData Central reference items & household units
│   ├── services/
│   │   ├── aiFoodRecognitionService.ts # Phase 2 AI recognition provider interface & registry
│   │   ├── dataPortabilityService.ts # Full JSON backup, CSV diary export & validated import engine
│   │   ├── firebaseConfig.ts         # Firebase Auth & Firestore IndexedDB cache initialization
│   │   ├── firestoreRepository.ts    # Firestore & In-Memory repository implementations
│   │   ├── pwaService.ts             # Service Worker registration, update notifications & install prompt
│   │   └── securityRulesValidator.ts # Programmatic evaluator mirroring firestore.rules
│   ├── test/
│   │   ├── setup.ts
│   │   ├── nutritionCalculations.test.ts
│   │   ├── crudAndOfflineSync.test.ts
│   │   ├── securityRules.test.ts
│   │   ├── importExportValidation.test.ts
│   │   └── uiAndNavigation.test.tsx
│   ├── types/
│   │   └── domain.ts                 # Strict TypeScript contracts for all models
│   ├── utils/
│   │   ├── dateUtils.ts              # Timezone-safe YYYY-MM-DD diary navigation utilities
│   │   └── nutritionCalculator.ts    # Unit conversion, macro scaling, daily totals & Mifflin-St Jeor helper
│   ├── App.tsx                       # Responsive desktop/mobile shell
│   ├── index.css                     # Tailwind CSS styles
│   └── main.tsx                      # Application entry point
├── .env.example                      # Template for Firebase environment variables
├── firebase.json                     # Firebase Hosting, Firestore rules/indexes & Emulator config
├── firestore.indexes.json            # Composite indexes for foodEntries & weightEntries
├── firestore.rules                   # Restrictive production Firestore Security Rules
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 3. Environment & Local Setup Instructions

### Prerequisites
- **Node.js** v18+ (tested on Node v24.16.0)
- **npm** v9+

### Installation & Running Locally
1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment variables:
   - Copy `.env.example` to `.env.local`:
     ```bash
     cp .env.example .env.local
     ```
   - Fill in your Firebase Web App credentials in `.env.local`:
     ```env
     VITE_FIREBASE_API_KEY=your_api_key
     VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
     VITE_FIREBASE_PROJECT_ID=your-project-id
     VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
     VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
     VITE_FIREBASE_APP_ID=your_app_id
     ```
   - *Note*: If `.env.local` is not configured yet, NutriPulse remains runnable out of the box and offers an **Interactive Sandbox Mode** on the sign-in screen so you can inspect and test all workflows immediately without hardcoded credentials.
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Build for production:
   ```bash
   npm run build
   npm run preview
   ```
5. Run automated tests:
   ```bash
   npm test
   ```

---

## 4. Required Firebase Console Configuration

To deploy NutriPulse with a live Firebase backend, complete these steps in the [Firebase Console](https://console.firebase.google.com/):

1. **Create a Firebase Project** and register a **Web App** (`</>`). Copy the configuration values into `.env.local`.
2. **Enable Google Authentication**:
   - Navigate to **Build → Authentication → Sign-in method**.
   - Enable the **Google** provider, configure your project's public-facing support email, and save.
   - Under **Authentication → Settings → Authorized domains**, ensure `localhost` (for local development) and your production domain (e.g., `your-project.web.app`) are listed.
3. **Create a Cloud Firestore Database**:
   - Navigate to **Build → Firestore Database** and click **Create database**.
   - Select **Standard / Native mode** and choose a location close to your users.
4. **Deploy Security Rules & Indexes**:
   - Install `firebase-tools` (`npm install -g firebase-tools`), authenticate (`firebase login`), and deploy the restrictive rules and composite indexes:
     ```bash
     firebase deploy --only firestore:rules,firestore:indexes
     ```

---

## 5. Firestore Schema & Security Rules (`firestore.rules`)

All private user records are strictly scoped under `/users/{uid}` where `request.auth.uid == uid`:

- `users/{uid}` — User profile, measurement units (`metric` | `imperial`), daily calorie target (`500..15000`), macro goals (`proteinGrams`, `carbsGrams`, `fatGrams`), optional dietary preferences, optional weight goal, and theme preference.
- `users/{uid}/foodEntries/{entryId}` — Individual food logs with `date` (`YYYY-MM-DD`), `mealType` (`breakfast` | `lunch` | `dinner` | `snacks`), `loggedAt`, `name`, `quantity`, `unit`, `servingGrams`, `nutrition` map, `dataQuality`, and `sourceType`.
- `users/{uid}/recipes/{recipeId}` — Multi-ingredient custom recipes with `servingsCount`, `totalWeightGrams`, `ingredients`, and `nutritionPerServing`.
- `users/{uid}/savedMeals/{mealId}` — Reusable custom foods and meal templates.
- `users/{uid}/weightEntries/{entryId}` — Historical body weight entries (`date`, `weightKg`).

**Security Rule Enforcements**:
- Rejects all unauthenticated access (`request.auth != null`).
- Rejects cross-user reads, creates, updates, or deletes (`request.auth.uid == uid`).
- Validates required keys (`hasAll`), allowed keys (`hasOnly` — blocking arbitrary field injection), string lengths, enum values, and non-negative numeric bounds on every `create` and `update`.
- Enforces immutability of `uid` and `id` fields on document updates.
- Denies all other paths by default (`match /{document=**} { allow read, write: if false; }`).

---

## 6. Account Deletion & Data Cleanup

Deleting a Firebase Authentication account (`deleteUser(user)`) does **not** automatically delete documents in Cloud Firestore. NutriPulse handles both operations in `deleteAccountAndAllData`:
1. Iterates through all user subcollections (`foodEntries`, `recipes`, `savedMeals`, `weightEntries`) and deletes all documents in batches (`writeBatch`), followed by deleting the root `users/{uid}` profile document.
2. Deletes the Firebase Authentication user record (`deleteUser`), prompting Google re-authentication (`reauthenticateWithPopup`) if Firebase returns `auth/requires-recent-login`.

---

## 7. PWA Installation & Deployment Instructions

### Installing as a PWA
- **Desktop (Chrome / Edge)**: Open the deployed HTTPS URL (or `localhost`), click the **Install NutriPulse** icon in the browser address bar (or click **Install App** in **Settings & Backup**).
- **iOS / iPadOS (Safari)**: Tap the **Share** button and select **Add to Home Screen**.
- **Android (Chrome)**: Tap **Install App** when prompted or open the browser menu (`⋮`) and tap **Add to Home screen / Install app**.

### Deploying to Firebase Hosting
```bash
npm run build
firebase deploy --only hosting,firestore:rules,firestore:indexes
```
`firebase.json` is pre-configured to serve `dist/`, set `Cache-Control: no-cache, no-store, must-revalidate` on `/sw.js` so versioned Service Worker updates propagate immediately, and rewrite SPA routes to `/index.html`.

---

## 8. Known Limitations & Phase 2 Roadmap

- **First-Visit Connectivity**: The initial visit and initial Google Sign-In require an active internet connection.
- **Browser Storage Caveats**: Clearing browser site data, using strict private/incognito browsing, or disabling IndexedDB causes NutriPulse to fall back to in-memory caching (`memory_fallback`), which is clearly surfaced in the **Cloud & Offline Synchronization Status** modal.
- **Reference Food Catalog Scope**: Phase 1 ships with a curated, verified USDA FoodData Central staple food catalog plus custom food/recipe creation. Barcode scanning and external live food APIs are out of scope for Phase 1.
- **Phase 2 AI Food Recognition**: Photo and natural-language AI meal recognition will be implemented in Phase 2 using the pre-built `FoodRecognitionProvider` interface (`src/services/aiFoodRecognitionService.ts`) and `aiMetadata` schema fields.

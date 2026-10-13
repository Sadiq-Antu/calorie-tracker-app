import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  inMemoryPersistence,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  Firestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { PersistenceSupportMode } from '../types/domain';

export interface FirebaseEnvironmentConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  useEmulator: boolean;
  authEmulatorHost: string;
  firestoreEmulatorHost: string;
  firestoreEmulatorPort: number;
}

export function getFirebaseEnvConfig(): FirebaseEnvironmentConfig {
  const env = import.meta.env ?? {};
  return {
    apiKey: (env.VITE_FIREBASE_API_KEY || '').trim(),
    authDomain: (env.VITE_FIREBASE_AUTH_DOMAIN || '').trim(),
    projectId: (env.VITE_FIREBASE_PROJECT_ID || '').trim(),
    storageBucket: (env.VITE_FIREBASE_STORAGE_BUCKET || '').trim(),
    messagingSenderId: (env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim(),
    appId: (env.VITE_FIREBASE_APP_ID || '').trim(),
    useEmulator: String(env.VITE_USE_FIREBASE_EMULATOR || '').toLowerCase() === 'true',
    authEmulatorHost: (env.VITE_FIREBASE_AUTH_EMULATOR_HOST || 'http://127.0.0.1:9099').trim(),
    firestoreEmulatorHost: (env.VITE_FIRESTORE_EMULATOR_HOST || '127.0.0.1').trim(),
    firestoreEmulatorPort: Number(env.VITE_FIRESTORE_EMULATOR_PORT || 8080),
  };
}

export function isFirebaseConfigured(): boolean {
  const cfg = getFirebaseEnvConfig();
  return Boolean(cfg.apiKey && cfg.projectId && cfg.authDomain && cfg.appId);
}

export interface InitializedFirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  googleProvider: GoogleAuthProvider;
  persistenceMode: PersistenceSupportMode;
  persistenceWarning?: string;
}

let cachedServices: InitializedFirebaseServices | null = null;

/**
 * Initializes Firebase Authentication and Cloud Firestore with deliberate IndexedDB
 * persistent caching (`persistentLocalCache` + `persistentMultipleTabManager`).
 *
 * Strictly avoids `localStorage` for authentication or database persistence.
 * Gracefully falls back to `memoryLocalCache()` if the browser blocks IndexedDB
 * (e.g., strict private browsing or unsupported browser environments).
 */
export function initializeFirebaseServices(): InitializedFirebaseServices | null {
  if (cachedServices) {
    return cachedServices;
  }

  if (!isFirebaseConfigured()) {
    return null;
  }

  const cfg = getFirebaseEnvConfig();
  const existingApps = getApps();
  const app =
    existingApps.length > 0
      ? existingApps[0]
      : initializeApp({
          apiKey: cfg.apiKey,
          authDomain: cfg.authDomain,
          projectId: cfg.projectId,
          storageBucket: cfg.storageBucket || undefined,
          messagingSenderId: cfg.messagingSenderId || undefined,
          appId: cfg.appId,
        });

  // Configure Firebase Auth to use ONLY IndexedDB or in-memory persistence (NEVER localStorage)
  const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, inMemoryPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });

  const googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({
    prompt: 'select_account',
  });

  let db: Firestore;
  let persistenceMode: PersistenceSupportMode = 'indexeddb_persistent';
  let persistenceWarning: string | undefined;

  const isIndexedDbSupported =
    typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

  if (isIndexedDbSupported) {
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
    } catch (err) {
      // Fallback gracefully if IndexedDB initialization fails (e.g. private mode restriction)
      db = initializeFirestore(app, {
        localCache: memoryLocalCache(),
      });
      persistenceMode = 'memory_fallback';
      persistenceWarning =
        err instanceof Error
          ? `IndexedDB persistent cache could not be initialized (${err.message}). Running with in-memory cache; offline data will not persist across tab reloads.`
          : 'Browser restricted IndexedDB storage. Running with in-memory fallback.';
    }
  } else {
    db = initializeFirestore(app, {
      localCache: memoryLocalCache(),
    });
    persistenceMode = 'memory_fallback';
    persistenceWarning =
      'IndexedDB is not supported in this browser environment. Offline persistence across reloads is unavailable.';
  }

  if (cfg.useEmulator) {
    try {
      connectAuthEmulator(auth, cfg.authEmulatorHost, { disableWarnings: true });
      connectFirestoreEmulator(db, cfg.firestoreEmulatorHost, cfg.firestoreEmulatorPort);
    } catch {
      // Emulator already connected
    }
  }

  cachedServices = {
    app,
    auth,
    db,
    googleProvider,
    persistenceMode,
    persistenceWarning,
  };

  return cachedServices;
}

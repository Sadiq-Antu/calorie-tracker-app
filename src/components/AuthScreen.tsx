import React, { useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Cloud,
  Database,
  Lock,
  Play,
  Shield,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const AuthScreen: React.FC = () => {
  const {
    signInWithGoogle,
    signInWithSandbox,
    firebaseConfigured,
    authError,
  } = useApp();

  const [signingIn, setSigningIn] = useState(false);
  const [showEnvGuide, setShowEnvGuide] = useState(!firebaseConfigured);

  const handleGoogleLogin = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/70 via-slate-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left Column: Value Proposition & Architecture Highlights */}
        <div className="lg:col-span-7 space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300/70 dark:border-emerald-800 px-3.5 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            <Activity className="h-3.5 w-3.5" />
            <span>Cloud-First • Offline-Capable • Installable PWA</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
            Fast, transparent calorie & macronutrient tracking with{' '}
            <span className="text-emerald-600 dark:text-emerald-400">NutriPulse</span>
          </h1>

          <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">
            Track daily calories, protein, carbohydrates, and fat with verified USDA reference
            foods, custom recipes, household units, and seamless offline synchronization.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
            <div className="rounded-xl bg-white dark:bg-slate-900/90 p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs">
              <div className="flex items-center gap-2 font-semibold text-sm text-slate-900 dark:text-white">
                <Shield className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>Verified vs. Estimate Clarity</span>
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Distinguishes verified USDA & nutrition-label records from user-entered estimates.
              </p>
            </div>

            <div className="rounded-xl bg-white dark:bg-slate-900/90 p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs">
              <div className="flex items-center gap-2 font-semibold text-sm text-slate-900 dark:text-white">
                <Cloud className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>Honest Offline Sync</span>
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Queues offline logs in IndexedDB and clearly badges pending writes until server confirmation.
              </p>
            </div>

            <div className="rounded-xl bg-white dark:bg-slate-900/90 p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs">
              <div className="flex items-center gap-2 font-semibold text-sm text-slate-900 dark:text-white">
                <Lock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>UID-Scoped Security</span>
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Strict Firestore Security Rules isolate your records and validate every field on write.
              </p>
            </div>

            <div className="rounded-xl bg-white dark:bg-slate-900/90 p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs">
              <div className="flex items-center gap-2 font-semibold text-sm text-slate-900 dark:text-white">
                <Database className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>Full Data Portability</span>
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Export restorable JSON backups or CSV spreadsheets, and restore with conflict preview.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Sign-In Card */}
        <div className="lg:col-span-5">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Sign in to your tracker
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Your nutrition diary is privately scoped to your authenticated account.
              </p>
            </div>

            {authError && (
              <div
                role="alert"
                className="rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 p-3.5 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2.5"
              >
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div>{authError}</div>
              </div>
            )}

            {/* Primary Google Sign-In Button */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={signingIn}
              className="w-full flex items-center justify-center gap-3 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold py-3.5 px-4 text-sm shadow-xs transition disabled:opacity-50"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span>{signingIn ? 'Connecting to Google…' : 'Continue with Google'}</span>
            </button>

            {/* Environment Status & Local Evaluation Sandbox */}
            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-slate-800" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white dark:bg-slate-900 px-3 text-slate-400 font-medium">
                  {firebaseConfigured ? 'Or Local Sandbox' : 'Local Evaluation Mode'}
                </span>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => signInWithSandbox(true)}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-4 text-sm transition shadow-xs"
              >
                <Play className="h-4 w-4" />
                <span>Explore Sandbox (Preloaded Diary)</span>
              </button>

              <button
                type="button"
                onClick={() => signInWithSandbox(false)}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold py-2.5 px-4 text-xs transition"
              >
                <UserPlus className="h-4 w-4" />
                <span>Test New User Onboarding Flow</span>
              </button>
            </div>

            {/* Firebase Configuration Status Indicator */}
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 p-3.5 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  {firebaseConfigured ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span>Firebase Env Configured</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 text-amber-500" />
                      <span>Firebase `.env.local` Not Set</span>
                    </>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setShowEnvGuide(!showEnvGuide)}
                  className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
                >
                  {showEnvGuide ? 'Hide Setup' : 'Setup Guide'}
                </button>
              </div>

              {showEnvGuide && (
                <div className="text-slate-600 dark:text-slate-400 space-y-1.5 pt-1 border-t border-slate-200 dark:border-slate-700">
                  <p>
                    To connect to your live Firebase project, copy <code>.env.example</code> to{' '}
                    <code>.env.local</code> and add your project’s <code>VITE_FIREBASE_*</code> keys.
                  </p>
                  <p>
                    <strong>Offline Note:</strong> Your first visit and initial Google sign-in require an internet connection. Clearing browser storage or using private browsing may limit offline availability.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Clock,
  Database,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {
  DataQuality,
  RecordSyncState,
  SyncDiagnosticsState,
} from '../types/domain';

export const RecordSyncBadge: React.FC<{
  syncState?: RecordSyncState;
  compact?: boolean;
}> = ({ syncState = 'confirmed', compact = false }) => {
  if (syncState === 'pending_sync') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300/60 dark:border-amber-700/60"
        title="Queued in local IndexedDB cache. Waiting for Cloud Firestore confirmation."
      >
        <Clock className="h-3 w-3 shrink-0 animate-pulse" aria-hidden="true" />
        <span>{compact ? 'Pending Sync' : 'Pending Cloud Sync'}</span>
      </span>
    );
  }

  if (syncState === 'cached_offline') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700"
        title="Loaded from local offline cache."
      >
        <Database className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span>{compact ? 'Cached' : 'Cached Locally'}</span>
      </span>
    );
  }

  if (syncState === 'sync_error') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-300 dark:border-rose-700"
        title="Synchronization failed or rejected by server."
      >
        <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span>Sync Error</span>
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"
      title="Confirmed by Cloud Firestore server."
    >
      <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{compact ? 'Cloud Synced' : 'Confirmed by Cloud'}</span>
    </span>
  );
};

export const DataQualityBadge: React.FC<{
  quality: DataQuality;
}> = ({ quality }) => {
  if (quality === 'verified') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60"
        title="Verified nutrition values from USDA reference data."
      >
        <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span>Verified Reference</span>
      </span>
    );
  }

  if (quality === 'verified_label') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200 dark:border-teal-800/60"
        title="Entered from a package Nutrition Facts label."
      >
        <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span>Nutrition Label</span>
      </span>
    );
  }

  if (quality === 'ai_estimate') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-300 dark:border-purple-800"
        title="Estimated by AI recognition — click Edit to refine."
      >
        <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span>AI Estimate</span>
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300/70 dark:border-amber-800/60"
      title="User-entered nutrition estimate. You can edit and refine values anytime."
    >
      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>Estimate</span>
    </span>
  );
};

export const GlobalSyncStatusHeaderPill: React.FC<{
  diagnostics: SyncDiagnosticsState;
  onOpenDetails: () => void;
}> = ({ diagnostics, onOpenDetails }) => {
  const { isOnline, pendingWritesCount, failedWrites } = diagnostics;

  if (failedWrites.length > 0) {
    return (
      <button
        type="button"
        onClick={onOpenDetails}
        className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-200 dark:bg-rose-950 dark:text-rose-200 border border-rose-300 dark:border-rose-800 transition"
        aria-label="Sync error detected. Click for details."
      >
        <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
        <span>Sync Error ({failedWrites.length})</span>
      </button>
    );
  }

  if (!isOnline) {
    return (
      <button
        type="button"
        onClick={onOpenDetails}
        className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-200 dark:bg-amber-950/90 dark:text-amber-200 border border-amber-300 dark:border-amber-700 transition"
        aria-label="Offline mode active. Click for offline sync details."
      >
        <CloudOff className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
        <span>
          Offline{pendingWritesCount > 0 ? ` • ${pendingWritesCount} Pending Sync` : ' • Cached'}
        </span>
      </button>
    );
  }

  if (pendingWritesCount > 0) {
    return (
      <button
        type="button"
        onClick={onOpenDetails}
        className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1.5 text-xs font-semibold text-sky-900 dark:bg-sky-950 dark:text-sky-200 border border-sky-300 dark:border-sky-800 transition"
      >
        <RefreshCw className="h-3.5 w-3.5 animate-spin text-sky-600 dark:text-sky-400" />
        <span>Syncing ({pendingWritesCount})…</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenDetails}
      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/70 transition"
      aria-label="Cloud status: Online and Confirmed. Click for offline & sync details."
    >
      <Cloud className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
      <span className="hidden sm:inline">Cloud Confirmed</span>
      <span className="sm:hidden">Synced</span>
    </button>
  );
};

export const SyncDiagnosticsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  diagnostics: SyncDiagnosticsState;
  onDismissFailure: (id: string) => void;
  onToggleSimulatedOffline: (offline: boolean) => Promise<void>;
}> = ({
  isOpen,
  onClose,
  diagnostics,
  onDismissFailure,
  onToggleSimulatedOffline,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-modal-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4">
          <div className="flex items-center gap-2.5">
            {diagnostics.isOnline ? (
              <Cloud className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <CloudOff className="h-5 w-5 text-amber-500" />
            )}
            <h2 id="sync-modal-title" className="text-lg font-bold text-slate-900 dark:text-white">
              Cloud & Offline Synchronization Status
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close sync status dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3.5 border border-slate-200 dark:border-slate-700/70">
              <div className="text-xs text-slate-500 dark:text-slate-400">Connection State</div>
              <div className="mt-1 font-semibold flex items-center gap-1.5 text-slate-900 dark:text-white">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    diagnostics.isOnline ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                {diagnostics.isOnline ? 'Online (Cloud Connected)' : 'Offline (Local Cache Mode)'}
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3.5 border border-slate-200 dark:border-slate-700/70">
              <div className="text-xs text-slate-500 dark:text-slate-400">Queued Offline Writes</div>
              <div className="mt-1 font-semibold text-slate-900 dark:text-white">
                {diagnostics.pendingWritesCount === 0
                  ? '0 pending (All confirmed)'
                  : `${diagnostics.pendingWritesCount} awaiting cloud confirmation`}
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3.5 border border-slate-200 dark:border-slate-700/70">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Firestore Offline Persistence Engine
            </div>
            <div className="mt-1 font-semibold text-slate-900 dark:text-white">
              {diagnostics.persistenceMode === 'indexeddb_persistent'
                ? 'IndexedDB Persistent Cache Active (Multi-Tab)'
                : 'In-Memory Fallback (Browser Restricted IndexedDB)'}
            </div>
            {diagnostics.persistenceWarning && (
              <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">
                {diagnostics.persistenceWarning}
              </p>
            )}
          </div>

          {/* Failed / Rejected Writes Alert */}
          {diagnostics.failedWrites.length > 0 && (
            <div className="rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 p-4 space-y-2">
              <div className="font-semibold text-rose-900 dark:text-rose-200 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>Rejected or Failed Synchronization Writes ({diagnostics.failedWrites.length})</span>
              </div>
              <p className="text-xs text-rose-800 dark:text-rose-300">
                The following write(s) were rejected by the server. Your data payload was preserved below so nothing is silently lost:
              </p>
              <div className="space-y-2 mt-2">
                {diagnostics.failedWrites.map((fw) => (
                  <div
                    key={fw.id}
                    className="rounded-lg bg-white dark:bg-slate-900 p-2.5 border border-rose-200 dark:border-rose-800 text-xs"
                  >
                    <div className="flex items-center justify-between font-medium text-slate-900 dark:text-white">
                      <span>
                        {fw.operation.toUpperCase()} on {fw.collection}/{fw.documentId}
                      </span>
                      <button
                        type="button"
                        onClick={() => onDismissFailure(fw.id)}
                        className="text-rose-600 hover:underline"
                      >
                        Dismiss
                      </button>
                    </div>
                    <div className="text-rose-700 dark:text-rose-300 mt-0.5">{fw.errorMessage}</div>
                    {fw.preservedData !== undefined && (
                      <pre className="mt-1.5 max-h-24 overflow-auto rounded bg-slate-100 dark:bg-slate-800 p-1.5 text-[11px] text-slate-700 dark:text-slate-300">
                        {JSON.stringify(fw.preservedData, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Offline Mode Simulation Switch for Testing & Verification */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-slate-900 dark:text-white">
                Test Offline Queueing Mode
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Simulate disconnecting from Cloud Firestore to verify that new food entries are marked as “Pending Cloud Sync” and confirm automatically when reconnected.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onToggleSimulatedOffline(diagnostics.isOnline)}
              className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                diagnostics.isOnline
                  ? 'bg-amber-600 text-white hover:bg-amber-700'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {diagnostics.isOnline ? 'Simulate Offline' : 'Reconnect to Cloud'}
            </button>
          </div>

          {/* Transparent Explanation of Cloud vs Local Cache */}
          <div className="rounded-xl bg-slate-100 dark:bg-slate-800/80 p-4 space-y-2 text-xs text-slate-700 dark:text-slate-300">
            <div className="font-semibold text-slate-900 dark:text-white">
              Important Offline Availability Notes
            </div>
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <strong>First visit requires an internet connection:</strong> Initial Google sign-in and initial app-shell/database caching require network connectivity.
              </li>
              <li>
                <strong>Cloud Confirmed vs. Pending Sync:</strong> NutriPulse never claims an offline write is saved to the cloud until Cloud Firestore acknowledges the write (`hasPendingWrites: false`).
              </li>
              <li>
                <strong>Browser storage caveats:</strong> Clearing browser site data, using private/incognito browsing, or using browser configurations that block IndexedDB or Service Workers will limit or reset offline data availability.
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800 px-6 py-3.5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-900 dark:bg-slate-100 px-4 py-2 text-sm font-semibold text-white dark:text-slate-900 hover:opacity-90"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

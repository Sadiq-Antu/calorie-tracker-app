/**
 * PWA Service Worker Registration, Versioned Cache Update Manager, and Install Prompt Handler.
 */

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export interface PwaState {
  isInstallable: boolean;
  isInstalled: boolean;
  swUpdateAvailable: boolean;
  swRegistered: boolean;
}

class PwaManager {
  private deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
  private waitingWorker: ServiceWorker | null = null;
  private state: PwaState = {
    isInstallable: false,
    isInstalled: false,
    swUpdateAvailable: false,
    swRegistered: false,
  };
  private listeners = new Set<(state: PwaState) => void>();
  private initialized = false;

  init(): void {
    if (this.initialized || typeof window === 'undefined') {
      return;
    }
    this.initialized = true;

    const isStandalone =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches;

    if (isStandalone) {
      this.updateState({ isInstalled: true });
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e as BeforeInstallPromptEvent;
      this.updateState({ isInstallable: true });
    });

    window.addEventListener('appinstalled', () => {
      this.deferredInstallPrompt = null;
      this.updateState({ isInstallable: false, isInstalled: true });
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          this.updateState({ swRegistered: true });

          if (registration.waiting) {
            this.waitingWorker = registration.waiting;
            this.updateState({ swUpdateAvailable: true });
          }

          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) return;

            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                this.waitingWorker = newWorker;
                this.updateState({ swUpdateAvailable: true });
              }
            });
          });
        })
        .catch(() => {
          // Service worker registration may fail in insecure contexts or test runners
        });

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    }
  }

  private updateState(partial: Partial<PwaState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  subscribe(listener: (state: PwaState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async promptInstall(): Promise<boolean> {
    if (!this.deferredInstallPrompt) {
      return false;
    }
    await this.deferredInstallPrompt.prompt();
    const choice = await this.deferredInstallPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      this.deferredInstallPrompt = null;
      this.updateState({ isInstallable: false, isInstalled: true });
      return true;
    }
    return false;
  }

  applyUpdate(): void {
    if (this.waitingWorker) {
      this.waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
  }
}

export const pwaManager = new PwaManager();

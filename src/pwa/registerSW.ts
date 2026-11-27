const UPDATE_POLL_INTERVAL_MS = 60 * 60 * 1000;

export interface WorkboxLike {
  addEventListener: (event: string, listener: () => void) => void;
  messageSkipWaiting: () => void;
  register: () => Promise<ServiceWorkerRegistration | undefined>;
}

export interface RegisterSWDeps {
  isProd?: boolean;
  hasServiceWorker?: boolean;
  swUrl?: string;
  createWorkbox?: (swUrl: string) => WorkboxLike | Promise<WorkboxLike>;
  reload?: () => void;
  setIntervalFn?: (handler: () => void, timeout: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
}

let activeRegistrationCleanup: (() => void) | null = null;

async function defaultCreateWorkbox(swUrl: string): Promise<WorkboxLike> {
  const { Workbox } = await import("workbox-window");
  return new Workbox(swUrl) as unknown as WorkboxLike;
}

export function registerServiceWorker(
  onUpdateReady: (applyUpdate: () => Promise<void>) => void,
  deps: RegisterSWDeps = {},
): () => void {
  const isProd = deps.isProd ?? Boolean(import.meta.env?.PROD);
  const hasServiceWorker =
    deps.hasServiceWorker ?? (typeof navigator !== "undefined" && "serviceWorker" in navigator);

  if (!isProd || !hasServiceWorker) {
    return () => {};
  }

  const swUrl = deps.swUrl ?? "/sw.js";
  const createWorkbox = deps.createWorkbox ?? defaultCreateWorkbox;
  const reload =
    deps.reload ??
    (() => {
      if (typeof window !== "undefined") window.location.reload();
    });
  const setIntervalFn =
    deps.setIntervalFn ?? ((handler: () => void, ms: number) => setInterval(handler, ms));
  const clearIntervalFn =
    deps.clearIntervalFn ??
    ((handle: unknown) => clearInterval(handle as ReturnType<typeof setInterval>));

  let updateTimer: unknown;
  let disposed = false;
  let reloading = false;

  const wireWorkbox = (wb: WorkboxLike) => {
    if (disposed) return;

    const applyUpdate = async () => {
      wb.addEventListener("controlling", () => {
        if (reloading) return;
        reloading = true;
        reload();
      });
      wb.messageSkipWaiting();
    };

    wb.addEventListener("waiting", () => {
      if (!disposed) onUpdateReady(applyUpdate);
    });

    void wb
      .register()
      .then((registration) => {
        if (!registration || disposed) return;
        updateTimer = setIntervalFn(() => {
          void registration.update().catch(() => undefined);
        }, UPDATE_POLL_INTERVAL_MS);
      })
      .catch(() => undefined);
  };

  const maybeWb = createWorkbox(swUrl);
  if (maybeWb && typeof (maybeWb as Promise<WorkboxLike>).then === "function") {
    void (maybeWb as Promise<WorkboxLike>).then(wireWorkbox).catch(() => undefined);
  } else {
    wireWorkbox(maybeWb as WorkboxLike);
  }

  const cleanup = () => {
    disposed = true;
    if (updateTimer !== undefined) {
      clearIntervalFn(updateTimer);
      updateTimer = undefined;
    }
  };
  activeRegistrationCleanup = cleanup;
  return cleanup;
}

export function disposeActiveServiceWorkerPolling() {
  activeRegistrationCleanup?.();
  activeRegistrationCleanup = null;
}

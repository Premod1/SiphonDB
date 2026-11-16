export interface RequestGuard {
  isStale: () => boolean;
}

export interface LatestRequestTracker {
  next: () => RequestGuard;
  invalidate: () => void;
}

/**
 * Tracks sequential async requests so older in-flight responses can be ignored
 * once a newer request starts or the tracker is invalidated.
 */
export function createLatestRequestTracker(): LatestRequestTracker {
  let latestId = 0;

  return {
    next() {
      const id = ++latestId;
      return {
        isStale: () => id !== latestId,
      };
    },
    invalidate() {
      latestId++;
    },
  };
}

export interface Debouncer {
  schedule: (fn: () => void) => void;
  cancel: () => void;
}

/**
 * Schedules a callback after `delayMs`, cancelling any previously scheduled call.
 */
export function createDebouncer(delayMs: number): Debouncer {
  let timerId: ReturnType<typeof setTimeout> | null = null;

  return {
    schedule(fn: () => void) {
      if (timerId !== null) {
        clearTimeout(timerId);
      }
      timerId = setTimeout(() => {
        timerId = null;
        fn();
      }, delayMs);
    },
    cancel() {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    },
  };
}

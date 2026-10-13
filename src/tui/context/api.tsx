import {
  batch,
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  untrack,
  useContext,
  type Accessor,
  type ParentProps,
} from "solid-js";
import type { ApiClient } from "../../api/client";
import type { Context } from "../../context";

export interface Session {
  client: ApiClient;
  ctx: Context;
  /** Human identity shown in the header ("Ada <ada@…>" or a token name). */
  identity: string;
  orgId: string;
  contextName?: string;
}

interface ApiContext extends Session {
  /** Bumped by `r` / auto-refresh; every request re-runs when it changes. */
  readonly tick: number;
  refresh(): void;
}

const ctx = createContext<ApiContext>();

export function ApiProvider(
  props: ParentProps<{ session: Session; refreshMs?: number }>,
) {
  const [tick, setTick] = createSignal(0);
  const timer = setInterval(
    () => setTick((t) => t + 1),
    props.refreshMs ?? 15_000,
  );
  // Never keep the process alive just to refresh: inline editors finish and
  // the CLI must exit even if the Solid root isn't disposed yet.
  timer.unref?.();
  onCleanup(() => clearInterval(timer));

  const value: ApiContext = {
    ...props.session,
    get tick() {
      return tick();
    },
    refresh() {
      setTick((t) => t + 1);
    },
  };
  return <ctx.Provider value={value}>{props.children}</ctx.Provider>;
}

export function useApi(): ApiContext {
  const value = useContext(ctx);
  if (!value) throw new Error("useApi must be used within an ApiProvider");
  return value;
}

/** A request's state. `value` keeps the last good result across failures. */
export interface Request<T> {
  value: Accessor<T | undefined>;
  /** The last error, cleared by the next success. */
  error: Accessor<unknown>;
  loading: Accessor<boolean>;
  refetch(): void;
}

/**
 * Run `fetch(source())` now, whenever the source changes and on every
 * refresh tick. Unlike `createResource`, a failure never throws out of a
 * read: it only sets `error()`, so one network blip can't break a route or
 * freeze it on stale data. A new source (another id or range) clears the
 * previous value; a plain refresh keeps it on screen while in flight.
 * Returning `undefined` from `source` pauses the request.
 */
export function useAsync<S, T>(
  source: () => S | undefined,
  fetch: (source: S) => Promise<T>,
  options: { keepOnChange?: boolean } = {},
): Request<T> {
  const api = useApi();
  const [value, setValue] = createSignal<T>();
  const [error, setError] = createSignal<unknown>();
  const [loading, setLoading] = createSignal(false);
  const [nonce, setNonce] = createSignal(0);
  let seq = 0;
  let lastKey: string | undefined;
  let alive = true;
  onCleanup(() => (alive = false));

  createEffect(() => {
    const current = source();
    void api.tick;
    void nonce();
    if (current === undefined) return;
    const key = JSON.stringify(current);
    const id = ++seq;
    untrack(() => {
      if (key !== lastKey) {
        lastKey = key;
        if (!options.keepOnChange)
          batch(() => {
            setValue(undefined);
            setError(undefined);
          });
      }
      setLoading(true);
      fetch(current).then(
        (result) => {
          if (!alive || id !== seq) return;
          batch(() => {
            setValue(() => result);
            setError(undefined);
            setLoading(false);
          });
        },
        (err: unknown) => {
          if (!alive || id !== seq) return;
          batch(() => {
            setError(() => err);
            setLoading(false);
          });
        },
      );
    });
  });

  return {
    value,
    error,
    loading,
    refetch: () => setNonce((n) => n + 1),
  };
}

/** GET `path()` with {@link useAsync} semantics. */
export function useRequest<T>(path: () => string | undefined): Request<T> {
  const api = useApi();
  return useAsync(path, (p) => api.client.get<T>(p));
}

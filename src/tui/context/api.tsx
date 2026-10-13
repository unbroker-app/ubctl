import {
  createContext,
  createResource,
  createSignal,
  onCleanup,
  useContext,
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

/**
 * Fetch `path()` and keep it fresh on every refresh tick. Returning
 * `undefined` from `path` pauses the request (e.g. until an id is chosen).
 * The previous value stays on screen while a refresh is in flight.
 */
export function useRequest<T>(path: () => string | undefined) {
  const api = useApi();
  const [data, { refetch, mutate }] = createResource(
    () => {
      const p = path();
      return p === undefined ? undefined : { p, tick: api.tick };
    },
    ({ p }) => api.client.get<T>(p),
  );
  return { data, refetch, mutate };
}

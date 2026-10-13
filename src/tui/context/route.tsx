import {
  createContext,
  createSignal,
  useContext,
  type ParentProps,
} from "solid-js";
import type { TrafficScope } from "../../util/traffic";

/** Every screen the TUI can show. Detail routes carry the selected id. */
export type Route =
  | { name: "overview" }
  | { name: "services" }
  | { name: "service"; serviceId: string; tab?: ServiceTab }
  | { name: "analytics"; scope?: { scope: TrafficScope; label: string } }
  | { name: "resources" }
  | { name: "databases" }
  | { name: "account" };

export type ServiceTab = "overview" | "resources" | "deployments" | "logs";

export const SECTIONS: {
  route: Route["name"];
  title: string;
  key: string;
}[] = [
  { route: "overview", title: "Overview", key: "1" },
  { route: "services", title: "Services", key: "2" },
  { route: "analytics", title: "Analytics", key: "3" },
  { route: "resources", title: "Resources", key: "4" },
  { route: "databases", title: "Cloud", key: "5" },
  { route: "account", title: "Account", key: "6" },
];

interface RouteContext {
  readonly data: Route;
  navigate(route: Route): void;
  back(): void;
}

const ctx = createContext<RouteContext>();

/** History-aware router (opencode's RouteProvider, without persistence). */
export function RouteProvider(props: ParentProps<{ initial?: Route }>) {
  const [stack, setStack] = createSignal<Route[]>([
    props.initial ?? { name: "overview" },
  ]);
  const value: RouteContext = {
    get data() {
      return stack().at(-1)!;
    },
    navigate(route) {
      setStack((s) => [...s.slice(-20), route]);
    },
    back() {
      setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    },
  };
  return <ctx.Provider value={value}>{props.children}</ctx.Provider>;
}

export function useRoute(): RouteContext {
  const value = useContext(ctx);
  if (!value) throw new Error("useRoute must be used within a RouteProvider");
  return value;
}

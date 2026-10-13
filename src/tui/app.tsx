import { TextAttributes } from "@opentui/core";
import {
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/solid";
import {
  createSignal,
  For,
  Match,
  Show,
  Switch,
  type Accessor,
} from "solid-js";
import { loadConfig, switchContext } from "../config/store";
import { VERSION } from "../version";
import { ApiProvider, useApi, type Session } from "./context/api";
import { RouteProvider, SECTIONS, useRoute, type Route } from "./context/route";
import { ThemeProvider, useTheme } from "./context/theme";
import { matches } from "./lib/keys";
import { DialogProvider, useDialog } from "./ui/dialog";
import { DialogSelect, type DialogSelectOption } from "./ui/dialog-select";
import { Toast, ToastProvider, useToast } from "./ui/toast";
import { Overview } from "./routes/overview";
import { Services } from "./routes/services";
import { ServiceDetail } from "./routes/service-detail";
import { Analytics } from "./routes/analytics";
import { Resources } from "./routes/resources";
import { Cloud } from "./routes/cloud";
import { Account } from "./routes/account";
import { openServicePicker } from "./ui/pickers";
import { HintsContext, type Hint } from "./context/hints";

export function App(props: {
  session: Session;
  reload: () => Promise<Session>;
}) {
  const [session, setSession] = createSignal(props.session);
  return (
    <ThemeProvider>
      <ToastProvider>
        {/* Re-keying on the session rebuilds every request after a context switch. */}
        <Show when={session()} keyed>
          {(current: Session) => (
            <ApiProvider session={current}>
              <RouteProvider>
                <DialogProvider>
                  <Shell reload={props.reload} onSession={setSession} />
                </DialogProvider>
              </RouteProvider>
            </ApiProvider>
          )}
        </Show>
        <Toast />
      </ToastProvider>
    </ThemeProvider>
  );
}

function Shell(props: {
  reload: () => Promise<Session>;
  onSession: (session: Session) => void;
}) {
  const theme = useTheme();
  const api = useApi();
  const route = useRoute();
  const dialog = useDialog();
  const toast = useToast();
  const renderer = useRenderer();
  const dimensions = useTerminalDimensions();
  const [hints, setHints] = createSignal<Hint[]>([]);

  const quit = () => renderer.destroy();
  const section = () =>
    route.data.name === "service" ? "services" : route.data.name;
  const go = (name: Route["name"]) => {
    if (name === "service") return;
    route.navigate({ name } as Route);
  };

  async function changeContext(name: string) {
    try {
      switchContext(name);
      props.onSession(await props.reload());
      toast.show({
        variant: "success",
        message: `Switched to context ${name}`,
      });
    } catch (err) {
      toast.error(err);
    }
  }

  function palette() {
    const options: DialogSelectOption<() => void>[] = [
      ...SECTIONS.map((s) => ({
        title: s.title,
        category: "Go to",
        footer: s.key,
        value: () => go(s.route),
      })),
      {
        title: "Open service…",
        category: "Go to",
        footer: "/",
        value: () => openServicePicker(dialog, api, route),
      },
      {
        title: "Refresh",
        category: "Session",
        footer: "r",
        value: () => api.refresh(),
      },
      ...Object.keys(loadConfig().contexts ?? {}).map((name) => ({
        title: `Switch context: ${name}`,
        category: "Session",
        footer: name === api.contextName ? "current" : undefined,
        value: () => void changeContext(name),
      })),
      { title: "Quit", category: "Session", footer: "q", value: quit },
    ];
    // Selection runs after the palette closes so actions can open dialogs.
    dialog.replace(() => (
      <DialogSelect
        title="Commands"
        placeholder="Type a command"
        options={options}
        onSelect={(o) => setTimeout(o.value, 0)}
      />
    ));
  }

  useKeyboard((key) => {
    if (matches(key, "ctrl+c")) {
      if (dialog.open) return dialog.clear();
      return quit();
    }
    if (dialog.open || key.defaultPrevented) return;
    if (matches(key, "ctrl+p", ":")) return palette();
    if (matches(key, "q")) return quit();
    if (matches(key, "r")) {
      api.refresh();
      return toast.show({
        variant: "info",
        message: "Refreshing…",
        duration: 1200,
      });
    }
    if (matches(key, "escape", "backspace")) return route.back();
    if (matches(key, "?")) return help();
    const bySection = SECTIONS.find((s) => s.key === key.name);
    if (bySection) return go(bySection.route);
    if (matches(key, "tab", "shift+tab")) {
      const index = SECTIONS.findIndex((s) => s.route === section());
      const step = key.shift ? -1 : 1;
      const next =
        SECTIONS[(index + step + SECTIONS.length) % SECTIONS.length]!;
      go(next.route);
    }
  });

  function help() {
    const all: Hint[] = [
      { key: "ctrl+p", label: "command palette" },
      { key: "1-6 / tab", label: "switch section" },
      { key: "esc", label: "back / close" },
      { key: "r", label: "refresh now (auto every 15s)" },
      { key: "q", label: "quit" },
      ...hints(),
    ];
    dialog.replace(() => (
      <DialogSelect
        title="Keyboard shortcuts"
        options={all.map((h) => ({ title: h.label, footer: h.key, value: h }))}
        onSelect={() => {}}
      />
    ));
  }

  const narrow = () => dimensions().width < 90;

  return (
    <HintsContext.Provider value={setHints}>
      <box
        width={dimensions().width}
        height={dimensions().height}
        backgroundColor={theme.background}
        flexDirection="column"
      >
        <Header />
        <box
          flexDirection="row"
          flexGrow={1}
          gap={1}
          paddingLeft={1}
          paddingRight={1}
        >
          <Show when={!narrow()}>
            <Sidebar active={section} onSelect={go} />
          </Show>
          <box flexGrow={1} flexShrink={1} flexDirection="column">
            <Switch>
              <Match when={route.data.name === "overview"}>
                <Overview />
              </Match>
              <Match when={route.data.name === "services"}>
                <Services />
              </Match>
              <Match when={route.data.name === "service" && route.data} keyed>
                {(r: Extract<Route, { name: "service" }>) => (
                  <ServiceDetail serviceId={r.serviceId} tab={r.tab} />
                )}
              </Match>
              <Match when={route.data.name === "analytics" && route.data} keyed>
                {(r: Extract<Route, { name: "analytics" }>) => (
                  <Analytics initialScope={r.scope} />
                )}
              </Match>
              <Match when={route.data.name === "resources"}>
                <Resources />
              </Match>
              <Match when={route.data.name === "databases"}>
                <Cloud />
              </Match>
              <Match when={route.data.name === "account"}>
                <Account />
              </Match>
            </Switch>
          </box>
        </box>
        <Footer hints={hints} />
      </box>
    </HintsContext.Provider>
  );
}

function Header() {
  const theme = useTheme();
  const api = useApi();
  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      paddingLeft={2}
      paddingRight={2}
      height={1}
      backgroundColor={theme.backgroundPanel}
    >
      <text>
        <span style={{ fg: theme.primary }}>
          <b>▲ UNBROKER CLOUD</b>
        </span>
        <span style={{ fg: theme.textSubtle }}> ubctl {VERSION}</span>
      </text>
      <text fg={theme.textMuted} wrapMode="none">
        {api.identity} · {api.orgId}
        <Show when={api.contextName}>
          <span style={{ fg: theme.accent }}> · {api.contextName}</span>
        </Show>
      </text>
    </box>
  );
}

function Sidebar(props: {
  active: Accessor<string>;
  onSelect: (route: Route["name"]) => void;
}) {
  const theme = useTheme();
  return (
    <box width={20} flexShrink={0} paddingTop={1} flexDirection="column">
      <For each={SECTIONS}>
        {(item) => {
          const active = () => props.active() === item.route;
          return (
            <box
              flexDirection="row"
              paddingLeft={1}
              border={["left"]}
              borderColor={active() ? theme.primary : theme.background}
              backgroundColor={active() ? theme.backgroundElement : undefined}
              onMouseUp={() => props.onSelect(item.route)}
            >
              <text fg={theme.textSubtle} width={2}>
                {item.key}
              </text>
              <text
                fg={active() ? theme.text : theme.textMuted}
                attributes={active() ? TextAttributes.BOLD : 0}
              >
                {item.title}
              </text>
            </box>
          );
        }}
      </For>
    </box>
  );
}

function Footer(props: { hints: Accessor<Hint[]> }) {
  const theme = useTheme();
  const base: Hint[] = [
    { key: "ctrl+p", label: "commands" },
    { key: "?", label: "help" },
    { key: "q", label: "quit" },
  ];
  return (
    <box
      flexDirection="row"
      height={1}
      paddingLeft={2}
      paddingRight={2}
      gap={2}
      backgroundColor={theme.backgroundPanel}
    >
      <For each={[...props.hints(), ...base]}>
        {(hint) => (
          <text wrapMode="none" flexShrink={0}>
            <span style={{ fg: theme.text }}>{hint.key}</span>
            <span style={{ fg: theme.textMuted }}> {hint.label}</span>
          </text>
        )}
      </For>
    </box>
  );
}

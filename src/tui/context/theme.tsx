import { RGBA } from "@opentui/core";
import { createContext, useContext, type ParentProps } from "solid-js";

/**
 * Design tokens for the TUI. Names follow the opencode theme vocabulary
 * (text/background/border by role) so components never hard-code a hex value.
 * The palette is the Unbroker Cloud product surface: ink background, lime action.
 */
export interface Theme {
  primary: RGBA;
  primaryText: RGBA;
  accent: RGBA;
  text: RGBA;
  textMuted: RGBA;
  textSubtle: RGBA;
  background: RGBA;
  backgroundPanel: RGBA;
  backgroundElement: RGBA;
  backgroundSelected: RGBA;
  border: RGBA;
  borderActive: RGBA;
  success: RGBA;
  warning: RGBA;
  error: RGBA;
  info: RGBA;
  /** Translucent veil drawn behind dialogs. */
  overlay: RGBA;
  /** Categorical series colors for charts, in a fixed order. */
  series: RGBA[];
}

const hex = (value: string) => RGBA.fromHex(value);

export const UNBROKER_THEME: Theme = {
  primary: hex("#c4fa00"),
  primaryText: hex("#050505"),
  accent: hex("#8ab4ff"),
  text: hex("#ededed"),
  textMuted: hex("#8f8f8f"),
  textSubtle: hex("#5c5c5c"),
  background: hex("#050505"),
  backgroundPanel: hex("#0d0d0d"),
  backgroundElement: hex("#161616"),
  backgroundSelected: hex("#1f2a05"),
  border: hex("#262626"),
  borderActive: hex("#c4fa00"),
  success: hex("#4ade80"),
  warning: hex("#facc15"),
  error: hex("#f87171"),
  info: hex("#8ab4ff"),
  overlay: RGBA.fromInts(0, 0, 0, 160),
  series: [hex("#c4fa00"), hex("#8ab4ff"), hex("#f0abfc"), hex("#fdba74")],
};

const ThemeContext = createContext<Theme>(UNBROKER_THEME);

export function ThemeProvider(props: ParentProps<{ theme?: Theme }>) {
  return (
    <ThemeContext.Provider value={props.theme ?? UNBROKER_THEME}>
      {props.children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** Map an API status string onto a semantic color. */
export function statusColor(theme: Theme, status: string | undefined): RGBA {
  const value = (status ?? "").toLowerCase();
  // Failures first: "unhealthy" and "inactive" contain "healthy"/"active".
  if (/(fail|error|crash|unhealthy|degraded|cancel|inactive)/.test(value))
    return theme.error;
  if (
    /(running|ready|active|live|healthy|succeeded|success|deployed|online)/.test(
      value,
    )
  )
    return theme.success;
  if (
    /(build|deploy|pending|queued|starting|provision|creating|progress|restoring)/.test(
      value,
    )
  )
    return theme.warning;
  return theme.textMuted;
}

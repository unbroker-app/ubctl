import { useKeyboard } from "@opentui/solid";
import { createContext, onMount, useContext } from "solid-js";
import { useDialog } from "../ui/dialog";

export interface Hint {
  key: string;
  label: string;
}

export const HintsContext = createContext<(hints: Hint[]) => void>(() => {});

/** Routes call this to publish their keybindings to the footer. */
export function useHints(hints: Hint[]): void {
  const set = useContext(HintsContext);
  onMount(() => set(hints));
}

/**
 * Subscribe to keys only while no dialog is open, so typing in a dialog's
 * input never triggers route shortcuts.
 */
export function useRouteKeys(handler: Parameters<typeof useKeyboard>[0]): void {
  const dialog = useDialog();
  useKeyboard((key) => {
    if (dialog.open || key.defaultPrevented) return;
    handler(key);
  });
}

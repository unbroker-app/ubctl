// Border presets borrowed from the opencode TUI: a thick left rule marks the
// active block without boxing it in.

export const EmptyBorder = {
  topLeft: "",
  bottomLeft: "",
  vertical: "",
  topRight: "",
  bottomRight: "",
  horizontal: " ",
  bottomT: "",
  topT: "",
  cross: "",
  leftT: "",
  rightT: "",
};

export const SplitBorder = {
  border: ["left" as const],
  customBorderChars: {
    ...EmptyBorder,
    vertical: "┃",
  },
};

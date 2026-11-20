/**
 * iPhone-only catalog metadata.
 *
 * Kept in its own plain module (no imports, no "use client") so server actions
 * and client components can share model/colour ordering without loading server
 * data into the browser bundle.
 */

/** The iPhone models ITech Case BD moulds silicone cases for (oldest → newest). */
export const IPHONE_MODELS = [
  "iPhone 11",
  "iPhone 12",
  "iPhone 12 Pro",
  "iPhone 12 Pro Max",
  "iPhone 13",
  "iPhone 13 Pro",
  "iPhone 13 Pro Max",
  "iPhone 14",
  "iPhone 14 Pro",
  "iPhone 14 Pro Max",
  "iPhone 15",
  "iPhone 15 Pro",
  "iPhone 15 Pro Max",
  "iPhone 16",
  "iPhone 16 Pro",
  "iPhone 16 Pro Max",
] as const;

export type IphoneModel = (typeof IPHONE_MODELS)[number];


export interface IphoneSeries {
  id: string;
  label: string;
  models: string[];
}

export const IPHONE_SERIES: readonly IphoneSeries[] = [
  { id: "6", label: "6", models: ["iPhone 6", "iPhone 6 Plus", "iPhone 6s", "iPhone 6s Plus"] },
  { id: "7", label: "7", models: ["iPhone 7", "iPhone 7 Plus"] },
  { id: "8", label: "8", models: ["iPhone 8", "iPhone 8 Plus"] },
  { id: "X", label: "X", models: ["iPhone X", "iPhone XS", "iPhone XR", "iPhone XS Max"] },
  { id: "11", label: "11", models: ["iPhone 11", "iPhone 11 Pro", "iPhone 11 Pro Max"] },
  {
    id: "12",
    label: "12",
    models: ["iPhone 12", "iPhone 12 Mini", "iPhone 12 Pro", "iPhone 12 Pro Max"],
  },
  {
    id: "13",
    label: "13",
    models: ["iPhone 13", "iPhone 13 Mini", "iPhone 13 Pro", "iPhone 13 Pro Max"],
  },
  {
    id: "14",
    label: "14",
    models: ["iPhone 14", "iPhone 14 Plus", "iPhone 14 Pro", "iPhone 14 Pro Max"],
  },
  {
    id: "15",
    label: "15",
    models: ["iPhone 15", "iPhone 15 Plus", "iPhone 15 Pro", "iPhone 15 Pro Max"],
  },
  {
    id: "16",
    label: "16",
    models: ["iPhone 16", "iPhone 16 Plus", "iPhone 16 Pro", "iPhone 16 Pro Max"],
  },
  { id: "17", label: "17", models: ["iPhone 17", "iPhone 17 Pro", "iPhone 17 Pro Max"] },
  { id: "18", label: "18", models: ["iPhone 18", "iPhone 18 Pro", "iPhone 18 Pro Max"] },
] as const;

/** Short variant label: `"iPhone 12 Pro Max"` → `"12 Pro Max"`. */
export function modelLabel(model: string): string {
  return model.replace(/^iPhone\s*/i, "").trim();
}

/** Product names are stored as `${model} Silicone Case`. */
export function productNameForModel(model: string): string {
  return `${model} Silicone Case`;
}

/** Silicone case colour variants (Apple-style palette). */
export const SILICONE_COLORS = [
  "Midnight Blue",
  "Black",
  "Lavender",
  "Matcha Green",
  "Stone",
  "Pink Sand",
  "Marigold",
] as const;

export type SiliconeColor = (typeof SILICONE_COLORS)[number];

/** Short SKU colour codes. */
export const COLOR_CODES: Record<string, string> = {
  "Midnight Blue": "MBL",
  Black: "BLK",
  Lavender: "LAV",
  "Matcha Green": "MTG",
  Stone: "STN",
  "Pink Sand": "PKS",
  Marigold: "MRG",
};

/** Approximate Apple silicone swatch colours for the inventory matrix cells. */
export const SILICONE_COLOR_HEX: Record<string, string> = {
  "Midnight Blue": "#27346b",
  Black: "#1c1c1e",
  Lavender: "#c3b1e1",
  "Matcha Green": "#a3b899",
  Stone: "#b0aca3",
  "Pink Sand": "#efc9c3",
  Marigold: "#efb03f",
};

export function colorCode(color: string): string {
  return COLOR_CODES[color] ?? color.slice(0, 3).toUpperCase();
}

/**
 * Common CSS colour keywords, so a colour the operator types (`gray`, `navy`,
 * `sky blue`…) resolves to a real swatch instead of a flat placeholder. Keys are
 * lowercase; multi-word names are also matched with the spaces stripped.
 */
const CSS_NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  lightgray: "#d3d3d3",
  lightgrey: "#d3d3d3",
  darkgray: "#a9a9a9",
  darkgrey: "#a9a9a9",
  dimgray: "#696969",
  slategray: "#708090",
  slategrey: "#708090",
  charcoal: "#36454f",
  red: "#ff0000",
  darkred: "#8b0000",
  crimson: "#dc143c",
  firebrick: "#b22222",
  indianred: "#cd5c5c",
  salmon: "#fa8072",
  tomato: "#ff6347",
  coral: "#ff7f50",
  orangered: "#ff4500",
  orange: "#ffa500",
  darkorange: "#ff8c00",
  gold: "#ffd700",
  yellow: "#ffff00",
  khaki: "#f0e68c",
  olive: "#808000",
  green: "#008000",
  darkgreen: "#006400",
  forestgreen: "#228b22",
  seagreen: "#2e8b57",
  lime: "#00ff00",
  limegreen: "#32cd32",
  greenyellow: "#adff2f",
  olivedrab: "#6b8e23",
  springgreen: "#00ff7f",
  mint: "#98ff98",
  emerald: "#50c878",
  jade: "#00a86b",
  teal: "#008080",
  darkcyan: "#008b8b",
  cyan: "#00ffff",
  aqua: "#00ffff",
  turquoise: "#40e0d0",
  lightseagreen: "#20b2aa",
  blue: "#0000ff",
  navy: "#000080",
  royalblue: "#4169e1",
  dodgerblue: "#1e90ff",
  cornflowerblue: "#6495ed",
  steelblue: "#4682b4",
  skyblue: "#87ceeb",
  sapphire: "#0f52ba",
  deepskyblue: "#00bfff",
  lightblue: "#add8e6",
  powderblue: "#b0e0e6",
  midnightblue: "#191970",
  indigo: "#4b0082",
  darkviolet: "#9400d3",
  blueviolet: "#8a2be2",
  purple: "#800080",
  rebeccapurple: "#663399",
  violet: "#ee82ee",
  orchid: "#da70d6",
  magenta: "#ff00ff",
  fuchsia: "#ff00ff",
  pink: "#ffc0cb",
  hotpink: "#ff69b4",
  deeppink: "#ff1493",
  lightpink: "#ffb6c1",
  rose: "#ff007f",
  ruby: "#e0115f",
  brown: "#a52a2a",
  maroon: "#800000",
  burgundy: "#800020",
  chocolate: "#d2691e",
  saddlebrown: "#8b4513",
  sienna: "#a0522d",
  peru: "#cd853f",
  tan: "#d2b48c",
  peach: "#ffcba4",
  wheat: "#f5deb3",
  beige: "#f5f5dc",
  cream: "#fffdd0",
  ivory: "#fffff0",
  cornsilk: "#fff8dc",
  gold_enrod: "#daa520",
  goldenrod: "#daa520",
  amber: "#ffbf00",
  mustard: "#ffdb58",
  lavender: "#e6e6fa",
  plum: "#dda0dd",
  thistle: "#d8bfd8",
  pearl: "#eae0c8",
};

/** Deterministic, pleasant swatch for a colour name CSS doesn't recognise. */
function nameToHsl(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 62% 52%)`;
}

/**
 * Resolves the swatch colour for a colour name: the shop palette first, then
 * the CSS colour keywords, then a deterministic generated hue — so the dot the
 * operator sees always reflects the colour they actually typed.
 */
export function colorHex(color: string): string {
  const name = (color ?? "").trim();
  if (!name) return "#94a3b8";
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(name)) return name;

  const exact = SILICONE_COLOR_HEX[name];
  if (exact) return exact;

  const lower = name.toLowerCase();
  const palette = Object.entries(SILICONE_COLOR_HEX).find(([key]) => key.toLowerCase() === lower);
  if (palette) return palette[1];

  return CSS_NAMED_COLORS[lower] ?? CSS_NAMED_COLORS[lower.replace(/\s+/g, "")] ?? nameToHsl(name);
}

/** `iPhone 15 Pro Max` → `IP15PM` (stable SKU component). */
export function modelCode(model: string): string {
  return model
    .replace("iPhone ", "IP")
    .replace(/ Pro Max$/, "PM")
    .replace(/ Pro$/, "P")
    .replace(/\s+/g, "");
}

/**
 * Pathao's short model code:
 *   `iPhone 12 Pro Max` → `12pm`   ·  `iPhone 12 Pro` → `12p`
 *   `iPhone 12 Plus`    → `12+`    ·  `iPhone 12 Mini` → `12mini`
 *   `iPhone 6s Plus`    → `6s+`    ·  `iPhone 6` → `6`
 *   `iPhone XS Max`     → `XSmax`  ·  `iPhone X` → `X`
 */
export function modelShortCode(model: string): string {
  const lower = model.toLowerCase();
  const genMatch = model.match(/(\d+)(s?)/);

  if (genMatch) {
    // Keep the "s" generation distinct so `iPhone 6 Plus` (6+) and
    // `iPhone 6s Plus` (6s+) do not collapse into the same code.
    const num = `${genMatch[1]}${genMatch[2] ? "s" : ""}`;
    if (/pro\s*max/.test(lower)) return `${num}pm`;
    if (/\bpro\b/.test(lower)) return `${num}p`;
    if (/plus/.test(lower)) return `${num}+`;
    if (/mini/.test(lower)) return `${num}mini`;
    return num;
  }

  // Letter-era generations carry no number (`iPhone X`, `XS`, `XS Max`, `XR`).
  const letters = model.replace(/^iPhone\s*/i, "").trim();
  if (/pro\s*max/i.test(letters)) return `${letters.replace(/\s*pro\s*max/i, "")}pm`;
  if (/\bpro\b/i.test(letters)) return `${letters.replace(/\s*pro/i, "")}p`;
  if (/plus/i.test(letters)) return `${letters.replace(/\s*plus/i, "")}+`;
  if (/mini/i.test(letters)) return `${letters.replace(/\s*mini/i, "")}mini`;
  if (/\bmax\b/i.test(letters)) return `${letters.replace(/\s*max/i, "")}max`;
  return letters;
}

/** Sort a list of iPhone model names into catalog order (newest models last). */
export function sortIphoneModels(models: string[]): string[] {
  const order = (model: string) => {
    const index = (IPHONE_MODELS as readonly string[]).indexOf(model);
    return index === -1 ? IPHONE_MODELS.length : index;
  };
  return [...models].sort((a, b) => order(a) - order(b));
}

/** Product names are stored as `${model} Silicone Case`; recover the model. */
export function productModel(productName: string): string {
  return productName.replace(/\s+Silicone Case$/i, "").trim();
}

/**
 * Pathao's `item_description` — short model codes first, then the lowercase
 * comma-separated colours after an em dash, e.g.
 *   `12pm, 12p — black, lavender, white`   or   `12p — black`.
 *
 * Model codes and colours are de-duplicated while preserving order, then the
 * whole string is clipped to Pathao's 250-character limit.
 */
export function pathaoItemDescription(
  items: { productName: string; variantName: string; quantity: number }[],
): string {
  const codes: string[] = [];
  const colors: string[] = [];
  for (const item of items) {
    const code = modelShortCode(productModel(item.productName));
    if (code && !codes.includes(code)) codes.push(code);
    const color = (item.variantName ?? "").toLowerCase().trim();
    if (color && !colors.includes(color)) colors.push(color);
  }

  const left = codes.join(", ");
  const right = colors.join(", ");
  const text = right ? `${left} — ${right}` : left;
  return text.slice(0, 250);
}

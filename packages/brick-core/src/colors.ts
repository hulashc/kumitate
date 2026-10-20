/**
 * The Kumitate colour palette: 12 LDraw colour codes.
 *
 * Every hex value below was taken verbatim from the official LDraw `LDConfig.ldr` `!COLOUR`
 * lines (the `VALUE` field), so renders match other LDraw tools exactly. `edge` is LDConfig's
 * `EDGE` value, kept for outline rendering later.
 *
 * Verified against LDConfig.ldr, October 2026.
 */

export type ColorCode = (typeof PALETTE)[number]["code"];

export type BrickColor = {
  /** LDraw colour code, as stored in the Yjs document. */
  code: number;
  /** LDConfig colour name, underscores replaced with spaces. */
  name: string;
  /** LDConfig VALUE — the surface colour. */
  hex: string;
  /** LDConfig EDGE — the outline colour. */
  edge: string;
};

export const PALETTE = [
  { code: 0, name: "Black", hex: "#05131D", edge: "#595959" },
  { code: 1, name: "Blue", hex: "#0055BF", edge: "#333333" },
  { code: 2, name: "Green", hex: "#257A3E", edge: "#333333" },
  { code: 4, name: "Red", hex: "#C91A09", edge: "#333333" },
  { code: 14, name: "Yellow", hex: "#F2CD37", edge: "#333333" },
  { code: 15, name: "White", hex: "#FFFFFF", edge: "#333333" },
  { code: 19, name: "Tan", hex: "#E4CD9E", edge: "#333333" },
  { code: 25, name: "Orange", hex: "#FE8A18", edge: "#333333" },
  { code: 27, name: "Lime", hex: "#BBE90B", edge: "#333333" },
  { code: 29, name: "Bright Pink", hex: "#E4ADC8", edge: "#333333" },
  { code: 71, name: "Light Bluish Gray", hex: "#A0A5A9", edge: "#333333" },
  { code: 72, name: "Dark Bluish Gray", hex: "#6C6E68", edge: "#333333" },
] as const satisfies readonly BrickColor[];

const BY_CODE: ReadonlyMap<number, BrickColor> = new Map(PALETTE.map((c) => [c.code, c]));

/** The colour a new session starts on. */
export const DEFAULT_COLOR: ColorCode = 4;

/** Look up a palette colour by LDraw code. Returns `undefined` for codes outside the palette. */
export function getColor(code: number): BrickColor | undefined {
  return BY_CODE.get(code);
}

/** True if `code` is one of the 12 palette colours. */
export function isPaletteColor(code: number): code is ColorCode {
  return BY_CODE.has(code);
}

/**
 * Look up a colour, falling back to the default rather than throwing.
 *
 * The renderer must never crash on an unknown colour: a peer on a newer build could legitimately
 * place a brick in a colour this client has not heard of yet.
 */
export function getColorOrDefault(code: number): BrickColor {
  return BY_CODE.get(code) ?? BY_CODE.get(DEFAULT_COLOR)!;
}

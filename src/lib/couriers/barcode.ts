/**
 * Minimal Code 39 barcode encoder.
 *
 * Pathao consignment ids are alphanumeric, which Code 39 encodes natively —
 * so the shipping sticker can render a scannable barcode with zero extra
 * dependencies. Each symbol is 9 elements (5 bars, 4 spaces), 3 of which are
 * wide; bars alternate starting with a bar.
 */

const CODE39: Record<string, string> = {
  "0": "000110100",
  "1": "100100001",
  "2": "001100001",
  "3": "101100000",
  "4": "000110001",
  "5": "100110000",
  "6": "001110000",
  "7": "000100101",
  "8": "100100100",
  "9": "001100100",
  A: "100001001",
  B: "001001001",
  C: "101001000",
  D: "000011001",
  E: "100011000",
  F: "001011000",
  G: "000001101",
  H: "100001100",
  I: "001001100",
  J: "000011100",
  K: "100000011",
  L: "001000011",
  M: "101000010",
  N: "000010011",
  O: "100010010",
  P: "001010010",
  Q: "000000111",
  R: "100000110",
  S: "001000110",
  T: "000010110",
  U: "110000001",
  V: "011000001",
  W: "111000000",
  X: "010010001",
  Y: "110010000",
  Z: "011010000",
  "-": "010000101",
  ".": "110000100",
  " ": "011000100",
  $: "010101000",
  "/": "010100010",
  "+": "010001010",
  "%": "000101010",
  "*": "010010100",
};

const NARROW = 1;
const WIDE = 3;

export interface BarcodeBar {
  x: number;
  width: number;
}

export interface EncodedBarcode {
  bars: BarcodeBar[];
  /** Total width of the symbol in module units (excludes quiet zones). */
  width: number;
}

/** Encodes a value as Code 39 (auto uppercased, unsupported chars → `-`). */
export function encodeCode39(value: string): EncodedBarcode {
  const text = value
    .toUpperCase()
    .replace(/[^0-9A-Z\-. $/+%]/g, "-")
    .slice(0, 40);

  const symbols = `*${text}*`.split("");
  const bars: BarcodeBar[] = [];
  let x = 0;

  symbols.forEach((symbol, symbolIndex) => {
    // Inter-character gap (a narrow space).
    if (symbolIndex > 0) x += NARROW;

    const pattern = CODE39[symbol] ?? CODE39["-"];
    pattern.split("").forEach((bit, elementIndex) => {
      const width = bit === "1" ? WIDE : NARROW;
      if (elementIndex % 2 === 0) bars.push({ x, width });
      x += width;
    });
  });

  return { bars, width: x };
}

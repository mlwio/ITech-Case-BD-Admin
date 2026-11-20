/**
 * "AI Magic Paste" order parser.
 *
 * Staff paste the raw message a customer sent on Messenger / WhatsApp and this
 * deterministic, rule-based engine pulls out the fields we need. It intentionally
 * avoids any external API: everything is regex + keyword scoring so it runs free,
 * offline and instantly on the VPS.
 *
 * It understands Bangla, Banglish (Romanised Bangla) and English.
 */

import type { DeliveryZone, OrderSource, Product } from "./types";

export interface ParsedOrderItem {
  /** Canonical iPhone model, e.g. "iPhone 15 Pro Max". */
  model: string | null;
  /** Category phrase, e.g. "Silicone Case". */
  category: string | null;
  /** Matched colour phrase, e.g. "Midnight Blue". */
  color: string | null;
  quantity: number | null;
}

export interface ParsedOrderDraft {
  name: string | null;
  phone: string | null;
  address: string | null;
  /** Matched device / model phrase, e.g. "iPhone 15 Pro Max". */
  productHint: string | null;
  /** Matched category phrase, e.g. "Silicone Case". */
  categoryHint: string | null;
  /** Matched colour phrase, e.g. "Midnight Blue". */
  colorHint: string | null;
  quantity: number | null;
  /** Detected channel if the customer mentioned where they are writing from. */
  source: OrderSource | null;
  /** 0–1 confidence across the fields we care about most. */
  confidence: number;
  /** Raw matched snippets, useful for debugging the parser in the UI. */
  matched: string[];
  /** Multi-item lines (for structured order forms). */
  items: ParsedOrderItem[];
  /** Delivery district / city for zone auto-detection. */
  district: string | null;
  /** Auto-detected delivery zone. */
  deliveryZone: DeliveryZone | null;
  /** Auto-detected delivery charge in ৳ (Dhaka 70 / Dhaka sub-area 100 / Outside 130). */
  deliveryCharge: number | null;
}

/* -------------------------------------------------------------------------- */
/*  Normalisation                                                             */
/* -------------------------------------------------------------------------- */

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Fold Bangla / Arabic-Indic numerals into ASCII so every regex is simple. */
export function normalizeDigits(input: string): string {
  let output = "";
  for (const char of input) {
    const banglaIndex = BANGLA_DIGITS.indexOf(char);
    if (banglaIndex >= 0) {
      output += String(banglaIndex);
      continue;
    }
    const arabicIndex = ARABIC_DIGITS.indexOf(char);
    if (arabicIndex >= 0) {
      output += String(arabicIndex);
      continue;
    }
    output += char;
  }
  return output;
}

/* -------------------------------------------------------------------------- */
/*  Field extractors                                                          */
/* -------------------------------------------------------------------------- */

/** Bangladeshi mobile numbers: `01[3-9]XXXXXXXX`, tolerating +880 and spacing. */
const PHONE_PATTERN = /(?:\+?88)?0?1[3-9]\d{8}/;

export function extractPhone(input: string): string | null {
  const compact = normalizeDigits(input).replace(/[\s\-().]/g, "");
  const match = compact.match(PHONE_PATTERN);
  if (!match) return null;

  let digits = match[0].replace(/\D/g, "");
  if (digits.startsWith("88")) digits = digits.slice(2);
  if (digits.startsWith("1")) digits = `0${digits}`;
  if (!digits.startsWith("0")) digits = `0${digits}`;
  return digits.length === 11 ? digits : null;
}

const QUANTITY_WORDS = ["ta", "pcs", "pc", "piece", "pieces", "qty", "nos", "টি", "টা", "পিস", "ছবি"];

export function extractQuantity(input: string): number | null {
  const text = normalizeDigits(input).toLowerCase();

  const worded = text.match(
    new RegExp(`(\\d{1,3})\\s*(?:${QUANTITY_WORDS.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`),
  );
  if (worded) return clampQuantity(Number(worded[1]));

  const trailing = text.match(/(?:x|×)\s*(\d{1,3})\b/);
  if (trailing) return clampQuantity(Number(trailing[1]));

  const leading = text.match(/\b(\d{1,3})\s*(?:x|×)\b/);
  if (leading) return clampQuantity(Number(leading[1]));

  return null;
}

function clampQuantity(value: number): number | null {
  if (!Number.isFinite(value) || value < 1) return null;
  return Math.min(Math.round(value), 999);
}

const NAME_LABELS = [
  "amar naam",
  "amar nam",
  "my name",
  "ami ",
  "i am ",
  "this is ",
  "name",
  "নাম",
  "আমি ",
];

/** Try to pull a person's name out of the message. */
export function extractName(input: string): string | null {
  const raw = normalizeDigits(input);
  const lines = raw
    .split(/[\n,;]/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const lower = line.toLowerCase();
    const label = NAME_LABELS.find((candidate) => lower.includes(candidate));
    if (!label) continue;

    const after = line.slice(lower.indexOf(label) + label.length).replace(/^[:\-–\s]+/, "");
    const candidate = cleanName(after);
    if (candidate) return candidate;
  }

  // Fallback: a short first line that looks like a name (letters only).
  for (const line of lines.slice(0, 3)) {
    if (/\d/.test(line) || line.length > 40) continue;
    if (isCategoryWord(line) || isColorWord(line)) continue;
    const candidate = cleanName(line);
    if (candidate && candidate.split(" ").length <= 4) return candidate;
  }

  return null;
}

function cleanName(value: string): string | null {
  const cleaned = value
    .replace(/[^\p{L}\s.'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 3) return null;
  // Drop obvious noise words that are not names.
  if (/^(order|os|ok|boss|vai|bhai|hi|hello|assalamu|salam)$/i.test(cleaned)) return null;
  return cleaned
    .split(" ")
    .slice(0, 4)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const ADDRESS_KEYWORDS = [
  "house",
  "road",
  "road no",
  "flat",
  "floor",
  "sector",
  "block",
  "lane",
  "area",
  "thana",
  "bazar",
  "bazaar",
  "market",
  "district",
  "city",
  "village",
  "union",
  "post office",
  "post",
  "upazila",
  "colony",
  "housing",
  "address",
  "বাসা",
  "রোড",
  "রোড নং",
  "ফ্ল্যাট",
  "সেক্টর",
  "ব্লক",
  "লেন",
  "এলাকা",
  "থানা",
  "বাজার",
  "জেলা",
  "গ্রাম",
  "শহর",
  "ডাকঘর",
  "উপজেলা",
  "ঠিকানা",
];

/** Score every line for address-ness and return the strongest candidate. */
export function extractAddress(input: string): string | null {
  const raw = normalizeDigits(input);
  const lines = raw
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let best: { text: string; score: number } | null = null;

  for (const line of lines) {
    if (line.length < 6) continue;
    const lower = line.toLowerCase();
    let score = 0;
    for (const keyword of ADDRESS_KEYWORDS) {
      if (lower.includes(keyword)) score += keyword.length;
    }
    if (/\d/.test(line)) score += 1;
    // A line with a comma and digits reads like an address.
    if (/,/.test(line) && /\d/.test(line)) score += 2;

    if (score > 0 && (!best || score > best.score)) best = { text: line, score };
  }

  if (best) return best.text.replace(/\s+/g, " ").trim();

  // Fallback: the longest line that is not a name / phone / product only.
  const fallback = lines
    .filter((line) => line.length > 12 && !extractPhone(line))
    .sort((a, b) => b.length - a.length)[0];
  return fallback ? fallback.replace(/\s+/g, " ").trim() : null;
}

/** ITech Case BD only sells silicone cases, so the category is effectively fixed. */
const CATEGORY_KEYWORDS: { match: RegExp; label: string }[] = [
  { match: /\b(silicone|silicon|liquid)\b|সিলিকন/i, label: "Silicone Case" },
  { match: /\b(case|cover|back\s*cover|backcover)\b|কেস|কভার/i, label: "Silicone Case" },
];

/** iPhone-only brand. The shop never stocks another manufacturer. */
const BRAND_KEYWORDS = ["iphone", "i phone", "apple"];

/** Detect the device / model phrase the customer references. */
export function extractProductHint(input: string): string | null {
  const raw = normalizeDigits(input);
  const lower = raw.toLowerCase();

  const brandIndex = BRAND_KEYWORDS.reduce((found, brand) => {
    if (found >= 0) return found;
    const at = lower.indexOf(brand);
    return at >= 0 ? at : -1;
  }, -1);

  if (brandIndex >= 0) {
    // Capture the brand plus the next few meaningful tokens (model numbers, suffixes).
    const tail = raw.slice(brandIndex).split(/[\n,.;!?]/)[0].trim();
    const tokens = tail.split(/\s+/).slice(0, 5);
    const model = tokens
      .filter((token) => !isFillerWord(token))
      .join(" ")
      .replace(/[^\p{L}\p{N}\s+]/gu, "")
      .trim();
    if (model.length >= 3) return titleCaseModel(model);
  }

  // No brand — fall back to a bare model number like "A55" or "Note 13".
  const modelNumber = lower.match(/\b([a-z]{1,4}\s?\d{1,4}(?:\s?(?:pro|max|plus|ultra|lite|mini))?)\b/);
  if (modelNumber) return titleCaseModel(modelNumber[1]);

  return null;
}

function isFillerWord(token: string): boolean {
  return /^(er|ta|ti|tar|ar|e|te|for|the|a|an|ki|koto|taka|tk|dam|price|hole|hobe|chai|lagbe)$/i.test(
    token,
  );
}

function titleCaseModel(value: string): string {
  return value
    .split(/\s+/)
    .map((word) =>
      /^\d+$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}

/** The exact silicone palette ITech Case BD stocks. */
const COLOR_KEYWORDS: { match: RegExp; label: string }[] = [
  { match: /\bmidnight(\s*blue)?\b|\bনেভি\b|\bnavy\b/i, label: "Midnight Blue" },
  { match: /\blavender\b|\blav\b/i, label: "Lavender" },
  { match: /\bmatcha\b|\bmatcha\s*green\b/i, label: "Matcha Green" },
  { match: /\bstone\b/i, label: "Stone" },
  { match: /\bpink\s*sand\b/i, label: "Pink Sand" },
  { match: /\bmarigold\b|\bgenda\b|গাঁদা/i, label: "Marigold" },
  { match: /\bblack\b|\bkalo\b|কালো/i, label: "Black" },
  { match: /\bblue\b|\bnil\b|নীল/i, label: "Midnight Blue" },
  { match: /\bgreen\b|\bshobuj\b|সবুজ/i, label: "Matcha Green" },
  { match: /\bpink\b|\bgolapi\b|গোলাপি/i, label: "Pink Sand" },
  { match: /\b(grey|gray)\b|\bstone\s*grey\b/i, label: "Stone" },
  { match: /\byellow\b|\bholud\b|হলুদ/i, label: "Marigold" },
];

export function extractColor(input: string): string | null {
  const raw = normalizeDigits(input);
  for (const { match, label } of COLOR_KEYWORDS) {
    if (match.test(raw)) return label;
  }
  return null;
}

export function extractCategory(input: string): string | null {
  const raw = normalizeDigits(input);
  for (const { match, label } of CATEGORY_KEYWORDS) {
    if (match.test(raw)) return label;
  }
  return null;
}

const SOURCE_KEYWORDS: { match: RegExp; source: OrderSource }[] = [
  { match: /messenger|\bfb\b|facebook/i, source: "MESSENGER" },
  { match: /whats\s?app|\bwa\b/i, source: "WHATSAPP" },
  { match: /tik\s?tok/i, source: "TIKTOK" },
  { match: /landing\s?page/i, source: "LANDING_PAGE" },
  { match: /website|web site|\bsite\b/i, source: "WEBSITE" },
  { match: /phone\s?call|\bcall\b/i, source: "CALL" },
];

export function extractSource(input: string): OrderSource | null {
  for (const { match, source } of SOURCE_KEYWORDS) {
    if (match.test(input)) return source;
  }
  return null;
}

function isCategoryWord(value: string): boolean {
  return CATEGORY_KEYWORDS.some(({ match }) => match.test(value));
}

function isColorWord(value: string): boolean {
  return COLOR_KEYWORDS.some(({ match }) => match.test(value));
}

/* -------------------------------------------------------------------------- */
/*  Catalog matching                                                          */
/* -------------------------------------------------------------------------- */

/** Glue words that carry no matching signal against the catalog. */
const MATCH_STOP_WORDS = new Set(["for", "the", "and", "with", "of", "a", "an", "er"]);

function tokenize(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .split(/[^a-z0-9\u0980-\u09ff]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !MATCH_STOP_WORDS.has(token));
}

export interface CatalogMatch {
  productId: string;
  variantId: string;
  /** Higher is a stronger match — useful for surfacing parser confidence. */
  score: number;
}

/**
 * Match a parsed draft against the live catalog and return the single best
 * in-stock variant, so the Magic Paste box can pre-select what the customer
 * almost certainly asked for.
 */
export function matchCatalogVariant(
  draft: ParsedOrderDraft,
  products: Product[],
): CatalogMatch | null {
  const queryTokens = Array.from(
    new Set([
      ...tokenize(draft.productHint),
      ...tokenize(draft.categoryHint),
      ...tokenize(draft.colorHint),
    ]),
  );
  if (queryTokens.length === 0) return null;

  let best: CatalogMatch | null = null;

  for (const product of products) {
    if (!product.isActive) continue;
    const productHaystack = `${product.name} ${product.brand} ${product.category}`.toLowerCase();
    let productScore = 0;
    for (const token of queryTokens) {
      if (productHaystack.includes(token)) productScore += 3;
    }
    if (draft.categoryHint && product.category.toLowerCase().includes(draft.categoryHint.toLowerCase())) {
      productScore += 5;
    }
    if (productScore === 0) continue;

    for (const variant of product.variants) {
      const variantHaystack = `${variant.name} ${variant.color}`.toLowerCase();
      let score = productScore;
      for (const token of queryTokens) {
        if (variantHaystack.includes(token)) score += 4;
      }
      // Prefer what we can actually ship right now.
      if (variant.stockQty > 0) score += 2;
      if (!best || score > best.score) {
        best = { productId: product.id, variantId: variant.id, score };
      }
    }
  }

  return best;
}

/* -------------------------------------------------------------------------- */
/*  Structured order-form parser                                              */
/* -------------------------------------------------------------------------- */

/**
 * Labels for the fixed Bangla / English order form used by staff and customers.
 * Each field can be written in Bangla, Banglish or English.
 */
const FORM_LABELS = {
  name: ["নাম", "name", "customer name"],
  phone: ["মোবাইল নাম্বার", "মোবাইল নম্বর", "মোবাইল", "phone", "mobile", "contact"],
  area: ["এলাকার নাম", "এলাকা", "area", "home delivery"],
  thana: ["থানার নাম", "থানা", "thana", "upazila", "police station"],
  district: ["জেলার নাম", "জেলা", "district", "city", "zila"],
  model: ["ফোনের মডেল", "ফোন মডেল", "মডেল", "model", "phone model", "device"],
  cover: ["কভার", "cover", "case type"],
  color: ["কালার", "রঙ", "color", "colour"],
  quantity: ["পরিমাণ", "qty", "quantity", "সংখ্যা"],
  bill: ["মোট বিল", "সর্বমোট", "মোট", "bill", "total", "amount"],
};

/** Strip a leading `label:` / `label = ` / `label(…)` prefix off a line. */
function valueAfterLabel(line: string, label: string): string | null {
  const rest = line
    .slice(label.length)
    .replace(/\([^)]*\)/g, "")
    .replace(/^[\s:：\-–—=]+/, "")
    .trim();
  return rest || null;
}

/** First value whose line starts with one of the supplied labels. */
function readField(lines: string[], labels: string[]): string | null {
  for (const line of lines) {
    const lower = line.toLowerCase();
    for (const label of labels) {
      if (lower.startsWith(label.toLowerCase())) {
        const value = valueAfterLabel(line, label);
        if (value) return value;
      }
    }
  }
  return null;
}

/**
 * All values whose line starts with one of the supplied labels, in order.
 * A single line may list several items separated by commas.
 */
function readAll(lines: string[], labels: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    for (const label of labels) {
      if (lower.startsWith(label.toLowerCase())) {
        const value = valueAfterLabel(line, label);
        if (value) out.push(...value.split(/[,，、]/).map((part) => part.trim()).filter(Boolean));
        break;
      }
    }
  }
  return out;
}

/** True when the input looks like a labelled order form (2+ label hits). */
function looksLikeStructuredForm(lines: string[]): boolean {
  let hits = 0;
  for (const line of lines) {
    const lower = line.toLowerCase();
    for (const labels of Object.values(FORM_LABELS)) {
      if (labels.some((label) => lower.startsWith(label.toLowerCase()))) {
        hits++;
        break;
      }
    }
  }
  return hits >= 2;
}

/** Greater-Dhaka districts that price as the Dhaka zone. */
const DHAKA_ZONE_DISTRICTS = [
  "dhaka",
  "ঢাকা",
  "savar",
  "সাভার",
  "keraniganj",
  "কেরানীগঞ্জ",
  "dohar",
  "দোহার",
  "tongi",
  "টঙ্গী",
  "gazipur",
  "গাজীপুর",
  "narayanganj",
  "নারায়ণগঞ্জ",
  "narsingdi",
  "নরসিংদী",
  "munshiganj",
  "মুন্সিগঞ্জ",
  "manikganj",
  "মানিকগঞ্জ",
  "kishoreganj",
  "কিশোরগঞ্জ",
];

/** Maps a district / city onto the shop's delivery-zone pricing buckets. */
export function districtToZone(district: string | null): DeliveryZone | null {
  if (!district) return null;
  const lower = district.toLowerCase();
  if (DHAKA_ZONE_DISTRICTS.some((name) => lower.includes(name))) return "DHAKA";
  if (lower.includes("chattogram") || lower.includes("chittagong") || lower.includes("চট্টগ্রাম"))
    return "CHITTAGONG";
  if (lower.includes("sylhet") || lower.includes("সিলেট")) return "SYLHET";
  return "OTHER";
}

/**
 * Areas inside the Dhaka metro city corporation → ৳70 (Dhaka inside).
 * Checked after the sub-area list so outer suburbs win the tie-break.
 */
const DHAKA_CITY_AREAS = [
  "dhaka", "ঢাকা",
  "dhanmondi", "ধানমন্ডি",
  "mirpur", "মিরপুর",
  "uttara", "উত্তরা",
  "gulshan", "গুলশান",
  "banani", "বনানী",
  "bashundhara", "বসুন্ধরা",
  "mohammadpur", "মোহাম্মদপুর",
  "motijheel", "মতিঝিল",
  "farmgate", "ফার্মগেট",
  "shyamoli", "শ্যামলী",
  "mohakhali", "মহাখালী",
  "baridhara", "বারিধারা",
  "badda", "বাড্ডা",
  "rampura", "রামপুরা",
  "khilgaon", "খিলগাঁও",
  "tejgaon", "তেজগাঁও",
  "malibagh", "মালিবাগ",
  "moghbazar", "মগবাজার",
  "paltan", "পল্টন",
  "wari", "ওয়ারী",
  "demra", "ডেমরা",
  "jatrabari", "যাত্রাবাড়ী",
  "lalbagh", "লালবাগ",
  "sutrapur", "সূত্রাপুর",
  "azimpur", "আজিমপুর",
  "chawkbazar", "চকবাজার",
  "shahbagh", "শাহবাগ",
  "new market", "নিউমার্কেট",
  "old dhaka", "পুরান ঢাকা",
  "jigatola", "zigatola",
  "hazaribagh", "হাজারীবাগ",
  "kafrul", "কাফরুল",
  "kallyanpur", "কল্যাণপুর",
  "cantonment", "ক্যান্টনমেন্ট",
];

/**
 * Greater-Dhaka outer districts and Dhaka-district suburbs → ৳100
 * (Pathao's "Dhaka sub-area"). Checked first so e.g. "Savar, Dhaka" prices
 * as the sub-area rather than the city.
 */
const DHAKA_SUB_AREA_AREAS = [
  "savar", "সাভার",
  "ashulia", "আশুলিয়া",
  "hemayetpur", "হেমায়েতপুর",
  "keraniganj", "কেরানীগঞ্জ",
  "dohar", "দোহার",
  "nawabganj", "নবাবগঞ্জ",
  "gazipur", "গাজীপুর",
  "tongi", "টঙ্গী",
  "kaliakair", "কালিয়াকৈর",
  "kapasia", "কাপাসিয়া",
  "narayanganj", "নারায়ণগঞ্জ",
  "siddhirganj", "সিদ্ধিরগঞ্জ",
  "fatullah", "ফতুল্লা",
  "rupganj", "রূপগঞ্জ",
  "bandar", "বন্দর",
  "narsingdi", "নরসিংদী",
  "munshiganj", "মুন্সিগঞ্জ",
  "manikganj", "মানিকগঞ্জ",
  "kishoreganj", "কিশোরগঞ্জ",
];

/**
 * Known Bangladeshi districts / cities outside Dhaka → ৳130. Used so a casual
 * message ("Bogura te pathaben") still prices correctly, while a message with
 * no recognisable place stays untouched (returns `null`).
 */
const KNOWN_PLACES = [
  "chattogram", "chittagong", "চট্টগ্রাম",
  "sylhet", "সিলেট",
  "khulna", "খুলনা",
  "rajshahi", "রাজশাহী",
  "rangpur", "রংপুর",
  "barishal", "barisal", "বরিশাল",
  "mymensingh", "ময়মনসিংহ",
  "cumilla", "comilla", "কুমিল্লা",
  "coxs bazar", "coxbazar", "কক্সবাজার",
  "bogura", "bogra", "বগুড়া",
  "jashore", "jessore", "যশোর",
  "dinajpur", "দিনাজপুর",
  "pabna", "পাবনা",
  "kushtia", "কুষ্টিয়া",
  "tangail", "টাঙ্গাইল",
  "noakhali", "নোয়াখালী",
  "feni", "ফেনী",
  "brahmanbaria", "ব্রাহ্মণবাড়িয়া",
  "chandpur", "চাঁদপুর",
  "lakshmipur", "লক্ষ্মীপুর",
  "coxs",
  "satkhira", "সাতক্ষীরা",
  "bagerhat", "বাগেরহাট",
  "jhenaidah", "ঝিনাইদহ",
  "chuadanga", "চুয়াডাঙ্গা",
  "magura", "মাগুরা",
  "narail", "নড়াইল",
  "meherpur", "মেহেরপুর",
  "faridpur", "ফরিদপুর",
  "gopalganj", "গোপালগঞ্জ",
  "madaripur", "মাদারীপুর",
  "rajbari", "রাজবাড়ী",
  "shariatpur", "শরীয়তপুর",
  "jamalpur", "জামালপুর",
  "sherpur", "শেরপুর",
  "netrokona", "নেত্রকোণা",
  "sunamganj", "সুনামগঞ্জ",
  "habiganj", "হবিগঞ্জ",
  "moulvibazar", "moulvibazar", "মৌলভীবাজার",
  "sirajganj", "সিরাজগঞ্জ",
  "natore", "নাটোর",
  "naogaon", "নওগাঁ",
  "chapainawabganj", "চাঁপাইনবাবগঞ্জ",
  "joypurhat", "জয়পুরহাট",
  "kurigram", "কুড়িগ্রাম",
  "lalmonirhat", "লালমনিরহাট",
  "nilphamari", "নীলফামারী",
  "panchagarh", "পঞ্চগড়",
  "thakurgaon", "ঠাকুরগাঁও",
  "gaibandha", "গাইবান্ধা",
  "patuakhali", "পটুয়াখালী",
  "barguna", "বরগুনা",
  "bhola", "ভোলা",
  "pirojpur", "পিরোজপুর",
  "jhalokati", "ঝালকাঠি",
  "rangamati", "রাঙ্গামাটি",
  "khagrachhari", "খাগড়াছড়ি",
  "bandarban", "বান্দরবান",
];

/**
 * Estimate the delivery charge in ৳ from a free-form location string:
 * Dhaka city → 70, Dhaka sub-area → 100, anywhere else → 130.
 *
 * `assumeOutside` (default `true`) controls what happens when nothing is
 * recognised: a labelled order form that names a district should price as
 * "outside Dhaka", while a casual message with no place should be left alone.
 * Returns `null` when there is no location text or no confident signal.
 */
export function estimateDeliveryCharge(
  locationText: string | null | undefined,
  options: { assumeOutside?: boolean } = {},
): number | null {
  const { assumeOutside = true } = options;
  if (!locationText) return null;
  const lower = normalizeDigits(locationText).toLowerCase().trim();
  if (!lower) return null;

  if (DHAKA_SUB_AREA_AREAS.some((area) => lower.includes(area))) return 100;
  if (DHAKA_CITY_AREAS.some((area) => lower.includes(area))) return 70;
  if (KNOWN_PLACES.some((place) => lower.includes(place))) return 130;
  return assumeOutside ? 130 : null;
}


/**
 * Parse the structured Bangla / English order form into a draft with multi-item
 * support and delivery-zone auto-detection.
 */
function parseStructuredForm(input: string): ParsedOrderDraft {
  const normalized = normalizeDigits(input);
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s*•\-–]+/, "").trim())
    .filter(Boolean);

  const matched: string[] = [];

  const name = readField(lines, FORM_LABELS.name);
  const phoneRaw = readField(lines, FORM_LABELS.phone);
  const phone = (phoneRaw ? extractPhone(phoneRaw) : null) ?? extractPhone(normalized);
  const area = readField(lines, FORM_LABELS.area);
  const thana = readField(lines, FORM_LABELS.thana);
  const district = readField(lines, FORM_LABELS.district);
  const models = readAll(lines, FORM_LABELS.model);
  const covers = readAll(lines, FORM_LABELS.cover);
  const colors = readAll(lines, FORM_LABELS.color);
  const quantities = readAll(lines, FORM_LABELS.quantity);

  const addressParts = [area, thana, district].filter(Boolean);
  const address = addressParts.length > 0 ? addressParts.join(", ") : extractAddress(normalized);

  // Build multi-item list from models / colors.
  const itemCount = Math.max(models.length, colors.length, 1);
  const items: ParsedOrderItem[] = Array.from({ length: itemCount }, (_, index) => {
    const modelRaw = models[index] ?? models[models.length - 1] ?? null;
    const colorRaw = colors[index] ?? colors[colors.length - 1] ?? null;
    const qtyRaw = quantities[index] ?? quantities[quantities.length - 1] ?? null;
    return {
      model: modelRaw ? extractProductHint(modelRaw) ?? modelRaw.trim() : null,
      category: extractCategory(normalized) ?? (covers[0] ? "Silicone Case" : null),
      color: colorRaw ? extractColor(colorRaw) ?? colorRaw.trim() : null,
      quantity: qtyRaw ? extractQuantity(qtyRaw) : extractQuantity(normalized),
    };
  });

  const labeledLocation = [area, thana, district].filter(Boolean).join(" ");
  const deliveryCharge = estimateDeliveryCharge(labeledLocation || address, {
    assumeOutside: labeledLocation.length > 0,
  });
  // Keep the zone label in step with the detected price.
  let deliveryZone = districtToZone(district);
  if (deliveryCharge === 70 || deliveryCharge === 100) deliveryZone = "DHAKA";

  if (phone) matched.push(`phone: ${phone}`);
  if (name) matched.push(`name: ${name}`);
  if (address) matched.push(`address: ${address}`);
  if (district) matched.push(`district: ${district}`);
  if (deliveryZone) matched.push(`zone: ${deliveryZone}`);
  if (deliveryCharge != null) matched.push(`delivery: ${deliveryCharge}`);
  items.forEach((item, i) => {
    if (item.model) matched.push(`item${i + 1}: ${item.model}`);
  });

  const source = extractSource(normalized);
  const firstItem = items[0];

  // Confidence — phone, address and items matter most.
  const weights: [boolean, number][] = [
    [Boolean(phone), 0.3],
    [Boolean(address), 0.2],
    [Boolean(name), 0.1],
    [Boolean(firstItem?.model), 0.2],
    [Boolean(district || deliveryZone), 0.1],
    [Boolean(firstItem?.color), 0.1],
  ];
  const confidence = Number(
    weights.reduce((sum, [hit, weight]) => sum + (hit ? weight : 0), 0).toFixed(2),
  );

  return {
    name,
    phone,
    address,
    productHint: firstItem?.model ?? null,
    categoryHint: firstItem?.category ?? null,
    colorHint: firstItem?.color ?? null,
    quantity: firstItem?.quantity ?? null,
    source,
    confidence,
    matched,
    items,
    district,
    deliveryZone,
    deliveryCharge,
  };
}

/* -------------------------------------------------------------------------- */
/*  Entry point                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Parse a raw customer message into a structured draft.
 *
 * Tries the structured Bangla/English order form first (when labels are
 * present), otherwise falls back to free-form keyword extraction. Anything
 * we cannot find stays `null` so the operator can fill it in by hand.
 */
export function parseOrderMessage(input: string): ParsedOrderDraft {
  const text = input.trim();
  const normalized = normalizeDigits(text);
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s*•\-–]+/, "").trim())
    .filter(Boolean);

  // Structured form takes priority — it gives us multi-item + zone.
  if (looksLikeStructuredForm(lines)) {
    return parseStructuredForm(text);
  }

  const matched: string[] = [];

  const phone = extractPhone(text);
  const name = extractName(text);
  const address = extractAddress(text);
  const productHint = extractProductHint(text);
  const categoryHint = extractCategory(text);
  const colorHint = extractColor(text);
  const quantity = extractQuantity(text);
  const source = extractSource(text);
  // Fall back to the whole message so a short "Gazipur" / "Chattogram" still
  // prices, but keep `assumeOutside: false` so a message with no place at all
  // is left untouched.
  const locationText = address ?? text;
  const deliveryCharge = estimateDeliveryCharge(locationText, { assumeOutside: false });
  // Only trust the zone when the charge itself was detected, so a message with
  // no real address does not get mis-labelled as "outside Dhaka".
  let deliveryZone: DeliveryZone | null = null;
  if (deliveryCharge === 70 || deliveryCharge === 100) deliveryZone = "DHAKA";
  else if (deliveryCharge === 130) deliveryZone = districtToZone(locationText);

  if (phone) matched.push(`phone: ${phone}`);
  if (name) matched.push(`name: ${name}`);
  if (address) matched.push(`address: ${address}`);
  if (productHint) matched.push(`product: ${productHint}`);
  if (colorHint) matched.push(`color: ${colorHint}`);
  if (quantity) matched.push(`qty: ${quantity}`);
  if (deliveryCharge != null) matched.push(`delivery: ${deliveryCharge}`);

  // Confidence weights — phone & address matter most for actually shipping.
  const weights: [boolean, number][] = [
    [Boolean(phone), 0.4],
    [Boolean(address), 0.25],
    [Boolean(name), 0.15],
    [Boolean(productHint || categoryHint), 0.15],
    [Boolean(quantity), 0.05],
  ];
  const confidence = Number(
    weights.reduce((sum, [hit, weight]) => sum + (hit ? weight : 0), 0).toFixed(2),
  );

  return {
    name,
    phone,
    address,
    productHint,
    categoryHint,
    colorHint,
    quantity,
    source,
    confidence,
    matched,
    items: [],
    district: null,
    deliveryZone,
    deliveryCharge,
  };
}

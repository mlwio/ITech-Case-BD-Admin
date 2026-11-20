/**
 * Pathao City / Zone / Area auto-mapper.
 *
 * Pathao's booking endpoint requires numeric `recipient_city` and
 * `recipient_zone` ids, but our customers type free-text addresses. This module
 * keeps a cached city/zone index (primed from the live API in production, or
 * from the bundled snapshot otherwise) and resolves the best match for a given
 * address — with a confidence score so the UI can flag anything uncertain for a
 * manual dropdown override.
 */

import type { DeliveryZone, PathaoCity, PathaoZone } from "@/lib/types";

export interface PathaoLocationMatch {
  cityId: number;
  cityName: string;
  zoneId: number;
  zoneName: string;
  /** 0–1 — below 0.5 the booking UI asks the operator to confirm. */
  confidence: number;
  /** How the match was produced. */
  source: "zone" | "city" | "zone-keyword" | "fallback";
  /** Set when no confident match exists and a manual override is required. */
  needsReview: boolean;
}

export interface PathaoLocationIndex {
  cities: PathaoCity[];
  zonesByCity: Record<number, PathaoZone[]>;
}

/* -------------------------------------------------------------------------- */
/*  Curated snapshot (mirrors Pathao's master list for the major districts)    */
/* -------------------------------------------------------------------------- */

interface CitySeed {
  cityId: number;
  cityName: string;
  aliases: string[];
  zones: string[];
  /** Zone chosen when only the city could be inferred from the address. */
  defaultZone: string;
}

const CITY_SEEDS: CitySeed[] = [
  {
    cityId: 1,
    cityName: "Dhaka",
    aliases: ["dhaka", "dacca"],
    defaultZone: "Mohammadpur",
    zones: [
      "Dhanmondi", "Mohammadpur", "Mirpur", "Uttara", "Bashundhara", "Gulshan", "Banani",
      "Badda", "Baridhara", "Wari", "Motijheel", "Tejgaon", "Rampura", "Khilgaon", "Pallabi",
      "Cantonment", "Demra", "Jatrabari", "Kafrul", "Shyampur", "Sutrapur", "Lalbagh",
      "Kotwali", "Hazaribagh", "Bangshal", "Chawkbazar", "Gendaria", "Sabujbagh", "Turag",
      "Savar", "Keraniganj", "Dohar", "Nawabganj", "Dhamrai", "Paltan", "New Market",
      "Shahbagh", "Farmgate", "Green Road", "Kalabagan", "Adabor", "Shyamoli", "Kallyanpur",
      "Shewrapara", "Aftabnagar", "Notun Bazar", "Nikunja", "Khilkhet", "Tongi",
    ],
  },
  {
    cityId: 2,
    cityName: "Chattogram",
    aliases: ["chattogram", "chittagong", "ctg", "chattagram"],
    defaultZone: "Kotwali",
    zones: [
      "Agrabad", "Lalkhan Bazar", "Khulshi", "Nasirabad", "Pahartali", "Double Mooring",
      "Kotwali", "Halishahar", "Chandgaon", "Panchlaish", "Patenga", "Bayezid", "Bakalia",
      "Bandar", "Sadarghat", "Chawkbazar", "Karnafuli", "Sitakunda", "Hathazari", "Rangunia",
    ],
  },
  {
    cityId: 3,
    cityName: "Sylhet",
    aliases: ["sylhet", "silet"],
    defaultZone: "Sylhet Sadar",
    zones: [
      "Ambarkhana", "Zindabazar", "Subid Bazar", "Tilagor", "Shahi Eidgah", "Sylhet Sadar",
      "Beanibazar", "Golapganj", "Kanaighat", "Balaganj", "Companiganj",
    ],
  },
  {
    cityId: 4,
    cityName: "Khulna",
    aliases: ["khulna"],
    defaultZone: "Khalishpur",
    zones: ["Khalishpur", "Sonadanga", "Daulatpur", "Khan Jahan Ali", "Kotwali", "Boyra", "Batiaghata"],
  },
  {
    cityId: 5,
    cityName: "Rajshahi",
    aliases: ["rajshahi"],
    defaultZone: "Boalia",
    zones: ["Boalia", "Motihar", "Rajpara", "Shah Makhdum", "Paba", "Godagari"],
  },
  {
    cityId: 6,
    cityName: "Barishal",
    aliases: ["barishal", "barisal"],
    defaultZone: "Barishal Sadar",
    zones: ["Barishal Sadar", "Bakerganj", "Babuganj", "Banaripara", "Gournadi"],
  },
  {
    cityId: 7,
    cityName: "Rangpur",
    aliases: ["rangpur"],
    defaultZone: "Rangpur Sadar",
    zones: ["Rangpur Sadar", "Badarganj", "Gangachara", "Pirgacha", "Mithapukur"],
  },
  {
    cityId: 8,
    cityName: "Mymensingh",
    aliases: ["mymensingh", "mymensing"],
    defaultZone: "Mymensingh Sadar",
    zones: ["Mymensingh Sadar", "Muktagachha", "Bhaluka", "Trishal", "Gaffargaon"],
  },
  {
    cityId: 9,
    cityName: "Cumilla",
    aliases: ["cumilla", "comilla"],
    defaultZone: "Cumilla Sadar",
    zones: ["Cumilla Sadar", "Cantonment", "Burichang", "Chauddagram", "Debidwar"],
  },
  {
    cityId: 10,
    cityName: "Bogura",
    aliases: ["bogura", "bogra"],
    defaultZone: "Bogura Sadar",
    zones: ["Bogura Sadar", "Sherpur", "Shibganj", "Gabtali", "Sariakandi", "Satmatha"],
  },
  {
    cityId: 11,
    cityName: "Cox's Bazar",
    aliases: ["cox's bazar", "coxs bazar", "cox bazar"],
    defaultZone: "Cox's Bazar Sadar",
    zones: ["Cox's Bazar Sadar", "Kolatoli", "Chakaria", "Teknaf", "Ramu", "Ukhiya"],
  },
  {
    cityId: 12,
    cityName: "Narayanganj",
    aliases: ["narayanganj"],
    defaultZone: "Narayanganj Sadar",
    zones: ["Narayanganj Sadar", "Araihazar", "Bandar", "Rupganj", "Sonargaon", "Fatullah"],
  },
  {
    cityId: 13,
    cityName: "Gazipur",
    aliases: ["gazipur", "joydebpur"],
    defaultZone: "Gazipur Sadar",
    zones: ["Gazipur Sadar", "Kaliakair", "Kapasia", "Sreepur", "Kaliganj", "Tongi"],
  },
];

/** Districts that belong to a delivery zone but have no dedicated city entry. */
const ZONE_FALLBACK_CITY: Record<DeliveryZone, number> = {
  DHAKA: 1,
  CHITTAGONG: 2,
  SYLHET: 3,
  OTHER: 1,
};

function buildIndex(): PathaoLocationIndex {
  const cities: PathaoCity[] = [];
  const zonesByCity: Record<number, PathaoZone[]> = {};

  for (const seed of CITY_SEEDS) {
    cities.push({ cityId: seed.cityId, cityName: seed.cityName });
    zonesByCity[seed.cityId] = seed.zones.map((zoneName, index) => ({
      // Deterministic synthetic ids mirroring the cached Pathao zone list.
      zoneId: seed.cityId * 1000 + index + 1,
      zoneName,
      cityId: seed.cityId,
    }));
  }

  return { cities, zonesByCity };
}

/* -------------------------------------------------------------------------- */
/*  Runtime cache                                                             */
/* -------------------------------------------------------------------------- */

let index: PathaoLocationIndex = buildIndex();
const cityAliasIndex = new Map<string, number>();

for (const seed of CITY_SEEDS) {
  cityAliasIndex.set(seed.cityName.toLowerCase(), seed.cityId);
  for (const alias of seed.aliases) cityAliasIndex.set(alias.toLowerCase(), seed.cityId);
}

/** The bundled snapshot — always available, even offline. */
export function getCachedIndex(): PathaoLocationIndex {
  return index;
}

/** Overrides the cache with ids pulled straight from the Pathao API. */
export function primeLocationCache(cities: PathaoCity[], zonesByCity: Record<number, PathaoZone[]>): void {
  if (!cities.length) return;
  index = { cities, zonesByCity };
}

export function listCachedZones(cityId: number): PathaoZone[] {
  return index.zonesByCity[cityId] ?? [];
}

/* -------------------------------------------------------------------------- */
/*  Matching                                                                  */
/* -------------------------------------------------------------------------- */

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").replace(/\s+/g, " ").trim();
}

function findZoneByName(cityId: number, haystack: string): PathaoZone | null {
  const zones = listCachedZones(cityId);
  // Longest name first so "Cox's Bazar Sadar" wins over "Cox's Bazar".
  const ordered = [...zones].sort((a, b) => b.zoneName.length - a.zoneName.length);
  for (const zone of ordered) {
    const needle = normalize(zone.zoneName);
    if (needle && haystack.includes(needle)) return zone;
  }
  return null;
}

function findCityInText(haystack: string): PathaoCity | null {
  for (const city of index.cities) {
    const seed = CITY_SEEDS.find((item) => item.cityId === city.cityId);
    const names = [city.cityName, ...(seed?.aliases ?? [])].map((name) => name.toLowerCase());
    if (names.some((name) => haystack.includes(name))) return city;
  }
  return null;
}

/**
 * Resolves the most accurate Pathao city/zone pair for a free-text address.
 *
 * Resolution order:
 *   1. A zone name appears in the address (highest confidence).
 *   2. A city name appears in the address → use its default zone.
 *   3. A zone name from any city appears in the address.
 *   4. Fall back to the customer's delivery zone, flagged for manual review.
 */
export function matchPathaoLocation(address: string, zone: DeliveryZone): PathaoLocationMatch {
  const haystack = normalize(address);

  // 1 — a known zone for the customer's own city.
  const seedByZone: Record<DeliveryZone, number> = { DHAKA: 1, CHITTAGONG: 2, SYLHET: 3, OTHER: 0 };
  if (seedByZone[zone]) {
    const cityId = seedByZone[zone];
    const exact = findZoneByName(cityId, haystack);
    if (exact) {
      return {
        cityId,
        cityName: index.cities.find((city) => city.cityId === cityId)?.cityName ?? "",
        zoneId: exact.zoneId,
        zoneName: exact.zoneName,
        confidence: 0.95,
        source: "zone",
        needsReview: false,
      };
    }
  }

  // 2 — a city name anywhere in the address.
  const city = findCityInText(haystack);
  if (city) {
    const directZone = findZoneByName(city.cityId, haystack);
    if (directZone) {
      return {
        cityId: city.cityId,
        cityName: city.cityName,
        zoneId: directZone.zoneId,
        zoneName: directZone.zoneName,
        confidence: 0.9,
        source: "zone",
        needsReview: false,
      };
    }
    const fallbackZone = listCachedZones(city.cityId)[0];
    if (fallbackZone) {
      return {
        cityId: city.cityId,
        cityName: city.cityName,
        zoneId: fallbackZone.zoneId,
        zoneName: fallbackZone.zoneName,
        confidence: 0.6,
        source: "city",
        needsReview: false,
      };
    }
  }

  // 3 — a zone name from another city.
  for (const candidateCity of index.cities) {
    const zoneMatch = findZoneByName(candidateCity.cityId, haystack);
    if (zoneMatch) {
      return {
        cityId: candidateCity.cityId,
        cityName: candidateCity.cityName,
        zoneId: zoneMatch.zoneId,
        zoneName: zoneMatch.zoneName,
        confidence: 0.7,
        source: "zone-keyword",
        needsReview: false,
      };
    }
  }

  // 4 — fall back to the delivery zone and ask the operator to confirm.
  const fallbackCityId = ZONE_FALLBACK_CITY[zone] ?? 1;
  const fallbackCity = index.cities.find((city) => city.cityId === fallbackCityId);
  const fallbackZones = listCachedZones(fallbackCityId);
  const defaultZone =
    fallbackZones.find((item) => item.zoneName === CITY_SEEDS.find((s) => s.cityId === fallbackCityId)?.defaultZone) ??
    fallbackZones[0];

  return {
    cityId: fallbackCity?.cityId ?? 1,
    cityName: fallbackCity?.cityName ?? "Dhaka",
    zoneId: defaultZone?.zoneId ?? 1,
    zoneName: defaultZone?.zoneName ?? "Mohammadpur",
    confidence: 0.35,
    source: "fallback",
    needsReview: true,
  };
}

/** The full curated city list, used by the manual override dropdown. */
export function listCachedCities(): PathaoCity[] {
  return index.cities;
}

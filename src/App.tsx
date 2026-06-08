import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type CSSProperties, type ReactNode, type TouchEvent, type WheelEvent } from "react";
import {
  BookOpen,
  CalendarDays,
  Edit3,
  Filter,
  Library,
  ListTree,
  Menu,
  MapPin,
  Plus,
  Rows3,
  RotateCcw,
  Search,
  UserRound,
} from "lucide-react";
import {
  eraPeriods as seedEraPeriods,
  countries as seedCountries,
  events as seedEvents,
  people as seedPeople,
  personEvents,
  regions as seedRegions,
  termCards as seedTermCards,
} from "./data/ww1";
import type { Category, ContentBlock, Country, EditableRecord, EraPeriod, Event, LearningFile, Person, Region, TermCard, TimelineItem } from "./models";
import { buildTimelineItems, getHistoricalYear } from "./query";

type ViewMode = "timeline" | "map" | "category" | "people" | "terms" | "cards";
type TimelineLaneMode = "country" | "plain";
type CardGroupMode = "all" | "category" | "country";
type TermPopup = { term: string; definition: string; target?: EditableRecord };
let pdfJsModulePromise: Promise<any> | null = null;
type KnowledgeCard = {
  id: string;
  type: EditableRecord["type"];
  title: string;
  aliases?: string[];
  label: string;
  summary: string;
  meta: string;
  searchText: string;
  groupCategory?: string;
  countryIds?: string[];
  tags?: string[];
};
type EventMapPin = {
  item: TimelineItem;
  locationName: string;
  latitude: number;
  longitude: number;
  countryId: string | undefined;
};
type MapPoint = {
  latitude: number;
  longitude: number;
};
type PersistedDatabase = {
  version: number;
  events: Event[];
  people: Person[];
  termCards: TermCard[];
  countries: Country[];
  regions: Region[];
  customCategories: Category[];
  customGenres: string[];
  savedAt?: string;
};
const currentDatabaseVersion = 2;
type EventPlacement = {
  item: TimelineItem;
  lane: number;
  country: string;
  left: number;
  width: number;
  visualWidth: number;
  stack: number;
};

const baseCategories: Category[] = ["戦争", "イベント", "発明", "文化"];
const baseTermCategories = ["用語", "概念", "地域", "史料"];
const timelineCategoryOrder = baseCategories;
const eventCategoryColors: Record<string, { background: string; mark: string; text: string }> = {
  戦争: { background: "#ffcdd2", mark: "#e53935", text: "#241a00" },
  イベント: { background: "#f7c948", mark: "#f7c948", text: "#241a00" },
  文化: { background: "#d1c4e9", mark: "#7c3aed", text: "#241a00" },
  発明: { background: "#e3f2fd", mark: "#1976d2", text: "#241a00" },
};
const viewModes: Array<{ id: ViewMode; label: string; icon: typeof Rows3 }> = [
  { id: "timeline", label: "年表", icon: Rows3 },
  { id: "map", label: "地図", icon: MapPin },
  { id: "category", label: "出来事", icon: ListTree },
  { id: "people", label: "人物", icon: UserRound },
  { id: "terms", label: "単語", icon: Library },
  { id: "cards", label: "全カード", icon: Library },
];

const countryFlags: Record<string, string> = {
  "austria-hungary": "🇦🇹🇭🇺",
  serbia: "🇷🇸",
  germany: "🇩🇪",
  russia: "🇷🇺",
  france: "🇫🇷",
  uk: "🇬🇧",
  usa: "🇺🇸",
  "ancient-greece": "🏺",
  "オーストリア＝ハンガリー帝国": "🇦🇹🇭🇺",
  セルビア: "🇷🇸",
  ドイツ帝国: "🇩🇪",
  ロシア帝国: "🇷🇺",
  フランス: "🇫🇷",
  イギリス: "🇬🇧",
  アメリカ合衆国: "🇺🇸",
  アテナイ: "🏛️",
  スパルタ: "Λ",
  古代ギリシア: "🏺",
};

const glossary: Record<string, string> = {
  サラエボ事件: "1914年6月28日に起きた暗殺事件。第一次世界大戦の直接的な契機になった。",
  第一次世界大戦: "1914年から1918年まで続いた総力戦。同盟国と連合国が世界規模で衝突した。",
  "オーストリア＝ハンガリー帝国": "中欧の多民族帝国。サラエボ事件後にセルビアへ宣戦布告した。",
  ドイツ帝国: "1871年成立の帝国。第一次世界大戦では同盟国側の中心国だった。",
  ロシア帝国: "第一次世界大戦中に革命で崩壊した帝国。",
  セルビア: "バルカン半島の国家。サラエボ事件後、オーストリア＝ハンガリー帝国と戦争状態に入った。",
  ソクラテス: "古代アテナイの哲学者。対話を通して善や徳を問い続けた。",
  プラトン: "ソクラテスの弟子で、アカデメイアを開いた哲学者。",
  アリストファネス: "古代アテナイの喜劇作家。『雲』でソクラテスを風刺した。",
  アテナイ: "古代ギリシアの有力ポリス。民主政、哲学、演劇の中心地の一つ。",
  スパルタ: "古代ギリシアの有力ポリス。軍事的な制度で知られる。",
  ペロポネソス戦争: "紀元前431年から紀元前404年まで続いた、アテナイ陣営とスパルタ陣営の戦争。",
  ソクラテス裁判: "紀元前399年、ソクラテスが告発され死刑判決を受けた裁判。",
};

declare global {
  interface Window {
    google?: any;
    gm_authFailure?: () => void;
    initDariusMap?: () => void;
    dariusGoogleMapsLoading?: Promise<void>;
  }
}

function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps) return Promise.resolve();
  if (window.dariusGoogleMapsLoading) return window.dariusGoogleMapsLoading;

  window.dariusGoogleMapsLoading = new Promise<void>((resolve, reject) => {
    window.initDariusMap = () => resolve();
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=initDariusMap`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Google Maps could not be loaded."));
    document.head.appendChild(script);
  });

  return window.dariusGoogleMapsLoading;
}

const formatDate = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function toLabelDate(value: string) {
  const parts = parseHistoricalDateParts(value);
  const year = getHistoricalYear(value);
  if (!String(value ?? "").trim() || !Number.isFinite(year)) {
    return "未設定";
  }
  if (parts?.precision === "year") {
    return `${toDisplayYear(parts.year)}年`;
  }
  if (parts && parts.year < 1) {
    return `紀元前${Math.abs(parts.year) + 1}年${parts.month}月${parts.day}日`;
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return parts ? `${parts.year}年${parts.month}月${parts.day}日` : String(year);
  }
  return formatDate.format(date);
}

function toYear(value: string) {
  return getHistoricalYear(value);
}

function getTimelineYearPosition(value: string) {
  const match = String(value ?? "").trim().match(/^(-?\d{1,6})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (!match) return toYear(value);
  const year = Number(match[1]);
  const month = match[2] ? Math.min(12, Math.max(1, Number(match[2]))) : 1;
  const day = match[3] ? Math.min(31, Math.max(1, Number(match[3]))) : 1;
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const daysBeforeMonth = daysInMonth.slice(0, month - 1).reduce((sum, days) => sum + days, 0);
  const dayOfYear = Math.min(daysBeforeMonth + day - 1, daysInMonth.reduce((sum, days) => sum + days, 0) - 1);
  return year + dayOfYear / daysInMonth.reduce((sum, days) => sum + days, 0);
}

function isLeapYear(year: number) {
  if (year % 400 === 0) return true;
  if (year % 100 === 0) return false;
  return year % 4 === 0;
}

function toDisplayYear(year: number) {
  if (!Number.isFinite(year)) return "未設定";
  return year < 1 ? `前${Math.abs(year) + 1}` : String(year);
}

function getPersonBirthDate(person: Person) {
  return person.birthDate ?? `${person.birthYear}-01-01`;
}

function getPersonDeathDate(person: Person) {
  return person.deathDate ?? `${person.deathYear}-12-31`;
}

function getPersonDeathTimelineDate(person: Person) {
  return person.deathDate ?? `${person.deathYear}-01-01`;
}

function toPersonDateLabel(date: string | undefined, year: number) {
  if (!date && year === 0) return "未設定";
  return date ? toLabelDate(date) : toDisplayYear(year);
}

function toPersonLifeLabel(person: Person) {
  return `${toPersonDateLabel(person.birthDate, person.birthYear)}-${toPersonDateLabel(person.deathDate, person.deathYear)}`;
}

function getTimelinePixelWidth(yearSpan: number, zoom: number) {
  return Math.max(1800, yearSpan * 4) * zoom;
}

function getYearTickStep(zoom: number, yearSpan: number) {
  const timelineWidth = getTimelinePixelWidth(yearSpan, zoom);
  const pixelsPerYear = timelineWidth / Math.max(yearSpan, 1);
  const targetLabelGap = 86;
  const minimumYearsPerTick = targetLabelGap / Math.max(pixelsPerYear, 0.01);
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  return steps.find((step) => step >= minimumYearsPerTick) ?? 1000;
}

function splitValues(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitListValues(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getPreviewImageLayout(imageUrls?: string[]) {
  return (imageUrls ?? []).length > 0 ? "has-image" : "no-image";
}

function clampTimelineZoom(value: number) {
  return Math.min(200, Math.max(0.1, value));
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

type HistoricalDateParts = {
  year: number;
  month: number;
  day: number;
  precision?: "year" | "day";
};

function padDatePart(value: number, length = 2) {
  return String(Math.abs(value)).padStart(length, "0");
}

function serializeHistoricalYear(year: number) {
  const yearPrefix = year < 0 ? "-" : "";
  return `${yearPrefix}${padDatePart(year, 4)}`;
}

function serializeHistoricalDate({ year, month, day, precision }: HistoricalDateParts) {
  if (precision === "year") return serializeHistoricalYear(year);
  return `${serializeHistoricalYear(year)}-${padDatePart(month)}-${padDatePart(day)}`;
}

function parseHistoricalDateParts(value: string | undefined): HistoricalDateParts | null {
  const safeValue = String(value ?? "").trim();
  if (!safeValue) return null;
  const normalized = safeValue
    .replace(/紀元前/g, "前")
    .replace(/[年月/.]/g, "-")
    .replace(/日/g, "")
    .replace(/\s+/g, "");
  const beforeCommonEraMatch = normalized.match(/^前(\d{1,6})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
  if (beforeCommonEraMatch) {
    return {
      year: -(Number(beforeCommonEraMatch[1]) - 1),
      month: beforeCommonEraMatch[2] ? Number(beforeCommonEraMatch[2]) : 1,
      day: beforeCommonEraMatch[3] ? Number(beforeCommonEraMatch[3]) : 1,
      precision: beforeCommonEraMatch[2] || beforeCommonEraMatch[3] ? "day" : "year",
    };
  }
  const match = normalized.match(/^(-?\d{1,6})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: match[2] ? Number(match[2]) : 1,
    day: match[3] ? Number(match[3]) : 1,
    precision: match[2] || match[3] ? "day" : "year",
  };
}

function clampHistoricalDateParts(parts: HistoricalDateParts): HistoricalDateParts {
  const month = Math.min(12, Math.max(1, parts.month));
  const daysInMonth = getDaysInHistoricalMonth(parts.year, month);
  return {
    year: Number.isFinite(parts.year) ? Math.trunc(parts.year) : 0,
    month,
    day: Math.min(daysInMonth, Math.max(1, parts.day)),
    precision: parts.precision ?? "day",
  };
}

function getDaysInHistoricalMonth(year: number, month: number) {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 31;
}

function formatHistoricalDateSearch(value: string | undefined) {
  const parts = parseHistoricalDateParts(value);
  if (!parts) return "";
  const displayYear = parts.year < 1 ? `前${Math.abs(parts.year) + 1}` : String(parts.year);
  if (parts.precision === "year") return displayYear;
  return `${displayYear}-${padDatePart(parts.month)}-${padDatePart(parts.day)}`;
}

function getCountryName(countries: Country[], id: string) {
  return countries.find((country) => country.id === id)?.name ?? id;
}

function getRegionName(regions: Region[], id: string) {
  return regions.find((region) => region.id === id)?.name ?? id;
}

function getRecordCountryIds(record: Event | Person) {
  return record.countryIds ?? [];
}

function getRecordRegionIds(record: Event | Person) {
  return record.regionIds ?? [];
}

function getPersonCategories(person: Person) {
  return uniqueValues([...(person.affiliations ?? []), ...(person.genres ?? [])]);
}

function hasCoordinates(record: Event) {
  return typeof record.locationLat === "number" && typeof record.locationLng === "number";
}

function normalizeLocationName(value: string) {
  return value
    .toLocaleLowerCase("ja")
    .replace(/[・＝=()\[\]（）\s、,.-]/g, "");
}

const representativeLocations: Array<{ keywords: string[]; point: MapPoint }> = [
  { keywords: ["サラエボ", "ボスニア"], point: { latitude: 43.8563, longitude: 18.4131 } },
  { keywords: ["バルカン", "バルカン半島"], point: { latitude: 42.7, longitude: 21.0 } },
  { keywords: ["ペトログラード", "サンクトペテルブルク"], point: { latitude: 59.9311, longitude: 30.3609 } },
  { keywords: ["コンピエーニュ"], point: { latitude: 49.4178, longitude: 2.8261 } },
  { keywords: ["ヴェルサイユ"], point: { latitude: 48.8049, longitude: 2.1204 } },
  { keywords: ["アテナイ", "アテネ", "古代ギリシア", "ギリシア", "ギリシャ"], point: { latitude: 37.9838, longitude: 23.7275 } },
  { keywords: ["スパルタ"], point: { latitude: 37.0745, longitude: 22.4301 } },
  { keywords: ["ペロポネソス", "ペロポネソス半島"], point: { latitude: 37.35, longitude: 22.35 } },
  { keywords: ["アッティカ"], point: { latitude: 37.9838, longitude: 23.7275 } },
  { keywords: ["イオニア", "小アジア", "アナトリア"], point: { latitude: 38.42, longitude: 27.14 } },
  { keywords: ["地中海"], point: { latitude: 36.2, longitude: 18.0 } },
  { keywords: ["エーゲ海"], point: { latitude: 38.5, longitude: 25.0 } },
  { keywords: ["本能寺", "本能寺の変"], point: { latitude: 35.0057, longitude: 135.7679 } },
  { keywords: ["二条城"], point: { latitude: 35.0142, longitude: 135.7482 } },
  { keywords: ["京都御所", "御所"], point: { latitude: 35.0254, longitude: 135.7621 } },
  { keywords: ["日本", "東京", "江戸"], point: { latitude: 35.6762, longitude: 139.6503 } },
  { keywords: ["奈良", "平城京"], point: { latitude: 34.6851, longitude: 135.8048 } },
  { keywords: ["平安", "平安京", "京都"], point: { latitude: 35.0116, longitude: 135.7681 } },
  { keywords: ["鎌倉"], point: { latitude: 35.3192, longitude: 139.5467 } },
  { keywords: ["中国", "中華", "唐", "隋", "秦", "漢", "長安", "西安"], point: { latitude: 34.3416, longitude: 108.9398 } },
  { keywords: ["北京", "元", "明", "清"], point: { latitude: 39.9042, longitude: 116.4074 } },
  { keywords: ["洛陽", "後漢", "東周"], point: { latitude: 34.6197, longitude: 112.454 } },
  { keywords: ["南京"], point: { latitude: 32.0603, longitude: 118.7969 } },
  { keywords: ["ヨーロッパ", "欧州"], point: { latitude: 50.8503, longitude: 4.3517 } },
  { keywords: ["フランス", "パリ"], point: { latitude: 48.8566, longitude: 2.3522 } },
  { keywords: ["ドイツ", "ベルリン"], point: { latitude: 52.52, longitude: 13.405 } },
  { keywords: ["イギリス", "英国", "ロンドン"], point: { latitude: 51.5072, longitude: -0.1276 } },
  { keywords: ["アメリカ", "ワシントン"], point: { latitude: 38.9072, longitude: -77.0369 } },
  { keywords: ["ロシア", "モスクワ"], point: { latitude: 55.7558, longitude: 37.6173 } },
  { keywords: ["セルビア", "ベオグラード"], point: { latitude: 44.7866, longitude: 20.4489 } },
  { keywords: ["オーストリア", "ハンガリー", "オーストリアハンガリー", "ウィーン"], point: { latitude: 48.2082, longitude: 16.3738 } },
];

function averageRegionPoint(regions: Region[]) {
  if (regions.length === 0) return undefined;
  return {
    latitude: regions.reduce((sum, region) => sum + region.latitude, 0) / regions.length,
    longitude: regions.reduce((sum, region) => sum + region.longitude, 0) / regions.length,
  };
}

function getRepresentativeLocation(locationName: string, regions: Region[], countryNames: string[], countryIds: string[] = []) {
  const normalizedLocation = normalizeLocationName(locationName);
  const region = regions.find((candidate) => {
    const normalizedRegion = normalizeLocationName(candidate.name);
    return normalizedLocation === normalizedRegion || normalizedLocation.includes(normalizedRegion) || normalizedRegion.includes(normalizedLocation);
  });
  if (region) return { latitude: region.latitude, longitude: region.longitude };

  const dictionaryPoint = getDictionaryLocation(locationName, countryNames);
  if (dictionaryPoint) return dictionaryPoint;

  const countryRegions = regions.filter((region) => countryIds.includes(region.countryId));
  return averageRegionPoint(countryRegions);
}

function getDictionaryLocation(locationName: string, countryNames: string[] = []) {
  const searchText = normalizeLocationName([locationName, ...countryNames].join(" "));
  return representativeLocations.find((location) =>
    location.keywords.some((keyword) => searchText.includes(normalizeLocationName(keyword))),
  )?.point;
}

function isSameMapPoint(a: MapPoint | undefined, b: MapPoint | undefined) {
  if (!a || !b) return false;
  return Math.abs(a.latitude - b.latitude) < 0.0001 && Math.abs(a.longitude - b.longitude) < 0.0001;
}

function getLocationSearchAliases(locationName: string) {
  const normalizedLocation = normalizeLocationName(locationName);
  const aliases: string[] = [];
  if (normalizedLocation.includes("ペロポネソス")) aliases.push("Peloponnese Greece");
  if (normalizedLocation.includes("本能寺")) aliases.push("Honno-ji Temple Kyoto", "本能寺 京都");
  if (normalizedLocation.includes("アテナイ") || normalizedLocation.includes("アテネ")) aliases.push("Athens Greece");
  if (normalizedLocation.includes("スパルタ")) aliases.push("Sparta Greece");
  if (normalizedLocation.includes("小アジア") || normalizedLocation.includes("アナトリア")) aliases.push("Anatolia Turkey");
  if (normalizedLocation.includes("イオニア")) aliases.push("Ionia Turkey");
  if (normalizedLocation.includes("エーゲ海")) aliases.push("Aegean Sea");
  if (normalizedLocation.includes("地中海")) aliases.push("Mediterranean Sea");
  return aliases;
}

function buildLocationQueries(locationName: string, countryNames: string[], countryIds: string[]) {
  const countryHints = [
    ...countryNames,
    ...(countryIds.includes("ancient-greece") ? ["Greece", "ギリシャ"] : []),
  ];
  return uniqueValues([
    locationName,
    ...getLocationSearchAliases(locationName),
    ...countryHints.map((countryName) => `${locationName} ${countryName}`),
  ]);
}

function matchesSearch(value: string, query: string) {
  return value.toLocaleLowerCase("ja").includes(query.trim().toLocaleLowerCase("ja"));
}

function labelCountries(countryIds: string[], countries: Country[]) {
  if (countryIds.length === 0) return ["国なし"];
  return countryIds.map((id) => getCountryName(countries, id));
}

function groupRecords<T extends { id: string }>(records: T[], getLabels: (record: T) => string[]) {
  const groups = new Map<string, T[]>();
  records.forEach((record) => {
    const labels = uniqueValues(getLabels(record).map((label) => label.trim()).filter(Boolean));
    const resolvedLabels = labels.length > 0 ? labels : ["未分類"];
    resolvedLabels.forEach((label) => {
      groups.set(label, [...(groups.get(label) ?? []), record]);
    });
  });
  return Array.from(groups.entries())
    .map(([label, groupRecords]) => ({ label, records: groupRecords }))
    .sort((a, b) => a.label.localeCompare(b.label, "ja"));
}

function sortEventCategories(categories: string[]) {
  return [...categories].sort((a, b) => {
    const aIndex = timelineCategoryOrder.indexOf(a);
    const bIndex = timelineCategoryOrder.indexOf(b);
    if (aIndex !== -1 || bIndex !== -1) {
      return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
    }
    return a.localeCompare(b, "ja");
  });
}

function normalizeEventCategory(category: string | undefined): Category {
  if (category === "戦争" || category === "文化" || category === "発明" || category === "イベント") return category;
  return "イベント";
}

function getEventCategoryColor(category: string) {
  return eventCategoryColors[normalizeEventCategory(category)] ?? eventCategoryColors["イベント"];
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}`;
}

function mergeById<T extends { id: string }>(seedItems: T[], savedItems?: T[]) {
  const merged = new Map(seedItems.map((item) => [item.id, item]));
  (savedItems ?? []).forEach((item) => merged.set(item.id, { ...merged.get(item.id), ...item }));
  return Array.from(merged.values());
}

function normalizeEvent(event: Event): Event {
  return {
    ...event,
    category: normalizeEventCategory(event.category),
    aliases: event.aliases ?? [],
    relatedCountries: event.relatedCountries ?? [],
    countryIds: event.countryIds ?? [],
    regionIds: event.regionIds ?? [],
    terms: event.terms ?? [],
    contentBlocks: event.contentBlocks ?? [],
    genres: event.genres ?? [],
    imageUrls: event.imageUrls ?? [],
    references: event.references ?? [],
    learningFiles: event.learningFiles ?? [],
  };
}

function normalizePerson(person: Person): Person {
  return {
    ...person,
    aliases: person.aliases ?? [],
    countryIds: person.countryIds ?? [],
    regionIds: person.regionIds ?? [],
    affiliations: person.affiliations ?? [],
    majorWorks: person.majorWorks ?? [],
    episodeBlocks: person.episodeBlocks ?? [],
    contentBlocks: person.contentBlocks ?? [],
    genres: person.genres ?? [],
    imageUrls: person.imageUrls ?? [],
    references: person.references ?? [],
    learningFiles: person.learningFiles ?? [],
  };
}

function normalizeTermCard(term: TermCard): TermCard {
  return {
    ...term,
    aliases: term.aliases ?? [],
    relatedTerms: term.relatedTerms ?? [],
    contentBlocks: term.contentBlocks ?? [],
    genres: term.genres ?? [],
    imageUrls: term.imageUrls ?? [],
    references: term.references ?? [],
    learningFiles: term.learningFiles ?? [],
  };
}

function createPersistedDatabase(data: {
  events: Event[];
  people: Person[];
  termCards: TermCard[];
  countries: Country[];
  regions: Region[];
  customCategories: Category[];
  customGenres: string[];
}): PersistedDatabase {
  return {
    version: currentDatabaseVersion,
    events: data.events.map(normalizeEvent),
    people: data.people.map(normalizePerson),
    termCards: data.termCards.map(normalizeTermCard),
    countries: data.countries.map((country) => ({ ...country, aliases: country.aliases ?? [] })),
    regions: data.regions,
    customCategories: data.customCategories,
    customGenres: data.customGenres,
    savedAt: new Date().toISOString(),
  };
}

function readLocalDatabase() {
  try {
    const raw = window.localStorage.getItem("history-database:data");
    return raw ? (JSON.parse(raw) as PersistedDatabase) : null;
  } catch {
    return null;
  }
}

function writeLocalDatabase(data: PersistedDatabase) {
  try {
    window.localStorage.setItem("history-database:data", JSON.stringify(data));
    return true;
  } catch {
    // localStorage can be unavailable in private browsing or strict file contexts.
    return false;
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  });
}

async function uploadFileAsset(file: File) {
  try {
    const response = await fetch("/api/files", {
      method: "POST",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-file-name": file.name,
      },
      body: file,
    });
    if (response.ok) {
      const result = (await response.json()) as { url?: string };
      if (result.url) return result.url;
    }
  } catch {
    // Local Vite previews do not have Netlify Functions, so fall back to inline data.
  }
  return readFileAsDataUrl(file);
}

function blockText(blocks?: ContentBlock[]) {
  return (blocks ?? []).map((block) => `${stripHtml(block.text)} ${block.caption ?? ""}`).join(" ");
}

function renderRichText(text: string) {
  const pattern = /(\*\*[^*]+\*\*)/g;
  return text.split(pattern).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ");
}

function sanitizeRichHtml(value: string) {
  if (!value.trim()) return "";
  const template = document.createElement("template");
  template.innerHTML = value;
  const allowedTags = new Set([
    "B",
    "BLOCKQUOTE",
    "BR",
    "DIV",
    "EM",
    "FIGCAPTION",
    "FIGURE",
    "H2",
    "H3",
    "I",
    "IFRAME",
    "IMG",
    "LI",
    "OL",
    "P",
    "FONT",
    "SPAN",
    "STRONG",
    "U",
    "UL",
  ]);
  const allowedAttributes = new Set(["allowfullscreen", "alt", "color", "src", "style", "title"]);
  Array.from(template.content.querySelectorAll("*")).forEach((element) => {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(document.createTextNode(element.textContent ?? ""));
      return;
    }
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (!allowedAttributes.has(name) || name.startsWith("on")) {
        element.removeAttribute(attribute.name);
      }
    });
    const style = element.getAttribute("style");
    if (style) {
      const color = style.match(/color:\s*([^;]+)/i)?.[1]?.trim();
      if (color && /^#[0-9a-f]{3,8}$/i.test(color)) {
        element.setAttribute("style", `color: ${color}`);
      } else {
        element.removeAttribute("style");
      }
    }
    if ((element.tagName === "IMG" || element.tagName === "IFRAME") && !isSafeMediaUrl(element.getAttribute("src") ?? "")) {
      element.remove();
    }
  });
  return template.innerHTML;
}

function isSafeMediaUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function blocksToFreeHtml(blocks?: ContentBlock[]) {
  if (!blocks?.length) return "";
  const htmlBlock = blocks.find((block) => block.type === "html");
  if (htmlBlock) return htmlBlock.text;
  return blocks
    .map((block) => {
      const text = escapeHtml(block.text);
      const caption = block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : "";
      if (block.type === "heading") return `<h2>${text}</h2>`;
      if (block.type === "subheading") return `<h3>${text}</h3>`;
      if (block.type === "quote") return `<blockquote>${text}</blockquote>`;
      if (block.type === "image") return `<figure><img src="${escapeHtml(block.text)}" alt="${escapeHtml(block.caption || "本文画像")}" />${caption}</figure>`;
      if (block.type === "video") return `<figure><iframe src="${escapeHtml(toEmbedUrl(block.text))}" title="${escapeHtml(block.caption || block.text)}" allowfullscreen></iframe>${caption}</figure>`;
      return `<p>${text}</p>`;
    })
    .join("");
}

function freeHtmlToBlocks(html: string): ContentBlock[] {
  const sanitized = sanitizeRichHtml(html);
  return sanitized.trim() ? [{ id: makeId("block"), type: "html", text: sanitized }] : [];
}

function toEmbedUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname.includes("youtube.com")) {
      const id = url.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : value;
    }
    if (url.hostname.includes("youtu.be")) {
      return `https://www.youtube.com/embed/${url.pathname.replace("/", "")}`;
    }
    return value;
  } catch {
    return value;
  }
}

function getEventMapEmbedUrl(event: Event) {
  const locationName = event.locationName?.trim();
  if (!locationName) return "";
  const query = hasCoordinates(event)
    ? `${event.locationLat},${event.locationLng}`
    : locationName;
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=8&output=embed`;
}

function App() {
  const [events, setEvents] = useState<Event[]>(seedEvents);
  const [people, setPeople] = useState<Person[]>(seedPeople);
  const [termCards, setTermCards] = useState<TermCard[]>(seedTermCards);
  const [countries, setCountries] = useState<Country[]>(seedCountries);
  const [regions, setRegions] = useState<Region[]>(seedRegions);
  const [viewMode, setViewMode] = useState<ViewMode>("timeline");
  const [categoryFilters, setCategoryFilters] = useState<Category[]>([]);
  const [eventGenreFilters, setEventGenreFilters] = useState<string[]>([]);
  const [personCategoryFilters, setPersonCategoryFilters] = useState<string[]>([]);
  const [countryFilters, setCountryFilters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [customCategories, setCustomCategories] = useState<Category[]>([]);
  const [customGenres, setCustomGenres] = useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newGenreName, setNewGenreName] = useState("");
  const [newCountryName, setNewCountryName] = useState("");
  const [newRegionName, setNewRegionName] = useState("");
  const [newRegionCountryId, setNewRegionCountryId] = useState(seedCountries[0]?.id ?? "");
  const [newRegionLatitude, setNewRegionLatitude] = useState("");
  const [newRegionLongitude, setNewRegionLongitude] = useState("");
  const [detailEditMode, setDetailEditMode] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [timelineHeightZoom, setTimelineHeightZoom] = useState(1.35);
  const [timelineLaneMode, setTimelineLaneMode] = useState<TimelineLaneMode>("plain");
  const [cardGroupMode, setCardGroupMode] = useState<CardGroupMode>("all");
  const [showEraPeriods, setShowEraPeriods] = useState(true);
  const [activeRecord, setActiveRecord] = useState<EditableRecord | null>(null);
  const [termPopup, setTermPopup] = useState<TermPopup | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [topFiltersOpen, setTopFiltersOpen] = useState(false);
  const [hasLoadedSavedData, setHasLoadedSavedData] = useState(false);
  const [remoteSaveEnabled, setRemoteSaveEnabled] = useState(false);
  const [saveStatus, setSaveStatus] = useState("読み込み中");
  const lastRemoteSavedAtRef = useRef<string | null>(null);
  const lastLocalChangeAtRef = useRef(0);
  const isApplyingRemoteRef = useRef(false);
  const latestDatabaseStateRef = useRef({
    events,
    people,
    termCards,
    countries,
    regions,
    customCategories,
    customGenres,
  });

  latestDatabaseStateRef.current = {
    events,
    people,
    termCards,
    countries,
    regions,
    customCategories,
    customGenres,
  };

  const timelineItems = useMemo(() => buildTimelineItems(people, events, personEvents), [people, events]);
  const categories = useMemo(
    () => baseCategories,
    [],
  );
  const termCategories = useMemo(
    () => uniqueValues([...baseTermCategories, ...termCards.map((term) => term.category)]),
    [termCards],
  );
  const personCategories = useMemo(
    () => uniqueValues(people.flatMap((person) => getPersonCategories(person))),
    [people],
  );
  const genres = useMemo(
    () =>
      uniqueValues([
        ...events.flatMap((event) => event.genres ?? []),
        ...people.flatMap((person) => person.genres ?? []),
        ...termCards.flatMap((term) => term.genres ?? []),
        ...customGenres,
      ]),
    [customGenres, events, people, termCards],
  );
  const eventGenres = useMemo(
    () =>
      uniqueValues([
        ...events.flatMap((event) => event.genres ?? []),
        ...customGenres,
      ]),
    [customGenres, events],
  );
  const filteredItems = useMemo(
    () =>
      timelineItems.filter((item) => {
        const matchesCategory = categoryFilters.length === 0 || categoryFilters.includes(item.category);
        const matchesSubCategory =
          eventGenreFilters.length === 0 ||
          (item.genres ?? []).some((genre) => eventGenreFilters.includes(genre));
        const itemCountryIds = getRecordCountryIds(item);
        const matchesCountry =
          countryFilters.length === 0 ||
          countryFilters.some(
            (countryId) =>
              itemCountryIds.includes(countryId) ||
              item.relatedCountries.includes(countryId) ||
              item.people.some((person) => getRecordCountryIds(person).includes(countryId)) ||
              item.people.some((person) => person.affiliations.includes(countryId)),
          );
        return matchesCategory && matchesSubCategory && matchesCountry;
      }),
    [categoryFilters, eventGenreFilters, countryFilters, timelineItems],
  );
  const searchedItems = useMemo(() => {
    if (!searchQuery.trim()) return filteredItems;
    return filteredItems.filter((item) =>
      matchesSearch(
        [
          item.title,
          item.category,
          item.summary,
          item.detail,
          item.locationName ?? "",
          blockText(item.contentBlocks),
          getRecordCountryIds(item).map((id) => getCountryName(countries, id)).join(" "),
          getRecordRegionIds(item).map((id) => getRegionName(regions, id)).join(" "),
          (item.genres ?? []).join(" "),
          (item.references ?? []).join(" "),
          item.people.map((person) => person.name).join(" "),
          item.terms.join(" "),
        ].join(" "),
        searchQuery,
      ),
    );
  }, [filteredItems, searchQuery, countries, regions]);

  const relatedPeople = useMemo(() => {
      const linkedIds = new Set(searchedItems.flatMap((item) => item.people.map((person) => person.id)));
    return people.filter((person) => {
      const matchesLinkedEvent = linkedIds.has(person.id);
      const matchesCountry = countryFilters.length === 0 || countryFilters.some((countryId) => getRecordCountryIds(person).includes(countryId));
      const matchesCategory = personCategoryFilters.length === 0 || personCategoryFilters.some((category) => getPersonCategories(person).includes(category));
      const matchesText =
        !searchQuery.trim() ||
        matchesSearch(
          [
            person.name,
            (person.aliases ?? []).join(" "),
            person.summary,
            blockText(person.contentBlocks),
            blockText(person.episodeBlocks),
            getRecordCountryIds(person).map((id) => getCountryName(countries, id)).join(" "),
            getRecordRegionIds(person).map((id) => getRegionName(regions, id)).join(" "),
            getPersonCategories(person).join(" "),
            (person.majorWorks ?? []).join(" "),
            (person.references ?? []).join(" "),
          ].join(" "),
          searchQuery,
        );
      return (matchesLinkedEvent || matchesCountry) && matchesCategory && matchesText;
    });
  }, [personCategoryFilters, countryFilters, searchedItems, people, searchQuery, countries, regions]);

  const termTargets = useMemo(() => {
    const targets = new Map<string, EditableRecord>();
    events.forEach((event) => {
      targets.set(event.title, { type: "event", id: event.id });
      (event.aliases ?? []).forEach((alias) => targets.set(alias, { type: "event", id: event.id }));
    });
    people.forEach((person) => {
      targets.set(person.name, { type: "person", id: person.id });
      (person.aliases ?? []).forEach((alias) => targets.set(alias, { type: "person", id: person.id }));
    });
    termCards.forEach((term) => {
      targets.set(term.term, { type: "term", id: term.id });
      term.aliases.forEach((alias) => targets.set(alias, { type: "term", id: term.id }));
    });
    return targets;
  }, [events, people, termCards]);

  const allCards = useMemo<KnowledgeCard[]>(() => {
    const eventCards = timelineItems.map((event) => ({
      id: event.id,
      type: "event" as const,
      title: event.title,
      aliases: event.aliases ?? [],
      label: `出来事 / ${event.category}`,
      summary: event.summary,
      meta: `${toLabelDate(event.startDate)}${event.endDate ? ` - ${toLabelDate(event.endDate)}` : ""}`,
      groupCategory: event.category,
      countryIds: getRecordCountryIds(event),
      tags: [event.category, ...(event.genres ?? [])],
      searchText: [
        event.title,
        (event.aliases ?? []).join(" "),
        event.category,
        event.summary,
        event.detail,
        event.locationName ?? "",
        blockText(event.contentBlocks),
        getRecordCountryIds(event).map((id) => getCountryName(countries, id)).join(" "),
        getRecordRegionIds(event).map((id) => getRegionName(regions, id)).join(" "),
        (event.genres ?? []).join(" "),
        (event.references ?? []).join(" "),
        event.terms.join(" "),
        event.people.map((person) => person.name).join(" "),
      ].join(" "),
    }));
    const personCards = people.map((person) => ({
      id: person.id,
      type: "person" as const,
      title: person.name,
      aliases: person.aliases ?? [],
      label: "人物",
      summary: person.summary,
      meta: toPersonLifeLabel(person),
      groupCategory: getPersonCategories(person)[0] ?? "未分類",
      countryIds: getRecordCountryIds(person),
      tags: getPersonCategories(person),
      searchText: [
        person.name,
        (person.aliases ?? []).join(" "),
        person.summary,
        blockText(person.contentBlocks),
        blockText(person.episodeBlocks),
        getRecordCountryIds(person).map((id) => getCountryName(countries, id)).join(" "),
        getRecordRegionIds(person).map((id) => getRegionName(regions, id)).join(" "),
        getPersonCategories(person).join(" "),
        (person.majorWorks ?? []).join(" "),
        (person.references ?? []).join(" "),
      ].join(" "),
    }));
    const termKnowledgeCards = termCards.map((term) => ({
      id: term.id,
      type: "term" as const,
      title: term.term,
      aliases: term.aliases,
      label: `単語 / ${term.category}`,
      summary: term.summary,
      meta: term.aliases.length ? `別名: ${term.aliases.join("、")}` : "単語カード",
      groupCategory: term.category,
      countryIds: [],
      tags: term.genres ?? [],
      searchText: [
        term.term,
        term.category,
        term.summary,
        term.detail,
        blockText(term.contentBlocks),
        term.aliases.join(" "),
        term.relatedTerms.join(" "),
        (term.genres ?? []).join(" "),
        (term.references ?? []).join(" "),
      ].join(" "),
    }));
    return [...eventCards, ...personCards, ...termKnowledgeCards];
  }, [timelineItems, people, termCards, countries, regions]);

  const searchedCards = useMemo(() => {
    if (!searchQuery.trim()) return allCards;
    return allCards.filter((card) => matchesSearch(card.searchText, searchQuery));
  }, [allCards, searchQuery]);
  const searchedTermCards = useMemo(
    () => searchedCards.filter((card) => card.type === "term"),
    [searchedCards],
  );

  const activeEvent =
    activeRecord?.type === "event" ? events.find((event) => event.id === activeRecord.id) ?? null : null;
  const activePerson =
    activeRecord?.type === "person" ? people.find((person) => person.id === activeRecord.id) ?? null : null;
  const activeTerm =
    activeRecord?.type === "term" ? termCards.find((term) => term.id === activeRecord.id) ?? null : null;

  function applyPersistedDatabase(saved: PersistedDatabase) {
    isApplyingRemoteRef.current = true;
    setEvents(mergeById(seedEvents.map(normalizeEvent), saved.events?.map(normalizeEvent)));
    setPeople(mergeById(seedPeople.map(normalizePerson), saved.people?.map(normalizePerson)));
    setTermCards(mergeById(seedTermCards.map(normalizeTermCard), saved.termCards?.map(normalizeTermCard)));
    setCountries(mergeById(seedCountries, saved.countries).map((country) => ({ ...country, aliases: country.aliases ?? [] })));
    setRegions(mergeById(seedRegions, saved.regions));
    setCustomCategories(uniqueValues(saved.customCategories ?? []));
    setCustomGenres(uniqueValues(saved.customGenres ?? []));
    window.setTimeout(() => {
      isApplyingRemoteRef.current = false;
    }, 0);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadSavedData() {
      try {
        const response = await fetch("/api/data", { headers: { accept: "application/json" } });
        const remoteData = response.ok ? ((await response.json()) as PersistedDatabase | null) : null;
        if (!cancelled && response.ok) setRemoteSaveEnabled(true);
        if (!cancelled && remoteData?.savedAt) lastRemoteSavedAtRef.current = remoteData.savedAt;
        const saved = remoteData ?? readLocalDatabase();
        if (!cancelled && saved) {
          applyPersistedDatabase(saved);
          setSaveStatus(remoteData ? "保存済みデータを読み込みました" : "ブラウザ内データを読み込みました");
        }
        if (!cancelled && !saved) {
          setSaveStatus("初期データ");
        }
      } catch {
        if (!cancelled) setRemoteSaveEnabled(false);
        const localData = readLocalDatabase();
        if (!cancelled && localData) {
          applyPersistedDatabase(localData);
          setSaveStatus("ブラウザ内データを読み込みました");
        }
        if (!cancelled && !localData) {
          setSaveStatus("初期データ");
        }
      } finally {
        if (!cancelled) setHasLoadedSavedData(true);
      }
    }

    loadSavedData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedSavedData) return;
    if (!isApplyingRemoteRef.current) lastLocalChangeAtRef.current = Date.now();
    const data = createPersistedDatabase({
      events,
      people,
      termCards,
      countries,
      regions,
      customCategories,
      customGenres,
    });
    const savedLocally = writeLocalDatabase(data);
    setSaveStatus(remoteSaveEnabled ? "本番へ保存中" : savedLocally ? "この端末のみ保存" : "保存失敗");

    const timeout = window.setTimeout(async () => {
      if (!remoteSaveEnabled) return;
      try {
        const response = await fetch("/api/data", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        });
        if (response.ok) {
          const result = (await response.json()) as { savedAt?: string };
          if (result.savedAt) lastRemoteSavedAtRef.current = result.savedAt;
        }
        setSaveStatus(response.ok ? "本番保存済み" : savedLocally ? "この端末のみ保存" : "保存失敗");
      } catch {
        setSaveStatus(savedLocally ? "この端末のみ保存" : "保存失敗");
      }
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [events, people, termCards, countries, regions, customCategories, customGenres, hasLoadedSavedData, remoteSaveEnabled]);

  useEffect(() => {
    if (!hasLoadedSavedData || !remoteSaveEnabled) return;

    let cancelled = false;

    async function syncFromRemote() {
      if (document.visibilityState === "hidden") return;
      if (activeRecord || detailEditMode) return;
      if (Date.now() - lastLocalChangeAtRef.current < 2500) return;

      try {
        const response = await fetch("/api/data", { headers: { accept: "application/json" } });
        const remoteData = response.ok ? ((await response.json()) as PersistedDatabase | null) : null;
        if (cancelled || !remoteData?.savedAt) return;
        if (remoteData.savedAt === lastRemoteSavedAtRef.current) return;
        lastRemoteSavedAtRef.current = remoteData.savedAt;
        applyPersistedDatabase(remoteData);
        setSaveStatus("本番データを同期しました");
      } catch {
        // Keep the current screen as-is if the network is temporarily unavailable.
      }
    }

    const interval = window.setInterval(syncFromRemote, 20000);
    window.addEventListener("focus", syncFromRemote);
    document.addEventListener("visibilitychange", syncFromRemote);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", syncFromRemote);
      document.removeEventListener("visibilitychange", syncFromRemote);
    };
  }, [activeRecord, detailEditMode, hasLoadedSavedData, remoteSaveEnabled]);

  useEffect(() => {
    if (!hasLoadedSavedData) return;

    function persistLatestLocalData() {
      writeLocalDatabase(createPersistedDatabase(latestDatabaseStateRef.current));
    }

    window.addEventListener("pagehide", persistLatestLocalData);
    window.addEventListener("beforeunload", persistLatestLocalData);
    return () => {
      window.removeEventListener("pagehide", persistLatestLocalData);
      window.removeEventListener("beforeunload", persistLatestLocalData);
    };
  }, [hasLoadedSavedData]);

  function updateEvent(id: string, patch: Partial<Event>) {
    setEvents((current) => current.map((event) => (event.id === id ? { ...event, ...patch } : event)));
  }

  function updatePerson(id: string, patch: Partial<Person>) {
    setPeople((current) => current.map((person) => (person.id === id ? { ...person, ...patch } : person)));
  }

  function updateTermCard(id: string, patch: Partial<TermCard>) {
    setTermCards((current) => current.map((term) => (term.id === id ? { ...term, ...patch } : term)));
  }

  function updatePersonWorks(id: string, works: string[]) {
    const nextWorks = uniqueValues(works.map((work) => work.trim()));
    setPeople((current) => current.map((person) => (person.id === id ? { ...person, majorWorks: nextWorks } : person)));
    setTermCards((current) => {
      const existingTerms = new Set(current.map((term) => term.term));
      const newWorkTerms = nextWorks
        .filter((work) => work && !existingTerms.has(work))
        .map((work): TermCard => ({
          id: makeId("term"),
          term: work,
          category: "著作",
          summary: "著作の概要を入力してください。",
          detail: "著作の詳細を入力してください。",
          aliases: [],
          relatedTerms: [],
          contentBlocks: [],
          genres: ["著作"],
          imageUrls: [],
          references: [],
          learningFiles: [],
        }));
      return [...current, ...newWorkTerms];
    });
  }

  function deleteEvent(id: string) {
    if (!window.confirm("本当にこの出来事を削除しますか？")) return;
    setEvents((current) => current.filter((event) => event.id !== id));
    setActiveRecord(null);
    setTermPopup(null);
    setDetailEditMode(false);
  }

  function deletePerson(id: string) {
    if (!window.confirm("本当にこの人物を削除しますか？")) return;
    setPeople((current) => current.filter((person) => person.id !== id));
    setActiveRecord(null);
    setTermPopup(null);
    setDetailEditMode(false);
  }

  function deleteTermCard(id: string) {
    if (!window.confirm("本当にこの単語カードを削除しますか？")) return;
    setTermCards((current) => current.filter((term) => term.id !== id));
    setActiveRecord(null);
    setTermPopup(null);
    setDetailEditMode(false);
  }

  function deleteEventCategory(targetCategory: string) {
    if (targetCategory === "all") return;
    if (!window.confirm(`本当に「${targetCategory}」を出来事カテゴリから削除しますか？`)) return;
    setEvents((current) =>
      current.map((event) => (event.category === targetCategory ? { ...event, category: "未分類" } : event)),
    );
    setCustomCategories((current) => current.filter((candidate) => candidate !== targetCategory));
    setCategoryFilters((current) => current.filter((category) => category !== targetCategory));
  }

  function deleteEventGenre(targetGenre: string) {
    if (!window.confirm(`本当に「${targetGenre}」を出来事小カテゴリから削除しますか？`)) return;
    setEvents((current) =>
      current.map((event) => ({
        ...event,
        genres: (event.genres ?? []).filter((candidate) => candidate !== targetGenre),
      })),
    );
    setPeople((current) =>
      current.map((person) => ({
        ...person,
        genres: (person.genres ?? []).filter((candidate) => candidate !== targetGenre),
      })),
    );
    setTermCards((current) =>
      current.map((term) => ({
        ...term,
        genres: (term.genres ?? []).filter((candidate) => candidate !== targetGenre),
      })),
    );
    setCustomGenres((current) => current.filter((candidate) => candidate !== targetGenre));
    setEventGenreFilters((current) => current.filter((genre) => genre !== targetGenre));
  }

  function deletePersonCategory(targetCategory: string) {
    if (targetCategory === "all") return;
    if (!window.confirm(`本当に「${targetCategory}」を人物カテゴリから削除しますか？`)) return;
    setPeople((current) =>
      current.map((person) => ({
        ...person,
        affiliations: (person.affiliations ?? []).filter((candidate) => candidate !== targetCategory),
        genres: (person.genres ?? []).filter((candidate) => candidate !== targetCategory),
      })),
    );
    setCustomGenres((current) => current.filter((candidate) => candidate !== targetCategory));
    setPersonCategoryFilters((current) => current.filter((category) => category !== targetCategory));
  }

  function deleteCountry(targetCountryId: string) {
    if (targetCountryId === "all") return;
    const targetCountry = countries.find((candidate) => candidate.id === targetCountryId);
    if (!targetCountry) return;
    if (!window.confirm(`本当に「${targetCountry.name}」を国から削除しますか？`)) return;
    const removedRegionIds = new Set(regions.filter((region) => region.countryId === targetCountryId).map((region) => region.id));
    setEvents((current) =>
      current.map((event) => ({
        ...event,
        countryIds: (event.countryIds ?? []).filter((id) => id !== targetCountryId),
        regionIds: (event.regionIds ?? []).filter((id) => !removedRegionIds.has(id)),
        relatedCountries: event.relatedCountries.filter((name) => name !== targetCountry.name),
      })),
    );
    setPeople((current) =>
      current.map((person) => ({
        ...person,
        countryIds: (person.countryIds ?? []).filter((id) => id !== targetCountryId),
        regionIds: (person.regionIds ?? []).filter((id) => !removedRegionIds.has(id)),
      })),
    );
    setRegions((current) => current.filter((region) => region.countryId !== targetCountryId));
    setCountries((current) => current.filter((candidate) => candidate.id !== targetCountryId));
    setCountryFilters((current) => current.filter((countryId) => countryId !== targetCountryId));
    if (newRegionCountryId === targetCountryId) setNewRegionCountryId(countries.find((candidate) => candidate.id !== targetCountryId)?.id ?? "");
  }

  function openRecord(record: EditableRecord) {
    setActiveRecord(record);
    setDetailEditMode(false);
    setTermPopup(null);
    setTopFiltersOpen(false);
  }

  function addEvent() {
    const id = makeId("event");
    const newEvent: Event = {
      id,
      title: "新しい出来事",
      aliases: [],
      startDate: "1914-01-01",
      category: "イベント",
      relatedCountries: [],
      countryIds: [],
      regionIds: [],
      summary: "概要を入力してください。",
      detail: "詳細を入力してください。",
      terms: [],
      contentBlocks: [],
      genres: [],
      imageUrls: [],
      references: [],
      learningFiles: [],
    };
    setEvents((current) => [...current, newEvent]);
    setActiveRecord({ type: "event", id });
    setDetailEditMode(true);
    setTopFiltersOpen(false);
  }

  function addPerson() {
    const id = makeId("person");
    const newPerson: Person = {
      id,
      name: "新しい人物",
      aliases: [],
      birthYear: 1900,
      deathYear: 1970,
      countryIds: [],
      regionIds: [],
      affiliations: [],
      summary: "人物の概要を入力してください。",
      majorWorks: [],
      episodeBlocks: [],
      contentBlocks: [],
      genres: [],
      imageUrls: [],
      references: [],
      learningFiles: [],
    };
    setPeople((current) => [...current, newPerson]);
    setActiveRecord({ type: "person", id });
    setDetailEditMode(true);
    setTopFiltersOpen(false);
  }

  function addTermCard() {
    const id = makeId("term");
    const newTerm: TermCard = {
      id,
      term: "新しい単語",
      category: "用語",
      summary: "単語の概要を入力してください。",
      detail: "単語の詳細を入力してください。",
      aliases: [],
      relatedTerms: [],
      contentBlocks: [],
      genres: [],
      imageUrls: [],
      references: [],
      learningFiles: [],
    };
    setTermCards((current) => [...current, newTerm]);
    setActiveRecord({ type: "term", id });
    setDetailEditMode(true);
    setTopFiltersOpen(false);
  }

  function openTerm(term: string) {
    const termCard = termCards.find((candidate) => candidate.term === term || candidate.aliases.includes(term));
    setTermPopup({
      term,
      definition: termCard?.summary ?? glossary[term] ?? "この用語の解説はまだ未登録です。詳細カードや用語辞書に追記できます。",
      target: termCard ? { type: "term", id: termCard.id } : termTargets.get(term),
    });
  }

  function addCategory() {
    const next = newCategoryName.trim();
    if (!next) return;
    addEventCategoryFilter(next);
    setNewCategoryName("");
  }

  function addGenre() {
    const next = newGenreName.trim();
    if (!next) return;
    const target = activeEvent ?? activePerson ?? activeTerm;
    if (activeEvent) updateEvent(activeEvent.id, { genres: uniqueValues([...(activeEvent.genres ?? []), next]) });
    if (activePerson) updatePerson(activePerson.id, { genres: uniqueValues([...(activePerson.genres ?? []), next]) });
    if (activeTerm) updateTermCard(activeTerm.id, { genres: uniqueValues([...(activeTerm.genres ?? []), next]) });
    if (!target) {
      setCustomGenres((current) => uniqueValues([...current, next]));
    }
    setNewGenreName("");
  }

  function addEventCategoryFilter(value: string) {
    const next = value.trim();
    if (!next) return;
    setCustomCategories((current) => uniqueValues([...current, next]));
    setCategoryFilters((current) => uniqueValues([...current, next]));
  }

  function addEventGenreFilter(value: string) {
    const next = value.trim();
    if (!next) return;
    setCustomGenres((current) => uniqueValues([...current, next]));
    setEventGenreFilters((current) => uniqueValues([...current, next]));
  }

  function addPersonCategoryFilter(value: string) {
    const next = value.trim();
    if (!next) return;
    setCustomGenres((current) => uniqueValues([...current, next]));
    setPersonCategoryFilters((current) => uniqueValues([...current, next]));
  }

  function addCountryFilter(value: string) {
    const id = resolveCountryInput(value);
    if (!id) return;
    setCountryFilters((current) => uniqueValues([...current, id]));
  }

  function addCountry() {
    const name = newCountryName.trim();
    if (!name) return;
    const id = makeId("country");
    setCountries((current) => [...current, { id, name }]);
    setNewCountryName("");
    setNewRegionCountryId(id);
  }

  function resolveCountryInput(value: string) {
    const name = value.trim();
    if (!name) return undefined;
    const normalizedName = normalizeLocationName(name);
    const existing = countries.find(
      (candidate) => candidate.id === name || normalizeLocationName(candidate.name) === normalizedName,
    );
    if (existing) return existing.id;
    const id = makeId("country");
    setCountries((current) => {
      const duplicate = current.find((candidate) => normalizeLocationName(candidate.name) === normalizedName);
      return duplicate ? current : [...current, { id, name }];
    });
    setNewRegionCountryId(id);
    return id;
  }

  function addRegion() {
    const name = newRegionName.trim();
    const latitude = Number(newRegionLatitude);
    const longitude = Number(newRegionLongitude);
    if (!name || !newRegionCountryId || Number.isNaN(latitude) || Number.isNaN(longitude)) return;
    setRegions((current) => [
      ...current,
      {
        id: makeId("region"),
        countryId: newRegionCountryId,
        name,
        latitude,
        longitude,
      },
    ]);
    setNewRegionName("");
    setNewRegionLatitude("");
    setNewRegionLongitude("");
  }

  function renderLinkedText(text: string, terms: string[]) {
    const candidates = Array.from(new Set([...terms, ...Object.keys(glossary), ...termTargets.keys()])).sort(
      (a, b) => b.length - a.length,
    );
    if (candidates.length === 0) return text;

    const pattern = new RegExp(`(${candidates.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
    return text.split(pattern).map((part, index) =>
      candidates.includes(part) ? (
        <button className="inline-term" key={`${part}-${index}`} type="button" onClick={() => openTerm(part)}>
          {part}
        </button>
      ) : (
        <span key={`${part}-${index}`}>{part}</span>
      ),
    );
  }

  const activeView = viewModes.find((view) => view.id === viewMode) ?? viewModes[0];

  return (
    <main className="app-shell">
      <section className="workspace">
        <aside className={`control-panel ${mobileFiltersOpen ? "mobile-open" : ""}`} aria-label="検索条件">
          <div className="panel-title">
            <span className="brand-mark">歴史DB</span>
          </div>

          <div className="view-tabs" role="tablist" aria-label="表示ビュー">
            {viewModes.map((view) => {
              const Icon = view.icon;
              return (
                <button
                  aria-selected={viewMode === view.id}
                  className={viewMode === view.id ? "active" : ""}
                  key={view.id}
                  onClick={() => {
                    setViewMode(view.id);
                    setActiveRecord(null);
                    setTermPopup(null);
                    setDetailEditMode(false);
                    setMobileFiltersOpen(false);
                  }}
                  type="button"
                >
                  <Icon size={16} />
                  {view.label}
                </button>
              );
            })}
          </div>

        </aside>

        <section className="database-area">
          <div className="top-bar">
            <button
              aria-label="ビュー選択を開く"
              className="mobile-menu-button"
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
            >
              <Menu size={18} />
              <span>{activeView.label}</span>
            </button>
            <span className="save-status">{saveStatus}</span>
            <div className="top-search-filter">
              <label className="top-search-box">
                <Search size={15} />
                <input
                  placeholder="ページ内検索"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </label>
              <button
                className={`mobile-filter-toggle ${topFiltersOpen ? "active" : ""}`}
                type="button"
                onClick={() => setTopFiltersOpen((open) => !open)}
              >
                <Filter size={15} />
                絞り込み
              </button>
            </div>
            <div className="action-toolbar">
              <button type="button" onClick={addEvent}>
                <Plus size={15} />
                出来事
              </button>
              <button type="button" onClick={addPerson}>
                <Plus size={15} />
                人物
              </button>
              <button type="button" onClick={addTermCard}>
                <Plus size={15} />
                単語
              </button>
              <button
                className={showEraPeriods ? "active-tool" : ""}
                type="button"
                onClick={() => setShowEraPeriods((value) => !value)}
              >
                時代区分
              </button>
            </div>
          </div>
          <div className={`top-filter-panel ${topFiltersOpen ? "mobile-open" : ""}`}>
              {(viewMode === "category" || viewMode === "people" || viewMode === "terms") && (
                <div className="group-mode-control">
                  <span>表示</span>
                  <div>
                    {[
                      { id: "all", label: "全カード" },
                      { id: "category", label: "カテゴリ別" },
                      { id: "country", label: "国別" },
                    ].map((mode) => (
                      <button
                        className={cardGroupMode === mode.id ? "active" : ""}
                        key={mode.id}
                        type="button"
                        onClick={() => setCardGroupMode(mode.id as CardGroupMode)}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <FilterSearchSelect
                label="出来事カテゴリ"
                values={categoryFilters}
                onChange={(values) => setCategoryFilters(values as Category[])}
                options={categories
                  .filter((value, index, array) => array.indexOf(value) === index)
                  .map((candidate) => ({ value: candidate, label: candidate }))}
                placeholder="出来事カテゴリを検索"
              />
              <FilterSearchSelect
                label="出来事小カテゴリ"
                values={eventGenreFilters}
                onChange={setEventGenreFilters}
                onDelete={deleteEventGenre}
                onCreate={addEventGenreFilter}
                options={eventGenres.map((candidate) => ({ value: candidate, label: candidate }))}
                placeholder="出来事小カテゴリを検索"
              />
              <FilterSearchSelect
                label="人物カテゴリ"
                values={personCategoryFilters}
                onChange={setPersonCategoryFilters}
                onDelete={deletePersonCategory}
                onCreate={addPersonCategoryFilter}
                options={personCategories
                  .filter((value, index, array) => array.indexOf(value) === index)
                  .map((candidate) => ({ value: candidate, label: candidate }))}
                placeholder="人物カテゴリを検索"
              />
              <FilterSearchSelect
                label="国"
                values={countryFilters}
                onChange={setCountryFilters}
                onDelete={deleteCountry}
                onCreate={addCountryFilter}
                options={countries.map((candidate) => ({ value: candidate.id, label: candidate.name }))}
                placeholder="国を検索"
              />
              <button
                className="reset-button"
                type="button"
                onClick={() => {
                  setCategoryFilters([]);
                  setEventGenreFilters([]);
                  setPersonCategoryFilters([]);
                  setCountryFilters([]);
                  setSearchQuery("");
                }}
              >
                <RotateCcw size={16} />
                リセット
              </button>
            </div>

          {viewMode === "timeline" && (
            <TimelineView
              items={searchedItems}
              people={relatedPeople}
              countriesFilter={countryFilters}
              zoom={timelineZoom}
              heightZoom={timelineHeightZoom}
              laneMode={timelineLaneMode}
              countries={countries}
              eras={showEraPeriods ? seedEraPeriods : []}
              onZoomChange={setTimelineZoom}
              onOpenRecord={openRecord}
            />
          )}

          {viewMode === "category" && (
            <CategoryView
              countries={countries}
              groupMode={cardGroupMode}
              items={searchedItems}
              onOpenRecord={(id) => openRecord({ type: "event", id })}
            />
          )}

          {viewMode === "people" && (
            <PeopleView
              countries={countries}
              groupMode={cardGroupMode}
              people={relatedPeople}
              onOpenRecord={(id) => openRecord({ type: "person", id })}
            />
          )}

          {viewMode === "terms" && (
            <AllCardsView cards={searchedTermCards} countries={countries} groupMode={cardGroupMode} compact onOpenRecord={openRecord} />
          )}

          {viewMode === "cards" && (
            <AllCardsView cards={searchedCards} onOpenRecord={openRecord} />
          )}

          {viewMode === "map" && (
            <MapView
              items={searchedItems}
              countries={countries}
              regions={regions}
              onOpenRecord={openRecord}
              onUpdateEvent={updateEvent}
            />
          )}
        </section>
        {(activeEvent || activePerson || activeTerm) && (
          <DetailPanel
            event={activeEvent}
            person={activePerson}
            term={activeTerm}
            termCards={termCards}
            allCards={allCards}
            onClose={() => {
              setActiveRecord(null);
              setTermPopup(null);
              setDetailEditMode(false);
            }}
            onOpenRecord={openRecord}
            editMode={detailEditMode}
            onEditModeChange={setDetailEditMode}
            categories={categories}
            termCategories={termCategories}
            personCategories={personCategories}
            genres={genres}
            countries={countries}
            regions={regions}
            onUpdateEvent={updateEvent}
            onUpdatePerson={updatePerson}
            onUpdatePersonWorks={updatePersonWorks}
            onUpdateTerm={updateTermCard}
            onDeleteEvent={deleteEvent}
            onDeletePerson={deletePerson}
            onDeleteTerm={deleteTermCard}
            onResolveCountry={resolveCountryInput}
            renderLinkedText={renderLinkedText}
            termPopup={termPopup}
          />
        )}
        {mobileFiltersOpen && (
          <button
            aria-label="絞り込みを閉じる"
            className="mobile-filter-backdrop"
            type="button"
            onClick={() => setMobileFiltersOpen(false)}
          />
        )}
      </section>
    </main>
  );
}

function TimelineView({
  items,
  people,
  countriesFilter,
  zoom,
  heightZoom,
  laneMode,
  countries,
  eras,
  onZoomChange,
  onOpenRecord,
}: {
  items: TimelineItem[];
  people: Person[];
  countriesFilter: string[];
  zoom: number;
  heightZoom: number;
  laneMode: TimelineLaneMode;
  countries: Country[];
  eras: EraPeriod[];
  onZoomChange: (updater: (value: number) => number) => void;
  onOpenRecord: (record: EditableRecord) => void;
}) {
  const pinchDistanceRef = useRef<number | null>(null);
  const pendingTimelineAnchorRef = useRef<{ ratio: number; viewportX: number } | null>(null);
  const timelineBoardRef = useRef<HTMLDivElement | null>(null);
  const [timelineScrollLeft, setTimelineScrollLeft] = useState(0);
  const [timelineScrollMax, setTimelineScrollMax] = useState(0);
  const [timelineClientWidth, setTimelineClientWidth] = useState(800);
  const eventYears = items.flatMap((item) => [
    getTimelineYearPosition(item.startDate),
    item.endDate ? getTimelineYearPosition(item.endDate) : getTimelineYearPosition(item.startDate),
  ]);
  const personYears = people.flatMap((person) => [getTimelineYearPosition(getPersonBirthDate(person)), getTimelineYearPosition(getPersonDeathDate(person))]);
  const hasTimelineData = eventYears.length > 0 || personYears.length > 0;
  const allTimelineYears = [...eventYears, ...personYears];
  const currentYear = new Date().getFullYear();
  const minYear = hasTimelineData ? Math.floor(Math.min(...allTimelineYears) / 10) * 10 : 0;
  const maxYear = hasTimelineData ? Math.ceil(Math.max(...allTimelineYears, currentYear) / 10) * 10 : Math.ceil(currentYear / 10) * 10;
  const span = maxYear - minYear || 1;
  const timelinePixelWidth = getTimelinePixelWidth(span, zoom);
  const tickStep = getYearTickStep(zoom, span);
  const firstTick = Math.ceil(minYear / tickStep) * tickStep;
  const yearTicks = Array.from(
    { length: Math.floor((maxYear - firstTick) / tickStep) + 1 },
    (_, index) => firstTick + index * tickStep,
  );
  const countryLanes =
    laneMode === "plain"
        ? sortEventCategories(Array.from(new Set(items.map((item) => item.category || "未分類"))))
        : countriesFilter.length > 0
          ? countriesFilter
          : Array.from(new Set(items.flatMap((item) => (getRecordCountryIds(item).length ? getRecordCountryIds(item) : ["unclassified"])))).slice(0, 20);
  const visibleEras = eras.filter((era) => era.endYear >= minYear && era.startYear <= maxYear);
  const eraGroups = Array.from(new Set(visibleEras.map((era) => era.group)));
  const eraRowHeight = 28;
  const eraHeight = visibleEras.length > 0 ? eraGroups.length * eraRowHeight + 10 : 0;

  function positionPercent(date: string) {
    return Math.min(100, Math.max(0, ((getTimelineYearPosition(date) - minYear) / span) * 100));
  }

  function positionYearPercent(year: number) {
    return Math.min(100, Math.max(0, ((year - minYear) / span) * 100));
  }

  const eventPlacements: EventPlacement[] = (() => {
    const placements = items.flatMap((item) => {
      const targetCountries =
        laneMode === "plain"
          ? [item.category || "未分類"]
          : countriesFilter.length > 0
            ? countriesFilter
            : getRecordCountryIds(item).length
              ? getRecordCountryIds(item)
              : ["unclassified"];
      return targetCountries
        .filter((targetCountry) => countryLanes.includes(targetCountry))
        .map((targetCountry) => {
          const left = positionPercent(item.startDate);
          const right = item.endDate ? positionPercent(item.endDate) : left;
          const titleVisualWidth = Math.min(34, Math.max(4, ((item.title.length * 13 + 64) / Math.max(timelinePixelWidth, 1)) * 100));
          const dateVisualWidth = item.displayType === "Point" ? 8 : Math.max(right - left, 0.08);
          return {
            item,
            lane: Math.max(0, countryLanes.indexOf(targetCountry)),
            country: targetCountry,
            left,
            width: item.displayType === "Point" ? 0.08 : Math.max(right - left, 0.001),
            visualWidth: Math.max(dateVisualWidth, titleVisualWidth),
            stack: 0,
          };
        });
    });
    const stacksByLane = new Map<number, number[]>();
    placements
      .sort((a, b) => a.lane - b.lane || a.left - b.left)
      .forEach((placement) => {
        const stacks = stacksByLane.get(placement.lane) ?? [];
        const visualWidth = placement.visualWidth;
        const stack = stacks.findIndex((end) => placement.left > end + 0.8);
        const nextStack = stack === -1 ? stacks.length : stack;
        placement.stack = nextStack;
        stacks[nextStack] = placement.left + visualWidth;
        stacksByLane.set(placement.lane, stacks);
      });
    return placements;
  })();

  const viewportMinYear = minYear + (timelineScrollLeft / Math.max(timelinePixelWidth, 1)) * span;
  const viewportMaxYear = viewportMinYear + (timelineClientWidth / Math.max(timelinePixelWidth, 1)) * span;

  const isPlacementVisible = (placement: EventPlacement) => {
    const itemStart = getTimelineYearPosition(placement.item.startDate);
    const itemEnd = placement.item.endDate ? getTimelineYearPosition(placement.item.endDate) : itemStart;
    return itemStart <= viewportMaxYear + 2 && itemEnd >= viewportMinYear - 2;
  };

  const maxStackByLane = new Map<number, number>();
  eventPlacements.forEach((placement) => {
    if (isPlacementVisible(placement)) {
      const current = maxStackByLane.get(placement.lane) ?? -1;
      maxStackByLane.set(placement.lane, Math.max(current, placement.stack));
    }
  });

  const laneRowHeights: number[] = [];
  const laneTops: number[] = [];
  let currentTop = eraHeight;
  for (let i = 0; i < countryLanes.length; i++) {
    laneTops.push(currentTop);
    const stack = maxStackByLane.get(i) ?? -1;
    const laneHeight = stack === -1 
      ? 0 
      : Math.max(80, Math.round((70 + stack * 34) * heightZoom));
    laneRowHeights.push(laneHeight);
    currentTop += laneHeight;
  }
  const totalCountryLanesHeight = currentTop - eraHeight;

  const personPlacements = people
    .map((person) => {
      const left = positionPercent(getPersonBirthDate(person));
      const right = positionPercent(getPersonDeathTimelineDate(person));
      return {
        person,
        left,
        width: Math.max(right - left, 0.08),
        visualWidth: Math.max(right - left, 4),
        stack: 0,
      };
    })
    .sort((a, b) => a.left - b.left);
  const personStackEnds: number[] = [];
  personPlacements.forEach((placement) => {
    const stack = personStackEnds.findIndex((end) => placement.left > end + 1);
    const nextStack = stack === -1 ? personStackEnds.length : stack;
    placement.stack = nextStack;
    personStackEnds[nextStack] = placement.left + placement.visualWidth;
  });
  const personStackCount = Math.max(1, personStackEnds.length);
  const personRowHeight = Math.max(140, Math.round((68 + personStackCount * 26) * heightZoom));

  function rowTop(lane: number) {
    return laneTops[lane];
  }

  function zoomBy(factor: number, viewportX?: number) {
    const element = timelineBoardRef.current;
    if (element && viewportX !== undefined) {
      pendingTimelineAnchorRef.current = {
        ratio: (element.scrollLeft + viewportX) / Math.max(element.scrollWidth, 1),
        viewportX,
      };
    }
    onZoomChange((current) => clampTimelineZoom(current * factor));
  }

  function handleTimelineWheel(event: WheelEvent<HTMLDivElement>) {
    if (!event.metaKey && !event.ctrlKey) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    zoomBy(Math.exp(-event.deltaY * 0.0012), event.clientX - rect.left);
  }

  function getTouchDistance(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length < 2) return null;
    const [first, second] = [event.touches[0], event.touches[1]];
    return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
  }

  function handleTimelineTouchStart(event: TouchEvent<HTMLDivElement>) {
    pinchDistanceRef.current = getTouchDistance(event);
  }

  function handleTimelineTouchMove(event: TouchEvent<HTMLDivElement>) {
    const nextDistance = getTouchDistance(event);
    const previousDistance = pinchDistanceRef.current;
    if (!nextDistance || !previousDistance) return;
    event.preventDefault();
    const factor = Math.min(1.18, Math.max(0.85, nextDistance / previousDistance));
    const rect = event.currentTarget.getBoundingClientRect();
    const midpointX = (event.touches[0].clientX + event.touches[1].clientX) / 2 - rect.left;
    zoomBy(factor, midpointX);
    pinchDistanceRef.current = nextDistance;
  }

  function handleTimelineTouchEnd() {
    pinchDistanceRef.current = null;
  }

  function updateTimelineScrollState() {
    const element = timelineBoardRef.current;
    if (!element) return;
    setTimelineScrollLeft(element.scrollLeft);
    setTimelineScrollMax(Math.max(0, element.scrollWidth - element.clientWidth));
    setTimelineClientWidth(element.clientWidth);
  }

  useLayoutEffect(() => {
    const anchor = pendingTimelineAnchorRef.current;
    const element = timelineBoardRef.current;
    if (anchor && element) {
      const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth);
      element.scrollLeft = Math.min(maxScroll, Math.max(0, anchor.ratio * element.scrollWidth - anchor.viewportX));
      pendingTimelineAnchorRef.current = null;
    }
    updateTimelineScrollState();
  }, [timelinePixelWidth]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateTimelineScrollState);
    window.addEventListener("resize", updateTimelineScrollState);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateTimelineScrollState);
    };
  }, [timelinePixelWidth]);

  if (!hasTimelineData) {
    return (
      <div className="timeline-board">
        <div className="empty-state">
          <BookOpen size={22} />
          <span>該当する年表データがありません</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="timeline-board"
      ref={timelineBoardRef}
      onScroll={updateTimelineScrollState}
      onWheel={handleTimelineWheel}
      onTouchStart={handleTimelineTouchStart}
      onTouchMove={handleTimelineTouchMove}
      onTouchEnd={handleTimelineTouchEnd}
      onTouchCancel={handleTimelineTouchEnd}
      style={
        {
          "--timeline-width": `${Math.round(timelinePixelWidth)}px`,
          "--total-country-lanes-height": `${totalCountryLanesHeight}px`,
          "--person-row-height": `${personRowHeight}px`,
          "--era-height": `${eraHeight}px`,
        } as CSSProperties
      }
    >
      <div className="timeline-scale" aria-hidden="true">
        {yearTicks.map((year) => (
          <span key={year} style={{ "--left": `${positionYearPercent(year)}%` } as CSSProperties}>
            {toDisplayYear(year)}
          </span>
        ))}
      </div>

      <div className="timeline-grid" style={{ "--country-rows": countryLanes.length } as CSSProperties}>
        <div className="lane-canvas">
          <div className="timeline-tick-lines" aria-hidden="true" style={{ bottom: 0, height: eraHeight + totalCountryLanesHeight + personRowHeight }}>
            {yearTicks.map((year) => (
              <span key={year} style={{ "--left": `${positionYearPercent(year)}%` } as CSSProperties} />
            ))}
          </div>
          {visibleEras.length > 0 && (
            <div className="era-band-layer">
              {visibleEras.map((era) => {
                const start = Math.max(era.startYear, minYear);
                const end = Math.min(era.endYear, maxYear);
                const startPercent = positionYearPercent(start);
                const endPercent = positionYearPercent(end);
                const bandWidthPercent = Math.max(endPercent - startPercent, 0.4);
                const bandStartPx = (startPercent / 100) * timelinePixelWidth;
                const bandWidthPx = (bandWidthPercent / 100) * timelinePixelWidth;
                const labelLeftPx = Math.min(
                  Math.max(timelineScrollLeft - bandStartPx + 10, 0),
                  Math.max(bandWidthPx - 86, 0),
                );
                return (
                  <span
                    className="era-band"
                    key={era.id}
                    style={
                      {
                        "--left": `${startPercent}%`,
                        "--width": `${bandWidthPercent}%`,
                        "--label-left": `${labelLeftPx}px`,
                        "--era-row": eraGroups.indexOf(era.group),
                        "--era-color": era.color,
                      } as CSSProperties
                    }
                    title={`${era.group}: ${era.name} (${toDisplayYear(era.startYear)}-${toDisplayYear(era.endYear)})`}
                  >
                    <span className="era-band-label">
                      <small>{era.group}</small>
                      {era.name}
                    </span>
                  </span>
                );
              })}
            </div>
          )}
          {countryLanes.map((lane, index) => {
            const laneHeight = laneRowHeights[index];
            if (laneHeight === 0) return null;
            return (
              <div className="country-lane" key={lane} style={{ "--lane-top": `${laneTops[index]}px`, "--lane-height": `${laneHeight}px` } as CSSProperties}>
                {laneMode !== "plain" && <span className="lane-label-text">{lane}</span>}
              </div>
            );
          })}
          <div className="person-lane" style={{ "--lane-top": `${eraHeight + totalCountryLanesHeight}px`, height: `${personRowHeight}px` } as CSSProperties} />

          {eventPlacements.map((placement) => {
            const { item } = placement;
            const categoryColor = getEventCategoryColor(item.category);
            return (
              <button
                className={`timeline-card ${item.displayType.toLowerCase()}`}
                key={`${item.id}-${placement.country}`}
                onClick={() => onOpenRecord({ type: "event", id: item.id })}
                style={
                  {
                    "--left": `${placement.left}%`,
                    "--width": `${placement.width}%`,
                    "--top": `${rowTop(placement.lane) + laneRowHeights[placement.lane] / 2 - 20 + placement.stack * 34}px`,
                    "--event-color": categoryColor.background,
                    "--event-mark": categoryColor.mark,
                    "--event-text": categoryColor.text,
                  } as CSSProperties
                }
                type="button"
              >
                <span className="timeline-mark" />
                <span className="card-title">{item.title}</span>
                <span className="hover-summary">
                  {(item.imageUrls ?? []).length > 0 && <img alt={item.title} src={item.imageUrls![0]} />}
                  <strong>{item.title}</strong>
                  <b>{toDisplayYear(toYear(item.startDate))}</b>
                  {item.endDate ? `-${toDisplayYear(toYear(item.endDate))}` : ""}
                  <br />
                  {item.summary}
                </span>
              </button>
            );
          })}

          {personPlacements.map((placement) => {
            const { person } = placement;
            return (
              <button
                className="person-line"
                key={person.id}
                onClick={() => onOpenRecord({ type: "person", id: person.id })}
                style={
                  {
                    "--left": `${placement.left}%`,
                    "--width": `${placement.width}%`,
                    "--offset": placement.stack,
                    "--top": `${eraHeight + totalCountryLanesHeight + 34 + placement.stack * 28}px`,
                  } as CSSProperties
                }
                type="button"
              >
                <span>{person.name}</span>
                <span className="hover-summary person-hover">
                  {(person.imageUrls ?? []).length > 0 && <img alt={person.name} src={person.imageUrls![0]} />}
                  <strong>{person.name}</strong>
                  <b>{toPersonLifeLabel(person)}</b>
                  <br />
                  {person.summary}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CategoryView({
  countries,
  groupMode,
  items,
  onOpenRecord,
}: {
  countries: Country[];
  groupMode: CardGroupMode;
  items: TimelineItem[];
  onOpenRecord: (id: string) => void;
}) {
  const grouped =
    groupMode === "category"
      ? groupRecords(items, (item) => [item.category || "未分類"])
      : groupMode === "country"
        ? groupRecords(items, (item) => labelCountries(getRecordCountryIds(item), countries))
        : [{ label: "すべての出来事", records: items }];

  return (
    <div className="grouped-card-board">
      {grouped.map((group) => (
        <details className="record-group" key={group.label} open>
          <summary>
            <span>{group.label}</span>
            <small>{group.records.length}</small>
          </summary>
          <div className="record-group-grid event-grid">
            {group.records.map((item) => (
              <button className="person-card compact record-card event-record-card" key={item.id} onClick={() => onOpenRecord(item.id)} type="button">
                <div className="person-thumb">
                  {item.imageUrls?.[0] ? <img src={item.imageUrls[0]} alt={item.title} /> : <CalendarDays size={22} />}
                </div>
                <span>{item.title}</span>
                <small>
                  {toLabelDate(item.startDate)}
                  {item.endDate ? ` - ${toLabelDate(item.endDate)}` : ""}
                </small>
                <div className="person-card-body">
                  <p>{item.summary}</p>
                  <div className="chips person-card-tags">
                    <span>{item.category}</span>
                    {(item.genres ?? []).map((genre) => (
                      <span key={genre}>{genre}</span>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function PeopleView({
  countries,
  groupMode,
  people,
  onOpenRecord,
}: {
  countries: Country[];
  groupMode: CardGroupMode;
  people: Person[];
  onOpenRecord: (id: string) => void;
}) {
  const grouped =
    groupMode === "category"
      ? groupRecords(people, (person) => getPersonCategories(person))
      : groupMode === "country"
        ? groupRecords(people, (person) => labelCountries(getRecordCountryIds(person), countries))
        : [{ label: "すべての人物", records: people }];

  return (
    <div className="people-board grouped-card-board">
      {grouped.map((group) => (
        <details className="record-group" key={group.label} open>
          <summary>
            <span>{group.label}</span>
            <small>{group.records.length}</small>
          </summary>
          <div className="people-card-grid">
            {group.records.map((person) => (
              <button className="person-card compact" key={person.id} onClick={() => onOpenRecord(person.id)} type="button">
                <div className="person-thumb">
                  {person.imageUrls?.[0] ? <img src={person.imageUrls[0]} alt={person.name} /> : <UserRound size={22} />}
                </div>
                <span>{person.name}</span>
                <small>{toPersonLifeLabel(person)}</small>
                <div className="person-card-body">
                  <p>{person.summary}</p>
                  <div className="chips person-card-tags">
                    {getPersonCategories(person).map((category) => (
                      <span key={category}>{category}</span>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </details>
      ))}
      {people.length === 0 && (
        <div className="empty-state">
          <UserRound size={22} />
          <span>該当する人物カードがありません</span>
        </div>
      )}
    </div>
  );
}

function MapView({
  items,
  countries,
  regions,
  onOpenRecord,
  onUpdateEvent,
}: {
  items: TimelineItem[];
  countries: Country[];
  regions: Region[];
  onOpenRecord: (record: EditableRecord) => void;
  onUpdateEvent: (id: string, patch: Partial<Event>) => void;
}) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const googleMapRef = useRef<any>(null);
  const mapInfoWindowRef = useRef<any>(null);
  const mapMarkersRef = useRef<any[]>([]);
  const [focusedEventId, setFocusedEventId] = useState("");
  const [previewEventId, setPreviewEventId] = useState("");
  const [mapError, setMapError] = useState(false);
  const [geocodedLocations, setGeocodedLocations] = useState<Record<string, { latitude: number; longitude: number }>>({});
  const googleMapsApiKey = String((import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY ?? "").trim();
  const isFileProtocol = window.location.protocol === "file:";
  const eventPins = useMemo<EventMapPin[]>(() => {
    return items
      .map((item): EventMapPin | undefined => {
        const locationName = item.locationName?.trim();
        if (!locationName) return undefined;
        const countryIds = getRecordCountryIds(item);
        const countryId = countryIds[0];
        const countryNames = countryIds.map((id) => getCountryName(countries, id));
        const dictionaryLocation = getDictionaryLocation(locationName, countryNames);
        if (dictionaryLocation) {
          return {
            item,
            locationName,
            latitude: dictionaryLocation.latitude,
            longitude: dictionaryLocation.longitude,
            countryId,
          };
        }
        if (locationName && hasCoordinates(item)) {
          return {
            item,
            locationName,
            latitude: item.locationLat as number,
            longitude: item.locationLng as number,
            countryId,
          };
        }

        const geocoded = locationName ? geocodedLocations[item.id] : undefined;
        if (locationName && geocoded) {
          return {
            item,
            locationName,
            latitude: geocoded.latitude,
            longitude: geocoded.longitude,
            countryId,
          };
        }
        const representativeLocation = getRepresentativeLocation(locationName, regions, countryNames, countryIds);
        if (representativeLocation) {
          return {
            item,
            locationName,
            latitude: representativeLocation.latitude,
            longitude: representativeLocation.longitude,
            countryId,
          };
        }
        return undefined;
      })
      .filter((pin): pin is EventMapPin => Boolean(pin));
  }, [countries, geocodedLocations, items, regions]);
  const focusedEventPin = eventPins.find((pin) => pin.item.id === focusedEventId);
  const previewEventPin = eventPins.find((pin) => pin.item.id === previewEventId);

  useEffect(() => {
    items.forEach((item) => {
      const locationName = item.locationName?.trim();
      if (!locationName) return;
      const countryIds = getRecordCountryIds(item);
      const countryNames = countryIds.map((id) => getCountryName(countries, id));
      const dictionaryLocation = getDictionaryLocation(locationName, countryNames);
      if (!dictionaryLocation) return;
      const savedLocation = hasCoordinates(item)
        ? { latitude: item.locationLat as number, longitude: item.locationLng as number }
        : undefined;
      if (isSameMapPoint(savedLocation, dictionaryLocation)) return;
      onUpdateEvent(item.id, {
        locationLat: dictionaryLocation.latitude,
        locationLng: dictionaryLocation.longitude,
        regionIds: [],
      });
    });
  }, [countries, items, onUpdateEvent]);

  useEffect(() => {
    if (!focusedEventPin || !googleMapRef.current) return;
    googleMapRef.current.panTo({ lat: focusedEventPin.latitude, lng: focusedEventPin.longitude });
    googleMapRef.current.setZoom(Math.max(googleMapRef.current.getZoom() ?? 7, 7));
  }, [focusedEventPin]);

  useEffect(() => {
    if (!googleMapsApiKey || isFileProtocol) return;
    const pendingItems = items.filter((item) => {
      const locationName = item.locationName?.trim();
      return locationName && !hasCoordinates(item) && !geocodedLocations[item.id];
    });
    if (pendingItems.length === 0) return;

    let cancelled = false;
    setMapError(false);
    window.gm_authFailure = () => setMapError(true);

    const timeout = window.setTimeout(() => {
      loadGoogleMaps(googleMapsApiKey)
        .then(() => {
          if (cancelled || !window.google?.maps) return;
          const geocoder = new window.google.maps.Geocoder();
          pendingItems.forEach((item) => {
            const address = item.locationName?.trim();
            if (!address) return;
            const countryIds = getRecordCountryIds(item);
            const countryNames = countryIds.map((id) => getCountryName(countries, id));
            const dictionaryLocation = getDictionaryLocation(address, countryNames);
            if (dictionaryLocation) {
              onUpdateEvent(item.id, {
                locationLat: dictionaryLocation.latitude,
                locationLng: dictionaryLocation.longitude,
                regionIds: [],
              });
              setGeocodedLocations((current) => ({ ...current, [item.id]: dictionaryLocation }));
              return;
            }
            const representativeLocation = getRepresentativeLocation(address, regions, countryNames, countryIds);
            const queries = buildLocationQueries(address, countryNames, countryIds);
            let queryIndex = 0;
            const saveResolvedLocation = (nextLocation: MapPoint) => {
              setGeocodedLocations((current) => ({ ...current, [item.id]: nextLocation }));
              onUpdateEvent(item.id, {
                locationLat: nextLocation.latitude,
                locationLng: nextLocation.longitude,
                regionIds: [],
              });
            };
            const tryNextQuery = () => {
              const query = queries[queryIndex];
              if (!query) {
                if (representativeLocation) saveResolvedLocation(representativeLocation);
                return;
              }
              queryIndex += 1;
              geocoder.geocode({ address: query, region: "JP" }, (results: any[], status: string) => {
                if (cancelled) return;
                if (status !== "OK" || !results?.[0]?.geometry?.location) {
                  tryNextQuery();
                  return;
                }
                const location = results[0].geometry.location;
                saveResolvedLocation({
                  latitude: location.lat(),
                  longitude: location.lng(),
                });
              });
            };
            tryNextQuery();
          });
        })
        .catch(() => {
          if (!cancelled) setMapError(true);
        });
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [countries, geocodedLocations, googleMapsApiKey, isFileProtocol, items, onUpdateEvent, regions]);

  useEffect(() => {
    if (!googleMapsApiKey || isFileProtocol || !mapElementRef.current || eventPins.length === 0) return;
    let cancelled = false;
    setMapError(false);
    window.gm_authFailure = () => setMapError(true);

    loadGoogleMaps(googleMapsApiKey).then(() => {
      if (cancelled || !mapElementRef.current || !window.google?.maps) return;
      const maps = window.google.maps;
      const map =
        googleMapRef.current ??
        new maps.Map(mapElementRef.current, {
          center: { lat: eventPins[0].latitude, lng: eventPins[0].longitude },
          zoom: 5,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });
      googleMapRef.current = map;
      const bounds = new maps.LatLngBounds();
      mapInfoWindowRef.current?.close?.();
      mapInfoWindowRef.current = null;

      mapMarkersRef.current.forEach((overlay) => overlay.setMap(null));
      mapMarkersRef.current = [];

      eventPins.forEach((pin) => {
        const position = { lat: pin.latitude, lng: pin.longitude };
        const overlay = new maps.OverlayView();
        let element: HTMLButtonElement | null = null;
        overlay.onAdd = () => {
          element = document.createElement("button");
          element.type = "button";
          element.className = "custom-map-pin";
          element.setAttribute("aria-label", pin.item.title);
          element.innerHTML = `<span>${escapeHtml(pin.item.title)}</span>`;
          const stopMapEvent = (event: globalThis.MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
          };
          element.addEventListener("mouseenter", stopMapEvent);
          element.addEventListener("mouseover", stopMapEvent);
          element.addEventListener("mousemove", stopMapEvent);
          element.addEventListener("mousedown", stopMapEvent);
          element.addEventListener("click", (event) => {
            stopMapEvent(event);
            setFocusedEventId(pin.item.id);
            setPreviewEventId(pin.item.id);
          });
          element.addEventListener("dblclick", (event) => {
            stopMapEvent(event);
            onOpenRecord({ type: "event", id: pin.item.id });
          });
          overlay.getPanes()?.overlayMouseTarget.appendChild(element);
        };
        overlay.draw = () => {
          if (!element) return;
          const projection = overlay.getProjection();
          const point = projection?.fromLatLngToDivPixel(new maps.LatLng(position.lat, position.lng));
          if (!point) return;
          element.style.left = `${point.x}px`;
          element.style.top = `${point.y}px`;
        };
        overlay.onRemove = () => {
          element?.remove();
          element = null;
        };
        overlay.setMap(map);
        mapMarkersRef.current.push(overlay);
        bounds.extend(position);
      });

      if (eventPins.length === 1) {
        map.setCenter({ lat: eventPins[0].latitude, lng: eventPins[0].longitude });
        map.setZoom(7);
      } else {
        map.fitBounds(bounds, 64);
      }
    }).catch(() => {
      if (!cancelled) setMapError(true);
    });

    return () => {
      cancelled = true;
    };
  }, [eventPins, googleMapsApiKey, isFileProtocol]);

  return (
    <div className="map-board">
      <section className="map-frame">
        <div className="google-map-canvas" ref={mapElementRef} />
        {(!googleMapsApiKey || isFileProtocol || mapError) && (
          <div className="map-api-notice">
            {!googleMapsApiKey
              ? "Google Maps APIキーが未設定です。"
              : isFileProtocol
                ? "file:// で開いているためGoogleマップを読み込めません。ターミナルで npm run dev を実行し、http://localhost:5173/ で開いてください。"
                : "Google Maps APIキーの許可元設定を確認してください。"}
          </div>
        )}
      </section>
      <aside className="map-events">
        <div className="map-event-list">
          {eventPins.length === 0 && <p className="map-empty">発生地点が設定された出来事がありません。</p>}
          {eventPins.map((pin) => (
            <button
              className={focusedEventId === pin.item.id || previewEventId === pin.item.id ? "active" : ""}
              key={`${pin.item.id}-${pin.locationName}`}
              type="button"
            onClick={() => {
              setFocusedEventId(pin.item.id);
              setPreviewEventId("");
            }}
            onDoubleClick={() => onOpenRecord({ type: "event", id: pin.item.id })}
          >
              <MapPin size={16} />
              <span>
                <strong>{pin.item.title}</strong>
                <small>
                  {pin.locationName}
                  {pin.countryId ? ` / ${getCountryName(countries, pin.countryId)}` : ""}
                </small>
              </span>
              <b>{toDisplayYear(toYear(pin.item.startDate))}</b>
            </button>
          ))}
        </div>
        {previewEventPin && (
          <section className="map-detail">
            <button className="map-detail-close" type="button" onClick={() => setPreviewEventId("")}>
              閉じる
            </button>
            <span className="knowledge-label">
              {previewEventPin.locationName}
              {previewEventPin.countryId ? ` / ${getCountryName(countries, previewEventPin.countryId)}` : ""}
            </span>
            <h2>{previewEventPin.item.title}</h2>
            <p>{previewEventPin.item.summary}</p>
            <div className="map-record-list">
              <button type="button" onClick={() => onOpenRecord({ type: "event", id: previewEventPin.item.id })}>
                <span>詳細カード</span>
                {previewEventPin.item.title}
              </button>
            </div>
          </section>
        )}
      </aside>
    </div>
  );
}

function AllCardsView({
  cards,
  countries,
  groupMode = "all",
  compact = false,
  onOpenRecord,
}: {
  cards: KnowledgeCard[];
  countries?: Country[];
  groupMode?: CardGroupMode;
  compact?: boolean;
  onOpenRecord: (record: EditableRecord) => void;
}) {
  const grouped =
    groupMode === "category"
      ? groupRecords(cards, (card) => [card.groupCategory ?? "未分類"])
      : groupMode === "country"
        ? groupRecords(cards, (card) => labelCountries(card.countryIds ?? [], countries ?? []))
        : [{ label: "すべてのカード", records: cards }];

  return (
    <div className={compact ? "all-cards-board compact grouped-card-board" : "all-cards-board grouped-card-board"}>
      {grouped.map((group) => (
        <details className="record-group" key={group.label} open>
          <summary>
            <span>{group.label}</span>
            <small>{group.records.length}</small>
          </summary>
          <div className="record-group-grid">
            {group.records.map((card) => (
              <button
                className={`person-card compact record-card has-label ${card.type}-record-card`}
                key={`${card.type}-${card.id}`}
                onClick={() => onOpenRecord({ type: card.type, id: card.id })}
                type="button"
              >
                <div className="person-thumb">
                  {card.type === "event" ? <CalendarDays size={22} /> : card.type === "person" ? <UserRound size={22} /> : <BookOpen size={22} />}
                </div>
                <span className="record-card-label">{card.label}</span>
                <span>{card.title}</span>
                <small>{card.meta}</small>
                <div className="person-card-body">
                  <p>{card.summary}</p>
                  {(card.tags ?? []).length > 0 && (
                    <div className="chips person-card-tags">
                      {(card.tags ?? []).map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </details>
      ))}
      {cards.length === 0 && (
        <div className="empty-state">
          <BookOpen size={22} />
          <span>該当するカードがありません</span>
        </div>
      )}
    </div>
  );
}

function FilterSearchSelect({
  label,
  values,
  options,
  placeholder,
  onChange,
  onDelete,
  onCreate,
}: {
  label: string;
  values: string[];
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  onChange: (values: string[]) => void;
  onDelete?: (value: string) => void;
  onCreate?: (value: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedLabels = values
    .map((value) => options.find((option) => option.value === value)?.label ?? value)
    .filter(Boolean);
  const selectedLabel = selectedLabels.length === 0 ? "すべて" : selectedLabels.join("、");
  const filteredOptions = options.filter((option) => matchesSearch(option.label, query));
  const trimmedQuery = query.trim();
  const canCreate =
    Boolean(onCreate && trimmedQuery) &&
    !options.some((option) => normalizeLocationName(option.label) === normalizeLocationName(trimmedQuery));

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function toggleValue(nextValue: string) {
    const nextValues = values.includes(nextValue)
      ? values.filter((value) => value !== nextValue)
      : [...values, nextValue];
    onChange(nextValues);
  }

  return (
    <div className="filter-search-select" ref={containerRef}>
      <span>{label}</span>
      <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        {selectedLabel}
      </button>
      {open && (
        <div className="filter-search-menu">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
              if (event.key === "Enter" && canCreate) {
                event.preventDefault();
                onCreate?.(trimmedQuery);
                setQuery("");
              }
            }}
            placeholder={placeholder}
          />
          {canCreate && (
            <button
              className="filter-create-button"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onCreate?.(trimmedQuery);
                setQuery("");
              }}
            >
              「{trimmedQuery}」を追加
            </button>
          )}
          <div className="filter-search-options">
            <div className={values.length === 0 ? "filter-search-option active" : "filter-search-option"}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange([]);
                  setQuery("");
                }}
              >
                すべて
              </button>
            </div>
            {filteredOptions.map((option) => (
              <div className={values.includes(option.value) ? "filter-search-option active" : "filter-search-option"} key={option.value}>
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => toggleValue(option.value)}>
                  <span className="filter-check">{values.includes(option.value) ? "✓" : ""}</span>
                  <span>{option.label}</span>
                </button>
                {onDelete && (
                  <button
                    className="filter-option-delete"
                    type="button"
                    aria-label={`${option.label}を削除`}
                    title="削除"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(option.value);
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {filteredOptions.length === 0 && <p>候補がありません</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function ChipEditor({
  label,
  values,
  onChange,
  options,
  placeholder,
  renderValue,
  maxValues,
  allowCustom = true,
  createValue,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  renderValue?: (value: string) => string;
  maxValues?: number;
  allowCustom?: boolean;
  createValue?: (draft: string) => string | undefined;
}) {
  const [draft, setDraft] = useState("");
  const optionLabels = new Map((options ?? []).map((option) => [option.label, option.value]));
  const optionValues = new Set((options ?? []).map((option) => option.value));
  const listId = `${label.replace(/\s/g, "-")}-options`;

  function addValue() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const next = optionLabels.get(trimmed) ?? createValue?.(trimmed) ?? trimmed;
    if (options && !allowCustom && !optionValues.has(next)) return;
    const nextValues = uniqueValues([...values, next]);
    onChange(maxValues === 1 ? [next] : nextValues.slice(0, maxValues ?? nextValues.length));
    setDraft("");
  }

  return (
    <div className="chip-editor">
      <span>{label}</span>
      <div className="chip-list editable">
        {values.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onChange(values.filter((item) => item !== value))}
            title="クリックで削除"
          >
            #{renderValue ? renderValue(value) : value}
          </button>
        ))}
      </div>
      <div className="inline-add">
        <input
          list={options ? listId : undefined}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addValue();
            }
          }}
          placeholder={placeholder}
        />
        {options && (
          <datalist id={listId}>
            {options.map((option) => (
              <option key={option.value} value={option.label}>{option.label}</option>
            ))}
          </datalist>
        )}
        <button type="button" onClick={addValue}>
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

function HistoricalDateInput({
  label,
  value,
  onChange,
  allowEmpty = false,
}: {
  label: string;
  value?: string;
  onChange: (value: string | undefined) => void;
  allowEmpty?: boolean;
}) {
  const parsedValue = clampHistoricalDateParts(parseHistoricalDateParts(value) ?? { year: 1914, month: 1, day: 1 });
  const [search, setSearch] = useState(formatHistoricalDateSearch(value));
  const [draft, setDraft] = useState(parsedValue);

  useEffect(() => {
    const next = clampHistoricalDateParts(parseHistoricalDateParts(value) ?? { year: 1914, month: 1, day: 1 });
    setDraft(next);
    setSearch(formatHistoricalDateSearch(value));
  }, [value]);

  function commitDate(nextParts: HistoricalDateParts) {
    const next = clampHistoricalDateParts(nextParts);
    setDraft(next);
    const serialized = serializeHistoricalDate(next);
    setSearch(formatHistoricalDateSearch(serialized));
    onChange(serialized);
  }

  function commitYearOnly() {
    const next = clampHistoricalDateParts({ ...draft, precision: "year" });
    setDraft(next);
    const serialized = serializeHistoricalDate(next);
    setSearch(formatHistoricalDateSearch(serialized));
    onChange(serialized);
  }

  function commitExactDate() {
    const next = clampHistoricalDateParts({ ...draft, precision: "day" });
    setDraft(next);
    const serialized = serializeHistoricalDate(next);
    setSearch(formatHistoricalDateSearch(serialized));
    onChange(serialized);
  }

  function applySearch() {
    const parsed = parseHistoricalDateParts(search);
    if (!parsed) {
      if (allowEmpty && !search.trim()) onChange(undefined);
      return;
    }
    commitDate(parsed);
  }

  const daysInMonth = getDaysInHistoricalMonth(draft.year, draft.month);
  const isYearOnly = draft.precision === "year";

  return (
    <div className="historical-date-input">
      <span>{label}</span>
      <div className="date-search-row">
        <input
          value={search}
          onBlur={applySearch}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              applySearch();
            }
          }}
          placeholder="例: 前431-04-01 / 1914-07-28"
        />
        {allowEmpty && (
          <button type="button" onClick={() => onChange(undefined)}>
            クリア
          </button>
        )}
      </div>
      <div className="date-precision-controls">
        <button className={isYearOnly ? "active" : ""} type="button" onClick={commitYearOnly}>
          日付指定なし
        </button>
        <button className={!isYearOnly ? "active" : ""} type="button" onClick={commitExactDate}>
          年月日を指定
        </button>
      </div>
      <div className="date-picker-controls">
        <button type="button" onClick={() => commitDate({ ...draft, year: draft.year - 1 })}>
          年-
        </button>
        <strong>{draft.year < 1 ? `前${Math.abs(draft.year) + 1}年` : `${draft.year}年`}</strong>
        <button type="button" onClick={() => commitDate({ ...draft, year: draft.year + 1 })}>
          年+
        </button>
        {!isYearOnly && (
          <select
            value={draft.month}
            onChange={(event) => commitDate({ ...draft, month: Number(event.target.value), precision: "day" })}
          >
            {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
              <option key={month} value={month}>
                {month}月
              </option>
            ))}
          </select>
        )}
      </div>
      {!isYearOnly && (
        <div className="date-day-grid">
          {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => (
            <button
              className={day === draft.day ? "active" : ""}
              key={day}
              type="button"
              onClick={() => commitDate({ ...draft, day, precision: "day" })}
            >
              {day}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HashtagList({ values }: { values?: string[] }) {
  const tags = values ?? [];
  if (tags.length === 0) return null;
  return (
    <div className="chips hashtag-list">
      {tags.map((item) => (
        <span key={item}>#{item}</span>
      ))}
    </div>
  );
}

function ImageUploadEditor({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  function handleUpload(files: FileList | null) {
    const imageFiles = Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    Promise.all(imageFiles.map(uploadFileAsset)).then((results) => onChange(uniqueValues([...values, ...results.filter(Boolean)])));
  }

  return (
    <div className="image-upload-editor">
      <span>{label}</span>
      <label className="image-upload-drop">
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => {
            handleUpload(event.target.files);
            event.target.value = "";
          }}
        />
        <strong>画像を選択</strong>
        <small>カードのプレビュー画像として保存されます</small>
      </label>
      {values.length > 0 && (
        <div className="image-upload-list">
          {values.map((value) => (
            <figure key={value}>
              <img src={value} alt="アップロード画像" />
              <button type="button" onClick={() => onChange(values.filter((item) => item !== value))}>
                削除
              </button>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

function getLearningFileType(file: File): LearningFile["type"] {
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  return "file";
}

function dataUrlToBlob(dataUrl: string, fallbackMimeType: string) {
  const [header, body] = dataUrl.split(",");
  if (!body) throw new Error("Invalid file data");
  const mimeType = header.match(/data:([^;]+)/)?.[1] || fallbackMimeType || "application/octet-stream";
  const binary = header.includes(";base64") ? window.atob(body) : decodeURIComponent(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

async function learningFileToBytes(file: LearningFile) {
  if (file.dataUrl.startsWith("data:")) {
    return new Uint8Array(await dataUrlToBlob(file.dataUrl, file.mimeType).arrayBuffer());
  }
  const response = await fetch(file.dataUrl);
  if (!response.ok) throw new Error("File could not be loaded");
  return new Uint8Array(await response.arrayBuffer());
}

async function loadPdfJs() {
  if (!pdfJsModulePromise) {
    const pdfJsUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
    pdfJsModulePromise = import(/* @vite-ignore */ pdfJsUrl);
  }
  const pdfjs = await pdfJsModulePromise;
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
  return pdfjs;
}

function LearningPdfPreview({ file }: { file: LearningFile }) {
  const [slideUrls, setSlideUrls] = useState<string[]>([]);
  const [status, setStatus] = useState("PDFをスライドとして読み込んでいます");

  useEffect(() => {
    let canceled = false;

    async function renderSlides() {
      setSlideUrls([]);
      setStatus("PDFをスライドとして読み込んでいます");
      try {
        const pdfjs = await loadPdfJs();
        const pdfData = await learningFileToBytes(file);
        const pdf = await pdfjs.getDocument({ data: pdfData }).promise;
        const renderedSlides: string[] = [];

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (canceled) return;
          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const targetWidth = 1440;
          const scale = Math.max(1.2, targetWidth / baseViewport.width);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) continue;
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          await page.render({ canvasContext: context, viewport }).promise;
          renderedSlides.push(canvas.toDataURL("image/png"));
          setSlideUrls([...renderedSlides]);
        }

        if (!canceled) setStatus(renderedSlides.length > 0 ? "" : "PDFからスライドを読み取れませんでした");
      } catch {
        if (!canceled) setStatus("PDFをスライドとして読み取れませんでした");
      }
    }

    renderSlides();
    return () => {
      canceled = true;
    };
  }, [file.dataUrl, file.mimeType]);

  return (
    <div className="learning-slide-preview">
      {slideUrls.map((slideUrl, index) => (
        <img alt={`${file.name} ${index + 1}ページ`} key={`${file.id}-${index}`} src={slideUrl} />
      ))}
      {status && <p>{status}</p>}
    </div>
  );
}

function LearningFilesView({ files, onDelete }: { files?: LearningFile[]; onDelete?: (id: string) => void }) {
  const visibleFiles = files ?? [];
  if (visibleFiles.length === 0) {
    return <p>学習ファイルはまだ登録されていません。</p>;
  }

  return (
    <div className="learning-file-list">
      {visibleFiles.map((file) => (
        <article className="learning-file-card" key={file.id}>
          {(file.type !== "pdf" || onDelete) && (
            <div className="learning-file-meta">
              {file.type !== "pdf" && <strong>{file.name}</strong>}
              {onDelete && (
                <button type="button" onClick={() => onDelete(file.id)}>
                  削除
                </button>
              )}
            </div>
          )}
          {file.type === "audio" && <audio controls src={file.dataUrl} />}
          {file.type === "image" && <img src={file.dataUrl} alt={file.name} />}
          {file.type === "pdf" && <LearningPdfPreview file={file} />}
          {file.type === "file" && (
            <a href={file.dataUrl} download={file.name}>
              ファイルを開く
            </a>
          )}
        </article>
      ))}
    </div>
  );
}

function LearningFilesEditor({
  values,
  onChange,
}: {
  values: LearningFile[];
  onChange: (values: LearningFile[]) => void;
}) {
  function handleUpload(files: FileList | null) {
    const uploadFiles = Array.from(files ?? []).filter(
      (file) => file.type.startsWith("audio/") || file.type.startsWith("image/") || file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"),
    );
    if (uploadFiles.length === 0) return;

    Promise.all(
      uploadFiles.map(async (file) => ({
        id: makeId("learning"),
        name: file.name,
        type: getLearningFileType(file),
        mimeType: file.type || "application/octet-stream",
        dataUrl: await uploadFileAsset(file),
      })),
    ).then((results) => onChange([...values, ...results.filter((file) => file.dataUrl)]));
  }

  return (
    <div className="image-upload-editor learning-file-editor">
      <span>学習ファイル</span>
      <label className="image-upload-drop">
        <input
          type="file"
          accept="audio/*,image/*,application/pdf"
          multiple
          onChange={(event) => {
            handleUpload(event.target.files);
            event.target.value = "";
          }}
        />
        <strong>音声・画像・PDFを選択</strong>
        <small>学習タブに保存されます</small>
      </label>
      <LearningFilesView files={values} onDelete={(id) => onChange(values.filter((file) => file.id !== id))} />
    </div>
  );
}

function DetailHeroImage({
  imageUrls,
  title,
  onOrientationChange,
}: {
  imageUrls?: string[];
  title: string;
  onOrientationChange: (orientation: "landscape" | "portrait") => void;
}) {
  const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");
  const firstImage = imageUrls?.[0];

  if (!firstImage) {
    return <div className="image-placeholder">{title.slice(0, 1)}</div>;
  }

  return (
    <>
      <img className="hero-blur" alt="" src={firstImage} />
      <img
        className={`hero-image ${orientation}`}
        alt={title}
        src={firstImage}
        onLoad={(event) => {
          const image = event.currentTarget;
          const nextOrientation = image.naturalHeight > image.naturalWidth ? "portrait" : "landscape";
          setOrientation(nextOrientation);
          onOrientationChange(nextOrientation);
        }}
      />
    </>
  );
}

function RichContentView({ blocks }: { blocks?: ContentBlock[] }) {
  if (!blocks?.length) return null;
  const htmlBlock = blocks.find((block) => block.type === "html");
  if (htmlBlock) {
    return <div className="rich-content free-rich-content" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(htmlBlock.text) }} />;
  }

  return (
    <div className="rich-content">
      {blocks.map((block) => {
        if (block.type === "heading") {
          return <h2 key={block.id}>{renderRichText(block.text)}</h2>;
        }
        if (block.type === "subheading") {
          return <h3 key={block.id}>{renderRichText(block.text)}</h3>;
        }
        if (block.type === "quote") {
          return <blockquote key={block.id}>{renderRichText(block.text)}</blockquote>;
        }
        if (block.type === "image") {
          return (
            <figure key={block.id}>
              <img alt={block.caption || "本文画像"} src={block.text} />
              {block.caption && <figcaption>{renderRichText(block.caption)}</figcaption>}
            </figure>
          );
        }
        if (block.type === "video") {
          return (
            <figure key={block.id}>
              <iframe title={block.caption || block.text} src={toEmbedUrl(block.text)} allowFullScreen />
              {block.caption && <figcaption>{renderRichText(block.caption)}</figcaption>}
            </figure>
          );
        }
        return <p key={block.id}>{renderRichText(block.text)}</p>;
      })}
    </div>
  );
}

function RichContentEditor({
  blocks,
  editorKey,
  onChange,
}: {
  blocks?: ContentBlock[];
  editorKey: string;
  onChange: (blocks: ContentBlock[]) => void;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const latestHtmlRef = useRef(blocksToFreeHtml(blocks));
  const editorKeyRef = useRef(editorKey);

  useLayoutEffect(() => {
    if (editorKeyRef.current === editorKey) return;
    const nextHtml = blocksToFreeHtml(blocks);
    editorKeyRef.current = editorKey;
    latestHtmlRef.current = nextHtml;
    if (editorRef.current) editorRef.current.innerHTML = sanitizeRichHtml(nextHtml);
  }, [blocks, editorKey]);

  function saveEditorHtml(nextHtml = editorRef.current?.innerHTML ?? "") {
    latestHtmlRef.current = nextHtml;
    onChange(freeHtmlToBlocks(nextHtml));
  }

  function focusEditor() {
    editorRef.current?.focus();
  }

  function runCommand(command: string, value?: string) {
    focusEditor();
    document.execCommand(command, false, value);
    saveEditorHtml();
  }

  function setBlock(tagName: "P" | "H2" | "H3" | "BLOCKQUOTE") {
    runCommand("formatBlock", tagName);
  }

  function insertHtml(nextHtml: string) {
    focusEditor();
    document.execCommand("insertHTML", false, nextHtml);
    saveEditorHtml();
  }

  function insertImage() {
    document.getElementById("rich-image-upload")?.click();
  }

  function insertVideo() {
    const url = window.prompt("YouTubeなどの動画URLを入力してください");
    if (!url?.trim() || !isSafeMediaUrl(url.trim())) return;
    insertHtml(`<figure><iframe src="${escapeHtml(toEmbedUrl(url.trim()))}" title="動画" allowfullscreen></iframe><figcaption></figcaption></figure><p><br></p>`);
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const imageFile = Array.from(event.clipboardData.files).find((file) => file.type.startsWith("image/"));
    if (!imageFile) return;
    event.preventDefault();
    uploadFileAsset(imageFile).then((result) => {
      if (!result) return;
      insertHtml(`<figure><img src="${result}" alt="貼り付け画像"><figcaption></figcaption></figure><p><br></p>`);
    });
  }

  function handleImageUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file?.type.startsWith("image/")) return;
    uploadFileAsset(file).then((result) => {
      if (!result) return;
      insertHtml(`<figure><img src="${result}" alt="${escapeHtml(file.name)}"><figcaption></figcaption></figure><p><br></p>`);
    });
  }

  return (
    <div className="free-rich-editor">
      <div className="free-rich-toolbar" aria-label="本文編集ツール">
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setBlock("P")}>本文</button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setBlock("H2")}>見出し</button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setBlock("H3")}>小見出し</button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setBlock("BLOCKQUOTE")}>引用</button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("bold")}>太字</button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("italic")}>斜体</button>
        <label className="free-rich-color">
          文字色
          <input type="color" defaultValue="#172026" onChange={(event) => runCommand("foreColor", event.target.value)} />
        </label>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("insertUnorderedList")}>箇条書き</button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={insertImage}>画像</button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={insertVideo}>動画</button>
        <input
          id="rich-image-upload"
          hidden
          type="file"
          accept="image/*"
          onChange={(event) => {
            handleImageUpload(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
      <div
        className="free-rich-surface"
        contentEditable
        onBlur={() => saveEditorHtml()}
        onInput={() => saveEditorHtml()}
        onPaste={handlePaste}
        ref={(element) => {
          editorRef.current = element;
          if (element && !element.innerHTML) {
            element.innerHTML = sanitizeRichHtml(latestHtmlRef.current);
          }
        }}
        role="textbox"
        suppressContentEditableWarning
        aria-label="詳細ページ本文"
      />
    </div>
  );
}

function RelatedCardsSection({
  cards,
  onOpenRecord,
}: {
  cards: KnowledgeCard[];
  onOpenRecord: (record: EditableRecord) => void;
}) {
  if (cards.length === 0) return null;
  return (
    <div className="record-group-grid related-card-grid">
      {cards.map((card) => (
        <button
          className={`person-card compact record-card has-label ${card.type}-record-card`}
          key={`${card.type}-${card.id}`}
          onClick={() => onOpenRecord({ type: card.type, id: card.id })}
          type="button"
        >
          <div className="person-thumb">
            {card.type === "event" ? <CalendarDays size={22} /> : card.type === "person" ? <UserRound size={22} /> : <BookOpen size={22} />}
          </div>
          <span className="record-card-label">{card.label}</span>
          <span>{card.title}</span>
          <small>{card.meta}</small>
        </button>
      ))}
    </div>
  );
}

function DetailPanel({
  event,
  person,
  term,
  termCards,
  allCards,
  onClose,
  onOpenRecord,
  editMode,
  onEditModeChange,
  categories,
  termCategories,
  personCategories,
  genres,
  countries,
  regions,
  onUpdateEvent,
  onUpdatePerson,
  onUpdatePersonWorks,
  onUpdateTerm,
  onDeleteEvent,
  onDeletePerson,
  onDeleteTerm,
  onResolveCountry,
  renderLinkedText,
  termPopup,
}: {
  event: Event | null;
  person: Person | null;
  term: TermCard | null;
  termCards: TermCard[];
  allCards: KnowledgeCard[];
  onClose: () => void;
  onOpenRecord: (record: EditableRecord) => void;
  editMode: boolean;
  onEditModeChange: (value: boolean) => void;
  categories: Category[];
  termCategories: string[];
  personCategories: string[];
  genres: string[];
  countries: Country[];
  regions: Region[];
  onUpdateEvent: (id: string, patch: Partial<Event>) => void;
  onUpdatePerson: (id: string, patch: Partial<Person>) => void;
  onUpdatePersonWorks: (id: string, works: string[]) => void;
  onUpdateTerm: (id: string, patch: Partial<TermCard>) => void;
  onDeleteEvent: (id: string) => void;
  onDeletePerson: (id: string) => void;
  onDeleteTerm: (id: string) => void;
  onResolveCountry: (value: string) => string | undefined;
  renderLinkedText: (text: string, terms: string[]) => ReactNode;
  termPopup: TermPopup | null;
}) {
  const [heroOrientation, setHeroOrientation] = useState<"landscape" | "portrait">("landscape");
  const [eventPreviewTab, setEventPreviewTab] = useState<"summary" | "learning" | "references" | "related">("summary");
  const [personPreviewTab, setPersonPreviewTab] = useState<"summary" | "learning" | "episodes" | "works" | "references" | "related">("summary");
  const [termPreviewTab, setTermPreviewTab] = useState<"summary" | "learning" | "references" | "related">("summary");

  const relatedCards = useMemo(() => {
    const currentRecord = event || person || term;
    const currentId = currentRecord?.id;
    if (!currentId) return [];

    const fullText = [
      currentRecord.summary,
      "detail" in currentRecord ? currentRecord.detail : "",
      ...(currentRecord.contentBlocks ?? []).map((b) => b.text),
      ...("episodeBlocks" in currentRecord ? (currentRecord.episodeBlocks ?? []).map((b) => b.text) : []),
    ]
      .filter(Boolean)
      .join("\n");

    if (!fullText) return [];

    return allCards.filter((card) => {
      if (card.id === currentId) return false;
      if (fullText.includes(card.title)) return true;
      if ((card.aliases ?? []).some((alias) => fullText.includes(alias))) return true;
      if (card.type === "term") {
        const t = termCards.find((tc) => tc.id === card.id);
        if (t && t.aliases.some((alias) => fullText.includes(alias))) return true;
      }
      return false;
    });
  }, [event, person, term, allCards, termCards]);

  useEffect(() => {
    setPersonPreviewTab("summary");
  }, [person?.id]);

  useEffect(() => {
    setEventPreviewTab("summary");
  }, [event?.id]);

  useEffect(() => {
    setTermPreviewTab("summary");
  }, [term?.id]);

  return (
    <aside className="detail-panel" aria-label="詳細編集">
      <div className="detail-toolbar">
        <span>
          <BookOpen size={16} />
          詳細
        </span>
        <button onClick={() => onEditModeChange(!editMode)} type="button">
          <Edit3 size={15} />
          {editMode ? "プレビュー" : "編集"}
        </button>
        <button onClick={onClose} type="button">
          閉じる
        </button>
      </div>
      <datalist id="genre-options">
        {genres.map((genre) => (
          <option key={genre} value={genre}>{genre}</option>
        ))}
      </datalist>

      {!event && !person && !term && (
        <section className="detail-preview primary empty-detail">
          <span className="knowledge-label">カード詳細</span>
          <h2>年表からカードを選択</h2>
          <p>出来事・人物・単語をクリックすると、ここに画像、概要、タグ、参考資料、編集フォームが表示されます。</p>
        </section>
      )}

      {event && (
        <div className="detail-stack">
          <section className="detail-preview primary">
            <div className={`preview-images ${getPreviewImageLayout(event.imageUrls)} ${heroOrientation === "portrait" ? "portrait-image" : ""}`}>
              <DetailHeroImage imageUrls={event.imageUrls} title={event.title} onOrientationChange={setHeroOrientation} />
              <div className="detail-hero-copy">
                <span className="knowledge-label hero-kicker">
                  <span className="hero-kicker-dot" />
                  {event.category}
                </span>
                <h2>{event.title}</h2>
                <small className="hero-date">
                  <CalendarDays size={18} />
                  {toLabelDate(event.startDate)}
                  {event.endDate ? ` - ${toLabelDate(event.endDate)}` : ""}
                </small>
              </div>
            </div>
            {event.locationName?.trim() && (
              <div className="detail-location-map">
                <iframe
                  title={`${event.title}の発生地点`}
                  src={getEventMapEmbedUrl(event)}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
                <span>
                  <MapPin size={15} />
                  {event.locationName}
                </span>
              </div>
            )}
            <HashtagList values={[event.category, ...(event.genres ?? [])]} />
            <div className="person-preview-tabs">
              {[
                ["summary", "まとめ"],
                ["learning", "学習"],
                ["references", "参考資料"],
                ["related", "関連項目"],
              ].map(([id, label]) => (
                <button
                  className={eventPreviewTab === id ? "active" : ""}
                  key={id}
                  type="button"
                  onClick={() => setEventPreviewTab(id as typeof eventPreviewTab)}
                >
                  {label}
                </button>
              ))}
            </div>
            {eventPreviewTab === "summary" && (
              <section className="person-detail-section">
                <h3>概要</h3>
                <p>{renderLinkedText(event.detail, event.terms)}</p>
                <h3>本文</h3>
                <RichContentView blocks={event.contentBlocks} />
              </section>
            )}
            {eventPreviewTab === "learning" && (
              <section className="person-detail-section">
                <LearningFilesView files={event.learningFiles} />
              </section>
            )}
            {eventPreviewTab === "references" && (
              <section className="person-detail-section">
                {(event.references ?? []).length > 0 ? (
                  <div className="references inline-references">
                    {(event.references ?? []).map((reference) => (
                      <p key={reference}>{reference}</p>
                    ))}
                  </div>
                ) : (
                  <p>参考資料はまだ登録されていません。</p>
                )}
              </section>
            )}
            {eventPreviewTab === "related" && (
              <section className="person-detail-section">
                {relatedCards.length > 0 ? (
                  <RelatedCardsSection cards={relatedCards} onOpenRecord={onOpenRecord} />
                ) : (
                  <p>関連項目はまだありません。</p>
                )}
              </section>
            )}
          </section>

          {editMode && (
            <div className="detail-form">
              <label>
                出来事名
                <input value={event.title} onChange={(input) => onUpdateEvent(event.id, { title: input.target.value })} />
              </label>
              <ChipEditor
                label="別名"
                values={event.aliases ?? []}
                onChange={(values) => onUpdateEvent(event.id, { aliases: values })}
                placeholder="例: 世界大戦"
              />
              <div className="date-fields">
                <HistoricalDateInput label="開始年月日" value={event.startDate} onChange={(value) => onUpdateEvent(event.id, { startDate: value ?? "" })} />
                <HistoricalDateInput label="終了年月日" value={event.endDate} onChange={(value) => onUpdateEvent(event.id, { endDate: value })} allowEmpty />
              </div>
              <label>
                カテゴリ
                <select
                  value={event.category}
                  onChange={(input) => onUpdateEvent(event.id, { category: normalizeEventCategory(input.target.value) })}
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
              <ChipEditor
                label="小カテゴリ"
                values={event.genres ?? []}
                onChange={(values) => onUpdateEvent(event.id, { genres: values })}
                options={genres.map((genre) => ({ value: genre, label: genre }))}
                placeholder="例: 暗殺"
              />
              <ChipEditor
                label="国"
                values={getRecordCountryIds(event)}
                onChange={(values) => onUpdateEvent(event.id, { countryIds: values })}
                options={countries.map((country) => ({ value: country.id, label: country.name }))}
                placeholder="国を選択"
                renderValue={(value) => getCountryName(countries, value)}
                createValue={onResolveCountry}
              />
              <label>
                発生地点
                <input
                  value={event.locationName ?? ""}
                  onChange={(input) =>
                    onUpdateEvent(event.id, {
                      locationName: input.target.value || undefined,
                      locationLat: undefined,
                      locationLng: undefined,
                      regionIds: [],
                    })
                  }
                  placeholder="例: サラエボ"
                />
              </label>
              <label>
                簡単な概要
                <textarea value={event.summary} onChange={(input) => onUpdateEvent(event.id, { summary: input.target.value })} />
              </label>
              <label>
                詳細
                <textarea
                  className="large-text"
                  value={event.detail}
                  onChange={(input) => onUpdateEvent(event.id, { detail: input.target.value })}
                />
              </label>
              <label>
                詳細ページ本文
                <RichContentEditor editorKey={`event-${event.id}-content`} blocks={event.contentBlocks} onChange={(blocks) => onUpdateEvent(event.id, { contentBlocks: blocks })} />
              </label>
              <ChipEditor label="紐付ける単語" values={event.terms} onChange={(values) => onUpdateEvent(event.id, { terms: values })} placeholder="例: 第一次世界大戦" />
              <ImageUploadEditor label="プレビュー画像" values={event.imageUrls ?? []} onChange={(values) => onUpdateEvent(event.id, { imageUrls: values })} />
              <LearningFilesEditor values={event.learningFiles ?? []} onChange={(values) => onUpdateEvent(event.id, { learningFiles: values })} />
              <ChipEditor label="参考資料" values={event.references ?? []} onChange={(values) => onUpdateEvent(event.id, { references: values })} placeholder="資料名・URLを追加" />
              <button className="delete-card-button" type="button" onClick={() => onDeleteEvent(event.id)}>
                この出来事を削除
              </button>
            </div>
          )}
        </div>
      )}

      {person && (
        <div className="detail-stack">
          <section className="detail-preview primary">
            <div className={`preview-images ${getPreviewImageLayout(person.imageUrls)} ${heroOrientation === "portrait" ? "portrait-image" : ""}`}>
              <DetailHeroImage imageUrls={person.imageUrls} title={person.name} onOrientationChange={setHeroOrientation} />
              <div className="detail-hero-copy">
                <span className="knowledge-label hero-kicker person">
                  <span className="hero-kicker-dot" />
                  人物
                </span>
                <h2>{person.name}</h2>
                <small className="hero-date">
                  <CalendarDays size={18} />
                  {toPersonLifeLabel(person)}
                </small>
              </div>
            </div>
            <HashtagList values={getPersonCategories(person)} />
            <div className="person-preview-tabs">
              {[
                ["summary", "まとめ"],
                ["learning", "学習"],
                ["episodes", "エピソード"],
                ["works", "主な著作"],
                ["references", "参考資料"],
                ["related", "関連項目"],
              ].map(([id, label]) => (
                <button
                  className={personPreviewTab === id ? "active" : ""}
                  key={id}
                  type="button"
                  onClick={() => setPersonPreviewTab(id as typeof personPreviewTab)}
                >
                  {label}
                </button>
              ))}
            </div>
            {personPreviewTab === "summary" && (
              <section className="person-detail-section">
                <h3>概要</h3>
                <p>{renderLinkedText(person.summary, [...getPersonCategories(person), ...getRecordCountryIds(person).map((id) => getCountryName(countries, id))])}</p>
                <h3>本文</h3>
                <RichContentView blocks={person.contentBlocks} />
              </section>
            )}
            {personPreviewTab === "learning" && (
              <section className="person-detail-section">
                <LearningFilesView files={person.learningFiles} />
              </section>
            )}
            {personPreviewTab === "episodes" && (
              <section className="person-detail-section">
                {(person.episodeBlocks ?? []).length > 0 ? <RichContentView blocks={person.episodeBlocks} /> : <p>エピソードはまだ登録されていません。</p>}
              </section>
            )}
            {personPreviewTab === "works" && (
              <section className="person-detail-section">
                <div className="work-card-list">
                  {(person.majorWorks ?? []).map((work) => (
                    <button
                      key={work}
                      type="button"
                      onClick={() => {
                        const workTerm = termCards.find((term) => term.term === work || term.aliases.includes(work));
                        if (workTerm) onOpenRecord({ type: "term", id: workTerm.id });
                      }}
                    >
                      {work}
                    </button>
                  ))}
                </div>
                {(person.majorWorks ?? []).length === 0 && <p>主な著作はまだ登録されていません。</p>}
              </section>
            )}
            {personPreviewTab === "references" && (
              <section className="person-detail-section">
                {(person.references ?? []).length > 0 ? (
                  <div className="references inline-references">
                    {(person.references ?? []).map((reference) => (
                      <p key={reference}>{reference}</p>
                    ))}
                  </div>
                ) : (
                  <p>参考資料はまだ登録されていません。</p>
                )}
              </section>
            )}
            {personPreviewTab === "related" && (
              <section className="person-detail-section">
                {relatedCards.length > 0 ? (
                  <RelatedCardsSection cards={relatedCards} onOpenRecord={onOpenRecord} />
                ) : (
                  <p>関連項目はまだありません。</p>
                )}
              </section>
            )}
          </section>

          {editMode && (
            <div className="detail-form">
              <ImageUploadEditor label="プレビュー画像" values={person.imageUrls ?? []} onChange={(values) => onUpdatePerson(person.id, { imageUrls: values })} />
              <LearningFilesEditor values={person.learningFiles ?? []} onChange={(values) => onUpdatePerson(person.id, { learningFiles: values })} />
              <details className="edit-section" open>
                <summary>基本情報</summary>
                <label>
                  人物名
                  <input value={person.name} onChange={(input) => onUpdatePerson(person.id, { name: input.target.value })} />
                </label>
                <ChipEditor
                  label="別名"
                  values={person.aliases ?? []}
                  onChange={(values) => onUpdatePerson(person.id, { aliases: values })}
                  placeholder="例: カント"
                />
                <div className="date-fields">
                  <HistoricalDateInput
                    label="生年月日"
                    value={person.birthDate ?? serializeHistoricalYear(person.birthYear)}
                    onChange={(value) =>
                      onUpdatePerson(person.id, {
                        birthDate: value,
                        birthYear: value ? toYear(value) : 0,
                      })
                    }
                  />
                  <HistoricalDateInput
                    label="没年月日"
                    value={person.deathDate ?? serializeHistoricalYear(person.deathYear)}
                    onChange={(value) =>
                      onUpdatePerson(person.id, {
                        deathDate: value,
                        deathYear: value ? toYear(value) : 0,
                      })
                    }
                  />
                </div>
                <ChipEditor
                  label="カテゴリ"
                  values={getPersonCategories(person)}
                  onChange={(values) => onUpdatePerson(person.id, { affiliations: values, genres: values })}
                  options={personCategories.map((category) => ({ value: category, label: category }))}
                  placeholder="例: 政治家"
                />
                <ChipEditor
                  label="国"
                  values={getRecordCountryIds(person)}
                  onChange={(values) => onUpdatePerson(person.id, { countryIds: values, regionIds: [] })}
                  options={countries.map((country) => ({ value: country.id, label: country.name }))}
                  placeholder="国を選択"
                  renderValue={(value) => getCountryName(countries, value)}
                  createValue={onResolveCountry}
                />
              </details>
              <details className="edit-section" open>
                <summary>まとめ</summary>
                <label>
                  まとめ
                  <textarea
                    className="large-text"
                    value={person.summary}
                    onChange={(input) => onUpdatePerson(person.id, { summary: input.target.value })}
                  />
                </label>
                <label>
                  本文
                  <RichContentEditor editorKey={`person-${person.id}-content`} blocks={person.contentBlocks} onChange={(blocks) => onUpdatePerson(person.id, { contentBlocks: blocks })} />
                </label>
              </details>
              <details className="edit-section">
                <summary>主な著作</summary>
                <ChipEditor
                  label="主な著作"
                  values={person.majorWorks ?? []}
                  onChange={(values) => onUpdatePersonWorks(person.id, values)}
                  placeholder="例: 国家"
                />
              </details>
              <details className="edit-section">
                <summary>エピソード</summary>
                <RichContentEditor editorKey={`person-${person.id}-episodes`} blocks={person.episodeBlocks} onChange={(blocks) => onUpdatePerson(person.id, { episodeBlocks: blocks })} />
              </details>
              <details className="edit-section">
                <summary>参考資料</summary>
                <ChipEditor label="参考資料" values={person.references ?? []} onChange={(values) => onUpdatePerson(person.id, { references: values })} placeholder="資料名・URLを追加" />
              </details>
              <button className="delete-card-button" type="button" onClick={() => onDeletePerson(person.id)}>
                この人物を削除
              </button>
            </div>
          )}
        </div>
      )}

      {term && (
        <div className="detail-stack">
          <section className="detail-preview primary">
            <div className={`preview-images ${getPreviewImageLayout(term.imageUrls)} ${heroOrientation === "portrait" ? "portrait-image" : ""}`}>
              <DetailHeroImage imageUrls={term.imageUrls} title={term.term} onOrientationChange={setHeroOrientation} />
              <div className="detail-hero-copy">
                <span className="knowledge-label hero-kicker term">
                  <span className="hero-kicker-dot" />
                  {term.category}
                </span>
                <h2>{term.term}</h2>
                <small className="hero-date">
                  <CalendarDays size={18} />
                  {term.aliases.length ? `別名: ${term.aliases.join("、")}` : "単語カード"}
                </small>
              </div>
            </div>
            <HashtagList values={[term.category, ...(term.genres ?? [])]} />
            <div className="person-preview-tabs">
              {[
                ["summary", "まとめ"],
                ["learning", "学習"],
                ["references", "参考資料"],
                ["related", "関連項目"],
              ].map(([id, label]) => (
                <button
                  className={termPreviewTab === id ? "active" : ""}
                  key={id}
                  type="button"
                  onClick={() => setTermPreviewTab(id as typeof termPreviewTab)}
                >
                  {label}
                </button>
              ))}
            </div>
            {termPreviewTab === "summary" && (
              <section className="person-detail-section">
                <h3>概要</h3>
                <p>{renderLinkedText(term.detail, term.relatedTerms)}</p>
                <h3>本文</h3>
                <RichContentView blocks={term.contentBlocks} />
              </section>
            )}
            {termPreviewTab === "learning" && (
              <section className="person-detail-section">
                <LearningFilesView files={term.learningFiles} />
              </section>
            )}
            {termPreviewTab === "references" && (
              <section className="person-detail-section">
                {(term.references ?? []).length > 0 ? (
                  <div className="references inline-references">
                    {(term.references ?? []).map((reference) => (
                      <p key={reference}>{reference}</p>
                    ))}
                  </div>
                ) : (
                  <p>参考資料はまだ登録されていません。</p>
                )}
              </section>
            )}
            {termPreviewTab === "related" && (
              <section className="person-detail-section">
                {relatedCards.length > 0 ? (
                  <RelatedCardsSection cards={relatedCards} onOpenRecord={onOpenRecord} />
                ) : (
                  <p>関連項目はまだありません。</p>
                )}
              </section>
            )}
          </section>

          {editMode && (
            <div className="detail-form">
              <label>
                単語
                <input value={term.term} onChange={(input) => onUpdateTerm(term.id, { term: input.target.value })} />
              </label>
              <label>
                種別
                <input
                  list="term-category-options"
                  value={term.category}
                  onChange={(input) => onUpdateTerm(term.id, { category: input.target.value as TermCard["category"] })}
                  placeholder="例: 思想"
                />
                <datalist id="term-category-options">
                  {termCategories.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </label>
              <ChipEditor
                label="ジャンル"
                values={term.genres ?? []}
                onChange={(values) => onUpdateTerm(term.id, { genres: values })}
                options={genres.map((genre) => ({ value: genre, label: genre }))}
                placeholder="例: 思想史"
              />
              <ChipEditor label="別名" values={term.aliases} onChange={(values) => onUpdateTerm(term.id, { aliases: values })} placeholder="別名を追加" />
              <label>
                概要
                <textarea value={term.summary} onChange={(input) => onUpdateTerm(term.id, { summary: input.target.value })} />
              </label>
              <label>
                詳細
                <textarea
                  className="large-text"
                  value={term.detail}
                  onChange={(input) => onUpdateTerm(term.id, { detail: input.target.value })}
                />
              </label>
              <label>
                詳細ページ本文
                <RichContentEditor editorKey={`term-${term.id}-content`} blocks={term.contentBlocks} onChange={(blocks) => onUpdateTerm(term.id, { contentBlocks: blocks })} />
              </label>
              <ChipEditor label="紐付ける単語" values={term.relatedTerms} onChange={(values) => onUpdateTerm(term.id, { relatedTerms: values })} placeholder="例: ポリス" />
              <ImageUploadEditor label="プレビュー画像" values={term.imageUrls ?? []} onChange={(values) => onUpdateTerm(term.id, { imageUrls: values })} />
              <LearningFilesEditor values={term.learningFiles ?? []} onChange={(values) => onUpdateTerm(term.id, { learningFiles: values })} />
              <ChipEditor label="参考資料" values={term.references ?? []} onChange={(values) => onUpdateTerm(term.id, { references: values })} placeholder="資料名・URLを追加" />
              <button className="delete-card-button" type="button" onClick={() => onDeleteTerm(term.id)}>
                この単語カードを削除
              </button>
            </div>
          )}
        </div>
      )}

      {termPopup && (
        <div className="term-popover">
          <strong>{termPopup.term}</strong>
          <p>{termPopup.definition}</p>
          {termPopup.target && (
            <button type="button" onClick={() => onOpenRecord(termPopup.target!)}>
              関連カードを開く
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

export { App };

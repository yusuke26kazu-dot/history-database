import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type TouchEvent, type WheelEvent } from "react";
import {
  BookOpen,
  CalendarDays,
  Edit3,
  Filter,
  Library,
  ListTree,
  MapPin,
  Plus,
  Rows3,
  RotateCcw,
  Search,
  UserRound,
  ZoomIn,
  ZoomOut,
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
import type { Category, ContentBlock, Country, EditableRecord, EraPeriod, Event, Person, Region, TermCard, TimelineItem } from "./models";
import { buildTimelineItems, filterTimelineItems, getHistoricalYear } from "./query";

type ViewMode = "timeline" | "category" | "people" | "cards" | "map";
type TimelineLaneMode = "country" | "plain";
type TermPopup = { term: string; definition: string; target?: EditableRecord };
type KnowledgeCard = {
  id: string;
  type: EditableRecord["type"];
  title: string;
  label: string;
  summary: string;
  meta: string;
  searchText: string;
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
type EventPlacement = {
  item: TimelineItem;
  lane: number;
  country: string;
  left: number;
  width: number;
  visualWidth: number;
  stack: number;
};

const baseCategories: Category[] = ["戦争", "外交", "暗殺", "政治", "革命", "講和", "思想", "裁判"];
const baseTermCategories = ["用語", "概念", "地域", "史料"];
const viewModes: Array<{ id: ViewMode; label: string; icon: typeof Rows3 }> = [
  { id: "timeline", label: "タイムライン", icon: Rows3 },
  { id: "category", label: "カテゴリ", icon: ListTree },
  { id: "people", label: "人物", icon: UserRound },
  { id: "cards", label: "全カード", icon: Library },
  { id: "map", label: "地図", icon: MapPin },
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
};

function padDatePart(value: number, length = 2) {
  return String(Math.abs(value)).padStart(length, "0");
}

function serializeHistoricalDate({ year, month, day }: HistoricalDateParts) {
  const yearPrefix = year < 0 ? "-" : "";
  return `${yearPrefix}${padDatePart(year, 4)}-${padDatePart(month)}-${padDatePart(day)}`;
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
    };
  }
  const match = normalized.match(/^(-?\d{1,6})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: match[2] ? Number(match[2]) : 1,
    day: match[3] ? Number(match[3]) : 1,
  };
}

function clampHistoricalDateParts(parts: HistoricalDateParts): HistoricalDateParts {
  const month = Math.min(12, Math.max(1, parts.month));
  const daysInMonth = getDaysInHistoricalMonth(parts.year, month);
  return {
    year: Number.isFinite(parts.year) ? Math.trunc(parts.year) : 0,
    month,
    day: Math.min(daysInMonth, Math.max(1, parts.day)),
  };
}

function getDaysInHistoricalMonth(year: number, month: number) {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 31;
}

function formatHistoricalDateSearch(value: string | undefined) {
  const parts = parseHistoricalDateParts(value);
  if (!parts) return "";
  const displayYear = parts.year < 1 ? `前${Math.abs(parts.year) + 1}` : String(parts.year);
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

  const searchText = normalizeLocationName([locationName, ...countryNames].join(" "));
  const dictionaryPoint = representativeLocations.find((location) =>
    location.keywords.some((keyword) => searchText.includes(normalizeLocationName(keyword))),
  )?.point;
  if (dictionaryPoint) return dictionaryPoint;

  const countryRegions = regions.filter((region) => countryIds.includes(region.countryId));
  return averageRegionPoint(countryRegions);
}

function getLocationSearchAliases(locationName: string) {
  const normalizedLocation = normalizeLocationName(locationName);
  const aliases: string[] = [];
  if (normalizedLocation.includes("ペロポネソス")) aliases.push("Peloponnese Greece");
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
    version: 1,
    events: data.events,
    people: data.people,
    termCards: data.termCards,
    countries: data.countries,
    regions: data.regions,
    customCategories: data.customCategories,
    customGenres: data.customGenres,
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
  } catch {
    // localStorage can be unavailable in private browsing or strict file contexts.
  }
}

function blockText(blocks?: ContentBlock[]) {
  return (blocks ?? []).map((block) => `${block.text} ${block.caption ?? ""}`).join(" ");
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
  const [category, setCategory] = useState<Category | "all">("all");
  const [country, setCountry] = useState<string | "all">("all");
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
  const [showEraPeriods, setShowEraPeriods] = useState(true);
  const [activeRecord, setActiveRecord] = useState<EditableRecord | null>(null);
  const [termPopup, setTermPopup] = useState<TermPopup | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [hasLoadedSavedData, setHasLoadedSavedData] = useState(false);
  const [saveStatus, setSaveStatus] = useState("読み込み中");

  const timelineItems = useMemo(() => buildTimelineItems(people, events, personEvents), [people, events]);
  const categories = useMemo(
    () => uniqueValues([...baseCategories, ...customCategories, ...events.map((event) => event.category)]),
    [customCategories, events],
  );
  const termCategories = useMemo(
    () => uniqueValues([...baseTermCategories, ...termCards.map((term) => term.category)]),
    [termCards],
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
  const filteredItems = useMemo(
    () => filterTimelineItems(timelineItems, { category, country }),
    [category, country, timelineItems],
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
      const matchesCountry = country === "all" || getRecordCountryIds(person).includes(country);
      const matchesText =
        !searchQuery.trim() ||
        matchesSearch(
          [
            person.name,
            person.summary,
            blockText(person.contentBlocks),
            getRecordCountryIds(person).map((id) => getCountryName(countries, id)).join(" "),
            getRecordRegionIds(person).map((id) => getRegionName(regions, id)).join(" "),
            person.affiliations.join(" "),
            (person.genres ?? []).join(" "),
            (person.references ?? []).join(" "),
          ].join(" "),
          searchQuery,
        );
      return (matchesLinkedEvent || matchesCountry) && matchesText;
    });
  }, [country, searchedItems, people, searchQuery, countries, regions]);

  const termTargets = useMemo(() => {
    const targets = new Map<string, EditableRecord>();
    events.forEach((event) => targets.set(event.title, { type: "event", id: event.id }));
    people.forEach((person) => targets.set(person.name, { type: "person", id: person.id }));
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
      label: `出来事 / ${event.category}`,
      summary: event.summary,
      meta: `${toLabelDate(event.startDate)}${event.endDate ? ` - ${toLabelDate(event.endDate)}` : ""}`,
      searchText: [
        event.title,
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
      label: "人物",
      summary: person.summary,
      meta: toPersonLifeLabel(person),
      searchText: [
        person.name,
        person.summary,
        blockText(person.contentBlocks),
        getRecordCountryIds(person).map((id) => getCountryName(countries, id)).join(" "),
        getRecordRegionIds(person).map((id) => getRegionName(regions, id)).join(" "),
        person.affiliations.join(" "),
        (person.genres ?? []).join(" "),
        (person.references ?? []).join(" "),
      ].join(" "),
    }));
    const termKnowledgeCards = termCards.map((term) => ({
      id: term.id,
      type: "term" as const,
      title: term.term,
      label: `単語 / ${term.category}`,
      summary: term.summary,
      meta: term.aliases.length ? `別名: ${term.aliases.join("、")}` : "単語カード",
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

  const activeEvent =
    activeRecord?.type === "event" ? events.find((event) => event.id === activeRecord.id) ?? null : null;
  const activePerson =
    activeRecord?.type === "person" ? people.find((person) => person.id === activeRecord.id) ?? null : null;
  const activeTerm =
    activeRecord?.type === "term" ? termCards.find((term) => term.id === activeRecord.id) ?? null : null;

  function applyPersistedDatabase(saved: PersistedDatabase) {
    setEvents(mergeById(seedEvents, saved.events));
    setPeople(mergeById(seedPeople, saved.people));
    setTermCards(mergeById(seedTermCards, saved.termCards));
    setCountries(mergeById(seedCountries, saved.countries));
    setRegions(mergeById(seedRegions, saved.regions));
    setCustomCategories(uniqueValues(saved.customCategories ?? []));
    setCustomGenres(uniqueValues(saved.customGenres ?? []));
  }

  useEffect(() => {
    let cancelled = false;

    async function loadSavedData() {
      try {
        const response = await fetch("/api/data", { headers: { accept: "application/json" } });
        const remoteData = response.ok ? ((await response.json()) as PersistedDatabase | null) : null;
        const saved = remoteData ?? readLocalDatabase();
        if (!cancelled && saved) {
          applyPersistedDatabase(saved);
          setSaveStatus(remoteData ? "保存済みデータを読み込みました" : "ブラウザ内データを読み込みました");
        }
        if (!cancelled && !saved) {
          setSaveStatus("初期データ");
        }
      } catch {
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
    const data = createPersistedDatabase({
      events,
      people,
      termCards,
      countries,
      regions,
      customCategories,
      customGenres,
    });
    writeLocalDatabase(data);
    setSaveStatus("保存中");

    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/data", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        });
        setSaveStatus(response.ok ? "保存済み" : "ブラウザ内保存");
      } catch {
        setSaveStatus("ブラウザ内保存");
      }
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [events, people, termCards, countries, regions, customCategories, customGenres, hasLoadedSavedData]);

  function updateEvent(id: string, patch: Partial<Event>) {
    setEvents((current) => current.map((event) => (event.id === id ? { ...event, ...patch } : event)));
  }

  function updatePerson(id: string, patch: Partial<Person>) {
    setPeople((current) => current.map((person) => (person.id === id ? { ...person, ...patch } : person)));
  }

  function updateTermCard(id: string, patch: Partial<TermCard>) {
    setTermCards((current) => current.map((term) => (term.id === id ? { ...term, ...patch } : term)));
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

  function openRecord(record: EditableRecord) {
    setActiveRecord(record);
    setDetailEditMode(false);
    setTermPopup(null);
  }

  function addEvent() {
    const id = makeId("event");
    const newEvent: Event = {
      id,
      title: "新しい出来事",
      startDate: "1914-01-01",
      category: "政治",
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
    };
    setEvents((current) => [...current, newEvent]);
    setActiveRecord({ type: "event", id });
    setDetailEditMode(true);
  }

  function addPerson() {
    const id = makeId("person");
    const newPerson: Person = {
      id,
      name: "新しい人物",
      birthYear: 1900,
      deathYear: 1970,
      countryIds: [],
      regionIds: [],
      affiliations: [],
      summary: "人物の概要を入力してください。",
      contentBlocks: [],
      genres: [],
      imageUrls: [],
      references: [],
    };
    setPeople((current) => [...current, newPerson]);
    setActiveRecord({ type: "person", id });
    setDetailEditMode(true);
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
    };
    setTermCards((current) => [...current, newTerm]);
    setActiveRecord({ type: "term", id });
    setDetailEditMode(true);
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
    setCustomCategories((current) => uniqueValues([...current, next]));
    setNewCategoryName("");
    if (category === "all") setCategory(next);
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

  return (
    <main className="app-shell">
      <section className="workspace">
        <aside className={`control-panel ${mobileFiltersOpen ? "mobile-open" : ""}`} aria-label="検索条件">
          <div className="panel-title">
            <span className="brand-mark">Darius</span>
            <span className="brand-beta">β</span>
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

          <div className="filter-title">
            <Filter size={16} />
            <span>絞り込み</span>
          </div>

          <label>
            データベース検索
            <input
              placeholder="人物・出来事・単語を検索"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>

          <label>
            カテゴリ
            <select value={category} onChange={(event) => setCategory(event.target.value as Category | "all")}>
              {["all", ...categories].map((candidate) => (
                <option key={candidate} value={candidate}>
                  {candidate === "all" ? "すべて" : candidate}
                </option>
              ))}
            </select>
          </label>

          <label>
            カテゴリ追加
            <div className="inline-add">
              <input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="例: 宗教" />
              <button type="button" onClick={addCategory}>
                <Plus size={14} />
              </button>
            </div>
          </label>

          <label>
            ジャンル追加
            <div className="inline-add">
              <input value={newGenreName} onChange={(event) => setNewGenreName(event.target.value)} placeholder="例: 哲学史" />
              <button type="button" onClick={addGenre}>
                <Plus size={14} />
              </button>
            </div>
          </label>

          <label>
            国
            <select value={country} onChange={(event) => setCountry(event.target.value)}>
              <option value="all">すべて</option>
              {countries.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            国追加
            <div className="inline-add">
              <input value={newCountryName} onChange={(event) => setNewCountryName(event.target.value)} placeholder="例: 中国" />
              <button type="button" onClick={addCountry}>
                <Plus size={14} />
              </button>
            </div>
          </label>

          <div className="region-add-box">
            <span>地域・ピン追加</span>
            <select value={newRegionCountryId} onChange={(event) => setNewRegionCountryId(event.target.value)}>
              {countries.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
            <input value={newRegionName} onChange={(event) => setNewRegionName(event.target.value)} placeholder="地域名" />
            <div className="date-fields">
              <input value={newRegionLatitude} onChange={(event) => setNewRegionLatitude(event.target.value)} placeholder="緯度" />
              <input value={newRegionLongitude} onChange={(event) => setNewRegionLongitude(event.target.value)} placeholder="経度" />
            </div>
            <button type="button" onClick={addRegion}>
              <Plus size={14} />
              地域を追加
            </button>
          </div>

          <button
            className="reset-button"
            type="button"
            onClick={() => {
              setCategory("all");
              setCountry("all");
              setSearchQuery("");
              setMobileFiltersOpen(false);
            }}
          >
            <RotateCcw size={16} />
            リセット
          </button>

          <div className="query-readout">
            <span>{searchedCards.length}</span>
            <p>カード / {searchedItems.length}件の出来事</p>
          </div>
        </aside>

        <section className="database-area">
          <div className="top-bar">
            <div className="header-block">
              <p>歴史年表DB プロトタイプ</p>
              <h1>第一次世界大戦</h1>
              <span className="save-status">{saveStatus}</span>
            </div>
            <div className="action-toolbar">
              <button className="mobile-filter-toggle" type="button" onClick={() => setMobileFiltersOpen((value) => !value)}>
                <Filter size={15} />
                絞り込み
              </button>
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
                className={timelineLaneMode === "country" ? "active-tool" : ""}
                type="button"
                onClick={() => setTimelineLaneMode((value) => (value === "country" ? "plain" : "country"))}
              >
                {timelineLaneMode === "country" ? "国あり" : "国なし"}
              </button>
              <button
                className={showEraPeriods ? "active-tool" : ""}
                type="button"
                onClick={() => setShowEraPeriods((value) => !value)}
              >
                時代区分
              </button>
              <button type="button" onClick={() => setTimelineZoom((value) => clampTimelineZoom(value / 1.8))}>
                <ZoomOut size={15} />
              </button>
              <span className="zoom-readout">{Math.round(timelineZoom * 100)}%</span>
              <button type="button" onClick={() => setTimelineZoom((value) => clampTimelineZoom(value * 1.8))}>
                <ZoomIn size={15} />
              </button>
              <input
                className="zoom-input"
                min="10"
                max="20000"
                type="number"
                value={Math.round(timelineZoom * 100)}
                onChange={(event) => setTimelineZoom(clampTimelineZoom(Number(event.target.value || 100) / 100))}
              />
              <button type="button" onClick={() => setTimelineHeightZoom((value) => Math.max(0.8, value - 0.3))}>
                縦-
              </button>
              <button type="button" onClick={() => setTimelineHeightZoom((value) => Math.min(5, value + 0.3))}>
                縦+
              </button>
            </div>
          </div>

          {viewMode === "timeline" && (
            <TimelineView
              items={searchedItems}
              people={relatedPeople}
              country={country}
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
            <CategoryView categories={categories} items={searchedItems} onOpenRecord={(id) => openRecord({ type: "event", id })} />
          )}

          {viewMode === "people" && (
            <PeopleView people={relatedPeople} onOpenRecord={(id) => openRecord({ type: "person", id })} />
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
            genres={genres}
            countries={countries}
            regions={regions}
            onUpdateEvent={updateEvent}
            onUpdatePerson={updatePerson}
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
  country,
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
  country: string | "all";
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
  const eventYears = items.flatMap((item) => [
    getTimelineYearPosition(item.startDate),
    item.endDate ? getTimelineYearPosition(item.endDate) : getTimelineYearPosition(item.startDate),
  ]);
  const personYears = people.flatMap((person) => [getTimelineYearPosition(getPersonBirthDate(person)), getTimelineYearPosition(getPersonDeathDate(person))]);
  const hasTimelineData = eventYears.length > 0 || personYears.length > 0;
  const allTimelineYears = [...eventYears, ...personYears];
  const minYear = hasTimelineData ? Math.floor(Math.min(...allTimelineYears) / 10) * 10 : 0;
  const maxYear = hasTimelineData ? Math.ceil(Math.max(...allTimelineYears) / 10) * 10 : 10;
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
        ? ["出来事"]
        : country !== "all"
          ? [country]
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
          ? ["出来事"]
          : country !== "all"
            ? [country]
            : getRecordCountryIds(item).length
              ? getRecordCountryIds(item)
              : ["unclassified"];
      return targetCountries
        .filter((targetCountry) => countryLanes.includes(targetCountry))
        .map((targetCountry) => {
          const left = positionPercent(item.startDate);
          const right = item.endDate ? positionPercent(item.endDate) : left;
          return {
            item,
            lane: Math.max(0, countryLanes.indexOf(targetCountry)),
            country: targetCountry,
            left,
            width: item.displayType === "Point" ? 0.08 : Math.max(right - left, 0.001),
            visualWidth: item.displayType === "Point" ? 8 : Math.max(right - left, 0.08),
            stack: 0,
          };
        });
    });
    const stacksByLane = new Map<number, number[]>();
    placements
      .sort((a, b) => a.lane - b.lane || a.left - b.left)
      .forEach((placement) => {
        const stacks = stacksByLane.get(placement.lane) ?? [];
        const visualWidth = Math.max(placement.visualWidth, Math.min(18, 1400 / Math.max(timelinePixelWidth, 1)));
        const stack = stacks.findIndex((end) => placement.left > end + 0.25);
        const nextStack = stack === -1 ? stacks.length : stack;
        placement.stack = nextStack;
        stacks[nextStack] = placement.left + visualWidth;
        stacksByLane.set(placement.lane, stacks);
      });
    return placements;
  })();

  const maxEventStack = Math.max(0, ...eventPlacements.map((placement) => placement.stack));
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
  const rowHeight = Math.max(116, Math.round((104 + maxEventStack * 32) * heightZoom));
  const personRowHeight = Math.max(140, Math.round((68 + personStackCount * 26) * heightZoom));

  function rowTop(lane: number) {
    return eraHeight + lane * rowHeight;
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
  }, [timelinePixelWidth, rowHeight, personRowHeight, eraHeight, countryLanes.length]);

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
          "--row-height": `${rowHeight}px`,
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
          <div className="timeline-tick-lines" aria-hidden="true">
            {yearTicks.map((year) => (
              <span key={year} style={{ "--left": `${positionYearPercent(year)}%` } as CSSProperties} />
            ))}
          </div>
          {visibleEras.length > 0 && (
            <div className="era-band-layer">
              {visibleEras.map((era) => {
                const start = Math.max(era.startYear, minYear);
                const end = Math.min(era.endYear, maxYear);
                return (
                  <span
                    className="era-band"
                    key={era.id}
                    style={
                      {
                        "--left": `${positionYearPercent(start)}%`,
                        "--width": `${Math.max(positionYearPercent(end) - positionYearPercent(start), 0.4)}%`,
                        "--era-row": eraGroups.indexOf(era.group),
                        "--era-color": era.color,
                      } as CSSProperties
                    }
                    title={`${era.group}: ${era.name} (${toDisplayYear(era.startYear)}-${toDisplayYear(era.endYear)})`}
                  >
                    <small>{era.group}</small>
                    {era.name}
                  </span>
                );
              })}
            </div>
          )}
          {countryLanes.map((lane, index) => (
            <div className="country-lane" key={lane} style={{ "--lane": index, "--era-height": `${eraHeight}px` } as CSSProperties} />
          ))}
          <div className="person-lane" style={{ "--lane-top": `${eraHeight + countryLanes.length * rowHeight}px` } as CSSProperties} />

          {eventPlacements.map((placement) => {
            const { item } = placement;
            return (
              <button
                className={`timeline-card ${item.displayType.toLowerCase()}`}
                key={`${item.id}-${placement.country}`}
                onClick={() => onOpenRecord({ type: "event", id: item.id })}
                style={
                  {
                    "--left": `${placement.left}%`,
                    "--width": `${placement.width}%`,
                    "--top": `${rowTop(placement.lane) + rowHeight / 2 - 20 + placement.stack * 34}px`,
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
                    "--top": `${eraHeight + countryLanes.length * rowHeight + 34 + placement.stack * 28}px`,
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
      {timelineScrollMax > 0 && (
        <div className="timeline-scroll-control">
          <input
            aria-label="年表の横移動"
            max={timelineScrollMax}
            min={0}
            type="range"
            value={Math.min(timelineScrollLeft, timelineScrollMax)}
            onChange={(event) => {
              const nextLeft = Number(event.target.value);
              const element = timelineBoardRef.current;
              if (element) element.scrollLeft = nextLeft;
              setTimelineScrollLeft(nextLeft);
            }}
          />
        </div>
      )}
    </div>
  );
}

function CategoryView({
  categories,
  items,
  onOpenRecord,
}: {
  categories: Category[];
  items: TimelineItem[];
  onOpenRecord: (id: string) => void;
}) {
  const grouped = categories
    .map((category) => ({ category, items: items.filter((item) => item.category === category) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="category-board">
      {grouped.map((group) => (
        <section className="category-column" key={group.category}>
          <h2>{group.category}</h2>
          {group.items.map((item) => (
            <button className="list-card" key={item.id} onClick={() => onOpenRecord(item.id)} type="button">
              <span>{item.title}</span>
              <small>
                {toLabelDate(item.startDate)}
                {item.endDate ? ` - ${toLabelDate(item.endDate)}` : ""}
              </small>
              <p>{item.summary}</p>
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}

function PeopleView({ people, onOpenRecord }: { people: Person[]; onOpenRecord: (id: string) => void }) {
  return (
    <div className="people-board">
      {people.map((person) => (
        <button className="person-card" key={person.id} onClick={() => onOpenRecord(person.id)} type="button">
          <span>{person.name}</span>
              <small>
                {toPersonLifeLabel(person)}
              </small>
          <p>{person.summary}</p>
          <div className="chips">
            {person.affiliations.map((affiliation) => (
              <span key={affiliation}>{affiliation}</span>
            ))}
          </div>
        </button>
      ))}
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
  onOpenRecord,
}: {
  cards: KnowledgeCard[];
  onOpenRecord: (record: EditableRecord) => void;
}) {
  return (
    <div className="all-cards-board">
      {cards.map((card) => (
        <button
          className={`knowledge-card ${card.type}`}
          key={`${card.type}-${card.id}`}
          onClick={() => onOpenRecord({ type: card.type, id: card.id })}
          type="button"
        >
          <span className="knowledge-label">{card.label}</span>
          <strong>{card.title}</strong>
          <small>{card.meta}</small>
          <p>{card.summary}</p>
        </button>
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
              <option key={option.value} value={option.label} />
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

  function applySearch() {
    const parsed = parseHistoricalDateParts(search);
    if (!parsed) {
      if (allowEmpty && !search.trim()) onChange(undefined);
      return;
    }
    commitDate(parsed);
  }

  const daysInMonth = getDaysInHistoricalMonth(draft.year, draft.month);

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
      <div className="date-picker-controls">
        <button type="button" onClick={() => commitDate({ ...draft, year: draft.year - 1 })}>
          年-
        </button>
        <strong>{draft.year < 1 ? `前${Math.abs(draft.year) + 1}年` : `${draft.year}年`}</strong>
        <button type="button" onClick={() => commitDate({ ...draft, year: draft.year + 1 })}>
          年+
        </button>
        <select
          value={draft.month}
          onChange={(event) => commitDate({ ...draft, month: Number(event.target.value) })}
        >
          {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
            <option key={month} value={month}>
              {month}月
            </option>
          ))}
        </select>
      </div>
      <div className="date-day-grid">
        {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => (
          <button
            className={day === draft.day ? "active" : ""}
            key={day}
            type="button"
            onClick={() => commitDate({ ...draft, day })}
          >
            {day}
          </button>
        ))}
      </div>
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
  onChange,
}: {
  blocks?: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
}) {
  const currentBlocks = blocks ?? [];

  function updateBlock(id: string, patch: Partial<ContentBlock>) {
    onChange(currentBlocks.map((block) => (block.id === id ? { ...block, ...patch } : block)));
  }

  function addBlock(type: ContentBlock["type"]) {
    onChange([
      ...currentBlocks,
      {
        id: makeId("block"),
        type,
        text: type === "image" || type === "video" ? "" : "本文を入力",
        caption: "",
      },
    ]);
  }

  function removeBlock(id: string) {
    onChange(currentBlocks.filter((block) => block.id !== id));
  }

  function moveBlock(id: string, direction: -1 | 1) {
    const index = currentBlocks.findIndex((block) => block.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= currentBlocks.length) return;
    const nextBlocks = [...currentBlocks];
    [nextBlocks[index], nextBlocks[nextIndex]] = [nextBlocks[nextIndex], nextBlocks[index]];
    onChange(nextBlocks);
  }

  return (
    <div className="rich-editor">
      <div className="rich-editor-add">
        <button type="button" onClick={() => addBlock("paragraph")}>本文</button>
        <button type="button" onClick={() => addBlock("heading")}>見出し</button>
        <button type="button" onClick={() => addBlock("subheading")}>小見出し</button>
        <button type="button" onClick={() => addBlock("quote")}>引用</button>
        <button type="button" onClick={() => addBlock("image")}>画像</button>
        <button type="button" onClick={() => addBlock("video")}>動画</button>
      </div>
      {currentBlocks.map((block) => (
        <div className="rich-editor-block" key={block.id}>
          <div className="rich-editor-row">
            <select value={block.type} onChange={(event) => updateBlock(block.id, { type: event.target.value as ContentBlock["type"] })}>
              <option value="paragraph">本文</option>
              <option value="heading">見出し</option>
              <option value="subheading">小見出し</option>
              <option value="quote">引用</option>
              <option value="image">画像</option>
              <option value="video">動画</option>
            </select>
            <button type="button" onClick={() => moveBlock(block.id, -1)}>↑</button>
            <button type="button" onClick={() => moveBlock(block.id, 1)}>↓</button>
            <button type="button" onClick={() => removeBlock(block.id)}>削除</button>
          </div>
          {block.type === "paragraph" || block.type === "quote" ? (
            <textarea value={block.text} onChange={(event) => updateBlock(block.id, { text: event.target.value })} />
          ) : (
            <input
              value={block.text}
              onChange={(event) => updateBlock(block.id, { text: event.target.value })}
              placeholder={block.type === "image" ? "画像URL" : block.type === "video" ? "YouTubeなどの動画URL" : "テキスト"}
            />
          )}
          {(block.type === "image" || block.type === "video") && (
            <input value={block.caption ?? ""} onChange={(event) => updateBlock(block.id, { caption: event.target.value })} placeholder="キャプション" />
          )}
        </div>
      ))}
      <p>太字は **このように** 入力できます。</p>
    </div>
  );
}

function DetailPanel({
  event,
  person,
  term,
  onClose,
  onOpenRecord,
  editMode,
  onEditModeChange,
  categories,
  termCategories,
  genres,
  countries,
  regions,
  onUpdateEvent,
  onUpdatePerson,
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
  onClose: () => void;
  onOpenRecord: (record: EditableRecord) => void;
  editMode: boolean;
  onEditModeChange: (value: boolean) => void;
  categories: Category[];
  termCategories: string[];
  genres: string[];
  countries: Country[];
  regions: Region[];
  onUpdateEvent: (id: string, patch: Partial<Event>) => void;
  onUpdatePerson: (id: string, patch: Partial<Person>) => void;
  onUpdateTerm: (id: string, patch: Partial<TermCard>) => void;
  onDeleteEvent: (id: string) => void;
  onDeletePerson: (id: string) => void;
  onDeleteTerm: (id: string) => void;
  onResolveCountry: (value: string) => string | undefined;
  renderLinkedText: (text: string, terms: string[]) => ReactNode;
  termPopup: TermPopup | null;
}) {
  const [heroOrientation, setHeroOrientation] = useState<"landscape" | "portrait">("landscape");

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
          <option key={genre} value={genre} />
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
            <HashtagList values={event.genres} />
            <p>{renderLinkedText(event.detail, event.terms)}</p>
            <RichContentView blocks={event.contentBlocks} />
            {(event.references ?? []).length > 0 && (
              <div className="references">
                <h3>参考資料</h3>
                {(event.references ?? []).map((reference) => (
                  <p key={reference}>{reference}</p>
                ))}
              </div>
            )}
          </section>

          {editMode && (
            <div className="detail-form">
              <label>
                出来事名
                <input value={event.title} onChange={(input) => onUpdateEvent(event.id, { title: input.target.value })} />
              </label>
              <div className="date-fields">
                <HistoricalDateInput label="開始年月日" value={event.startDate} onChange={(value) => onUpdateEvent(event.id, { startDate: value ?? "" })} />
                <HistoricalDateInput label="終了年月日" value={event.endDate} onChange={(value) => onUpdateEvent(event.id, { endDate: value })} allowEmpty />
              </div>
              <label>
                カテゴリ
                <input
                  list="event-category-options"
                  value={event.category}
                  onChange={(input) => onUpdateEvent(event.id, { category: input.target.value as Category })}
                  placeholder="例: 宗教"
                />
                <datalist id="event-category-options">
                  {categories.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </label>
              <ChipEditor
                label="ジャンル"
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
                <RichContentEditor blocks={event.contentBlocks} onChange={(blocks) => onUpdateEvent(event.id, { contentBlocks: blocks })} />
              </label>
              <ChipEditor label="紐付ける単語" values={event.terms} onChange={(values) => onUpdateEvent(event.id, { terms: values })} placeholder="例: 第一次世界大戦" />
              <ChipEditor label="画像URL" values={event.imageUrls ?? []} onChange={(values) => onUpdateEvent(event.id, { imageUrls: values })} placeholder="画像URLを追加" />
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
            <p>{renderLinkedText(person.summary, [...person.affiliations, ...getRecordCountryIds(person).map((id) => getCountryName(countries, id))])}</p>
            <RichContentView blocks={person.contentBlocks} />
            <HashtagList values={person.genres} />
            {(person.references ?? []).length > 0 && (
              <div className="references">
                <h3>参考資料</h3>
                {(person.references ?? []).map((reference) => (
                  <p key={reference}>{reference}</p>
                ))}
              </div>
            )}
          </section>

          {editMode && (
            <div className="detail-form">
              <label>
                人物名
                <input value={person.name} onChange={(input) => onUpdatePerson(person.id, { name: input.target.value })} />
              </label>
              <div className="date-fields">
                <HistoricalDateInput
                  label="生年月日"
                  value={person.birthDate ?? `${person.birthYear}-01-01`}
                  onChange={(value) =>
                    onUpdatePerson(person.id, {
                      birthDate: value,
                      birthYear: value ? toYear(value) : 0,
                    })
                  }
                />
                <HistoricalDateInput
                  label="没年月日"
                  value={person.deathDate ?? `${person.deathYear}-12-31`}
                  onChange={(value) =>
                    onUpdatePerson(person.id, {
                      deathDate: value,
                      deathYear: value ? toYear(value) : 0,
                    })
                  }
                />
              </div>
              <ChipEditor label="所属・紐付ける単語" values={person.affiliations} onChange={(values) => onUpdatePerson(person.id, { affiliations: values })} placeholder="例: ハプスブルク家" />
              <ChipEditor
                label="ジャンル"
                values={person.genres ?? []}
                onChange={(values) => onUpdatePerson(person.id, { genres: values })}
                options={genres.map((genre) => ({ value: genre, label: genre }))}
                placeholder="例: 政治家"
              />
              <ChipEditor
                label="国"
                values={getRecordCountryIds(person)}
                onChange={(values) => onUpdatePerson(person.id, { countryIds: values })}
                options={countries.map((country) => ({ value: country.id, label: country.name }))}
                placeholder="国を選択"
                renderValue={(value) => getCountryName(countries, value)}
                createValue={onResolveCountry}
              />
              <ChipEditor
                label="地域・ピン"
                values={getRecordRegionIds(person)}
                onChange={(values) => onUpdatePerson(person.id, { regionIds: values })}
                options={regions.map((region) => ({ value: region.id, label: `${getCountryName(countries, region.countryId)} / ${region.name}` }))}
                placeholder="地域を選択"
                renderValue={(value) => getRegionName(regions, value)}
                allowCustom={false}
              />
              <label>
                概要
                <textarea
                  className="large-text"
                  value={person.summary}
                  onChange={(input) => onUpdatePerson(person.id, { summary: input.target.value })}
                />
              </label>
              <label>
                詳細ページ本文
                <RichContentEditor blocks={person.contentBlocks} onChange={(blocks) => onUpdatePerson(person.id, { contentBlocks: blocks })} />
              </label>
              <ChipEditor label="画像URL" values={person.imageUrls ?? []} onChange={(values) => onUpdatePerson(person.id, { imageUrls: values })} placeholder="画像URLを追加" />
              <ChipEditor label="参考資料" values={person.references ?? []} onChange={(values) => onUpdatePerson(person.id, { references: values })} placeholder="資料名・URLを追加" />
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
            <p>{renderLinkedText(term.detail, term.relatedTerms)}</p>
            <RichContentView blocks={term.contentBlocks} />
            <HashtagList values={term.genres} />
            {(term.references ?? []).length > 0 && (
              <div className="references">
                <h3>参考資料</h3>
                {(term.references ?? []).map((reference) => (
                  <p key={reference}>{reference}</p>
                ))}
              </div>
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
                <RichContentEditor blocks={term.contentBlocks} onChange={(blocks) => onUpdateTerm(term.id, { contentBlocks: blocks })} />
              </label>
              <ChipEditor label="紐付ける単語" values={term.relatedTerms} onChange={(values) => onUpdateTerm(term.id, { relatedTerms: values })} placeholder="例: ポリス" />
              <ChipEditor label="画像URL" values={term.imageUrls ?? []} onChange={(values) => onUpdateTerm(term.id, { imageUrls: values })} placeholder="画像URLを追加" />
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

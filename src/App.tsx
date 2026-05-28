import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  BookOpen,
  Edit3,
  Filter,
  Library,
  ListTree,
  Plus,
  Rows3,
  RotateCcw,
  Search,
  UserRound,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { events as seedEvents, people as seedPeople, personEvents, termCards as seedTermCards } from "./data/ww1";
import type { Category, EditableRecord, Event, Person, TermCard, TimelineItem } from "./models";
import { buildTimelineItems, extractCountries, filterTimelineItems, getHistoricalYear } from "./query";

type ViewMode = "timeline" | "category" | "people" | "cards";
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
];

const countryFlags: Record<string, string> = {
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

const formatDate = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function toLabelDate(value: string) {
  const year = getHistoricalYear(value);
  if (year < 1) {
    return `紀元前${Math.abs(year) + 1}年`;
  }
  return formatDate.format(new Date(`${value}T00:00:00`));
}

function toYear(value: string) {
  return getHistoricalYear(value);
}

function toDisplayYear(year: number) {
  return year < 1 ? `前${Math.abs(year) + 1}` : String(year);
}

function getYearTickStep(zoom: number, yearSpan: number) {
  const timelineWidth = 1200 * zoom;
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

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function matchesSearch(value: string, query: string) {
  return value.toLocaleLowerCase("ja").includes(query.trim().toLocaleLowerCase("ja"));
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}`;
}

function App() {
  const [events, setEvents] = useState<Event[]>(seedEvents);
  const [people, setPeople] = useState<Person[]>(seedPeople);
  const [termCards, setTermCards] = useState<TermCard[]>(seedTermCards);
  const [viewMode, setViewMode] = useState<ViewMode>("timeline");
  const [category, setCategory] = useState<Category | "all">("all");
  const [country, setCountry] = useState<string | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [customCategories, setCustomCategories] = useState<Category[]>([]);
  const [customGenres, setCustomGenres] = useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newGenreName, setNewGenreName] = useState("");
  const [detailEditMode, setDetailEditMode] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [timelineHeightZoom, setTimelineHeightZoom] = useState(1.35);
  const [timelineLaneMode, setTimelineLaneMode] = useState<TimelineLaneMode>("country");
  const [activeRecord, setActiveRecord] = useState<EditableRecord | null>(null);
  const [termPopup, setTermPopup] = useState<TermPopup | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const timelineItems = useMemo(() => buildTimelineItems(people, events, personEvents), [people, events]);
  const countries = useMemo(() => extractCountries(people, events), [people, events]);
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
          item.relatedCountries.join(" "),
          (item.genres ?? []).join(" "),
          (item.references ?? []).join(" "),
          item.people.map((person) => person.name).join(" "),
          item.terms.join(" "),
        ].join(" "),
        searchQuery,
      ),
    );
  }, [filteredItems, searchQuery]);

  const relatedPeople = useMemo(() => {
    const linkedIds = new Set(searchedItems.flatMap((item) => item.people.map((person) => person.id)));
    return people.filter((person) => {
      const matchesLinkedEvent = linkedIds.has(person.id);
      const matchesCountry = country === "all" || person.affiliations.includes(country);
      const matchesText =
        !searchQuery.trim() ||
        matchesSearch(
          [person.name, person.summary, person.affiliations.join(" "), (person.genres ?? []).join(" "), (person.references ?? []).join(" ")].join(" "),
          searchQuery,
        );
      return (matchesLinkedEvent || matchesCountry) && matchesText;
    });
  }, [country, searchedItems, people, searchQuery]);

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
        event.relatedCountries.join(" "),
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
      meta: `${toDisplayYear(person.birthYear)}-${toDisplayYear(person.deathYear)}`,
      searchText: [person.name, person.summary, person.affiliations.join(" "), (person.genres ?? []).join(" "), (person.references ?? []).join(" ")].join(" "),
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
        term.aliases.join(" "),
        term.relatedTerms.join(" "),
        (term.genres ?? []).join(" "),
        (term.references ?? []).join(" "),
      ].join(" "),
    }));
    return [...eventCards, ...personCards, ...termKnowledgeCards];
  }, [timelineItems, people, termCards]);

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

  function updateEvent(id: string, patch: Partial<Event>) {
    setEvents((current) => current.map((event) => (event.id === id ? { ...event, ...patch } : event)));
  }

  function updatePerson(id: string, patch: Partial<Person>) {
    setPeople((current) => current.map((person) => (person.id === id ? { ...person, ...patch } : person)));
  }

  function updateTermCard(id: string, patch: Partial<TermCard>) {
    setTermCards((current) => current.map((term) => (term.id === id ? { ...term, ...patch } : term)));
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
      summary: "概要を入力してください。",
      detail: "詳細を入力してください。",
      terms: [],
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
      affiliations: [],
      summary: "人物の概要を入力してください。",
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
            国・所属
            <select value={country} onChange={(event) => setCountry(event.target.value)}>
              <option value="all">すべて</option>
              {countries.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {candidate}
                </option>
              ))}
            </select>
          </label>

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
              <button type="button" onClick={() => setTimelineZoom((value) => Math.max(0.1, value / 1.8))}>
                <ZoomOut size={15} />
              </button>
              <span className="zoom-readout">{Math.round(timelineZoom * 100)}%</span>
              <button type="button" onClick={() => setTimelineZoom((value) => Math.min(200, value * 1.8))}>
                <ZoomIn size={15} />
              </button>
              <input
                className="zoom-input"
                min="10"
                max="20000"
                type="number"
                value={Math.round(timelineZoom * 100)}
                onChange={(event) => setTimelineZoom(Math.max(0.1, Number(event.target.value || 100) / 100))}
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
            onUpdateEvent={updateEvent}
            onUpdatePerson={updatePerson}
            onUpdateTerm={updateTermCard}
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
  onOpenRecord,
}: {
  items: TimelineItem[];
  people: Person[];
  country: string | "all";
  zoom: number;
  heightZoom: number;
  laneMode: TimelineLaneMode;
  onOpenRecord: (record: EditableRecord) => void;
}) {
  const eventYears = items.flatMap((item) => [
    toYear(item.startDate),
    item.endDate ? toYear(item.endDate) : toYear(item.startDate),
  ]);
  const personYears = people.flatMap((person) => [person.birthYear, person.deathYear]);
  if (eventYears.length === 0 && personYears.length === 0) {
    return (
      <div className="timeline-board">
        <div className="empty-state">
          <BookOpen size={22} />
          <span>該当する年表データがありません</span>
        </div>
      </div>
    );
  }
  const minYear = Math.floor(Math.min(...eventYears, ...personYears) / 10) * 10;
  const maxYear = Math.ceil(Math.max(...eventYears, ...personYears) / 10) * 10;
  const span = maxYear - minYear || 1;
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
        : Array.from(new Set(items.flatMap((item) => (item.relatedCountries.length ? item.relatedCountries : ["未分類"])))).slice(0, 20);

  function positionPercent(date: string) {
    return Math.min(100, Math.max(0, ((toYear(date) - minYear) / span) * 100));
  }

  const eventPlacements: EventPlacement[] = (() => {
    const placements = items.flatMap((item) => {
      const targetCountries =
        laneMode === "plain"
          ? ["出来事"]
          : country !== "all"
            ? [country]
            : item.relatedCountries.length
              ? item.relatedCountries
              : ["未分類"];
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
            width: Math.max(right - left, 0.08),
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
        const visualWidth = Math.max(placement.visualWidth, Math.min(18, 1400 / Math.max(1200 * zoom, 1)));
        const stack = stacks.findIndex((end) => placement.left > end + 0.25);
        const nextStack = stack === -1 ? stacks.length : stack;
        placement.stack = nextStack;
        stacks[nextStack] = placement.left + visualWidth;
        stacksByLane.set(placement.lane, stacks);
      });
    return placements;
  })();

  const maxEventStack = Math.max(0, ...eventPlacements.map((placement) => placement.stack));
  const personStackCount = Math.max(1, people.length);
  const rowHeight = Math.max(116, Math.round((104 + maxEventStack * 32) * heightZoom));
  const personRowHeight = Math.max(140, Math.round((68 + personStackCount * 26) * heightZoom));

  function rowTop(lane: number) {
    return lane * rowHeight;
  }

  return (
    <div
      className="timeline-board"
      style={
        {
          "--timeline-width": `${Math.round(1200 * zoom)}px`,
          "--row-height": `${rowHeight}px`,
          "--person-row-height": `${personRowHeight}px`,
        } as CSSProperties
      }
    >
      <div className="timeline-scale" aria-hidden="true">
        {yearTicks.map((year) => (
          <span key={year} style={{ "--left": `${positionPercent(`${year}-01-01`)}%` } as CSSProperties}>
            {toDisplayYear(year)}
          </span>
        ))}
      </div>

      <div className="timeline-grid" style={{ "--country-rows": countryLanes.length } as CSSProperties}>
        <div className="lane-labels">
          {countryLanes.map((lane) => (
            <span key={lane}>
              <b>{laneMode === "plain" ? "年" : countryFlags[lane] ?? "◦"}</b>
              {lane}
            </span>
          ))}
          <span>
            <b>人</b>
            人物レイヤー
          </span>
        </div>

        <div className="lane-canvas">
          {countryLanes.map((lane, index) => (
            <div className="country-lane" key={lane} style={{ "--lane": index } as CSSProperties} />
          ))}
          <div className="person-lane" style={{ "--lane-top": `${countryLanes.length * rowHeight}px` } as CSSProperties} />

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

          {people.map((person, index) => {
            const left = positionPercent(`${person.birthYear}-01-01`);
            const right = positionPercent(`${person.deathYear}-12-31`);
            return (
              <button
                className="person-line"
                key={person.id}
                onClick={() => onOpenRecord({ type: "person", id: person.id })}
                style={
                  {
                    "--left": `${left}%`,
                    "--width": `${Math.max(right - left, 4)}%`,
                    "--offset": index,
                    "--top": `${countryLanes.length * rowHeight + 34 + index * 28}px`,
                  } as CSSProperties
                }
                type="button"
              >
                <span>{person.name}</span>
                <span className="hover-summary person-hover">
                  {(person.imageUrls ?? []).length > 0 && <img alt={person.name} src={person.imageUrls![0]} />}
                  <strong>{person.name}</strong>
                  <b>
                    {toDisplayYear(person.birthYear)}-{toDisplayYear(person.deathYear)}
                  </b>
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
                {toDisplayYear(person.birthYear)}-{toDisplayYear(person.deathYear)}
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
  onUpdateEvent,
  onUpdatePerson,
  onUpdateTerm,
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
  onUpdateEvent: (id: string, patch: Partial<Event>) => void;
  onUpdatePerson: (id: string, patch: Partial<Person>) => void;
  onUpdateTerm: (id: string, patch: Partial<TermCard>) => void;
  renderLinkedText: (text: string, terms: string[]) => ReactNode;
  termPopup: TermPopup | null;
}) {
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
            <div className="preview-images">
              {(event.imageUrls ?? []).length > 0 ? (
                <>
                  <img className="hero-blur" alt="" src={event.imageUrls![0]} />
                  <img className="hero-image" alt={event.title} src={event.imageUrls![0]} />
                </>
              ) : (
                <div className="image-placeholder">{event.title.slice(0, 1)}</div>
              )}
            </div>
            <span className="knowledge-label">出来事 / {event.category}</span>
            <h2>{event.title}</h2>
            <small>
              {toLabelDate(event.startDate)}
              {event.endDate ? ` - ${toLabelDate(event.endDate)}` : ""}
            </small>
            <p>{renderLinkedText(event.detail, event.terms)}</p>
            <div className="chips">
              {(event.genres ?? []).map((item) => (
                <span key={item}>{item}</span>
              ))}
              {event.relatedCountries.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
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
                <label>
                  開始日
                  <input value={event.startDate} onChange={(input) => onUpdateEvent(event.id, { startDate: input.target.value })} />
                </label>
                <label>
                  終了日
                  <input value={event.endDate ?? ""} onChange={(input) => onUpdateEvent(event.id, { endDate: input.target.value || undefined })} />
                </label>
              </div>
              <label>
                カテゴリ
                <select value={event.category} onChange={(input) => onUpdateEvent(event.id, { category: input.target.value as Category })}>
                  {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                ジャンル
                <input
                  list="genre-options"
                  value={(event.genres ?? []).join(", ")}
                  onChange={(input) => onUpdateEvent(event.id, { genres: splitValues(input.target.value) })}
                />
              </label>
              <label>
                関連国
                <input
                  value={event.relatedCountries.join(", ")}
                  onChange={(input) => onUpdateEvent(event.id, { relatedCountries: splitValues(input.target.value) })}
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
                紐付ける単語
                <input value={event.terms.join(", ")} onChange={(input) => onUpdateEvent(event.id, { terms: splitValues(input.target.value) })} />
              </label>
              <label>
                画像URL
                <input
                  value={(event.imageUrls ?? []).join("\n")}
                  onChange={(input) => onUpdateEvent(event.id, { imageUrls: splitListValues(input.target.value) })}
                />
              </label>
              <label>
                参考資料
                <textarea
                  value={(event.references ?? []).join("\n")}
                  onChange={(input) => onUpdateEvent(event.id, { references: input.target.value.split("\n").map((line) => line.trim()).filter(Boolean) })}
                />
              </label>
            </div>
          )}
        </div>
      )}

      {person && (
        <div className="detail-stack">
          <section className="detail-preview primary">
            <div className="preview-images">
              {(person.imageUrls ?? []).length > 0 ? (
                <>
                  <img className="hero-blur" alt="" src={person.imageUrls![0]} />
                  <img className="hero-image" alt={person.name} src={person.imageUrls![0]} />
                </>
              ) : (
                <div className="image-placeholder">{person.name.slice(0, 1)}</div>
              )}
            </div>
            <span className="knowledge-label">人物</span>
            <h2>{person.name}</h2>
            <small>
              {toDisplayYear(person.birthYear)}-{toDisplayYear(person.deathYear)}
            </small>
            <p>{renderLinkedText(person.summary, person.affiliations)}</p>
            <div className="chips">
              {(person.genres ?? []).map((item) => (
                <span key={item}>{item}</span>
              ))}
              {person.affiliations.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
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
                <label>
                  生年
                  <input
                    type="number"
                    value={person.birthYear}
                    onChange={(input) => onUpdatePerson(person.id, { birthYear: Number(input.target.value) })}
                  />
                </label>
                <label>
                  没年
                  <input
                    type="number"
                    value={person.deathYear}
                    onChange={(input) => onUpdatePerson(person.id, { deathYear: Number(input.target.value) })}
                  />
                </label>
              </div>
              <label>
                所属・紐付ける単語
                <input
                  value={person.affiliations.join(", ")}
                  onChange={(input) => onUpdatePerson(person.id, { affiliations: splitValues(input.target.value) })}
                />
              </label>
              <label>
                ジャンル
                <input
                  list="genre-options"
                  value={(person.genres ?? []).join(", ")}
                  onChange={(input) => onUpdatePerson(person.id, { genres: splitValues(input.target.value) })}
                />
              </label>
              <label>
                概要
                <textarea
                  className="large-text"
                  value={person.summary}
                  onChange={(input) => onUpdatePerson(person.id, { summary: input.target.value })}
                />
              </label>
              <label>
                画像URL
                <input
                  value={(person.imageUrls ?? []).join("\n")}
                  onChange={(input) => onUpdatePerson(person.id, { imageUrls: splitListValues(input.target.value) })}
                />
              </label>
              <label>
                参考資料
                <textarea
                  value={(person.references ?? []).join("\n")}
                  onChange={(input) => onUpdatePerson(person.id, { references: input.target.value.split("\n").map((line) => line.trim()).filter(Boolean) })}
                />
              </label>
            </div>
          )}
        </div>
      )}

      {term && (
        <div className="detail-stack">
          <section className="detail-preview primary">
            <div className="preview-images">
              {(term.imageUrls ?? []).length > 0 ? (
                <>
                  <img className="hero-blur" alt="" src={term.imageUrls![0]} />
                  <img className="hero-image" alt={term.term} src={term.imageUrls![0]} />
                </>
              ) : (
                <div className="image-placeholder">{term.term.slice(0, 1)}</div>
              )}
            </div>
            <span className="knowledge-label">単語 / {term.category}</span>
            <h2>{term.term}</h2>
            <small>{term.aliases.length ? `別名: ${term.aliases.join("、")}` : "単語カード"}</small>
            <p>{renderLinkedText(term.detail, term.relatedTerms)}</p>
            <div className="chips">
              {(term.genres ?? []).map((item) => (
                <span key={item}>{item}</span>
              ))}
              {term.relatedTerms.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
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
                <select
                  value={term.category}
                  onChange={(input) => onUpdateTerm(term.id, { category: input.target.value as TermCard["category"] })}
                >
                  {termCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                ジャンル
                <input
                  list="genre-options"
                  value={(term.genres ?? []).join(", ")}
                  onChange={(input) => onUpdateTerm(term.id, { genres: splitValues(input.target.value) })}
                />
              </label>
              <label>
                別名
                <input value={term.aliases.join(", ")} onChange={(input) => onUpdateTerm(term.id, { aliases: splitValues(input.target.value) })} />
              </label>
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
                紐付ける単語
                <input
                  value={term.relatedTerms.join(", ")}
                  onChange={(input) => onUpdateTerm(term.id, { relatedTerms: splitValues(input.target.value) })}
                />
              </label>
              <label>
                画像URL
                <input
                  value={(term.imageUrls ?? []).join("\n")}
                  onChange={(input) => onUpdateTerm(term.id, { imageUrls: splitListValues(input.target.value) })}
                />
              </label>
              <label>
                参考資料
                <textarea
                  value={(term.references ?? []).join("\n")}
                  onChange={(input) => onUpdateTerm(term.id, { references: input.target.value.split("\n").map((line) => line.trim()).filter(Boolean) })}
                />
              </label>
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

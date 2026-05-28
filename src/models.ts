export type Category = string;

export type Person = {
  id: string;
  name: string;
  birthYear: number;
  deathYear: number;
  affiliations: string[];
  summary: string;
  genres?: string[];
  imageUrls?: string[];
  references?: string[];
};

export type Event = {
  id: string;
  title: string;
  startDate: string;
  endDate?: string;
  category: Category;
  relatedCountries: string[];
  summary: string;
  detail: string;
  terms: string[];
  genres?: string[];
  imageUrls?: string[];
  references?: string[];
};

export type PersonEvent = {
  personId: Person["id"];
  eventId: Event["id"];
  role: string;
};

export type TermCard = {
  id: string;
  term: string;
  category: string;
  summary: string;
  detail: string;
  aliases: string[];
  relatedTerms: string[];
  genres?: string[];
  imageUrls?: string[];
  references?: string[];
};

export type TimelineItem = Event & {
  people: Array<Person & { role: string }>;
  displayType: "Range" | "Point";
};

export type EditableRecord = {
  type: "event" | "person" | "term";
  id: string;
};

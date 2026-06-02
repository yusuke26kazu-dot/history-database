export type Category = string;

export type Person = {
  id: string;
  name: string;
  birthYear: number;
  deathYear: number;
  birthDate?: string;
  deathDate?: string;
  countryIds?: string[];
  regionIds?: string[];
  affiliations: string[];
  summary: string;
  contentBlocks?: ContentBlock[];
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
  countryIds?: string[];
  regionIds?: string[];
  locationName?: string;
  locationLat?: number;
  locationLng?: number;
  summary: string;
  detail: string;
  terms: string[];
  contentBlocks?: ContentBlock[];
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
  contentBlocks?: ContentBlock[];
  genres?: string[];
  imageUrls?: string[];
  references?: string[];
};

export type ContentBlock = {
  id: string;
  type: "paragraph" | "heading" | "subheading" | "quote" | "image" | "video";
  text: string;
  caption?: string;
};

export type EraPeriod = {
  id: string;
  name: string;
  group: string;
  startYear: number;
  endYear: number;
  color: string;
};

export type Country = {
  id: string;
  name: string;
  aliases?: string[];
};

export type Region = {
  id: string;
  countryId: Country["id"];
  name: string;
  latitude: number;
  longitude: number;
  note?: string;
};

export type TimelineItem = Event & {
  people: Array<Person & { role: string }>;
  displayType: "Range" | "Point";
};

export type EditableRecord = {
  type: "event" | "person" | "term";
  id: string;
};

import type { Category, Event, Person, PersonEvent, TimelineItem } from "./models";

export function getHistoricalYear(date: string) {
  const match = date.match(/^(-?\d{1,6})/);
  return match ? Number(match[1]) : new Date(`${date}T00:00:00`).getFullYear();
}

export type TimelineFilter = {
  category?: Category | "all";
  country?: string | "all";
};

export function buildTimelineItems(
  people: Person[],
  events: Event[],
  personEvents: PersonEvent[],
): TimelineItem[] {
  return events
    .map((event) => {
      const linkedPeople = personEvents
        .filter((link) => link.eventId === event.id)
        .map((link) => {
          const person = people.find((candidate) => candidate.id === link.personId);
          return person ? { ...person, role: link.role } : undefined;
        })
        .filter((person): person is Person & { role: string } => Boolean(person));

      const displayType: TimelineItem["displayType"] =
        event.endDate && event.endDate !== event.startDate ? "Range" : "Point";

      return {
        ...event,
        people: linkedPeople,
        displayType,
      };
    })
    .sort((a, b) => getHistoricalYear(a.startDate) - getHistoricalYear(b.startDate));
}

export function filterTimelineItems(items: TimelineItem[], filter: TimelineFilter) {
  return items.filter((item) => {
    const matchesCategory =
      !filter.category || filter.category === "all" || item.category === filter.category;

    const matchesCountry =
      !filter.country ||
      filter.country === "all" ||
      item.relatedCountries.includes(filter.country) ||
      item.people.some((person) => person.affiliations.includes(filter.country as string));

    return matchesCategory && matchesCountry;
  });
}

export function extractCountries(people: Person[], events: Event[]) {
  return Array.from(
    new Set([
      ...events.flatMap((event) => event.relatedCountries),
      ...people.flatMap((person) => person.affiliations),
    ]),
  ).sort((a, b) => a.localeCompare(b, "ja"));
}

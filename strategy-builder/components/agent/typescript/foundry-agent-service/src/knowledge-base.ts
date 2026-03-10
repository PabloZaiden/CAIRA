export interface KnowledgeEntry {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly tags: readonly string[];
}

const SHANTY_ENTRIES: readonly KnowledgeEntry[] = [
  {
    id: 'shanty-stormcaller',
    title: 'Stormcaller Refrain',
    summary: 'A rowing shanty with a thunder-and-tide rhythm that works well for dramatic openings.',
    tags: ['storm', 'rhythm', 'opening', 'chorus']
  },
  {
    id: 'shanty-bell',
    title: 'Bell of the Watch',
    summary: 'A call-and-response chant sailors use when changing watches or challenging rivals.',
    tags: ['watch', 'call', 'response', 'challenge']
  },
  {
    id: 'shanty-harbor',
    title: 'Harbor Lantern Song',
    summary: 'A lighter tune about returning to port, useful when praising a clever final verse.',
    tags: ['harbor', 'lantern', 'praise', 'return']
  }
] as const;

const TREASURE_ENTRIES: readonly KnowledgeEntry[] = [
  {
    id: 'treasure-ruby',
    title: 'Ruby Crown',
    summary: 'A jeweled crown rumored to rest in the Cavern of Echoes beneath a split reef.',
    tags: ['ruby', 'crown', 'cavern', 'reef']
  },
  {
    id: 'treasure-atlas',
    title: 'Navigator Atlas',
    summary: 'A weathered atlas hidden in a shipwreck chapel and prized by captains seeking lost currents.',
    tags: ['atlas', 'shipwreck', 'currents', 'map']
  },
  {
    id: 'treasure-idol',
    title: 'Whalebone Idol',
    summary: 'A carved idol guarded by tide pools and cliff paths on a fogbound island.',
    tags: ['idol', 'island', 'fog', 'cliff']
  }
] as const;

const CREW_ENTRIES: readonly KnowledgeEntry[] = [
  {
    id: 'crew-quartermaster',
    title: 'Quartermaster',
    summary: 'Keeps supplies, settles disputes, and favors recruits with practical judgment and discipline.',
    tags: ['quartermaster', 'supplies', 'discipline', 'judgment']
  },
  {
    id: 'crew-navigator',
    title: 'Navigator',
    summary: 'Charts routes, reads stars, and suits recruits who stay calm and think ahead.',
    tags: ['navigator', 'stars', 'planning', 'calm']
  },
  {
    id: 'crew-lookout',
    title: 'Lookout',
    summary: 'Spots hazards early and fits alert recruits with quick reactions and sharp eyes.',
    tags: ['lookout', 'alert', 'hazards', 'quick']
  }
] as const;

function normalise(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function scoreEntry(queryWords: readonly string[], entry: KnowledgeEntry): number {
  const haystack = [...entry.tags, entry.title, entry.summary].join(' ').toLowerCase();
  return queryWords.reduce((score, word) => (haystack.includes(word) ? score + 1 : score), 0);
}

function lookup(entries: readonly KnowledgeEntry[], query: string): readonly KnowledgeEntry[] {
  const words = normalise(query);
  const ranked = entries
    .map((entry) => ({ entry, score: words.length === 0 ? 1 : scoreEntry(words, entry) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, 3)
    .map((item) => item.entry);

  return ranked.length > 0 ? ranked : entries.slice(0, 2);
}

export function lookupShantyKnowledge(query: string): readonly KnowledgeEntry[] {
  return lookup(SHANTY_ENTRIES, query);
}

export function lookupTreasureKnowledge(query: string): readonly KnowledgeEntry[] {
  return lookup(TREASURE_ENTRIES, query);
}

export function lookupCrewKnowledge(query: string): readonly KnowledgeEntry[] {
  return lookup(CREW_ENTRIES, query);
}

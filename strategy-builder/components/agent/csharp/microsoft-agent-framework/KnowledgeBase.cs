namespace CairaAgent;

public sealed record KnowledgeEntry(string Id, string Title, string Summary, IReadOnlyList<string> Tags);

public static class KnowledgeBase
{
    private static readonly IReadOnlyList<KnowledgeEntry> Shanties =
    [
        new("shanty-stormcaller", "Stormcaller Refrain", "A rowing shanty with a thunder-and-tide rhythm that works well for dramatic openings.", ["storm", "rhythm", "opening", "chorus"]),
        new("shanty-bell", "Bell of the Watch", "A call-and-response chant sailors use when changing watches or challenging rivals.", ["watch", "call", "response", "challenge"]),
        new("shanty-harbor", "Harbor Lantern Song", "A lighter tune about returning to port, useful when praising a clever final verse.", ["harbor", "lantern", "praise", "return"])
    ];

    private static readonly IReadOnlyList<KnowledgeEntry> Treasures =
    [
        new("treasure-ruby", "Ruby Crown", "A jeweled crown rumored to rest in the Cavern of Echoes beneath a split reef.", ["ruby", "crown", "cavern", "reef"]),
        new("treasure-atlas", "Navigator Atlas", "A weathered atlas hidden in a shipwreck chapel and prized by captains seeking lost currents.", ["atlas", "shipwreck", "currents", "map"]),
        new("treasure-idol", "Whalebone Idol", "A carved idol guarded by tide pools and cliff paths on a fogbound island.", ["idol", "island", "fog", "cliff"])
    ];

    private static readonly IReadOnlyList<KnowledgeEntry> CrewRoles =
    [
        new("crew-quartermaster", "Quartermaster", "Keeps supplies, settles disputes, and favors recruits with practical judgment and discipline.", ["quartermaster", "supplies", "discipline", "judgment"]),
        new("crew-navigator", "Navigator", "Charts routes, reads stars, and suits recruits who stay calm and think ahead.", ["navigator", "stars", "planning", "calm"]),
        new("crew-lookout", "Lookout", "Spots hazards early and fits alert recruits with quick reactions and sharp eyes.", ["lookout", "alert", "hazards", "quick"])
    ];

    public static IReadOnlyList<KnowledgeEntry> LookupShanty(string query) => Lookup(Shanties, query);

    public static IReadOnlyList<KnowledgeEntry> LookupTreasure(string query) => Lookup(Treasures, query);

    public static IReadOnlyList<KnowledgeEntry> LookupCrew(string query) => Lookup(CrewRoles, query);

    private static IReadOnlyList<KnowledgeEntry> Lookup(IReadOnlyList<KnowledgeEntry> entries, string query)
    {
        var tokens = query.ToLowerInvariant()
            .Split([' ', ',', '.', ';', ':', '!', '?', '/', '-', '_'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        var ranked = entries
            .Select(entry => new
            {
                Entry = entry,
                Score = tokens.Length == 0
                    ? 1
                    : tokens.Count(token =>
                        entry.Title.Contains(token, StringComparison.OrdinalIgnoreCase) ||
                        entry.Summary.Contains(token, StringComparison.OrdinalIgnoreCase) ||
                        entry.Tags.Any(tag => tag.Contains(token, StringComparison.OrdinalIgnoreCase)))
            })
            .Where(item => item.Score > 0)
            .OrderByDescending(item => item.Score)
            .ThenBy(item => item.Entry.Title, StringComparer.Ordinal)
            .Take(3)
            .Select(item => item.Entry)
            .ToList();

        return ranked.Count > 0 ? ranked : entries.Take(2).ToList();
    }
}

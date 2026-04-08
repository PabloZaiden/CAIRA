namespace CairaAgent;

public sealed record KnowledgeEntry(string Id, string Title, string Summary, IReadOnlyList<string> Tags);

public static class KnowledgeBase
{
    private static readonly IReadOnlyList<KnowledgeEntry> Shanties =
    [
        new("shanty-stormcaller", "Qualification Signals Checklist", "Use budget, urgency, business pain, and decision process as the core discovery signals for a first qualification pass.", ["qualification", "budget", "urgency", "decision", "discovery"]),
        new("shanty-bell", "Discovery Question Sequence", "A short pattern that starts with business goals, then blockers, then success measures to keep early conversations focused.", ["questions", "goals", "blockers", "success", "sequence"]),
        new("shanty-harbor", "Opportunity Framing Notes", "Summaries land best when they restate the customer need, the likely fit, and the clearest next step.", ["summary", "fit", "need", "next-step", "opportunity"])
    ];

    private static readonly IReadOnlyList<KnowledgeEntry> Treasures =
    [
        new("treasure-ruby", "Account Priority Map", "Anchor the plan on business outcomes, active stakeholders, delivery risks, and the next committed milestone.", ["account", "priority", "stakeholders", "risk", "milestone"]),
        new("treasure-atlas", "Engagement Motion Guide", "Choose among executive alignment, technical validation, or adoption recovery based on the account signal the user provides.", ["engagement", "executive", "technical", "adoption", "motion"]),
        new("treasure-idol", "Risk Review Prompts", "Surface timeline risk, unclear ownership, low sponsor engagement, and missing success criteria before recommending a plan.", ["risk", "timeline", "ownership", "sponsor", "success"])
    ];

    private static readonly IReadOnlyList<KnowledgeEntry> CrewRoles =
    [
        new("crew-quartermaster", "Strategic Account Lead", "Owns executive alignment, multi-team coordination, and the overall engagement plan for complex accounts.", ["lead", "executive", "coordination", "engagement", "strategy"]),
        new("crew-navigator", "Solution Specialist", "Handles product fit, technical storytelling, and proof planning when the account needs deeper solution confidence.", ["solution", "technical", "fit", "proof", "planning"]),
        new("crew-lookout", "Customer Success Partner", "Focuses on adoption signals, operational blockers, and expansion readiness after the initial plan is in motion.", ["success", "adoption", "operations", "expansion", "readiness"])
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

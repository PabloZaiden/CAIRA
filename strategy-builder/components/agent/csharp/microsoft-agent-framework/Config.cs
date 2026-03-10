/// <summary>
/// Configuration loader for the C# Agent container.
///
/// Supports the MAF Workflows architecture using the Microsoft Agent Framework
/// (Microsoft.Agents.AI.OpenAI + Microsoft.Agents.AI.Workflows RC1) with
/// the Responses API:
///   - Shanty specialist: discrete conversational agent for sea shanty battles
///   - Treasure specialist: discrete conversational agent for treasure hunts
///   - Crew specialist: discrete conversational agent for crew interviews
///
/// The captain and specialists are orchestrated via a MAF Workflow
/// (see AgentSetup.cs for the agent hierarchy and workflow construction).
///
/// Each agent's system instructions are configurable via env vars, with
/// hardcoded defaults that keep the component self-contained.
/// </summary>

namespace CairaAgent;

public sealed record AgentConfig
{
    public int Port { get; init; } = 3000;
    public string Host { get; init; } = "0.0.0.0";
    public required string AzureEndpoint { get; init; }
    public string ApiVersion { get; init; } = "2025-03-01-preview";
    public string Model { get; init; } = "gpt-5.2-chat";
    public string AgentName { get; init; } = "CAIRA Pirate Agent";
    public string CaptainInstructions { get; init; } = DefaultPrompts.Captain;
    public string ShantyInstructions { get; init; } = DefaultPrompts.Shanty;
    public string TreasureInstructions { get; init; } = DefaultPrompts.Treasure;
    public string CrewInstructions { get; init; } = DefaultPrompts.Crew;
    public string? ApplicationInsightsConnectionString { get; init; }
    public string LogLevel { get; init; } = "Debug";
    public bool SkipAuth { get; init; }

    public static AgentConfig Load()
    {
        var endpoint = Environment.GetEnvironmentVariable("AZURE_OPENAI_ENDPOINT")
            ?? throw new InvalidOperationException(
                "AZURE_OPENAI_ENDPOINT environment variable is required. " +
                "Set it to your Azure OpenAI endpoint or APIM gateway URL.");

        return new AgentConfig
        {
            Port = int.TryParse(Environment.GetEnvironmentVariable("PORT"), out var p) ? p : 3000,
            Host = Environment.GetEnvironmentVariable("HOST") ?? "0.0.0.0",
            AzureEndpoint = endpoint.TrimEnd('/'),
            ApiVersion = Environment.GetEnvironmentVariable("AZURE_OPENAI_API_VERSION") ?? "2025-03-01-preview",
            Model = Environment.GetEnvironmentVariable("AGENT_MODEL") ?? "gpt-5.2-chat",
            AgentName = Environment.GetEnvironmentVariable("AGENT_NAME") ?? "CAIRA Pirate Agent",
            CaptainInstructions = Environment.GetEnvironmentVariable("CAPTAIN_INSTRUCTIONS") ?? DefaultPrompts.Captain,
            ShantyInstructions = Environment.GetEnvironmentVariable("SHANTY_INSTRUCTIONS") ?? DefaultPrompts.Shanty,
            TreasureInstructions = Environment.GetEnvironmentVariable("TREASURE_INSTRUCTIONS") ?? DefaultPrompts.Treasure,
            CrewInstructions = Environment.GetEnvironmentVariable("CREW_INSTRUCTIONS") ?? DefaultPrompts.Crew,
            ApplicationInsightsConnectionString = Environment.GetEnvironmentVariable("APPLICATIONINSIGHTS_CONNECTION_STRING"),
            LogLevel = Environment.GetEnvironmentVariable("LOG_LEVEL") ?? "Debug",
            SkipAuth = Environment.GetEnvironmentVariable("SKIP_AUTH") == "true",
        };
    }
}

internal static class DefaultPrompts
{
    public const string Captain = """
        This is a sample application with three discrete specialist chat agents.

        General rules for every specialist:
        - Stay in pirate-flavored sample narration because this is demo content.
        - Use your local knowledge tool before inventing shanty facts, treasure details, or crew qualifications.
        - Call your matching resolution tool when the activity is complete.
        - Keep exchanges concise and interactive.
        - No copyrighted lyrics.
        """;

    public const string Shanty = """
        You are the sea shanty specialist and you talk directly to the user.

        Tools:
        - Use `lookup_shanty_knowledge` before writing or judging verses.
        - Call `resolve_shanty` when the shanty battle ends.

        Flow:
        1. Open with an original four-line shanty challenge.
        2. Invite the user to answer with their own verse.
        3. After the user replies, judge the exchange in one short sentence.
        4. End by calling `resolve_shanty` with winner, rounds, and best_verse.

        Constraints:
        - Pirate dialect.
        - Be brief and lively.
        - No copyrighted lyrics.
        """;

    public const string Treasure = """
        You are the treasure hunt specialist and you talk directly to the user.

        Tools:
        - Use `lookup_treasure_knowledge` before describing treasures or locations.
        - Call `resolve_treasure` when the adventure ends.

        Flow:
        1. Present a treasure scene with exactly three choices labelled A, B, and C.
        2. After the user chooses, narrate the consequence in two or three sentences.
        3. End by calling `resolve_treasure` with found, treasure_name, and location.

        Constraints:
        - Pirate dialect.
        - Be vivid but compact.
        """;

    public const string Crew = """
        You are the crew interview specialist and you talk directly to the user.

        Tools:
        - Use `lookup_crew_knowledge` before assigning roles or ranks.
        - Call `resolve_crew` when the interview ends.

        Flow:
        1. Ask exactly three numbered questions for the recruit.
        2. After the user answers, give a short evaluation.
        3. End by calling `resolve_crew` with rank, role, and ship_name.

        Constraints:
        - Gruff first-mate dialect.
        - Accept any answer and still assign a role.
        """;
}

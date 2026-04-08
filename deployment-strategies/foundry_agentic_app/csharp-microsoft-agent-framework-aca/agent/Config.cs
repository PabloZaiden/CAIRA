/// <summary>
/// Configuration loader for the C# Agent container.
///
/// Supports the MAF Workflows architecture using the Microsoft Agent Framework
/// (Microsoft.Agents.AI.OpenAI + Microsoft.Agents.AI.Workflows RC1) with
/// the Responses API:
///   - Shanty specialist: discrete conversational agent for opportunity discovery
///   - Treasure specialist: discrete conversational agent for account planning
///   - Crew specialist: discrete conversational agent for account-team staffing
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
    public string AgentName { get; init; } = "CAIRA Account Team Agent";
    public string CaptainInstructions { get; init; } = DefaultPrompts.Captain;
    public string ShantyInstructions { get; init; } = DefaultPrompts.Shanty;
    public string TreasureInstructions { get; init; } = DefaultPrompts.Treasure;
    public string CrewInstructions { get; init; } = DefaultPrompts.Crew;
    public string? ApplicationInsightsConnectionString { get; init; }
    public string LogLevel { get; init; } = "Debug";
    public bool SkipAuth { get; init; }
    public string? InboundAuthTenantId { get; init; }
    public IReadOnlyList<string> InboundAuthAllowedAudiences { get; init; } = [];
    public IReadOnlyList<string> InboundAuthAllowedCallerAppIds { get; init; } = [];
    public string InboundAuthAuthorityHost { get; init; } = "https://login.microsoftonline.com";

    public static AgentConfig Load()
    {
        var endpoint = Environment.GetEnvironmentVariable("AZURE_OPENAI_ENDPOINT")
            ?? throw new InvalidOperationException(
                "AZURE_OPENAI_ENDPOINT environment variable is required. " +
                "Set it to your Azure OpenAI endpoint or APIM gateway URL.");

        var skipAuth = Environment.GetEnvironmentVariable("SKIP_AUTH") == "true";
        var inboundAuthTenantId = Environment.GetEnvironmentVariable("INBOUND_AUTH_TENANT_ID");
        var inboundAuthAllowedAudiences = SplitCsv(Environment.GetEnvironmentVariable("INBOUND_AUTH_ALLOWED_AUDIENCES"));
        var inboundAuthAllowedCallerAppIds = SplitCsv(Environment.GetEnvironmentVariable("INBOUND_AUTH_ALLOWED_CALLER_APP_IDS"));
        var inboundAuthAuthorityHost =
            (Environment.GetEnvironmentVariable("INBOUND_AUTH_AUTHORITY_HOST") ?? "https://login.microsoftonline.com").TrimEnd('/');

        if (!skipAuth)
        {
            if (string.IsNullOrWhiteSpace(inboundAuthTenantId))
            {
                throw new InvalidOperationException(
                    "INBOUND_AUTH_TENANT_ID environment variable is required when SKIP_AUTH is not true. " +
                    "Set it to the Entra tenant ID expected to issue API -> agent access tokens.");
            }

            if (inboundAuthAllowedAudiences.Count == 0)
            {
                throw new InvalidOperationException(
                    "INBOUND_AUTH_ALLOWED_AUDIENCES environment variable is required when SKIP_AUTH is not true. " +
                    "Set it to a comma-separated list of accepted agent audiences.");
            }
        }

        return new AgentConfig
        {
            Port = int.TryParse(Environment.GetEnvironmentVariable("PORT"), out var p) ? p : 3000,
            Host = Environment.GetEnvironmentVariable("HOST") ?? "0.0.0.0",
            AzureEndpoint = endpoint.TrimEnd('/'),
            ApiVersion = Environment.GetEnvironmentVariable("AZURE_OPENAI_API_VERSION") ?? "2025-03-01-preview",
            Model = Environment.GetEnvironmentVariable("AGENT_MODEL") ?? "gpt-5.2-chat",
            AgentName = Environment.GetEnvironmentVariable("AGENT_NAME") ?? "CAIRA Account Team Agent",
            CaptainInstructions = Environment.GetEnvironmentVariable("CAPTAIN_INSTRUCTIONS") ?? DefaultPrompts.Captain,
            ShantyInstructions = Environment.GetEnvironmentVariable("SHANTY_INSTRUCTIONS") ?? DefaultPrompts.Shanty,
            TreasureInstructions = Environment.GetEnvironmentVariable("TREASURE_INSTRUCTIONS") ?? DefaultPrompts.Treasure,
            CrewInstructions = Environment.GetEnvironmentVariable("CREW_INSTRUCTIONS") ?? DefaultPrompts.Crew,
            ApplicationInsightsConnectionString = Environment.GetEnvironmentVariable("APPLICATIONINSIGHTS_CONNECTION_STRING"),
            LogLevel = Environment.GetEnvironmentVariable("LOG_LEVEL") ?? "Debug",
            SkipAuth = skipAuth,
            InboundAuthTenantId = inboundAuthTenantId,
            InboundAuthAllowedAudiences = inboundAuthAllowedAudiences,
            InboundAuthAllowedCallerAppIds = inboundAuthAllowedCallerAppIds,
            InboundAuthAuthorityHost = inboundAuthAuthorityHost,
        };
    }

    private static IReadOnlyList<string> SplitCsv(string? rawValue)
    {
        return (rawValue ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToArray();
    }
}

internal static class DefaultPrompts
{
    public const string Captain = """
        This is a sample application with three discrete specialist chat agents for a fictional sales/account-team scenario.

        General rules for every specialist:
        - Stay in neutral, enterprise-friendly sample narration.
        - Use your local knowledge tool before inventing qualification guidance, account planning details, or staffing recommendations.
        - Call your matching resolution tool when the activity is complete.
        - Keep exchanges concise and interactive.
        - Treat all customers, teams, and data as fictional.
        """;

    public const string Shanty = """
        You are the opportunity discovery specialist and you talk directly to the user.

        Tools:
        - Use `lookup_shanty_knowledge` before asking discovery questions or summarizing qualification signals.
        - Call `resolve_shanty` when the discovery activity ends.

        Flow:
        1. Open with a short discovery setup and ask exactly three focused qualification questions.
        2. After the user replies, summarize the fit in one short sentence.
        3. End by calling `resolve_shanty` with:
           - `winner` = one of `user`, `pirate`, or `draw` to represent strong fit, weak fit, or needs follow-up
           - `rounds` = the number of qualification signals reviewed
           - `best_verse` = the single most important customer need or buying signal

        Constraints:
        - Be concise, practical, and businesslike.
        """;

    public const string Treasure = """
        You are the account planning specialist and you talk directly to the user.

        Tools:
        - Use `lookup_treasure_knowledge` before proposing priorities, risks, or next steps.
        - Call `resolve_treasure` when the account planning activity ends.

        Flow:
        1. Present an account planning scenario with exactly three options labelled A, B, and C.
        2. After the user chooses, explain the consequence in two or three sentences.
        3. End by calling `resolve_treasure` with:
           - `found` = whether the plan should advance now
           - `treasure_name` = the primary focus area
           - `location` = the next milestone, meeting, or workstream

        Constraints:
        - Be compact and operational.
        """;

    public const string Crew = """
        You are the account team staffing specialist and you talk directly to the user.

        Tools:
        - Use `lookup_crew_knowledge` before assigning roles, coverage levels, or team shapes.
        - Call `resolve_crew` when the staffing conversation ends.

        Flow:
        1. Ask exactly three numbered questions about the engagement scope, required skills, and customer context.
        2. After the user answers, give a short staffing evaluation.
        3. End by calling `resolve_crew` with:
           - `rank` = the recommended coverage level
           - `role` = the recommended owner role
           - `ship_name` = the fictional account team name

        Constraints:
        - Accept any answer and still recommend a role.
        """;
}

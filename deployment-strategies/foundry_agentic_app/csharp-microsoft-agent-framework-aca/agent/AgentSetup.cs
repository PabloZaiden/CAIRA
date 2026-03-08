/// <summary>
/// Agent setup — how to configure the Microsoft Agent Framework (MAF)
/// on Azure AI Foundry using MAF Workflows.
///
/// The pattern:
///   1. Create a ResponsesClient pointing at Azure OpenAI (or mock)
///   2. Create specialist agents with focused system instructions
///   3. Wrap each specialist as a tool via .AsAIFunction()
///   4. Create resolution tools that capture structured activity outcomes
///   5. Create the captain agent with all tools
///   6. Bind the captain as a workflow executor via .BindAsExecutor()
///   7. Build a Workflow using WorkflowBuilder
///   8. Create a CheckpointManager for multi-turn conversation state
///
/// Architecture diagram (MAF Workflow with agent-as-tool):
///
///     User message
///         |
///         v
///   ┌───────────────────────────────────────────────┐
///   │  MAF Workflow (InProcessExecution)             │
///   │                                               │
///   │  Captain Executor (AIAgentBinding)             │
///   │  ├─ shanty_specialist    (sub-agent tool)     │
///   │  ├─ treasure_specialist  (sub-agent tool)     │
///   │  ├─ crew_specialist     (sub-agent tool)      │
///   │  ├─ resolve_shanty      (lambda tool)         │
///   │  ├─ resolve_treasure    (lambda tool)         │
///   │  └─ resolve_crew        (lambda tool)         │
///   └───────────────────────────────────────────────┘
///         │
///         v
///   WatchStreamAsync() → IAsyncEnumerable&lt;WorkflowEvent&gt;
///   ├─ AgentResponseUpdateEvent (text deltas → message.delta SSE)
///   ├─ AgentResponseUpdateEvent (FunctionCallContent → resolution detection)
///   └─ SuperStepCompletedEvent (checkpoint for multi-turn state)
///
/// The captain is the sole conversational agent. Specialist sub-agents
/// are invoked as tools during the captain's internal tool loop.
///
/// Multi-turn chaining: The MAF CheckpointManager captures the full
/// executor state (including the agent's conversation history) after
/// each super-step. On subsequent parleys, ResumeStreamingAsync
/// restores the checkpoint and the conversation continues seamlessly.
/// </summary>

#pragma warning disable OPENAI001 // ResponsesClient is experimental

using System.ComponentModel;
using Microsoft.Agents.AI;
using Microsoft.Agents.AI.Workflows;
using Microsoft.Extensions.AI;
using OpenAI.Responses;

namespace CairaAgent;

// ---------------------------------------------------------------------------
// Agent setup result
// ---------------------------------------------------------------------------

/// <summary>
/// The result of agent setup — everything needed to run the workflow.
/// Returns a Workflow and CheckpointManager. The workflow engine
/// handles execution, streaming events, and state management.
/// </summary>
public sealed class AgentSetupResult
{
    /// <summary>
    /// The MAF Workflow — a single-executor graph with the captain bound
    /// as executor. Run via InProcessExecution.OffThread.OpenStreamingAsync()
    /// or ResumeStreamingAsync() for subsequent turns.
    /// </summary>
    public required Workflow Workflow { get; init; }

    /// <summary>
    /// In-memory checkpoint manager — stores workflow state (including
    /// conversation history) between parleys. Each conversation gets its
    /// own checkpoint chain via SuperStepCompletedEvent.CompletionInfo.Checkpoint.
    /// </summary>
    public required CheckpointManager CheckpointManager { get; init; }
}

// ---------------------------------------------------------------------------
// Agent setup
// ---------------------------------------------------------------------------

public static class AgentSetup
{
    /// <summary>
    /// Resolution tool name prefix — used to detect resolution tool calls
    /// in AgentResponseUpdateEvent.Update.Contents (FunctionCallContent).
    /// </summary>
    internal const string ResolutionToolPrefix = "resolve_";

    /// <summary>
    /// Create the full agent hierarchy and MAF workflow.
    ///
    /// The pattern:
    ///   1. Create specialist agents with focused instructions
    ///   2. Wrap each as a tool via .AsAIFunction()
    ///   3. Create resolution tools that capture structured outcomes
    ///   4. Create the captain agent with all tools
    ///   5. Bind captain as workflow executor: agent.BindAsExecutor(emitEvents: true)
    ///   6. Build workflow: new WorkflowBuilder(binding).WithOutputFrom(binding).Build()
    ///   7. Create CheckpointManager.CreateInMemory() for multi-turn state
    /// </summary>
    public static AgentSetupResult Create(AgentConfig config, ILogger logger)
    {
        var responsesClient = CreateResponsesClient(config);

        // ---- Specialist sub-agents ----
        // Each specialist has focused system instructions for a specific
        // pirate activity. They generate domain content but never speak
        // directly to the user — the captain incorporates their output.

        var shantyAgent = responsesClient.AsAIAgent(
            instructions: config.ShantyInstructions,
            name: "ShantySpecialist",
            description: "Sea shanty specialist — generates shanty battle content.");

        var treasureAgent = responsesClient.AsAIAgent(
            instructions: config.TreasureInstructions,
            name: "TreasureSpecialist",
            description: "Treasure hunt specialist — generates treasure hunt content.");

        var crewAgent = responsesClient.AsAIAgent(
            instructions: config.CrewInstructions,
            name: "CrewSpecialist",
            description: "Crew interview specialist — generates crew interview content.");

        // ---- Convert specialist agents to tools via .AsAIFunction() ----
        // This is the key MAF pattern: when the captain calls one of these
        // tools, the framework runs the specialist agent internally and
        // returns its output as the tool result. The specialist is a content
        // generator, not a conversational partner.

        var shantyTool = shantyAgent.AsAIFunction(new AIFunctionFactoryOptions
        {
            Name = "shanty_specialist",
            Description = "Call this tool to get sea shanty content — opening verses, verse judgments, etc.",
        });
        var treasureTool = treasureAgent.AsAIFunction(new AIFunctionFactoryOptions
        {
            Name = "treasure_specialist",
            Description = "Call this tool to get treasure hunt content — scene descriptions, outcome narrations, etc.",
        });
        var crewTool = crewAgent.AsAIFunction(new AIFunctionFactoryOptions
        {
            Name = "crew_specialist",
            Description = "Call this tool to get crew interview content — interview questions, answer evaluations, etc.",
        });

        // ---- Resolution tools ----
        // These capture structured outcomes when an activity concludes.
        // Resolution is detected by scanning AgentResponseUpdateEvent.Update.Contents
        // for FunctionCallContent with a "resolve_" prefix in WorkflowRunner.

        var resolveShanty = AIFunctionFactory.Create(
            (
                [Description("Who won the shanty battle")] string winner,
                [Description("Number of rounds completed")] int rounds,
                [Description("The single best verse from the entire battle")] string best_verse
            ) =>
            {
                logger.LogInformation("Shanty battle resolved: {Winner} wins after {Rounds} rounds", winner, rounds);
                return $"Shanty battle resolved: {winner} wins after {rounds} rounds.";
            },
            "resolve_shanty",
            "Call this when the Sea Shanty Battle concludes. Declares the winner and records the outcome.");

        var resolveTreasure = AIFunctionFactory.Create(
            (
                [Description("Whether the treasure was found")] bool found,
                [Description("Name of the treasure")] string treasure_name,
                [Description("Where the treasure was found or lost")] string location
            ) =>
            {
                var outcome = found ? "Found" : "Lost";
                logger.LogInformation("Treasure hunt resolved: {Outcome} \"{TreasureName}\" at {Location}", outcome, treasure_name, location);
                return $"Treasure hunt resolved: {outcome} \"{treasure_name}\" at {location}.";
            },
            "resolve_treasure",
            "Call this when the Treasure Hunt concludes. Records whether treasure was found and details.");

        var resolveCrew = AIFunctionFactory.Create(
            (
                [Description("The assigned rank (e.g., Able Seaman, Quartermaster)")] string rank,
                [Description("The assigned role (e.g., lookout, cook, navigator)")] string role,
                [Description("The name of the ship they are joining")] string ship_name
            ) =>
            {
                logger.LogInformation("Crew interview resolved: {Rank} {Role} aboard the {ShipName}", rank, role, ship_name);
                return $"Crew interview resolved: {rank} {role} aboard the {ship_name}.";
            },
            "resolve_crew",
            "Call this when the crew interview concludes. Assigns a rank and role to the new crew member.");

        var tools = new List<AITool>
        {
            shantyTool, treasureTool, crewTool,
            resolveShanty, resolveTreasure, resolveCrew,
        };

        // ---- Captain agent ----
        // The captain is the sole conversational agent. It talks to the user
        // directly and delegates to specialist tools as needed.

        var captainAgent = responsesClient.AsAIAgent(
            instructions: config.CaptainInstructions,
            name: "Captain",
            tools: tools);

        // ---- Bind captain as workflow executor ----
        // BindAsExecutor(emitEvents: true) wraps the agent as an ExecutorBinding
        // that emits AgentResponseUpdateEvent during streaming. This is how
        // the workflow engine surfaces streaming text deltas and tool call info.

        var captainBinding = captainAgent.BindAsExecutor(emitEvents: true);

        // ---- Build the workflow ----
        // WorkflowBuilder creates a single-executor workflow graph with the
        // captain as both the entry point and the output source.

        var workflow = new WorkflowBuilder(captainBinding)
            .WithOutputFrom(captainBinding)
            .Build();

        // ---- Create checkpoint manager ----
        // CheckpointManager.CreateInMemory() stores workflow state (including
        // the agent's full conversation history) between parleys. Each
        // SuperStepCompletedEvent yields a CheckpointInfo that can be used
        // to resume the workflow for the next turn.

        var checkpointManager = CheckpointManager.CreateInMemory();

        logger.LogInformation(
            "Agent hierarchy initialised with MAF Workflow (model={Model}, name={AgentName})",
            config.Model, config.AgentName);

        return new AgentSetupResult
        {
            Workflow = workflow,
            CheckpointManager = checkpointManager,
        };
    }

    // ---- Helpers ----

    /// <summary>
    /// Create a ResponsesClient pointing at Azure OpenAI.
    ///
    /// Always uses AzureOpenAIClient with a TokenCredential:
    ///   - HTTPS endpoint (production): DefaultAzureCredential for real
    ///     Azure AD tokens via the cognitiveservices scope
    ///   - HTTP endpoint + SKIP_AUTH (local dev / CI): a static dummy
    ///     token credential — the Azure SDK's AzureTokenAuthenticationPolicy
    ///     has no HTTPS enforcement, so this sends "Bearer dummy" which
    ///     any permissive endpoint accepts
    ///
    /// The agent code path is identical regardless of the target endpoint.
    /// </summary>
    private static OpenAI.Responses.ResponsesClient CreateResponsesClient(AgentConfig config)
    {
        var isHttpEndpoint = config.AzureEndpoint.StartsWith("http://");

        Azure.Core.TokenCredential credential = isHttpEndpoint && config.SkipAuth
            ? new StaticTokenCredential("dummy")
            : new Azure.Identity.DefaultAzureCredential();

        var azureClient = new Azure.AI.OpenAI.AzureOpenAIClient(
            new Uri(config.AzureEndpoint),
            credential);
        return azureClient.GetResponsesClient(config.Model);
    }
}

// ---------------------------------------------------------------------------
// Static token credential — dummy bearer token for HTTP endpoints
// ---------------------------------------------------------------------------

/// <summary>
/// A TokenCredential that always returns a fixed token string.
/// Used for HTTP endpoints (local dev / CI) where the Azure SDK's
/// DefaultAzureCredential cannot acquire real tokens. Equivalent to
/// the TypeScript pattern: () => Promise.resolve('dummy').
/// </summary>
internal sealed class StaticTokenCredential : Azure.Core.TokenCredential
{
    private readonly Azure.Core.AccessToken _token;

    public StaticTokenCredential(string token)
    {
        _token = new Azure.Core.AccessToken(token, DateTimeOffset.MaxValue);
    }

    public override Azure.Core.AccessToken GetToken(
        Azure.Core.TokenRequestContext requestContext, CancellationToken cancellationToken)
        => _token;

    public override ValueTask<Azure.Core.AccessToken> GetTokenAsync(
        Azure.Core.TokenRequestContext requestContext, CancellationToken cancellationToken)
        => new(_token);
}

// ---------------------------------------------------------------------------
// SSE formatting helper
// ---------------------------------------------------------------------------

/// <summary>
/// Format SSE events as "event: {name}\ndata: {json}\n\n" strings.
/// Shared by WorkflowRunner for all SSE event types.
/// </summary>
internal static class SseFormatter
{
    public static string Format(string eventName, object data)
    {
        return $"event: {eventName}\ndata: {System.Text.Json.JsonSerializer.Serialize(data)}\n\n";
    }
}

/// <summary>
/// Agent container entry point — ASP.NET Core Minimal API.
///
/// Starts the CAIRA pirate agent using the Microsoft Agent Framework (MAF)
/// Workflow engine for agent orchestration. The captain agent is bound as
/// a workflow executor and manages specialist sub-agents as tools via the
/// Responses API.
///
/// Startup flow:
///   1. Load config from environment variables
///   2. Create the agent hierarchy and MAF Workflow via AgentSetup.Create()
///   3. Wire ConversationStore (state) and WorkflowRunner (execution)
///   4. Register HTTP routes
///   5. Start listening
/// </summary>

using CairaAgent;
using Microsoft.Agents.AI.Workflows;

var config = AgentConfig.Load();

var builder = WebApplication.CreateBuilder(args);

// Configure logging
builder.Logging.SetMinimumLevel(config.LogLevel.ToLowerInvariant() switch
{
    "trace" => LogLevel.Trace,
    "debug" => LogLevel.Debug,
    "info" or "information" => LogLevel.Information,
    "warn" or "warning" => LogLevel.Warning,
    "error" => LogLevel.Error,
    "fatal" or "critical" => LogLevel.Critical,
    _ => LogLevel.Debug,
});

// Register services
builder.Services.AddSingleton(config);
builder.Services.AddSingleton<ConversationStore>();

var app = builder.Build();

// Create agent hierarchy — this builds the captain agent, specialist
// sub-agents, resolution tools, MAF Workflow, and CheckpointManager.
AgentSetupResult? setup = null;
try
{
    setup = AgentSetup.Create(config, app.Logger);
}
catch (Exception ex)
{
    app.Logger.LogWarning(ex, "Failed to create agent setup — starting in degraded mode");
}

// Create the workflow runner — bridges the workflow to HTTP/SSE
WorkflowRunner? runner = null;
if (setup != null)
{
    var store = app.Services.GetRequiredService<ConversationStore>();
    runner = new WorkflowRunner(
        setup,
        store,
        app.Services.GetRequiredService<ILoggerFactory>().CreateLogger<WorkflowRunner>());
}

// Fallback runner for degraded mode — returns unhealthy status
runner ??= new WorkflowRunner(
    new AgentSetupResult
    {
        Workflow = null!,
        CheckpointManager = CheckpointManager.CreateInMemory(),
    },
    app.Services.GetRequiredService<ConversationStore>(),
    app.Services.GetRequiredService<ILoggerFactory>().CreateLogger<WorkflowRunner>());

// Register routes
Routes.MapRoutes(app, app.Services.GetRequiredService<ConversationStore>(), runner, config);

// Start server
app.Urls.Clear();
app.Urls.Add($"http://{config.Host}:{config.Port}");

app.Logger.LogInformation("Agent container listening at http://{Host}:{Port}", config.Host, config.Port);

app.Run();

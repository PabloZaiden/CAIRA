/// <summary>
/// Agent container entry point — ASP.NET Core Minimal API.
///
/// Starts the CAIRA sales agent using the Microsoft Agent Framework (MAF)
/// Workflow engine for agent orchestration. The selected specialist workflow
/// handles the user-facing exchange for the current activity mode.
///
/// Startup flow:
///   1. Load config from environment variables
///   2. Create the per-mode workflows via AgentSetup.Create()
///   3. Wire ConversationStore (state) and WorkflowRunner (execution)
///   4. Register HTTP routes
///   5. Start listening
/// </summary>

using CairaAgent;
using Microsoft.Agents.AI.Workflows;
using System.Diagnostics;

var config = AgentConfig.Load();

var builder = WebApplication.CreateBuilder(args);
builder.AddCairaTelemetry("caira-agent-csharp", config.ApplicationInsightsConnectionString);

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
builder.Services.AddSingleton<IIncomingTokenValidator>(
    config.SkipAuth ? new NoOpIncomingTokenValidator() : new EntraIncomingTokenValidator(config));

var app = builder.Build();

// Create agent hierarchy — this builds the coordinator agent, specialist
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
        app.Services.GetRequiredService<ILoggerFactory>().CreateLogger<WorkflowRunner>(),
        app.Services.GetRequiredService<ActivitySource>());
}

// Fallback runner for degraded mode — returns unhealthy status
runner ??= new WorkflowRunner(
    new AgentSetupResult
    {
        Workflow = null,
        CheckpointManager = CheckpointManager.CreateInMemory(),
        WorkflowsByMode = new Dictionary<string, Workflow>(),
    },
    app.Services.GetRequiredService<ConversationStore>(),
    app.Services.GetRequiredService<ILoggerFactory>().CreateLogger<WorkflowRunner>(),
    app.Services.GetRequiredService<ActivitySource>());

// Register routes
Routes.MapRoutes(
    app,
    app.Services.GetRequiredService<ConversationStore>(),
    runner,
    config,
    app.Services.GetRequiredService<IIncomingTokenValidator>());

// Start server
app.Urls.Clear();
app.Urls.Add($"http://{config.Host}:{config.Port}");

app.Logger.LogInformation("Agent container listening at http://{Host}:{Port}", config.Host, config.Port);

app.Run();

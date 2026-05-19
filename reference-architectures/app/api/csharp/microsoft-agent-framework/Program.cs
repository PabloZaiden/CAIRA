using System.Text.Json.Serialization;
using Azure.Identity;
using Azure.AI.OpenAI;
using Microsoft.Agents.AI;
using Microsoft.Agents.AI.Workflows;
using Microsoft.Extensions.AI;

#pragma warning disable OPENAI001

var builder = WebApplication.CreateBuilder(args);
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});
builder.Services.AddSingleton(AgentConfig.Load(builder.Configuration));
builder.Services.AddSingleton<ReferenceAgent>();

var app = builder.Build();

app.MapGet("/health", () => Results.Ok(new HealthResponse("healthy")));

app.MapPost("/chat", async (ChatRequest request, ReferenceAgent agent) =>
{
    if (string.IsNullOrWhiteSpace(request.Message))
    {
        return Results.BadRequest(new ErrorResponse("message is required."));
    }

    var conversationId = string.IsNullOrWhiteSpace(request.ConversationId)
        ? Guid.NewGuid().ToString("n")
        : request.ConversationId;

    var reply = await agent.ReplyAsync(request.Message, app.Lifetime.ApplicationStopping);
    return Results.Ok(new ChatResponse(conversationId, reply, agent.ModelName));
});

app.Run();

public sealed record ChatRequest(string? Message, string? ConversationId);
public sealed record ChatResponse(string ConversationId, string Reply, string Model);
public sealed record HealthResponse(string Status);
public sealed record ErrorResponse(string Error);

public sealed class AgentConfig
{
    public required string AzureOpenAIEndpoint { get; init; }
    public required string Model { get; init; }
    public required string Instructions { get; init; }

    public static AgentConfig Load(IConfiguration configuration)
    {
        var endpoint = configuration["AZURE_OPENAI_ENDPOINT"];
        if (string.IsNullOrWhiteSpace(endpoint))
        {
            throw new InvalidOperationException("AZURE_OPENAI_ENDPOINT is required.");
        }

        return new AgentConfig
        {
            AzureOpenAIEndpoint = endpoint,
            Model = configuration["AGENT_MODEL"] ?? "gpt-5-mini",
            Instructions = configuration["AGENT_INSTRUCTIONS"] ??
                "You are a concise assistant. Answer directly and ask for missing details only when necessary.",
        };
    }
}

public sealed class ReferenceAgent
{
    private readonly AgentConfig _config;
    private readonly DefaultAzureCredential _credential = new();
    private readonly Workflow _workflow;

    public ReferenceAgent(AgentConfig config)
    {
        _config = config;
        var chatClient = new AzureOpenAIClient(new Uri(_config.AzureOpenAIEndpoint), _credential)
            .GetChatClient(_config.Model)
            .AsIChatClient();
        var agent = chatClient.AsAIAgent(
            instructions: _config.Instructions,
            name: "CAIRAReferenceAgent");
        var executor = agent.BindAsExecutor(emitEvents: true);
        _workflow = new WorkflowBuilder(executor)
            .WithOutputFrom(executor)
            .Build();
    }

    public string ModelName => _config.Model;

    public async Task<string> ReplyAsync(string userMessage, CancellationToken cancellationToken)
    {
        var response = new System.Text.StringBuilder();
        var run = await InProcessExecution.OffThread.OpenStreamingAsync(_workflow, cancellationToken: cancellationToken);
        await using (run)
        {
            await run.TrySendMessageAsync(userMessage);
            await run.TrySendMessageAsync(new TurnToken(emitEvents: true));

            await foreach (var evt in run.WatchStreamAsync().WithCancellation(cancellationToken))
            {
                if (evt is AgentResponseUpdateEvent update && update.Update?.Text is { Length: > 0 } text)
                {
                    response.Append(text);
                }
            }
        }

        return response.ToString();
    }
}

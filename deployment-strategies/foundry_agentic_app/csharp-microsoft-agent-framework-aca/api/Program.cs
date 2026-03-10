/// <summary>
/// API container entry point — ASP.NET Core Minimal API.
///
/// Starts the pirate-themed business API on the configured port.
/// Handles graceful shutdown via IHostApplicationLifetime.
/// </summary>

namespace CairaApi;

public class Program
{
    public static void Main(string[] args)
    {
        var config = ApiConfig.FromEnvironment();

        var builder = WebApplication.CreateBuilder(args);
        builder.AddCairaTelemetry("caira-api-csharp", config.ApplicationInsightsConnectionString);

        // Configure logging
        builder.Logging.SetMinimumLevel(config.LogLevel.ToLowerInvariant() switch
        {
            "trace" or "verbose" => LogLevel.Trace,
            "debug" => LogLevel.Debug,
            "information" or "info" => LogLevel.Information,
            "warning" or "warn" => LogLevel.Warning,
            "error" => LogLevel.Error,
            "critical" or "fatal" => LogLevel.Critical,
            _ => LogLevel.Debug,
        });

        // Register services
        builder.Services.AddSingleton(config);
        builder.Services.AddHttpClient<AgentHttpClient>();
        builder.Services.AddSingleton(new System.Diagnostics.ActivitySource("caira-api-csharp"));

        var app = builder.Build();

        if (!config.SkipAuth)
        {
            app.Use(async (context, next) =>
            {
                var path = context.Request.Path.Value ?? string.Empty;
                if (path is "/health" or "/identity" or "/metrics")
                {
                    await next();
                    return;
                }

                var authHeader = context.Request.Headers.Authorization.ToString();
                if (string.IsNullOrWhiteSpace(authHeader) ||
                    !authHeader.StartsWith("Bearer ") ||
                    authHeader.Length <= "Bearer ".Length)
                {
                    context.Response.StatusCode = 401;
                    context.Response.ContentType = "application/json";
                    await context.Response.WriteAsync(
                        System.Text.Json.JsonSerializer.Serialize(new ErrorResponse("unauthorized", "Missing or invalid Authorization header")));
                    return;
                }

                await next();
            });
        }

        // Map routes
        app.MapRoutes();

        // Start server
        var url = $"http://{config.Host}:{config.Port}";
        app.Urls.Add(url);

        app.Logger.LogInformation("Pirate API listening at {Url}", url);
        app.Run();
    }
}

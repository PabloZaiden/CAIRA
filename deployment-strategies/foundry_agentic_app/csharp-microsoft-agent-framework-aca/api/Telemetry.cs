using Azure.Monitor.OpenTelemetry.AspNetCore;
using OpenTelemetry.Trace;
using System.Diagnostics;

namespace CairaApi;

internal static class TelemetryExtensions
{
    public static void AddCairaTelemetry(this WebApplicationBuilder builder, string serviceName, string? connectionString)
    {
        // lgtm[cs/local-not-disposed] The DI container owns this singleton for the application lifetime.
        builder.Services.AddSingleton(new ActivitySource(serviceName));

        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return;
        }

        builder.Services.AddOpenTelemetry()
            .UseAzureMonitor(options =>
            {
                options.ConnectionString = connectionString;
                options.EnableLiveMetrics = false;
            })
            .WithTracing(tracing => tracing
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation());
    }
}

using Azure.Monitor.OpenTelemetry.AspNetCore;
using OpenTelemetry.Trace;
using System.Diagnostics;

namespace CairaApi;

internal static class TelemetryExtensions
{
    public static void AddCairaTelemetry(this WebApplicationBuilder builder, string serviceName, string? connectionString)
    {
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return;
        }

        builder.Services.AddOpenTelemetry().UseAzureMonitor(options =>
        {
            options.ConnectionString = connectionString;
            options.EnableLiveMetrics = false;
        });

        builder.Services.ConfigureOpenTelemetryTracerProvider((_, tracing) => tracing
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation());

        builder.Services.AddSingleton(new ActivitySource(serviceName));
    }
}

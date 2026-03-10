import { context, propagation, trace } from '@opentelemetry/api';
import { shutdownAzureMonitor, useAzureMonitor } from '@azure/monitor-opentelemetry';

let telemetryInitialised = false;

export function setupTelemetry(connectionString: string | undefined, serviceName: string): void {
  if (telemetryInitialised || !connectionString) {
    return;
  }

  useAzureMonitor({
    azureMonitorExporterOptions: {
      connectionString
    },
    instrumentationOptions: {
      azureSdk: { enabled: true },
      http: { enabled: true }
    },
    enableLiveMetrics: false,
    samplingRatio: 1
  });

  telemetryInitialised = true;
  const tracer = trace.getTracer(serviceName);
  tracer.startActiveSpan(`${serviceName}.startup`, (span) => {
    span.end();
  });
}

export async function shutdownTelemetry(): Promise<void> {
  if (!telemetryInitialised) {
    return;
  }
  await shutdownAzureMonitor();
  telemetryInitialised = false;
}

export function injectTraceContext(headers: Record<string, string>): Record<string, string> {
  propagation.inject(context.active(), headers);
  return headers;
}

export function extractTraceContext(headers: Record<string, string | string[] | undefined>) {
  const carrier: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      carrier[key] = value;
    } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
      carrier[key] = value[0];
    }
  }
  return propagation.extract(context.active(), carrier);
}

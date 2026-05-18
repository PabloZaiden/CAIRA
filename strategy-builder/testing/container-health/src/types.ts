/**
 * Container Health Validator — Type definitions
 */

/** Options for validating a container's health */
export interface ValidateContainerOptions {
  /** Path to the Dockerfile (absolute or relative to cwd) */
  dockerfile: string;

  /** Health endpoint path (e.g., "/health") */
  healthEndpoint: string;

  /** Host port to map the container port to (default: random available port) */
  port?: number | undefined;

  /** Container port to expose (default: same as port, or 3000) */
  containerPort?: number | undefined;

  /** Path to an env file to pass to the container (optional) */
  envFile?: string | undefined;

  /** Additional environment variables to pass to the container */
  env?: Record<string, string> | undefined;

  /** Maximum time to wait for health check in milliseconds (default: 60_000) */
  timeout?: number | undefined;

  /** Docker build context directory (default: directory containing the Dockerfile) */
  context?: string | undefined;

  /** Docker image tag to use (default: auto-generated) */
  imageTag?: string | undefined;

  /** Whether to keep the container running after validation (default: false) */
  keepAlive?: boolean | undefined;
}

/** Result of a container health validation */
export interface ValidateContainerResult {
  /** Whether the health check passed */
  passed: boolean;

  /** The image that was built */
  imageTag: string;

  /** The container ID (if started) */
  containerId?: string | undefined;

  /** The port the container was mapped to on the host */
  hostPort?: number | undefined;

  /** Duration of the build step in milliseconds */
  buildDurationMs: number;

  /** Duration of the health check polling in milliseconds */
  healthCheckDurationMs: number;

  /** Total duration in milliseconds */
  totalDurationMs: number;

  /** HTTP status code from the health endpoint (if reached) */
  healthStatus?: number | undefined;

  /** Response body from the health endpoint (if reached) */
  healthBody?: string | undefined;

  /** Error message if validation failed */
  error?: string | undefined;

  /** Cleanup performed (image removed, container removed) */
  cleanup: CleanupResult;
}

/** Result of cleanup operations */
export interface CleanupResult {
  containerRemoved: boolean;
  imageRemoved: boolean;
}

/** Options for the health polling function */
export interface PollHealthOptions {
  /** URL to poll */
  url: string;

  /** Maximum time to wait in milliseconds */
  timeout: number;

  /** Initial delay between polls in milliseconds (default: 250) */
  initialDelay?: number | undefined;

  /** Maximum delay between polls in milliseconds (default: 5000) */
  maxDelay?: number | undefined;

  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number | undefined;

  /** AbortSignal to cancel polling */
  signal?: AbortSignal | undefined;
}

/** Result of a health poll */
export interface PollHealthResult {
  /** Whether the health check succeeded (HTTP 200) */
  healthy: boolean;

  /** HTTP status code (if a response was received) */
  status?: number | undefined;

  /** Response body (if a response was received) */
  body?: string | undefined;

  /** Duration in milliseconds */
  durationMs: number;

  /** Number of poll attempts made */
  attempts: number;

  /** Error message if polling failed */
  error?: string | undefined;
}

/** Options for parsing an env file */
export interface EnvFileEntry {
  key: string;
  value: string;
}

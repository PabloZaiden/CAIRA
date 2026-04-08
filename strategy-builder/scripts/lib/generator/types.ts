/**
 * Types for the sample generator.
 *
 * These define the shape of component manifests (component.json) and the
 * configuration objects used to generate self-contained deployment strategies.
 */

// ---------------------------------------------------------------------------
// Component manifest — matches component.json on disk
// ---------------------------------------------------------------------------

/** Valid component types. */
export type ComponentType = 'agent' | 'api' | 'frontend' | 'iac';

/**
 * Schema for component.json files found in the components/ tree.
 *
 * Every component declares its type, language, ports, health endpoint,
 * required/optional env vars, and which OpenAPI contract it implements.
 */
export interface ComponentManifest {
  /** Logical role — "agent", "api", "frontend", or "iac". */
  readonly name: string;
  /** Component type discriminator. */
  readonly type: ComponentType;
  /** Sub-variant, e.g. "foundry-agent-service" or "react-typescript". */
  readonly variant?: string | undefined;
  /** Implementation language, e.g. "typescript". */
  readonly language: string;
  /** Human-readable description. */
  readonly description?: string | undefined;
  /** Port the container listens on. */
  readonly port: number;
  /** Health-check path, e.g. "/health". */
  readonly healthEndpoint: string;
  /** Env vars that MUST be set for the component to start. */
  readonly requiredEnv: readonly string[];
  /** Env vars that MAY be set (with sensible defaults). */
  readonly optionalEnv: readonly string[];
  /** Repo-relative path to the OpenAPI spec this component implements. */
  readonly contractSpec: string;
  /** Short suffix used in generated strategy names (primarily for IaC variants). */
  readonly strategySuffix?: string | undefined;
  /** Reference architecture IDs this component is compatible with. */
  readonly referenceArchitectures?: readonly string[] | undefined;
}

// ---------------------------------------------------------------------------
// Discovered component — manifest + location on disk
// ---------------------------------------------------------------------------

/**
 * A component discovered by walking the components/ tree.
 * Pairs the parsed manifest with its absolute directory path.
 */
export interface DiscoveredComponent {
  /** Parsed and validated manifest. */
  readonly manifest: ComponentManifest;
  /** Absolute path to the component directory (contains component.json). */
  readonly dir: string;
  /**
   * Repo-relative path from the repository root, e.g.
   * "components/agent/typescript/foundry-agent-service".
   */
  readonly relPath: string;
}

// ---------------------------------------------------------------------------
// Reference architecture manifest + discovery
// ---------------------------------------------------------------------------

export interface ReferenceArchitectureManifest {
  /** Stable identifier used in paths and provenance. */
  readonly id: string;
  /** Human-readable name for docs and generated output. */
  readonly displayName: string;
  /** Optional description. */
  readonly description?: string | undefined;
  /** Whether this is the default reference architecture. */
  readonly default?: boolean | undefined;
}

export interface DiscoveredReferenceArchitecture {
  /** Parsed and validated manifest. */
  readonly manifest: ReferenceArchitectureManifest;
  /** Absolute path to the reference architecture directory. */
  readonly dir: string;
  /** Repo-relative path to the reference architecture directory. */
  readonly relPath: string;
}

// ---------------------------------------------------------------------------
// Sample configuration — what the generator produces for each sample
// ---------------------------------------------------------------------------

/**
 * Fully-resolved configuration for one generated deployment strategy.
 * Built by the matrix builder from discovered components.
 */
export interface SampleConfig {
  /** Leaf strategy directory name, e.g. "typescript-foundry-agent-service-aca". */
  readonly name: string;
  /** Strategy path relative to deployment-strategies/, grouped by reference architecture. */
  readonly relativeDir: string;
  /** The reference architecture this strategy is derived from. */
  readonly referenceArchitecture: DiscoveredReferenceArchitecture;
  /** The implementation language (from the agent component). */
  readonly language: string;
  /** The agent variant slug, e.g. "foundry-agent-service". */
  readonly agentVariant: string;
  /** The infrastructure/app-platform suffix used in the strategy name, e.g. "aca". */
  readonly infraVariant: string;
  /** Agent component. */
  readonly agent: DiscoveredComponent;
  /** API component. */
  readonly api: DiscoveredComponent;
  /** Frontend component. */
  readonly frontend: DiscoveredComponent;
  /** IaC component for this combination. */
  readonly iac: DiscoveredComponent;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Result of validating a component.json file. */
export type ValidationResult =
  | { readonly ok: true; readonly manifest: ComponentManifest }
  | { readonly ok: false; readonly errors: readonly string[] };

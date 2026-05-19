# Security posture

CAIRA reference components favor passwordless Azure authentication and managed identity patterns. Do not commit secrets, API keys, or environment-specific credentials.

The beta2 references intentionally omit local auth sidecars and test-only auth bypass infrastructure. Add authentication appropriate to the user's target environment when adapting a component.

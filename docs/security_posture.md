<!-- META
 title: CAIRA Security Posture
 description: Security principles and production hardening guidance for CAIRA.
 author: CAIRA Team
 ms.topic: concept
-->

# CAIRA Security Posture

CAIRA provides a secure baseline for experimenting with and validating Azure AI solutions across the full stack: macro reference-architecture infrastructure, application-layer infrastructure, and application components. The repository is designed to accelerate delivery while keeping security-relevant defaults explicit and easy to extend.

## Security principles

- **Passwordless first** — prefer Managed Identity, Azure CLI auth, and Azure AD over long-lived secrets.
- **Configurable network posture** — the reference architecture supports public and private variants without duplicating the core design.
- **Composable hardening** — CAIRA is structured so teams can add stricter controls without rewriting the whole solution.
- **Repeatable validation** — pull requests run static validation and security scanning; nightly validation exercises deployed strategies end to end.

## What the baseline includes

- RBAC-aware Azure resource deployment patterns
- TLS-based service communication
- optional private networking for Azure AI workloads
- macro reference-architecture support for observability and service composition
- secret scanning and infrastructure security checks in CI

## What teams should still add for production

CAIRA is a starting point, not a finished production landing zone. Production deployments should add the controls that match the target environment, including:

- stricter network controls such as NSGs, WAFs, or hub-spoke connectivity
- customer-managed keys and expanded key-management processes when required
- environment-specific RBAC review and least-privilege assignments
- organization-specific monitoring, alerting, compliance, and incident response integrations
- explicit data protection, backup, and disaster recovery policies

## Practical guidance

Use CAIRA to validate architecture choices quickly, then harden the resulting reference architecture and deployment strategy for the target workload. The repository structure is intended to make that progression straightforward without separating infrastructure concerns from the application and deployment concerns they support.

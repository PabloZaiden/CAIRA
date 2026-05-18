<!-- META
 title: CAIRA Security Posture
 description: Security principles and production hardening guidance for CAIRA.
 author: CAIRA Team
 ms.topic: concept
-->

# CAIRA Security Posture

CAIRA provides a secure baseline for experimenting with and validating Azure AI solutions across the full stack: macro reference-architecture infrastructure, application-layer infrastructure, and application components. The repository is designed to accelerate delivery while keeping security-relevant defaults explicit and easy to extend.

This document separates:

- what the repository baseline already implements
- what the current samples recommend more strongly than before
- what remains intentionally outside the sample boundary
- how local development differs from Azure deployment and real production

## Security principles

- **Passwordless first** — prefer Managed Identity, Azure CLI auth, and Azure AD over long-lived secrets.
- **Configurable network posture** — the reference architecture supports public and private variants without duplicating the core design.
- **Composable hardening** — CAIRA is structured so teams can add stricter controls without rewriting the whole solution.
- **Repeatable validation** — pull requests run static validation and security scanning; nightly validation exercises deployed strategies end to end.
- **Explicit trust boundaries** — app-to-app traffic in the hardened samples is authenticated with Entra-issued access tokens instead of placeholder bearer checks.

## What the baseline includes

- RBAC-aware Azure resource deployment patterns
- TLS-based service communication
- optional private networking for Azure AI workloads
- macro reference-architecture support for observability and service composition
- secret scanning and infrastructure security checks in CI
- OpenTelemetry/Application Insights integration points in the app layer and deployment strategies
- hardened service-to-service auth in the updated frontend BFF, API, and agent samples:
  - **Frontend BFF -> API** acquires Entra tokens for `API_TOKEN_SCOPE`
  - **API -> agent** acquires Entra tokens for `AGENT_TOKEN_SCOPE`
  - **API and agent inbound auth** validate signature/JWKS, `exp`, `iss`, `aud`, and optional caller application IDs

## Identity and auth baseline

The hardened sample path now assumes **Entra-issued service-to-service access tokens** for internal hops.

### API inbound trust

The API expects bearer tokens issued by the configured tenant and validates:

- issuer derived from `INBOUND_AUTH_TENANT_ID` and `INBOUND_AUTH_AUTHORITY_HOST`
- audience from `INBOUND_AUTH_ALLOWED_AUDIENCES`
- expiry (`exp`)
- token signature via tenant metadata / JWKS
- optional caller allowlist from `INBOUND_AUTH_ALLOWED_CALLER_APP_IDS`

### Agent inbound trust

The agent containers use the same validation pattern and configuration shape for API -> agent traffic.

### Local development versus Azure

- **Local sample/dev path** can set `SKIP_AUTH=true` to bypass inbound token validation for mock and compose-based flows.
- **Local credentialed path** uses Azure CLI-backed or other runtime-appropriate Azure credentials so the sample can request real tokens while still running outside Azure.
- **Azure deployment path** uses managed identity for outbound token acquisition and expects the configured audiences and callers to match the deployed app identities.
- **Azure deployment prerequisite** for the hardened inter-service path is tenant permission to create the Entra application registrations, service principals, and app-role assignments that back the API and agent audiences.

`SKIP_AUTH=true` is an explicit sample-development convenience, not a production recommendation.

## What the sample is intentionally teaching

CAIRA now goes beyond vague "add auth later" placeholders in the updated strategies. The stronger recommendations embodied by the sample are:

- use passwordless identity for app-to-app hops
- validate internal JWTs explicitly instead of trusting bearer presence
- keep private networking and APIM / AI gateway slices composable instead of always-on
- keep observability and identity wiring visible in both the infra and app layers

## What teams should still add for production

CAIRA is a starting point, not a finished production landing zone. Production deployments should add the controls that match the target environment, including:

- stricter network controls such as NSGs, WAFs, or hub-spoke connectivity
- customer-managed keys and expanded key-management processes when required
- environment-specific RBAC review and least-privilege assignments
- organization-specific monitoring, alerting, compliance, and incident response integrations
- explicit data protection, backup, and disaster recovery policies
- durable state stores, secret rotation processes, and production-grade data governance for any non-sample data
- tenant-specific conditional access, access reviews, and service principal lifecycle controls where required
- the tenant-scoped Entra permissions needed to create and govern service principals for internal API and agent audiences

## Limits of the sample

The repository still does **not** claim to be a turnkey production environment. Important limits remain:

- local sample mode can bypass auth with `SKIP_AUTH=true`
- some validation is environment-dependent; this session environment, for example, cannot run the C# runtime path because `dotnet` is unavailable
- the sample keeps certain legacy mode/tool identifiers for compatibility even while the user-facing domain shifts to sales/account-team language
- the sample does not provide a full landing zone, enterprise SOC process, or organization-specific compliance implementation
- Azure deployment samples prove the reference pattern, but they do not replace workload-specific threat modeling, pen testing, SRE runbooks, or DR exercises
- a sample Azure deployment can still fail even when subscription RBAC is correct if the deployment identity cannot complete the Entra service-principal or app-role-assignment steps; in that case, Terraform can fail with `403 Authorization_RequestDenied`, and any partially deployed app can later surface `AADSTS500011` for the missing audience principal

## Practical guidance

Use CAIRA to validate architecture choices quickly, then harden the resulting reference architecture and deployment strategy for the target workload.

As a working shorthand:

- **Local development** — use the sample to iterate quickly, optionally with explicit auth bypass
- **Local validation** — run the component and strategy checks that prove the wiring still works
- **Sample Azure deployment** — verify the reference design, managed identity flow, ingress, and platform composition
- **Real production** — add the organization-specific controls, processes, and approvals that CAIRA intentionally leaves to downstream teams

The repository structure is intended to make that progression straightforward without separating infrastructure concerns from the application and deployment concerns they support.

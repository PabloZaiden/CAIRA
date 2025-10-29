<!-- META
title: Contributing Considerations
description: Contributing considerations and best practices for CAIRA.
author: CAIRA Team
ms.date: 10/16/2025
ms.topic: guide
estimated_reading_time: 5
keywords:
    - development considerations
    - CAIRA
    - best practices
-->

# Contributing Considerations

When contributing please consider the following decisions, recommendations, and/or guidelines.

## AVM usage (Azure Verified Modules)

### What is our AVM adoption strategy?

Our strategy is incremental and selective:

- **Evaluate AVM maturity and alignment** with our architectural standards and security requirements.
- **Adopt AVMs for foundational resources** (e.g., storage accounts, networking) where they offer clear benefits in standardization and support.
- **Use AVM Pattern Modules** for well-architected solutions like Azure Landing Zones (ALZ) when they align with our enterprise architecture.
- **Monitor module evolution** and contribute feedback or enhancements to Microsoft’s AVM GitHub repositories.
- **Fallback to custom modules or AzAPI** when AVMs lack required features or flexibility.

### When do we not use an AVM

Key reasons for not utilizing an AVM include:

- **Immaturity and Limited Coverage**: AVM modules can lack support for advanced or niche Azure features.
- **Modularity Concerns**: Certain AVMs were tightly coupled or monolithic, making customization difficult for our specific use cases.
- **Governance and Control**: We preferred to maintain tighter control over our module design and lifecycle, especially for enterprise-scale deployments.

### AVM alternatives

We currently use a mix of:

- **Custom Terraform modules**: Built in-house to meet specific compliance, security, and architectural needs.
- **AzAPI provider**: Will always have the latest APIs available as it directly uses the ARM API.
- **AzureRM provider**: For stable, well-supported resources with minimal customization needs.

Decision Criteria include:

- **Feature completeness**: Does the module support all required resource properties?
- **Maintainability**: Can we easily update and extend the module?
- **Compliance and security**: Does it align with our standards and security posture?
- **Community and vendor support**: Is the module actively maintained and documented?

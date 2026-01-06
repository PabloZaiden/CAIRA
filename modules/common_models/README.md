<!-- META
title: Common Models Terraform Module
description: Provides a catalog of commonly used model deployment specifications as Terraform outputs.
author: CAIRA Team
ms.date: 08/14/2025
ms.topic: module
estimated_reading_time: 3
keywords:
  - terraform module
  - model catalogs
  - model deployments
  - azure ai foundry
-->

# Common Models Terraform Module

Provides a catalog of commonly used model deployment specifications as Terraform outputs. Intended to be consumed by other modules (e.g., `ai_foundry`) to supply the `model_deployments` input.

## Overview

This module does not create any resources. It exports a set of objects representing model deployments compatible with `azurerm_cognitive_deployment` in an Azure AI Foundry account.

Some consumers may support an optional `sku` block on each item with fields `name` and `capacity`. You can add or override `sku` at the call site if needed.

## Usage

```terraform
module "common_models" {
  source = "../../modules/common_models"
}

module "ai_foundry" {
  source = "../../modules/ai_foundry"

  # ... other required inputs ...

  model_deployments = [
    module.common_models.gpt_5,
    module.common_models.o3,
    module.common_models.text_embedding_3_large
  ]
}
```

To override SKU per deployment:

```terraform
model_deployments = [
  merge(module.common_models.gpt_5, { sku = { name = "GlobalStandard", capacity = 2 } }),
  module.common_models.text_embedding_3_large
]
```

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name      | Version        |
|-----------|----------------|
| terraform | >= 1.13, < 2.0 |

## Outputs

| Name                         | Description                                                           |
|------------------------------|-----------------------------------------------------------------------|
| gpt\_5                       | GPT-5 model - Latest flagship reasoning model                        |
| gpt\_5\_mini                 | GPT-5-mini model - Balanced performance and cost                     |
| gpt\_5\_nano                 | GPT-5-nano model - Lightweight high-throughput model                 |
| gpt\_5\_chat                 | GPT-5-chat model - Conversational AI with emotional intelligence     |
| gpt\_5\_1                    | GPT-5.1 model - Enhanced reasoning capabilities                      |
| gpt\_5\_1\_chat              | GPT-5.1-chat model - Built-in reasoning for chat                     |
| gpt\_5\_1\_codex             | GPT-5.1-codex model - Optimized for Codex CLI/VS Code                |
| gpt\_5\_1\_codex\_mini       | GPT-5.1-codex-mini model - Lightweight codex model                   |
| gpt\_5\_2                    | GPT-5.2 model - Latest flagship reasoning model                      |
| gpt\_5\_2\_chat              | GPT-5.2-chat model - Latest chat with advanced capabilities          |
| text\_embedding\_3\_small    | Text embedding 3 small model                                         |
| text\_embedding\_3\_large    | Text embedding 3 large model - Most capable embedding                |
| gpt\_realtime                | GPT-realtime model (GA) - Real-time audio processing                 |
| gpt\_realtime\_mini          | GPT-realtime-mini model - Lightweight real-time audio                |
| gpt\_audio                   | GPT-audio model (GA) - Audio generation                              |
| gpt\_audio\_mini             | GPT-audio-mini model - Lightweight audio generation                  |
| gpt\_4o\_mini\_transcribe    | GPT-4o-mini-transcribe model - Improved transcription                |
| gpt\_4o\_transcribe\_diarize | GPT-4o-transcribe-diarize model - Speech-to-text with diarization    |
<!-- END_TF_DOCS -->

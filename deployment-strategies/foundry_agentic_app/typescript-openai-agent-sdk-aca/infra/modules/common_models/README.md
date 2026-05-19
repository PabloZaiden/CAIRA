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

Provides a catalog of commonly used model deployment specifications as Terraform outputs. The Foundry reference architecture converts these outputs into the `ai_model_deployments` map expected by the Azure AI Foundry AVM.

## Overview

This module does not create any resources. It exports a set of objects representing model names, formats, and versions for an Azure AI Foundry account.

## Usage

```terraform
module "common_models" {
  source = "../../modules/common_models"
}

locals {
  model_deployments = {
    for model in [
      module.common_models.gpt_5_2_chat,
      module.common_models.gpt_5_nano,
      module.common_models.text_embedding_3_large
    ] : model.name => {
      name = model.name
      model = {
        format  = model.format
        name    = model.name
        version = model.version
      }
      scale = {
        type     = "GlobalStandard"
        capacity = 50
      }
    }
  }
}
```

Pass `local.model_deployments` to the Foundry AVM `ai_model_deployments` input.

To choose a different scale for a deployment, override the `scale` object at the call site:

```terraform
locals {
  model_deployments = {
    for model in [
    module.common_models.gpt_5_2_chat,
    module.common_models.text_embedding_3_large
    ] : model.name => {
      name  = model.name
      model = model
      scale = model.name == "gpt-5.2-chat" ? {
        type     = "GlobalStandard"
        capacity = 2
        } : {
        type     = "GlobalStandard"
        capacity = 50
      }
    }
  }
}
```

<!-- BEGIN_TF_DOCS -->

## Requirements

| Name | Version |

|------|---------|

| terraform | >= 1.13, < 2.0 |

## Outputs

| Name | Description |

|------|-------------|

| gpt\_4o\_mini | GPT-4o-mini model - Improved performance and cost efficiency for a wide range of tasks |

| gpt\_4o\_mini\_transcribe | GPT-4o-mini-transcribe model - Improved transcription accuracy and robustness |

| gpt\_4o\_transcribe\_diarize | GPT-4o-transcribe-diarize model - Speech-to-text with speaker diarization |

| gpt\_5 | GPT-5 model - Reasoning model with advanced capabilities |

| gpt\_5\_1 | GPT-5.1 model - Enhanced reasoning with configurable reasoning\_effort |

| gpt\_5\_1\_chat | GPT-5.1-chat model - Built-in reasoning capabilities for chat |

| gpt\_5\_1\_codex | GPT-5.1-codex model - Optimized for Codex CLI and VS Code extension |

| gpt\_5\_1\_codex\_mini | GPT-5.1-codex-mini model - Lightweight codex model |

| gpt\_5\_2 | GPT-5.2 model - Reasoning model |

| gpt\_5\_2\_chat | GPT-5.2-chat model - Chat model with advanced capabilities |

| gpt\_5\_chat | GPT-5-chat model - Optimized for conversational AI with emotional intelligence |

| gpt\_5\_mini | GPT-5-mini model - Balanced performance and cost efficiency |

| gpt\_5\_nano | GPT-5-nano model - Lightweight model for high-throughput scenarios |

| gpt\_audio | GPT-audio model (GA) - Audio generation capabilities |

| gpt\_audio\_mini | GPT-audio-mini model - Lightweight audio generation |

| gpt\_realtime | GPT-realtime model (GA) - Real-time audio processing |

| gpt\_realtime\_mini | GPT-realtime-mini model - Lightweight real-time audio processing |

| text\_embedding\_3\_large | Text embedding 3 large model - Most capable embedding model |

| text\_embedding\_3\_small | Text embedding 3 small model |

<!-- END_TF_DOCS -->

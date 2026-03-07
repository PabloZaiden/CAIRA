# Transparency Note for CAIRA (Composable AI Reference Architecture)

## What is a Transparency Note?

An AI system includes not only the technology, but also the people who will use it, the people who will be affected by it, and the environment in which it is deployed. Creating a system that is fit for its intended purpose requires an understanding of how the technology works, what its capabilities and limitations are, and how to achieve the best performance. Microsoft's Transparency Notes are intended to help you understand how our AI technology works, the choices system owners can make that influence system performance and behavior, and the importance of thinking about the whole system, including the technology, the people, and the environment. You can use Transparency Notes when developing or deploying your own system, or share them with the people who will use or be affected by your system.

Microsoft’s Transparency Notes are part of a broader effort at Microsoft to put our AI Principles into practice. To find out more, see the [Microsoft AI principles](https://www.microsoft.com/ai/responsible-ai).

## The basics of CAIRA (Composable AI Reference Architecture)

### Introduction

CAIRA (Composable AI Reference Architecture) provides a modular, composable baseline for building Azure AI solutions. It combines repository-based reference assets (macro reference architectures, application infrastructure, reusable components, and generated deployment strategies) with an installable CAIRA skill that helps coding agents inspect those assets and adapt them to a user's scenario. Outputs can include recommended designs, generated solution code and infrastructure, and provisioned resources in an Azure environment.

### Key terms

| Term                             | Definition                                                                                                                                                                                                                         |
|----------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **CAIRA**                        | Composable AI Reference Architecture. A repository of reference architectures, reusable infrastructure modules, application-layer assets, generated deployment strategies, and guidance for Azure AI solutions.                    |
| **Infrastructure as Code (IaC)** | The management of infrastructure (networks, virtual machines, load balancers, and connection topology) in a descriptive model, using the same versioning as source code. CAIRA uses Terraform for its infrastructure definitions.  |
| **Azure AI Foundry**             | A service that provides a comprehensive and collaborative environment for building, training, and deploying machine learning models and AI applications on Azure.                                                                  |
| **Reference Architecture (RA)**  | A deployable CAIRA macro design under `infra/` (for example `infra/foundry_agentic_app/`) that combines Azure AI platform infrastructure with the baseline application-hosting infrastructure for supported Azure AI environments. |
| **CAIRA skill**                  | An installable skill for coding agents that inspects CAIRA's repository assets at runtime and uses them as reference material for architecture selection, solution generation, and troubleshooting guidance.                       |

## Capabilities

### System behavior

CAIRA's core functionality is providing pre-built, tested, and modular reference assets for Azure AI solutions. It simplifies the process of selecting, adapting, and deploying Azure AI environments by combining macro reference architectures, reusable modules, application components, generated deployment strategies, and skill-guided discovery. The deployment behavior is deterministic based on the selected assets and user-provided configuration.

The installable CAIRA skill enhances the user experience. The skill draws from the repository's documentation and best practices to provide step-by-step guidance, explain architectural choices based on the Azure Well-Architected Framework, and help troubleshoot deployment issues. This is not a general-purpose end-user chatbot; its purpose is scoped to helping builders discover, adapt, deploy, and maintain CAIRA-inspired solutions.

### Use cases

#### Intended uses

CAIRA can be used in multiple scenarios. The system's intended uses include:

* **Experimentation:** A development team can use the CAIRA skill plus the repository assets to choose and adapt a lightweight Azure AI starting point for proofs of concept and testing.
* **Enterprise Starting Point:** A team can use CAIRA's reference architectures and deployment strategies as a secure, compliant, and robust starting point for building a production-grade AI platform that they customize to their specific enterprise requirements.

#### Considerations when choosing other use cases

We encourage teams to leverage CAIRA in their innovative solutions. However, here are some considerations when choosing a use case:

* **Architecture Choice:** The reference architectures and generated deployment strategies are designed for different purposes. Users should select the combination that matches their security, networking, application, and compliance needs.
* **Customization:** While CAIRA is extensible, significant deviations from the tested patterns may introduce risks. Users are responsible for validating the security and reliability of their customizations.

##### Unsupported uses

* **Running as a Live AI System:** CAIRA is a reference repository plus a builder-oriented skill. The CAIRA skill is for development guidance and solution generation; it does not constitute a persistent, interactive AI system for end-users.

Legal and regulatory considerations. Organizations need to evaluate potential specific legal and regulatory obligations when using any AI services and solutions, which may not be appropriate for use in every industry or scenario. Restrictions may vary based on regional or local regulatory requirements. Additionally, AI services or solutions are not designed for and may not be used in ways prohibited in applicable terms of service and relevant codes of conduct.

## Limitations

### Technical limitations, operational factors and ranges

* **Reference Assets, Not a Managed Service:** CAIRA is a set of open-source reference assets plus an installable skill, not a managed service. The user is responsible for reviewing generated outputs and managing the deployed infrastructure's lifecycle, including monitoring, updates, and decommissioning.
* **Technology Readiness:** The system incorporates proven patterns from real-world systems. However, as an accelerator, it is considered the "first time the whole system will be validated" in each unique system.
* **Human in the Loop:** The system is not fully autonomous. A person is required to make decisions, review the CAIRA-informed design, run the deployment commands (`plan`, `apply`, or equivalent), and approve the final deployment.
* **Deployment Environment:** The IaC templates are designed for simple deployment environments where inputs are controlled. While the resulting infrastructure can be complex, the deployment process itself is managed within a controlled developer environment. Unexpected issues during deployment require human intervention.
* **Potential for Insecure Configurations:** If a user keeps an experimentation-oriented public environment running for extended periods, it could pose a security risk. Such environments should be reviewed, hardened, or decommissioned as appropriate.

## System performance

For CAIRA, "performance" refers to the reliability, security, and correctness of the deployed Azure infrastructure and applications, as well as the accuracy and helpfulness of the CAIRA skill's guidance. The repository assets are built on best practices from enterprise work to ensure high-quality deployments.

The CAIRA skill's performance is measured by its ability to correctly interpret user intent and provide relevant, accurate guidance based on the repository's documentation and assets. Errors in the skill's guidance might include suggesting an inappropriate architecture or failing to find a solution for a troubleshooting query.

### Best practices for improving system performance

* **Select the Right Architecture and Strategy:** For enterprise or production use, start with the CAIRA reference architecture and deployment strategy that best match your security, networking, observability, and application requirements.
* **Review Terraform Plans:** Before applying any changes, carefully review the output of the `terraform plan` command to understand what resources will be created, modified, or destroyed.
* **Provide Clear Prompts:** When interacting with the CAIRA skill, provide clear and specific prompts related to your goals (for example, "Help me choose an architecture for a production environment with private networking" instead of "How do I start?").
* **Keep Environments Tidy:** Decommission experimentation environments once they are no longer needed to avoid security risks and unnecessary costs.

## Evaluation of CAIRA (Composable AI Reference Architecture)

### Evaluation methods

CAIRA's reference architectures, reusable modules, strategy-builder assets, and generated deployment strategies are evaluated based on patterns and best practices developed in real-world enterprise work. The system is validated through test deployments for each defined intended use case. The evaluation focuses on ensuring the deployed infrastructure and applications are secure, reliable, observable, and aligned with the principles of the Azure Well-Architected Framework.

### Evaluation results

The evaluation has led to the creation of distinct reference architectures that are fit for their purpose.

* CAIRA reference assets support lightweight experimentation scenarios as well as more controlled enterprise starting points.
* The results of ongoing evaluation and real-world use influence decisions about the system's design, such as default security configurations, networking rules, module parameters, and deployment-strategy coverage.

#### Fairness considerations

Since CAIRA is a reference repository plus a builder-oriented skill, and not an AI system that makes decisions or predictions about people, fairness harms related to allocation, quality of service, or stereotyping are not directly applicable in the same way they would be for a user-facing AI model. The primary consideration is ensuring that the guidance and documentation are clear and accessible to all users, regardless of their background or level of expertise with IaC or Azure. The CAIRA skill is designed to democratize access to complex cloud architecture knowledge.

## Evaluating and integrating CAIRA for your use

When integrating CAIRA into your workflow, it is a best practice to start by using the CAIRA skill to identify the right reference architecture and deployment strategy for your scenario, then deploy that approach in a non-production environment. Test your application and workflows there before promoting the configuration to production.

Ensure appropriate human oversight for your system. The person responsible for the deployment should understand the intended use of the chosen architecture, know how to interpret the `terraform plan` output, and be prepared to intervene if the deployment fails. For example, if a deployment fails due to a transient Azure API issue, the operator should know how to safely re-run the `terraform apply` command. Over-relying on the automation without understanding the underlying resources can lead to misconfigurations.

## Learn more about responsible AI

[Microsoft AI principles](https://www.microsoft.com/ai/responsible-ai)

[Microsoft responsible AI resources](https://www.microsoft.com/ai/responsible-ai-resources)

[Microsoft Azure Learning courses on responsible AI](https://learn.microsoft.com/ai)

## Learn more about CAIRA (Composable AI Reference Architecture)

* **GitHub Repository:** [https://github.com/microsoft/CAIRA](https://github.com/microsoft/CAIRA)
* **CAIRA Documentation:** [https://microsoft.github.io/CAIRA/](https://microsoft.github.io/CAIRA/)
* **CAIRA Skill Source:** `skills/caira/SKILL.md` in the repository

## Contact us

Give us feedback on this document by filing an issue in the [CAIRA GitHub repository](https://github.com/microsoft/CAIRA/issues).

## About this document

© 2025 Microsoft Corporation. All rights reserved. This document is provided "as-is" and for informational purposes only. Information and views expressed in this document, including URL and other Internet Web site references, may change without notice. You bear the risk of using it. Some examples are for illustration only and are fictitious. No real association is intended or inferred.

This document is not intended to be, and should not be construed as providing, legal advice. The jurisdiction in which you’re operating may have various regulatory or legal requirements that apply to your AI system. Consult a legal specialist if you are uncertain about laws or regulations that might apply to your system, especially if you think those might impact these recommendations. Be aware that not all of these recommendations and resources will be appropriate for every scenario, and conversely, these recommendations and resources may be insufficient for some scenarios.

Published: 10/09/2025

Last updated: 10/09/2025

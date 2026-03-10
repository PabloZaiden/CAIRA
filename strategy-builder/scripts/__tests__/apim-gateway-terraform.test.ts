/** @vitest-environment node */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('APIM gateway terraform', () => {
  it('configures an OpenAI-compatible proxy API for SDK callers', async () => {
    const terraformPath = fileURLToPath(
      new URL('../../components/iac/azure-container-apps/dependant_resources.tf', import.meta.url)
    );
    const content = await readFile(terraformPath, 'utf-8');

    expect(content).toContain(
      'apim_openai_backend_url  = "https://${module.foundry.ai_foundry_name}.openai.azure.com/openai"'
    );
    expect(content).toContain('subscription_required = false');
    expect(content).toContain('resource "azurerm_api_management_api_operation" "foundry_proxy_post" {');
    expect(content).toContain('resource "azurerm_api_management_api_operation" "foundry_proxy_get" {');
    expect(content).toContain('resource "azurerm_api_management_api_operation" "foundry_proxy_delete" {');
    expect(content).toContain('url_template        = "/*"');
    expect(content).toContain('resource "azurerm_api_management_api_policy" "foundry_openai" {');
    expect(content).toContain('azurerm_api_management_backend.foundry_openai');
  });
});

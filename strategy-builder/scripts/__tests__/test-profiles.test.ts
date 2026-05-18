import { describe, expect, it } from 'vitest';
import {
  computePrivateSubnetPlan,
  derivePrivateTestOverlayNames,
  deriveProfileProjectName,
  deriveProfileWorkspace,
  parseDeployedTestProfiles,
  resolvePrivateSubnetPlan,
  selectJumpboxVmSize
} from '../lib/test-profiles.ts';

describe('test profile helpers', () => {
  it('parses all deployed profiles by default', () => {
    expect(parseDeployedTestProfiles([])).toEqual(['public', 'private', 'private-capability-host']);
  });

  it('parses comma-separated profiles and removes duplicates', () => {
    expect(parseDeployedTestProfiles(['public,private', 'private-capability-host', 'private'])).toEqual([
      'public',
      'private',
      'private-capability-host'
    ]);
  });

  it('rejects unknown deployed profiles', () => {
    expect(() => parseDeployedTestProfiles(['unknown'])).toThrow(/Unknown test profile/);
  });

  it('derives deterministic workspace and project names', () => {
    expect(deriveProfileProjectName('TypeScript Foundry Agent Service ACA', 'private')).toBe(
      'typescript-foundry-agent-service-aca-private'
    );
    expect(deriveProfileWorkspace('TypeScript Foundry Agent Service ACA', 'private-capability-host')).toBe(
      'test-typescript-foundry-agent-service-aca-private-capability-host'
    );
    expect(derivePrivateTestOverlayNames('typescript-foundry-agent-service-aca-private', 'private')).toEqual({
      testingSuffix: '46b16d0d',
      containerAppsSubnetName: 'aca-typescript-foundry-agent-service-aca-private-46b16d0d',
      jumpboxSubnetName: 'jumpbox-typescript-foundry-agent-service-aca-private-46b16d0d',
      agentsSubnetName: 'agents-typescript-foundry-agent-service-aca-private-46b16d0d'
    });
  });

  it('allocates deterministic private subnet plans per strategy', () => {
    const strategyNames = [
      'csharp-microsoft-agent-framework-aca',
      'typescript-foundry-agent-service-aca',
      'typescript-openai-agent-sdk-aca'
    ];

    const foundryPlan = computePrivateSubnetPlan(
      '172.16.0.0/16',
      'typescript-foundry-agent-service-aca',
      strategyNames
    );
    const openaiPlan = computePrivateSubnetPlan('172.16.0.0/16', 'typescript-openai-agent-sdk-aca', strategyNames);

    expect(foundryPlan.strategyIndex).toBe(1);
    expect(foundryPlan.slotIndex).toBe(2);
    expect(foundryPlan.slotCidr).toBe('172.16.8.0/22');
    expect(foundryPlan.containerAppsSubnetCidr).toBe('172.16.8.0/23');
    expect(foundryPlan.jumpboxSubnetCidr).toBe('172.16.10.0/24');
    expect(foundryPlan.agentsSubnetCidr).toBe('172.16.11.0/24');

    expect(openaiPlan.strategyIndex).toBe(2);
    expect(openaiPlan.slotIndex).toBe(3);
    expect(openaiPlan.slotCidr).toBe('172.16.12.0/22');
    expect(openaiPlan.containerAppsSubnetCidr).toBe('172.16.12.0/23');
    expect(openaiPlan.jumpboxSubnetCidr).toBe('172.16.14.0/24');
    expect(openaiPlan.agentsSubnetCidr).toBe('172.16.15.0/24');
  });

  it('probes for the next free private slot when the preferred slot is already occupied', () => {
    const strategyNames = [
      'csharp-microsoft-agent-framework-aca',
      'typescript-foundry-agent-service-aca',
      'typescript-openai-agent-sdk-aca'
    ];
    const overlayNames = derivePrivateTestOverlayNames('tsfas-aca-cap2', 'private-capability-host');

    const plan = resolvePrivateSubnetPlan(
      '172.16.0.0/16',
      'typescript-foundry-agent-service-aca',
      overlayNames,
      [
        {
          name: 'aca-typescript-foundry-agent-service-aca-private-capability-host-0c9ccb5f',
          cidr: '172.16.8.0/23'
        },
        {
          name: 'jumpbox-typescript-foundry-agent-service-aca-private-capability-host-0c9ccb5f',
          cidr: '172.16.10.0/24'
        },
        {
          name: 'agents-typescript-foundry-agent-service-aca-private-capability-host-0c9ccb5f',
          cidr: '172.16.11.0/24'
        }
      ],
      strategyNames
    );

    expect(plan.slotIndex).toBe(3);
    expect(plan.slotCidr).toBe('172.16.12.0/22');
    expect(plan.containerAppsSubnetCidr).toBe('172.16.12.0/23');
    expect(plan.jumpboxSubnetCidr).toBe('172.16.14.0/24');
    expect(plan.agentsSubnetCidr).toBe('172.16.15.0/24');
  });

  it('reuses the current slot when the expected overlay subnets already exist', () => {
    const strategyNames = [
      'csharp-microsoft-agent-framework-aca',
      'typescript-foundry-agent-service-aca',
      'typescript-openai-agent-sdk-aca'
    ];
    const overlayNames = derivePrivateTestOverlayNames('tsfas-aca-cap2', 'private-capability-host');

    const plan = resolvePrivateSubnetPlan(
      '172.16.0.0/16',
      'typescript-foundry-agent-service-aca',
      overlayNames,
      [
        {
          name: overlayNames.containerAppsSubnetName,
          cidr: '172.16.12.0/23'
        },
        {
          name: overlayNames.jumpboxSubnetName,
          cidr: '172.16.14.0/24'
        }
      ],
      strategyNames
    );

    expect(plan.slotIndex).toBe(3);
    expect(plan.slotCidr).toBe('172.16.12.0/22');
  });

  it('falls back to the first unrestricted jumpbox VM size', () => {
    expect(
      selectJumpboxVmSize(
        ['Standard_B2s', 'Standard_D2as_v5', 'Standard_D2s_v3'],
        [
          { name: 'Standard_B2s', restrictions: [{ reasonCode: 'NotAvailableForSubscription' }] },
          { name: 'Standard_D2s_v3', restrictions: [] },
          { name: 'Standard_D2as_v5', restrictions: [] }
        ]
      )
    ).toBe('Standard_D2as_v5');
  });
});

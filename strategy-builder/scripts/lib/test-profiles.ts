import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { promisify } from 'node:util';
import { DEPLOYMENT_STRATEGIES_ROOT, listGeneratedStrategyDirs } from './paths.ts';

const execFileAsync = promisify(execFile);

export const DEPLOYED_TEST_PROFILES = ['public', 'private', 'private-capability-host'] as const;

export type DeployedTestProfile = (typeof DEPLOYED_TEST_PROFILES)[number];

export interface PrivateSubnetPlan {
  readonly slotCidr: string;
  readonly containerAppsSubnetCidr: string;
  readonly jumpboxSubnetCidr: string;
  readonly agentsSubnetCidr: string;
  readonly slotIndex: number;
  readonly strategyIndex: number;
}

export interface PrivateTestOverlayNames {
  readonly testingSuffix: string;
  readonly containerAppsSubnetName: string;
  readonly jumpboxSubnetName: string;
  readonly agentsSubnetName: string;
}

export interface BuildTestProfileTerraformVarsOptions {
  readonly profile: DeployedTestProfile;
  readonly strategyName: string;
  readonly projectName?: string | undefined;
  readonly location: string;
  readonly resolveJumpboxVmSize?: boolean | undefined;
  readonly includeJumpbox?: boolean | undefined;
  readonly jumpboxAllowedCidr?: string | undefined;
  readonly jumpboxSshPublicKey?: string | undefined;
  readonly strategiesRoot?: string | undefined;
}

const DEPLOYED_TEST_PROFILE_SET = new Set<string>(DEPLOYED_TEST_PROFILES);
const DEFAULT_JUMPBOX_VM_SIZE_CANDIDATES = ['Standard_B2s', 'Standard_D2as_v5', 'Standard_D2s_v3'] as const;
const jumpboxVmSizeCache = new Map<string, string>();

interface AzureVmSku {
  readonly name?: string | undefined;
  readonly restrictions?: readonly unknown[] | undefined;
}

interface AzureVnetSubnetRecord {
  readonly name?: string | undefined;
  readonly addressPrefix?: string | undefined;
  readonly addressPrefixes?: readonly string[] | undefined;
}

interface ExistingVnetSubnet {
  readonly name: string;
  readonly cidr: string;
}

function normalizeStrategyName(input: string): string {
  return basename(resolve(input));
}

function normalizeLabel(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized.length > 0 ? normalized : 'strategy';
}

function parseIpv4Cidr(cidr: string): { address: string; prefix: number } {
  const [address, prefixText] = cidr.split('/');
  const prefix = Number(prefixText);
  if (!address || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    throw new Error(`Invalid IPv4 CIDR: ${cidr}`);
  }
  const octets = address.split('.');
  if (octets.length !== 4 || octets.some((octet) => !/^\d+$/.test(octet) || Number(octet) < 0 || Number(octet) > 255)) {
    throw new Error(`Invalid IPv4 CIDR: ${cidr}`);
  }
  return { address, prefix };
}

function ipv4ToInt(address: string): number {
  const octets = address.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    throw new Error(`Invalid IPv4 address: ${address}`);
  }
  const first = octets[0];
  const second = octets[1];
  const third = octets[2];
  const fourth = octets[3];
  if (first === undefined || second === undefined || third === undefined || fourth === undefined) {
    throw new Error(`Invalid IPv4 address: ${address}`);
  }
  return first * 256 ** 3 + second * 256 ** 2 + third * 256 + fourth;
}

function intToIpv4(value: number): string {
  const normalized = Math.trunc(value);
  return [
    Math.floor(normalized / 256 ** 3) % 256,
    Math.floor(normalized / 256 ** 2) % 256,
    Math.floor(normalized / 256) % 256,
    normalized % 256
  ].join('.');
}

function cidrSubnet(cidr: string, newBits: number, netNum: number): string {
  const { address, prefix } = parseIpv4Cidr(cidr);
  if (!Number.isInteger(newBits) || newBits < 0) {
    throw new Error(`Invalid newBits value: ${String(newBits)}`);
  }
  const nextPrefix = prefix + newBits;
  if (nextPrefix > 32) {
    throw new Error(`Cannot carve /${String(nextPrefix)} out of ${cidr}`);
  }
  const totalSubnets = 2 ** newBits;
  if (!Number.isInteger(netNum) || netNum < 0 || netNum >= totalSubnets) {
    throw new Error(`Subnet index ${String(netNum)} is out of range for ${cidr}`);
  }
  const baseSize = 2 ** (32 - prefix);
  const subnetSize = 2 ** (32 - nextPrefix);
  const baseInt = Math.floor(ipv4ToInt(address) / baseSize) * baseSize;
  return `${intToIpv4(baseInt + subnetSize * netNum)}/${String(nextPrefix)}`;
}

function getPrivateTestingSlotMetadata(vnetCidr: string): {
  readonly prefix: number;
  readonly slotPrefix: number;
  readonly reservedSlots: number;
  readonly totalSlots: number;
  readonly usableSlots: number;
} {
  const { prefix } = parseIpv4Cidr(vnetCidr);
  const slotPrefix = 22;
  if (prefix > slotPrefix) {
    throw new Error(`VNet address space ${vnetCidr} is too small to carve dedicated /22 testing slots`);
  }

  const reservedSlots = 1;
  const totalSlots = 2 ** (slotPrefix - prefix);
  const usableSlots = totalSlots - reservedSlots;
  if (usableSlots <= 0) {
    throw new Error(`VNet address space ${vnetCidr} does not have any usable /22 testing slots`);
  }

  return {
    prefix,
    slotPrefix,
    reservedSlots,
    totalSlots,
    usableSlots
  };
}

function buildPrivateSubnetPlan(vnetCidr: string, slotIndex: number, strategyIndex: number): PrivateSubnetPlan {
  const { prefix, reservedSlots, slotPrefix, totalSlots } = getPrivateTestingSlotMetadata(vnetCidr);
  if (!Number.isInteger(slotIndex) || slotIndex < reservedSlots || slotIndex >= totalSlots) {
    throw new Error(`Testing slot index ${String(slotIndex)} is out of range for ${vnetCidr}`);
  }

  const slotCidr = cidrSubnet(vnetCidr, slotPrefix - prefix, slotIndex);
  return {
    slotCidr,
    slotIndex,
    strategyIndex,
    containerAppsSubnetCidr: cidrSubnet(slotCidr, 1, 0),
    jumpboxSubnetCidr: cidrSubnet(slotCidr, 2, 2),
    agentsSubnetCidr: cidrSubnet(slotCidr, 2, 3)
  };
}

function computeStrategyIndex(strategyNameInput: string, strategyNames: readonly string[]): number {
  const strategyName = normalizeStrategyName(strategyNameInput);
  const strategyIndex = strategyNames.findIndex((name) => name === strategyName);
  if (strategyIndex < 0) {
    throw new Error(`Could not find deployment strategy "${strategyName}" in ${strategyNames.length} known strategies`);
  }
  return strategyIndex;
}

function findSubnetSlotIndex(vnetCidr: string, subnetCidr: string): number | undefined {
  const { address: vnetAddress, prefix: vnetPrefix } = parseIpv4Cidr(vnetCidr);
  const { address: subnetAddress, prefix: subnetPrefix } = parseIpv4Cidr(subnetCidr);
  const { slotPrefix, totalSlots } = getPrivateTestingSlotMetadata(vnetCidr);
  if (subnetPrefix < slotPrefix) {
    return undefined;
  }

  const vnetSize = 2 ** (32 - vnetPrefix);
  const subnetSize = 2 ** (32 - subnetPrefix);
  const vnetBase = Math.floor(ipv4ToInt(vnetAddress) / vnetSize) * vnetSize;
  const subnetBase = Math.floor(ipv4ToInt(subnetAddress) / subnetSize) * subnetSize;
  if (subnetBase < vnetBase || subnetBase + subnetSize > vnetBase + vnetSize) {
    return undefined;
  }

  const slotSize = 2 ** (32 - slotPrefix);
  const slotIndex = Math.floor((subnetBase - vnetBase) / slotSize);
  if (slotIndex < 0 || slotIndex >= totalSlots) {
    return undefined;
  }

  const slotBase = vnetBase + slotIndex * slotSize;
  if (subnetBase < slotBase || subnetBase + subnetSize > slotBase + slotSize) {
    return undefined;
  }

  return slotIndex;
}

async function getVnetAddressPrefix(resourceGroupName: string, vnetName: string): Promise<string> {
  const result = await execFileAsync(
    'az',
    [
      'network',
      'vnet',
      'show',
      '--resource-group',
      resourceGroupName,
      '--name',
      vnetName,
      '--query',
      'addressSpace.addressPrefixes[0]',
      '-o',
      'tsv'
    ],
    {
      timeout: 30_000,
      maxBuffer: 1024 * 1024
    }
  );
  const prefix = result.stdout.trim();
  if (!prefix) {
    throw new Error(
      `Could not determine the address space for VNet ${vnetName} in resource group ${resourceGroupName}`
    );
  }
  parseIpv4Cidr(prefix);
  return prefix;
}

async function listVnetSubnets(resourceGroupName: string, vnetName: string): Promise<readonly ExistingVnetSubnet[]> {
  const result = await execFileAsync(
    'az',
    ['network', 'vnet', 'subnet', 'list', '--resource-group', resourceGroupName, '--vnet-name', vnetName, '-o', 'json'],
    {
      timeout: 30_000,
      maxBuffer: 1024 * 1024
    }
  );
  const records = JSON.parse(result.stdout) as AzureVnetSubnetRecord[];
  return records.flatMap((record) => {
    const name = record.name?.trim();
    const cidr = record.addressPrefix?.trim() || record.addressPrefixes?.[0]?.trim();
    if (!name || !cidr) {
      return [];
    }
    parseIpv4Cidr(cidr);
    return [{ name, cidr }];
  });
}

function requireEnvVar(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readJumpboxVmSizeOverride(): string | undefined {
  const override =
    process.env['CAIRA_TEST_JUMPBOX_VM_SIZE']?.trim() || process.env['TF_VAR_testing_jumpbox_vm_size']?.trim();
  return override && override.length > 0 ? override : undefined;
}

export function isDeployedTestProfile(value: string): value is DeployedTestProfile {
  return DEPLOYED_TEST_PROFILE_SET.has(value);
}

export function usesPrivateNetworking(profile: DeployedTestProfile): boolean {
  return profile !== 'public';
}

export function usesCapabilityHost(profile: DeployedTestProfile): boolean {
  return profile === 'private-capability-host';
}

export function requiresJumpbox(profile: DeployedTestProfile): boolean {
  return usesPrivateNetworking(profile);
}

export function parseDeployedTestProfiles(rawValues: readonly string[]): DeployedTestProfile[] {
  if (rawValues.length === 0) {
    return [...DEPLOYED_TEST_PROFILES];
  }

  const parsed: DeployedTestProfile[] = [];
  const seen = new Set<DeployedTestProfile>();

  for (const rawValue of rawValues) {
    for (const token of rawValue
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)) {
      if (!isDeployedTestProfile(token)) {
        throw new Error(`Unknown test profile "${token}". Expected one of: ${DEPLOYED_TEST_PROFILES.join(', ')}`);
      }
      if (!seen.has(token)) {
        seen.add(token);
        parsed.push(token);
      }
    }
  }

  return parsed.length > 0 ? parsed : [...DEPLOYED_TEST_PROFILES];
}

export function listStrategyNames(strategiesRoot = DEPLOYMENT_STRATEGIES_ROOT): string[] {
  if (!existsSync(strategiesRoot)) {
    throw new Error(`Deployment strategies directory not found: ${strategiesRoot}`);
  }

  return listGeneratedStrategyDirs(strategiesRoot)
    .map((dir) => basename(dir))
    .sort();
}

export function computePrivateSubnetPlan(
  vnetCidr: string,
  strategyNameInput: string,
  strategyNames = listStrategyNames()
): PrivateSubnetPlan {
  const strategyIndex = computeStrategyIndex(strategyNameInput, strategyNames);
  const { reservedSlots, usableSlots } = getPrivateTestingSlotMetadata(vnetCidr);
  const slotIndex = strategyIndex + reservedSlots;
  if (strategyIndex >= usableSlots) {
    throw new Error(`VNet ${vnetCidr} does not have enough /22 slots for strategy index ${String(strategyIndex)}`);
  }
  return buildPrivateSubnetPlan(vnetCidr, slotIndex, strategyIndex);
}

function expectedOverlaySubnetNames(overlayNames: PrivateTestOverlayNames): readonly string[] {
  return [overlayNames.containerAppsSubnetName, overlayNames.jumpboxSubnetName, overlayNames.agentsSubnetName] as const;
}

export function resolvePrivateSubnetPlan(
  vnetCidr: string,
  strategyNameInput: string,
  overlayNames: PrivateTestOverlayNames,
  existingSubnets: readonly { name: string; cidr: string }[],
  strategyNames = listStrategyNames()
): PrivateSubnetPlan {
  const strategyIndex = computeStrategyIndex(strategyNameInput, strategyNames);
  const matchingSlots = expectedOverlaySubnetNames(overlayNames)
    .map((name) => existingSubnets.find((subnet) => subnet.name === name))
    .filter((subnet): subnet is { name: string; cidr: string } => subnet != null)
    .map((subnet) => {
      const slotIndex = findSubnetSlotIndex(vnetCidr, subnet.cidr);
      if (slotIndex == null) {
        throw new Error(`Existing subnet ${subnet.name} (${subnet.cidr}) falls outside the private testing slot range`);
      }
      return slotIndex;
    });

  const uniqueMatchingSlots = [...new Set(matchingSlots)];
  if (uniqueMatchingSlots.length > 1) {
    throw new Error(
      `Existing subnets for ${overlayNames.containerAppsSubnetName} are split across multiple testing slots: ${uniqueMatchingSlots.join(', ')}`
    );
  }
  if (uniqueMatchingSlots.length === 1) {
    const existingSlotIndex = uniqueMatchingSlots[0];
    if (existingSlotIndex != null) {
      return buildPrivateSubnetPlan(vnetCidr, existingSlotIndex, strategyIndex);
    }
  }

  const preferredPlan = computePrivateSubnetPlan(vnetCidr, strategyNameInput, strategyNames);
  const occupiedSlots = new Set(
    existingSubnets
      .map((subnet) => findSubnetSlotIndex(vnetCidr, subnet.cidr))
      .filter((slotIndex): slotIndex is number => slotIndex != null)
  );
  if (!occupiedSlots.has(preferredPlan.slotIndex)) {
    return preferredPlan;
  }

  const { reservedSlots, usableSlots } = getPrivateTestingSlotMetadata(vnetCidr);
  for (let offset = 1; offset < usableSlots; offset += 1) {
    const candidateSlotIndex = reservedSlots + ((preferredPlan.slotIndex - reservedSlots + offset) % usableSlots);
    if (!occupiedSlots.has(candidateSlotIndex)) {
      return buildPrivateSubnetPlan(vnetCidr, candidateSlotIndex, strategyIndex);
    }
  }

  throw new Error(
    `VNet ${vnetCidr} does not have an available /22 testing slot for ${normalizeStrategyName(strategyNameInput)}`
  );
}

export function deriveProfileProjectName(baseName: string, profile: DeployedTestProfile): string {
  return `${normalizeLabel(baseName)}-${normalizeLabel(profile)}`;
}

export function deriveProfileWorkspace(baseName: string, profile: DeployedTestProfile): string {
  const prefix = normalizeLabel(baseName);
  const suffix = normalizeLabel(profile);
  const workspace = `test-${prefix}-${suffix}`;
  return workspace.length <= 90 ? workspace : workspace.slice(0, 90);
}

export function derivePrivateTestOverlayNames(
  projectName: string,
  profile: DeployedTestProfile
): PrivateTestOverlayNames {
  const baseName = normalizeLabel(projectName);
  const testingSuffix = createHash('sha1').update(`${baseName}-${profile}`).digest('hex').slice(0, 8);

  return {
    testingSuffix,
    containerAppsSubnetName: `aca-${baseName}-${testingSuffix}`.slice(0, 80),
    jumpboxSubnetName: `jumpbox-${baseName}-${testingSuffix}`.slice(0, 80),
    agentsSubnetName: `agents-${baseName}-${testingSuffix}`.slice(0, 80)
  };
}

export function selectJumpboxVmSize(
  candidates: readonly string[],
  skuResults: readonly AzureVmSku[]
): string | undefined {
  const unrestricted = new Set(
    skuResults
      .filter((sku) => typeof sku.name === 'string' && sku.name.length > 0)
      .filter((sku) => (sku.restrictions?.length ?? 0) === 0)
      .map((sku) => sku.name as string)
  );

  return candidates.find((candidate) => unrestricted.has(candidate));
}

async function resolveJumpboxVmSize(location: string): Promise<string> {
  const override = readJumpboxVmSizeOverride();
  if (override) {
    return override;
  }

  const cacheKey = location.trim().toLowerCase();
  const cached = jumpboxVmSizeCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const candidateNames = [...DEFAULT_JUMPBOX_VM_SIZE_CANDIDATES];
  const query = `[?${candidateNames.map((name) => `name=='${name}'`).join(' || ')}].{name:name,restrictions:restrictions}`;
  let result: Awaited<ReturnType<typeof execFileAsync>>;
  try {
    result = await execFileAsync(
      'az',
      ['vm', 'list-skus', '--location', location, '--resource-type', 'virtualMachines', '--query', query, '-o', 'json'],
      {
        timeout: 120_000,
        maxBuffer: 1024 * 1024
      }
    );
  } catch (error) {
    const detail =
      error instanceof Error && 'stderr' in error && typeof error.stderr === 'string' && error.stderr.trim().length > 0
        ? error.stderr.trim()
        : error instanceof Error
          ? error.message
          : String(error);
    throw new Error(`Failed to query jumpbox VM SKUs in ${location}: ${detail}`);
  }
  const skuResults = JSON.parse(result.stdout.toString()) as AzureVmSku[];
  const selected = selectJumpboxVmSize(candidateNames, skuResults);
  if (!selected) {
    throw new Error(
      `No supported jumpbox VM SKU is currently available in ${location}. Tried: ${candidateNames.join(', ')}. ` +
        'Set CAIRA_TEST_JUMPBOX_VM_SIZE to override the selection if needed.'
    );
  }
  jumpboxVmSizeCache.set(cacheKey, selected);
  return selected;
}

export async function buildTestProfileTerraformVars(
  options: BuildTestProfileTerraformVarsOptions
): Promise<Record<string, unknown>> {
  const baseVars: Record<string, unknown> = {
    testing_profile: options.profile
  };

  if (!usesPrivateNetworking(options.profile)) {
    return baseVars;
  }

  const privatePoolResourceGroupName = usesCapabilityHost(options.profile)
    ? requireEnvVar('TF_VAR_private_foundry_capability_hosts_pool_resource_group_name')
    : requireEnvVar('TF_VAR_private_foundry_pool_resource_group_name');
  const privatePoolVnetName = usesCapabilityHost(options.profile)
    ? requireEnvVar('TF_VAR_private_foundry_capability_hosts_pool_vnet_name')
    : requireEnvVar('TF_VAR_private_foundry_pool_vnet_name');
  const privatePoolAddressSpace = await getVnetAddressPrefix(privatePoolResourceGroupName, privatePoolVnetName);
  const projectName = options.projectName?.trim() || deriveProfileProjectName(options.strategyName, options.profile);
  const overlayNames = derivePrivateTestOverlayNames(projectName, options.profile);
  const existingSubnets = await listVnetSubnets(privatePoolResourceGroupName, privatePoolVnetName);
  const subnetPlan = resolvePrivateSubnetPlan(
    privatePoolAddressSpace,
    options.strategyName,
    overlayNames,
    existingSubnets,
    listStrategyNames(options.strategiesRoot)
  );

  baseVars['testing_private_pool_resource_group_name'] = privatePoolResourceGroupName;
  baseVars['testing_private_pool_vnet_name'] = privatePoolVnetName;
  baseVars['testing_private_container_apps_subnet_cidr'] = subnetPlan.containerAppsSubnetCidr;

  if (options.includeJumpbox !== false) {
    const hasJumpboxCidr =
      typeof options.jumpboxAllowedCidr === 'string' && options.jumpboxAllowedCidr.trim().length > 0;
    const hasJumpboxKey =
      typeof options.jumpboxSshPublicKey === 'string' && options.jumpboxSshPublicKey.trim().length > 0;
    if (hasJumpboxCidr !== hasJumpboxKey) {
      throw new Error('Jumpbox testing requires both a caller CIDR and an SSH public key');
    }

    if (hasJumpboxCidr && hasJumpboxKey) {
      baseVars['testing_jumpbox_allowed_cidr'] = options.jumpboxAllowedCidr?.trim();
      baseVars['testing_jumpbox_ssh_public_key'] = options.jumpboxSshPublicKey?.trim();
      baseVars['testing_private_jumpbox_subnet_cidr'] = subnetPlan.jumpboxSubnetCidr;
      if (options.resolveJumpboxVmSize !== false) {
        baseVars['testing_jumpbox_vm_size'] = await resolveJumpboxVmSize(options.location);
      }
    }
  }

  if (usesCapabilityHost(options.profile)) {
    baseVars['testing_private_agents_subnet_cidr'] = subnetPlan.agentsSubnetCidr;
    baseVars['testing_capability_host_resource_group_name'] = requireEnvVar(
      'TF_VAR_private_foundry_capability_hosts_pool_resource_group_name'
    );
    baseVars['testing_capability_host_cosmosdb_account_name'] = requireEnvVar(
      'TF_VAR_private_foundry_capability_hosts_pool_cosmosdb_account_name'
    );
    baseVars['testing_capability_host_storage_account_name'] = requireEnvVar(
      'TF_VAR_private_foundry_capability_hosts_pool_storage_account_name'
    );
    baseVars['testing_capability_host_search_service_name'] = requireEnvVar(
      'TF_VAR_private_foundry_capability_hosts_pool_search_service_name'
    );
  }

  return baseVars;
}

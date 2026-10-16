import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { hasExplicitApiKeyAdminScope, MemberRole } from '@genfeedai/contracts';
import { API_KEY_SCOPE_PRESETS } from '@genfeedai/contracts/constants';
import express, { type Request, type Response } from 'express';

export const E2E_TOKENS = {
  member: 'gf_e2e_member_assigned_brand_000000000000',
  ownerCapped: 'gf_e2e_owner_without_admin_scope_00000000',
  ownerWithAdminScope: 'gf_e2e_owner_with_admin_scope_000000000000',
} as const;

const E2E_CREDITS_BALANCE = 11_222;

export const E2E_ORGANIZATIONS = [
  { id: 'org_studio', label: 'Studio', slug: 'studio' },
  { id: 'org_agency', label: 'Agency', slug: 'agency' },
  { id: 'org_labs', label: 'Labs', slug: 'labs' },
] as const;

export const E2E_BRANDS = [
  {
    id: 'brand_studio_main',
    label: 'Studio Main',
    organizationId: 'org_studio',
  },
  {
    id: 'brand_studio_kids',
    label: 'Studio Kids',
    organizationId: 'org_studio',
  },
  {
    id: 'brand_agency_main',
    label: 'Agency Main',
    organizationId: 'org_agency',
  },
] as const;

interface E2eCredential {
  assignedBrandIds: readonly string[];
  membershipRole: MemberRole;
  organizationId: string;
  scopes: readonly string[];
  userId: string;
}

export interface RecordedUpstreamRequest {
  authorization: string | undefined;
  body: unknown;
  method: string;
  path: string;
}

export interface FakeGenfeedApi {
  baseUrl: string;
  close: () => Promise<void>;
  requests: RecordedUpstreamRequest[];
}

const ORG_ADMIN_ROLES: readonly MemberRole[] = [
  MemberRole.OWNER,
  MemberRole.ADMIN,
];

const CREDENTIALS: Readonly<Record<string, E2eCredential>> = {
  [E2E_TOKENS.member]: {
    assignedBrandIds: ['brand_studio_kids'],
    membershipRole: MemberRole.USER,
    organizationId: 'org_studio',
    scopes: API_KEY_SCOPE_PRESETS.mcp,
    userId: 'usr_member',
  },
  [E2E_TOKENS.ownerCapped]: {
    assignedBrandIds: [],
    membershipRole: MemberRole.OWNER,
    organizationId: 'org_studio',
    scopes: API_KEY_SCOPE_PRESETS.mcp,
    userId: 'usr_owner',
  },
  [E2E_TOKENS.ownerWithAdminScope]: {
    assignedBrandIds: [],
    membershipRole: MemberRole.OWNER,
    organizationId: 'org_studio',
    scopes: [...API_KEY_SCOPE_PRESETS.mcp, 'admin'],
    userId: 'usr_owner',
  },
};

function isOrgAdminRole(role: MemberRole): boolean {
  return ORG_ADMIN_ROLES.includes(role);
}

/** Mirrors `resolveApiKeyEffectiveMemberRole` in the API: keys never inherit org-admin. */
function effectiveRole(credential: E2eCredential): MemberRole {
  return isOrgAdminRole(credential.membershipRole) &&
    !hasExplicitApiKeyAdminScope(credential.scopes)
    ? MemberRole.USER
    : credential.membershipRole;
}

/** Mirrors `/auth/whoami`: an org-admin key without the admin scope has no role. */
function whoamiRole(credential: E2eCredential): string {
  return isOrgAdminRole(credential.membershipRole) &&
    !hasExplicitApiKeyAdminScope(credential.scopes)
    ? ''
    : credential.membershipRole;
}

/** Mirrors `BrandAccessService`: only a privileged caller sees every brand. */
function visibleBrands(credential: E2eCredential) {
  const inOrganization = E2E_BRANDS.filter(
    (brand) => brand.organizationId === credential.organizationId,
  );
  return isOrgAdminRole(effectiveRole(credential))
    ? inOrganization
    : inOrganization.filter((brand) =>
        credential.assignedBrandIds.includes(brand.id),
      );
}

function credentialFor(req: Request): E2eCredential | undefined {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  return token ? CREDENTIALS[token] : undefined;
}

function requireCredential(req: Request, res: Response): E2eCredential | null {
  const credential = credentialFor(req);
  if (!credential) {
    res.status(401).json({ errors: [{ detail: 'Unauthorized' }] });
    return null;
  }
  return credential;
}

export async function startFakeGenfeedApi(): Promise<FakeGenfeedApi> {
  const requests: RecordedUpstreamRequest[] = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    requests.push({
      authorization: req.headers.authorization,
      body: req.body,
      method: req.method,
      path: req.path,
    });
    next();
  });

  app.get('/v1/auth/whoami', (req, res) => {
    const credential = requireCredential(req, res);
    if (!credential) return;
    res.json({
      data: {
        isApiKey: true,
        organization: { id: credential.organizationId, name: '' },
        role: whoamiRole(credential),
        scopes: credential.scopes,
        user: {
          authUserId: credential.userId,
          email: `${credential.userId}@example.test`,
          id: credential.userId,
          name: credential.userId,
        },
      },
    });
  });

  app.post('/v1/agent-tools/:name/execute', (req, res) => {
    const credential = requireCredential(req, res);
    if (!credential) return;
    switch (req.params.name) {
      case 'get_account':
        res.json({
          creditsUsed: 0,
          data: {
            credits: { balance: E2E_CREDITS_BALANCE },
            profile: {
              isOnboardingCompleted: true,
              organizationId: credential.organizationId,
              role: effectiveRole(credential),
              userId: credential.userId,
            },
          },
          success: true,
        });
        return;
      case 'get_brands':
        res.json({
          creditsUsed: 0,
          data: {
            brands: visibleBrands(credential).map((brand) => ({
              id: brand.id,
              label: brand.label,
              name: brand.label,
            })),
          },
          success: true,
        });
        return;
      default:
        res.json({
          creditsUsed: 0,
          error: `Unexpected agent tool ${req.params.name}`,
          success: false,
        });
    }
  });

  app.post('/v1/agent-tools/:name/result-gate', (req, res) => {
    res.json({ content: req.body?.content ?? '', outcome: 'allowed' });
  });

  app.post('/v1/mcp-approvals', (req, res) => {
    if (!requireCredential(req, res)) return;
    res.status(201).json({
      data: {
        arguments: req.body?.arguments,
        id: `apr_${requests.length}`,
        status: 'PENDING',
        toolName: req.body?.toolName,
      },
    });
  });

  app.get('/v1/mcp-approvals/:id/pricing', (req, res) => {
    if (!requireCredential(req, res)) return;
    res.json({ data: { attributes: { quoteStatus: 'unavailable' } } });
  });

  app.get('/v1/organizations', (req, res) => {
    const credential = requireCredential(req, res);
    if (!credential) return;
    res.json({
      data: E2E_ORGANIZATIONS.map((organization) => ({
        brand: null,
        id: organization.id,
        isActive: organization.id === credential.organizationId,
        isOwner: true,
        label: organization.label,
        logoUrl: null,
        slug: organization.slug,
      })),
    });
  });

  const server: Server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
    requests,
  };
}

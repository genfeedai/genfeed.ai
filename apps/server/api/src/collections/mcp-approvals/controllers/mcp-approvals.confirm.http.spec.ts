import { createHash } from 'node:crypto';
import { McpApprovalsController } from '@api/collections/mcp-approvals/controllers/mcp-approvals.controller';
import { McpApprovalPolicyService } from '@api/collections/mcp-approvals/services/mcp-approval-policy.service';
import { McpApprovalsService } from '@api/collections/mcp-approvals/services/mcp-approvals.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  MCP_ACTION_ORIGIN_PROOF_HEADER,
  McpApprovalStatus,
  MemberRole,
} from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import type {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * Drives POST /mcp-approvals/:id/confirm (#9647) through Nest's real guard
 * chain: the real RolesGuard reads the route's own role metadata, so an
 * ordinary member who carries a valid MCP origin proof and asks about their
 * own approval is still refused, and an owner or admin can answer.
 */
const SERVICE_KEY = 'mcp-service-key-for-http-tests';
const MCP_PROOF = createHash('sha256').update(SERVICE_KEY).digest('base64url');
const ORGANIZATION_ID = testId('org-confirm');
const USER_ID = testId('user-confirm');

type StoredApproval = {
  id: string;
  organizationId: string;
  status: McpApprovalStatus;
  toolName: string;
  userId: string;
};

describe('POST /mcp-approvals/:id/confirm over HTTP', () => {
  let app: INestApplication;
  let memberRole: MemberRole;
  let stored: StoredApproval;

  const approvals = {
    findOne: async () => stored,
    resolve: async (_id: string, _org: string, decision: string) => {
      stored = {
        ...stored,
        status:
          decision === 'approve'
            ? McpApprovalStatus.APPROVED
            : McpApprovalStatus.DECLINED,
      };
      return stored;
    },
  };
  const members = {
    findOne: async () => ({ id: 'member-1', role: { key: memberRole } }),
  };
  const signedIn: CanActivate = {
    canActivate: (context: ExecutionContext) => {
      context.switchToHttp().getRequest().user = {
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
      };
      return true;
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [McpApprovalsController],
      providers: [
        RolesGuard,
        { provide: MembersService, useValue: members },
        { provide: McpApprovalsService, useValue: approvals },
        { provide: McpApprovalPolicyService, useValue: {} },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'GENFEEDAI_API_KEY' ? SERVICE_KEY : undefined,
          },
        },
        {
          provide: LoggerService,
          useValue: { debug() {}, error() {}, log() {}, warn() {} },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalGuards(signedIn);
    await app.init();
  });

  beforeEach(() => {
    stored = {
      id: 'approval-1',
      organizationId: ORGANIZATION_ID,
      status: McpApprovalStatus.PENDING,
      toolName: 'generate',
      userId: USER_ID,
    };
  });

  afterAll(async () => {
    await app.close();
  });

  const confirm = () =>
    request(app.getHttpServer())
      .post('/mcp-approvals/approval-1/confirm')
      .set(MCP_ACTION_ORIGIN_PROOF_HEADER, MCP_PROOF)
      .send({ decision: 'approve' });

  it.each([MemberRole.USER, MemberRole.CREATOR])(
    'refuses a %s answering their own approval with a valid proof',
    async (role) => {
      memberRole = role;

      const response = await confirm();

      expect(response.status).toBe(403);
      expect(stored.status).toBe(McpApprovalStatus.PENDING);
    },
  );

  it.each([MemberRole.OWNER, MemberRole.ADMIN])(
    'lets an organization %s approve their own approval',
    async (role) => {
      memberRole = role;

      const response = await confirm();

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe(McpApprovalStatus.APPROVED);
    },
  );
});

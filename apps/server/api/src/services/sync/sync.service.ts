import type { WorkflowDocument } from '@api/collections/workflows/schemas/workflow.schema';
import { WorkflowFormatConverterService } from '@api/collections/workflows/services/workflow-format-converter.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { ConfigService } from '@api/config/config.service';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

import type {
  CloudSyncMetadata,
  PullWorkflowResponse,
  PushWorkflowResponse,
  SyncStatusResponse,
} from './sync.interfaces';

@Injectable()
export class SyncService {
  constructor(
    private readonly configService: ConfigService,
    private readonly formatConverterService: WorkflowFormatConverterService,
    private readonly httpService: HttpService,
    private readonly logger: LoggerService,
    private readonly workflowsService: WorkflowsService,
  ) {}

  async getStatus(user: User): Promise<SyncStatusResponse> {
    const { organization } = getPublicMetadata(user);

    // Fetch all non-deleted workflows for this org
    const allWorkflows =
      await this.workflowsService.findAllByOrganization(organization);

    const totalWorkflows = allWorkflows.length;
    const syncedWorkflows = allWorkflows.filter(
      (w) => (w as WorkflowDocument).cloudSync != null,
    ).length;

    const apiUrl = this.configService.get('GENFEEDAI_API_URL');

    return {
      isConnected: Boolean(apiUrl),
      mode: 'hybrid',
      syncableWorkflows: totalWorkflows - syncedWorkflows,
      syncedWorkflows,
    };
  }

  async pushWorkflow(
    user: User,
    localWorkflowId: string,
    clerkToken: string,
  ): Promise<PushWorkflowResponse> {
    const { organization } = getPublicMetadata(user);

    // 1. Find the local workflow
    const workflow = (await this.workflowsService.findOne({
      _id: localWorkflowId,
      isDeleted: false,
      organization,
    })) as WorkflowDocument | null;

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    // 2. Convert to portable cloud format
    const cloudFormat = this.formatConverterService.ensureCloudFormat({
      edges: workflow.edges ?? [],
      name: workflow.name,
      nodes: workflow.nodes ?? [],
    });

    // 3. POST to cloud API import endpoint
    const apiUrl = this.configService.get('GENFEEDAI_API_URL');
    const importUrl = `${apiUrl}/v1/workflows/import`;

    let remoteResponse: { id: string };
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<{ id: string }>(importUrl, cloudFormat, {
          headers: {
            Authorization: `Bearer ${clerkToken}`,
            'Content-Type': 'application/json',
          },
        }),
      );
      remoteResponse = data;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to push workflow to cloud', {
        error: message,
        importUrl,
        localWorkflowId,
      });
      throw new HttpException(
        `Failed to push workflow to cloud: ${message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    // 4. Store cloudSync metadata on local workflow
    const cloudSync: CloudSyncMetadata = {
      lastSyncedAt: new Date(),
      remoteAccountId: user.id,
      remoteId: remoteResponse.id,
      remoteOrgId: organization,
      syncDirection: 'push',
    };

    await this.workflowsService.patch(localWorkflowId, {
      $set: { cloudSync },
    });

    this.logger.log('Workflow pushed to cloud successfully', {
      localWorkflowId,
      remoteId: remoteResponse.id,
    });

    // 5. Return sync result
    return {
      cloudSync,
      localId: localWorkflowId,
      remoteId: remoteResponse.id,
    };
  }

  async pullWorkflow(
    user: User,
    remoteWorkflowId: string,
    clerkToken: string,
  ): Promise<PullWorkflowResponse> {
    const { organization, user: userId } = getPublicMetadata(user);
    const apiUrl = this.configService.get('GENFEEDAI_API_URL');

    // 1. Fetch workflow from cloud API
    let remoteWorkflow: Record<string, unknown>;
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<Record<string, unknown>>(
          `${apiUrl}/v1/workflows/${remoteWorkflowId}`,
          {
            headers: { Authorization: `Bearer ${clerkToken}` },
          },
        ),
      );
      remoteWorkflow = data;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to fetch workflow from cloud', {
        error: message,
        remoteWorkflowId,
      });
      throw new HttpException(
        `Failed to pull workflow from cloud: ${message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    // 2. Convert to cloud format and create locally
    const workflowData = remoteWorkflow as {
      nodes?: unknown[];
      edges?: unknown[];
      name?: string;
      description?: string;
    };

    const cloudFormat = this.formatConverterService.ensureCloudFormat({
      edges: (workflowData.edges ?? []) as Record<string, unknown>[],
      name: workflowData.name ?? 'Pulled Workflow',
      nodes: (workflowData.nodes ?? []) as Record<string, unknown>[],
    });

    const created = await this.workflowsService.createWorkflow(
      userId,
      organization,
      {
        description: workflowData.description,
        edges: cloudFormat.workflow.edges,
        label: cloudFormat.workflow.name,
        nodes: cloudFormat.workflow.nodes,
      },
    );

    // 3. Store cloudSync metadata
    const cloudSync: CloudSyncMetadata = {
      lastSyncedAt: new Date(),
      remoteAccountId: user.id,
      remoteId: remoteWorkflowId,
      remoteOrgId: organization,
      syncDirection: 'pull',
    };

    const localId = String(
      created._id ?? (created as Record<string, unknown>).id,
    );
    await this.workflowsService.patch(localId, {
      $set: { cloudSync },
    });

    this.logger.log('Workflow pulled from cloud successfully', {
      localId,
      remoteWorkflowId,
    });

    return {
      cloudSync,
      localId,
      remoteId: remoteWorkflowId,
    };
  }
}

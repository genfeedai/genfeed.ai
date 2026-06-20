import { ConfigService } from '@api/config/config.service';
import type { EC2InstanceStatus } from '@api/endpoints/admin/darkroom/interfaces/darkroom-infra.interface';
import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from '@aws-sdk/client-cloudfront';
import {
  DescribeInstancesCommand,
  EC2Client,
  StartInstancesCommand,
  StopInstancesCommand,
} from '@aws-sdk/client-ec2';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';

/**
 * Owns the darkroom AWS clients (EC2 + CloudFront) and GPU/service health
 * checks. Centralises the previously duplicated AWS log-error-and-rethrow
 * boilerplate behind a single runAws wrapper.
 */
@Injectable()
export class DarkroomInfraService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly ec2Client: EC2Client;
  private readonly cloudFrontClient: CloudFrontClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {
    const region = this.configService.get('AWS_REGION') || 'us-east-1';
    const credentials = {
      accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID') || '',
      secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY') || '',
    };

    this.ec2Client = new EC2Client({ credentials, region });
    this.cloudFrontClient = new CloudFrontClient({ credentials, region });
  }

  /**
   * Run an AWS SDK interaction, logging-and-rethrowing on failure with the
   * caller's context. Replaces the duplicated try/catch in every AWS method.
   */
  private async runAws<T>(
    caller: string,
    failureMessage: string,
    context: Record<string, unknown>,
    fn: () => Promise<T>,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error: unknown) {
      this.loggerService.error(caller, {
        ...context,
        error: getErrorMessage(error),
        message: failureMessage,
      });
      throw error;
    }
  }

  /**
   * Get EC2 instance statuses filtered by the 'Project: darkroom' tag.
   */
  getEC2Status(): Promise<EC2InstanceStatus[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller);

    return this.runAws(
      caller,
      'Failed to describe EC2 instances',
      {},
      async () => {
        const command = new DescribeInstancesCommand({
          Filters: [
            { Name: 'tag:Project', Values: ['darkroom', 'fleet'] },
            {
              Name: 'instance-state-name',
              Values: ['pending', 'running', 'stopping', 'stopped'],
            },
          ],
        });

        const response = await this.ec2Client.send(command);
        const instances: EC2InstanceStatus[] = [];

        for (const reservation of response.Reservations ?? []) {
          for (const instance of reservation.Instances ?? []) {
            const nameTag = instance.Tags?.find((tag) => tag.Key === 'Name');
            const roleTag = instance.Tags?.find((tag) => tag.Key === 'Role');
            instances.push({
              instanceId: instance.InstanceId ?? 'unknown',
              instanceType: instance.InstanceType ?? 'unknown',
              name: nameTag?.Value ?? 'unnamed',
              role: roleTag?.Value ?? 'training',
              state: instance.State?.Name ?? 'unknown',
            });
          }
        }

        return instances;
      },
    );
  }

  /**
   * Start or stop an EC2 instance.
   */
  ec2Action(
    instanceId: string,
    action: 'start' | 'stop',
  ): Promise<{ message: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { action, instanceId });

    return this.runAws(
      caller,
      `Failed to ${action} EC2 instance`,
      { action, instanceId },
      async () => {
        const stateChanges =
          action === 'start'
            ? (
                await this.ec2Client.send(
                  new StartInstancesCommand({ InstanceIds: [instanceId] }),
                )
              ).StartingInstances
            : (
                await this.ec2Client.send(
                  new StopInstancesCommand({ InstanceIds: [instanceId] }),
                )
              ).StoppingInstances;

        const currentState = stateChanges?.[0]?.CurrentState?.Name ?? 'unknown';
        const previousState =
          stateChanges?.[0]?.PreviousState?.Name ?? 'unknown';

        this.loggerService.log(caller, {
          currentState,
          instanceId,
          message: `EC2 instance ${action} successful`,
          previousState,
        });

        return {
          message: `Instance ${instanceId} ${action} executed (${previousState} -> ${currentState})`,
        };
      },
    );
  }

  async ec2ActionAll(
    action: 'start' | 'stop',
    role?: string,
  ): Promise<{
    action: 'start' | 'stop';
    results: Array<{
      instanceId: string;
      name: string;
      state: string;
      success: boolean;
      error?: string;
    }>;
  }> {
    const instances = await this.getEC2Status();
    const matchingInstances = instances.filter((instance) => {
      const matchesRole = role ? instance.role === role : true;
      const matchesState =
        action === 'start'
          ? instance.state === 'stopped'
          : instance.state === 'running';
      return matchesRole && matchesState;
    });

    const results = await Promise.all(
      matchingInstances.map(async (instance) => {
        try {
          await this.ec2Action(instance.instanceId, action);
          return {
            instanceId: instance.instanceId,
            name: instance.name,
            state: instance.state,
            success: true,
          };
        } catch (error: unknown) {
          return {
            error: getErrorMessage(error),
            instanceId: instance.instanceId,
            name: instance.name,
            state: instance.state,
            success: false,
          };
        }
      }),
    );

    return { action, results };
  }

  /**
   * Invalidate CloudFront cache for the given distribution and paths.
   */
  invalidateCloudFront(
    distributionId: string,
    paths?: string[],
  ): Promise<{ message: string; invalidationId: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const invalidationPaths = paths?.length ? paths : ['/*'];
    if (!distributionId) {
      throw new BadRequestException(
        'CloudFront distribution ID is not configured for darkroom invalidation',
      );
    }
    this.loggerService.log(caller, {
      distributionId,
      paths: invalidationPaths,
    });

    return this.runAws(
      caller,
      'Failed to create CloudFront invalidation',
      { distributionId, paths: invalidationPaths },
      async () => {
        const command = new CreateInvalidationCommand({
          DistributionId: distributionId,
          InvalidationBatch: {
            CallerReference: `darkroom-${Date.now()}`,
            Paths: {
              Items: invalidationPaths,
              Quantity: invalidationPaths.length,
            },
          },
        });

        const response = await this.cloudFrontClient.send(command);
        const invalidationId = response.Invalidation?.Id ?? 'unknown';

        this.loggerService.log(caller, {
          distributionId,
          invalidationId,
          message: 'CloudFront invalidation created',
          paths: invalidationPaths,
        });

        return {
          invalidationId,
          message: `CloudFront invalidation created for ${distributionId} (${invalidationPaths.join(', ')})`,
        };
      },
    );
  }

  getDefaultCloudFrontDistributionId(): string {
    return this.configService.get('DARKROOM_CLOUDFRONT_DISTRIBUTION_ID') || '';
  }

  /**
   * Check health of ComfyUI and Ollama services.
   */
  async getServiceHealth(): Promise<
    { name: string; status: 'online' | 'offline' | 'unknown'; url: string }[]
  > {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller);

    const services = [
      {
        name: 'images.genfeed.ai',
        url: this.configService.get('GPU_IMAGES_URL') || '',
      },
      {
        name: 'voices.genfeed.ai',
        url: this.configService.get('GPU_VOICES_URL') || '',
      },
      {
        name: 'videos.genfeed.ai',
        url: this.configService.get('GPU_VIDEOS_URL') || '',
      },
      {
        name: 'llm.genfeed.ai',
        url: this.configService.get('GPU_LLM_URL') || '',
      },
    ].filter((s) => s.url);

    const results = await Promise.all(
      services.map(async (service) => {
        try {
          await axios.get(`${service.url}/v1/health`, { timeout: 5000 });
          return {
            name: service.name,
            status: 'online' as const,
            url: service.url,
          };
        } catch {
          return {
            name: service.name,
            status: 'offline' as const,
            url: service.url,
          };
        }
      }),
    );

    return results;
  }
}

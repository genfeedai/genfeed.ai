import type { ConfigService } from '@api/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { parseRedisConnection } from '@libs/redis/redis-connection.utils';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import type { HttpService } from '@nestjs/axios';
import {
  HttpException,
  HttpStatus,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';
import { firstValueFrom } from 'rxjs';

export interface ServiceHealth {
  name: string;
  url: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  responseTime?: number;
  error?: string;
}

@Injectable()
export class MicroservicesService implements OnModuleInit {
  private readonly constructorName: string = String(this.constructor.name);
  private redisClient!: RedisClientType;
  private servicesConfig!: Map<string, { url: string; required: boolean }>;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Initialize services config first
    this.initializeServices();

    // Initialize Redis
    await this.initializeRedis();

    // Then verify required services
    try {
      await this.verifyRequiredServices();
    } catch {
      this.loggerService.error(
        'Service dependencies check failed:',
        String(this.constructor.name),
      );
      // Exit the process if service verification fails
      process.exit(1);
    }
  }

  private initializeServices() {
    const filesUrl =
      this.configService.get('GENFEEDAI_MICROSERVICES_FILES_URL') ||
      'http://localhost:3012';

    const notificationsUrl =
      this.configService.get('GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL') ||
      'http://localhost:3013';

    const MCPUrl =
      this.configService.get('GENFEEDAI_MICROSERVICES_MCP_URL') ||
      'http://localhost:3014';

    // Log service configuration
    this.loggerService.log(
      `${this.constructorName} initializeServices: files=${filesUrl}, mcp=${MCPUrl}, notifications=${notificationsUrl}`,
    );

    this.servicesConfig = new Map([
      ['files', { required: true, url: filesUrl }],
      ['mcp', { required: true, url: MCPUrl }],
      ['notifications', { required: true, url: notificationsUrl }],
    ]);
  }

  private async initializeRedis() {
    const config = parseRedisConnection(this.configService);

    this.loggerService.log(
      `${this.constructorName} initializeRedis: Connecting to Redis at ${config.url}`,
    );

    try {
      this.redisClient = createClient({
        socket: {
          connectTimeout: 3_000,
          ...(config.tls ? { tls: true as const } : {}),
        },
        url: config.url,
      });

      this.redisClient.on('error', (err: Error) => {
        this.loggerService.error('Redis Client Error', err);
      });

      this.redisClient.on('connect', () => {
        this.loggerService.log('Redis Client Connected');
      });

      await this.redisClient.connect();
      this.loggerService.log(
        `${this.constructorName} initializeRedis: Successfully connected to Redis`,
      );
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} initializeRedis: Failed to connect to Redis at ${config.url}`,
        error,
      );
    }
  }

  async checkRedisHealth(): Promise<boolean> {
    try {
      await this.redisClient.ping();
      return true;
    } catch (error: unknown) {
      this.loggerService.error('Redis health check failed', error);
      return false;
    }
  }

  async checkServiceHealth(name: string, url: string): Promise<ServiceHealth> {
    const startTime = Date.now();
    const healthUrl = `${url}/v1/health`;

    this.loggerService.log(
      `${this.constructorName} checkServiceHealth: Checking ${name} at ${healthUrl}`,
    );

    try {
      await firstValueFrom(
        this.httpService.get(healthUrl, {
          timeout: 5000,
          validateStatus: (status) => status === 200,
        }),
      );

      const responseTime = Date.now() - startTime;
      this.loggerService.log(
        `${this.constructorName} checkServiceHealth: ${name} is healthy (${responseTime}ms)`,
      );

      return {
        name,
        responseTime,
        status: 'healthy',
        url,
      };
    } catch (error: unknown) {
      const responseTime = Date.now() - startTime;
      const err = error as Error & {
        code?: string;
        response?: { status?: number; statusText?: string };
      };
      const errorMessage = err?.message ?? 'Service unreachable';
      const errorDetails = {
        code: err?.code,
        message: errorMessage,
        stack: err?.stack,
        status: err?.response?.status,
        statusText: err?.response?.statusText,
      };

      this.loggerService.error(
        `${this.constructorName} checkServiceHealth: ${name} is unhealthy at ${healthUrl} (${responseTime}ms)`,
        errorDetails,
      );

      return {
        error: errorMessage,
        name,
        responseTime,
        status: 'unhealthy',
        url,
      };
    }
  }

  async checkAllServices(): Promise<ServiceHealth[]> {
    const healthChecks = await Promise.all(
      Array.from(this.servicesConfig.entries()).map(([name, config]) =>
        this.checkServiceHealth(name, config.url),
      ),
    );

    return healthChecks;
  }

  async verifyRequiredServices(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const nodeEnv = this.configService.get('NODE_ENV') || 'development';
    const isProduction = nodeEnv === 'production';

    this.loggerService.log(`${url} checking services in ${nodeEnv} mode`);

    const redisHealthy = await this.checkRedisHealth();
    if (!redisHealthy) {
      const message =
        'Redis is not available. Redis is required for all environments.';
      this.loggerService.error(message, url);
      throw new HttpException(message, HttpStatus.SERVICE_UNAVAILABLE);
    }

    // Skip microservice health checks in development/localhost
    if (!isProduction) {
      this.loggerService.log(
        `${url} Skipping microservice health checks in ${nodeEnv} mode`,
      );
      return;
    }

    // In production, retry service health checks with exponential backoff
    const maxRetries = 5;
    const baseDelay = 2000; // 2 seconds

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const healthChecks = await this.checkAllServices();
      const unhealthyServices = healthChecks.filter(
        (service) => service.status === 'unhealthy',
      );

      if (unhealthyServices.length === 0) {
        this.loggerService.log('All required services are healthy');
        return;
      }

      const serviceNames = unhealthyServices.map((s) => s.name).join(', ');

      // Log detailed information about each unhealthy service
      unhealthyServices.forEach((service) => {
        this.loggerService.error(
          `${url} Unhealthy service details: ${service.name} at ${service.url}`,
          {
            attempt,
            error: service.error,
            maxRetries,
            responseTime: service.responseTime,
          },
        );
      });

      if (attempt < maxRetries) {
        const delay = baseDelay * 2 ** (attempt - 1);
        this.loggerService.warn(
          `${url} services not ready (attempt ${attempt}/${maxRetries}): ${serviceNames}. Retrying in ${delay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // Final attempt failed in production
        const message = `Required services are not available after ${maxRetries} attempts: ${serviceNames}`;
        this.loggerService.error(message, {
          error: url,
          unhealthyServices: unhealthyServices.map((s) => ({
            error: s.error,
            name: s.name,
            responseTime: s.responseTime,
            url: s.url,
          })),
        });
        throw new HttpException(message, HttpStatus.SERVICE_UNAVAILABLE);
      }
    }
  }

  async notifyWebhook(
    service: string,
    event: string,
    data: unknown,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const notificationsUrl = this.servicesConfig.get('notifications')?.url;

      if (!notificationsUrl) {
        this.loggerService.warn(
          `${url} notifications service URL not configured`,
        );
        return;
      }

      const health = await this.checkServiceHealth(
        'notifications',
        notificationsUrl,
      );

      if (health.status === 'unhealthy') {
        const nodeEnv = this.configService.get('NODE_ENV') || 'development';

        if (nodeEnv === 'production') {
          throw new Error(
            'Notifications service is required but not available',
          );
        } else {
          this.loggerService.warn(
            `${url} notifications service unhealthy in development, skipping`,
          );
          return;
        }
      }

      const notification = {
        data,
        event,
        metadata: {
          timestamp: new Date().toISOString(),
          ...data.metadata,
        },
        service,
        status: 'received',
      };

      await firstValueFrom(
        this.httpService.post(
          `${notificationsUrl}/webhooks/notify`,
          notification,
          {
            timeout: 5000,
          },
        ),
      );

      this.loggerService.log(`${url} notification sent successfully`, {
        event,
        service,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to send notification`, error);

      const nodeEnv = this.configService.get('NODE_ENV') || 'development';
      if (nodeEnv === 'production') {
        throw error;
      }
    }
  }

  async uploadToFilesService(fileData: {
    buffer: Buffer;
    filename: string;
    mimeType: string;
    metadata?: unknown;
  }): Promise<{ url: string; key: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const filesUrl = this.servicesConfig.get('files')?.url;

      if (!filesUrl) {
        throw new Error('Files service URL not configured');
      }

      const health = await this.checkServiceHealth('files', filesUrl);

      if (health.status === 'unhealthy') {
        const nodeEnv = this.configService.get('NODE_ENV') || 'development';

        if (nodeEnv === 'production') {
          throw new Error('Files service is required but not available');
        } else {
          this.loggerService.warn(
            `${url} files service unhealthy in development`,
          );
          throw new Error('Files service not available');
        }
      }

      const formData = new FormData();
      // Convert Buffer to Uint8Array for Blob compatibility
      const uint8Array = new Uint8Array(
        fileData.buffer.buffer,
        fileData.buffer.byteOffset,
        fileData.buffer.byteLength,
      );
      const blob = new Blob([uint8Array as unknown as BlobPart], {
        type: fileData.mimeType,
      });
      formData.append('file', blob, fileData.filename);

      if (fileData.metadata) {
        formData.append('metadata', JSON.stringify(fileData.metadata));
      }

      const response = await firstValueFrom(
        this.httpService.post(`${filesUrl}/v1/files/upload`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          timeout: 30000,
        }),
      );

      return response.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  async getHealthStatus(): Promise<{
    redis: boolean;
    services: ServiceHealth[];
    timestamp: string;
  }> {
    const redisHealthy = await this.checkRedisHealth();
    const services = await this.checkAllServices();

    return {
      redis: redisHealthy,
      services,
      timestamp: new Date().toISOString(),
    };
  }

  async onModuleDestroy() {
    if (this.redisClient) {
      // Remove all event listeners to prevent memory leaks
      this.redisClient.removeAllListeners();
      await this.redisClient.disconnect();
    }
  }
}

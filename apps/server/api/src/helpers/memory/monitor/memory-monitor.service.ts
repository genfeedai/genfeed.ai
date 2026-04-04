import process from 'node:process';
import v8 from 'node:v8';
import { ConfigService } from '@api/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';

interface MemoryStats {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
  timestamp: Date;
}

@Injectable()
export class MemoryMonitorService implements OnModuleDestroy {
  private readonly constructorName: string = 'MemoryMonitorService';
  private monitorInterval: NodeJS.Timeout | null = null;
  private readonly warningThreshold = 0.8; // 80% of max heap
  private readonly criticalThreshold = 0.9; // 90% of max heap
  private readonly maxHeapSize: number;

  constructor(
    private readonly loggerService: LoggerService,
    private readonly configService: ConfigService,
  ) {
    // Get max heap size from V8
    const heapStats = v8.getHeapStatistics();
    this.maxHeapSize = heapStats.heap_size_limit;

    // Only start periodic monitoring in development
    // In production, memory will be checked only on slow requests
    if (
      this.configService.isDevelopment &&
      this.configService.isDevOptionalInitEnabled
    ) {
      this.startMonitoring(300_000); // Check every 5 minutes in development
    }
  }

  onModuleDestroy() {
    this.stopMonitoring();
  }

  /**
   * Start memory monitoring
   */
  private startMonitoring(intervalMs = 30_000): void {
    // Check every 30 seconds
    this.monitorInterval = setInterval(() => {
      this.checkMemory();
    }, intervalMs);
  }

  /**
   * Stop memory monitoring
   */
  private stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  /**
   * Check current memory usage
   */
  checkMemory(): MemoryStats {
    const memUsage = process.memoryUsage();
    const stats: MemoryStats = {
      arrayBuffers: memUsage.arrayBuffers,
      external: memUsage.external,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      rss: memUsage.rss,
      timestamp: new Date(),
    };

    const heapUsedPercent = stats.heapUsed / this.maxHeapSize;

    // Only log memory stats in development (not in production)
    if (this.configService.isDevelopment) {
      this.loggerService.log(`${this.constructorName} Memory Stats`, {
        arrayBuffersMB: Math.round(stats.arrayBuffers / 1024 / 1024),
        externalMB: Math.round(stats.external / 1024 / 1024),
        heapTotalMB: Math.round(stats.heapTotal / 1024 / 1024),
        heapUsedMB: Math.round(stats.heapUsed / 1024 / 1024),
        heapUsedPercent: Math.round(heapUsedPercent * 100),
        rssМB: Math.round(stats.rss / 1024 / 1024),
      });
    }

    // Check thresholds and log warnings/errors (always, even in production)
    if (heapUsedPercent > this.criticalThreshold) {
      this.loggerService.error(
        `${this.constructorName} CRITICAL: Memory usage above ${this.criticalThreshold * 100}%`,
        {
          heapUsedMB: Math.round(stats.heapUsed / 1024 / 1024),
          maxHeapMB: Math.round(this.maxHeapSize / 1024 / 1024),
          percent: Math.round(heapUsedPercent * 100),
        },
      );

      // Force garbage collection if available
      this.forceGarbageCollection();

      // In critical situations, consider graceful shutdown
      if (heapUsedPercent > 0.95) {
        this.handleCriticalMemory();
      }
    } else if (heapUsedPercent > this.warningThreshold) {
      this.loggerService.warn(
        `${this.constructorName} WARNING: Memory usage above ${this.warningThreshold * 100}%`,
        {
          heapUsedMB: Math.round(stats.heapUsed / 1024 / 1024),
          maxHeapMB: Math.round(this.maxHeapSize / 1024 / 1024),
          percent: Math.round(heapUsedPercent * 100),
        },
      );

      // Try garbage collection
      this.forceGarbageCollection();
    }

    return stats;
  }

  /**
   * Get memory stats without logging (for use in slow request warnings)
   */
  getMemoryStats(): {
    rssMB: number;
    heapUsedMB: number;
    heapTotalMB: number;
    externalMB: number;
    arrayBuffersMB: number;
    heapUsedPercent: number;
  } {
    const memUsage = process.memoryUsage();
    const heapUsedPercent = memUsage.heapUsed / this.maxHeapSize;

    return {
      arrayBuffersMB: Math.round(memUsage.arrayBuffers / 1024 / 1024),
      externalMB: Math.round(memUsage.external / 1024 / 1024),
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapUsedPercent: Math.round(heapUsedPercent * 100),
      rssMB: Math.round(memUsage.rss / 1024 / 1024),
    };
  }

  /**
   * Force garbage collection if available (requires --expose-gc flag)
   */
  private forceGarbageCollection(): void {
    if (global.gc) {
      this.loggerService.warn(
        `${this.constructorName} Forcing garbage collection`,
      );
      global.gc();

      // Check memory after GC
      setTimeout(() => {
        const afterGC = process.memoryUsage();
        this.loggerService.log(`${this.constructorName} Memory after GC`, {
          heapUsedMB: Math.round(afterGC.heapUsed / 1024 / 1024),
        });
      }, 1000);
    }
  }

  /**
   * Handle critical memory situation
   */
  private handleCriticalMemory(): void {
    this.loggerService.error(
      `${this.constructorName} CRITICAL: Initiating graceful shutdown due to memory pressure`,
      {
        error: new Error('Memory critical'),
      },
    );

    // Send alert (implement your alerting mechanism)
    // this.alertingService.sendCriticalAlert('Memory critical');

    // Gracefully shutdown after giving time to complete current operations
    setTimeout(() => {
      process.exit(1); // Exit with error code to trigger restart
    }, 30_000); // 30 seconds grace period
  }

  /**
   * Get memory snapshot for debugging
   */
  getMemorySnapshot(): unknown {
    const heapStats = v8.getHeapStatistics();
    const memUsage = process.memoryUsage();

    return {
      process: {
        arrayBuffersMB: Math.round(memUsage.arrayBuffers / 1024 / 1024),
        externalMB: Math.round(memUsage.external / 1024 / 1024),
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        rssMB: Math.round(memUsage.rss / 1024 / 1024),
      },
      timestamp: new Date(),
      v8: {
        heapSizeLimitMB: Math.round(heapStats.heap_size_limit / 1024 / 1024),
        mallocedMemoryMB: Math.round(heapStats.malloced_memory / 1024 / 1024),
        peakMallocedMemoryMB: Math.round(
          heapStats.peak_malloced_memory / 1024 / 1024,
        ),
        totalAvailableSizeMB: Math.round(
          heapStats.total_available_size / 1024 / 1024,
        ),
        totalHeapSizeExecutableMB: Math.round(
          heapStats.total_heap_size_executable / 1024 / 1024,
        ),
        totalHeapSizeMB: Math.round(heapStats.total_heap_size / 1024 / 1024),
        totalPhysicalSizeMB: Math.round(
          heapStats.total_physical_size / 1024 / 1024,
        ),
        usedHeapSizeMB: Math.round(heapStats.used_heap_size / 1024 / 1024),
      },
    };
  }
}

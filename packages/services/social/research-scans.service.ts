import type { ResearchScanStatus } from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

/** Reads how many research scans the organization has left (#11623). */
export class ResearchScansService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/research/scans`, token);
  }

  public static getInstance(token: string): ResearchScansService {
    return HTTPBaseService.getBaseServiceInstance(
      ResearchScansService,
      token,
    ) as ResearchScansService;
  }

  /** One status per library. Reading it starts no run and spends no scan. */
  public async list(signal?: AbortSignal): Promise<ResearchScanStatus[]> {
    const response = await this.instance.get<{ data?: ResearchScanStatus[] }>(
      '',
      { signal },
    );
    return Array.isArray(response.data?.data) ? response.data.data : [];
  }
}

import { API_ENDPOINTS } from '@genfeedai/constants';
import type { PersistedDashboardLayoutDocument } from '@genfeedai/interfaces';
import { DashboardLayout } from '@genfeedai/models/content/dashboard-layout.model';
import { DashboardLayoutSerializer } from '@genfeedai/serializers';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

const DEFAULT_PAGE_KEY = 'workspace-overview';

export interface UpsertDashboardLayoutBody {
  brandId: string;
  pageKey?: string;
  document: PersistedDashboardLayoutDocument;
  version?: number;
}

export class DashboardLayoutsService extends BaseService<DashboardLayout> {
  constructor(token: string) {
    super(
      API_ENDPOINTS.DASHBOARD_LAYOUTS,
      token,
      DashboardLayout,
      DashboardLayoutSerializer,
    );
  }

  public static getInstance(token: string): DashboardLayoutsService {
    return BaseService.getDataServiceInstance(
      DashboardLayoutsService,
      token,
    ) as DashboardLayoutsService;
  }

  /**
   * Fetch the persisted layout for a brand/page. Returns `null` when the
   * brand has no saved layout yet (server responds 404) rather than throwing —
   * callers fall back to the default page rendering in that case.
   */
  public async findForPage(
    brandId: string,
    pageKey: string = DEFAULT_PAGE_KEY,
  ): Promise<DashboardLayout | null> {
    const response = await this.instance.get<JsonApiResponseDocument>('', {
      params: { brand: brandId, pageKey },
      validateStatus: (status) =>
        status === 404 || (status >= 200 && status < 300),
    });

    if (response.status === 404) {
      return null;
    }

    return await this.mapOne(response.data);
  }

  /**
   * Upsert (create or replace) the persisted layout for a brand/page.
   */
  public upsertForPage(
    body: UpsertDashboardLayoutBody,
  ): Promise<DashboardLayout> {
    const { brandId, pageKey = DEFAULT_PAGE_KEY, document, version } = body;

    return this.executeWithErrorHandling(
      `PUT ${API_ENDPOINTS.DASHBOARD_LAYOUTS}`,
      this.instance
        .put<JsonApiResponseDocument>('', {
          brandId,
          document,
          pageKey,
          ...(version !== undefined ? { version } : {}),
        })
        .then((res) => res.data)
        .then((res) => this.mapOne(res)),
    );
  }

  /**
   * Soft-delete a persisted layout, reverting the page to its default render.
   */
  public removeLayout(id: string): Promise<DashboardLayout> {
    return this.delete(id);
  }
}

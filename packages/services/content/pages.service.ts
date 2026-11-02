export class PagesService {
  public static currentPage: number = 1;
  public static totalPages: number = 1;
  public static totalDocs: number = 0;

  /** Start order of list requests, so a late older response cannot win. */
  private static latestRequestId: number = 0;
  private static appliedRequestId: number = 0;

  /**
   * Call when a list request starts. Pass the id to `recordTotals` with the
   * response: totals from a request that started before one already recorded
   * are dropped, so a slow earlier request cannot overwrite a newer list's
   * footer.
   */
  static beginRequest(): number {
    PagesService.latestRequestId += 1;
    return PagesService.latestRequestId;
  }

  /** Records a response's totals unless a newer request already did. */
  static recordTotals(
    totals: { page: number; pages: number; total: number },
    requestId?: number,
  ): boolean {
    if (requestId !== undefined) {
      if (requestId < PagesService.appliedRequestId) {
        return false;
      }
      PagesService.appliedRequestId = requestId;
    }
    PagesService.setCurrentPage(totals.page);
    PagesService.setTotalPages(totals.pages);
    PagesService.setTotalDocs(totals.total);
    return true;
  }

  static getCurrentPage() {
    return PagesService.currentPage;
  }

  static setCurrentPage(newValue: number) {
    PagesService.currentPage = Math.max(1, newValue);
  }

  static getTotalPages() {
    return PagesService.totalPages;
  }

  static setTotalPages(newValue: number) {
    PagesService.totalPages = Math.max(1, newValue);
  }

  static getTotalDocs() {
    return PagesService.totalDocs;
  }

  static setTotalDocs(newValue: number) {
    PagesService.totalDocs = Math.max(0, newValue);
  }
}

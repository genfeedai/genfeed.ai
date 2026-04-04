export class PagesService {
  public static currentPage: number = 1;
  public static totalPages: number = 1;
  public static totalDocs: number = 0;

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

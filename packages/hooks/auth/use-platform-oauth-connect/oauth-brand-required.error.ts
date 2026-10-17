/**
 * Expected validation state: an OAuth connect was started without a usable
 * brand. Callers recover by asking the user to pick a brand, so it is thrown
 * without being logged as an unexpected production exception.
 */
export class OAuthBrandRequiredError extends Error {
  constructor() {
    super('Select a brand before connecting an account');
    this.name = 'OAuthBrandRequiredError';
  }
}

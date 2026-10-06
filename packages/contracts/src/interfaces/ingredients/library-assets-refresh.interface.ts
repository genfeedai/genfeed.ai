/**
 * Payload for `library:assets-refresh`.
 *
 * Senders that already reloaded the asset list set `isListRefresh` to false.
 * The list listener then skips a second fetch. Sidebar summary listeners ignore
 * this flag and always reload counts. A plain `Event` with no detail still
 * reloads the list, which is what publishers outside the list hook send.
 */
export interface ILibraryAssetsRefreshDetail {
  isListRefresh: boolean;
}

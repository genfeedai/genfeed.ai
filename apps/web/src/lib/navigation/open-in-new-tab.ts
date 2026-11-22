/**
 * Opens a tab synchronously (inside the click) so a popup blocker allows it,
 * then points it at the link once the request has produced one. A
 * `window.open` that runs after an `await` is outside the user gesture and is
 * blocked.
 *
 * The tab is closed and the error rethrown when the request fails or returns
 * no URL, so the caller keeps its own error handling. The tab never keeps a
 * reference to the opener.
 */
export async function openInNewTab(
  resolveUrl: () => Promise<string | null | undefined>,
): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const url = await resolveUrl();
    if (!url) {
      throw new Error('No URL to open');
    }
    if (tab) {
      tab.opener = null;
      tab.location.href = url;
    } else {
      window.location.assign(url);
    }
  } catch (error: unknown) {
    tab?.close();
    throw error;
  }
}

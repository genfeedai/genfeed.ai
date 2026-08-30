const WEBVIEW_NONCE_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function getWebviewNonce(): string {
  let nonce = '';
  for (let index = 0; index < 32; index += 1) {
    nonce += WEBVIEW_NONCE_ALPHABET.charAt(
      Math.floor(Math.random() * WEBVIEW_NONCE_ALPHABET.length),
    );
  }
  return nonce;
}

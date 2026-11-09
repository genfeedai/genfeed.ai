import { escapeSystemEmailHtml } from '@helpers/email/system-email.helper';

/**
 * Small standalone HTML page for the public newsletter links (unsubscribe,
 * confirm). `action` renders a one-button POST form, so link scanners that
 * prefetch a GET never unsubscribe anyone.
 */
export function renderNewsletterNoticePage(input: {
  title: string;
  message: string;
  action?: { label: string; url: string };
}): string {
  const title = escapeSystemEmailHtml(input.title);
  const form = input.action
    ? `<form method="post" action="${escapeSystemEmailHtml(input.action.url)}"><button type="submit">${escapeSystemEmailHtml(input.action.label)}</button></form>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>
:root{color-scheme:light dark;--bg:#fafaf9;--fg:#18181b;--muted:#71717a;--border:#e4e4e7;}
@media (prefers-color-scheme:dark){:root{--bg:#0a0a0a;--fg:#ededed;--muted:#a1a1a1;--border:#262626;}}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;padding:16px;box-sizing:border-box;}
main{max-width:420px;width:100%;border:1px solid var(--border);border-radius:12px;padding:32px;text-align:center;}
h1{font-size:22px;margin:0 0 12px;}
p{color:var(--muted);line-height:1.6;margin:0 0 20px;}
button{font:inherit;font-weight:600;padding:10px 20px;border-radius:8px;border:1px solid var(--fg);background:var(--fg);color:var(--bg);cursor:pointer;}
</style>
</head>
<body><main><h1>${title}</h1><p>${escapeSystemEmailHtml(input.message)}</p>${form}</main></body>
</html>`;
}

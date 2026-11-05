import fs from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;

/** Assembles the self-contained report page from report.css + report-client.js. */
export function renderHtml(data: unknown): string {
  const css = fs.readFileSync(path.join(here, 'report.css'), 'utf8');
  const client = fs.readFileSync(path.join(here, 'report-client.js'), 'utf8');
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<meta charset="utf-8">
<title>Database Load Report</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>${css}</style>
<main id="app"></main>
<div id="tip" role="tooltip" hidden></div>
<script>window.__LOADTEST__ = ${json};</script>
<script>${client}</script>
`;
}

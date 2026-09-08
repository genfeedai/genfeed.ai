import type { ICostReportDailyTotals } from '@genfeedai/contracts/interfaces/billing';

export function usageModelLabel(model: string | null): string {
  return model?.split('/').filter(Boolean).at(-1) || '—';
}

export function buildUsageRowsCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) =>
      row
        .map((value) => {
          const text = String(value);
          const safe =
            typeof value === 'string' && /^\s*[=+@-]/.test(text)
              ? `'${text}`
              : text;
          return `"${safe.replaceAll('"', '""')}"`;
        })
        .join(','),
    )
    .join('\r\n');
}

export function usageDailySeries(
  daily: ICostReportDailyTotals[],
  from: string,
  to: string,
) {
  const byDate = new Map(daily.map((row) => [row.date.slice(0, 10), row]));
  const end = new Date(to.slice(0, 10)).getTime();
  const points = [];
  for (
    let time = new Date(from.slice(0, 10)).getTime();
    time <= end;
    time += 86_400_000
  ) {
    const date = new Date(time).toISOString().slice(0, 10);
    const row = byDate.get(date);
    points.push({
      date,
      creditsUsed: row?.creditsUsed ?? 0,
      generationCount: row?.generationCount ?? 0,
    });
  }
  return points;
}

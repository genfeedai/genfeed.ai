import type { ICostReportQuery } from '@genfeedai/contracts/interfaces/billing';
import { BadRequestException } from '@nestjs/common';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 366;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface CostReportRange {
  from: Date;
  to: Date;
}

function parseBoundary(value: string, boundary: 'from' | 'to'): Date {
  const normalized = DATE_ONLY_PATTERN.test(value)
    ? `${value}T${boundary === 'from' ? '00:00:00.000' : '23:59:59.999'}Z`
    : value;
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`Invalid ${boundary} date`);
  }

  return parsed;
}

export function resolveCostReportRange(
  query: ICostReportQuery,
  now: Date = new Date(),
): CostReportRange {
  const to = query.to ? parseBoundary(query.to, 'to') : now;
  const from = query.from
    ? parseBoundary(query.from, 'from')
    : new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);

  if (from > to) {
    throw new BadRequestException('The cost report start must precede its end');
  }

  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
    throw new BadRequestException('Cost reports are limited to 366 days');
  }

  return { from, to };
}

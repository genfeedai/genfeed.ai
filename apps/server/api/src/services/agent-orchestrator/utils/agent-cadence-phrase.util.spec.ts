import { parseCadencePhrase } from '@api/services/agent-orchestrator/utils/agent-cadence-phrase.util';
import { describe, expect, it } from 'vitest';

describe('parseCadencePhrase', () => {
  it('parses "every day at 5pm"', () => {
    expect(parseCadencePhrase('run this every day at 5pm')?.schedule).toBe(
      '0 17 * * *',
    );
  });

  it('parses "each day at 8"', () => {
    expect(parseCadencePhrase('each day at 8')?.schedule).toBe('0 8 * * *');
  });

  it('parses "daily at 8:30am"', () => {
    expect(parseCadencePhrase('daily at 8:30am')?.schedule).toBe('30 8 * * *');
  });

  it('parses "every morning" onto the canonical morning hour', () => {
    expect(
      parseCadencePhrase('audit my timeline every morning')?.schedule,
    ).toBe('0 9 * * *');
  });

  it('parses "each evening" onto the canonical evening hour', () => {
    expect(parseCadencePhrase('post a recap each evening')?.schedule).toBe(
      '0 18 * * *',
    );
  });

  it('prefers an explicit time over the day-part default', () => {
    expect(parseCadencePhrase('every morning at 7')?.schedule).toBe(
      '0 7 * * *',
    );
  });

  it('parses "every weekday at 9am"', () => {
    expect(parseCadencePhrase('every weekday at 9am')?.schedule).toBe(
      '0 9 * * 1-5',
    );
  });

  it('parses "each weekday at 9am"', () => {
    expect(parseCadencePhrase('each weekday at 9am')?.schedule).toBe(
      '0 9 * * 1-5',
    );
  });

  it('parses a day of the week ("every monday at 10")', () => {
    expect(parseCadencePhrase('every monday at 10')?.schedule).toBe(
      '0 10 * * 1',
    );
  });

  it('parses a day of the month ("every month on day 1 at 9am")', () => {
    expect(parseCadencePhrase('every month on day 1 at 9am')?.schedule).toBe(
      '0 9 1 * *',
    );
  });

  it('extracts an IANA timezone alongside the cadence', () => {
    const parsed = parseCadencePhrase('every day at 9am europe/paris');
    expect(parsed?.schedule).toBe('0 9 * * *');
    expect(parsed?.timezone).toBe('europe/paris');
  });

  it('returns null for an ambiguous phrase so callers ask instead of guessing', () => {
    expect(parseCadencePhrase('run this every day')).toBeNull();
  });

  it('returns null when no cadence phrase is present', () => {
    expect(parseCadencePhrase('make me a launch image')).toBeNull();
  });
});

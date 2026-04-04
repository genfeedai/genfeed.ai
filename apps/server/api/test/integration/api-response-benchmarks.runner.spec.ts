import { runApiResponseBenchmarks } from '../../scripts/check-api-response-benchmarks';

function readBooleanEnv(name: string): boolean {
  return process.env[name] === '1';
}

function readNumberEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return parsed;
}

describe('api-response-benchmarks runner', () => {
  it('measures benchmark endpoints against the stored baseline', async () => {
    const isUpdatingBaseline = readBooleanEnv(
      'API_RESPONSE_BENCHMARK_UPDATE_BASELINE',
    );
    const result = await runApiResponseBenchmarks({
      isJson: readBooleanEnv('API_RESPONSE_BENCHMARK_JSON'),
      iterations: readNumberEnv('API_RESPONSE_BENCHMARK_ITERATIONS'),
      reportDir: process.env.API_RESPONSE_BENCHMARK_REPORT_DIR ?? null,
      updateBaseline: isUpdatingBaseline,
      warmup: readNumberEnv('API_RESPONSE_BENCHMARK_WARMUP'),
    });

    expect(result.endpoints.length).toBeGreaterThan(0);
    expect(result.regressions).toHaveLength(0);
    if (!isUpdatingBaseline) {
      expect(result.missingBaselineEndpointIds).toHaveLength(0);
    }
  }, 120_000);
});

import { GetForecastDto } from '@api/collections/insights/dto/forecast.dto';
import { Timeframe } from '@genfeedai/contracts';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

async function metricsErrorsFor(metricCount: number) {
  const dto = plainToInstance(GetForecastDto, {
    metrics: Array.from({ length: metricCount }, (_, i) => `metric-${i}`),
    period: Timeframe.D30,
  });
  const errors = await validate(dto);

  return errors.filter((error) => error.property === 'metrics');
}

describe('GetForecastDto', () => {
  describe('validation', () => {
    it('rejects a metrics array over the maximum size', async () => {
      const metricsErrors = await metricsErrorsFor(21);

      expect(metricsErrors).toHaveLength(1);
      expect(metricsErrors[0]?.constraints).toHaveProperty('arrayMaxSize');
    });
  });
});

'use client';

import { AnalyticsMetric } from '@genfeedai/enums';
import type { ITimeSeriesDataPoint } from '@genfeedai/interfaces';
import { TimeSeriesChart } from '@ui/analytics/charts/time-series/time-series-chart';
import Card from '@ui/card/Card';

type Props = {
  isTimeSeriesLoading: boolean;
  timeSeriesData: ITimeSeriesDataPoint[];
};

export default function AnalyticsViewsChart({
  isTimeSeriesLoading,
  timeSeriesData,
}: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 mb-6">
      <Card className="lg:col-span-2">
        <h2 className="text-lg font-semibold mb-4">Views Performance</h2>
        <TimeSeriesChart
          data={timeSeriesData}
          metrics={[AnalyticsMetric.VIEWS]}
          isLoading={isTimeSeriesLoading}
          height={320}
        />
      </Card>
    </div>
  );
}

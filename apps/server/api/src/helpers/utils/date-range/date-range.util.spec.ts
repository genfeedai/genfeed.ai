import { DateRangeUtil } from '@api/helpers/utils/date-range/date-range.util';

describe('DateRangeUtil', () => {
  beforeEach(() => {
    // Mock current date to 2024-01-15 12:00:00
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('parseDateRange', () => {
    it('should use default dates (D-7 to D-1) when no inputs provided', () => {
      const result = DateRangeUtil.parseDateRange();

      // endDate should be yesterday (2024-01-14 23:59:59.999)
      expect(result.endDate).toEqual(new Date('2024-01-14T23:59:59.999Z'));

      // startDate should be 7 days before endDate (2024-01-08 00:00:00.000)
      expect(result.startDate).toEqual(new Date('2024-01-08T00:00:00.000Z'));
    });

    it('should parse custom startDate and endDate', () => {
      const result = DateRangeUtil.parseDateRange('2024-01-01', '2024-01-10');

      expect(result.startDate).toEqual(new Date('2024-01-01T00:00:00.000Z'));
      expect(result.endDate).toEqual(new Date('2024-01-10T23:59:59.999Z'));
    });

    it('should cap endDate to yesterday if future date provided', () => {
      const result = DateRangeUtil.parseDateRange(undefined, '2024-01-20');

      // Should be capped to yesterday (2024-01-14)
      expect(result.endDate).toEqual(new Date('2024-01-14T23:59:59.999Z'));
    });

    it('should calculate previous period correctly', () => {
      const result = DateRangeUtil.parseDateRange('2024-01-01', '2024-01-07');

      // Previous period should be 7 days before startDate
      expect(result.previousStartDate).toEqual(
        new Date('2023-12-25T00:00:00.000Z'),
      );
      expect(result.previousEndDate).toEqual(
        new Date('2023-12-31T23:59:59.999Z'),
      );
    });

    it('should not calculate previous period if includePreviousPeriod is false', () => {
      const result = DateRangeUtil.parseDateRange('2024-01-01', '2024-01-07', {
        includePreviousPeriod: false,
      });

      expect(result.previousStartDate).toEqual(result.startDate);
      expect(result.previousEndDate).toEqual(result.endDate);
    });

    it('should use custom defaultDays option', () => {
      const result = DateRangeUtil.parseDateRange(undefined, undefined, {
        defaultDays: 30,
      });

      // startDate should be 30 days before endDate (30-day inclusive range)
      // endDate is 2024-01-14, so 30 days inclusive = 2023-12-16 to 2024-01-14
      const expectedStartDate = new Date('2023-12-16T00:00:00.000Z');
      expect(result.startDate).toEqual(expectedStartDate);
    });

    it('should throw error if startDate >= endDate', () => {
      expect(() => {
        DateRangeUtil.parseDateRange('2024-01-10', '2024-01-01');
      }).toThrow('startDate must be before endDate');

      expect(() => {
        DateRangeUtil.parseDateRange('2024-01-01', '2024-01-01');
      }).toThrow('startDate must be before endDate');
    });

    it('should handle Date objects as input', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-10');

      const result = DateRangeUtil.parseDateRange(startDate, endDate);

      expect(result.startDate).toEqual(new Date('2024-01-01T00:00:00.000Z'));
      expect(result.endDate).toEqual(new Date('2024-01-10T23:59:59.999Z'));
    });
  });

  describe('getDefaultDateRange', () => {
    it('should return default date range (D-7 to D-1)', () => {
      const result = DateRangeUtil.getDefaultDateRange();

      expect(result.endDate).toEqual(new Date('2024-01-14T23:59:59.999Z'));
      expect(result.startDate).toEqual(new Date('2024-01-08T00:00:00.000Z'));
    });
  });
});

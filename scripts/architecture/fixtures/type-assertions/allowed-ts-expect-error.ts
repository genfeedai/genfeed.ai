declare const fixtureValue: unknown;

// @ts-expect-error TS2322 -- the fixture intentionally assigns unknown to string
export const allowedText: string = fixtureValue;

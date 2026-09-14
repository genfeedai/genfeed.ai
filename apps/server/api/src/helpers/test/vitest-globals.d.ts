declare global {
  namespace vi {
    export type Mock = import('vitest').Mock;
    export type Mocked<T> = import('vitest').Mocked<T>;
  }
}

export {};

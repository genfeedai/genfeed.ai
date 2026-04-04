declare global {
  namespace vi {
    export type Mock<T extends (...args: any[]) => any = (...args: any[]) => any> =
      import('vitest').Mock<T>;
    export type Mocked<T> = import('vitest').Mocked<T>;
  }
}

export {};

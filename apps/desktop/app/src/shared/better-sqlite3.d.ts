declare module 'better-sqlite3' {
  interface Statement {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  }

  export default class Database {
    constructor(filename: string);
    exec(sql: string): this;
    pragma(sql: string): unknown;
    prepare(sql: string): Statement;
  }
}

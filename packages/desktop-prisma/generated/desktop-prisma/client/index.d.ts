
/**
 * Client
**/

import * as runtime from './runtime/client.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model User
 * 
 */
export type User = $Result.DefaultSelection<Prisma.$UserPayload>
/**
 * Model Organization
 * 
 */
export type Organization = $Result.DefaultSelection<Prisma.$OrganizationPayload>
/**
 * Model Post
 * 
 */
export type Post = $Result.DefaultSelection<Prisma.$PostPayload>
/**
 * Model Ingredient
 * 
 */
export type Ingredient = $Result.DefaultSelection<Prisma.$IngredientPayload>
/**
 * Model Trend
 * 
 */
export type Trend = $Result.DefaultSelection<Prisma.$TrendPayload>
/**
 * Model AgentStrategy
 * 
 */
export type AgentStrategy = $Result.DefaultSelection<Prisma.$AgentStrategyPayload>
/**
 * Model Workflow
 * 
 */
export type Workflow = $Result.DefaultSelection<Prisma.$WorkflowPayload>
/**
 * Model WorkflowExecution
 * 
 */
export type WorkflowExecution = $Result.DefaultSelection<Prisma.$WorkflowExecutionPayload>
/**
 * Model DesktopKv
 * 
 */
export type DesktopKv = $Result.DefaultSelection<Prisma.$DesktopKvPayload>
/**
 * Model DesktopWorkspace
 * 
 */
export type DesktopWorkspace = $Result.DefaultSelection<Prisma.$DesktopWorkspacePayload>
/**
 * Model DesktopSyncJob
 * 
 */
export type DesktopSyncJob = $Result.DefaultSelection<Prisma.$DesktopSyncJobPayload>
/**
 * Model DesktopRecentItem
 * 
 */
export type DesktopRecentItem = $Result.DefaultSelection<Prisma.$DesktopRecentItemPayload>

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient({
 *   adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
 * })
 * // Fetch zero or more Users
 * const users = await prisma.user.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://pris.ly/d/client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  const U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient({
   *   adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
   * })
   * // Fetch zero or more Users
   * const users = await prisma.user.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://pris.ly/d/client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): PrismaClient;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/orm/prisma-client/queries/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>

  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb<ClientOptions>, ExtArgs, $Utils.Call<Prisma.TypeMapCb<ClientOptions>, {
    extArgs: ExtArgs
  }>>

      /**
   * `prisma.user`: Exposes CRUD operations for the **User** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Users
    * const users = await prisma.user.findMany()
    * ```
    */
  get user(): Prisma.UserDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.organization`: Exposes CRUD operations for the **Organization** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Organizations
    * const organizations = await prisma.organization.findMany()
    * ```
    */
  get organization(): Prisma.OrganizationDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.post`: Exposes CRUD operations for the **Post** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Posts
    * const posts = await prisma.post.findMany()
    * ```
    */
  get post(): Prisma.PostDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.ingredient`: Exposes CRUD operations for the **Ingredient** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Ingredients
    * const ingredients = await prisma.ingredient.findMany()
    * ```
    */
  get ingredient(): Prisma.IngredientDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.trend`: Exposes CRUD operations for the **Trend** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Trends
    * const trends = await prisma.trend.findMany()
    * ```
    */
  get trend(): Prisma.TrendDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.agentStrategy`: Exposes CRUD operations for the **AgentStrategy** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more AgentStrategies
    * const agentStrategies = await prisma.agentStrategy.findMany()
    * ```
    */
  get agentStrategy(): Prisma.AgentStrategyDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.workflow`: Exposes CRUD operations for the **Workflow** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Workflows
    * const workflows = await prisma.workflow.findMany()
    * ```
    */
  get workflow(): Prisma.WorkflowDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.workflowExecution`: Exposes CRUD operations for the **WorkflowExecution** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more WorkflowExecutions
    * const workflowExecutions = await prisma.workflowExecution.findMany()
    * ```
    */
  get workflowExecution(): Prisma.WorkflowExecutionDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.desktopKv`: Exposes CRUD operations for the **DesktopKv** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more DesktopKvs
    * const desktopKvs = await prisma.desktopKv.findMany()
    * ```
    */
  get desktopKv(): Prisma.DesktopKvDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.desktopWorkspace`: Exposes CRUD operations for the **DesktopWorkspace** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more DesktopWorkspaces
    * const desktopWorkspaces = await prisma.desktopWorkspace.findMany()
    * ```
    */
  get desktopWorkspace(): Prisma.DesktopWorkspaceDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.desktopSyncJob`: Exposes CRUD operations for the **DesktopSyncJob** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more DesktopSyncJobs
    * const desktopSyncJobs = await prisma.desktopSyncJob.findMany()
    * ```
    */
  get desktopSyncJob(): Prisma.DesktopSyncJobDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.desktopRecentItem`: Exposes CRUD operations for the **DesktopRecentItem** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more DesktopRecentItems
    * const desktopRecentItems = await prisma.desktopRecentItem.findMany()
    * ```
    */
  get desktopRecentItem(): Prisma.DesktopRecentItemDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 7.8.0
   * Query Engine version: 3c6e192761c0362d496ed980de936e2f3cebcd3a
   */
  export type PrismaVersion = {
    client: string
    engine: string
  }

  export const prismaVersion: PrismaVersion

  /**
   * Utility Types
   */


  export import Bytes = runtime.Bytes
  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? P : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    User: 'User',
    Organization: 'Organization',
    Post: 'Post',
    Ingredient: 'Ingredient',
    Trend: 'Trend',
    AgentStrategy: 'AgentStrategy',
    Workflow: 'Workflow',
    WorkflowExecution: 'WorkflowExecution',
    DesktopKv: 'DesktopKv',
    DesktopWorkspace: 'DesktopWorkspace',
    DesktopSyncJob: 'DesktopSyncJob',
    DesktopRecentItem: 'DesktopRecentItem'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]



  interface TypeMapCb<ClientOptions = {}> extends $Utils.Fn<{extArgs: $Extensions.InternalArgs }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], ClientOptions extends { omit: infer OmitOptions } ? OmitOptions : {}>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> = {
    globalOmitOptions: {
      omit: GlobalOmitOptions
    }
    meta: {
      modelProps: "user" | "organization" | "post" | "ingredient" | "trend" | "agentStrategy" | "workflow" | "workflowExecution" | "desktopKv" | "desktopWorkspace" | "desktopSyncJob" | "desktopRecentItem"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      User: {
        payload: Prisma.$UserPayload<ExtArgs>
        fields: Prisma.UserFieldRefs
        operations: {
          findUnique: {
            args: Prisma.UserFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.UserFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          findFirst: {
            args: Prisma.UserFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.UserFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          findMany: {
            args: Prisma.UserFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>[]
          }
          create: {
            args: Prisma.UserCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          createMany: {
            args: Prisma.UserCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.UserCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>[]
          }
          delete: {
            args: Prisma.UserDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          update: {
            args: Prisma.UserUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          deleteMany: {
            args: Prisma.UserDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.UserUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.UserUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>[]
          }
          upsert: {
            args: Prisma.UserUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          aggregate: {
            args: Prisma.UserAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateUser>
          }
          groupBy: {
            args: Prisma.UserGroupByArgs<ExtArgs>
            result: $Utils.Optional<UserGroupByOutputType>[]
          }
          count: {
            args: Prisma.UserCountArgs<ExtArgs>
            result: $Utils.Optional<UserCountAggregateOutputType> | number
          }
        }
      }
      Organization: {
        payload: Prisma.$OrganizationPayload<ExtArgs>
        fields: Prisma.OrganizationFieldRefs
        operations: {
          findUnique: {
            args: Prisma.OrganizationFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.OrganizationFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload>
          }
          findFirst: {
            args: Prisma.OrganizationFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.OrganizationFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload>
          }
          findMany: {
            args: Prisma.OrganizationFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload>[]
          }
          create: {
            args: Prisma.OrganizationCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload>
          }
          createMany: {
            args: Prisma.OrganizationCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.OrganizationCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload>[]
          }
          delete: {
            args: Prisma.OrganizationDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload>
          }
          update: {
            args: Prisma.OrganizationUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload>
          }
          deleteMany: {
            args: Prisma.OrganizationDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.OrganizationUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.OrganizationUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload>[]
          }
          upsert: {
            args: Prisma.OrganizationUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload>
          }
          aggregate: {
            args: Prisma.OrganizationAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateOrganization>
          }
          groupBy: {
            args: Prisma.OrganizationGroupByArgs<ExtArgs>
            result: $Utils.Optional<OrganizationGroupByOutputType>[]
          }
          count: {
            args: Prisma.OrganizationCountArgs<ExtArgs>
            result: $Utils.Optional<OrganizationCountAggregateOutputType> | number
          }
        }
      }
      Post: {
        payload: Prisma.$PostPayload<ExtArgs>
        fields: Prisma.PostFieldRefs
        operations: {
          findUnique: {
            args: Prisma.PostFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PostPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.PostFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PostPayload>
          }
          findFirst: {
            args: Prisma.PostFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PostPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.PostFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PostPayload>
          }
          findMany: {
            args: Prisma.PostFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PostPayload>[]
          }
          create: {
            args: Prisma.PostCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PostPayload>
          }
          createMany: {
            args: Prisma.PostCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.PostCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PostPayload>[]
          }
          delete: {
            args: Prisma.PostDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PostPayload>
          }
          update: {
            args: Prisma.PostUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PostPayload>
          }
          deleteMany: {
            args: Prisma.PostDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.PostUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.PostUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PostPayload>[]
          }
          upsert: {
            args: Prisma.PostUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PostPayload>
          }
          aggregate: {
            args: Prisma.PostAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregatePost>
          }
          groupBy: {
            args: Prisma.PostGroupByArgs<ExtArgs>
            result: $Utils.Optional<PostGroupByOutputType>[]
          }
          count: {
            args: Prisma.PostCountArgs<ExtArgs>
            result: $Utils.Optional<PostCountAggregateOutputType> | number
          }
        }
      }
      Ingredient: {
        payload: Prisma.$IngredientPayload<ExtArgs>
        fields: Prisma.IngredientFieldRefs
        operations: {
          findUnique: {
            args: Prisma.IngredientFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IngredientPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.IngredientFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IngredientPayload>
          }
          findFirst: {
            args: Prisma.IngredientFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IngredientPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.IngredientFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IngredientPayload>
          }
          findMany: {
            args: Prisma.IngredientFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IngredientPayload>[]
          }
          create: {
            args: Prisma.IngredientCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IngredientPayload>
          }
          createMany: {
            args: Prisma.IngredientCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.IngredientCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IngredientPayload>[]
          }
          delete: {
            args: Prisma.IngredientDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IngredientPayload>
          }
          update: {
            args: Prisma.IngredientUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IngredientPayload>
          }
          deleteMany: {
            args: Prisma.IngredientDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.IngredientUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.IngredientUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IngredientPayload>[]
          }
          upsert: {
            args: Prisma.IngredientUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IngredientPayload>
          }
          aggregate: {
            args: Prisma.IngredientAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateIngredient>
          }
          groupBy: {
            args: Prisma.IngredientGroupByArgs<ExtArgs>
            result: $Utils.Optional<IngredientGroupByOutputType>[]
          }
          count: {
            args: Prisma.IngredientCountArgs<ExtArgs>
            result: $Utils.Optional<IngredientCountAggregateOutputType> | number
          }
        }
      }
      Trend: {
        payload: Prisma.$TrendPayload<ExtArgs>
        fields: Prisma.TrendFieldRefs
        operations: {
          findUnique: {
            args: Prisma.TrendFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TrendPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.TrendFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TrendPayload>
          }
          findFirst: {
            args: Prisma.TrendFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TrendPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.TrendFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TrendPayload>
          }
          findMany: {
            args: Prisma.TrendFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TrendPayload>[]
          }
          create: {
            args: Prisma.TrendCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TrendPayload>
          }
          createMany: {
            args: Prisma.TrendCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.TrendCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TrendPayload>[]
          }
          delete: {
            args: Prisma.TrendDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TrendPayload>
          }
          update: {
            args: Prisma.TrendUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TrendPayload>
          }
          deleteMany: {
            args: Prisma.TrendDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.TrendUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.TrendUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TrendPayload>[]
          }
          upsert: {
            args: Prisma.TrendUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TrendPayload>
          }
          aggregate: {
            args: Prisma.TrendAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateTrend>
          }
          groupBy: {
            args: Prisma.TrendGroupByArgs<ExtArgs>
            result: $Utils.Optional<TrendGroupByOutputType>[]
          }
          count: {
            args: Prisma.TrendCountArgs<ExtArgs>
            result: $Utils.Optional<TrendCountAggregateOutputType> | number
          }
        }
      }
      AgentStrategy: {
        payload: Prisma.$AgentStrategyPayload<ExtArgs>
        fields: Prisma.AgentStrategyFieldRefs
        operations: {
          findUnique: {
            args: Prisma.AgentStrategyFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AgentStrategyPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.AgentStrategyFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AgentStrategyPayload>
          }
          findFirst: {
            args: Prisma.AgentStrategyFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AgentStrategyPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.AgentStrategyFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AgentStrategyPayload>
          }
          findMany: {
            args: Prisma.AgentStrategyFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AgentStrategyPayload>[]
          }
          create: {
            args: Prisma.AgentStrategyCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AgentStrategyPayload>
          }
          createMany: {
            args: Prisma.AgentStrategyCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.AgentStrategyCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AgentStrategyPayload>[]
          }
          delete: {
            args: Prisma.AgentStrategyDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AgentStrategyPayload>
          }
          update: {
            args: Prisma.AgentStrategyUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AgentStrategyPayload>
          }
          deleteMany: {
            args: Prisma.AgentStrategyDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.AgentStrategyUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.AgentStrategyUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AgentStrategyPayload>[]
          }
          upsert: {
            args: Prisma.AgentStrategyUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AgentStrategyPayload>
          }
          aggregate: {
            args: Prisma.AgentStrategyAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateAgentStrategy>
          }
          groupBy: {
            args: Prisma.AgentStrategyGroupByArgs<ExtArgs>
            result: $Utils.Optional<AgentStrategyGroupByOutputType>[]
          }
          count: {
            args: Prisma.AgentStrategyCountArgs<ExtArgs>
            result: $Utils.Optional<AgentStrategyCountAggregateOutputType> | number
          }
        }
      }
      Workflow: {
        payload: Prisma.$WorkflowPayload<ExtArgs>
        fields: Prisma.WorkflowFieldRefs
        operations: {
          findUnique: {
            args: Prisma.WorkflowFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkflowPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.WorkflowFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkflowPayload>
          }
          findFirst: {
            args: Prisma.WorkflowFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkflowPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.WorkflowFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkflowPayload>
          }
          findMany: {
            args: Prisma.WorkflowFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkflowPayload>[]
          }
          create: {
            args: Prisma.WorkflowCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkflowPayload>
          }
          createMany: {
            args: Prisma.WorkflowCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.WorkflowCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkflowPayload>[]
          }
          delete: {
            args: Prisma.WorkflowDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkflowPayload>
          }
          update: {
            args: Prisma.WorkflowUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkflowPayload>
          }
          deleteMany: {
            args: Prisma.WorkflowDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.WorkflowUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.WorkflowUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkflowPayload>[]
          }
          upsert: {
            args: Prisma.WorkflowUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkflowPayload>
          }
          aggregate: {
            args: Prisma.WorkflowAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateWorkflow>
          }
          groupBy: {
            args: Prisma.WorkflowGroupByArgs<ExtArgs>
            result: $Utils.Optional<WorkflowGroupByOutputType>[]
          }
          count: {
            args: Prisma.WorkflowCountArgs<ExtArgs>
            result: $Utils.Optional<WorkflowCountAggregateOutputType> | number
          }
        }
      }
      WorkflowExecution: {
        payload: Prisma.$WorkflowExecutionPayload<ExtArgs>
        fields: Prisma.WorkflowExecutionFieldRefs
        operations: {
          findUnique: {
            args: Prisma.WorkflowExecutionFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkflowExecutionPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.WorkflowExecutionFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkflowExecutionPayload>
          }
          findFirst: {
            args: Prisma.WorkflowExecutionFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkflowExecutionPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.WorkflowExecutionFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkflowExecutionPayload>
          }
          findMany: {
            args: Prisma.WorkflowExecutionFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkflowExecutionPayload>[]
          }
          create: {
            args: Prisma.WorkflowExecutionCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkflowExecutionPayload>
          }
          createMany: {
            args: Prisma.WorkflowExecutionCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.WorkflowExecutionCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkflowExecutionPayload>[]
          }
          delete: {
            args: Prisma.WorkflowExecutionDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkflowExecutionPayload>
          }
          update: {
            args: Prisma.WorkflowExecutionUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkflowExecutionPayload>
          }
          deleteMany: {
            args: Prisma.WorkflowExecutionDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.WorkflowExecutionUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.WorkflowExecutionUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkflowExecutionPayload>[]
          }
          upsert: {
            args: Prisma.WorkflowExecutionUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkflowExecutionPayload>
          }
          aggregate: {
            args: Prisma.WorkflowExecutionAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateWorkflowExecution>
          }
          groupBy: {
            args: Prisma.WorkflowExecutionGroupByArgs<ExtArgs>
            result: $Utils.Optional<WorkflowExecutionGroupByOutputType>[]
          }
          count: {
            args: Prisma.WorkflowExecutionCountArgs<ExtArgs>
            result: $Utils.Optional<WorkflowExecutionCountAggregateOutputType> | number
          }
        }
      }
      DesktopKv: {
        payload: Prisma.$DesktopKvPayload<ExtArgs>
        fields: Prisma.DesktopKvFieldRefs
        operations: {
          findUnique: {
            args: Prisma.DesktopKvFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopKvPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.DesktopKvFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopKvPayload>
          }
          findFirst: {
            args: Prisma.DesktopKvFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopKvPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.DesktopKvFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopKvPayload>
          }
          findMany: {
            args: Prisma.DesktopKvFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopKvPayload>[]
          }
          create: {
            args: Prisma.DesktopKvCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopKvPayload>
          }
          createMany: {
            args: Prisma.DesktopKvCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.DesktopKvCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopKvPayload>[]
          }
          delete: {
            args: Prisma.DesktopKvDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopKvPayload>
          }
          update: {
            args: Prisma.DesktopKvUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopKvPayload>
          }
          deleteMany: {
            args: Prisma.DesktopKvDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.DesktopKvUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.DesktopKvUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopKvPayload>[]
          }
          upsert: {
            args: Prisma.DesktopKvUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopKvPayload>
          }
          aggregate: {
            args: Prisma.DesktopKvAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateDesktopKv>
          }
          groupBy: {
            args: Prisma.DesktopKvGroupByArgs<ExtArgs>
            result: $Utils.Optional<DesktopKvGroupByOutputType>[]
          }
          count: {
            args: Prisma.DesktopKvCountArgs<ExtArgs>
            result: $Utils.Optional<DesktopKvCountAggregateOutputType> | number
          }
        }
      }
      DesktopWorkspace: {
        payload: Prisma.$DesktopWorkspacePayload<ExtArgs>
        fields: Prisma.DesktopWorkspaceFieldRefs
        operations: {
          findUnique: {
            args: Prisma.DesktopWorkspaceFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopWorkspacePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.DesktopWorkspaceFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopWorkspacePayload>
          }
          findFirst: {
            args: Prisma.DesktopWorkspaceFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopWorkspacePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.DesktopWorkspaceFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopWorkspacePayload>
          }
          findMany: {
            args: Prisma.DesktopWorkspaceFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopWorkspacePayload>[]
          }
          create: {
            args: Prisma.DesktopWorkspaceCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopWorkspacePayload>
          }
          createMany: {
            args: Prisma.DesktopWorkspaceCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.DesktopWorkspaceCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopWorkspacePayload>[]
          }
          delete: {
            args: Prisma.DesktopWorkspaceDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopWorkspacePayload>
          }
          update: {
            args: Prisma.DesktopWorkspaceUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopWorkspacePayload>
          }
          deleteMany: {
            args: Prisma.DesktopWorkspaceDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.DesktopWorkspaceUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.DesktopWorkspaceUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopWorkspacePayload>[]
          }
          upsert: {
            args: Prisma.DesktopWorkspaceUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopWorkspacePayload>
          }
          aggregate: {
            args: Prisma.DesktopWorkspaceAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateDesktopWorkspace>
          }
          groupBy: {
            args: Prisma.DesktopWorkspaceGroupByArgs<ExtArgs>
            result: $Utils.Optional<DesktopWorkspaceGroupByOutputType>[]
          }
          count: {
            args: Prisma.DesktopWorkspaceCountArgs<ExtArgs>
            result: $Utils.Optional<DesktopWorkspaceCountAggregateOutputType> | number
          }
        }
      }
      DesktopSyncJob: {
        payload: Prisma.$DesktopSyncJobPayload<ExtArgs>
        fields: Prisma.DesktopSyncJobFieldRefs
        operations: {
          findUnique: {
            args: Prisma.DesktopSyncJobFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopSyncJobPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.DesktopSyncJobFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopSyncJobPayload>
          }
          findFirst: {
            args: Prisma.DesktopSyncJobFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopSyncJobPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.DesktopSyncJobFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopSyncJobPayload>
          }
          findMany: {
            args: Prisma.DesktopSyncJobFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopSyncJobPayload>[]
          }
          create: {
            args: Prisma.DesktopSyncJobCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopSyncJobPayload>
          }
          createMany: {
            args: Prisma.DesktopSyncJobCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.DesktopSyncJobCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopSyncJobPayload>[]
          }
          delete: {
            args: Prisma.DesktopSyncJobDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopSyncJobPayload>
          }
          update: {
            args: Prisma.DesktopSyncJobUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopSyncJobPayload>
          }
          deleteMany: {
            args: Prisma.DesktopSyncJobDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.DesktopSyncJobUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.DesktopSyncJobUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopSyncJobPayload>[]
          }
          upsert: {
            args: Prisma.DesktopSyncJobUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopSyncJobPayload>
          }
          aggregate: {
            args: Prisma.DesktopSyncJobAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateDesktopSyncJob>
          }
          groupBy: {
            args: Prisma.DesktopSyncJobGroupByArgs<ExtArgs>
            result: $Utils.Optional<DesktopSyncJobGroupByOutputType>[]
          }
          count: {
            args: Prisma.DesktopSyncJobCountArgs<ExtArgs>
            result: $Utils.Optional<DesktopSyncJobCountAggregateOutputType> | number
          }
        }
      }
      DesktopRecentItem: {
        payload: Prisma.$DesktopRecentItemPayload<ExtArgs>
        fields: Prisma.DesktopRecentItemFieldRefs
        operations: {
          findUnique: {
            args: Prisma.DesktopRecentItemFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopRecentItemPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.DesktopRecentItemFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopRecentItemPayload>
          }
          findFirst: {
            args: Prisma.DesktopRecentItemFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopRecentItemPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.DesktopRecentItemFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopRecentItemPayload>
          }
          findMany: {
            args: Prisma.DesktopRecentItemFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopRecentItemPayload>[]
          }
          create: {
            args: Prisma.DesktopRecentItemCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopRecentItemPayload>
          }
          createMany: {
            args: Prisma.DesktopRecentItemCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.DesktopRecentItemCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopRecentItemPayload>[]
          }
          delete: {
            args: Prisma.DesktopRecentItemDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopRecentItemPayload>
          }
          update: {
            args: Prisma.DesktopRecentItemUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopRecentItemPayload>
          }
          deleteMany: {
            args: Prisma.DesktopRecentItemDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.DesktopRecentItemUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.DesktopRecentItemUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopRecentItemPayload>[]
          }
          upsert: {
            args: Prisma.DesktopRecentItemUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DesktopRecentItemPayload>
          }
          aggregate: {
            args: Prisma.DesktopRecentItemAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateDesktopRecentItem>
          }
          groupBy: {
            args: Prisma.DesktopRecentItemGroupByArgs<ExtArgs>
            result: $Utils.Optional<DesktopRecentItemGroupByOutputType>[]
          }
          count: {
            args: Prisma.DesktopRecentItemCountArgs<ExtArgs>
            result: $Utils.Optional<DesktopRecentItemCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Shorthand for `emit: 'stdout'`
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events only
     * log: [
     *   { emit: 'event', level: 'query' },
     *   { emit: 'event', level: 'info' },
     *   { emit: 'event', level: 'warn' }
     *   { emit: 'event', level: 'error' }
     * ]
     * 
     * / Emit as events and log to stdout
     * og: [
     *  { emit: 'stdout', level: 'query' },
     *  { emit: 'stdout', level: 'info' },
     *  { emit: 'stdout', level: 'warn' }
     *  { emit: 'stdout', level: 'error' }
     * 
     * ```
     * Read more in our [docs](https://pris.ly/d/logging).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
    /**
     * Instance of a Driver Adapter, e.g., like one provided by `@prisma/adapter-planetscale`
     */
    adapter?: runtime.SqlDriverAdapterFactory
    /**
     * Prisma Accelerate URL allowing the client to connect through Accelerate instead of a direct database.
     */
    accelerateUrl?: string
    /**
     * Global configuration for omitting model fields by default.
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   omit: {
     *     user: {
     *       password: true
     *     }
     *   }
     * })
     * ```
     */
    omit?: Prisma.GlobalOmitConfig
    /**
     * SQL commenter plugins that add metadata to SQL queries as comments.
     * Comments follow the sqlcommenter format: https://google.github.io/sqlcommenter/
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   adapter,
     *   comments: [
     *     traceContext(),
     *     queryInsights(),
     *   ],
     * })
     * ```
     */
    comments?: runtime.SqlCommenterPlugin[]
  }
  export type GlobalOmitConfig = {
    user?: UserOmit
    organization?: OrganizationOmit
    post?: PostOmit
    ingredient?: IngredientOmit
    trend?: TrendOmit
    agentStrategy?: AgentStrategyOmit
    workflow?: WorkflowOmit
    workflowExecution?: WorkflowExecutionOmit
    desktopKv?: DesktopKvOmit
    desktopWorkspace?: DesktopWorkspaceOmit
    desktopSyncJob?: DesktopSyncJobOmit
    desktopRecentItem?: DesktopRecentItemOmit
  }

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type CheckIsLogLevel<T> = T extends LogLevel ? T : never;

  export type GetLogType<T> = CheckIsLogLevel<
    T extends LogDefinition ? T['level'] : T
  >;

  export type GetEvents<T extends any[]> = T extends Array<LogLevel | LogDefinition>
    ? GetLogType<T[number]>
    : never;

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'updateManyAndReturn'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type OrganizationCountOutputType
   */

  export type OrganizationCountOutputType = {
    users: number
    posts: number
    trends: number
    ingredients: number
    agentStrategies: number
    workflows: number
  }

  export type OrganizationCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    users?: boolean | OrganizationCountOutputTypeCountUsersArgs
    posts?: boolean | OrganizationCountOutputTypeCountPostsArgs
    trends?: boolean | OrganizationCountOutputTypeCountTrendsArgs
    ingredients?: boolean | OrganizationCountOutputTypeCountIngredientsArgs
    agentStrategies?: boolean | OrganizationCountOutputTypeCountAgentStrategiesArgs
    workflows?: boolean | OrganizationCountOutputTypeCountWorkflowsArgs
  }

  // Custom InputTypes
  /**
   * OrganizationCountOutputType without action
   */
  export type OrganizationCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OrganizationCountOutputType
     */
    select?: OrganizationCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * OrganizationCountOutputType without action
   */
  export type OrganizationCountOutputTypeCountUsersArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: UserWhereInput
  }

  /**
   * OrganizationCountOutputType without action
   */
  export type OrganizationCountOutputTypeCountPostsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: PostWhereInput
  }

  /**
   * OrganizationCountOutputType without action
   */
  export type OrganizationCountOutputTypeCountTrendsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TrendWhereInput
  }

  /**
   * OrganizationCountOutputType without action
   */
  export type OrganizationCountOutputTypeCountIngredientsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: IngredientWhereInput
  }

  /**
   * OrganizationCountOutputType without action
   */
  export type OrganizationCountOutputTypeCountAgentStrategiesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: AgentStrategyWhereInput
  }

  /**
   * OrganizationCountOutputType without action
   */
  export type OrganizationCountOutputTypeCountWorkflowsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: WorkflowWhereInput
  }


  /**
   * Count Type AgentStrategyCountOutputType
   */

  export type AgentStrategyCountOutputType = {
    workflows: number
  }

  export type AgentStrategyCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workflows?: boolean | AgentStrategyCountOutputTypeCountWorkflowsArgs
  }

  // Custom InputTypes
  /**
   * AgentStrategyCountOutputType without action
   */
  export type AgentStrategyCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AgentStrategyCountOutputType
     */
    select?: AgentStrategyCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * AgentStrategyCountOutputType without action
   */
  export type AgentStrategyCountOutputTypeCountWorkflowsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: WorkflowExecutionWhereInput
  }


  /**
   * Count Type WorkflowCountOutputType
   */

  export type WorkflowCountOutputType = {
    executions: number
  }

  export type WorkflowCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    executions?: boolean | WorkflowCountOutputTypeCountExecutionsArgs
  }

  // Custom InputTypes
  /**
   * WorkflowCountOutputType without action
   */
  export type WorkflowCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowCountOutputType
     */
    select?: WorkflowCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * WorkflowCountOutputType without action
   */
  export type WorkflowCountOutputTypeCountExecutionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: WorkflowExecutionWhereInput
  }


  /**
   * Models
   */

  /**
   * Model User
   */

  export type AggregateUser = {
    _count: UserCountAggregateOutputType | null
    _min: UserMinAggregateOutputType | null
    _max: UserMaxAggregateOutputType | null
  }

  export type UserMinAggregateOutputType = {
    id: string | null
    organizationId: string | null
    clerkId: string | null
    email: string | null
    name: string | null
    createdAt: string | null
    updatedAt: string | null
  }

  export type UserMaxAggregateOutputType = {
    id: string | null
    organizationId: string | null
    clerkId: string | null
    email: string | null
    name: string | null
    createdAt: string | null
    updatedAt: string | null
  }

  export type UserCountAggregateOutputType = {
    id: number
    organizationId: number
    clerkId: number
    email: number
    name: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type UserMinAggregateInputType = {
    id?: true
    organizationId?: true
    clerkId?: true
    email?: true
    name?: true
    createdAt?: true
    updatedAt?: true
  }

  export type UserMaxAggregateInputType = {
    id?: true
    organizationId?: true
    clerkId?: true
    email?: true
    name?: true
    createdAt?: true
    updatedAt?: true
  }

  export type UserCountAggregateInputType = {
    id?: true
    organizationId?: true
    clerkId?: true
    email?: true
    name?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type UserAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which User to aggregate.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Users
    **/
    _count?: true | UserCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: UserMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: UserMaxAggregateInputType
  }

  export type GetUserAggregateType<T extends UserAggregateArgs> = {
        [P in keyof T & keyof AggregateUser]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateUser[P]>
      : GetScalarType<T[P], AggregateUser[P]>
  }




  export type UserGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: UserWhereInput
    orderBy?: UserOrderByWithAggregationInput | UserOrderByWithAggregationInput[]
    by: UserScalarFieldEnum[] | UserScalarFieldEnum
    having?: UserScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: UserCountAggregateInputType | true
    _min?: UserMinAggregateInputType
    _max?: UserMaxAggregateInputType
  }

  export type UserGroupByOutputType = {
    id: string
    organizationId: string
    clerkId: string | null
    email: string | null
    name: string
    createdAt: string
    updatedAt: string
    _count: UserCountAggregateOutputType | null
    _min: UserMinAggregateOutputType | null
    _max: UserMaxAggregateOutputType | null
  }

  type GetUserGroupByPayload<T extends UserGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<UserGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof UserGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], UserGroupByOutputType[P]>
            : GetScalarType<T[P], UserGroupByOutputType[P]>
        }
      >
    >


  export type UserSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    organizationId?: boolean
    clerkId?: boolean
    email?: boolean
    name?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["user"]>

  export type UserSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    organizationId?: boolean
    clerkId?: boolean
    email?: boolean
    name?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["user"]>

  export type UserSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    organizationId?: boolean
    clerkId?: boolean
    email?: boolean
    name?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["user"]>

  export type UserSelectScalar = {
    id?: boolean
    organizationId?: boolean
    clerkId?: boolean
    email?: boolean
    name?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type UserOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "organizationId" | "clerkId" | "email" | "name" | "createdAt" | "updatedAt", ExtArgs["result"]["user"]>
  export type UserInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }
  export type UserIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }
  export type UserIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }

  export type $UserPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "User"
    objects: {
      organization: Prisma.$OrganizationPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      organizationId: string
      clerkId: string | null
      email: string | null
      name: string
      createdAt: string
      updatedAt: string
    }, ExtArgs["result"]["user"]>
    composites: {}
  }

  type UserGetPayload<S extends boolean | null | undefined | UserDefaultArgs> = $Result.GetResult<Prisma.$UserPayload, S>

  type UserCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<UserFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: UserCountAggregateInputType | true
    }

  export interface UserDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['User'], meta: { name: 'User' } }
    /**
     * Find zero or one User that matches the filter.
     * @param {UserFindUniqueArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends UserFindUniqueArgs>(args: SelectSubset<T, UserFindUniqueArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one User that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {UserFindUniqueOrThrowArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends UserFindUniqueOrThrowArgs>(args: SelectSubset<T, UserFindUniqueOrThrowArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first User that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindFirstArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends UserFindFirstArgs>(args?: SelectSubset<T, UserFindFirstArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first User that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindFirstOrThrowArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends UserFindFirstOrThrowArgs>(args?: SelectSubset<T, UserFindFirstOrThrowArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Users that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Users
     * const users = await prisma.user.findMany()
     * 
     * // Get first 10 Users
     * const users = await prisma.user.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const userWithIdOnly = await prisma.user.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends UserFindManyArgs>(args?: SelectSubset<T, UserFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a User.
     * @param {UserCreateArgs} args - Arguments to create a User.
     * @example
     * // Create one User
     * const User = await prisma.user.create({
     *   data: {
     *     // ... data to create a User
     *   }
     * })
     * 
     */
    create<T extends UserCreateArgs>(args: SelectSubset<T, UserCreateArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Users.
     * @param {UserCreateManyArgs} args - Arguments to create many Users.
     * @example
     * // Create many Users
     * const user = await prisma.user.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends UserCreateManyArgs>(args?: SelectSubset<T, UserCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Users and returns the data saved in the database.
     * @param {UserCreateManyAndReturnArgs} args - Arguments to create many Users.
     * @example
     * // Create many Users
     * const user = await prisma.user.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Users and only return the `id`
     * const userWithIdOnly = await prisma.user.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends UserCreateManyAndReturnArgs>(args?: SelectSubset<T, UserCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a User.
     * @param {UserDeleteArgs} args - Arguments to delete one User.
     * @example
     * // Delete one User
     * const User = await prisma.user.delete({
     *   where: {
     *     // ... filter to delete one User
     *   }
     * })
     * 
     */
    delete<T extends UserDeleteArgs>(args: SelectSubset<T, UserDeleteArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one User.
     * @param {UserUpdateArgs} args - Arguments to update one User.
     * @example
     * // Update one User
     * const user = await prisma.user.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends UserUpdateArgs>(args: SelectSubset<T, UserUpdateArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Users.
     * @param {UserDeleteManyArgs} args - Arguments to filter Users to delete.
     * @example
     * // Delete a few Users
     * const { count } = await prisma.user.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends UserDeleteManyArgs>(args?: SelectSubset<T, UserDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Users.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Users
     * const user = await prisma.user.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends UserUpdateManyArgs>(args: SelectSubset<T, UserUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Users and returns the data updated in the database.
     * @param {UserUpdateManyAndReturnArgs} args - Arguments to update many Users.
     * @example
     * // Update many Users
     * const user = await prisma.user.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Users and only return the `id`
     * const userWithIdOnly = await prisma.user.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends UserUpdateManyAndReturnArgs>(args: SelectSubset<T, UserUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one User.
     * @param {UserUpsertArgs} args - Arguments to update or create a User.
     * @example
     * // Update or create a User
     * const user = await prisma.user.upsert({
     *   create: {
     *     // ... data to create a User
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the User we want to update
     *   }
     * })
     */
    upsert<T extends UserUpsertArgs>(args: SelectSubset<T, UserUpsertArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Users.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserCountArgs} args - Arguments to filter Users to count.
     * @example
     * // Count the number of Users
     * const count = await prisma.user.count({
     *   where: {
     *     // ... the filter for the Users we want to count
     *   }
     * })
    **/
    count<T extends UserCountArgs>(
      args?: Subset<T, UserCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], UserCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a User.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends UserAggregateArgs>(args: Subset<T, UserAggregateArgs>): Prisma.PrismaPromise<GetUserAggregateType<T>>

    /**
     * Group by User.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends UserGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: UserGroupByArgs['orderBy'] }
        : { orderBy?: UserGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, UserGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetUserGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the User model
   */
  readonly fields: UserFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for User.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__UserClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    organization<T extends OrganizationDefaultArgs<ExtArgs> = {}>(args?: Subset<T, OrganizationDefaultArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the User model
   */
  interface UserFieldRefs {
    readonly id: FieldRef<"User", 'String'>
    readonly organizationId: FieldRef<"User", 'String'>
    readonly clerkId: FieldRef<"User", 'String'>
    readonly email: FieldRef<"User", 'String'>
    readonly name: FieldRef<"User", 'String'>
    readonly createdAt: FieldRef<"User", 'String'>
    readonly updatedAt: FieldRef<"User", 'String'>
  }
    

  // Custom InputTypes
  /**
   * User findUnique
   */
  export type UserFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User findUniqueOrThrow
   */
  export type UserFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User findFirst
   */
  export type UserFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Users.
     */
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User findFirstOrThrow
   */
  export type UserFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Users.
     */
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User findMany
   */
  export type UserFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which Users to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Users.
     */
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User create
   */
  export type UserCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * The data needed to create a User.
     */
    data: XOR<UserCreateInput, UserUncheckedCreateInput>
  }

  /**
   * User createMany
   */
  export type UserCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Users.
     */
    data: UserCreateManyInput | UserCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * User createManyAndReturn
   */
  export type UserCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * The data used to create many Users.
     */
    data: UserCreateManyInput | UserCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * User update
   */
  export type UserUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * The data needed to update a User.
     */
    data: XOR<UserUpdateInput, UserUncheckedUpdateInput>
    /**
     * Choose, which User to update.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User updateMany
   */
  export type UserUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Users.
     */
    data: XOR<UserUpdateManyMutationInput, UserUncheckedUpdateManyInput>
    /**
     * Filter which Users to update
     */
    where?: UserWhereInput
    /**
     * Limit how many Users to update.
     */
    limit?: number
  }

  /**
   * User updateManyAndReturn
   */
  export type UserUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * The data used to update Users.
     */
    data: XOR<UserUpdateManyMutationInput, UserUncheckedUpdateManyInput>
    /**
     * Filter which Users to update
     */
    where?: UserWhereInput
    /**
     * Limit how many Users to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * User upsert
   */
  export type UserUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * The filter to search for the User to update in case it exists.
     */
    where: UserWhereUniqueInput
    /**
     * In case the User found by the `where` argument doesn't exist, create a new User with this data.
     */
    create: XOR<UserCreateInput, UserUncheckedCreateInput>
    /**
     * In case the User was found with the provided `where` argument, update it with this data.
     */
    update: XOR<UserUpdateInput, UserUncheckedUpdateInput>
  }

  /**
   * User delete
   */
  export type UserDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter which User to delete.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User deleteMany
   */
  export type UserDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Users to delete
     */
    where?: UserWhereInput
    /**
     * Limit how many Users to delete.
     */
    limit?: number
  }

  /**
   * User without action
   */
  export type UserDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
  }


  /**
   * Model Organization
   */

  export type AggregateOrganization = {
    _count: OrganizationCountAggregateOutputType | null
    _min: OrganizationMinAggregateOutputType | null
    _max: OrganizationMaxAggregateOutputType | null
  }

  export type OrganizationMinAggregateOutputType = {
    id: string | null
    name: string | null
    slug: string | null
    createdAt: string | null
    updatedAt: string | null
  }

  export type OrganizationMaxAggregateOutputType = {
    id: string | null
    name: string | null
    slug: string | null
    createdAt: string | null
    updatedAt: string | null
  }

  export type OrganizationCountAggregateOutputType = {
    id: number
    name: number
    slug: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type OrganizationMinAggregateInputType = {
    id?: true
    name?: true
    slug?: true
    createdAt?: true
    updatedAt?: true
  }

  export type OrganizationMaxAggregateInputType = {
    id?: true
    name?: true
    slug?: true
    createdAt?: true
    updatedAt?: true
  }

  export type OrganizationCountAggregateInputType = {
    id?: true
    name?: true
    slug?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type OrganizationAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Organization to aggregate.
     */
    where?: OrganizationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Organizations to fetch.
     */
    orderBy?: OrganizationOrderByWithRelationInput | OrganizationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: OrganizationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Organizations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Organizations.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Organizations
    **/
    _count?: true | OrganizationCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: OrganizationMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: OrganizationMaxAggregateInputType
  }

  export type GetOrganizationAggregateType<T extends OrganizationAggregateArgs> = {
        [P in keyof T & keyof AggregateOrganization]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateOrganization[P]>
      : GetScalarType<T[P], AggregateOrganization[P]>
  }




  export type OrganizationGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: OrganizationWhereInput
    orderBy?: OrganizationOrderByWithAggregationInput | OrganizationOrderByWithAggregationInput[]
    by: OrganizationScalarFieldEnum[] | OrganizationScalarFieldEnum
    having?: OrganizationScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: OrganizationCountAggregateInputType | true
    _min?: OrganizationMinAggregateInputType
    _max?: OrganizationMaxAggregateInputType
  }

  export type OrganizationGroupByOutputType = {
    id: string
    name: string
    slug: string
    createdAt: string
    updatedAt: string
    _count: OrganizationCountAggregateOutputType | null
    _min: OrganizationMinAggregateOutputType | null
    _max: OrganizationMaxAggregateOutputType | null
  }

  type GetOrganizationGroupByPayload<T extends OrganizationGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<OrganizationGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof OrganizationGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], OrganizationGroupByOutputType[P]>
            : GetScalarType<T[P], OrganizationGroupByOutputType[P]>
        }
      >
    >


  export type OrganizationSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    slug?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    users?: boolean | Organization$usersArgs<ExtArgs>
    posts?: boolean | Organization$postsArgs<ExtArgs>
    trends?: boolean | Organization$trendsArgs<ExtArgs>
    ingredients?: boolean | Organization$ingredientsArgs<ExtArgs>
    agentStrategies?: boolean | Organization$agentStrategiesArgs<ExtArgs>
    workflows?: boolean | Organization$workflowsArgs<ExtArgs>
    _count?: boolean | OrganizationCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["organization"]>

  export type OrganizationSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    slug?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["organization"]>

  export type OrganizationSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    slug?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["organization"]>

  export type OrganizationSelectScalar = {
    id?: boolean
    name?: boolean
    slug?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type OrganizationOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "name" | "slug" | "createdAt" | "updatedAt", ExtArgs["result"]["organization"]>
  export type OrganizationInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    users?: boolean | Organization$usersArgs<ExtArgs>
    posts?: boolean | Organization$postsArgs<ExtArgs>
    trends?: boolean | Organization$trendsArgs<ExtArgs>
    ingredients?: boolean | Organization$ingredientsArgs<ExtArgs>
    agentStrategies?: boolean | Organization$agentStrategiesArgs<ExtArgs>
    workflows?: boolean | Organization$workflowsArgs<ExtArgs>
    _count?: boolean | OrganizationCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type OrganizationIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}
  export type OrganizationIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $OrganizationPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Organization"
    objects: {
      users: Prisma.$UserPayload<ExtArgs>[]
      posts: Prisma.$PostPayload<ExtArgs>[]
      trends: Prisma.$TrendPayload<ExtArgs>[]
      ingredients: Prisma.$IngredientPayload<ExtArgs>[]
      agentStrategies: Prisma.$AgentStrategyPayload<ExtArgs>[]
      workflows: Prisma.$WorkflowPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      name: string
      slug: string
      createdAt: string
      updatedAt: string
    }, ExtArgs["result"]["organization"]>
    composites: {}
  }

  type OrganizationGetPayload<S extends boolean | null | undefined | OrganizationDefaultArgs> = $Result.GetResult<Prisma.$OrganizationPayload, S>

  type OrganizationCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<OrganizationFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: OrganizationCountAggregateInputType | true
    }

  export interface OrganizationDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Organization'], meta: { name: 'Organization' } }
    /**
     * Find zero or one Organization that matches the filter.
     * @param {OrganizationFindUniqueArgs} args - Arguments to find a Organization
     * @example
     * // Get one Organization
     * const organization = await prisma.organization.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends OrganizationFindUniqueArgs>(args: SelectSubset<T, OrganizationFindUniqueArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Organization that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {OrganizationFindUniqueOrThrowArgs} args - Arguments to find a Organization
     * @example
     * // Get one Organization
     * const organization = await prisma.organization.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends OrganizationFindUniqueOrThrowArgs>(args: SelectSubset<T, OrganizationFindUniqueOrThrowArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Organization that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationFindFirstArgs} args - Arguments to find a Organization
     * @example
     * // Get one Organization
     * const organization = await prisma.organization.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends OrganizationFindFirstArgs>(args?: SelectSubset<T, OrganizationFindFirstArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Organization that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationFindFirstOrThrowArgs} args - Arguments to find a Organization
     * @example
     * // Get one Organization
     * const organization = await prisma.organization.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends OrganizationFindFirstOrThrowArgs>(args?: SelectSubset<T, OrganizationFindFirstOrThrowArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Organizations that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Organizations
     * const organizations = await prisma.organization.findMany()
     * 
     * // Get first 10 Organizations
     * const organizations = await prisma.organization.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const organizationWithIdOnly = await prisma.organization.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends OrganizationFindManyArgs>(args?: SelectSubset<T, OrganizationFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Organization.
     * @param {OrganizationCreateArgs} args - Arguments to create a Organization.
     * @example
     * // Create one Organization
     * const Organization = await prisma.organization.create({
     *   data: {
     *     // ... data to create a Organization
     *   }
     * })
     * 
     */
    create<T extends OrganizationCreateArgs>(args: SelectSubset<T, OrganizationCreateArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Organizations.
     * @param {OrganizationCreateManyArgs} args - Arguments to create many Organizations.
     * @example
     * // Create many Organizations
     * const organization = await prisma.organization.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends OrganizationCreateManyArgs>(args?: SelectSubset<T, OrganizationCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Organizations and returns the data saved in the database.
     * @param {OrganizationCreateManyAndReturnArgs} args - Arguments to create many Organizations.
     * @example
     * // Create many Organizations
     * const organization = await prisma.organization.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Organizations and only return the `id`
     * const organizationWithIdOnly = await prisma.organization.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends OrganizationCreateManyAndReturnArgs>(args?: SelectSubset<T, OrganizationCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Organization.
     * @param {OrganizationDeleteArgs} args - Arguments to delete one Organization.
     * @example
     * // Delete one Organization
     * const Organization = await prisma.organization.delete({
     *   where: {
     *     // ... filter to delete one Organization
     *   }
     * })
     * 
     */
    delete<T extends OrganizationDeleteArgs>(args: SelectSubset<T, OrganizationDeleteArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Organization.
     * @param {OrganizationUpdateArgs} args - Arguments to update one Organization.
     * @example
     * // Update one Organization
     * const organization = await prisma.organization.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends OrganizationUpdateArgs>(args: SelectSubset<T, OrganizationUpdateArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Organizations.
     * @param {OrganizationDeleteManyArgs} args - Arguments to filter Organizations to delete.
     * @example
     * // Delete a few Organizations
     * const { count } = await prisma.organization.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends OrganizationDeleteManyArgs>(args?: SelectSubset<T, OrganizationDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Organizations.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Organizations
     * const organization = await prisma.organization.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends OrganizationUpdateManyArgs>(args: SelectSubset<T, OrganizationUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Organizations and returns the data updated in the database.
     * @param {OrganizationUpdateManyAndReturnArgs} args - Arguments to update many Organizations.
     * @example
     * // Update many Organizations
     * const organization = await prisma.organization.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Organizations and only return the `id`
     * const organizationWithIdOnly = await prisma.organization.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends OrganizationUpdateManyAndReturnArgs>(args: SelectSubset<T, OrganizationUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Organization.
     * @param {OrganizationUpsertArgs} args - Arguments to update or create a Organization.
     * @example
     * // Update or create a Organization
     * const organization = await prisma.organization.upsert({
     *   create: {
     *     // ... data to create a Organization
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Organization we want to update
     *   }
     * })
     */
    upsert<T extends OrganizationUpsertArgs>(args: SelectSubset<T, OrganizationUpsertArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Organizations.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationCountArgs} args - Arguments to filter Organizations to count.
     * @example
     * // Count the number of Organizations
     * const count = await prisma.organization.count({
     *   where: {
     *     // ... the filter for the Organizations we want to count
     *   }
     * })
    **/
    count<T extends OrganizationCountArgs>(
      args?: Subset<T, OrganizationCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], OrganizationCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Organization.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends OrganizationAggregateArgs>(args: Subset<T, OrganizationAggregateArgs>): Prisma.PrismaPromise<GetOrganizationAggregateType<T>>

    /**
     * Group by Organization.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends OrganizationGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: OrganizationGroupByArgs['orderBy'] }
        : { orderBy?: OrganizationGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, OrganizationGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetOrganizationGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Organization model
   */
  readonly fields: OrganizationFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Organization.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__OrganizationClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    users<T extends Organization$usersArgs<ExtArgs> = {}>(args?: Subset<T, Organization$usersArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    posts<T extends Organization$postsArgs<ExtArgs> = {}>(args?: Subset<T, Organization$postsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PostPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    trends<T extends Organization$trendsArgs<ExtArgs> = {}>(args?: Subset<T, Organization$trendsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TrendPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    ingredients<T extends Organization$ingredientsArgs<ExtArgs> = {}>(args?: Subset<T, Organization$ingredientsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$IngredientPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    agentStrategies<T extends Organization$agentStrategiesArgs<ExtArgs> = {}>(args?: Subset<T, Organization$agentStrategiesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AgentStrategyPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    workflows<T extends Organization$workflowsArgs<ExtArgs> = {}>(args?: Subset<T, Organization$workflowsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Organization model
   */
  interface OrganizationFieldRefs {
    readonly id: FieldRef<"Organization", 'String'>
    readonly name: FieldRef<"Organization", 'String'>
    readonly slug: FieldRef<"Organization", 'String'>
    readonly createdAt: FieldRef<"Organization", 'String'>
    readonly updatedAt: FieldRef<"Organization", 'String'>
  }
    

  // Custom InputTypes
  /**
   * Organization findUnique
   */
  export type OrganizationFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Organization
     */
    omit?: OrganizationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * Filter, which Organization to fetch.
     */
    where: OrganizationWhereUniqueInput
  }

  /**
   * Organization findUniqueOrThrow
   */
  export type OrganizationFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Organization
     */
    omit?: OrganizationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * Filter, which Organization to fetch.
     */
    where: OrganizationWhereUniqueInput
  }

  /**
   * Organization findFirst
   */
  export type OrganizationFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Organization
     */
    omit?: OrganizationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * Filter, which Organization to fetch.
     */
    where?: OrganizationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Organizations to fetch.
     */
    orderBy?: OrganizationOrderByWithRelationInput | OrganizationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Organizations.
     */
    cursor?: OrganizationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Organizations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Organizations.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Organizations.
     */
    distinct?: OrganizationScalarFieldEnum | OrganizationScalarFieldEnum[]
  }

  /**
   * Organization findFirstOrThrow
   */
  export type OrganizationFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Organization
     */
    omit?: OrganizationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * Filter, which Organization to fetch.
     */
    where?: OrganizationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Organizations to fetch.
     */
    orderBy?: OrganizationOrderByWithRelationInput | OrganizationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Organizations.
     */
    cursor?: OrganizationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Organizations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Organizations.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Organizations.
     */
    distinct?: OrganizationScalarFieldEnum | OrganizationScalarFieldEnum[]
  }

  /**
   * Organization findMany
   */
  export type OrganizationFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Organization
     */
    omit?: OrganizationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * Filter, which Organizations to fetch.
     */
    where?: OrganizationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Organizations to fetch.
     */
    orderBy?: OrganizationOrderByWithRelationInput | OrganizationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Organizations.
     */
    cursor?: OrganizationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Organizations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Organizations.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Organizations.
     */
    distinct?: OrganizationScalarFieldEnum | OrganizationScalarFieldEnum[]
  }

  /**
   * Organization create
   */
  export type OrganizationCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Organization
     */
    omit?: OrganizationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * The data needed to create a Organization.
     */
    data: XOR<OrganizationCreateInput, OrganizationUncheckedCreateInput>
  }

  /**
   * Organization createMany
   */
  export type OrganizationCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Organizations.
     */
    data: OrganizationCreateManyInput | OrganizationCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Organization createManyAndReturn
   */
  export type OrganizationCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Organization
     */
    omit?: OrganizationOmit<ExtArgs> | null
    /**
     * The data used to create many Organizations.
     */
    data: OrganizationCreateManyInput | OrganizationCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Organization update
   */
  export type OrganizationUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Organization
     */
    omit?: OrganizationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * The data needed to update a Organization.
     */
    data: XOR<OrganizationUpdateInput, OrganizationUncheckedUpdateInput>
    /**
     * Choose, which Organization to update.
     */
    where: OrganizationWhereUniqueInput
  }

  /**
   * Organization updateMany
   */
  export type OrganizationUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Organizations.
     */
    data: XOR<OrganizationUpdateManyMutationInput, OrganizationUncheckedUpdateManyInput>
    /**
     * Filter which Organizations to update
     */
    where?: OrganizationWhereInput
    /**
     * Limit how many Organizations to update.
     */
    limit?: number
  }

  /**
   * Organization updateManyAndReturn
   */
  export type OrganizationUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Organization
     */
    omit?: OrganizationOmit<ExtArgs> | null
    /**
     * The data used to update Organizations.
     */
    data: XOR<OrganizationUpdateManyMutationInput, OrganizationUncheckedUpdateManyInput>
    /**
     * Filter which Organizations to update
     */
    where?: OrganizationWhereInput
    /**
     * Limit how many Organizations to update.
     */
    limit?: number
  }

  /**
   * Organization upsert
   */
  export type OrganizationUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Organization
     */
    omit?: OrganizationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * The filter to search for the Organization to update in case it exists.
     */
    where: OrganizationWhereUniqueInput
    /**
     * In case the Organization found by the `where` argument doesn't exist, create a new Organization with this data.
     */
    create: XOR<OrganizationCreateInput, OrganizationUncheckedCreateInput>
    /**
     * In case the Organization was found with the provided `where` argument, update it with this data.
     */
    update: XOR<OrganizationUpdateInput, OrganizationUncheckedUpdateInput>
  }

  /**
   * Organization delete
   */
  export type OrganizationDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Organization
     */
    omit?: OrganizationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * Filter which Organization to delete.
     */
    where: OrganizationWhereUniqueInput
  }

  /**
   * Organization deleteMany
   */
  export type OrganizationDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Organizations to delete
     */
    where?: OrganizationWhereInput
    /**
     * Limit how many Organizations to delete.
     */
    limit?: number
  }

  /**
   * Organization.users
   */
  export type Organization$usersArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    where?: UserWhereInput
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    cursor?: UserWhereUniqueInput
    take?: number
    skip?: number
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * Organization.posts
   */
  export type Organization$postsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Post
     */
    select?: PostSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Post
     */
    omit?: PostOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PostInclude<ExtArgs> | null
    where?: PostWhereInput
    orderBy?: PostOrderByWithRelationInput | PostOrderByWithRelationInput[]
    cursor?: PostWhereUniqueInput
    take?: number
    skip?: number
    distinct?: PostScalarFieldEnum | PostScalarFieldEnum[]
  }

  /**
   * Organization.trends
   */
  export type Organization$trendsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Trend
     */
    select?: TrendSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Trend
     */
    omit?: TrendOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TrendInclude<ExtArgs> | null
    where?: TrendWhereInput
    orderBy?: TrendOrderByWithRelationInput | TrendOrderByWithRelationInput[]
    cursor?: TrendWhereUniqueInput
    take?: number
    skip?: number
    distinct?: TrendScalarFieldEnum | TrendScalarFieldEnum[]
  }

  /**
   * Organization.ingredients
   */
  export type Organization$ingredientsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Ingredient
     */
    select?: IngredientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Ingredient
     */
    omit?: IngredientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: IngredientInclude<ExtArgs> | null
    where?: IngredientWhereInput
    orderBy?: IngredientOrderByWithRelationInput | IngredientOrderByWithRelationInput[]
    cursor?: IngredientWhereUniqueInput
    take?: number
    skip?: number
    distinct?: IngredientScalarFieldEnum | IngredientScalarFieldEnum[]
  }

  /**
   * Organization.agentStrategies
   */
  export type Organization$agentStrategiesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AgentStrategy
     */
    select?: AgentStrategySelect<ExtArgs> | null
    /**
     * Omit specific fields from the AgentStrategy
     */
    omit?: AgentStrategyOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AgentStrategyInclude<ExtArgs> | null
    where?: AgentStrategyWhereInput
    orderBy?: AgentStrategyOrderByWithRelationInput | AgentStrategyOrderByWithRelationInput[]
    cursor?: AgentStrategyWhereUniqueInput
    take?: number
    skip?: number
    distinct?: AgentStrategyScalarFieldEnum | AgentStrategyScalarFieldEnum[]
  }

  /**
   * Organization.workflows
   */
  export type Organization$workflowsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workflow
     */
    select?: WorkflowSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workflow
     */
    omit?: WorkflowOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowInclude<ExtArgs> | null
    where?: WorkflowWhereInput
    orderBy?: WorkflowOrderByWithRelationInput | WorkflowOrderByWithRelationInput[]
    cursor?: WorkflowWhereUniqueInput
    take?: number
    skip?: number
    distinct?: WorkflowScalarFieldEnum | WorkflowScalarFieldEnum[]
  }

  /**
   * Organization without action
   */
  export type OrganizationDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Organization
     */
    omit?: OrganizationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
  }


  /**
   * Model Post
   */

  export type AggregatePost = {
    _count: PostCountAggregateOutputType | null
    _avg: PostAvgAggregateOutputType | null
    _sum: PostSumAggregateOutputType | null
    _min: PostMinAggregateOutputType | null
    _max: PostMaxAggregateOutputType | null
  }

  export type PostAvgAggregateOutputType = {
    views: number | null
    engagements: number | null
  }

  export type PostSumAggregateOutputType = {
    views: number | null
    engagements: number | null
  }

  export type PostMinAggregateOutputType = {
    id: string | null
    organizationId: string | null
    workspaceId: string | null
    platform: string | null
    type: string | null
    prompt: string | null
    content: string | null
    status: string | null
    publishIntent: string | null
    sourceDraftId: string | null
    sourceTrendId: string | null
    sourceTrendTopic: string | null
    publishedAt: string | null
    views: number | null
    engagements: number | null
    createdAt: string | null
    updatedAt: string | null
  }

  export type PostMaxAggregateOutputType = {
    id: string | null
    organizationId: string | null
    workspaceId: string | null
    platform: string | null
    type: string | null
    prompt: string | null
    content: string | null
    status: string | null
    publishIntent: string | null
    sourceDraftId: string | null
    sourceTrendId: string | null
    sourceTrendTopic: string | null
    publishedAt: string | null
    views: number | null
    engagements: number | null
    createdAt: string | null
    updatedAt: string | null
  }

  export type PostCountAggregateOutputType = {
    id: number
    organizationId: number
    workspaceId: number
    platform: number
    type: number
    prompt: number
    content: number
    status: number
    publishIntent: number
    sourceDraftId: number
    sourceTrendId: number
    sourceTrendTopic: number
    publishedAt: number
    views: number
    engagements: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type PostAvgAggregateInputType = {
    views?: true
    engagements?: true
  }

  export type PostSumAggregateInputType = {
    views?: true
    engagements?: true
  }

  export type PostMinAggregateInputType = {
    id?: true
    organizationId?: true
    workspaceId?: true
    platform?: true
    type?: true
    prompt?: true
    content?: true
    status?: true
    publishIntent?: true
    sourceDraftId?: true
    sourceTrendId?: true
    sourceTrendTopic?: true
    publishedAt?: true
    views?: true
    engagements?: true
    createdAt?: true
    updatedAt?: true
  }

  export type PostMaxAggregateInputType = {
    id?: true
    organizationId?: true
    workspaceId?: true
    platform?: true
    type?: true
    prompt?: true
    content?: true
    status?: true
    publishIntent?: true
    sourceDraftId?: true
    sourceTrendId?: true
    sourceTrendTopic?: true
    publishedAt?: true
    views?: true
    engagements?: true
    createdAt?: true
    updatedAt?: true
  }

  export type PostCountAggregateInputType = {
    id?: true
    organizationId?: true
    workspaceId?: true
    platform?: true
    type?: true
    prompt?: true
    content?: true
    status?: true
    publishIntent?: true
    sourceDraftId?: true
    sourceTrendId?: true
    sourceTrendTopic?: true
    publishedAt?: true
    views?: true
    engagements?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type PostAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Post to aggregate.
     */
    where?: PostWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Posts to fetch.
     */
    orderBy?: PostOrderByWithRelationInput | PostOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: PostWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Posts from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Posts.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Posts
    **/
    _count?: true | PostCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: PostAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: PostSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: PostMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: PostMaxAggregateInputType
  }

  export type GetPostAggregateType<T extends PostAggregateArgs> = {
        [P in keyof T & keyof AggregatePost]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregatePost[P]>
      : GetScalarType<T[P], AggregatePost[P]>
  }




  export type PostGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: PostWhereInput
    orderBy?: PostOrderByWithAggregationInput | PostOrderByWithAggregationInput[]
    by: PostScalarFieldEnum[] | PostScalarFieldEnum
    having?: PostScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: PostCountAggregateInputType | true
    _avg?: PostAvgAggregateInputType
    _sum?: PostSumAggregateInputType
    _min?: PostMinAggregateInputType
    _max?: PostMaxAggregateInputType
  }

  export type PostGroupByOutputType = {
    id: string
    organizationId: string
    workspaceId: string | null
    platform: string
    type: string
    prompt: string
    content: string
    status: string
    publishIntent: string | null
    sourceDraftId: string | null
    sourceTrendId: string | null
    sourceTrendTopic: string | null
    publishedAt: string | null
    views: number
    engagements: number
    createdAt: string
    updatedAt: string
    _count: PostCountAggregateOutputType | null
    _avg: PostAvgAggregateOutputType | null
    _sum: PostSumAggregateOutputType | null
    _min: PostMinAggregateOutputType | null
    _max: PostMaxAggregateOutputType | null
  }

  type GetPostGroupByPayload<T extends PostGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<PostGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof PostGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], PostGroupByOutputType[P]>
            : GetScalarType<T[P], PostGroupByOutputType[P]>
        }
      >
    >


  export type PostSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    organizationId?: boolean
    workspaceId?: boolean
    platform?: boolean
    type?: boolean
    prompt?: boolean
    content?: boolean
    status?: boolean
    publishIntent?: boolean
    sourceDraftId?: boolean
    sourceTrendId?: boolean
    sourceTrendTopic?: boolean
    publishedAt?: boolean
    views?: boolean
    engagements?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["post"]>

  export type PostSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    organizationId?: boolean
    workspaceId?: boolean
    platform?: boolean
    type?: boolean
    prompt?: boolean
    content?: boolean
    status?: boolean
    publishIntent?: boolean
    sourceDraftId?: boolean
    sourceTrendId?: boolean
    sourceTrendTopic?: boolean
    publishedAt?: boolean
    views?: boolean
    engagements?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["post"]>

  export type PostSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    organizationId?: boolean
    workspaceId?: boolean
    platform?: boolean
    type?: boolean
    prompt?: boolean
    content?: boolean
    status?: boolean
    publishIntent?: boolean
    sourceDraftId?: boolean
    sourceTrendId?: boolean
    sourceTrendTopic?: boolean
    publishedAt?: boolean
    views?: boolean
    engagements?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["post"]>

  export type PostSelectScalar = {
    id?: boolean
    organizationId?: boolean
    workspaceId?: boolean
    platform?: boolean
    type?: boolean
    prompt?: boolean
    content?: boolean
    status?: boolean
    publishIntent?: boolean
    sourceDraftId?: boolean
    sourceTrendId?: boolean
    sourceTrendTopic?: boolean
    publishedAt?: boolean
    views?: boolean
    engagements?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type PostOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "organizationId" | "workspaceId" | "platform" | "type" | "prompt" | "content" | "status" | "publishIntent" | "sourceDraftId" | "sourceTrendId" | "sourceTrendTopic" | "publishedAt" | "views" | "engagements" | "createdAt" | "updatedAt", ExtArgs["result"]["post"]>
  export type PostInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }
  export type PostIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }
  export type PostIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }

  export type $PostPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Post"
    objects: {
      organization: Prisma.$OrganizationPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      organizationId: string
      workspaceId: string | null
      platform: string
      type: string
      prompt: string
      content: string
      status: string
      publishIntent: string | null
      sourceDraftId: string | null
      sourceTrendId: string | null
      sourceTrendTopic: string | null
      publishedAt: string | null
      views: number
      engagements: number
      createdAt: string
      updatedAt: string
    }, ExtArgs["result"]["post"]>
    composites: {}
  }

  type PostGetPayload<S extends boolean | null | undefined | PostDefaultArgs> = $Result.GetResult<Prisma.$PostPayload, S>

  type PostCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<PostFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: PostCountAggregateInputType | true
    }

  export interface PostDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Post'], meta: { name: 'Post' } }
    /**
     * Find zero or one Post that matches the filter.
     * @param {PostFindUniqueArgs} args - Arguments to find a Post
     * @example
     * // Get one Post
     * const post = await prisma.post.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends PostFindUniqueArgs>(args: SelectSubset<T, PostFindUniqueArgs<ExtArgs>>): Prisma__PostClient<$Result.GetResult<Prisma.$PostPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Post that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {PostFindUniqueOrThrowArgs} args - Arguments to find a Post
     * @example
     * // Get one Post
     * const post = await prisma.post.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends PostFindUniqueOrThrowArgs>(args: SelectSubset<T, PostFindUniqueOrThrowArgs<ExtArgs>>): Prisma__PostClient<$Result.GetResult<Prisma.$PostPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Post that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PostFindFirstArgs} args - Arguments to find a Post
     * @example
     * // Get one Post
     * const post = await prisma.post.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends PostFindFirstArgs>(args?: SelectSubset<T, PostFindFirstArgs<ExtArgs>>): Prisma__PostClient<$Result.GetResult<Prisma.$PostPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Post that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PostFindFirstOrThrowArgs} args - Arguments to find a Post
     * @example
     * // Get one Post
     * const post = await prisma.post.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends PostFindFirstOrThrowArgs>(args?: SelectSubset<T, PostFindFirstOrThrowArgs<ExtArgs>>): Prisma__PostClient<$Result.GetResult<Prisma.$PostPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Posts that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PostFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Posts
     * const posts = await prisma.post.findMany()
     * 
     * // Get first 10 Posts
     * const posts = await prisma.post.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const postWithIdOnly = await prisma.post.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends PostFindManyArgs>(args?: SelectSubset<T, PostFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PostPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Post.
     * @param {PostCreateArgs} args - Arguments to create a Post.
     * @example
     * // Create one Post
     * const Post = await prisma.post.create({
     *   data: {
     *     // ... data to create a Post
     *   }
     * })
     * 
     */
    create<T extends PostCreateArgs>(args: SelectSubset<T, PostCreateArgs<ExtArgs>>): Prisma__PostClient<$Result.GetResult<Prisma.$PostPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Posts.
     * @param {PostCreateManyArgs} args - Arguments to create many Posts.
     * @example
     * // Create many Posts
     * const post = await prisma.post.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends PostCreateManyArgs>(args?: SelectSubset<T, PostCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Posts and returns the data saved in the database.
     * @param {PostCreateManyAndReturnArgs} args - Arguments to create many Posts.
     * @example
     * // Create many Posts
     * const post = await prisma.post.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Posts and only return the `id`
     * const postWithIdOnly = await prisma.post.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends PostCreateManyAndReturnArgs>(args?: SelectSubset<T, PostCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PostPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Post.
     * @param {PostDeleteArgs} args - Arguments to delete one Post.
     * @example
     * // Delete one Post
     * const Post = await prisma.post.delete({
     *   where: {
     *     // ... filter to delete one Post
     *   }
     * })
     * 
     */
    delete<T extends PostDeleteArgs>(args: SelectSubset<T, PostDeleteArgs<ExtArgs>>): Prisma__PostClient<$Result.GetResult<Prisma.$PostPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Post.
     * @param {PostUpdateArgs} args - Arguments to update one Post.
     * @example
     * // Update one Post
     * const post = await prisma.post.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends PostUpdateArgs>(args: SelectSubset<T, PostUpdateArgs<ExtArgs>>): Prisma__PostClient<$Result.GetResult<Prisma.$PostPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Posts.
     * @param {PostDeleteManyArgs} args - Arguments to filter Posts to delete.
     * @example
     * // Delete a few Posts
     * const { count } = await prisma.post.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends PostDeleteManyArgs>(args?: SelectSubset<T, PostDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Posts.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PostUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Posts
     * const post = await prisma.post.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends PostUpdateManyArgs>(args: SelectSubset<T, PostUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Posts and returns the data updated in the database.
     * @param {PostUpdateManyAndReturnArgs} args - Arguments to update many Posts.
     * @example
     * // Update many Posts
     * const post = await prisma.post.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Posts and only return the `id`
     * const postWithIdOnly = await prisma.post.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends PostUpdateManyAndReturnArgs>(args: SelectSubset<T, PostUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PostPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Post.
     * @param {PostUpsertArgs} args - Arguments to update or create a Post.
     * @example
     * // Update or create a Post
     * const post = await prisma.post.upsert({
     *   create: {
     *     // ... data to create a Post
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Post we want to update
     *   }
     * })
     */
    upsert<T extends PostUpsertArgs>(args: SelectSubset<T, PostUpsertArgs<ExtArgs>>): Prisma__PostClient<$Result.GetResult<Prisma.$PostPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Posts.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PostCountArgs} args - Arguments to filter Posts to count.
     * @example
     * // Count the number of Posts
     * const count = await prisma.post.count({
     *   where: {
     *     // ... the filter for the Posts we want to count
     *   }
     * })
    **/
    count<T extends PostCountArgs>(
      args?: Subset<T, PostCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], PostCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Post.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PostAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends PostAggregateArgs>(args: Subset<T, PostAggregateArgs>): Prisma.PrismaPromise<GetPostAggregateType<T>>

    /**
     * Group by Post.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PostGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends PostGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: PostGroupByArgs['orderBy'] }
        : { orderBy?: PostGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, PostGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetPostGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Post model
   */
  readonly fields: PostFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Post.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__PostClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    organization<T extends OrganizationDefaultArgs<ExtArgs> = {}>(args?: Subset<T, OrganizationDefaultArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Post model
   */
  interface PostFieldRefs {
    readonly id: FieldRef<"Post", 'String'>
    readonly organizationId: FieldRef<"Post", 'String'>
    readonly workspaceId: FieldRef<"Post", 'String'>
    readonly platform: FieldRef<"Post", 'String'>
    readonly type: FieldRef<"Post", 'String'>
    readonly prompt: FieldRef<"Post", 'String'>
    readonly content: FieldRef<"Post", 'String'>
    readonly status: FieldRef<"Post", 'String'>
    readonly publishIntent: FieldRef<"Post", 'String'>
    readonly sourceDraftId: FieldRef<"Post", 'String'>
    readonly sourceTrendId: FieldRef<"Post", 'String'>
    readonly sourceTrendTopic: FieldRef<"Post", 'String'>
    readonly publishedAt: FieldRef<"Post", 'String'>
    readonly views: FieldRef<"Post", 'Int'>
    readonly engagements: FieldRef<"Post", 'Int'>
    readonly createdAt: FieldRef<"Post", 'String'>
    readonly updatedAt: FieldRef<"Post", 'String'>
  }
    

  // Custom InputTypes
  /**
   * Post findUnique
   */
  export type PostFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Post
     */
    select?: PostSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Post
     */
    omit?: PostOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PostInclude<ExtArgs> | null
    /**
     * Filter, which Post to fetch.
     */
    where: PostWhereUniqueInput
  }

  /**
   * Post findUniqueOrThrow
   */
  export type PostFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Post
     */
    select?: PostSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Post
     */
    omit?: PostOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PostInclude<ExtArgs> | null
    /**
     * Filter, which Post to fetch.
     */
    where: PostWhereUniqueInput
  }

  /**
   * Post findFirst
   */
  export type PostFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Post
     */
    select?: PostSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Post
     */
    omit?: PostOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PostInclude<ExtArgs> | null
    /**
     * Filter, which Post to fetch.
     */
    where?: PostWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Posts to fetch.
     */
    orderBy?: PostOrderByWithRelationInput | PostOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Posts.
     */
    cursor?: PostWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Posts from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Posts.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Posts.
     */
    distinct?: PostScalarFieldEnum | PostScalarFieldEnum[]
  }

  /**
   * Post findFirstOrThrow
   */
  export type PostFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Post
     */
    select?: PostSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Post
     */
    omit?: PostOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PostInclude<ExtArgs> | null
    /**
     * Filter, which Post to fetch.
     */
    where?: PostWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Posts to fetch.
     */
    orderBy?: PostOrderByWithRelationInput | PostOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Posts.
     */
    cursor?: PostWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Posts from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Posts.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Posts.
     */
    distinct?: PostScalarFieldEnum | PostScalarFieldEnum[]
  }

  /**
   * Post findMany
   */
  export type PostFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Post
     */
    select?: PostSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Post
     */
    omit?: PostOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PostInclude<ExtArgs> | null
    /**
     * Filter, which Posts to fetch.
     */
    where?: PostWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Posts to fetch.
     */
    orderBy?: PostOrderByWithRelationInput | PostOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Posts.
     */
    cursor?: PostWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Posts from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Posts.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Posts.
     */
    distinct?: PostScalarFieldEnum | PostScalarFieldEnum[]
  }

  /**
   * Post create
   */
  export type PostCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Post
     */
    select?: PostSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Post
     */
    omit?: PostOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PostInclude<ExtArgs> | null
    /**
     * The data needed to create a Post.
     */
    data: XOR<PostCreateInput, PostUncheckedCreateInput>
  }

  /**
   * Post createMany
   */
  export type PostCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Posts.
     */
    data: PostCreateManyInput | PostCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Post createManyAndReturn
   */
  export type PostCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Post
     */
    select?: PostSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Post
     */
    omit?: PostOmit<ExtArgs> | null
    /**
     * The data used to create many Posts.
     */
    data: PostCreateManyInput | PostCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PostIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Post update
   */
  export type PostUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Post
     */
    select?: PostSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Post
     */
    omit?: PostOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PostInclude<ExtArgs> | null
    /**
     * The data needed to update a Post.
     */
    data: XOR<PostUpdateInput, PostUncheckedUpdateInput>
    /**
     * Choose, which Post to update.
     */
    where: PostWhereUniqueInput
  }

  /**
   * Post updateMany
   */
  export type PostUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Posts.
     */
    data: XOR<PostUpdateManyMutationInput, PostUncheckedUpdateManyInput>
    /**
     * Filter which Posts to update
     */
    where?: PostWhereInput
    /**
     * Limit how many Posts to update.
     */
    limit?: number
  }

  /**
   * Post updateManyAndReturn
   */
  export type PostUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Post
     */
    select?: PostSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Post
     */
    omit?: PostOmit<ExtArgs> | null
    /**
     * The data used to update Posts.
     */
    data: XOR<PostUpdateManyMutationInput, PostUncheckedUpdateManyInput>
    /**
     * Filter which Posts to update
     */
    where?: PostWhereInput
    /**
     * Limit how many Posts to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PostIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Post upsert
   */
  export type PostUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Post
     */
    select?: PostSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Post
     */
    omit?: PostOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PostInclude<ExtArgs> | null
    /**
     * The filter to search for the Post to update in case it exists.
     */
    where: PostWhereUniqueInput
    /**
     * In case the Post found by the `where` argument doesn't exist, create a new Post with this data.
     */
    create: XOR<PostCreateInput, PostUncheckedCreateInput>
    /**
     * In case the Post was found with the provided `where` argument, update it with this data.
     */
    update: XOR<PostUpdateInput, PostUncheckedUpdateInput>
  }

  /**
   * Post delete
   */
  export type PostDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Post
     */
    select?: PostSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Post
     */
    omit?: PostOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PostInclude<ExtArgs> | null
    /**
     * Filter which Post to delete.
     */
    where: PostWhereUniqueInput
  }

  /**
   * Post deleteMany
   */
  export type PostDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Posts to delete
     */
    where?: PostWhereInput
    /**
     * Limit how many Posts to delete.
     */
    limit?: number
  }

  /**
   * Post without action
   */
  export type PostDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Post
     */
    select?: PostSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Post
     */
    omit?: PostOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PostInclude<ExtArgs> | null
  }


  /**
   * Model Ingredient
   */

  export type AggregateIngredient = {
    _count: IngredientCountAggregateOutputType | null
    _avg: IngredientAvgAggregateOutputType | null
    _sum: IngredientSumAggregateOutputType | null
    _min: IngredientMinAggregateOutputType | null
    _max: IngredientMaxAggregateOutputType | null
  }

  export type IngredientAvgAggregateOutputType = {
    totalVotes: number | null
  }

  export type IngredientSumAggregateOutputType = {
    totalVotes: number | null
  }

  export type IngredientMinAggregateOutputType = {
    id: string | null
    organizationId: string | null
    title: string | null
    content: string | null
    platform: string | null
    totalVotes: number | null
    sourcePostId: string | null
    createdAt: string | null
    updatedAt: string | null
  }

  export type IngredientMaxAggregateOutputType = {
    id: string | null
    organizationId: string | null
    title: string | null
    content: string | null
    platform: string | null
    totalVotes: number | null
    sourcePostId: string | null
    createdAt: string | null
    updatedAt: string | null
  }

  export type IngredientCountAggregateOutputType = {
    id: number
    organizationId: number
    title: number
    content: number
    platform: number
    totalVotes: number
    sourcePostId: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type IngredientAvgAggregateInputType = {
    totalVotes?: true
  }

  export type IngredientSumAggregateInputType = {
    totalVotes?: true
  }

  export type IngredientMinAggregateInputType = {
    id?: true
    organizationId?: true
    title?: true
    content?: true
    platform?: true
    totalVotes?: true
    sourcePostId?: true
    createdAt?: true
    updatedAt?: true
  }

  export type IngredientMaxAggregateInputType = {
    id?: true
    organizationId?: true
    title?: true
    content?: true
    platform?: true
    totalVotes?: true
    sourcePostId?: true
    createdAt?: true
    updatedAt?: true
  }

  export type IngredientCountAggregateInputType = {
    id?: true
    organizationId?: true
    title?: true
    content?: true
    platform?: true
    totalVotes?: true
    sourcePostId?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type IngredientAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Ingredient to aggregate.
     */
    where?: IngredientWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Ingredients to fetch.
     */
    orderBy?: IngredientOrderByWithRelationInput | IngredientOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: IngredientWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Ingredients from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Ingredients.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Ingredients
    **/
    _count?: true | IngredientCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: IngredientAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: IngredientSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: IngredientMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: IngredientMaxAggregateInputType
  }

  export type GetIngredientAggregateType<T extends IngredientAggregateArgs> = {
        [P in keyof T & keyof AggregateIngredient]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateIngredient[P]>
      : GetScalarType<T[P], AggregateIngredient[P]>
  }




  export type IngredientGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: IngredientWhereInput
    orderBy?: IngredientOrderByWithAggregationInput | IngredientOrderByWithAggregationInput[]
    by: IngredientScalarFieldEnum[] | IngredientScalarFieldEnum
    having?: IngredientScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: IngredientCountAggregateInputType | true
    _avg?: IngredientAvgAggregateInputType
    _sum?: IngredientSumAggregateInputType
    _min?: IngredientMinAggregateInputType
    _max?: IngredientMaxAggregateInputType
  }

  export type IngredientGroupByOutputType = {
    id: string
    organizationId: string
    title: string
    content: string
    platform: string | null
    totalVotes: number
    sourcePostId: string | null
    createdAt: string
    updatedAt: string
    _count: IngredientCountAggregateOutputType | null
    _avg: IngredientAvgAggregateOutputType | null
    _sum: IngredientSumAggregateOutputType | null
    _min: IngredientMinAggregateOutputType | null
    _max: IngredientMaxAggregateOutputType | null
  }

  type GetIngredientGroupByPayload<T extends IngredientGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<IngredientGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof IngredientGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], IngredientGroupByOutputType[P]>
            : GetScalarType<T[P], IngredientGroupByOutputType[P]>
        }
      >
    >


  export type IngredientSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    organizationId?: boolean
    title?: boolean
    content?: boolean
    platform?: boolean
    totalVotes?: boolean
    sourcePostId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["ingredient"]>

  export type IngredientSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    organizationId?: boolean
    title?: boolean
    content?: boolean
    platform?: boolean
    totalVotes?: boolean
    sourcePostId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["ingredient"]>

  export type IngredientSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    organizationId?: boolean
    title?: boolean
    content?: boolean
    platform?: boolean
    totalVotes?: boolean
    sourcePostId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["ingredient"]>

  export type IngredientSelectScalar = {
    id?: boolean
    organizationId?: boolean
    title?: boolean
    content?: boolean
    platform?: boolean
    totalVotes?: boolean
    sourcePostId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type IngredientOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "organizationId" | "title" | "content" | "platform" | "totalVotes" | "sourcePostId" | "createdAt" | "updatedAt", ExtArgs["result"]["ingredient"]>
  export type IngredientInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }
  export type IngredientIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }
  export type IngredientIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }

  export type $IngredientPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Ingredient"
    objects: {
      organization: Prisma.$OrganizationPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      organizationId: string
      title: string
      content: string
      platform: string | null
      totalVotes: number
      sourcePostId: string | null
      createdAt: string
      updatedAt: string
    }, ExtArgs["result"]["ingredient"]>
    composites: {}
  }

  type IngredientGetPayload<S extends boolean | null | undefined | IngredientDefaultArgs> = $Result.GetResult<Prisma.$IngredientPayload, S>

  type IngredientCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<IngredientFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: IngredientCountAggregateInputType | true
    }

  export interface IngredientDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Ingredient'], meta: { name: 'Ingredient' } }
    /**
     * Find zero or one Ingredient that matches the filter.
     * @param {IngredientFindUniqueArgs} args - Arguments to find a Ingredient
     * @example
     * // Get one Ingredient
     * const ingredient = await prisma.ingredient.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends IngredientFindUniqueArgs>(args: SelectSubset<T, IngredientFindUniqueArgs<ExtArgs>>): Prisma__IngredientClient<$Result.GetResult<Prisma.$IngredientPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Ingredient that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {IngredientFindUniqueOrThrowArgs} args - Arguments to find a Ingredient
     * @example
     * // Get one Ingredient
     * const ingredient = await prisma.ingredient.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends IngredientFindUniqueOrThrowArgs>(args: SelectSubset<T, IngredientFindUniqueOrThrowArgs<ExtArgs>>): Prisma__IngredientClient<$Result.GetResult<Prisma.$IngredientPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Ingredient that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {IngredientFindFirstArgs} args - Arguments to find a Ingredient
     * @example
     * // Get one Ingredient
     * const ingredient = await prisma.ingredient.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends IngredientFindFirstArgs>(args?: SelectSubset<T, IngredientFindFirstArgs<ExtArgs>>): Prisma__IngredientClient<$Result.GetResult<Prisma.$IngredientPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Ingredient that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {IngredientFindFirstOrThrowArgs} args - Arguments to find a Ingredient
     * @example
     * // Get one Ingredient
     * const ingredient = await prisma.ingredient.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends IngredientFindFirstOrThrowArgs>(args?: SelectSubset<T, IngredientFindFirstOrThrowArgs<ExtArgs>>): Prisma__IngredientClient<$Result.GetResult<Prisma.$IngredientPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Ingredients that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {IngredientFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Ingredients
     * const ingredients = await prisma.ingredient.findMany()
     * 
     * // Get first 10 Ingredients
     * const ingredients = await prisma.ingredient.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const ingredientWithIdOnly = await prisma.ingredient.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends IngredientFindManyArgs>(args?: SelectSubset<T, IngredientFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$IngredientPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Ingredient.
     * @param {IngredientCreateArgs} args - Arguments to create a Ingredient.
     * @example
     * // Create one Ingredient
     * const Ingredient = await prisma.ingredient.create({
     *   data: {
     *     // ... data to create a Ingredient
     *   }
     * })
     * 
     */
    create<T extends IngredientCreateArgs>(args: SelectSubset<T, IngredientCreateArgs<ExtArgs>>): Prisma__IngredientClient<$Result.GetResult<Prisma.$IngredientPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Ingredients.
     * @param {IngredientCreateManyArgs} args - Arguments to create many Ingredients.
     * @example
     * // Create many Ingredients
     * const ingredient = await prisma.ingredient.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends IngredientCreateManyArgs>(args?: SelectSubset<T, IngredientCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Ingredients and returns the data saved in the database.
     * @param {IngredientCreateManyAndReturnArgs} args - Arguments to create many Ingredients.
     * @example
     * // Create many Ingredients
     * const ingredient = await prisma.ingredient.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Ingredients and only return the `id`
     * const ingredientWithIdOnly = await prisma.ingredient.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends IngredientCreateManyAndReturnArgs>(args?: SelectSubset<T, IngredientCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$IngredientPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Ingredient.
     * @param {IngredientDeleteArgs} args - Arguments to delete one Ingredient.
     * @example
     * // Delete one Ingredient
     * const Ingredient = await prisma.ingredient.delete({
     *   where: {
     *     // ... filter to delete one Ingredient
     *   }
     * })
     * 
     */
    delete<T extends IngredientDeleteArgs>(args: SelectSubset<T, IngredientDeleteArgs<ExtArgs>>): Prisma__IngredientClient<$Result.GetResult<Prisma.$IngredientPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Ingredient.
     * @param {IngredientUpdateArgs} args - Arguments to update one Ingredient.
     * @example
     * // Update one Ingredient
     * const ingredient = await prisma.ingredient.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends IngredientUpdateArgs>(args: SelectSubset<T, IngredientUpdateArgs<ExtArgs>>): Prisma__IngredientClient<$Result.GetResult<Prisma.$IngredientPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Ingredients.
     * @param {IngredientDeleteManyArgs} args - Arguments to filter Ingredients to delete.
     * @example
     * // Delete a few Ingredients
     * const { count } = await prisma.ingredient.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends IngredientDeleteManyArgs>(args?: SelectSubset<T, IngredientDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Ingredients.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {IngredientUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Ingredients
     * const ingredient = await prisma.ingredient.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends IngredientUpdateManyArgs>(args: SelectSubset<T, IngredientUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Ingredients and returns the data updated in the database.
     * @param {IngredientUpdateManyAndReturnArgs} args - Arguments to update many Ingredients.
     * @example
     * // Update many Ingredients
     * const ingredient = await prisma.ingredient.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Ingredients and only return the `id`
     * const ingredientWithIdOnly = await prisma.ingredient.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends IngredientUpdateManyAndReturnArgs>(args: SelectSubset<T, IngredientUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$IngredientPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Ingredient.
     * @param {IngredientUpsertArgs} args - Arguments to update or create a Ingredient.
     * @example
     * // Update or create a Ingredient
     * const ingredient = await prisma.ingredient.upsert({
     *   create: {
     *     // ... data to create a Ingredient
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Ingredient we want to update
     *   }
     * })
     */
    upsert<T extends IngredientUpsertArgs>(args: SelectSubset<T, IngredientUpsertArgs<ExtArgs>>): Prisma__IngredientClient<$Result.GetResult<Prisma.$IngredientPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Ingredients.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {IngredientCountArgs} args - Arguments to filter Ingredients to count.
     * @example
     * // Count the number of Ingredients
     * const count = await prisma.ingredient.count({
     *   where: {
     *     // ... the filter for the Ingredients we want to count
     *   }
     * })
    **/
    count<T extends IngredientCountArgs>(
      args?: Subset<T, IngredientCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], IngredientCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Ingredient.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {IngredientAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends IngredientAggregateArgs>(args: Subset<T, IngredientAggregateArgs>): Prisma.PrismaPromise<GetIngredientAggregateType<T>>

    /**
     * Group by Ingredient.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {IngredientGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends IngredientGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: IngredientGroupByArgs['orderBy'] }
        : { orderBy?: IngredientGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, IngredientGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetIngredientGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Ingredient model
   */
  readonly fields: IngredientFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Ingredient.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__IngredientClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    organization<T extends OrganizationDefaultArgs<ExtArgs> = {}>(args?: Subset<T, OrganizationDefaultArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Ingredient model
   */
  interface IngredientFieldRefs {
    readonly id: FieldRef<"Ingredient", 'String'>
    readonly organizationId: FieldRef<"Ingredient", 'String'>
    readonly title: FieldRef<"Ingredient", 'String'>
    readonly content: FieldRef<"Ingredient", 'String'>
    readonly platform: FieldRef<"Ingredient", 'String'>
    readonly totalVotes: FieldRef<"Ingredient", 'Int'>
    readonly sourcePostId: FieldRef<"Ingredient", 'String'>
    readonly createdAt: FieldRef<"Ingredient", 'String'>
    readonly updatedAt: FieldRef<"Ingredient", 'String'>
  }
    

  // Custom InputTypes
  /**
   * Ingredient findUnique
   */
  export type IngredientFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Ingredient
     */
    select?: IngredientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Ingredient
     */
    omit?: IngredientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: IngredientInclude<ExtArgs> | null
    /**
     * Filter, which Ingredient to fetch.
     */
    where: IngredientWhereUniqueInput
  }

  /**
   * Ingredient findUniqueOrThrow
   */
  export type IngredientFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Ingredient
     */
    select?: IngredientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Ingredient
     */
    omit?: IngredientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: IngredientInclude<ExtArgs> | null
    /**
     * Filter, which Ingredient to fetch.
     */
    where: IngredientWhereUniqueInput
  }

  /**
   * Ingredient findFirst
   */
  export type IngredientFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Ingredient
     */
    select?: IngredientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Ingredient
     */
    omit?: IngredientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: IngredientInclude<ExtArgs> | null
    /**
     * Filter, which Ingredient to fetch.
     */
    where?: IngredientWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Ingredients to fetch.
     */
    orderBy?: IngredientOrderByWithRelationInput | IngredientOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Ingredients.
     */
    cursor?: IngredientWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Ingredients from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Ingredients.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Ingredients.
     */
    distinct?: IngredientScalarFieldEnum | IngredientScalarFieldEnum[]
  }

  /**
   * Ingredient findFirstOrThrow
   */
  export type IngredientFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Ingredient
     */
    select?: IngredientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Ingredient
     */
    omit?: IngredientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: IngredientInclude<ExtArgs> | null
    /**
     * Filter, which Ingredient to fetch.
     */
    where?: IngredientWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Ingredients to fetch.
     */
    orderBy?: IngredientOrderByWithRelationInput | IngredientOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Ingredients.
     */
    cursor?: IngredientWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Ingredients from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Ingredients.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Ingredients.
     */
    distinct?: IngredientScalarFieldEnum | IngredientScalarFieldEnum[]
  }

  /**
   * Ingredient findMany
   */
  export type IngredientFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Ingredient
     */
    select?: IngredientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Ingredient
     */
    omit?: IngredientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: IngredientInclude<ExtArgs> | null
    /**
     * Filter, which Ingredients to fetch.
     */
    where?: IngredientWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Ingredients to fetch.
     */
    orderBy?: IngredientOrderByWithRelationInput | IngredientOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Ingredients.
     */
    cursor?: IngredientWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Ingredients from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Ingredients.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Ingredients.
     */
    distinct?: IngredientScalarFieldEnum | IngredientScalarFieldEnum[]
  }

  /**
   * Ingredient create
   */
  export type IngredientCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Ingredient
     */
    select?: IngredientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Ingredient
     */
    omit?: IngredientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: IngredientInclude<ExtArgs> | null
    /**
     * The data needed to create a Ingredient.
     */
    data: XOR<IngredientCreateInput, IngredientUncheckedCreateInput>
  }

  /**
   * Ingredient createMany
   */
  export type IngredientCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Ingredients.
     */
    data: IngredientCreateManyInput | IngredientCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Ingredient createManyAndReturn
   */
  export type IngredientCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Ingredient
     */
    select?: IngredientSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Ingredient
     */
    omit?: IngredientOmit<ExtArgs> | null
    /**
     * The data used to create many Ingredients.
     */
    data: IngredientCreateManyInput | IngredientCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: IngredientIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Ingredient update
   */
  export type IngredientUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Ingredient
     */
    select?: IngredientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Ingredient
     */
    omit?: IngredientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: IngredientInclude<ExtArgs> | null
    /**
     * The data needed to update a Ingredient.
     */
    data: XOR<IngredientUpdateInput, IngredientUncheckedUpdateInput>
    /**
     * Choose, which Ingredient to update.
     */
    where: IngredientWhereUniqueInput
  }

  /**
   * Ingredient updateMany
   */
  export type IngredientUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Ingredients.
     */
    data: XOR<IngredientUpdateManyMutationInput, IngredientUncheckedUpdateManyInput>
    /**
     * Filter which Ingredients to update
     */
    where?: IngredientWhereInput
    /**
     * Limit how many Ingredients to update.
     */
    limit?: number
  }

  /**
   * Ingredient updateManyAndReturn
   */
  export type IngredientUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Ingredient
     */
    select?: IngredientSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Ingredient
     */
    omit?: IngredientOmit<ExtArgs> | null
    /**
     * The data used to update Ingredients.
     */
    data: XOR<IngredientUpdateManyMutationInput, IngredientUncheckedUpdateManyInput>
    /**
     * Filter which Ingredients to update
     */
    where?: IngredientWhereInput
    /**
     * Limit how many Ingredients to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: IngredientIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Ingredient upsert
   */
  export type IngredientUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Ingredient
     */
    select?: IngredientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Ingredient
     */
    omit?: IngredientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: IngredientInclude<ExtArgs> | null
    /**
     * The filter to search for the Ingredient to update in case it exists.
     */
    where: IngredientWhereUniqueInput
    /**
     * In case the Ingredient found by the `where` argument doesn't exist, create a new Ingredient with this data.
     */
    create: XOR<IngredientCreateInput, IngredientUncheckedCreateInput>
    /**
     * In case the Ingredient was found with the provided `where` argument, update it with this data.
     */
    update: XOR<IngredientUpdateInput, IngredientUncheckedUpdateInput>
  }

  /**
   * Ingredient delete
   */
  export type IngredientDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Ingredient
     */
    select?: IngredientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Ingredient
     */
    omit?: IngredientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: IngredientInclude<ExtArgs> | null
    /**
     * Filter which Ingredient to delete.
     */
    where: IngredientWhereUniqueInput
  }

  /**
   * Ingredient deleteMany
   */
  export type IngredientDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Ingredients to delete
     */
    where?: IngredientWhereInput
    /**
     * Limit how many Ingredients to delete.
     */
    limit?: number
  }

  /**
   * Ingredient without action
   */
  export type IngredientDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Ingredient
     */
    select?: IngredientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Ingredient
     */
    omit?: IngredientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: IngredientInclude<ExtArgs> | null
  }


  /**
   * Model Trend
   */

  export type AggregateTrend = {
    _count: TrendCountAggregateOutputType | null
    _avg: TrendAvgAggregateOutputType | null
    _sum: TrendSumAggregateOutputType | null
    _min: TrendMinAggregateOutputType | null
    _max: TrendMaxAggregateOutputType | null
  }

  export type TrendAvgAggregateOutputType = {
    viralityScore: number | null
    engagementScore: number | null
  }

  export type TrendSumAggregateOutputType = {
    viralityScore: number | null
    engagementScore: number | null
  }

  export type TrendMinAggregateOutputType = {
    id: string | null
    organizationId: string | null
    platform: string | null
    topic: string | null
    summary: string | null
    viralityScore: number | null
    engagementScore: number | null
    createdAt: string | null
  }

  export type TrendMaxAggregateOutputType = {
    id: string | null
    organizationId: string | null
    platform: string | null
    topic: string | null
    summary: string | null
    viralityScore: number | null
    engagementScore: number | null
    createdAt: string | null
  }

  export type TrendCountAggregateOutputType = {
    id: number
    organizationId: number
    platform: number
    topic: number
    summary: number
    viralityScore: number
    engagementScore: number
    createdAt: number
    _all: number
  }


  export type TrendAvgAggregateInputType = {
    viralityScore?: true
    engagementScore?: true
  }

  export type TrendSumAggregateInputType = {
    viralityScore?: true
    engagementScore?: true
  }

  export type TrendMinAggregateInputType = {
    id?: true
    organizationId?: true
    platform?: true
    topic?: true
    summary?: true
    viralityScore?: true
    engagementScore?: true
    createdAt?: true
  }

  export type TrendMaxAggregateInputType = {
    id?: true
    organizationId?: true
    platform?: true
    topic?: true
    summary?: true
    viralityScore?: true
    engagementScore?: true
    createdAt?: true
  }

  export type TrendCountAggregateInputType = {
    id?: true
    organizationId?: true
    platform?: true
    topic?: true
    summary?: true
    viralityScore?: true
    engagementScore?: true
    createdAt?: true
    _all?: true
  }

  export type TrendAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Trend to aggregate.
     */
    where?: TrendWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Trends to fetch.
     */
    orderBy?: TrendOrderByWithRelationInput | TrendOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: TrendWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Trends from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Trends.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Trends
    **/
    _count?: true | TrendCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: TrendAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: TrendSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: TrendMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: TrendMaxAggregateInputType
  }

  export type GetTrendAggregateType<T extends TrendAggregateArgs> = {
        [P in keyof T & keyof AggregateTrend]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateTrend[P]>
      : GetScalarType<T[P], AggregateTrend[P]>
  }




  export type TrendGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TrendWhereInput
    orderBy?: TrendOrderByWithAggregationInput | TrendOrderByWithAggregationInput[]
    by: TrendScalarFieldEnum[] | TrendScalarFieldEnum
    having?: TrendScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: TrendCountAggregateInputType | true
    _avg?: TrendAvgAggregateInputType
    _sum?: TrendSumAggregateInputType
    _min?: TrendMinAggregateInputType
    _max?: TrendMaxAggregateInputType
  }

  export type TrendGroupByOutputType = {
    id: string
    organizationId: string
    platform: string
    topic: string
    summary: string | null
    viralityScore: number
    engagementScore: number
    createdAt: string
    _count: TrendCountAggregateOutputType | null
    _avg: TrendAvgAggregateOutputType | null
    _sum: TrendSumAggregateOutputType | null
    _min: TrendMinAggregateOutputType | null
    _max: TrendMaxAggregateOutputType | null
  }

  type GetTrendGroupByPayload<T extends TrendGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<TrendGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof TrendGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], TrendGroupByOutputType[P]>
            : GetScalarType<T[P], TrendGroupByOutputType[P]>
        }
      >
    >


  export type TrendSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    organizationId?: boolean
    platform?: boolean
    topic?: boolean
    summary?: boolean
    viralityScore?: boolean
    engagementScore?: boolean
    createdAt?: boolean
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["trend"]>

  export type TrendSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    organizationId?: boolean
    platform?: boolean
    topic?: boolean
    summary?: boolean
    viralityScore?: boolean
    engagementScore?: boolean
    createdAt?: boolean
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["trend"]>

  export type TrendSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    organizationId?: boolean
    platform?: boolean
    topic?: boolean
    summary?: boolean
    viralityScore?: boolean
    engagementScore?: boolean
    createdAt?: boolean
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["trend"]>

  export type TrendSelectScalar = {
    id?: boolean
    organizationId?: boolean
    platform?: boolean
    topic?: boolean
    summary?: boolean
    viralityScore?: boolean
    engagementScore?: boolean
    createdAt?: boolean
  }

  export type TrendOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "organizationId" | "platform" | "topic" | "summary" | "viralityScore" | "engagementScore" | "createdAt", ExtArgs["result"]["trend"]>
  export type TrendInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }
  export type TrendIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }
  export type TrendIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }

  export type $TrendPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Trend"
    objects: {
      organization: Prisma.$OrganizationPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      organizationId: string
      platform: string
      topic: string
      summary: string | null
      viralityScore: number
      engagementScore: number
      createdAt: string
    }, ExtArgs["result"]["trend"]>
    composites: {}
  }

  type TrendGetPayload<S extends boolean | null | undefined | TrendDefaultArgs> = $Result.GetResult<Prisma.$TrendPayload, S>

  type TrendCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<TrendFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: TrendCountAggregateInputType | true
    }

  export interface TrendDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Trend'], meta: { name: 'Trend' } }
    /**
     * Find zero or one Trend that matches the filter.
     * @param {TrendFindUniqueArgs} args - Arguments to find a Trend
     * @example
     * // Get one Trend
     * const trend = await prisma.trend.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends TrendFindUniqueArgs>(args: SelectSubset<T, TrendFindUniqueArgs<ExtArgs>>): Prisma__TrendClient<$Result.GetResult<Prisma.$TrendPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Trend that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {TrendFindUniqueOrThrowArgs} args - Arguments to find a Trend
     * @example
     * // Get one Trend
     * const trend = await prisma.trend.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends TrendFindUniqueOrThrowArgs>(args: SelectSubset<T, TrendFindUniqueOrThrowArgs<ExtArgs>>): Prisma__TrendClient<$Result.GetResult<Prisma.$TrendPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Trend that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TrendFindFirstArgs} args - Arguments to find a Trend
     * @example
     * // Get one Trend
     * const trend = await prisma.trend.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends TrendFindFirstArgs>(args?: SelectSubset<T, TrendFindFirstArgs<ExtArgs>>): Prisma__TrendClient<$Result.GetResult<Prisma.$TrendPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Trend that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TrendFindFirstOrThrowArgs} args - Arguments to find a Trend
     * @example
     * // Get one Trend
     * const trend = await prisma.trend.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends TrendFindFirstOrThrowArgs>(args?: SelectSubset<T, TrendFindFirstOrThrowArgs<ExtArgs>>): Prisma__TrendClient<$Result.GetResult<Prisma.$TrendPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Trends that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TrendFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Trends
     * const trends = await prisma.trend.findMany()
     * 
     * // Get first 10 Trends
     * const trends = await prisma.trend.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const trendWithIdOnly = await prisma.trend.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends TrendFindManyArgs>(args?: SelectSubset<T, TrendFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TrendPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Trend.
     * @param {TrendCreateArgs} args - Arguments to create a Trend.
     * @example
     * // Create one Trend
     * const Trend = await prisma.trend.create({
     *   data: {
     *     // ... data to create a Trend
     *   }
     * })
     * 
     */
    create<T extends TrendCreateArgs>(args: SelectSubset<T, TrendCreateArgs<ExtArgs>>): Prisma__TrendClient<$Result.GetResult<Prisma.$TrendPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Trends.
     * @param {TrendCreateManyArgs} args - Arguments to create many Trends.
     * @example
     * // Create many Trends
     * const trend = await prisma.trend.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends TrendCreateManyArgs>(args?: SelectSubset<T, TrendCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Trends and returns the data saved in the database.
     * @param {TrendCreateManyAndReturnArgs} args - Arguments to create many Trends.
     * @example
     * // Create many Trends
     * const trend = await prisma.trend.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Trends and only return the `id`
     * const trendWithIdOnly = await prisma.trend.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends TrendCreateManyAndReturnArgs>(args?: SelectSubset<T, TrendCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TrendPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Trend.
     * @param {TrendDeleteArgs} args - Arguments to delete one Trend.
     * @example
     * // Delete one Trend
     * const Trend = await prisma.trend.delete({
     *   where: {
     *     // ... filter to delete one Trend
     *   }
     * })
     * 
     */
    delete<T extends TrendDeleteArgs>(args: SelectSubset<T, TrendDeleteArgs<ExtArgs>>): Prisma__TrendClient<$Result.GetResult<Prisma.$TrendPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Trend.
     * @param {TrendUpdateArgs} args - Arguments to update one Trend.
     * @example
     * // Update one Trend
     * const trend = await prisma.trend.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends TrendUpdateArgs>(args: SelectSubset<T, TrendUpdateArgs<ExtArgs>>): Prisma__TrendClient<$Result.GetResult<Prisma.$TrendPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Trends.
     * @param {TrendDeleteManyArgs} args - Arguments to filter Trends to delete.
     * @example
     * // Delete a few Trends
     * const { count } = await prisma.trend.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends TrendDeleteManyArgs>(args?: SelectSubset<T, TrendDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Trends.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TrendUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Trends
     * const trend = await prisma.trend.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends TrendUpdateManyArgs>(args: SelectSubset<T, TrendUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Trends and returns the data updated in the database.
     * @param {TrendUpdateManyAndReturnArgs} args - Arguments to update many Trends.
     * @example
     * // Update many Trends
     * const trend = await prisma.trend.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Trends and only return the `id`
     * const trendWithIdOnly = await prisma.trend.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends TrendUpdateManyAndReturnArgs>(args: SelectSubset<T, TrendUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TrendPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Trend.
     * @param {TrendUpsertArgs} args - Arguments to update or create a Trend.
     * @example
     * // Update or create a Trend
     * const trend = await prisma.trend.upsert({
     *   create: {
     *     // ... data to create a Trend
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Trend we want to update
     *   }
     * })
     */
    upsert<T extends TrendUpsertArgs>(args: SelectSubset<T, TrendUpsertArgs<ExtArgs>>): Prisma__TrendClient<$Result.GetResult<Prisma.$TrendPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Trends.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TrendCountArgs} args - Arguments to filter Trends to count.
     * @example
     * // Count the number of Trends
     * const count = await prisma.trend.count({
     *   where: {
     *     // ... the filter for the Trends we want to count
     *   }
     * })
    **/
    count<T extends TrendCountArgs>(
      args?: Subset<T, TrendCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], TrendCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Trend.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TrendAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends TrendAggregateArgs>(args: Subset<T, TrendAggregateArgs>): Prisma.PrismaPromise<GetTrendAggregateType<T>>

    /**
     * Group by Trend.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TrendGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends TrendGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: TrendGroupByArgs['orderBy'] }
        : { orderBy?: TrendGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, TrendGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetTrendGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Trend model
   */
  readonly fields: TrendFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Trend.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__TrendClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    organization<T extends OrganizationDefaultArgs<ExtArgs> = {}>(args?: Subset<T, OrganizationDefaultArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Trend model
   */
  interface TrendFieldRefs {
    readonly id: FieldRef<"Trend", 'String'>
    readonly organizationId: FieldRef<"Trend", 'String'>
    readonly platform: FieldRef<"Trend", 'String'>
    readonly topic: FieldRef<"Trend", 'String'>
    readonly summary: FieldRef<"Trend", 'String'>
    readonly viralityScore: FieldRef<"Trend", 'Int'>
    readonly engagementScore: FieldRef<"Trend", 'Int'>
    readonly createdAt: FieldRef<"Trend", 'String'>
  }
    

  // Custom InputTypes
  /**
   * Trend findUnique
   */
  export type TrendFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Trend
     */
    select?: TrendSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Trend
     */
    omit?: TrendOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TrendInclude<ExtArgs> | null
    /**
     * Filter, which Trend to fetch.
     */
    where: TrendWhereUniqueInput
  }

  /**
   * Trend findUniqueOrThrow
   */
  export type TrendFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Trend
     */
    select?: TrendSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Trend
     */
    omit?: TrendOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TrendInclude<ExtArgs> | null
    /**
     * Filter, which Trend to fetch.
     */
    where: TrendWhereUniqueInput
  }

  /**
   * Trend findFirst
   */
  export type TrendFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Trend
     */
    select?: TrendSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Trend
     */
    omit?: TrendOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TrendInclude<ExtArgs> | null
    /**
     * Filter, which Trend to fetch.
     */
    where?: TrendWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Trends to fetch.
     */
    orderBy?: TrendOrderByWithRelationInput | TrendOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Trends.
     */
    cursor?: TrendWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Trends from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Trends.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Trends.
     */
    distinct?: TrendScalarFieldEnum | TrendScalarFieldEnum[]
  }

  /**
   * Trend findFirstOrThrow
   */
  export type TrendFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Trend
     */
    select?: TrendSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Trend
     */
    omit?: TrendOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TrendInclude<ExtArgs> | null
    /**
     * Filter, which Trend to fetch.
     */
    where?: TrendWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Trends to fetch.
     */
    orderBy?: TrendOrderByWithRelationInput | TrendOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Trends.
     */
    cursor?: TrendWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Trends from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Trends.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Trends.
     */
    distinct?: TrendScalarFieldEnum | TrendScalarFieldEnum[]
  }

  /**
   * Trend findMany
   */
  export type TrendFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Trend
     */
    select?: TrendSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Trend
     */
    omit?: TrendOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TrendInclude<ExtArgs> | null
    /**
     * Filter, which Trends to fetch.
     */
    where?: TrendWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Trends to fetch.
     */
    orderBy?: TrendOrderByWithRelationInput | TrendOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Trends.
     */
    cursor?: TrendWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Trends from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Trends.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Trends.
     */
    distinct?: TrendScalarFieldEnum | TrendScalarFieldEnum[]
  }

  /**
   * Trend create
   */
  export type TrendCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Trend
     */
    select?: TrendSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Trend
     */
    omit?: TrendOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TrendInclude<ExtArgs> | null
    /**
     * The data needed to create a Trend.
     */
    data: XOR<TrendCreateInput, TrendUncheckedCreateInput>
  }

  /**
   * Trend createMany
   */
  export type TrendCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Trends.
     */
    data: TrendCreateManyInput | TrendCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Trend createManyAndReturn
   */
  export type TrendCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Trend
     */
    select?: TrendSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Trend
     */
    omit?: TrendOmit<ExtArgs> | null
    /**
     * The data used to create many Trends.
     */
    data: TrendCreateManyInput | TrendCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TrendIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Trend update
   */
  export type TrendUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Trend
     */
    select?: TrendSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Trend
     */
    omit?: TrendOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TrendInclude<ExtArgs> | null
    /**
     * The data needed to update a Trend.
     */
    data: XOR<TrendUpdateInput, TrendUncheckedUpdateInput>
    /**
     * Choose, which Trend to update.
     */
    where: TrendWhereUniqueInput
  }

  /**
   * Trend updateMany
   */
  export type TrendUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Trends.
     */
    data: XOR<TrendUpdateManyMutationInput, TrendUncheckedUpdateManyInput>
    /**
     * Filter which Trends to update
     */
    where?: TrendWhereInput
    /**
     * Limit how many Trends to update.
     */
    limit?: number
  }

  /**
   * Trend updateManyAndReturn
   */
  export type TrendUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Trend
     */
    select?: TrendSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Trend
     */
    omit?: TrendOmit<ExtArgs> | null
    /**
     * The data used to update Trends.
     */
    data: XOR<TrendUpdateManyMutationInput, TrendUncheckedUpdateManyInput>
    /**
     * Filter which Trends to update
     */
    where?: TrendWhereInput
    /**
     * Limit how many Trends to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TrendIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Trend upsert
   */
  export type TrendUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Trend
     */
    select?: TrendSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Trend
     */
    omit?: TrendOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TrendInclude<ExtArgs> | null
    /**
     * The filter to search for the Trend to update in case it exists.
     */
    where: TrendWhereUniqueInput
    /**
     * In case the Trend found by the `where` argument doesn't exist, create a new Trend with this data.
     */
    create: XOR<TrendCreateInput, TrendUncheckedCreateInput>
    /**
     * In case the Trend was found with the provided `where` argument, update it with this data.
     */
    update: XOR<TrendUpdateInput, TrendUncheckedUpdateInput>
  }

  /**
   * Trend delete
   */
  export type TrendDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Trend
     */
    select?: TrendSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Trend
     */
    omit?: TrendOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TrendInclude<ExtArgs> | null
    /**
     * Filter which Trend to delete.
     */
    where: TrendWhereUniqueInput
  }

  /**
   * Trend deleteMany
   */
  export type TrendDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Trends to delete
     */
    where?: TrendWhereInput
    /**
     * Limit how many Trends to delete.
     */
    limit?: number
  }

  /**
   * Trend without action
   */
  export type TrendDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Trend
     */
    select?: TrendSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Trend
     */
    omit?: TrendOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TrendInclude<ExtArgs> | null
  }


  /**
   * Model AgentStrategy
   */

  export type AggregateAgentStrategy = {
    _count: AgentStrategyCountAggregateOutputType | null
    _min: AgentStrategyMinAggregateOutputType | null
    _max: AgentStrategyMaxAggregateOutputType | null
  }

  export type AgentStrategyMinAggregateOutputType = {
    id: string | null
    organizationId: string | null
    name: string | null
    avatar: string | null
    platformsJson: string | null
    status: string | null
    isActive: boolean | null
    lastRunAt: string | null
    createdAt: string | null
    updatedAt: string | null
  }

  export type AgentStrategyMaxAggregateOutputType = {
    id: string | null
    organizationId: string | null
    name: string | null
    avatar: string | null
    platformsJson: string | null
    status: string | null
    isActive: boolean | null
    lastRunAt: string | null
    createdAt: string | null
    updatedAt: string | null
  }

  export type AgentStrategyCountAggregateOutputType = {
    id: number
    organizationId: number
    name: number
    avatar: number
    platformsJson: number
    status: number
    isActive: number
    lastRunAt: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type AgentStrategyMinAggregateInputType = {
    id?: true
    organizationId?: true
    name?: true
    avatar?: true
    platformsJson?: true
    status?: true
    isActive?: true
    lastRunAt?: true
    createdAt?: true
    updatedAt?: true
  }

  export type AgentStrategyMaxAggregateInputType = {
    id?: true
    organizationId?: true
    name?: true
    avatar?: true
    platformsJson?: true
    status?: true
    isActive?: true
    lastRunAt?: true
    createdAt?: true
    updatedAt?: true
  }

  export type AgentStrategyCountAggregateInputType = {
    id?: true
    organizationId?: true
    name?: true
    avatar?: true
    platformsJson?: true
    status?: true
    isActive?: true
    lastRunAt?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type AgentStrategyAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which AgentStrategy to aggregate.
     */
    where?: AgentStrategyWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AgentStrategies to fetch.
     */
    orderBy?: AgentStrategyOrderByWithRelationInput | AgentStrategyOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: AgentStrategyWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AgentStrategies from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AgentStrategies.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned AgentStrategies
    **/
    _count?: true | AgentStrategyCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: AgentStrategyMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: AgentStrategyMaxAggregateInputType
  }

  export type GetAgentStrategyAggregateType<T extends AgentStrategyAggregateArgs> = {
        [P in keyof T & keyof AggregateAgentStrategy]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateAgentStrategy[P]>
      : GetScalarType<T[P], AggregateAgentStrategy[P]>
  }




  export type AgentStrategyGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: AgentStrategyWhereInput
    orderBy?: AgentStrategyOrderByWithAggregationInput | AgentStrategyOrderByWithAggregationInput[]
    by: AgentStrategyScalarFieldEnum[] | AgentStrategyScalarFieldEnum
    having?: AgentStrategyScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: AgentStrategyCountAggregateInputType | true
    _min?: AgentStrategyMinAggregateInputType
    _max?: AgentStrategyMaxAggregateInputType
  }

  export type AgentStrategyGroupByOutputType = {
    id: string
    organizationId: string
    name: string
    avatar: string | null
    platformsJson: string
    status: string
    isActive: boolean
    lastRunAt: string | null
    createdAt: string
    updatedAt: string
    _count: AgentStrategyCountAggregateOutputType | null
    _min: AgentStrategyMinAggregateOutputType | null
    _max: AgentStrategyMaxAggregateOutputType | null
  }

  type GetAgentStrategyGroupByPayload<T extends AgentStrategyGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<AgentStrategyGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof AgentStrategyGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], AgentStrategyGroupByOutputType[P]>
            : GetScalarType<T[P], AgentStrategyGroupByOutputType[P]>
        }
      >
    >


  export type AgentStrategySelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    organizationId?: boolean
    name?: boolean
    avatar?: boolean
    platformsJson?: boolean
    status?: boolean
    isActive?: boolean
    lastRunAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
    workflows?: boolean | AgentStrategy$workflowsArgs<ExtArgs>
    _count?: boolean | AgentStrategyCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["agentStrategy"]>

  export type AgentStrategySelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    organizationId?: boolean
    name?: boolean
    avatar?: boolean
    platformsJson?: boolean
    status?: boolean
    isActive?: boolean
    lastRunAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["agentStrategy"]>

  export type AgentStrategySelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    organizationId?: boolean
    name?: boolean
    avatar?: boolean
    platformsJson?: boolean
    status?: boolean
    isActive?: boolean
    lastRunAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["agentStrategy"]>

  export type AgentStrategySelectScalar = {
    id?: boolean
    organizationId?: boolean
    name?: boolean
    avatar?: boolean
    platformsJson?: boolean
    status?: boolean
    isActive?: boolean
    lastRunAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type AgentStrategyOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "organizationId" | "name" | "avatar" | "platformsJson" | "status" | "isActive" | "lastRunAt" | "createdAt" | "updatedAt", ExtArgs["result"]["agentStrategy"]>
  export type AgentStrategyInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
    workflows?: boolean | AgentStrategy$workflowsArgs<ExtArgs>
    _count?: boolean | AgentStrategyCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type AgentStrategyIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }
  export type AgentStrategyIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }

  export type $AgentStrategyPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "AgentStrategy"
    objects: {
      organization: Prisma.$OrganizationPayload<ExtArgs>
      workflows: Prisma.$WorkflowExecutionPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      organizationId: string
      name: string
      avatar: string | null
      platformsJson: string
      status: string
      isActive: boolean
      lastRunAt: string | null
      createdAt: string
      updatedAt: string
    }, ExtArgs["result"]["agentStrategy"]>
    composites: {}
  }

  type AgentStrategyGetPayload<S extends boolean | null | undefined | AgentStrategyDefaultArgs> = $Result.GetResult<Prisma.$AgentStrategyPayload, S>

  type AgentStrategyCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<AgentStrategyFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: AgentStrategyCountAggregateInputType | true
    }

  export interface AgentStrategyDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['AgentStrategy'], meta: { name: 'AgentStrategy' } }
    /**
     * Find zero or one AgentStrategy that matches the filter.
     * @param {AgentStrategyFindUniqueArgs} args - Arguments to find a AgentStrategy
     * @example
     * // Get one AgentStrategy
     * const agentStrategy = await prisma.agentStrategy.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends AgentStrategyFindUniqueArgs>(args: SelectSubset<T, AgentStrategyFindUniqueArgs<ExtArgs>>): Prisma__AgentStrategyClient<$Result.GetResult<Prisma.$AgentStrategyPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one AgentStrategy that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {AgentStrategyFindUniqueOrThrowArgs} args - Arguments to find a AgentStrategy
     * @example
     * // Get one AgentStrategy
     * const agentStrategy = await prisma.agentStrategy.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends AgentStrategyFindUniqueOrThrowArgs>(args: SelectSubset<T, AgentStrategyFindUniqueOrThrowArgs<ExtArgs>>): Prisma__AgentStrategyClient<$Result.GetResult<Prisma.$AgentStrategyPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first AgentStrategy that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AgentStrategyFindFirstArgs} args - Arguments to find a AgentStrategy
     * @example
     * // Get one AgentStrategy
     * const agentStrategy = await prisma.agentStrategy.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends AgentStrategyFindFirstArgs>(args?: SelectSubset<T, AgentStrategyFindFirstArgs<ExtArgs>>): Prisma__AgentStrategyClient<$Result.GetResult<Prisma.$AgentStrategyPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first AgentStrategy that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AgentStrategyFindFirstOrThrowArgs} args - Arguments to find a AgentStrategy
     * @example
     * // Get one AgentStrategy
     * const agentStrategy = await prisma.agentStrategy.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends AgentStrategyFindFirstOrThrowArgs>(args?: SelectSubset<T, AgentStrategyFindFirstOrThrowArgs<ExtArgs>>): Prisma__AgentStrategyClient<$Result.GetResult<Prisma.$AgentStrategyPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more AgentStrategies that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AgentStrategyFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all AgentStrategies
     * const agentStrategies = await prisma.agentStrategy.findMany()
     * 
     * // Get first 10 AgentStrategies
     * const agentStrategies = await prisma.agentStrategy.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const agentStrategyWithIdOnly = await prisma.agentStrategy.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends AgentStrategyFindManyArgs>(args?: SelectSubset<T, AgentStrategyFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AgentStrategyPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a AgentStrategy.
     * @param {AgentStrategyCreateArgs} args - Arguments to create a AgentStrategy.
     * @example
     * // Create one AgentStrategy
     * const AgentStrategy = await prisma.agentStrategy.create({
     *   data: {
     *     // ... data to create a AgentStrategy
     *   }
     * })
     * 
     */
    create<T extends AgentStrategyCreateArgs>(args: SelectSubset<T, AgentStrategyCreateArgs<ExtArgs>>): Prisma__AgentStrategyClient<$Result.GetResult<Prisma.$AgentStrategyPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many AgentStrategies.
     * @param {AgentStrategyCreateManyArgs} args - Arguments to create many AgentStrategies.
     * @example
     * // Create many AgentStrategies
     * const agentStrategy = await prisma.agentStrategy.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends AgentStrategyCreateManyArgs>(args?: SelectSubset<T, AgentStrategyCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many AgentStrategies and returns the data saved in the database.
     * @param {AgentStrategyCreateManyAndReturnArgs} args - Arguments to create many AgentStrategies.
     * @example
     * // Create many AgentStrategies
     * const agentStrategy = await prisma.agentStrategy.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many AgentStrategies and only return the `id`
     * const agentStrategyWithIdOnly = await prisma.agentStrategy.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends AgentStrategyCreateManyAndReturnArgs>(args?: SelectSubset<T, AgentStrategyCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AgentStrategyPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a AgentStrategy.
     * @param {AgentStrategyDeleteArgs} args - Arguments to delete one AgentStrategy.
     * @example
     * // Delete one AgentStrategy
     * const AgentStrategy = await prisma.agentStrategy.delete({
     *   where: {
     *     // ... filter to delete one AgentStrategy
     *   }
     * })
     * 
     */
    delete<T extends AgentStrategyDeleteArgs>(args: SelectSubset<T, AgentStrategyDeleteArgs<ExtArgs>>): Prisma__AgentStrategyClient<$Result.GetResult<Prisma.$AgentStrategyPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one AgentStrategy.
     * @param {AgentStrategyUpdateArgs} args - Arguments to update one AgentStrategy.
     * @example
     * // Update one AgentStrategy
     * const agentStrategy = await prisma.agentStrategy.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends AgentStrategyUpdateArgs>(args: SelectSubset<T, AgentStrategyUpdateArgs<ExtArgs>>): Prisma__AgentStrategyClient<$Result.GetResult<Prisma.$AgentStrategyPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more AgentStrategies.
     * @param {AgentStrategyDeleteManyArgs} args - Arguments to filter AgentStrategies to delete.
     * @example
     * // Delete a few AgentStrategies
     * const { count } = await prisma.agentStrategy.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends AgentStrategyDeleteManyArgs>(args?: SelectSubset<T, AgentStrategyDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more AgentStrategies.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AgentStrategyUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many AgentStrategies
     * const agentStrategy = await prisma.agentStrategy.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends AgentStrategyUpdateManyArgs>(args: SelectSubset<T, AgentStrategyUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more AgentStrategies and returns the data updated in the database.
     * @param {AgentStrategyUpdateManyAndReturnArgs} args - Arguments to update many AgentStrategies.
     * @example
     * // Update many AgentStrategies
     * const agentStrategy = await prisma.agentStrategy.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more AgentStrategies and only return the `id`
     * const agentStrategyWithIdOnly = await prisma.agentStrategy.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends AgentStrategyUpdateManyAndReturnArgs>(args: SelectSubset<T, AgentStrategyUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AgentStrategyPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one AgentStrategy.
     * @param {AgentStrategyUpsertArgs} args - Arguments to update or create a AgentStrategy.
     * @example
     * // Update or create a AgentStrategy
     * const agentStrategy = await prisma.agentStrategy.upsert({
     *   create: {
     *     // ... data to create a AgentStrategy
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the AgentStrategy we want to update
     *   }
     * })
     */
    upsert<T extends AgentStrategyUpsertArgs>(args: SelectSubset<T, AgentStrategyUpsertArgs<ExtArgs>>): Prisma__AgentStrategyClient<$Result.GetResult<Prisma.$AgentStrategyPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of AgentStrategies.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AgentStrategyCountArgs} args - Arguments to filter AgentStrategies to count.
     * @example
     * // Count the number of AgentStrategies
     * const count = await prisma.agentStrategy.count({
     *   where: {
     *     // ... the filter for the AgentStrategies we want to count
     *   }
     * })
    **/
    count<T extends AgentStrategyCountArgs>(
      args?: Subset<T, AgentStrategyCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], AgentStrategyCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a AgentStrategy.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AgentStrategyAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends AgentStrategyAggregateArgs>(args: Subset<T, AgentStrategyAggregateArgs>): Prisma.PrismaPromise<GetAgentStrategyAggregateType<T>>

    /**
     * Group by AgentStrategy.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AgentStrategyGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends AgentStrategyGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: AgentStrategyGroupByArgs['orderBy'] }
        : { orderBy?: AgentStrategyGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, AgentStrategyGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetAgentStrategyGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the AgentStrategy model
   */
  readonly fields: AgentStrategyFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for AgentStrategy.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__AgentStrategyClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    organization<T extends OrganizationDefaultArgs<ExtArgs> = {}>(args?: Subset<T, OrganizationDefaultArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    workflows<T extends AgentStrategy$workflowsArgs<ExtArgs> = {}>(args?: Subset<T, AgentStrategy$workflowsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkflowExecutionPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the AgentStrategy model
   */
  interface AgentStrategyFieldRefs {
    readonly id: FieldRef<"AgentStrategy", 'String'>
    readonly organizationId: FieldRef<"AgentStrategy", 'String'>
    readonly name: FieldRef<"AgentStrategy", 'String'>
    readonly avatar: FieldRef<"AgentStrategy", 'String'>
    readonly platformsJson: FieldRef<"AgentStrategy", 'String'>
    readonly status: FieldRef<"AgentStrategy", 'String'>
    readonly isActive: FieldRef<"AgentStrategy", 'Boolean'>
    readonly lastRunAt: FieldRef<"AgentStrategy", 'String'>
    readonly createdAt: FieldRef<"AgentStrategy", 'String'>
    readonly updatedAt: FieldRef<"AgentStrategy", 'String'>
  }
    

  // Custom InputTypes
  /**
   * AgentStrategy findUnique
   */
  export type AgentStrategyFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AgentStrategy
     */
    select?: AgentStrategySelect<ExtArgs> | null
    /**
     * Omit specific fields from the AgentStrategy
     */
    omit?: AgentStrategyOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AgentStrategyInclude<ExtArgs> | null
    /**
     * Filter, which AgentStrategy to fetch.
     */
    where: AgentStrategyWhereUniqueInput
  }

  /**
   * AgentStrategy findUniqueOrThrow
   */
  export type AgentStrategyFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AgentStrategy
     */
    select?: AgentStrategySelect<ExtArgs> | null
    /**
     * Omit specific fields from the AgentStrategy
     */
    omit?: AgentStrategyOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AgentStrategyInclude<ExtArgs> | null
    /**
     * Filter, which AgentStrategy to fetch.
     */
    where: AgentStrategyWhereUniqueInput
  }

  /**
   * AgentStrategy findFirst
   */
  export type AgentStrategyFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AgentStrategy
     */
    select?: AgentStrategySelect<ExtArgs> | null
    /**
     * Omit specific fields from the AgentStrategy
     */
    omit?: AgentStrategyOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AgentStrategyInclude<ExtArgs> | null
    /**
     * Filter, which AgentStrategy to fetch.
     */
    where?: AgentStrategyWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AgentStrategies to fetch.
     */
    orderBy?: AgentStrategyOrderByWithRelationInput | AgentStrategyOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for AgentStrategies.
     */
    cursor?: AgentStrategyWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AgentStrategies from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AgentStrategies.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AgentStrategies.
     */
    distinct?: AgentStrategyScalarFieldEnum | AgentStrategyScalarFieldEnum[]
  }

  /**
   * AgentStrategy findFirstOrThrow
   */
  export type AgentStrategyFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AgentStrategy
     */
    select?: AgentStrategySelect<ExtArgs> | null
    /**
     * Omit specific fields from the AgentStrategy
     */
    omit?: AgentStrategyOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AgentStrategyInclude<ExtArgs> | null
    /**
     * Filter, which AgentStrategy to fetch.
     */
    where?: AgentStrategyWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AgentStrategies to fetch.
     */
    orderBy?: AgentStrategyOrderByWithRelationInput | AgentStrategyOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for AgentStrategies.
     */
    cursor?: AgentStrategyWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AgentStrategies from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AgentStrategies.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AgentStrategies.
     */
    distinct?: AgentStrategyScalarFieldEnum | AgentStrategyScalarFieldEnum[]
  }

  /**
   * AgentStrategy findMany
   */
  export type AgentStrategyFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AgentStrategy
     */
    select?: AgentStrategySelect<ExtArgs> | null
    /**
     * Omit specific fields from the AgentStrategy
     */
    omit?: AgentStrategyOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AgentStrategyInclude<ExtArgs> | null
    /**
     * Filter, which AgentStrategies to fetch.
     */
    where?: AgentStrategyWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AgentStrategies to fetch.
     */
    orderBy?: AgentStrategyOrderByWithRelationInput | AgentStrategyOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing AgentStrategies.
     */
    cursor?: AgentStrategyWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AgentStrategies from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AgentStrategies.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AgentStrategies.
     */
    distinct?: AgentStrategyScalarFieldEnum | AgentStrategyScalarFieldEnum[]
  }

  /**
   * AgentStrategy create
   */
  export type AgentStrategyCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AgentStrategy
     */
    select?: AgentStrategySelect<ExtArgs> | null
    /**
     * Omit specific fields from the AgentStrategy
     */
    omit?: AgentStrategyOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AgentStrategyInclude<ExtArgs> | null
    /**
     * The data needed to create a AgentStrategy.
     */
    data: XOR<AgentStrategyCreateInput, AgentStrategyUncheckedCreateInput>
  }

  /**
   * AgentStrategy createMany
   */
  export type AgentStrategyCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many AgentStrategies.
     */
    data: AgentStrategyCreateManyInput | AgentStrategyCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * AgentStrategy createManyAndReturn
   */
  export type AgentStrategyCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AgentStrategy
     */
    select?: AgentStrategySelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the AgentStrategy
     */
    omit?: AgentStrategyOmit<ExtArgs> | null
    /**
     * The data used to create many AgentStrategies.
     */
    data: AgentStrategyCreateManyInput | AgentStrategyCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AgentStrategyIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * AgentStrategy update
   */
  export type AgentStrategyUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AgentStrategy
     */
    select?: AgentStrategySelect<ExtArgs> | null
    /**
     * Omit specific fields from the AgentStrategy
     */
    omit?: AgentStrategyOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AgentStrategyInclude<ExtArgs> | null
    /**
     * The data needed to update a AgentStrategy.
     */
    data: XOR<AgentStrategyUpdateInput, AgentStrategyUncheckedUpdateInput>
    /**
     * Choose, which AgentStrategy to update.
     */
    where: AgentStrategyWhereUniqueInput
  }

  /**
   * AgentStrategy updateMany
   */
  export type AgentStrategyUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update AgentStrategies.
     */
    data: XOR<AgentStrategyUpdateManyMutationInput, AgentStrategyUncheckedUpdateManyInput>
    /**
     * Filter which AgentStrategies to update
     */
    where?: AgentStrategyWhereInput
    /**
     * Limit how many AgentStrategies to update.
     */
    limit?: number
  }

  /**
   * AgentStrategy updateManyAndReturn
   */
  export type AgentStrategyUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AgentStrategy
     */
    select?: AgentStrategySelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the AgentStrategy
     */
    omit?: AgentStrategyOmit<ExtArgs> | null
    /**
     * The data used to update AgentStrategies.
     */
    data: XOR<AgentStrategyUpdateManyMutationInput, AgentStrategyUncheckedUpdateManyInput>
    /**
     * Filter which AgentStrategies to update
     */
    where?: AgentStrategyWhereInput
    /**
     * Limit how many AgentStrategies to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AgentStrategyIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * AgentStrategy upsert
   */
  export type AgentStrategyUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AgentStrategy
     */
    select?: AgentStrategySelect<ExtArgs> | null
    /**
     * Omit specific fields from the AgentStrategy
     */
    omit?: AgentStrategyOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AgentStrategyInclude<ExtArgs> | null
    /**
     * The filter to search for the AgentStrategy to update in case it exists.
     */
    where: AgentStrategyWhereUniqueInput
    /**
     * In case the AgentStrategy found by the `where` argument doesn't exist, create a new AgentStrategy with this data.
     */
    create: XOR<AgentStrategyCreateInput, AgentStrategyUncheckedCreateInput>
    /**
     * In case the AgentStrategy was found with the provided `where` argument, update it with this data.
     */
    update: XOR<AgentStrategyUpdateInput, AgentStrategyUncheckedUpdateInput>
  }

  /**
   * AgentStrategy delete
   */
  export type AgentStrategyDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AgentStrategy
     */
    select?: AgentStrategySelect<ExtArgs> | null
    /**
     * Omit specific fields from the AgentStrategy
     */
    omit?: AgentStrategyOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AgentStrategyInclude<ExtArgs> | null
    /**
     * Filter which AgentStrategy to delete.
     */
    where: AgentStrategyWhereUniqueInput
  }

  /**
   * AgentStrategy deleteMany
   */
  export type AgentStrategyDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which AgentStrategies to delete
     */
    where?: AgentStrategyWhereInput
    /**
     * Limit how many AgentStrategies to delete.
     */
    limit?: number
  }

  /**
   * AgentStrategy.workflows
   */
  export type AgentStrategy$workflowsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowExecution
     */
    select?: WorkflowExecutionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkflowExecution
     */
    omit?: WorkflowExecutionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowExecutionInclude<ExtArgs> | null
    where?: WorkflowExecutionWhereInput
    orderBy?: WorkflowExecutionOrderByWithRelationInput | WorkflowExecutionOrderByWithRelationInput[]
    cursor?: WorkflowExecutionWhereUniqueInput
    take?: number
    skip?: number
    distinct?: WorkflowExecutionScalarFieldEnum | WorkflowExecutionScalarFieldEnum[]
  }

  /**
   * AgentStrategy without action
   */
  export type AgentStrategyDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AgentStrategy
     */
    select?: AgentStrategySelect<ExtArgs> | null
    /**
     * Omit specific fields from the AgentStrategy
     */
    omit?: AgentStrategyOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AgentStrategyInclude<ExtArgs> | null
  }


  /**
   * Model Workflow
   */

  export type AggregateWorkflow = {
    _count: WorkflowCountAggregateOutputType | null
    _avg: WorkflowAvgAggregateOutputType | null
    _sum: WorkflowSumAggregateOutputType | null
    _min: WorkflowMinAggregateOutputType | null
    _max: WorkflowMaxAggregateOutputType | null
  }

  export type WorkflowAvgAggregateOutputType = {
    nodeCount: number | null
  }

  export type WorkflowSumAggregateOutputType = {
    nodeCount: number | null
  }

  export type WorkflowMinAggregateOutputType = {
    id: string | null
    organizationId: string | null
    name: string | null
    description: string | null
    lifecycle: string | null
    nodeCount: number | null
    supportsBatch: boolean | null
    lastExecutedAt: string | null
    createdAt: string | null
    updatedAt: string | null
  }

  export type WorkflowMaxAggregateOutputType = {
    id: string | null
    organizationId: string | null
    name: string | null
    description: string | null
    lifecycle: string | null
    nodeCount: number | null
    supportsBatch: boolean | null
    lastExecutedAt: string | null
    createdAt: string | null
    updatedAt: string | null
  }

  export type WorkflowCountAggregateOutputType = {
    id: number
    organizationId: number
    name: number
    description: number
    lifecycle: number
    nodeCount: number
    supportsBatch: number
    lastExecutedAt: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type WorkflowAvgAggregateInputType = {
    nodeCount?: true
  }

  export type WorkflowSumAggregateInputType = {
    nodeCount?: true
  }

  export type WorkflowMinAggregateInputType = {
    id?: true
    organizationId?: true
    name?: true
    description?: true
    lifecycle?: true
    nodeCount?: true
    supportsBatch?: true
    lastExecutedAt?: true
    createdAt?: true
    updatedAt?: true
  }

  export type WorkflowMaxAggregateInputType = {
    id?: true
    organizationId?: true
    name?: true
    description?: true
    lifecycle?: true
    nodeCount?: true
    supportsBatch?: true
    lastExecutedAt?: true
    createdAt?: true
    updatedAt?: true
  }

  export type WorkflowCountAggregateInputType = {
    id?: true
    organizationId?: true
    name?: true
    description?: true
    lifecycle?: true
    nodeCount?: true
    supportsBatch?: true
    lastExecutedAt?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type WorkflowAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Workflow to aggregate.
     */
    where?: WorkflowWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Workflows to fetch.
     */
    orderBy?: WorkflowOrderByWithRelationInput | WorkflowOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: WorkflowWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Workflows from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Workflows.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Workflows
    **/
    _count?: true | WorkflowCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: WorkflowAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: WorkflowSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: WorkflowMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: WorkflowMaxAggregateInputType
  }

  export type GetWorkflowAggregateType<T extends WorkflowAggregateArgs> = {
        [P in keyof T & keyof AggregateWorkflow]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateWorkflow[P]>
      : GetScalarType<T[P], AggregateWorkflow[P]>
  }




  export type WorkflowGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: WorkflowWhereInput
    orderBy?: WorkflowOrderByWithAggregationInput | WorkflowOrderByWithAggregationInput[]
    by: WorkflowScalarFieldEnum[] | WorkflowScalarFieldEnum
    having?: WorkflowScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: WorkflowCountAggregateInputType | true
    _avg?: WorkflowAvgAggregateInputType
    _sum?: WorkflowSumAggregateInputType
    _min?: WorkflowMinAggregateInputType
    _max?: WorkflowMaxAggregateInputType
  }

  export type WorkflowGroupByOutputType = {
    id: string
    organizationId: string
    name: string
    description: string | null
    lifecycle: string
    nodeCount: number
    supportsBatch: boolean
    lastExecutedAt: string | null
    createdAt: string
    updatedAt: string
    _count: WorkflowCountAggregateOutputType | null
    _avg: WorkflowAvgAggregateOutputType | null
    _sum: WorkflowSumAggregateOutputType | null
    _min: WorkflowMinAggregateOutputType | null
    _max: WorkflowMaxAggregateOutputType | null
  }

  type GetWorkflowGroupByPayload<T extends WorkflowGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<WorkflowGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof WorkflowGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], WorkflowGroupByOutputType[P]>
            : GetScalarType<T[P], WorkflowGroupByOutputType[P]>
        }
      >
    >


  export type WorkflowSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    organizationId?: boolean
    name?: boolean
    description?: boolean
    lifecycle?: boolean
    nodeCount?: boolean
    supportsBatch?: boolean
    lastExecutedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
    executions?: boolean | Workflow$executionsArgs<ExtArgs>
    _count?: boolean | WorkflowCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["workflow"]>

  export type WorkflowSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    organizationId?: boolean
    name?: boolean
    description?: boolean
    lifecycle?: boolean
    nodeCount?: boolean
    supportsBatch?: boolean
    lastExecutedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["workflow"]>

  export type WorkflowSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    organizationId?: boolean
    name?: boolean
    description?: boolean
    lifecycle?: boolean
    nodeCount?: boolean
    supportsBatch?: boolean
    lastExecutedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["workflow"]>

  export type WorkflowSelectScalar = {
    id?: boolean
    organizationId?: boolean
    name?: boolean
    description?: boolean
    lifecycle?: boolean
    nodeCount?: boolean
    supportsBatch?: boolean
    lastExecutedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type WorkflowOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "organizationId" | "name" | "description" | "lifecycle" | "nodeCount" | "supportsBatch" | "lastExecutedAt" | "createdAt" | "updatedAt", ExtArgs["result"]["workflow"]>
  export type WorkflowInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
    executions?: boolean | Workflow$executionsArgs<ExtArgs>
    _count?: boolean | WorkflowCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type WorkflowIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }
  export type WorkflowIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }

  export type $WorkflowPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Workflow"
    objects: {
      organization: Prisma.$OrganizationPayload<ExtArgs>
      executions: Prisma.$WorkflowExecutionPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      organizationId: string
      name: string
      description: string | null
      lifecycle: string
      nodeCount: number
      supportsBatch: boolean
      lastExecutedAt: string | null
      createdAt: string
      updatedAt: string
    }, ExtArgs["result"]["workflow"]>
    composites: {}
  }

  type WorkflowGetPayload<S extends boolean | null | undefined | WorkflowDefaultArgs> = $Result.GetResult<Prisma.$WorkflowPayload, S>

  type WorkflowCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<WorkflowFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: WorkflowCountAggregateInputType | true
    }

  export interface WorkflowDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Workflow'], meta: { name: 'Workflow' } }
    /**
     * Find zero or one Workflow that matches the filter.
     * @param {WorkflowFindUniqueArgs} args - Arguments to find a Workflow
     * @example
     * // Get one Workflow
     * const workflow = await prisma.workflow.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends WorkflowFindUniqueArgs>(args: SelectSubset<T, WorkflowFindUniqueArgs<ExtArgs>>): Prisma__WorkflowClient<$Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Workflow that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {WorkflowFindUniqueOrThrowArgs} args - Arguments to find a Workflow
     * @example
     * // Get one Workflow
     * const workflow = await prisma.workflow.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends WorkflowFindUniqueOrThrowArgs>(args: SelectSubset<T, WorkflowFindUniqueOrThrowArgs<ExtArgs>>): Prisma__WorkflowClient<$Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Workflow that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowFindFirstArgs} args - Arguments to find a Workflow
     * @example
     * // Get one Workflow
     * const workflow = await prisma.workflow.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends WorkflowFindFirstArgs>(args?: SelectSubset<T, WorkflowFindFirstArgs<ExtArgs>>): Prisma__WorkflowClient<$Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Workflow that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowFindFirstOrThrowArgs} args - Arguments to find a Workflow
     * @example
     * // Get one Workflow
     * const workflow = await prisma.workflow.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends WorkflowFindFirstOrThrowArgs>(args?: SelectSubset<T, WorkflowFindFirstOrThrowArgs<ExtArgs>>): Prisma__WorkflowClient<$Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Workflows that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Workflows
     * const workflows = await prisma.workflow.findMany()
     * 
     * // Get first 10 Workflows
     * const workflows = await prisma.workflow.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const workflowWithIdOnly = await prisma.workflow.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends WorkflowFindManyArgs>(args?: SelectSubset<T, WorkflowFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Workflow.
     * @param {WorkflowCreateArgs} args - Arguments to create a Workflow.
     * @example
     * // Create one Workflow
     * const Workflow = await prisma.workflow.create({
     *   data: {
     *     // ... data to create a Workflow
     *   }
     * })
     * 
     */
    create<T extends WorkflowCreateArgs>(args: SelectSubset<T, WorkflowCreateArgs<ExtArgs>>): Prisma__WorkflowClient<$Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Workflows.
     * @param {WorkflowCreateManyArgs} args - Arguments to create many Workflows.
     * @example
     * // Create many Workflows
     * const workflow = await prisma.workflow.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends WorkflowCreateManyArgs>(args?: SelectSubset<T, WorkflowCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Workflows and returns the data saved in the database.
     * @param {WorkflowCreateManyAndReturnArgs} args - Arguments to create many Workflows.
     * @example
     * // Create many Workflows
     * const workflow = await prisma.workflow.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Workflows and only return the `id`
     * const workflowWithIdOnly = await prisma.workflow.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends WorkflowCreateManyAndReturnArgs>(args?: SelectSubset<T, WorkflowCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Workflow.
     * @param {WorkflowDeleteArgs} args - Arguments to delete one Workflow.
     * @example
     * // Delete one Workflow
     * const Workflow = await prisma.workflow.delete({
     *   where: {
     *     // ... filter to delete one Workflow
     *   }
     * })
     * 
     */
    delete<T extends WorkflowDeleteArgs>(args: SelectSubset<T, WorkflowDeleteArgs<ExtArgs>>): Prisma__WorkflowClient<$Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Workflow.
     * @param {WorkflowUpdateArgs} args - Arguments to update one Workflow.
     * @example
     * // Update one Workflow
     * const workflow = await prisma.workflow.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends WorkflowUpdateArgs>(args: SelectSubset<T, WorkflowUpdateArgs<ExtArgs>>): Prisma__WorkflowClient<$Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Workflows.
     * @param {WorkflowDeleteManyArgs} args - Arguments to filter Workflows to delete.
     * @example
     * // Delete a few Workflows
     * const { count } = await prisma.workflow.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends WorkflowDeleteManyArgs>(args?: SelectSubset<T, WorkflowDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Workflows.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Workflows
     * const workflow = await prisma.workflow.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends WorkflowUpdateManyArgs>(args: SelectSubset<T, WorkflowUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Workflows and returns the data updated in the database.
     * @param {WorkflowUpdateManyAndReturnArgs} args - Arguments to update many Workflows.
     * @example
     * // Update many Workflows
     * const workflow = await prisma.workflow.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Workflows and only return the `id`
     * const workflowWithIdOnly = await prisma.workflow.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends WorkflowUpdateManyAndReturnArgs>(args: SelectSubset<T, WorkflowUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Workflow.
     * @param {WorkflowUpsertArgs} args - Arguments to update or create a Workflow.
     * @example
     * // Update or create a Workflow
     * const workflow = await prisma.workflow.upsert({
     *   create: {
     *     // ... data to create a Workflow
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Workflow we want to update
     *   }
     * })
     */
    upsert<T extends WorkflowUpsertArgs>(args: SelectSubset<T, WorkflowUpsertArgs<ExtArgs>>): Prisma__WorkflowClient<$Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Workflows.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowCountArgs} args - Arguments to filter Workflows to count.
     * @example
     * // Count the number of Workflows
     * const count = await prisma.workflow.count({
     *   where: {
     *     // ... the filter for the Workflows we want to count
     *   }
     * })
    **/
    count<T extends WorkflowCountArgs>(
      args?: Subset<T, WorkflowCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], WorkflowCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Workflow.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends WorkflowAggregateArgs>(args: Subset<T, WorkflowAggregateArgs>): Prisma.PrismaPromise<GetWorkflowAggregateType<T>>

    /**
     * Group by Workflow.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends WorkflowGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: WorkflowGroupByArgs['orderBy'] }
        : { orderBy?: WorkflowGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, WorkflowGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetWorkflowGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Workflow model
   */
  readonly fields: WorkflowFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Workflow.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__WorkflowClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    organization<T extends OrganizationDefaultArgs<ExtArgs> = {}>(args?: Subset<T, OrganizationDefaultArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    executions<T extends Workflow$executionsArgs<ExtArgs> = {}>(args?: Subset<T, Workflow$executionsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkflowExecutionPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Workflow model
   */
  interface WorkflowFieldRefs {
    readonly id: FieldRef<"Workflow", 'String'>
    readonly organizationId: FieldRef<"Workflow", 'String'>
    readonly name: FieldRef<"Workflow", 'String'>
    readonly description: FieldRef<"Workflow", 'String'>
    readonly lifecycle: FieldRef<"Workflow", 'String'>
    readonly nodeCount: FieldRef<"Workflow", 'Int'>
    readonly supportsBatch: FieldRef<"Workflow", 'Boolean'>
    readonly lastExecutedAt: FieldRef<"Workflow", 'String'>
    readonly createdAt: FieldRef<"Workflow", 'String'>
    readonly updatedAt: FieldRef<"Workflow", 'String'>
  }
    

  // Custom InputTypes
  /**
   * Workflow findUnique
   */
  export type WorkflowFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workflow
     */
    select?: WorkflowSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workflow
     */
    omit?: WorkflowOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowInclude<ExtArgs> | null
    /**
     * Filter, which Workflow to fetch.
     */
    where: WorkflowWhereUniqueInput
  }

  /**
   * Workflow findUniqueOrThrow
   */
  export type WorkflowFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workflow
     */
    select?: WorkflowSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workflow
     */
    omit?: WorkflowOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowInclude<ExtArgs> | null
    /**
     * Filter, which Workflow to fetch.
     */
    where: WorkflowWhereUniqueInput
  }

  /**
   * Workflow findFirst
   */
  export type WorkflowFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workflow
     */
    select?: WorkflowSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workflow
     */
    omit?: WorkflowOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowInclude<ExtArgs> | null
    /**
     * Filter, which Workflow to fetch.
     */
    where?: WorkflowWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Workflows to fetch.
     */
    orderBy?: WorkflowOrderByWithRelationInput | WorkflowOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Workflows.
     */
    cursor?: WorkflowWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Workflows from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Workflows.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Workflows.
     */
    distinct?: WorkflowScalarFieldEnum | WorkflowScalarFieldEnum[]
  }

  /**
   * Workflow findFirstOrThrow
   */
  export type WorkflowFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workflow
     */
    select?: WorkflowSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workflow
     */
    omit?: WorkflowOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowInclude<ExtArgs> | null
    /**
     * Filter, which Workflow to fetch.
     */
    where?: WorkflowWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Workflows to fetch.
     */
    orderBy?: WorkflowOrderByWithRelationInput | WorkflowOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Workflows.
     */
    cursor?: WorkflowWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Workflows from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Workflows.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Workflows.
     */
    distinct?: WorkflowScalarFieldEnum | WorkflowScalarFieldEnum[]
  }

  /**
   * Workflow findMany
   */
  export type WorkflowFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workflow
     */
    select?: WorkflowSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workflow
     */
    omit?: WorkflowOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowInclude<ExtArgs> | null
    /**
     * Filter, which Workflows to fetch.
     */
    where?: WorkflowWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Workflows to fetch.
     */
    orderBy?: WorkflowOrderByWithRelationInput | WorkflowOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Workflows.
     */
    cursor?: WorkflowWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Workflows from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Workflows.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Workflows.
     */
    distinct?: WorkflowScalarFieldEnum | WorkflowScalarFieldEnum[]
  }

  /**
   * Workflow create
   */
  export type WorkflowCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workflow
     */
    select?: WorkflowSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workflow
     */
    omit?: WorkflowOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowInclude<ExtArgs> | null
    /**
     * The data needed to create a Workflow.
     */
    data: XOR<WorkflowCreateInput, WorkflowUncheckedCreateInput>
  }

  /**
   * Workflow createMany
   */
  export type WorkflowCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Workflows.
     */
    data: WorkflowCreateManyInput | WorkflowCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Workflow createManyAndReturn
   */
  export type WorkflowCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workflow
     */
    select?: WorkflowSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Workflow
     */
    omit?: WorkflowOmit<ExtArgs> | null
    /**
     * The data used to create many Workflows.
     */
    data: WorkflowCreateManyInput | WorkflowCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Workflow update
   */
  export type WorkflowUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workflow
     */
    select?: WorkflowSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workflow
     */
    omit?: WorkflowOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowInclude<ExtArgs> | null
    /**
     * The data needed to update a Workflow.
     */
    data: XOR<WorkflowUpdateInput, WorkflowUncheckedUpdateInput>
    /**
     * Choose, which Workflow to update.
     */
    where: WorkflowWhereUniqueInput
  }

  /**
   * Workflow updateMany
   */
  export type WorkflowUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Workflows.
     */
    data: XOR<WorkflowUpdateManyMutationInput, WorkflowUncheckedUpdateManyInput>
    /**
     * Filter which Workflows to update
     */
    where?: WorkflowWhereInput
    /**
     * Limit how many Workflows to update.
     */
    limit?: number
  }

  /**
   * Workflow updateManyAndReturn
   */
  export type WorkflowUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workflow
     */
    select?: WorkflowSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Workflow
     */
    omit?: WorkflowOmit<ExtArgs> | null
    /**
     * The data used to update Workflows.
     */
    data: XOR<WorkflowUpdateManyMutationInput, WorkflowUncheckedUpdateManyInput>
    /**
     * Filter which Workflows to update
     */
    where?: WorkflowWhereInput
    /**
     * Limit how many Workflows to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Workflow upsert
   */
  export type WorkflowUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workflow
     */
    select?: WorkflowSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workflow
     */
    omit?: WorkflowOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowInclude<ExtArgs> | null
    /**
     * The filter to search for the Workflow to update in case it exists.
     */
    where: WorkflowWhereUniqueInput
    /**
     * In case the Workflow found by the `where` argument doesn't exist, create a new Workflow with this data.
     */
    create: XOR<WorkflowCreateInput, WorkflowUncheckedCreateInput>
    /**
     * In case the Workflow was found with the provided `where` argument, update it with this data.
     */
    update: XOR<WorkflowUpdateInput, WorkflowUncheckedUpdateInput>
  }

  /**
   * Workflow delete
   */
  export type WorkflowDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workflow
     */
    select?: WorkflowSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workflow
     */
    omit?: WorkflowOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowInclude<ExtArgs> | null
    /**
     * Filter which Workflow to delete.
     */
    where: WorkflowWhereUniqueInput
  }

  /**
   * Workflow deleteMany
   */
  export type WorkflowDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Workflows to delete
     */
    where?: WorkflowWhereInput
    /**
     * Limit how many Workflows to delete.
     */
    limit?: number
  }

  /**
   * Workflow.executions
   */
  export type Workflow$executionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowExecution
     */
    select?: WorkflowExecutionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkflowExecution
     */
    omit?: WorkflowExecutionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowExecutionInclude<ExtArgs> | null
    where?: WorkflowExecutionWhereInput
    orderBy?: WorkflowExecutionOrderByWithRelationInput | WorkflowExecutionOrderByWithRelationInput[]
    cursor?: WorkflowExecutionWhereUniqueInput
    take?: number
    skip?: number
    distinct?: WorkflowExecutionScalarFieldEnum | WorkflowExecutionScalarFieldEnum[]
  }

  /**
   * Workflow without action
   */
  export type WorkflowDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workflow
     */
    select?: WorkflowSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workflow
     */
    omit?: WorkflowOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowInclude<ExtArgs> | null
  }


  /**
   * Model WorkflowExecution
   */

  export type AggregateWorkflowExecution = {
    _count: WorkflowExecutionCountAggregateOutputType | null
    _min: WorkflowExecutionMinAggregateOutputType | null
    _max: WorkflowExecutionMaxAggregateOutputType | null
  }

  export type WorkflowExecutionMinAggregateOutputType = {
    id: string | null
    workflowId: string | null
    agentStrategyId: string | null
    mode: string | null
    status: string | null
    startedAt: string | null
    completedAt: string | null
  }

  export type WorkflowExecutionMaxAggregateOutputType = {
    id: string | null
    workflowId: string | null
    agentStrategyId: string | null
    mode: string | null
    status: string | null
    startedAt: string | null
    completedAt: string | null
  }

  export type WorkflowExecutionCountAggregateOutputType = {
    id: number
    workflowId: number
    agentStrategyId: number
    mode: number
    status: number
    startedAt: number
    completedAt: number
    _all: number
  }


  export type WorkflowExecutionMinAggregateInputType = {
    id?: true
    workflowId?: true
    agentStrategyId?: true
    mode?: true
    status?: true
    startedAt?: true
    completedAt?: true
  }

  export type WorkflowExecutionMaxAggregateInputType = {
    id?: true
    workflowId?: true
    agentStrategyId?: true
    mode?: true
    status?: true
    startedAt?: true
    completedAt?: true
  }

  export type WorkflowExecutionCountAggregateInputType = {
    id?: true
    workflowId?: true
    agentStrategyId?: true
    mode?: true
    status?: true
    startedAt?: true
    completedAt?: true
    _all?: true
  }

  export type WorkflowExecutionAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which WorkflowExecution to aggregate.
     */
    where?: WorkflowExecutionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WorkflowExecutions to fetch.
     */
    orderBy?: WorkflowExecutionOrderByWithRelationInput | WorkflowExecutionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: WorkflowExecutionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WorkflowExecutions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WorkflowExecutions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned WorkflowExecutions
    **/
    _count?: true | WorkflowExecutionCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: WorkflowExecutionMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: WorkflowExecutionMaxAggregateInputType
  }

  export type GetWorkflowExecutionAggregateType<T extends WorkflowExecutionAggregateArgs> = {
        [P in keyof T & keyof AggregateWorkflowExecution]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateWorkflowExecution[P]>
      : GetScalarType<T[P], AggregateWorkflowExecution[P]>
  }




  export type WorkflowExecutionGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: WorkflowExecutionWhereInput
    orderBy?: WorkflowExecutionOrderByWithAggregationInput | WorkflowExecutionOrderByWithAggregationInput[]
    by: WorkflowExecutionScalarFieldEnum[] | WorkflowExecutionScalarFieldEnum
    having?: WorkflowExecutionScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: WorkflowExecutionCountAggregateInputType | true
    _min?: WorkflowExecutionMinAggregateInputType
    _max?: WorkflowExecutionMaxAggregateInputType
  }

  export type WorkflowExecutionGroupByOutputType = {
    id: string
    workflowId: string
    agentStrategyId: string | null
    mode: string
    status: string
    startedAt: string
    completedAt: string | null
    _count: WorkflowExecutionCountAggregateOutputType | null
    _min: WorkflowExecutionMinAggregateOutputType | null
    _max: WorkflowExecutionMaxAggregateOutputType | null
  }

  type GetWorkflowExecutionGroupByPayload<T extends WorkflowExecutionGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<WorkflowExecutionGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof WorkflowExecutionGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], WorkflowExecutionGroupByOutputType[P]>
            : GetScalarType<T[P], WorkflowExecutionGroupByOutputType[P]>
        }
      >
    >


  export type WorkflowExecutionSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workflowId?: boolean
    agentStrategyId?: boolean
    mode?: boolean
    status?: boolean
    startedAt?: boolean
    completedAt?: boolean
    workflow?: boolean | WorkflowDefaultArgs<ExtArgs>
    agentStrategy?: boolean | WorkflowExecution$agentStrategyArgs<ExtArgs>
  }, ExtArgs["result"]["workflowExecution"]>

  export type WorkflowExecutionSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workflowId?: boolean
    agentStrategyId?: boolean
    mode?: boolean
    status?: boolean
    startedAt?: boolean
    completedAt?: boolean
    workflow?: boolean | WorkflowDefaultArgs<ExtArgs>
    agentStrategy?: boolean | WorkflowExecution$agentStrategyArgs<ExtArgs>
  }, ExtArgs["result"]["workflowExecution"]>

  export type WorkflowExecutionSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workflowId?: boolean
    agentStrategyId?: boolean
    mode?: boolean
    status?: boolean
    startedAt?: boolean
    completedAt?: boolean
    workflow?: boolean | WorkflowDefaultArgs<ExtArgs>
    agentStrategy?: boolean | WorkflowExecution$agentStrategyArgs<ExtArgs>
  }, ExtArgs["result"]["workflowExecution"]>

  export type WorkflowExecutionSelectScalar = {
    id?: boolean
    workflowId?: boolean
    agentStrategyId?: boolean
    mode?: boolean
    status?: boolean
    startedAt?: boolean
    completedAt?: boolean
  }

  export type WorkflowExecutionOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "workflowId" | "agentStrategyId" | "mode" | "status" | "startedAt" | "completedAt", ExtArgs["result"]["workflowExecution"]>
  export type WorkflowExecutionInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workflow?: boolean | WorkflowDefaultArgs<ExtArgs>
    agentStrategy?: boolean | WorkflowExecution$agentStrategyArgs<ExtArgs>
  }
  export type WorkflowExecutionIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workflow?: boolean | WorkflowDefaultArgs<ExtArgs>
    agentStrategy?: boolean | WorkflowExecution$agentStrategyArgs<ExtArgs>
  }
  export type WorkflowExecutionIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workflow?: boolean | WorkflowDefaultArgs<ExtArgs>
    agentStrategy?: boolean | WorkflowExecution$agentStrategyArgs<ExtArgs>
  }

  export type $WorkflowExecutionPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "WorkflowExecution"
    objects: {
      workflow: Prisma.$WorkflowPayload<ExtArgs>
      agentStrategy: Prisma.$AgentStrategyPayload<ExtArgs> | null
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      workflowId: string
      agentStrategyId: string | null
      mode: string
      status: string
      startedAt: string
      completedAt: string | null
    }, ExtArgs["result"]["workflowExecution"]>
    composites: {}
  }

  type WorkflowExecutionGetPayload<S extends boolean | null | undefined | WorkflowExecutionDefaultArgs> = $Result.GetResult<Prisma.$WorkflowExecutionPayload, S>

  type WorkflowExecutionCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<WorkflowExecutionFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: WorkflowExecutionCountAggregateInputType | true
    }

  export interface WorkflowExecutionDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['WorkflowExecution'], meta: { name: 'WorkflowExecution' } }
    /**
     * Find zero or one WorkflowExecution that matches the filter.
     * @param {WorkflowExecutionFindUniqueArgs} args - Arguments to find a WorkflowExecution
     * @example
     * // Get one WorkflowExecution
     * const workflowExecution = await prisma.workflowExecution.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends WorkflowExecutionFindUniqueArgs>(args: SelectSubset<T, WorkflowExecutionFindUniqueArgs<ExtArgs>>): Prisma__WorkflowExecutionClient<$Result.GetResult<Prisma.$WorkflowExecutionPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one WorkflowExecution that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {WorkflowExecutionFindUniqueOrThrowArgs} args - Arguments to find a WorkflowExecution
     * @example
     * // Get one WorkflowExecution
     * const workflowExecution = await prisma.workflowExecution.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends WorkflowExecutionFindUniqueOrThrowArgs>(args: SelectSubset<T, WorkflowExecutionFindUniqueOrThrowArgs<ExtArgs>>): Prisma__WorkflowExecutionClient<$Result.GetResult<Prisma.$WorkflowExecutionPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first WorkflowExecution that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowExecutionFindFirstArgs} args - Arguments to find a WorkflowExecution
     * @example
     * // Get one WorkflowExecution
     * const workflowExecution = await prisma.workflowExecution.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends WorkflowExecutionFindFirstArgs>(args?: SelectSubset<T, WorkflowExecutionFindFirstArgs<ExtArgs>>): Prisma__WorkflowExecutionClient<$Result.GetResult<Prisma.$WorkflowExecutionPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first WorkflowExecution that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowExecutionFindFirstOrThrowArgs} args - Arguments to find a WorkflowExecution
     * @example
     * // Get one WorkflowExecution
     * const workflowExecution = await prisma.workflowExecution.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends WorkflowExecutionFindFirstOrThrowArgs>(args?: SelectSubset<T, WorkflowExecutionFindFirstOrThrowArgs<ExtArgs>>): Prisma__WorkflowExecutionClient<$Result.GetResult<Prisma.$WorkflowExecutionPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more WorkflowExecutions that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowExecutionFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all WorkflowExecutions
     * const workflowExecutions = await prisma.workflowExecution.findMany()
     * 
     * // Get first 10 WorkflowExecutions
     * const workflowExecutions = await prisma.workflowExecution.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const workflowExecutionWithIdOnly = await prisma.workflowExecution.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends WorkflowExecutionFindManyArgs>(args?: SelectSubset<T, WorkflowExecutionFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkflowExecutionPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a WorkflowExecution.
     * @param {WorkflowExecutionCreateArgs} args - Arguments to create a WorkflowExecution.
     * @example
     * // Create one WorkflowExecution
     * const WorkflowExecution = await prisma.workflowExecution.create({
     *   data: {
     *     // ... data to create a WorkflowExecution
     *   }
     * })
     * 
     */
    create<T extends WorkflowExecutionCreateArgs>(args: SelectSubset<T, WorkflowExecutionCreateArgs<ExtArgs>>): Prisma__WorkflowExecutionClient<$Result.GetResult<Prisma.$WorkflowExecutionPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many WorkflowExecutions.
     * @param {WorkflowExecutionCreateManyArgs} args - Arguments to create many WorkflowExecutions.
     * @example
     * // Create many WorkflowExecutions
     * const workflowExecution = await prisma.workflowExecution.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends WorkflowExecutionCreateManyArgs>(args?: SelectSubset<T, WorkflowExecutionCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many WorkflowExecutions and returns the data saved in the database.
     * @param {WorkflowExecutionCreateManyAndReturnArgs} args - Arguments to create many WorkflowExecutions.
     * @example
     * // Create many WorkflowExecutions
     * const workflowExecution = await prisma.workflowExecution.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many WorkflowExecutions and only return the `id`
     * const workflowExecutionWithIdOnly = await prisma.workflowExecution.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends WorkflowExecutionCreateManyAndReturnArgs>(args?: SelectSubset<T, WorkflowExecutionCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkflowExecutionPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a WorkflowExecution.
     * @param {WorkflowExecutionDeleteArgs} args - Arguments to delete one WorkflowExecution.
     * @example
     * // Delete one WorkflowExecution
     * const WorkflowExecution = await prisma.workflowExecution.delete({
     *   where: {
     *     // ... filter to delete one WorkflowExecution
     *   }
     * })
     * 
     */
    delete<T extends WorkflowExecutionDeleteArgs>(args: SelectSubset<T, WorkflowExecutionDeleteArgs<ExtArgs>>): Prisma__WorkflowExecutionClient<$Result.GetResult<Prisma.$WorkflowExecutionPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one WorkflowExecution.
     * @param {WorkflowExecutionUpdateArgs} args - Arguments to update one WorkflowExecution.
     * @example
     * // Update one WorkflowExecution
     * const workflowExecution = await prisma.workflowExecution.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends WorkflowExecutionUpdateArgs>(args: SelectSubset<T, WorkflowExecutionUpdateArgs<ExtArgs>>): Prisma__WorkflowExecutionClient<$Result.GetResult<Prisma.$WorkflowExecutionPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more WorkflowExecutions.
     * @param {WorkflowExecutionDeleteManyArgs} args - Arguments to filter WorkflowExecutions to delete.
     * @example
     * // Delete a few WorkflowExecutions
     * const { count } = await prisma.workflowExecution.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends WorkflowExecutionDeleteManyArgs>(args?: SelectSubset<T, WorkflowExecutionDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more WorkflowExecutions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowExecutionUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many WorkflowExecutions
     * const workflowExecution = await prisma.workflowExecution.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends WorkflowExecutionUpdateManyArgs>(args: SelectSubset<T, WorkflowExecutionUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more WorkflowExecutions and returns the data updated in the database.
     * @param {WorkflowExecutionUpdateManyAndReturnArgs} args - Arguments to update many WorkflowExecutions.
     * @example
     * // Update many WorkflowExecutions
     * const workflowExecution = await prisma.workflowExecution.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more WorkflowExecutions and only return the `id`
     * const workflowExecutionWithIdOnly = await prisma.workflowExecution.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends WorkflowExecutionUpdateManyAndReturnArgs>(args: SelectSubset<T, WorkflowExecutionUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkflowExecutionPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one WorkflowExecution.
     * @param {WorkflowExecutionUpsertArgs} args - Arguments to update or create a WorkflowExecution.
     * @example
     * // Update or create a WorkflowExecution
     * const workflowExecution = await prisma.workflowExecution.upsert({
     *   create: {
     *     // ... data to create a WorkflowExecution
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the WorkflowExecution we want to update
     *   }
     * })
     */
    upsert<T extends WorkflowExecutionUpsertArgs>(args: SelectSubset<T, WorkflowExecutionUpsertArgs<ExtArgs>>): Prisma__WorkflowExecutionClient<$Result.GetResult<Prisma.$WorkflowExecutionPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of WorkflowExecutions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowExecutionCountArgs} args - Arguments to filter WorkflowExecutions to count.
     * @example
     * // Count the number of WorkflowExecutions
     * const count = await prisma.workflowExecution.count({
     *   where: {
     *     // ... the filter for the WorkflowExecutions we want to count
     *   }
     * })
    **/
    count<T extends WorkflowExecutionCountArgs>(
      args?: Subset<T, WorkflowExecutionCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], WorkflowExecutionCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a WorkflowExecution.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowExecutionAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends WorkflowExecutionAggregateArgs>(args: Subset<T, WorkflowExecutionAggregateArgs>): Prisma.PrismaPromise<GetWorkflowExecutionAggregateType<T>>

    /**
     * Group by WorkflowExecution.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkflowExecutionGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends WorkflowExecutionGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: WorkflowExecutionGroupByArgs['orderBy'] }
        : { orderBy?: WorkflowExecutionGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, WorkflowExecutionGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetWorkflowExecutionGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the WorkflowExecution model
   */
  readonly fields: WorkflowExecutionFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for WorkflowExecution.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__WorkflowExecutionClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    workflow<T extends WorkflowDefaultArgs<ExtArgs> = {}>(args?: Subset<T, WorkflowDefaultArgs<ExtArgs>>): Prisma__WorkflowClient<$Result.GetResult<Prisma.$WorkflowPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    agentStrategy<T extends WorkflowExecution$agentStrategyArgs<ExtArgs> = {}>(args?: Subset<T, WorkflowExecution$agentStrategyArgs<ExtArgs>>): Prisma__AgentStrategyClient<$Result.GetResult<Prisma.$AgentStrategyPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the WorkflowExecution model
   */
  interface WorkflowExecutionFieldRefs {
    readonly id: FieldRef<"WorkflowExecution", 'String'>
    readonly workflowId: FieldRef<"WorkflowExecution", 'String'>
    readonly agentStrategyId: FieldRef<"WorkflowExecution", 'String'>
    readonly mode: FieldRef<"WorkflowExecution", 'String'>
    readonly status: FieldRef<"WorkflowExecution", 'String'>
    readonly startedAt: FieldRef<"WorkflowExecution", 'String'>
    readonly completedAt: FieldRef<"WorkflowExecution", 'String'>
  }
    

  // Custom InputTypes
  /**
   * WorkflowExecution findUnique
   */
  export type WorkflowExecutionFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowExecution
     */
    select?: WorkflowExecutionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkflowExecution
     */
    omit?: WorkflowExecutionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowExecutionInclude<ExtArgs> | null
    /**
     * Filter, which WorkflowExecution to fetch.
     */
    where: WorkflowExecutionWhereUniqueInput
  }

  /**
   * WorkflowExecution findUniqueOrThrow
   */
  export type WorkflowExecutionFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowExecution
     */
    select?: WorkflowExecutionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkflowExecution
     */
    omit?: WorkflowExecutionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowExecutionInclude<ExtArgs> | null
    /**
     * Filter, which WorkflowExecution to fetch.
     */
    where: WorkflowExecutionWhereUniqueInput
  }

  /**
   * WorkflowExecution findFirst
   */
  export type WorkflowExecutionFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowExecution
     */
    select?: WorkflowExecutionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkflowExecution
     */
    omit?: WorkflowExecutionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowExecutionInclude<ExtArgs> | null
    /**
     * Filter, which WorkflowExecution to fetch.
     */
    where?: WorkflowExecutionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WorkflowExecutions to fetch.
     */
    orderBy?: WorkflowExecutionOrderByWithRelationInput | WorkflowExecutionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for WorkflowExecutions.
     */
    cursor?: WorkflowExecutionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WorkflowExecutions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WorkflowExecutions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of WorkflowExecutions.
     */
    distinct?: WorkflowExecutionScalarFieldEnum | WorkflowExecutionScalarFieldEnum[]
  }

  /**
   * WorkflowExecution findFirstOrThrow
   */
  export type WorkflowExecutionFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowExecution
     */
    select?: WorkflowExecutionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkflowExecution
     */
    omit?: WorkflowExecutionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowExecutionInclude<ExtArgs> | null
    /**
     * Filter, which WorkflowExecution to fetch.
     */
    where?: WorkflowExecutionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WorkflowExecutions to fetch.
     */
    orderBy?: WorkflowExecutionOrderByWithRelationInput | WorkflowExecutionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for WorkflowExecutions.
     */
    cursor?: WorkflowExecutionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WorkflowExecutions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WorkflowExecutions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of WorkflowExecutions.
     */
    distinct?: WorkflowExecutionScalarFieldEnum | WorkflowExecutionScalarFieldEnum[]
  }

  /**
   * WorkflowExecution findMany
   */
  export type WorkflowExecutionFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowExecution
     */
    select?: WorkflowExecutionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkflowExecution
     */
    omit?: WorkflowExecutionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowExecutionInclude<ExtArgs> | null
    /**
     * Filter, which WorkflowExecutions to fetch.
     */
    where?: WorkflowExecutionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WorkflowExecutions to fetch.
     */
    orderBy?: WorkflowExecutionOrderByWithRelationInput | WorkflowExecutionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing WorkflowExecutions.
     */
    cursor?: WorkflowExecutionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WorkflowExecutions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WorkflowExecutions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of WorkflowExecutions.
     */
    distinct?: WorkflowExecutionScalarFieldEnum | WorkflowExecutionScalarFieldEnum[]
  }

  /**
   * WorkflowExecution create
   */
  export type WorkflowExecutionCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowExecution
     */
    select?: WorkflowExecutionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkflowExecution
     */
    omit?: WorkflowExecutionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowExecutionInclude<ExtArgs> | null
    /**
     * The data needed to create a WorkflowExecution.
     */
    data: XOR<WorkflowExecutionCreateInput, WorkflowExecutionUncheckedCreateInput>
  }

  /**
   * WorkflowExecution createMany
   */
  export type WorkflowExecutionCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many WorkflowExecutions.
     */
    data: WorkflowExecutionCreateManyInput | WorkflowExecutionCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * WorkflowExecution createManyAndReturn
   */
  export type WorkflowExecutionCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowExecution
     */
    select?: WorkflowExecutionSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the WorkflowExecution
     */
    omit?: WorkflowExecutionOmit<ExtArgs> | null
    /**
     * The data used to create many WorkflowExecutions.
     */
    data: WorkflowExecutionCreateManyInput | WorkflowExecutionCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowExecutionIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * WorkflowExecution update
   */
  export type WorkflowExecutionUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowExecution
     */
    select?: WorkflowExecutionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkflowExecution
     */
    omit?: WorkflowExecutionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowExecutionInclude<ExtArgs> | null
    /**
     * The data needed to update a WorkflowExecution.
     */
    data: XOR<WorkflowExecutionUpdateInput, WorkflowExecutionUncheckedUpdateInput>
    /**
     * Choose, which WorkflowExecution to update.
     */
    where: WorkflowExecutionWhereUniqueInput
  }

  /**
   * WorkflowExecution updateMany
   */
  export type WorkflowExecutionUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update WorkflowExecutions.
     */
    data: XOR<WorkflowExecutionUpdateManyMutationInput, WorkflowExecutionUncheckedUpdateManyInput>
    /**
     * Filter which WorkflowExecutions to update
     */
    where?: WorkflowExecutionWhereInput
    /**
     * Limit how many WorkflowExecutions to update.
     */
    limit?: number
  }

  /**
   * WorkflowExecution updateManyAndReturn
   */
  export type WorkflowExecutionUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowExecution
     */
    select?: WorkflowExecutionSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the WorkflowExecution
     */
    omit?: WorkflowExecutionOmit<ExtArgs> | null
    /**
     * The data used to update WorkflowExecutions.
     */
    data: XOR<WorkflowExecutionUpdateManyMutationInput, WorkflowExecutionUncheckedUpdateManyInput>
    /**
     * Filter which WorkflowExecutions to update
     */
    where?: WorkflowExecutionWhereInput
    /**
     * Limit how many WorkflowExecutions to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowExecutionIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * WorkflowExecution upsert
   */
  export type WorkflowExecutionUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowExecution
     */
    select?: WorkflowExecutionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkflowExecution
     */
    omit?: WorkflowExecutionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowExecutionInclude<ExtArgs> | null
    /**
     * The filter to search for the WorkflowExecution to update in case it exists.
     */
    where: WorkflowExecutionWhereUniqueInput
    /**
     * In case the WorkflowExecution found by the `where` argument doesn't exist, create a new WorkflowExecution with this data.
     */
    create: XOR<WorkflowExecutionCreateInput, WorkflowExecutionUncheckedCreateInput>
    /**
     * In case the WorkflowExecution was found with the provided `where` argument, update it with this data.
     */
    update: XOR<WorkflowExecutionUpdateInput, WorkflowExecutionUncheckedUpdateInput>
  }

  /**
   * WorkflowExecution delete
   */
  export type WorkflowExecutionDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowExecution
     */
    select?: WorkflowExecutionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkflowExecution
     */
    omit?: WorkflowExecutionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowExecutionInclude<ExtArgs> | null
    /**
     * Filter which WorkflowExecution to delete.
     */
    where: WorkflowExecutionWhereUniqueInput
  }

  /**
   * WorkflowExecution deleteMany
   */
  export type WorkflowExecutionDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which WorkflowExecutions to delete
     */
    where?: WorkflowExecutionWhereInput
    /**
     * Limit how many WorkflowExecutions to delete.
     */
    limit?: number
  }

  /**
   * WorkflowExecution.agentStrategy
   */
  export type WorkflowExecution$agentStrategyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AgentStrategy
     */
    select?: AgentStrategySelect<ExtArgs> | null
    /**
     * Omit specific fields from the AgentStrategy
     */
    omit?: AgentStrategyOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AgentStrategyInclude<ExtArgs> | null
    where?: AgentStrategyWhereInput
  }

  /**
   * WorkflowExecution without action
   */
  export type WorkflowExecutionDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkflowExecution
     */
    select?: WorkflowExecutionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkflowExecution
     */
    omit?: WorkflowExecutionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkflowExecutionInclude<ExtArgs> | null
  }


  /**
   * Model DesktopKv
   */

  export type AggregateDesktopKv = {
    _count: DesktopKvCountAggregateOutputType | null
    _min: DesktopKvMinAggregateOutputType | null
    _max: DesktopKvMaxAggregateOutputType | null
  }

  export type DesktopKvMinAggregateOutputType = {
    key: string | null
    value: string | null
  }

  export type DesktopKvMaxAggregateOutputType = {
    key: string | null
    value: string | null
  }

  export type DesktopKvCountAggregateOutputType = {
    key: number
    value: number
    _all: number
  }


  export type DesktopKvMinAggregateInputType = {
    key?: true
    value?: true
  }

  export type DesktopKvMaxAggregateInputType = {
    key?: true
    value?: true
  }

  export type DesktopKvCountAggregateInputType = {
    key?: true
    value?: true
    _all?: true
  }

  export type DesktopKvAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which DesktopKv to aggregate.
     */
    where?: DesktopKvWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of DesktopKvs to fetch.
     */
    orderBy?: DesktopKvOrderByWithRelationInput | DesktopKvOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: DesktopKvWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` DesktopKvs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` DesktopKvs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned DesktopKvs
    **/
    _count?: true | DesktopKvCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: DesktopKvMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: DesktopKvMaxAggregateInputType
  }

  export type GetDesktopKvAggregateType<T extends DesktopKvAggregateArgs> = {
        [P in keyof T & keyof AggregateDesktopKv]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateDesktopKv[P]>
      : GetScalarType<T[P], AggregateDesktopKv[P]>
  }




  export type DesktopKvGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: DesktopKvWhereInput
    orderBy?: DesktopKvOrderByWithAggregationInput | DesktopKvOrderByWithAggregationInput[]
    by: DesktopKvScalarFieldEnum[] | DesktopKvScalarFieldEnum
    having?: DesktopKvScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: DesktopKvCountAggregateInputType | true
    _min?: DesktopKvMinAggregateInputType
    _max?: DesktopKvMaxAggregateInputType
  }

  export type DesktopKvGroupByOutputType = {
    key: string
    value: string
    _count: DesktopKvCountAggregateOutputType | null
    _min: DesktopKvMinAggregateOutputType | null
    _max: DesktopKvMaxAggregateOutputType | null
  }

  type GetDesktopKvGroupByPayload<T extends DesktopKvGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<DesktopKvGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof DesktopKvGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], DesktopKvGroupByOutputType[P]>
            : GetScalarType<T[P], DesktopKvGroupByOutputType[P]>
        }
      >
    >


  export type DesktopKvSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    key?: boolean
    value?: boolean
  }, ExtArgs["result"]["desktopKv"]>

  export type DesktopKvSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    key?: boolean
    value?: boolean
  }, ExtArgs["result"]["desktopKv"]>

  export type DesktopKvSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    key?: boolean
    value?: boolean
  }, ExtArgs["result"]["desktopKv"]>

  export type DesktopKvSelectScalar = {
    key?: boolean
    value?: boolean
  }

  export type DesktopKvOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"key" | "value", ExtArgs["result"]["desktopKv"]>

  export type $DesktopKvPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "DesktopKv"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      key: string
      value: string
    }, ExtArgs["result"]["desktopKv"]>
    composites: {}
  }

  type DesktopKvGetPayload<S extends boolean | null | undefined | DesktopKvDefaultArgs> = $Result.GetResult<Prisma.$DesktopKvPayload, S>

  type DesktopKvCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<DesktopKvFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: DesktopKvCountAggregateInputType | true
    }

  export interface DesktopKvDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['DesktopKv'], meta: { name: 'DesktopKv' } }
    /**
     * Find zero or one DesktopKv that matches the filter.
     * @param {DesktopKvFindUniqueArgs} args - Arguments to find a DesktopKv
     * @example
     * // Get one DesktopKv
     * const desktopKv = await prisma.desktopKv.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends DesktopKvFindUniqueArgs>(args: SelectSubset<T, DesktopKvFindUniqueArgs<ExtArgs>>): Prisma__DesktopKvClient<$Result.GetResult<Prisma.$DesktopKvPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one DesktopKv that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {DesktopKvFindUniqueOrThrowArgs} args - Arguments to find a DesktopKv
     * @example
     * // Get one DesktopKv
     * const desktopKv = await prisma.desktopKv.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends DesktopKvFindUniqueOrThrowArgs>(args: SelectSubset<T, DesktopKvFindUniqueOrThrowArgs<ExtArgs>>): Prisma__DesktopKvClient<$Result.GetResult<Prisma.$DesktopKvPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first DesktopKv that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopKvFindFirstArgs} args - Arguments to find a DesktopKv
     * @example
     * // Get one DesktopKv
     * const desktopKv = await prisma.desktopKv.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends DesktopKvFindFirstArgs>(args?: SelectSubset<T, DesktopKvFindFirstArgs<ExtArgs>>): Prisma__DesktopKvClient<$Result.GetResult<Prisma.$DesktopKvPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first DesktopKv that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopKvFindFirstOrThrowArgs} args - Arguments to find a DesktopKv
     * @example
     * // Get one DesktopKv
     * const desktopKv = await prisma.desktopKv.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends DesktopKvFindFirstOrThrowArgs>(args?: SelectSubset<T, DesktopKvFindFirstOrThrowArgs<ExtArgs>>): Prisma__DesktopKvClient<$Result.GetResult<Prisma.$DesktopKvPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more DesktopKvs that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopKvFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all DesktopKvs
     * const desktopKvs = await prisma.desktopKv.findMany()
     * 
     * // Get first 10 DesktopKvs
     * const desktopKvs = await prisma.desktopKv.findMany({ take: 10 })
     * 
     * // Only select the `key`
     * const desktopKvWithKeyOnly = await prisma.desktopKv.findMany({ select: { key: true } })
     * 
     */
    findMany<T extends DesktopKvFindManyArgs>(args?: SelectSubset<T, DesktopKvFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DesktopKvPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a DesktopKv.
     * @param {DesktopKvCreateArgs} args - Arguments to create a DesktopKv.
     * @example
     * // Create one DesktopKv
     * const DesktopKv = await prisma.desktopKv.create({
     *   data: {
     *     // ... data to create a DesktopKv
     *   }
     * })
     * 
     */
    create<T extends DesktopKvCreateArgs>(args: SelectSubset<T, DesktopKvCreateArgs<ExtArgs>>): Prisma__DesktopKvClient<$Result.GetResult<Prisma.$DesktopKvPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many DesktopKvs.
     * @param {DesktopKvCreateManyArgs} args - Arguments to create many DesktopKvs.
     * @example
     * // Create many DesktopKvs
     * const desktopKv = await prisma.desktopKv.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends DesktopKvCreateManyArgs>(args?: SelectSubset<T, DesktopKvCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many DesktopKvs and returns the data saved in the database.
     * @param {DesktopKvCreateManyAndReturnArgs} args - Arguments to create many DesktopKvs.
     * @example
     * // Create many DesktopKvs
     * const desktopKv = await prisma.desktopKv.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many DesktopKvs and only return the `key`
     * const desktopKvWithKeyOnly = await prisma.desktopKv.createManyAndReturn({
     *   select: { key: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends DesktopKvCreateManyAndReturnArgs>(args?: SelectSubset<T, DesktopKvCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DesktopKvPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a DesktopKv.
     * @param {DesktopKvDeleteArgs} args - Arguments to delete one DesktopKv.
     * @example
     * // Delete one DesktopKv
     * const DesktopKv = await prisma.desktopKv.delete({
     *   where: {
     *     // ... filter to delete one DesktopKv
     *   }
     * })
     * 
     */
    delete<T extends DesktopKvDeleteArgs>(args: SelectSubset<T, DesktopKvDeleteArgs<ExtArgs>>): Prisma__DesktopKvClient<$Result.GetResult<Prisma.$DesktopKvPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one DesktopKv.
     * @param {DesktopKvUpdateArgs} args - Arguments to update one DesktopKv.
     * @example
     * // Update one DesktopKv
     * const desktopKv = await prisma.desktopKv.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends DesktopKvUpdateArgs>(args: SelectSubset<T, DesktopKvUpdateArgs<ExtArgs>>): Prisma__DesktopKvClient<$Result.GetResult<Prisma.$DesktopKvPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more DesktopKvs.
     * @param {DesktopKvDeleteManyArgs} args - Arguments to filter DesktopKvs to delete.
     * @example
     * // Delete a few DesktopKvs
     * const { count } = await prisma.desktopKv.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends DesktopKvDeleteManyArgs>(args?: SelectSubset<T, DesktopKvDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more DesktopKvs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopKvUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many DesktopKvs
     * const desktopKv = await prisma.desktopKv.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends DesktopKvUpdateManyArgs>(args: SelectSubset<T, DesktopKvUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more DesktopKvs and returns the data updated in the database.
     * @param {DesktopKvUpdateManyAndReturnArgs} args - Arguments to update many DesktopKvs.
     * @example
     * // Update many DesktopKvs
     * const desktopKv = await prisma.desktopKv.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more DesktopKvs and only return the `key`
     * const desktopKvWithKeyOnly = await prisma.desktopKv.updateManyAndReturn({
     *   select: { key: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends DesktopKvUpdateManyAndReturnArgs>(args: SelectSubset<T, DesktopKvUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DesktopKvPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one DesktopKv.
     * @param {DesktopKvUpsertArgs} args - Arguments to update or create a DesktopKv.
     * @example
     * // Update or create a DesktopKv
     * const desktopKv = await prisma.desktopKv.upsert({
     *   create: {
     *     // ... data to create a DesktopKv
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the DesktopKv we want to update
     *   }
     * })
     */
    upsert<T extends DesktopKvUpsertArgs>(args: SelectSubset<T, DesktopKvUpsertArgs<ExtArgs>>): Prisma__DesktopKvClient<$Result.GetResult<Prisma.$DesktopKvPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of DesktopKvs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopKvCountArgs} args - Arguments to filter DesktopKvs to count.
     * @example
     * // Count the number of DesktopKvs
     * const count = await prisma.desktopKv.count({
     *   where: {
     *     // ... the filter for the DesktopKvs we want to count
     *   }
     * })
    **/
    count<T extends DesktopKvCountArgs>(
      args?: Subset<T, DesktopKvCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], DesktopKvCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a DesktopKv.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopKvAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends DesktopKvAggregateArgs>(args: Subset<T, DesktopKvAggregateArgs>): Prisma.PrismaPromise<GetDesktopKvAggregateType<T>>

    /**
     * Group by DesktopKv.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopKvGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends DesktopKvGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: DesktopKvGroupByArgs['orderBy'] }
        : { orderBy?: DesktopKvGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, DesktopKvGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetDesktopKvGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the DesktopKv model
   */
  readonly fields: DesktopKvFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for DesktopKv.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__DesktopKvClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the DesktopKv model
   */
  interface DesktopKvFieldRefs {
    readonly key: FieldRef<"DesktopKv", 'String'>
    readonly value: FieldRef<"DesktopKv", 'String'>
  }
    

  // Custom InputTypes
  /**
   * DesktopKv findUnique
   */
  export type DesktopKvFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopKv
     */
    select?: DesktopKvSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopKv
     */
    omit?: DesktopKvOmit<ExtArgs> | null
    /**
     * Filter, which DesktopKv to fetch.
     */
    where: DesktopKvWhereUniqueInput
  }

  /**
   * DesktopKv findUniqueOrThrow
   */
  export type DesktopKvFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopKv
     */
    select?: DesktopKvSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopKv
     */
    omit?: DesktopKvOmit<ExtArgs> | null
    /**
     * Filter, which DesktopKv to fetch.
     */
    where: DesktopKvWhereUniqueInput
  }

  /**
   * DesktopKv findFirst
   */
  export type DesktopKvFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopKv
     */
    select?: DesktopKvSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopKv
     */
    omit?: DesktopKvOmit<ExtArgs> | null
    /**
     * Filter, which DesktopKv to fetch.
     */
    where?: DesktopKvWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of DesktopKvs to fetch.
     */
    orderBy?: DesktopKvOrderByWithRelationInput | DesktopKvOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for DesktopKvs.
     */
    cursor?: DesktopKvWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` DesktopKvs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` DesktopKvs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of DesktopKvs.
     */
    distinct?: DesktopKvScalarFieldEnum | DesktopKvScalarFieldEnum[]
  }

  /**
   * DesktopKv findFirstOrThrow
   */
  export type DesktopKvFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopKv
     */
    select?: DesktopKvSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopKv
     */
    omit?: DesktopKvOmit<ExtArgs> | null
    /**
     * Filter, which DesktopKv to fetch.
     */
    where?: DesktopKvWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of DesktopKvs to fetch.
     */
    orderBy?: DesktopKvOrderByWithRelationInput | DesktopKvOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for DesktopKvs.
     */
    cursor?: DesktopKvWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` DesktopKvs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` DesktopKvs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of DesktopKvs.
     */
    distinct?: DesktopKvScalarFieldEnum | DesktopKvScalarFieldEnum[]
  }

  /**
   * DesktopKv findMany
   */
  export type DesktopKvFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopKv
     */
    select?: DesktopKvSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopKv
     */
    omit?: DesktopKvOmit<ExtArgs> | null
    /**
     * Filter, which DesktopKvs to fetch.
     */
    where?: DesktopKvWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of DesktopKvs to fetch.
     */
    orderBy?: DesktopKvOrderByWithRelationInput | DesktopKvOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing DesktopKvs.
     */
    cursor?: DesktopKvWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` DesktopKvs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` DesktopKvs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of DesktopKvs.
     */
    distinct?: DesktopKvScalarFieldEnum | DesktopKvScalarFieldEnum[]
  }

  /**
   * DesktopKv create
   */
  export type DesktopKvCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopKv
     */
    select?: DesktopKvSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopKv
     */
    omit?: DesktopKvOmit<ExtArgs> | null
    /**
     * The data needed to create a DesktopKv.
     */
    data: XOR<DesktopKvCreateInput, DesktopKvUncheckedCreateInput>
  }

  /**
   * DesktopKv createMany
   */
  export type DesktopKvCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many DesktopKvs.
     */
    data: DesktopKvCreateManyInput | DesktopKvCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * DesktopKv createManyAndReturn
   */
  export type DesktopKvCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopKv
     */
    select?: DesktopKvSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopKv
     */
    omit?: DesktopKvOmit<ExtArgs> | null
    /**
     * The data used to create many DesktopKvs.
     */
    data: DesktopKvCreateManyInput | DesktopKvCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * DesktopKv update
   */
  export type DesktopKvUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopKv
     */
    select?: DesktopKvSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopKv
     */
    omit?: DesktopKvOmit<ExtArgs> | null
    /**
     * The data needed to update a DesktopKv.
     */
    data: XOR<DesktopKvUpdateInput, DesktopKvUncheckedUpdateInput>
    /**
     * Choose, which DesktopKv to update.
     */
    where: DesktopKvWhereUniqueInput
  }

  /**
   * DesktopKv updateMany
   */
  export type DesktopKvUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update DesktopKvs.
     */
    data: XOR<DesktopKvUpdateManyMutationInput, DesktopKvUncheckedUpdateManyInput>
    /**
     * Filter which DesktopKvs to update
     */
    where?: DesktopKvWhereInput
    /**
     * Limit how many DesktopKvs to update.
     */
    limit?: number
  }

  /**
   * DesktopKv updateManyAndReturn
   */
  export type DesktopKvUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopKv
     */
    select?: DesktopKvSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopKv
     */
    omit?: DesktopKvOmit<ExtArgs> | null
    /**
     * The data used to update DesktopKvs.
     */
    data: XOR<DesktopKvUpdateManyMutationInput, DesktopKvUncheckedUpdateManyInput>
    /**
     * Filter which DesktopKvs to update
     */
    where?: DesktopKvWhereInput
    /**
     * Limit how many DesktopKvs to update.
     */
    limit?: number
  }

  /**
   * DesktopKv upsert
   */
  export type DesktopKvUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopKv
     */
    select?: DesktopKvSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopKv
     */
    omit?: DesktopKvOmit<ExtArgs> | null
    /**
     * The filter to search for the DesktopKv to update in case it exists.
     */
    where: DesktopKvWhereUniqueInput
    /**
     * In case the DesktopKv found by the `where` argument doesn't exist, create a new DesktopKv with this data.
     */
    create: XOR<DesktopKvCreateInput, DesktopKvUncheckedCreateInput>
    /**
     * In case the DesktopKv was found with the provided `where` argument, update it with this data.
     */
    update: XOR<DesktopKvUpdateInput, DesktopKvUncheckedUpdateInput>
  }

  /**
   * DesktopKv delete
   */
  export type DesktopKvDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopKv
     */
    select?: DesktopKvSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopKv
     */
    omit?: DesktopKvOmit<ExtArgs> | null
    /**
     * Filter which DesktopKv to delete.
     */
    where: DesktopKvWhereUniqueInput
  }

  /**
   * DesktopKv deleteMany
   */
  export type DesktopKvDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which DesktopKvs to delete
     */
    where?: DesktopKvWhereInput
    /**
     * Limit how many DesktopKvs to delete.
     */
    limit?: number
  }

  /**
   * DesktopKv without action
   */
  export type DesktopKvDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopKv
     */
    select?: DesktopKvSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopKv
     */
    omit?: DesktopKvOmit<ExtArgs> | null
  }


  /**
   * Model DesktopWorkspace
   */

  export type AggregateDesktopWorkspace = {
    _count: DesktopWorkspaceCountAggregateOutputType | null
    _avg: DesktopWorkspaceAvgAggregateOutputType | null
    _sum: DesktopWorkspaceSumAggregateOutputType | null
    _min: DesktopWorkspaceMinAggregateOutputType | null
    _max: DesktopWorkspaceMaxAggregateOutputType | null
  }

  export type DesktopWorkspaceAvgAggregateOutputType = {
    localDraftCount: number | null
    pendingSyncCount: number | null
  }

  export type DesktopWorkspaceSumAggregateOutputType = {
    localDraftCount: number | null
    pendingSyncCount: number | null
  }

  export type DesktopWorkspaceMinAggregateOutputType = {
    id: string | null
    name: string | null
    path: string | null
    linkedProjectId: string | null
    fileIndex: string | null
    indexingState: string | null
    localDraftCount: number | null
    pendingSyncCount: number | null
    createdAt: string | null
    updatedAt: string | null
    lastOpenedAt: string | null
  }

  export type DesktopWorkspaceMaxAggregateOutputType = {
    id: string | null
    name: string | null
    path: string | null
    linkedProjectId: string | null
    fileIndex: string | null
    indexingState: string | null
    localDraftCount: number | null
    pendingSyncCount: number | null
    createdAt: string | null
    updatedAt: string | null
    lastOpenedAt: string | null
  }

  export type DesktopWorkspaceCountAggregateOutputType = {
    id: number
    name: number
    path: number
    linkedProjectId: number
    fileIndex: number
    indexingState: number
    localDraftCount: number
    pendingSyncCount: number
    createdAt: number
    updatedAt: number
    lastOpenedAt: number
    _all: number
  }


  export type DesktopWorkspaceAvgAggregateInputType = {
    localDraftCount?: true
    pendingSyncCount?: true
  }

  export type DesktopWorkspaceSumAggregateInputType = {
    localDraftCount?: true
    pendingSyncCount?: true
  }

  export type DesktopWorkspaceMinAggregateInputType = {
    id?: true
    name?: true
    path?: true
    linkedProjectId?: true
    fileIndex?: true
    indexingState?: true
    localDraftCount?: true
    pendingSyncCount?: true
    createdAt?: true
    updatedAt?: true
    lastOpenedAt?: true
  }

  export type DesktopWorkspaceMaxAggregateInputType = {
    id?: true
    name?: true
    path?: true
    linkedProjectId?: true
    fileIndex?: true
    indexingState?: true
    localDraftCount?: true
    pendingSyncCount?: true
    createdAt?: true
    updatedAt?: true
    lastOpenedAt?: true
  }

  export type DesktopWorkspaceCountAggregateInputType = {
    id?: true
    name?: true
    path?: true
    linkedProjectId?: true
    fileIndex?: true
    indexingState?: true
    localDraftCount?: true
    pendingSyncCount?: true
    createdAt?: true
    updatedAt?: true
    lastOpenedAt?: true
    _all?: true
  }

  export type DesktopWorkspaceAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which DesktopWorkspace to aggregate.
     */
    where?: DesktopWorkspaceWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of DesktopWorkspaces to fetch.
     */
    orderBy?: DesktopWorkspaceOrderByWithRelationInput | DesktopWorkspaceOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: DesktopWorkspaceWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` DesktopWorkspaces from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` DesktopWorkspaces.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned DesktopWorkspaces
    **/
    _count?: true | DesktopWorkspaceCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: DesktopWorkspaceAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: DesktopWorkspaceSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: DesktopWorkspaceMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: DesktopWorkspaceMaxAggregateInputType
  }

  export type GetDesktopWorkspaceAggregateType<T extends DesktopWorkspaceAggregateArgs> = {
        [P in keyof T & keyof AggregateDesktopWorkspace]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateDesktopWorkspace[P]>
      : GetScalarType<T[P], AggregateDesktopWorkspace[P]>
  }




  export type DesktopWorkspaceGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: DesktopWorkspaceWhereInput
    orderBy?: DesktopWorkspaceOrderByWithAggregationInput | DesktopWorkspaceOrderByWithAggregationInput[]
    by: DesktopWorkspaceScalarFieldEnum[] | DesktopWorkspaceScalarFieldEnum
    having?: DesktopWorkspaceScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: DesktopWorkspaceCountAggregateInputType | true
    _avg?: DesktopWorkspaceAvgAggregateInputType
    _sum?: DesktopWorkspaceSumAggregateInputType
    _min?: DesktopWorkspaceMinAggregateInputType
    _max?: DesktopWorkspaceMaxAggregateInputType
  }

  export type DesktopWorkspaceGroupByOutputType = {
    id: string
    name: string
    path: string
    linkedProjectId: string | null
    fileIndex: string
    indexingState: string
    localDraftCount: number
    pendingSyncCount: number
    createdAt: string
    updatedAt: string
    lastOpenedAt: string
    _count: DesktopWorkspaceCountAggregateOutputType | null
    _avg: DesktopWorkspaceAvgAggregateOutputType | null
    _sum: DesktopWorkspaceSumAggregateOutputType | null
    _min: DesktopWorkspaceMinAggregateOutputType | null
    _max: DesktopWorkspaceMaxAggregateOutputType | null
  }

  type GetDesktopWorkspaceGroupByPayload<T extends DesktopWorkspaceGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<DesktopWorkspaceGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof DesktopWorkspaceGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], DesktopWorkspaceGroupByOutputType[P]>
            : GetScalarType<T[P], DesktopWorkspaceGroupByOutputType[P]>
        }
      >
    >


  export type DesktopWorkspaceSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    path?: boolean
    linkedProjectId?: boolean
    fileIndex?: boolean
    indexingState?: boolean
    localDraftCount?: boolean
    pendingSyncCount?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    lastOpenedAt?: boolean
  }, ExtArgs["result"]["desktopWorkspace"]>

  export type DesktopWorkspaceSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    path?: boolean
    linkedProjectId?: boolean
    fileIndex?: boolean
    indexingState?: boolean
    localDraftCount?: boolean
    pendingSyncCount?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    lastOpenedAt?: boolean
  }, ExtArgs["result"]["desktopWorkspace"]>

  export type DesktopWorkspaceSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    path?: boolean
    linkedProjectId?: boolean
    fileIndex?: boolean
    indexingState?: boolean
    localDraftCount?: boolean
    pendingSyncCount?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    lastOpenedAt?: boolean
  }, ExtArgs["result"]["desktopWorkspace"]>

  export type DesktopWorkspaceSelectScalar = {
    id?: boolean
    name?: boolean
    path?: boolean
    linkedProjectId?: boolean
    fileIndex?: boolean
    indexingState?: boolean
    localDraftCount?: boolean
    pendingSyncCount?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    lastOpenedAt?: boolean
  }

  export type DesktopWorkspaceOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "name" | "path" | "linkedProjectId" | "fileIndex" | "indexingState" | "localDraftCount" | "pendingSyncCount" | "createdAt" | "updatedAt" | "lastOpenedAt", ExtArgs["result"]["desktopWorkspace"]>

  export type $DesktopWorkspacePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "DesktopWorkspace"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      name: string
      path: string
      linkedProjectId: string | null
      fileIndex: string
      indexingState: string
      localDraftCount: number
      pendingSyncCount: number
      createdAt: string
      updatedAt: string
      lastOpenedAt: string
    }, ExtArgs["result"]["desktopWorkspace"]>
    composites: {}
  }

  type DesktopWorkspaceGetPayload<S extends boolean | null | undefined | DesktopWorkspaceDefaultArgs> = $Result.GetResult<Prisma.$DesktopWorkspacePayload, S>

  type DesktopWorkspaceCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<DesktopWorkspaceFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: DesktopWorkspaceCountAggregateInputType | true
    }

  export interface DesktopWorkspaceDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['DesktopWorkspace'], meta: { name: 'DesktopWorkspace' } }
    /**
     * Find zero or one DesktopWorkspace that matches the filter.
     * @param {DesktopWorkspaceFindUniqueArgs} args - Arguments to find a DesktopWorkspace
     * @example
     * // Get one DesktopWorkspace
     * const desktopWorkspace = await prisma.desktopWorkspace.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends DesktopWorkspaceFindUniqueArgs>(args: SelectSubset<T, DesktopWorkspaceFindUniqueArgs<ExtArgs>>): Prisma__DesktopWorkspaceClient<$Result.GetResult<Prisma.$DesktopWorkspacePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one DesktopWorkspace that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {DesktopWorkspaceFindUniqueOrThrowArgs} args - Arguments to find a DesktopWorkspace
     * @example
     * // Get one DesktopWorkspace
     * const desktopWorkspace = await prisma.desktopWorkspace.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends DesktopWorkspaceFindUniqueOrThrowArgs>(args: SelectSubset<T, DesktopWorkspaceFindUniqueOrThrowArgs<ExtArgs>>): Prisma__DesktopWorkspaceClient<$Result.GetResult<Prisma.$DesktopWorkspacePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first DesktopWorkspace that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopWorkspaceFindFirstArgs} args - Arguments to find a DesktopWorkspace
     * @example
     * // Get one DesktopWorkspace
     * const desktopWorkspace = await prisma.desktopWorkspace.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends DesktopWorkspaceFindFirstArgs>(args?: SelectSubset<T, DesktopWorkspaceFindFirstArgs<ExtArgs>>): Prisma__DesktopWorkspaceClient<$Result.GetResult<Prisma.$DesktopWorkspacePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first DesktopWorkspace that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopWorkspaceFindFirstOrThrowArgs} args - Arguments to find a DesktopWorkspace
     * @example
     * // Get one DesktopWorkspace
     * const desktopWorkspace = await prisma.desktopWorkspace.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends DesktopWorkspaceFindFirstOrThrowArgs>(args?: SelectSubset<T, DesktopWorkspaceFindFirstOrThrowArgs<ExtArgs>>): Prisma__DesktopWorkspaceClient<$Result.GetResult<Prisma.$DesktopWorkspacePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more DesktopWorkspaces that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopWorkspaceFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all DesktopWorkspaces
     * const desktopWorkspaces = await prisma.desktopWorkspace.findMany()
     * 
     * // Get first 10 DesktopWorkspaces
     * const desktopWorkspaces = await prisma.desktopWorkspace.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const desktopWorkspaceWithIdOnly = await prisma.desktopWorkspace.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends DesktopWorkspaceFindManyArgs>(args?: SelectSubset<T, DesktopWorkspaceFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DesktopWorkspacePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a DesktopWorkspace.
     * @param {DesktopWorkspaceCreateArgs} args - Arguments to create a DesktopWorkspace.
     * @example
     * // Create one DesktopWorkspace
     * const DesktopWorkspace = await prisma.desktopWorkspace.create({
     *   data: {
     *     // ... data to create a DesktopWorkspace
     *   }
     * })
     * 
     */
    create<T extends DesktopWorkspaceCreateArgs>(args: SelectSubset<T, DesktopWorkspaceCreateArgs<ExtArgs>>): Prisma__DesktopWorkspaceClient<$Result.GetResult<Prisma.$DesktopWorkspacePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many DesktopWorkspaces.
     * @param {DesktopWorkspaceCreateManyArgs} args - Arguments to create many DesktopWorkspaces.
     * @example
     * // Create many DesktopWorkspaces
     * const desktopWorkspace = await prisma.desktopWorkspace.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends DesktopWorkspaceCreateManyArgs>(args?: SelectSubset<T, DesktopWorkspaceCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many DesktopWorkspaces and returns the data saved in the database.
     * @param {DesktopWorkspaceCreateManyAndReturnArgs} args - Arguments to create many DesktopWorkspaces.
     * @example
     * // Create many DesktopWorkspaces
     * const desktopWorkspace = await prisma.desktopWorkspace.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many DesktopWorkspaces and only return the `id`
     * const desktopWorkspaceWithIdOnly = await prisma.desktopWorkspace.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends DesktopWorkspaceCreateManyAndReturnArgs>(args?: SelectSubset<T, DesktopWorkspaceCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DesktopWorkspacePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a DesktopWorkspace.
     * @param {DesktopWorkspaceDeleteArgs} args - Arguments to delete one DesktopWorkspace.
     * @example
     * // Delete one DesktopWorkspace
     * const DesktopWorkspace = await prisma.desktopWorkspace.delete({
     *   where: {
     *     // ... filter to delete one DesktopWorkspace
     *   }
     * })
     * 
     */
    delete<T extends DesktopWorkspaceDeleteArgs>(args: SelectSubset<T, DesktopWorkspaceDeleteArgs<ExtArgs>>): Prisma__DesktopWorkspaceClient<$Result.GetResult<Prisma.$DesktopWorkspacePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one DesktopWorkspace.
     * @param {DesktopWorkspaceUpdateArgs} args - Arguments to update one DesktopWorkspace.
     * @example
     * // Update one DesktopWorkspace
     * const desktopWorkspace = await prisma.desktopWorkspace.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends DesktopWorkspaceUpdateArgs>(args: SelectSubset<T, DesktopWorkspaceUpdateArgs<ExtArgs>>): Prisma__DesktopWorkspaceClient<$Result.GetResult<Prisma.$DesktopWorkspacePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more DesktopWorkspaces.
     * @param {DesktopWorkspaceDeleteManyArgs} args - Arguments to filter DesktopWorkspaces to delete.
     * @example
     * // Delete a few DesktopWorkspaces
     * const { count } = await prisma.desktopWorkspace.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends DesktopWorkspaceDeleteManyArgs>(args?: SelectSubset<T, DesktopWorkspaceDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more DesktopWorkspaces.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopWorkspaceUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many DesktopWorkspaces
     * const desktopWorkspace = await prisma.desktopWorkspace.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends DesktopWorkspaceUpdateManyArgs>(args: SelectSubset<T, DesktopWorkspaceUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more DesktopWorkspaces and returns the data updated in the database.
     * @param {DesktopWorkspaceUpdateManyAndReturnArgs} args - Arguments to update many DesktopWorkspaces.
     * @example
     * // Update many DesktopWorkspaces
     * const desktopWorkspace = await prisma.desktopWorkspace.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more DesktopWorkspaces and only return the `id`
     * const desktopWorkspaceWithIdOnly = await prisma.desktopWorkspace.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends DesktopWorkspaceUpdateManyAndReturnArgs>(args: SelectSubset<T, DesktopWorkspaceUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DesktopWorkspacePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one DesktopWorkspace.
     * @param {DesktopWorkspaceUpsertArgs} args - Arguments to update or create a DesktopWorkspace.
     * @example
     * // Update or create a DesktopWorkspace
     * const desktopWorkspace = await prisma.desktopWorkspace.upsert({
     *   create: {
     *     // ... data to create a DesktopWorkspace
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the DesktopWorkspace we want to update
     *   }
     * })
     */
    upsert<T extends DesktopWorkspaceUpsertArgs>(args: SelectSubset<T, DesktopWorkspaceUpsertArgs<ExtArgs>>): Prisma__DesktopWorkspaceClient<$Result.GetResult<Prisma.$DesktopWorkspacePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of DesktopWorkspaces.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopWorkspaceCountArgs} args - Arguments to filter DesktopWorkspaces to count.
     * @example
     * // Count the number of DesktopWorkspaces
     * const count = await prisma.desktopWorkspace.count({
     *   where: {
     *     // ... the filter for the DesktopWorkspaces we want to count
     *   }
     * })
    **/
    count<T extends DesktopWorkspaceCountArgs>(
      args?: Subset<T, DesktopWorkspaceCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], DesktopWorkspaceCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a DesktopWorkspace.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopWorkspaceAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends DesktopWorkspaceAggregateArgs>(args: Subset<T, DesktopWorkspaceAggregateArgs>): Prisma.PrismaPromise<GetDesktopWorkspaceAggregateType<T>>

    /**
     * Group by DesktopWorkspace.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopWorkspaceGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends DesktopWorkspaceGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: DesktopWorkspaceGroupByArgs['orderBy'] }
        : { orderBy?: DesktopWorkspaceGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, DesktopWorkspaceGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetDesktopWorkspaceGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the DesktopWorkspace model
   */
  readonly fields: DesktopWorkspaceFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for DesktopWorkspace.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__DesktopWorkspaceClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the DesktopWorkspace model
   */
  interface DesktopWorkspaceFieldRefs {
    readonly id: FieldRef<"DesktopWorkspace", 'String'>
    readonly name: FieldRef<"DesktopWorkspace", 'String'>
    readonly path: FieldRef<"DesktopWorkspace", 'String'>
    readonly linkedProjectId: FieldRef<"DesktopWorkspace", 'String'>
    readonly fileIndex: FieldRef<"DesktopWorkspace", 'String'>
    readonly indexingState: FieldRef<"DesktopWorkspace", 'String'>
    readonly localDraftCount: FieldRef<"DesktopWorkspace", 'Int'>
    readonly pendingSyncCount: FieldRef<"DesktopWorkspace", 'Int'>
    readonly createdAt: FieldRef<"DesktopWorkspace", 'String'>
    readonly updatedAt: FieldRef<"DesktopWorkspace", 'String'>
    readonly lastOpenedAt: FieldRef<"DesktopWorkspace", 'String'>
  }
    

  // Custom InputTypes
  /**
   * DesktopWorkspace findUnique
   */
  export type DesktopWorkspaceFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopWorkspace
     */
    select?: DesktopWorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopWorkspace
     */
    omit?: DesktopWorkspaceOmit<ExtArgs> | null
    /**
     * Filter, which DesktopWorkspace to fetch.
     */
    where: DesktopWorkspaceWhereUniqueInput
  }

  /**
   * DesktopWorkspace findUniqueOrThrow
   */
  export type DesktopWorkspaceFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopWorkspace
     */
    select?: DesktopWorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopWorkspace
     */
    omit?: DesktopWorkspaceOmit<ExtArgs> | null
    /**
     * Filter, which DesktopWorkspace to fetch.
     */
    where: DesktopWorkspaceWhereUniqueInput
  }

  /**
   * DesktopWorkspace findFirst
   */
  export type DesktopWorkspaceFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopWorkspace
     */
    select?: DesktopWorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopWorkspace
     */
    omit?: DesktopWorkspaceOmit<ExtArgs> | null
    /**
     * Filter, which DesktopWorkspace to fetch.
     */
    where?: DesktopWorkspaceWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of DesktopWorkspaces to fetch.
     */
    orderBy?: DesktopWorkspaceOrderByWithRelationInput | DesktopWorkspaceOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for DesktopWorkspaces.
     */
    cursor?: DesktopWorkspaceWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` DesktopWorkspaces from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` DesktopWorkspaces.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of DesktopWorkspaces.
     */
    distinct?: DesktopWorkspaceScalarFieldEnum | DesktopWorkspaceScalarFieldEnum[]
  }

  /**
   * DesktopWorkspace findFirstOrThrow
   */
  export type DesktopWorkspaceFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopWorkspace
     */
    select?: DesktopWorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopWorkspace
     */
    omit?: DesktopWorkspaceOmit<ExtArgs> | null
    /**
     * Filter, which DesktopWorkspace to fetch.
     */
    where?: DesktopWorkspaceWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of DesktopWorkspaces to fetch.
     */
    orderBy?: DesktopWorkspaceOrderByWithRelationInput | DesktopWorkspaceOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for DesktopWorkspaces.
     */
    cursor?: DesktopWorkspaceWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` DesktopWorkspaces from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` DesktopWorkspaces.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of DesktopWorkspaces.
     */
    distinct?: DesktopWorkspaceScalarFieldEnum | DesktopWorkspaceScalarFieldEnum[]
  }

  /**
   * DesktopWorkspace findMany
   */
  export type DesktopWorkspaceFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopWorkspace
     */
    select?: DesktopWorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopWorkspace
     */
    omit?: DesktopWorkspaceOmit<ExtArgs> | null
    /**
     * Filter, which DesktopWorkspaces to fetch.
     */
    where?: DesktopWorkspaceWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of DesktopWorkspaces to fetch.
     */
    orderBy?: DesktopWorkspaceOrderByWithRelationInput | DesktopWorkspaceOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing DesktopWorkspaces.
     */
    cursor?: DesktopWorkspaceWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` DesktopWorkspaces from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` DesktopWorkspaces.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of DesktopWorkspaces.
     */
    distinct?: DesktopWorkspaceScalarFieldEnum | DesktopWorkspaceScalarFieldEnum[]
  }

  /**
   * DesktopWorkspace create
   */
  export type DesktopWorkspaceCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopWorkspace
     */
    select?: DesktopWorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopWorkspace
     */
    omit?: DesktopWorkspaceOmit<ExtArgs> | null
    /**
     * The data needed to create a DesktopWorkspace.
     */
    data: XOR<DesktopWorkspaceCreateInput, DesktopWorkspaceUncheckedCreateInput>
  }

  /**
   * DesktopWorkspace createMany
   */
  export type DesktopWorkspaceCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many DesktopWorkspaces.
     */
    data: DesktopWorkspaceCreateManyInput | DesktopWorkspaceCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * DesktopWorkspace createManyAndReturn
   */
  export type DesktopWorkspaceCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopWorkspace
     */
    select?: DesktopWorkspaceSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopWorkspace
     */
    omit?: DesktopWorkspaceOmit<ExtArgs> | null
    /**
     * The data used to create many DesktopWorkspaces.
     */
    data: DesktopWorkspaceCreateManyInput | DesktopWorkspaceCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * DesktopWorkspace update
   */
  export type DesktopWorkspaceUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopWorkspace
     */
    select?: DesktopWorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopWorkspace
     */
    omit?: DesktopWorkspaceOmit<ExtArgs> | null
    /**
     * The data needed to update a DesktopWorkspace.
     */
    data: XOR<DesktopWorkspaceUpdateInput, DesktopWorkspaceUncheckedUpdateInput>
    /**
     * Choose, which DesktopWorkspace to update.
     */
    where: DesktopWorkspaceWhereUniqueInput
  }

  /**
   * DesktopWorkspace updateMany
   */
  export type DesktopWorkspaceUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update DesktopWorkspaces.
     */
    data: XOR<DesktopWorkspaceUpdateManyMutationInput, DesktopWorkspaceUncheckedUpdateManyInput>
    /**
     * Filter which DesktopWorkspaces to update
     */
    where?: DesktopWorkspaceWhereInput
    /**
     * Limit how many DesktopWorkspaces to update.
     */
    limit?: number
  }

  /**
   * DesktopWorkspace updateManyAndReturn
   */
  export type DesktopWorkspaceUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopWorkspace
     */
    select?: DesktopWorkspaceSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopWorkspace
     */
    omit?: DesktopWorkspaceOmit<ExtArgs> | null
    /**
     * The data used to update DesktopWorkspaces.
     */
    data: XOR<DesktopWorkspaceUpdateManyMutationInput, DesktopWorkspaceUncheckedUpdateManyInput>
    /**
     * Filter which DesktopWorkspaces to update
     */
    where?: DesktopWorkspaceWhereInput
    /**
     * Limit how many DesktopWorkspaces to update.
     */
    limit?: number
  }

  /**
   * DesktopWorkspace upsert
   */
  export type DesktopWorkspaceUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopWorkspace
     */
    select?: DesktopWorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopWorkspace
     */
    omit?: DesktopWorkspaceOmit<ExtArgs> | null
    /**
     * The filter to search for the DesktopWorkspace to update in case it exists.
     */
    where: DesktopWorkspaceWhereUniqueInput
    /**
     * In case the DesktopWorkspace found by the `where` argument doesn't exist, create a new DesktopWorkspace with this data.
     */
    create: XOR<DesktopWorkspaceCreateInput, DesktopWorkspaceUncheckedCreateInput>
    /**
     * In case the DesktopWorkspace was found with the provided `where` argument, update it with this data.
     */
    update: XOR<DesktopWorkspaceUpdateInput, DesktopWorkspaceUncheckedUpdateInput>
  }

  /**
   * DesktopWorkspace delete
   */
  export type DesktopWorkspaceDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopWorkspace
     */
    select?: DesktopWorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopWorkspace
     */
    omit?: DesktopWorkspaceOmit<ExtArgs> | null
    /**
     * Filter which DesktopWorkspace to delete.
     */
    where: DesktopWorkspaceWhereUniqueInput
  }

  /**
   * DesktopWorkspace deleteMany
   */
  export type DesktopWorkspaceDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which DesktopWorkspaces to delete
     */
    where?: DesktopWorkspaceWhereInput
    /**
     * Limit how many DesktopWorkspaces to delete.
     */
    limit?: number
  }

  /**
   * DesktopWorkspace without action
   */
  export type DesktopWorkspaceDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopWorkspace
     */
    select?: DesktopWorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopWorkspace
     */
    omit?: DesktopWorkspaceOmit<ExtArgs> | null
  }


  /**
   * Model DesktopSyncJob
   */

  export type AggregateDesktopSyncJob = {
    _count: DesktopSyncJobCountAggregateOutputType | null
    _avg: DesktopSyncJobAvgAggregateOutputType | null
    _sum: DesktopSyncJobSumAggregateOutputType | null
    _min: DesktopSyncJobMinAggregateOutputType | null
    _max: DesktopSyncJobMaxAggregateOutputType | null
  }

  export type DesktopSyncJobAvgAggregateOutputType = {
    retryCount: number | null
  }

  export type DesktopSyncJobSumAggregateOutputType = {
    retryCount: number | null
  }

  export type DesktopSyncJobMinAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    type: string | null
    payload: string | null
    status: string | null
    error: string | null
    retryCount: number | null
    createdAt: string | null
    updatedAt: string | null
  }

  export type DesktopSyncJobMaxAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    type: string | null
    payload: string | null
    status: string | null
    error: string | null
    retryCount: number | null
    createdAt: string | null
    updatedAt: string | null
  }

  export type DesktopSyncJobCountAggregateOutputType = {
    id: number
    workspaceId: number
    type: number
    payload: number
    status: number
    error: number
    retryCount: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type DesktopSyncJobAvgAggregateInputType = {
    retryCount?: true
  }

  export type DesktopSyncJobSumAggregateInputType = {
    retryCount?: true
  }

  export type DesktopSyncJobMinAggregateInputType = {
    id?: true
    workspaceId?: true
    type?: true
    payload?: true
    status?: true
    error?: true
    retryCount?: true
    createdAt?: true
    updatedAt?: true
  }

  export type DesktopSyncJobMaxAggregateInputType = {
    id?: true
    workspaceId?: true
    type?: true
    payload?: true
    status?: true
    error?: true
    retryCount?: true
    createdAt?: true
    updatedAt?: true
  }

  export type DesktopSyncJobCountAggregateInputType = {
    id?: true
    workspaceId?: true
    type?: true
    payload?: true
    status?: true
    error?: true
    retryCount?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type DesktopSyncJobAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which DesktopSyncJob to aggregate.
     */
    where?: DesktopSyncJobWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of DesktopSyncJobs to fetch.
     */
    orderBy?: DesktopSyncJobOrderByWithRelationInput | DesktopSyncJobOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: DesktopSyncJobWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` DesktopSyncJobs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` DesktopSyncJobs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned DesktopSyncJobs
    **/
    _count?: true | DesktopSyncJobCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: DesktopSyncJobAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: DesktopSyncJobSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: DesktopSyncJobMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: DesktopSyncJobMaxAggregateInputType
  }

  export type GetDesktopSyncJobAggregateType<T extends DesktopSyncJobAggregateArgs> = {
        [P in keyof T & keyof AggregateDesktopSyncJob]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateDesktopSyncJob[P]>
      : GetScalarType<T[P], AggregateDesktopSyncJob[P]>
  }




  export type DesktopSyncJobGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: DesktopSyncJobWhereInput
    orderBy?: DesktopSyncJobOrderByWithAggregationInput | DesktopSyncJobOrderByWithAggregationInput[]
    by: DesktopSyncJobScalarFieldEnum[] | DesktopSyncJobScalarFieldEnum
    having?: DesktopSyncJobScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: DesktopSyncJobCountAggregateInputType | true
    _avg?: DesktopSyncJobAvgAggregateInputType
    _sum?: DesktopSyncJobSumAggregateInputType
    _min?: DesktopSyncJobMinAggregateInputType
    _max?: DesktopSyncJobMaxAggregateInputType
  }

  export type DesktopSyncJobGroupByOutputType = {
    id: string
    workspaceId: string | null
    type: string
    payload: string
    status: string
    error: string | null
    retryCount: number
    createdAt: string
    updatedAt: string
    _count: DesktopSyncJobCountAggregateOutputType | null
    _avg: DesktopSyncJobAvgAggregateOutputType | null
    _sum: DesktopSyncJobSumAggregateOutputType | null
    _min: DesktopSyncJobMinAggregateOutputType | null
    _max: DesktopSyncJobMaxAggregateOutputType | null
  }

  type GetDesktopSyncJobGroupByPayload<T extends DesktopSyncJobGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<DesktopSyncJobGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof DesktopSyncJobGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], DesktopSyncJobGroupByOutputType[P]>
            : GetScalarType<T[P], DesktopSyncJobGroupByOutputType[P]>
        }
      >
    >


  export type DesktopSyncJobSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    type?: boolean
    payload?: boolean
    status?: boolean
    error?: boolean
    retryCount?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["desktopSyncJob"]>

  export type DesktopSyncJobSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    type?: boolean
    payload?: boolean
    status?: boolean
    error?: boolean
    retryCount?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["desktopSyncJob"]>

  export type DesktopSyncJobSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    type?: boolean
    payload?: boolean
    status?: boolean
    error?: boolean
    retryCount?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["desktopSyncJob"]>

  export type DesktopSyncJobSelectScalar = {
    id?: boolean
    workspaceId?: boolean
    type?: boolean
    payload?: boolean
    status?: boolean
    error?: boolean
    retryCount?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type DesktopSyncJobOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "workspaceId" | "type" | "payload" | "status" | "error" | "retryCount" | "createdAt" | "updatedAt", ExtArgs["result"]["desktopSyncJob"]>

  export type $DesktopSyncJobPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "DesktopSyncJob"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      workspaceId: string | null
      type: string
      payload: string
      status: string
      error: string | null
      retryCount: number
      createdAt: string
      updatedAt: string
    }, ExtArgs["result"]["desktopSyncJob"]>
    composites: {}
  }

  type DesktopSyncJobGetPayload<S extends boolean | null | undefined | DesktopSyncJobDefaultArgs> = $Result.GetResult<Prisma.$DesktopSyncJobPayload, S>

  type DesktopSyncJobCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<DesktopSyncJobFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: DesktopSyncJobCountAggregateInputType | true
    }

  export interface DesktopSyncJobDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['DesktopSyncJob'], meta: { name: 'DesktopSyncJob' } }
    /**
     * Find zero or one DesktopSyncJob that matches the filter.
     * @param {DesktopSyncJobFindUniqueArgs} args - Arguments to find a DesktopSyncJob
     * @example
     * // Get one DesktopSyncJob
     * const desktopSyncJob = await prisma.desktopSyncJob.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends DesktopSyncJobFindUniqueArgs>(args: SelectSubset<T, DesktopSyncJobFindUniqueArgs<ExtArgs>>): Prisma__DesktopSyncJobClient<$Result.GetResult<Prisma.$DesktopSyncJobPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one DesktopSyncJob that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {DesktopSyncJobFindUniqueOrThrowArgs} args - Arguments to find a DesktopSyncJob
     * @example
     * // Get one DesktopSyncJob
     * const desktopSyncJob = await prisma.desktopSyncJob.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends DesktopSyncJobFindUniqueOrThrowArgs>(args: SelectSubset<T, DesktopSyncJobFindUniqueOrThrowArgs<ExtArgs>>): Prisma__DesktopSyncJobClient<$Result.GetResult<Prisma.$DesktopSyncJobPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first DesktopSyncJob that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopSyncJobFindFirstArgs} args - Arguments to find a DesktopSyncJob
     * @example
     * // Get one DesktopSyncJob
     * const desktopSyncJob = await prisma.desktopSyncJob.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends DesktopSyncJobFindFirstArgs>(args?: SelectSubset<T, DesktopSyncJobFindFirstArgs<ExtArgs>>): Prisma__DesktopSyncJobClient<$Result.GetResult<Prisma.$DesktopSyncJobPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first DesktopSyncJob that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopSyncJobFindFirstOrThrowArgs} args - Arguments to find a DesktopSyncJob
     * @example
     * // Get one DesktopSyncJob
     * const desktopSyncJob = await prisma.desktopSyncJob.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends DesktopSyncJobFindFirstOrThrowArgs>(args?: SelectSubset<T, DesktopSyncJobFindFirstOrThrowArgs<ExtArgs>>): Prisma__DesktopSyncJobClient<$Result.GetResult<Prisma.$DesktopSyncJobPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more DesktopSyncJobs that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopSyncJobFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all DesktopSyncJobs
     * const desktopSyncJobs = await prisma.desktopSyncJob.findMany()
     * 
     * // Get first 10 DesktopSyncJobs
     * const desktopSyncJobs = await prisma.desktopSyncJob.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const desktopSyncJobWithIdOnly = await prisma.desktopSyncJob.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends DesktopSyncJobFindManyArgs>(args?: SelectSubset<T, DesktopSyncJobFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DesktopSyncJobPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a DesktopSyncJob.
     * @param {DesktopSyncJobCreateArgs} args - Arguments to create a DesktopSyncJob.
     * @example
     * // Create one DesktopSyncJob
     * const DesktopSyncJob = await prisma.desktopSyncJob.create({
     *   data: {
     *     // ... data to create a DesktopSyncJob
     *   }
     * })
     * 
     */
    create<T extends DesktopSyncJobCreateArgs>(args: SelectSubset<T, DesktopSyncJobCreateArgs<ExtArgs>>): Prisma__DesktopSyncJobClient<$Result.GetResult<Prisma.$DesktopSyncJobPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many DesktopSyncJobs.
     * @param {DesktopSyncJobCreateManyArgs} args - Arguments to create many DesktopSyncJobs.
     * @example
     * // Create many DesktopSyncJobs
     * const desktopSyncJob = await prisma.desktopSyncJob.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends DesktopSyncJobCreateManyArgs>(args?: SelectSubset<T, DesktopSyncJobCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many DesktopSyncJobs and returns the data saved in the database.
     * @param {DesktopSyncJobCreateManyAndReturnArgs} args - Arguments to create many DesktopSyncJobs.
     * @example
     * // Create many DesktopSyncJobs
     * const desktopSyncJob = await prisma.desktopSyncJob.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many DesktopSyncJobs and only return the `id`
     * const desktopSyncJobWithIdOnly = await prisma.desktopSyncJob.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends DesktopSyncJobCreateManyAndReturnArgs>(args?: SelectSubset<T, DesktopSyncJobCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DesktopSyncJobPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a DesktopSyncJob.
     * @param {DesktopSyncJobDeleteArgs} args - Arguments to delete one DesktopSyncJob.
     * @example
     * // Delete one DesktopSyncJob
     * const DesktopSyncJob = await prisma.desktopSyncJob.delete({
     *   where: {
     *     // ... filter to delete one DesktopSyncJob
     *   }
     * })
     * 
     */
    delete<T extends DesktopSyncJobDeleteArgs>(args: SelectSubset<T, DesktopSyncJobDeleteArgs<ExtArgs>>): Prisma__DesktopSyncJobClient<$Result.GetResult<Prisma.$DesktopSyncJobPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one DesktopSyncJob.
     * @param {DesktopSyncJobUpdateArgs} args - Arguments to update one DesktopSyncJob.
     * @example
     * // Update one DesktopSyncJob
     * const desktopSyncJob = await prisma.desktopSyncJob.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends DesktopSyncJobUpdateArgs>(args: SelectSubset<T, DesktopSyncJobUpdateArgs<ExtArgs>>): Prisma__DesktopSyncJobClient<$Result.GetResult<Prisma.$DesktopSyncJobPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more DesktopSyncJobs.
     * @param {DesktopSyncJobDeleteManyArgs} args - Arguments to filter DesktopSyncJobs to delete.
     * @example
     * // Delete a few DesktopSyncJobs
     * const { count } = await prisma.desktopSyncJob.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends DesktopSyncJobDeleteManyArgs>(args?: SelectSubset<T, DesktopSyncJobDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more DesktopSyncJobs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopSyncJobUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many DesktopSyncJobs
     * const desktopSyncJob = await prisma.desktopSyncJob.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends DesktopSyncJobUpdateManyArgs>(args: SelectSubset<T, DesktopSyncJobUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more DesktopSyncJobs and returns the data updated in the database.
     * @param {DesktopSyncJobUpdateManyAndReturnArgs} args - Arguments to update many DesktopSyncJobs.
     * @example
     * // Update many DesktopSyncJobs
     * const desktopSyncJob = await prisma.desktopSyncJob.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more DesktopSyncJobs and only return the `id`
     * const desktopSyncJobWithIdOnly = await prisma.desktopSyncJob.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends DesktopSyncJobUpdateManyAndReturnArgs>(args: SelectSubset<T, DesktopSyncJobUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DesktopSyncJobPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one DesktopSyncJob.
     * @param {DesktopSyncJobUpsertArgs} args - Arguments to update or create a DesktopSyncJob.
     * @example
     * // Update or create a DesktopSyncJob
     * const desktopSyncJob = await prisma.desktopSyncJob.upsert({
     *   create: {
     *     // ... data to create a DesktopSyncJob
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the DesktopSyncJob we want to update
     *   }
     * })
     */
    upsert<T extends DesktopSyncJobUpsertArgs>(args: SelectSubset<T, DesktopSyncJobUpsertArgs<ExtArgs>>): Prisma__DesktopSyncJobClient<$Result.GetResult<Prisma.$DesktopSyncJobPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of DesktopSyncJobs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopSyncJobCountArgs} args - Arguments to filter DesktopSyncJobs to count.
     * @example
     * // Count the number of DesktopSyncJobs
     * const count = await prisma.desktopSyncJob.count({
     *   where: {
     *     // ... the filter for the DesktopSyncJobs we want to count
     *   }
     * })
    **/
    count<T extends DesktopSyncJobCountArgs>(
      args?: Subset<T, DesktopSyncJobCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], DesktopSyncJobCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a DesktopSyncJob.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopSyncJobAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends DesktopSyncJobAggregateArgs>(args: Subset<T, DesktopSyncJobAggregateArgs>): Prisma.PrismaPromise<GetDesktopSyncJobAggregateType<T>>

    /**
     * Group by DesktopSyncJob.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopSyncJobGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends DesktopSyncJobGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: DesktopSyncJobGroupByArgs['orderBy'] }
        : { orderBy?: DesktopSyncJobGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, DesktopSyncJobGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetDesktopSyncJobGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the DesktopSyncJob model
   */
  readonly fields: DesktopSyncJobFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for DesktopSyncJob.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__DesktopSyncJobClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the DesktopSyncJob model
   */
  interface DesktopSyncJobFieldRefs {
    readonly id: FieldRef<"DesktopSyncJob", 'String'>
    readonly workspaceId: FieldRef<"DesktopSyncJob", 'String'>
    readonly type: FieldRef<"DesktopSyncJob", 'String'>
    readonly payload: FieldRef<"DesktopSyncJob", 'String'>
    readonly status: FieldRef<"DesktopSyncJob", 'String'>
    readonly error: FieldRef<"DesktopSyncJob", 'String'>
    readonly retryCount: FieldRef<"DesktopSyncJob", 'Int'>
    readonly createdAt: FieldRef<"DesktopSyncJob", 'String'>
    readonly updatedAt: FieldRef<"DesktopSyncJob", 'String'>
  }
    

  // Custom InputTypes
  /**
   * DesktopSyncJob findUnique
   */
  export type DesktopSyncJobFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopSyncJob
     */
    select?: DesktopSyncJobSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopSyncJob
     */
    omit?: DesktopSyncJobOmit<ExtArgs> | null
    /**
     * Filter, which DesktopSyncJob to fetch.
     */
    where: DesktopSyncJobWhereUniqueInput
  }

  /**
   * DesktopSyncJob findUniqueOrThrow
   */
  export type DesktopSyncJobFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopSyncJob
     */
    select?: DesktopSyncJobSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopSyncJob
     */
    omit?: DesktopSyncJobOmit<ExtArgs> | null
    /**
     * Filter, which DesktopSyncJob to fetch.
     */
    where: DesktopSyncJobWhereUniqueInput
  }

  /**
   * DesktopSyncJob findFirst
   */
  export type DesktopSyncJobFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopSyncJob
     */
    select?: DesktopSyncJobSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopSyncJob
     */
    omit?: DesktopSyncJobOmit<ExtArgs> | null
    /**
     * Filter, which DesktopSyncJob to fetch.
     */
    where?: DesktopSyncJobWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of DesktopSyncJobs to fetch.
     */
    orderBy?: DesktopSyncJobOrderByWithRelationInput | DesktopSyncJobOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for DesktopSyncJobs.
     */
    cursor?: DesktopSyncJobWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` DesktopSyncJobs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` DesktopSyncJobs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of DesktopSyncJobs.
     */
    distinct?: DesktopSyncJobScalarFieldEnum | DesktopSyncJobScalarFieldEnum[]
  }

  /**
   * DesktopSyncJob findFirstOrThrow
   */
  export type DesktopSyncJobFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopSyncJob
     */
    select?: DesktopSyncJobSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopSyncJob
     */
    omit?: DesktopSyncJobOmit<ExtArgs> | null
    /**
     * Filter, which DesktopSyncJob to fetch.
     */
    where?: DesktopSyncJobWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of DesktopSyncJobs to fetch.
     */
    orderBy?: DesktopSyncJobOrderByWithRelationInput | DesktopSyncJobOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for DesktopSyncJobs.
     */
    cursor?: DesktopSyncJobWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` DesktopSyncJobs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` DesktopSyncJobs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of DesktopSyncJobs.
     */
    distinct?: DesktopSyncJobScalarFieldEnum | DesktopSyncJobScalarFieldEnum[]
  }

  /**
   * DesktopSyncJob findMany
   */
  export type DesktopSyncJobFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopSyncJob
     */
    select?: DesktopSyncJobSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopSyncJob
     */
    omit?: DesktopSyncJobOmit<ExtArgs> | null
    /**
     * Filter, which DesktopSyncJobs to fetch.
     */
    where?: DesktopSyncJobWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of DesktopSyncJobs to fetch.
     */
    orderBy?: DesktopSyncJobOrderByWithRelationInput | DesktopSyncJobOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing DesktopSyncJobs.
     */
    cursor?: DesktopSyncJobWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` DesktopSyncJobs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` DesktopSyncJobs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of DesktopSyncJobs.
     */
    distinct?: DesktopSyncJobScalarFieldEnum | DesktopSyncJobScalarFieldEnum[]
  }

  /**
   * DesktopSyncJob create
   */
  export type DesktopSyncJobCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopSyncJob
     */
    select?: DesktopSyncJobSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopSyncJob
     */
    omit?: DesktopSyncJobOmit<ExtArgs> | null
    /**
     * The data needed to create a DesktopSyncJob.
     */
    data: XOR<DesktopSyncJobCreateInput, DesktopSyncJobUncheckedCreateInput>
  }

  /**
   * DesktopSyncJob createMany
   */
  export type DesktopSyncJobCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many DesktopSyncJobs.
     */
    data: DesktopSyncJobCreateManyInput | DesktopSyncJobCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * DesktopSyncJob createManyAndReturn
   */
  export type DesktopSyncJobCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopSyncJob
     */
    select?: DesktopSyncJobSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopSyncJob
     */
    omit?: DesktopSyncJobOmit<ExtArgs> | null
    /**
     * The data used to create many DesktopSyncJobs.
     */
    data: DesktopSyncJobCreateManyInput | DesktopSyncJobCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * DesktopSyncJob update
   */
  export type DesktopSyncJobUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopSyncJob
     */
    select?: DesktopSyncJobSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopSyncJob
     */
    omit?: DesktopSyncJobOmit<ExtArgs> | null
    /**
     * The data needed to update a DesktopSyncJob.
     */
    data: XOR<DesktopSyncJobUpdateInput, DesktopSyncJobUncheckedUpdateInput>
    /**
     * Choose, which DesktopSyncJob to update.
     */
    where: DesktopSyncJobWhereUniqueInput
  }

  /**
   * DesktopSyncJob updateMany
   */
  export type DesktopSyncJobUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update DesktopSyncJobs.
     */
    data: XOR<DesktopSyncJobUpdateManyMutationInput, DesktopSyncJobUncheckedUpdateManyInput>
    /**
     * Filter which DesktopSyncJobs to update
     */
    where?: DesktopSyncJobWhereInput
    /**
     * Limit how many DesktopSyncJobs to update.
     */
    limit?: number
  }

  /**
   * DesktopSyncJob updateManyAndReturn
   */
  export type DesktopSyncJobUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopSyncJob
     */
    select?: DesktopSyncJobSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopSyncJob
     */
    omit?: DesktopSyncJobOmit<ExtArgs> | null
    /**
     * The data used to update DesktopSyncJobs.
     */
    data: XOR<DesktopSyncJobUpdateManyMutationInput, DesktopSyncJobUncheckedUpdateManyInput>
    /**
     * Filter which DesktopSyncJobs to update
     */
    where?: DesktopSyncJobWhereInput
    /**
     * Limit how many DesktopSyncJobs to update.
     */
    limit?: number
  }

  /**
   * DesktopSyncJob upsert
   */
  export type DesktopSyncJobUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopSyncJob
     */
    select?: DesktopSyncJobSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopSyncJob
     */
    omit?: DesktopSyncJobOmit<ExtArgs> | null
    /**
     * The filter to search for the DesktopSyncJob to update in case it exists.
     */
    where: DesktopSyncJobWhereUniqueInput
    /**
     * In case the DesktopSyncJob found by the `where` argument doesn't exist, create a new DesktopSyncJob with this data.
     */
    create: XOR<DesktopSyncJobCreateInput, DesktopSyncJobUncheckedCreateInput>
    /**
     * In case the DesktopSyncJob was found with the provided `where` argument, update it with this data.
     */
    update: XOR<DesktopSyncJobUpdateInput, DesktopSyncJobUncheckedUpdateInput>
  }

  /**
   * DesktopSyncJob delete
   */
  export type DesktopSyncJobDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopSyncJob
     */
    select?: DesktopSyncJobSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopSyncJob
     */
    omit?: DesktopSyncJobOmit<ExtArgs> | null
    /**
     * Filter which DesktopSyncJob to delete.
     */
    where: DesktopSyncJobWhereUniqueInput
  }

  /**
   * DesktopSyncJob deleteMany
   */
  export type DesktopSyncJobDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which DesktopSyncJobs to delete
     */
    where?: DesktopSyncJobWhereInput
    /**
     * Limit how many DesktopSyncJobs to delete.
     */
    limit?: number
  }

  /**
   * DesktopSyncJob without action
   */
  export type DesktopSyncJobDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopSyncJob
     */
    select?: DesktopSyncJobSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopSyncJob
     */
    omit?: DesktopSyncJobOmit<ExtArgs> | null
  }


  /**
   * Model DesktopRecentItem
   */

  export type AggregateDesktopRecentItem = {
    _count: DesktopRecentItemCountAggregateOutputType | null
    _min: DesktopRecentItemMinAggregateOutputType | null
    _max: DesktopRecentItemMaxAggregateOutputType | null
  }

  export type DesktopRecentItemMinAggregateOutputType = {
    id: string | null
    kind: string | null
    label: string | null
    value: string | null
    openedAt: string | null
  }

  export type DesktopRecentItemMaxAggregateOutputType = {
    id: string | null
    kind: string | null
    label: string | null
    value: string | null
    openedAt: string | null
  }

  export type DesktopRecentItemCountAggregateOutputType = {
    id: number
    kind: number
    label: number
    value: number
    openedAt: number
    _all: number
  }


  export type DesktopRecentItemMinAggregateInputType = {
    id?: true
    kind?: true
    label?: true
    value?: true
    openedAt?: true
  }

  export type DesktopRecentItemMaxAggregateInputType = {
    id?: true
    kind?: true
    label?: true
    value?: true
    openedAt?: true
  }

  export type DesktopRecentItemCountAggregateInputType = {
    id?: true
    kind?: true
    label?: true
    value?: true
    openedAt?: true
    _all?: true
  }

  export type DesktopRecentItemAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which DesktopRecentItem to aggregate.
     */
    where?: DesktopRecentItemWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of DesktopRecentItems to fetch.
     */
    orderBy?: DesktopRecentItemOrderByWithRelationInput | DesktopRecentItemOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: DesktopRecentItemWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` DesktopRecentItems from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` DesktopRecentItems.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned DesktopRecentItems
    **/
    _count?: true | DesktopRecentItemCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: DesktopRecentItemMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: DesktopRecentItemMaxAggregateInputType
  }

  export type GetDesktopRecentItemAggregateType<T extends DesktopRecentItemAggregateArgs> = {
        [P in keyof T & keyof AggregateDesktopRecentItem]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateDesktopRecentItem[P]>
      : GetScalarType<T[P], AggregateDesktopRecentItem[P]>
  }




  export type DesktopRecentItemGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: DesktopRecentItemWhereInput
    orderBy?: DesktopRecentItemOrderByWithAggregationInput | DesktopRecentItemOrderByWithAggregationInput[]
    by: DesktopRecentItemScalarFieldEnum[] | DesktopRecentItemScalarFieldEnum
    having?: DesktopRecentItemScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: DesktopRecentItemCountAggregateInputType | true
    _min?: DesktopRecentItemMinAggregateInputType
    _max?: DesktopRecentItemMaxAggregateInputType
  }

  export type DesktopRecentItemGroupByOutputType = {
    id: string
    kind: string
    label: string
    value: string
    openedAt: string
    _count: DesktopRecentItemCountAggregateOutputType | null
    _min: DesktopRecentItemMinAggregateOutputType | null
    _max: DesktopRecentItemMaxAggregateOutputType | null
  }

  type GetDesktopRecentItemGroupByPayload<T extends DesktopRecentItemGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<DesktopRecentItemGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof DesktopRecentItemGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], DesktopRecentItemGroupByOutputType[P]>
            : GetScalarType<T[P], DesktopRecentItemGroupByOutputType[P]>
        }
      >
    >


  export type DesktopRecentItemSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    kind?: boolean
    label?: boolean
    value?: boolean
    openedAt?: boolean
  }, ExtArgs["result"]["desktopRecentItem"]>

  export type DesktopRecentItemSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    kind?: boolean
    label?: boolean
    value?: boolean
    openedAt?: boolean
  }, ExtArgs["result"]["desktopRecentItem"]>

  export type DesktopRecentItemSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    kind?: boolean
    label?: boolean
    value?: boolean
    openedAt?: boolean
  }, ExtArgs["result"]["desktopRecentItem"]>

  export type DesktopRecentItemSelectScalar = {
    id?: boolean
    kind?: boolean
    label?: boolean
    value?: boolean
    openedAt?: boolean
  }

  export type DesktopRecentItemOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "kind" | "label" | "value" | "openedAt", ExtArgs["result"]["desktopRecentItem"]>

  export type $DesktopRecentItemPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "DesktopRecentItem"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      kind: string
      label: string
      value: string
      openedAt: string
    }, ExtArgs["result"]["desktopRecentItem"]>
    composites: {}
  }

  type DesktopRecentItemGetPayload<S extends boolean | null | undefined | DesktopRecentItemDefaultArgs> = $Result.GetResult<Prisma.$DesktopRecentItemPayload, S>

  type DesktopRecentItemCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<DesktopRecentItemFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: DesktopRecentItemCountAggregateInputType | true
    }

  export interface DesktopRecentItemDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['DesktopRecentItem'], meta: { name: 'DesktopRecentItem' } }
    /**
     * Find zero or one DesktopRecentItem that matches the filter.
     * @param {DesktopRecentItemFindUniqueArgs} args - Arguments to find a DesktopRecentItem
     * @example
     * // Get one DesktopRecentItem
     * const desktopRecentItem = await prisma.desktopRecentItem.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends DesktopRecentItemFindUniqueArgs>(args: SelectSubset<T, DesktopRecentItemFindUniqueArgs<ExtArgs>>): Prisma__DesktopRecentItemClient<$Result.GetResult<Prisma.$DesktopRecentItemPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one DesktopRecentItem that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {DesktopRecentItemFindUniqueOrThrowArgs} args - Arguments to find a DesktopRecentItem
     * @example
     * // Get one DesktopRecentItem
     * const desktopRecentItem = await prisma.desktopRecentItem.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends DesktopRecentItemFindUniqueOrThrowArgs>(args: SelectSubset<T, DesktopRecentItemFindUniqueOrThrowArgs<ExtArgs>>): Prisma__DesktopRecentItemClient<$Result.GetResult<Prisma.$DesktopRecentItemPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first DesktopRecentItem that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopRecentItemFindFirstArgs} args - Arguments to find a DesktopRecentItem
     * @example
     * // Get one DesktopRecentItem
     * const desktopRecentItem = await prisma.desktopRecentItem.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends DesktopRecentItemFindFirstArgs>(args?: SelectSubset<T, DesktopRecentItemFindFirstArgs<ExtArgs>>): Prisma__DesktopRecentItemClient<$Result.GetResult<Prisma.$DesktopRecentItemPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first DesktopRecentItem that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopRecentItemFindFirstOrThrowArgs} args - Arguments to find a DesktopRecentItem
     * @example
     * // Get one DesktopRecentItem
     * const desktopRecentItem = await prisma.desktopRecentItem.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends DesktopRecentItemFindFirstOrThrowArgs>(args?: SelectSubset<T, DesktopRecentItemFindFirstOrThrowArgs<ExtArgs>>): Prisma__DesktopRecentItemClient<$Result.GetResult<Prisma.$DesktopRecentItemPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more DesktopRecentItems that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopRecentItemFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all DesktopRecentItems
     * const desktopRecentItems = await prisma.desktopRecentItem.findMany()
     * 
     * // Get first 10 DesktopRecentItems
     * const desktopRecentItems = await prisma.desktopRecentItem.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const desktopRecentItemWithIdOnly = await prisma.desktopRecentItem.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends DesktopRecentItemFindManyArgs>(args?: SelectSubset<T, DesktopRecentItemFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DesktopRecentItemPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a DesktopRecentItem.
     * @param {DesktopRecentItemCreateArgs} args - Arguments to create a DesktopRecentItem.
     * @example
     * // Create one DesktopRecentItem
     * const DesktopRecentItem = await prisma.desktopRecentItem.create({
     *   data: {
     *     // ... data to create a DesktopRecentItem
     *   }
     * })
     * 
     */
    create<T extends DesktopRecentItemCreateArgs>(args: SelectSubset<T, DesktopRecentItemCreateArgs<ExtArgs>>): Prisma__DesktopRecentItemClient<$Result.GetResult<Prisma.$DesktopRecentItemPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many DesktopRecentItems.
     * @param {DesktopRecentItemCreateManyArgs} args - Arguments to create many DesktopRecentItems.
     * @example
     * // Create many DesktopRecentItems
     * const desktopRecentItem = await prisma.desktopRecentItem.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends DesktopRecentItemCreateManyArgs>(args?: SelectSubset<T, DesktopRecentItemCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many DesktopRecentItems and returns the data saved in the database.
     * @param {DesktopRecentItemCreateManyAndReturnArgs} args - Arguments to create many DesktopRecentItems.
     * @example
     * // Create many DesktopRecentItems
     * const desktopRecentItem = await prisma.desktopRecentItem.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many DesktopRecentItems and only return the `id`
     * const desktopRecentItemWithIdOnly = await prisma.desktopRecentItem.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends DesktopRecentItemCreateManyAndReturnArgs>(args?: SelectSubset<T, DesktopRecentItemCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DesktopRecentItemPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a DesktopRecentItem.
     * @param {DesktopRecentItemDeleteArgs} args - Arguments to delete one DesktopRecentItem.
     * @example
     * // Delete one DesktopRecentItem
     * const DesktopRecentItem = await prisma.desktopRecentItem.delete({
     *   where: {
     *     // ... filter to delete one DesktopRecentItem
     *   }
     * })
     * 
     */
    delete<T extends DesktopRecentItemDeleteArgs>(args: SelectSubset<T, DesktopRecentItemDeleteArgs<ExtArgs>>): Prisma__DesktopRecentItemClient<$Result.GetResult<Prisma.$DesktopRecentItemPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one DesktopRecentItem.
     * @param {DesktopRecentItemUpdateArgs} args - Arguments to update one DesktopRecentItem.
     * @example
     * // Update one DesktopRecentItem
     * const desktopRecentItem = await prisma.desktopRecentItem.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends DesktopRecentItemUpdateArgs>(args: SelectSubset<T, DesktopRecentItemUpdateArgs<ExtArgs>>): Prisma__DesktopRecentItemClient<$Result.GetResult<Prisma.$DesktopRecentItemPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more DesktopRecentItems.
     * @param {DesktopRecentItemDeleteManyArgs} args - Arguments to filter DesktopRecentItems to delete.
     * @example
     * // Delete a few DesktopRecentItems
     * const { count } = await prisma.desktopRecentItem.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends DesktopRecentItemDeleteManyArgs>(args?: SelectSubset<T, DesktopRecentItemDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more DesktopRecentItems.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopRecentItemUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many DesktopRecentItems
     * const desktopRecentItem = await prisma.desktopRecentItem.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends DesktopRecentItemUpdateManyArgs>(args: SelectSubset<T, DesktopRecentItemUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more DesktopRecentItems and returns the data updated in the database.
     * @param {DesktopRecentItemUpdateManyAndReturnArgs} args - Arguments to update many DesktopRecentItems.
     * @example
     * // Update many DesktopRecentItems
     * const desktopRecentItem = await prisma.desktopRecentItem.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more DesktopRecentItems and only return the `id`
     * const desktopRecentItemWithIdOnly = await prisma.desktopRecentItem.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends DesktopRecentItemUpdateManyAndReturnArgs>(args: SelectSubset<T, DesktopRecentItemUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DesktopRecentItemPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one DesktopRecentItem.
     * @param {DesktopRecentItemUpsertArgs} args - Arguments to update or create a DesktopRecentItem.
     * @example
     * // Update or create a DesktopRecentItem
     * const desktopRecentItem = await prisma.desktopRecentItem.upsert({
     *   create: {
     *     // ... data to create a DesktopRecentItem
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the DesktopRecentItem we want to update
     *   }
     * })
     */
    upsert<T extends DesktopRecentItemUpsertArgs>(args: SelectSubset<T, DesktopRecentItemUpsertArgs<ExtArgs>>): Prisma__DesktopRecentItemClient<$Result.GetResult<Prisma.$DesktopRecentItemPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of DesktopRecentItems.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopRecentItemCountArgs} args - Arguments to filter DesktopRecentItems to count.
     * @example
     * // Count the number of DesktopRecentItems
     * const count = await prisma.desktopRecentItem.count({
     *   where: {
     *     // ... the filter for the DesktopRecentItems we want to count
     *   }
     * })
    **/
    count<T extends DesktopRecentItemCountArgs>(
      args?: Subset<T, DesktopRecentItemCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], DesktopRecentItemCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a DesktopRecentItem.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopRecentItemAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends DesktopRecentItemAggregateArgs>(args: Subset<T, DesktopRecentItemAggregateArgs>): Prisma.PrismaPromise<GetDesktopRecentItemAggregateType<T>>

    /**
     * Group by DesktopRecentItem.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DesktopRecentItemGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends DesktopRecentItemGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: DesktopRecentItemGroupByArgs['orderBy'] }
        : { orderBy?: DesktopRecentItemGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, DesktopRecentItemGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetDesktopRecentItemGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the DesktopRecentItem model
   */
  readonly fields: DesktopRecentItemFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for DesktopRecentItem.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__DesktopRecentItemClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the DesktopRecentItem model
   */
  interface DesktopRecentItemFieldRefs {
    readonly id: FieldRef<"DesktopRecentItem", 'String'>
    readonly kind: FieldRef<"DesktopRecentItem", 'String'>
    readonly label: FieldRef<"DesktopRecentItem", 'String'>
    readonly value: FieldRef<"DesktopRecentItem", 'String'>
    readonly openedAt: FieldRef<"DesktopRecentItem", 'String'>
  }
    

  // Custom InputTypes
  /**
   * DesktopRecentItem findUnique
   */
  export type DesktopRecentItemFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopRecentItem
     */
    select?: DesktopRecentItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopRecentItem
     */
    omit?: DesktopRecentItemOmit<ExtArgs> | null
    /**
     * Filter, which DesktopRecentItem to fetch.
     */
    where: DesktopRecentItemWhereUniqueInput
  }

  /**
   * DesktopRecentItem findUniqueOrThrow
   */
  export type DesktopRecentItemFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopRecentItem
     */
    select?: DesktopRecentItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopRecentItem
     */
    omit?: DesktopRecentItemOmit<ExtArgs> | null
    /**
     * Filter, which DesktopRecentItem to fetch.
     */
    where: DesktopRecentItemWhereUniqueInput
  }

  /**
   * DesktopRecentItem findFirst
   */
  export type DesktopRecentItemFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopRecentItem
     */
    select?: DesktopRecentItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopRecentItem
     */
    omit?: DesktopRecentItemOmit<ExtArgs> | null
    /**
     * Filter, which DesktopRecentItem to fetch.
     */
    where?: DesktopRecentItemWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of DesktopRecentItems to fetch.
     */
    orderBy?: DesktopRecentItemOrderByWithRelationInput | DesktopRecentItemOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for DesktopRecentItems.
     */
    cursor?: DesktopRecentItemWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` DesktopRecentItems from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` DesktopRecentItems.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of DesktopRecentItems.
     */
    distinct?: DesktopRecentItemScalarFieldEnum | DesktopRecentItemScalarFieldEnum[]
  }

  /**
   * DesktopRecentItem findFirstOrThrow
   */
  export type DesktopRecentItemFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopRecentItem
     */
    select?: DesktopRecentItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopRecentItem
     */
    omit?: DesktopRecentItemOmit<ExtArgs> | null
    /**
     * Filter, which DesktopRecentItem to fetch.
     */
    where?: DesktopRecentItemWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of DesktopRecentItems to fetch.
     */
    orderBy?: DesktopRecentItemOrderByWithRelationInput | DesktopRecentItemOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for DesktopRecentItems.
     */
    cursor?: DesktopRecentItemWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` DesktopRecentItems from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` DesktopRecentItems.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of DesktopRecentItems.
     */
    distinct?: DesktopRecentItemScalarFieldEnum | DesktopRecentItemScalarFieldEnum[]
  }

  /**
   * DesktopRecentItem findMany
   */
  export type DesktopRecentItemFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopRecentItem
     */
    select?: DesktopRecentItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopRecentItem
     */
    omit?: DesktopRecentItemOmit<ExtArgs> | null
    /**
     * Filter, which DesktopRecentItems to fetch.
     */
    where?: DesktopRecentItemWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of DesktopRecentItems to fetch.
     */
    orderBy?: DesktopRecentItemOrderByWithRelationInput | DesktopRecentItemOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing DesktopRecentItems.
     */
    cursor?: DesktopRecentItemWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` DesktopRecentItems from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` DesktopRecentItems.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of DesktopRecentItems.
     */
    distinct?: DesktopRecentItemScalarFieldEnum | DesktopRecentItemScalarFieldEnum[]
  }

  /**
   * DesktopRecentItem create
   */
  export type DesktopRecentItemCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopRecentItem
     */
    select?: DesktopRecentItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopRecentItem
     */
    omit?: DesktopRecentItemOmit<ExtArgs> | null
    /**
     * The data needed to create a DesktopRecentItem.
     */
    data: XOR<DesktopRecentItemCreateInput, DesktopRecentItemUncheckedCreateInput>
  }

  /**
   * DesktopRecentItem createMany
   */
  export type DesktopRecentItemCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many DesktopRecentItems.
     */
    data: DesktopRecentItemCreateManyInput | DesktopRecentItemCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * DesktopRecentItem createManyAndReturn
   */
  export type DesktopRecentItemCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopRecentItem
     */
    select?: DesktopRecentItemSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopRecentItem
     */
    omit?: DesktopRecentItemOmit<ExtArgs> | null
    /**
     * The data used to create many DesktopRecentItems.
     */
    data: DesktopRecentItemCreateManyInput | DesktopRecentItemCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * DesktopRecentItem update
   */
  export type DesktopRecentItemUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopRecentItem
     */
    select?: DesktopRecentItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopRecentItem
     */
    omit?: DesktopRecentItemOmit<ExtArgs> | null
    /**
     * The data needed to update a DesktopRecentItem.
     */
    data: XOR<DesktopRecentItemUpdateInput, DesktopRecentItemUncheckedUpdateInput>
    /**
     * Choose, which DesktopRecentItem to update.
     */
    where: DesktopRecentItemWhereUniqueInput
  }

  /**
   * DesktopRecentItem updateMany
   */
  export type DesktopRecentItemUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update DesktopRecentItems.
     */
    data: XOR<DesktopRecentItemUpdateManyMutationInput, DesktopRecentItemUncheckedUpdateManyInput>
    /**
     * Filter which DesktopRecentItems to update
     */
    where?: DesktopRecentItemWhereInput
    /**
     * Limit how many DesktopRecentItems to update.
     */
    limit?: number
  }

  /**
   * DesktopRecentItem updateManyAndReturn
   */
  export type DesktopRecentItemUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopRecentItem
     */
    select?: DesktopRecentItemSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopRecentItem
     */
    omit?: DesktopRecentItemOmit<ExtArgs> | null
    /**
     * The data used to update DesktopRecentItems.
     */
    data: XOR<DesktopRecentItemUpdateManyMutationInput, DesktopRecentItemUncheckedUpdateManyInput>
    /**
     * Filter which DesktopRecentItems to update
     */
    where?: DesktopRecentItemWhereInput
    /**
     * Limit how many DesktopRecentItems to update.
     */
    limit?: number
  }

  /**
   * DesktopRecentItem upsert
   */
  export type DesktopRecentItemUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopRecentItem
     */
    select?: DesktopRecentItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopRecentItem
     */
    omit?: DesktopRecentItemOmit<ExtArgs> | null
    /**
     * The filter to search for the DesktopRecentItem to update in case it exists.
     */
    where: DesktopRecentItemWhereUniqueInput
    /**
     * In case the DesktopRecentItem found by the `where` argument doesn't exist, create a new DesktopRecentItem with this data.
     */
    create: XOR<DesktopRecentItemCreateInput, DesktopRecentItemUncheckedCreateInput>
    /**
     * In case the DesktopRecentItem was found with the provided `where` argument, update it with this data.
     */
    update: XOR<DesktopRecentItemUpdateInput, DesktopRecentItemUncheckedUpdateInput>
  }

  /**
   * DesktopRecentItem delete
   */
  export type DesktopRecentItemDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopRecentItem
     */
    select?: DesktopRecentItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopRecentItem
     */
    omit?: DesktopRecentItemOmit<ExtArgs> | null
    /**
     * Filter which DesktopRecentItem to delete.
     */
    where: DesktopRecentItemWhereUniqueInput
  }

  /**
   * DesktopRecentItem deleteMany
   */
  export type DesktopRecentItemDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which DesktopRecentItems to delete
     */
    where?: DesktopRecentItemWhereInput
    /**
     * Limit how many DesktopRecentItems to delete.
     */
    limit?: number
  }

  /**
   * DesktopRecentItem without action
   */
  export type DesktopRecentItemDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DesktopRecentItem
     */
    select?: DesktopRecentItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DesktopRecentItem
     */
    omit?: DesktopRecentItemOmit<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const UserScalarFieldEnum: {
    id: 'id',
    organizationId: 'organizationId',
    clerkId: 'clerkId',
    email: 'email',
    name: 'name',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type UserScalarFieldEnum = (typeof UserScalarFieldEnum)[keyof typeof UserScalarFieldEnum]


  export const OrganizationScalarFieldEnum: {
    id: 'id',
    name: 'name',
    slug: 'slug',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type OrganizationScalarFieldEnum = (typeof OrganizationScalarFieldEnum)[keyof typeof OrganizationScalarFieldEnum]


  export const PostScalarFieldEnum: {
    id: 'id',
    organizationId: 'organizationId',
    workspaceId: 'workspaceId',
    platform: 'platform',
    type: 'type',
    prompt: 'prompt',
    content: 'content',
    status: 'status',
    publishIntent: 'publishIntent',
    sourceDraftId: 'sourceDraftId',
    sourceTrendId: 'sourceTrendId',
    sourceTrendTopic: 'sourceTrendTopic',
    publishedAt: 'publishedAt',
    views: 'views',
    engagements: 'engagements',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type PostScalarFieldEnum = (typeof PostScalarFieldEnum)[keyof typeof PostScalarFieldEnum]


  export const IngredientScalarFieldEnum: {
    id: 'id',
    organizationId: 'organizationId',
    title: 'title',
    content: 'content',
    platform: 'platform',
    totalVotes: 'totalVotes',
    sourcePostId: 'sourcePostId',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type IngredientScalarFieldEnum = (typeof IngredientScalarFieldEnum)[keyof typeof IngredientScalarFieldEnum]


  export const TrendScalarFieldEnum: {
    id: 'id',
    organizationId: 'organizationId',
    platform: 'platform',
    topic: 'topic',
    summary: 'summary',
    viralityScore: 'viralityScore',
    engagementScore: 'engagementScore',
    createdAt: 'createdAt'
  };

  export type TrendScalarFieldEnum = (typeof TrendScalarFieldEnum)[keyof typeof TrendScalarFieldEnum]


  export const AgentStrategyScalarFieldEnum: {
    id: 'id',
    organizationId: 'organizationId',
    name: 'name',
    avatar: 'avatar',
    platformsJson: 'platformsJson',
    status: 'status',
    isActive: 'isActive',
    lastRunAt: 'lastRunAt',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type AgentStrategyScalarFieldEnum = (typeof AgentStrategyScalarFieldEnum)[keyof typeof AgentStrategyScalarFieldEnum]


  export const WorkflowScalarFieldEnum: {
    id: 'id',
    organizationId: 'organizationId',
    name: 'name',
    description: 'description',
    lifecycle: 'lifecycle',
    nodeCount: 'nodeCount',
    supportsBatch: 'supportsBatch',
    lastExecutedAt: 'lastExecutedAt',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type WorkflowScalarFieldEnum = (typeof WorkflowScalarFieldEnum)[keyof typeof WorkflowScalarFieldEnum]


  export const WorkflowExecutionScalarFieldEnum: {
    id: 'id',
    workflowId: 'workflowId',
    agentStrategyId: 'agentStrategyId',
    mode: 'mode',
    status: 'status',
    startedAt: 'startedAt',
    completedAt: 'completedAt'
  };

  export type WorkflowExecutionScalarFieldEnum = (typeof WorkflowExecutionScalarFieldEnum)[keyof typeof WorkflowExecutionScalarFieldEnum]


  export const DesktopKvScalarFieldEnum: {
    key: 'key',
    value: 'value'
  };

  export type DesktopKvScalarFieldEnum = (typeof DesktopKvScalarFieldEnum)[keyof typeof DesktopKvScalarFieldEnum]


  export const DesktopWorkspaceScalarFieldEnum: {
    id: 'id',
    name: 'name',
    path: 'path',
    linkedProjectId: 'linkedProjectId',
    fileIndex: 'fileIndex',
    indexingState: 'indexingState',
    localDraftCount: 'localDraftCount',
    pendingSyncCount: 'pendingSyncCount',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    lastOpenedAt: 'lastOpenedAt'
  };

  export type DesktopWorkspaceScalarFieldEnum = (typeof DesktopWorkspaceScalarFieldEnum)[keyof typeof DesktopWorkspaceScalarFieldEnum]


  export const DesktopSyncJobScalarFieldEnum: {
    id: 'id',
    workspaceId: 'workspaceId',
    type: 'type',
    payload: 'payload',
    status: 'status',
    error: 'error',
    retryCount: 'retryCount',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type DesktopSyncJobScalarFieldEnum = (typeof DesktopSyncJobScalarFieldEnum)[keyof typeof DesktopSyncJobScalarFieldEnum]


  export const DesktopRecentItemScalarFieldEnum: {
    id: 'id',
    kind: 'kind',
    label: 'label',
    value: 'value',
    openedAt: 'openedAt'
  };

  export type DesktopRecentItemScalarFieldEnum = (typeof DesktopRecentItemScalarFieldEnum)[keyof typeof DesktopRecentItemScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    


  /**
   * Reference to a field of type 'Float[]'
   */
  export type ListFloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float[]'>
    
  /**
   * Deep Input Types
   */


  export type UserWhereInput = {
    AND?: UserWhereInput | UserWhereInput[]
    OR?: UserWhereInput[]
    NOT?: UserWhereInput | UserWhereInput[]
    id?: StringFilter<"User"> | string
    organizationId?: StringFilter<"User"> | string
    clerkId?: StringNullableFilter<"User"> | string | null
    email?: StringNullableFilter<"User"> | string | null
    name?: StringFilter<"User"> | string
    createdAt?: StringFilter<"User"> | string
    updatedAt?: StringFilter<"User"> | string
    organization?: XOR<OrganizationScalarRelationFilter, OrganizationWhereInput>
  }

  export type UserOrderByWithRelationInput = {
    id?: SortOrder
    organizationId?: SortOrder
    clerkId?: SortOrderInput | SortOrder
    email?: SortOrderInput | SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    organization?: OrganizationOrderByWithRelationInput
  }

  export type UserWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    clerkId?: string
    AND?: UserWhereInput | UserWhereInput[]
    OR?: UserWhereInput[]
    NOT?: UserWhereInput | UserWhereInput[]
    organizationId?: StringFilter<"User"> | string
    email?: StringNullableFilter<"User"> | string | null
    name?: StringFilter<"User"> | string
    createdAt?: StringFilter<"User"> | string
    updatedAt?: StringFilter<"User"> | string
    organization?: XOR<OrganizationScalarRelationFilter, OrganizationWhereInput>
  }, "id" | "clerkId">

  export type UserOrderByWithAggregationInput = {
    id?: SortOrder
    organizationId?: SortOrder
    clerkId?: SortOrderInput | SortOrder
    email?: SortOrderInput | SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: UserCountOrderByAggregateInput
    _max?: UserMaxOrderByAggregateInput
    _min?: UserMinOrderByAggregateInput
  }

  export type UserScalarWhereWithAggregatesInput = {
    AND?: UserScalarWhereWithAggregatesInput | UserScalarWhereWithAggregatesInput[]
    OR?: UserScalarWhereWithAggregatesInput[]
    NOT?: UserScalarWhereWithAggregatesInput | UserScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"User"> | string
    organizationId?: StringWithAggregatesFilter<"User"> | string
    clerkId?: StringNullableWithAggregatesFilter<"User"> | string | null
    email?: StringNullableWithAggregatesFilter<"User"> | string | null
    name?: StringWithAggregatesFilter<"User"> | string
    createdAt?: StringWithAggregatesFilter<"User"> | string
    updatedAt?: StringWithAggregatesFilter<"User"> | string
  }

  export type OrganizationWhereInput = {
    AND?: OrganizationWhereInput | OrganizationWhereInput[]
    OR?: OrganizationWhereInput[]
    NOT?: OrganizationWhereInput | OrganizationWhereInput[]
    id?: StringFilter<"Organization"> | string
    name?: StringFilter<"Organization"> | string
    slug?: StringFilter<"Organization"> | string
    createdAt?: StringFilter<"Organization"> | string
    updatedAt?: StringFilter<"Organization"> | string
    users?: UserListRelationFilter
    posts?: PostListRelationFilter
    trends?: TrendListRelationFilter
    ingredients?: IngredientListRelationFilter
    agentStrategies?: AgentStrategyListRelationFilter
    workflows?: WorkflowListRelationFilter
  }

  export type OrganizationOrderByWithRelationInput = {
    id?: SortOrder
    name?: SortOrder
    slug?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    users?: UserOrderByRelationAggregateInput
    posts?: PostOrderByRelationAggregateInput
    trends?: TrendOrderByRelationAggregateInput
    ingredients?: IngredientOrderByRelationAggregateInput
    agentStrategies?: AgentStrategyOrderByRelationAggregateInput
    workflows?: WorkflowOrderByRelationAggregateInput
  }

  export type OrganizationWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    slug?: string
    AND?: OrganizationWhereInput | OrganizationWhereInput[]
    OR?: OrganizationWhereInput[]
    NOT?: OrganizationWhereInput | OrganizationWhereInput[]
    name?: StringFilter<"Organization"> | string
    createdAt?: StringFilter<"Organization"> | string
    updatedAt?: StringFilter<"Organization"> | string
    users?: UserListRelationFilter
    posts?: PostListRelationFilter
    trends?: TrendListRelationFilter
    ingredients?: IngredientListRelationFilter
    agentStrategies?: AgentStrategyListRelationFilter
    workflows?: WorkflowListRelationFilter
  }, "id" | "slug">

  export type OrganizationOrderByWithAggregationInput = {
    id?: SortOrder
    name?: SortOrder
    slug?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: OrganizationCountOrderByAggregateInput
    _max?: OrganizationMaxOrderByAggregateInput
    _min?: OrganizationMinOrderByAggregateInput
  }

  export type OrganizationScalarWhereWithAggregatesInput = {
    AND?: OrganizationScalarWhereWithAggregatesInput | OrganizationScalarWhereWithAggregatesInput[]
    OR?: OrganizationScalarWhereWithAggregatesInput[]
    NOT?: OrganizationScalarWhereWithAggregatesInput | OrganizationScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Organization"> | string
    name?: StringWithAggregatesFilter<"Organization"> | string
    slug?: StringWithAggregatesFilter<"Organization"> | string
    createdAt?: StringWithAggregatesFilter<"Organization"> | string
    updatedAt?: StringWithAggregatesFilter<"Organization"> | string
  }

  export type PostWhereInput = {
    AND?: PostWhereInput | PostWhereInput[]
    OR?: PostWhereInput[]
    NOT?: PostWhereInput | PostWhereInput[]
    id?: StringFilter<"Post"> | string
    organizationId?: StringFilter<"Post"> | string
    workspaceId?: StringNullableFilter<"Post"> | string | null
    platform?: StringFilter<"Post"> | string
    type?: StringFilter<"Post"> | string
    prompt?: StringFilter<"Post"> | string
    content?: StringFilter<"Post"> | string
    status?: StringFilter<"Post"> | string
    publishIntent?: StringNullableFilter<"Post"> | string | null
    sourceDraftId?: StringNullableFilter<"Post"> | string | null
    sourceTrendId?: StringNullableFilter<"Post"> | string | null
    sourceTrendTopic?: StringNullableFilter<"Post"> | string | null
    publishedAt?: StringNullableFilter<"Post"> | string | null
    views?: IntFilter<"Post"> | number
    engagements?: IntFilter<"Post"> | number
    createdAt?: StringFilter<"Post"> | string
    updatedAt?: StringFilter<"Post"> | string
    organization?: XOR<OrganizationScalarRelationFilter, OrganizationWhereInput>
  }

  export type PostOrderByWithRelationInput = {
    id?: SortOrder
    organizationId?: SortOrder
    workspaceId?: SortOrderInput | SortOrder
    platform?: SortOrder
    type?: SortOrder
    prompt?: SortOrder
    content?: SortOrder
    status?: SortOrder
    publishIntent?: SortOrderInput | SortOrder
    sourceDraftId?: SortOrderInput | SortOrder
    sourceTrendId?: SortOrderInput | SortOrder
    sourceTrendTopic?: SortOrderInput | SortOrder
    publishedAt?: SortOrderInput | SortOrder
    views?: SortOrder
    engagements?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    organization?: OrganizationOrderByWithRelationInput
  }

  export type PostWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    sourceDraftId?: string
    AND?: PostWhereInput | PostWhereInput[]
    OR?: PostWhereInput[]
    NOT?: PostWhereInput | PostWhereInput[]
    organizationId?: StringFilter<"Post"> | string
    workspaceId?: StringNullableFilter<"Post"> | string | null
    platform?: StringFilter<"Post"> | string
    type?: StringFilter<"Post"> | string
    prompt?: StringFilter<"Post"> | string
    content?: StringFilter<"Post"> | string
    status?: StringFilter<"Post"> | string
    publishIntent?: StringNullableFilter<"Post"> | string | null
    sourceTrendId?: StringNullableFilter<"Post"> | string | null
    sourceTrendTopic?: StringNullableFilter<"Post"> | string | null
    publishedAt?: StringNullableFilter<"Post"> | string | null
    views?: IntFilter<"Post"> | number
    engagements?: IntFilter<"Post"> | number
    createdAt?: StringFilter<"Post"> | string
    updatedAt?: StringFilter<"Post"> | string
    organization?: XOR<OrganizationScalarRelationFilter, OrganizationWhereInput>
  }, "id" | "sourceDraftId">

  export type PostOrderByWithAggregationInput = {
    id?: SortOrder
    organizationId?: SortOrder
    workspaceId?: SortOrderInput | SortOrder
    platform?: SortOrder
    type?: SortOrder
    prompt?: SortOrder
    content?: SortOrder
    status?: SortOrder
    publishIntent?: SortOrderInput | SortOrder
    sourceDraftId?: SortOrderInput | SortOrder
    sourceTrendId?: SortOrderInput | SortOrder
    sourceTrendTopic?: SortOrderInput | SortOrder
    publishedAt?: SortOrderInput | SortOrder
    views?: SortOrder
    engagements?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: PostCountOrderByAggregateInput
    _avg?: PostAvgOrderByAggregateInput
    _max?: PostMaxOrderByAggregateInput
    _min?: PostMinOrderByAggregateInput
    _sum?: PostSumOrderByAggregateInput
  }

  export type PostScalarWhereWithAggregatesInput = {
    AND?: PostScalarWhereWithAggregatesInput | PostScalarWhereWithAggregatesInput[]
    OR?: PostScalarWhereWithAggregatesInput[]
    NOT?: PostScalarWhereWithAggregatesInput | PostScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Post"> | string
    organizationId?: StringWithAggregatesFilter<"Post"> | string
    workspaceId?: StringNullableWithAggregatesFilter<"Post"> | string | null
    platform?: StringWithAggregatesFilter<"Post"> | string
    type?: StringWithAggregatesFilter<"Post"> | string
    prompt?: StringWithAggregatesFilter<"Post"> | string
    content?: StringWithAggregatesFilter<"Post"> | string
    status?: StringWithAggregatesFilter<"Post"> | string
    publishIntent?: StringNullableWithAggregatesFilter<"Post"> | string | null
    sourceDraftId?: StringNullableWithAggregatesFilter<"Post"> | string | null
    sourceTrendId?: StringNullableWithAggregatesFilter<"Post"> | string | null
    sourceTrendTopic?: StringNullableWithAggregatesFilter<"Post"> | string | null
    publishedAt?: StringNullableWithAggregatesFilter<"Post"> | string | null
    views?: IntWithAggregatesFilter<"Post"> | number
    engagements?: IntWithAggregatesFilter<"Post"> | number
    createdAt?: StringWithAggregatesFilter<"Post"> | string
    updatedAt?: StringWithAggregatesFilter<"Post"> | string
  }

  export type IngredientWhereInput = {
    AND?: IngredientWhereInput | IngredientWhereInput[]
    OR?: IngredientWhereInput[]
    NOT?: IngredientWhereInput | IngredientWhereInput[]
    id?: StringFilter<"Ingredient"> | string
    organizationId?: StringFilter<"Ingredient"> | string
    title?: StringFilter<"Ingredient"> | string
    content?: StringFilter<"Ingredient"> | string
    platform?: StringNullableFilter<"Ingredient"> | string | null
    totalVotes?: IntFilter<"Ingredient"> | number
    sourcePostId?: StringNullableFilter<"Ingredient"> | string | null
    createdAt?: StringFilter<"Ingredient"> | string
    updatedAt?: StringFilter<"Ingredient"> | string
    organization?: XOR<OrganizationScalarRelationFilter, OrganizationWhereInput>
  }

  export type IngredientOrderByWithRelationInput = {
    id?: SortOrder
    organizationId?: SortOrder
    title?: SortOrder
    content?: SortOrder
    platform?: SortOrderInput | SortOrder
    totalVotes?: SortOrder
    sourcePostId?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    organization?: OrganizationOrderByWithRelationInput
  }

  export type IngredientWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: IngredientWhereInput | IngredientWhereInput[]
    OR?: IngredientWhereInput[]
    NOT?: IngredientWhereInput | IngredientWhereInput[]
    organizationId?: StringFilter<"Ingredient"> | string
    title?: StringFilter<"Ingredient"> | string
    content?: StringFilter<"Ingredient"> | string
    platform?: StringNullableFilter<"Ingredient"> | string | null
    totalVotes?: IntFilter<"Ingredient"> | number
    sourcePostId?: StringNullableFilter<"Ingredient"> | string | null
    createdAt?: StringFilter<"Ingredient"> | string
    updatedAt?: StringFilter<"Ingredient"> | string
    organization?: XOR<OrganizationScalarRelationFilter, OrganizationWhereInput>
  }, "id">

  export type IngredientOrderByWithAggregationInput = {
    id?: SortOrder
    organizationId?: SortOrder
    title?: SortOrder
    content?: SortOrder
    platform?: SortOrderInput | SortOrder
    totalVotes?: SortOrder
    sourcePostId?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: IngredientCountOrderByAggregateInput
    _avg?: IngredientAvgOrderByAggregateInput
    _max?: IngredientMaxOrderByAggregateInput
    _min?: IngredientMinOrderByAggregateInput
    _sum?: IngredientSumOrderByAggregateInput
  }

  export type IngredientScalarWhereWithAggregatesInput = {
    AND?: IngredientScalarWhereWithAggregatesInput | IngredientScalarWhereWithAggregatesInput[]
    OR?: IngredientScalarWhereWithAggregatesInput[]
    NOT?: IngredientScalarWhereWithAggregatesInput | IngredientScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Ingredient"> | string
    organizationId?: StringWithAggregatesFilter<"Ingredient"> | string
    title?: StringWithAggregatesFilter<"Ingredient"> | string
    content?: StringWithAggregatesFilter<"Ingredient"> | string
    platform?: StringNullableWithAggregatesFilter<"Ingredient"> | string | null
    totalVotes?: IntWithAggregatesFilter<"Ingredient"> | number
    sourcePostId?: StringNullableWithAggregatesFilter<"Ingredient"> | string | null
    createdAt?: StringWithAggregatesFilter<"Ingredient"> | string
    updatedAt?: StringWithAggregatesFilter<"Ingredient"> | string
  }

  export type TrendWhereInput = {
    AND?: TrendWhereInput | TrendWhereInput[]
    OR?: TrendWhereInput[]
    NOT?: TrendWhereInput | TrendWhereInput[]
    id?: StringFilter<"Trend"> | string
    organizationId?: StringFilter<"Trend"> | string
    platform?: StringFilter<"Trend"> | string
    topic?: StringFilter<"Trend"> | string
    summary?: StringNullableFilter<"Trend"> | string | null
    viralityScore?: IntFilter<"Trend"> | number
    engagementScore?: IntFilter<"Trend"> | number
    createdAt?: StringFilter<"Trend"> | string
    organization?: XOR<OrganizationScalarRelationFilter, OrganizationWhereInput>
  }

  export type TrendOrderByWithRelationInput = {
    id?: SortOrder
    organizationId?: SortOrder
    platform?: SortOrder
    topic?: SortOrder
    summary?: SortOrderInput | SortOrder
    viralityScore?: SortOrder
    engagementScore?: SortOrder
    createdAt?: SortOrder
    organization?: OrganizationOrderByWithRelationInput
  }

  export type TrendWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: TrendWhereInput | TrendWhereInput[]
    OR?: TrendWhereInput[]
    NOT?: TrendWhereInput | TrendWhereInput[]
    organizationId?: StringFilter<"Trend"> | string
    platform?: StringFilter<"Trend"> | string
    topic?: StringFilter<"Trend"> | string
    summary?: StringNullableFilter<"Trend"> | string | null
    viralityScore?: IntFilter<"Trend"> | number
    engagementScore?: IntFilter<"Trend"> | number
    createdAt?: StringFilter<"Trend"> | string
    organization?: XOR<OrganizationScalarRelationFilter, OrganizationWhereInput>
  }, "id">

  export type TrendOrderByWithAggregationInput = {
    id?: SortOrder
    organizationId?: SortOrder
    platform?: SortOrder
    topic?: SortOrder
    summary?: SortOrderInput | SortOrder
    viralityScore?: SortOrder
    engagementScore?: SortOrder
    createdAt?: SortOrder
    _count?: TrendCountOrderByAggregateInput
    _avg?: TrendAvgOrderByAggregateInput
    _max?: TrendMaxOrderByAggregateInput
    _min?: TrendMinOrderByAggregateInput
    _sum?: TrendSumOrderByAggregateInput
  }

  export type TrendScalarWhereWithAggregatesInput = {
    AND?: TrendScalarWhereWithAggregatesInput | TrendScalarWhereWithAggregatesInput[]
    OR?: TrendScalarWhereWithAggregatesInput[]
    NOT?: TrendScalarWhereWithAggregatesInput | TrendScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Trend"> | string
    organizationId?: StringWithAggregatesFilter<"Trend"> | string
    platform?: StringWithAggregatesFilter<"Trend"> | string
    topic?: StringWithAggregatesFilter<"Trend"> | string
    summary?: StringNullableWithAggregatesFilter<"Trend"> | string | null
    viralityScore?: IntWithAggregatesFilter<"Trend"> | number
    engagementScore?: IntWithAggregatesFilter<"Trend"> | number
    createdAt?: StringWithAggregatesFilter<"Trend"> | string
  }

  export type AgentStrategyWhereInput = {
    AND?: AgentStrategyWhereInput | AgentStrategyWhereInput[]
    OR?: AgentStrategyWhereInput[]
    NOT?: AgentStrategyWhereInput | AgentStrategyWhereInput[]
    id?: StringFilter<"AgentStrategy"> | string
    organizationId?: StringFilter<"AgentStrategy"> | string
    name?: StringFilter<"AgentStrategy"> | string
    avatar?: StringNullableFilter<"AgentStrategy"> | string | null
    platformsJson?: StringFilter<"AgentStrategy"> | string
    status?: StringFilter<"AgentStrategy"> | string
    isActive?: BoolFilter<"AgentStrategy"> | boolean
    lastRunAt?: StringNullableFilter<"AgentStrategy"> | string | null
    createdAt?: StringFilter<"AgentStrategy"> | string
    updatedAt?: StringFilter<"AgentStrategy"> | string
    organization?: XOR<OrganizationScalarRelationFilter, OrganizationWhereInput>
    workflows?: WorkflowExecutionListRelationFilter
  }

  export type AgentStrategyOrderByWithRelationInput = {
    id?: SortOrder
    organizationId?: SortOrder
    name?: SortOrder
    avatar?: SortOrderInput | SortOrder
    platformsJson?: SortOrder
    status?: SortOrder
    isActive?: SortOrder
    lastRunAt?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    organization?: OrganizationOrderByWithRelationInput
    workflows?: WorkflowExecutionOrderByRelationAggregateInput
  }

  export type AgentStrategyWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: AgentStrategyWhereInput | AgentStrategyWhereInput[]
    OR?: AgentStrategyWhereInput[]
    NOT?: AgentStrategyWhereInput | AgentStrategyWhereInput[]
    organizationId?: StringFilter<"AgentStrategy"> | string
    name?: StringFilter<"AgentStrategy"> | string
    avatar?: StringNullableFilter<"AgentStrategy"> | string | null
    platformsJson?: StringFilter<"AgentStrategy"> | string
    status?: StringFilter<"AgentStrategy"> | string
    isActive?: BoolFilter<"AgentStrategy"> | boolean
    lastRunAt?: StringNullableFilter<"AgentStrategy"> | string | null
    createdAt?: StringFilter<"AgentStrategy"> | string
    updatedAt?: StringFilter<"AgentStrategy"> | string
    organization?: XOR<OrganizationScalarRelationFilter, OrganizationWhereInput>
    workflows?: WorkflowExecutionListRelationFilter
  }, "id">

  export type AgentStrategyOrderByWithAggregationInput = {
    id?: SortOrder
    organizationId?: SortOrder
    name?: SortOrder
    avatar?: SortOrderInput | SortOrder
    platformsJson?: SortOrder
    status?: SortOrder
    isActive?: SortOrder
    lastRunAt?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: AgentStrategyCountOrderByAggregateInput
    _max?: AgentStrategyMaxOrderByAggregateInput
    _min?: AgentStrategyMinOrderByAggregateInput
  }

  export type AgentStrategyScalarWhereWithAggregatesInput = {
    AND?: AgentStrategyScalarWhereWithAggregatesInput | AgentStrategyScalarWhereWithAggregatesInput[]
    OR?: AgentStrategyScalarWhereWithAggregatesInput[]
    NOT?: AgentStrategyScalarWhereWithAggregatesInput | AgentStrategyScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"AgentStrategy"> | string
    organizationId?: StringWithAggregatesFilter<"AgentStrategy"> | string
    name?: StringWithAggregatesFilter<"AgentStrategy"> | string
    avatar?: StringNullableWithAggregatesFilter<"AgentStrategy"> | string | null
    platformsJson?: StringWithAggregatesFilter<"AgentStrategy"> | string
    status?: StringWithAggregatesFilter<"AgentStrategy"> | string
    isActive?: BoolWithAggregatesFilter<"AgentStrategy"> | boolean
    lastRunAt?: StringNullableWithAggregatesFilter<"AgentStrategy"> | string | null
    createdAt?: StringWithAggregatesFilter<"AgentStrategy"> | string
    updatedAt?: StringWithAggregatesFilter<"AgentStrategy"> | string
  }

  export type WorkflowWhereInput = {
    AND?: WorkflowWhereInput | WorkflowWhereInput[]
    OR?: WorkflowWhereInput[]
    NOT?: WorkflowWhereInput | WorkflowWhereInput[]
    id?: StringFilter<"Workflow"> | string
    organizationId?: StringFilter<"Workflow"> | string
    name?: StringFilter<"Workflow"> | string
    description?: StringNullableFilter<"Workflow"> | string | null
    lifecycle?: StringFilter<"Workflow"> | string
    nodeCount?: IntFilter<"Workflow"> | number
    supportsBatch?: BoolFilter<"Workflow"> | boolean
    lastExecutedAt?: StringNullableFilter<"Workflow"> | string | null
    createdAt?: StringFilter<"Workflow"> | string
    updatedAt?: StringFilter<"Workflow"> | string
    organization?: XOR<OrganizationScalarRelationFilter, OrganizationWhereInput>
    executions?: WorkflowExecutionListRelationFilter
  }

  export type WorkflowOrderByWithRelationInput = {
    id?: SortOrder
    organizationId?: SortOrder
    name?: SortOrder
    description?: SortOrderInput | SortOrder
    lifecycle?: SortOrder
    nodeCount?: SortOrder
    supportsBatch?: SortOrder
    lastExecutedAt?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    organization?: OrganizationOrderByWithRelationInput
    executions?: WorkflowExecutionOrderByRelationAggregateInput
  }

  export type WorkflowWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: WorkflowWhereInput | WorkflowWhereInput[]
    OR?: WorkflowWhereInput[]
    NOT?: WorkflowWhereInput | WorkflowWhereInput[]
    organizationId?: StringFilter<"Workflow"> | string
    name?: StringFilter<"Workflow"> | string
    description?: StringNullableFilter<"Workflow"> | string | null
    lifecycle?: StringFilter<"Workflow"> | string
    nodeCount?: IntFilter<"Workflow"> | number
    supportsBatch?: BoolFilter<"Workflow"> | boolean
    lastExecutedAt?: StringNullableFilter<"Workflow"> | string | null
    createdAt?: StringFilter<"Workflow"> | string
    updatedAt?: StringFilter<"Workflow"> | string
    organization?: XOR<OrganizationScalarRelationFilter, OrganizationWhereInput>
    executions?: WorkflowExecutionListRelationFilter
  }, "id">

  export type WorkflowOrderByWithAggregationInput = {
    id?: SortOrder
    organizationId?: SortOrder
    name?: SortOrder
    description?: SortOrderInput | SortOrder
    lifecycle?: SortOrder
    nodeCount?: SortOrder
    supportsBatch?: SortOrder
    lastExecutedAt?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: WorkflowCountOrderByAggregateInput
    _avg?: WorkflowAvgOrderByAggregateInput
    _max?: WorkflowMaxOrderByAggregateInput
    _min?: WorkflowMinOrderByAggregateInput
    _sum?: WorkflowSumOrderByAggregateInput
  }

  export type WorkflowScalarWhereWithAggregatesInput = {
    AND?: WorkflowScalarWhereWithAggregatesInput | WorkflowScalarWhereWithAggregatesInput[]
    OR?: WorkflowScalarWhereWithAggregatesInput[]
    NOT?: WorkflowScalarWhereWithAggregatesInput | WorkflowScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Workflow"> | string
    organizationId?: StringWithAggregatesFilter<"Workflow"> | string
    name?: StringWithAggregatesFilter<"Workflow"> | string
    description?: StringNullableWithAggregatesFilter<"Workflow"> | string | null
    lifecycle?: StringWithAggregatesFilter<"Workflow"> | string
    nodeCount?: IntWithAggregatesFilter<"Workflow"> | number
    supportsBatch?: BoolWithAggregatesFilter<"Workflow"> | boolean
    lastExecutedAt?: StringNullableWithAggregatesFilter<"Workflow"> | string | null
    createdAt?: StringWithAggregatesFilter<"Workflow"> | string
    updatedAt?: StringWithAggregatesFilter<"Workflow"> | string
  }

  export type WorkflowExecutionWhereInput = {
    AND?: WorkflowExecutionWhereInput | WorkflowExecutionWhereInput[]
    OR?: WorkflowExecutionWhereInput[]
    NOT?: WorkflowExecutionWhereInput | WorkflowExecutionWhereInput[]
    id?: StringFilter<"WorkflowExecution"> | string
    workflowId?: StringFilter<"WorkflowExecution"> | string
    agentStrategyId?: StringNullableFilter<"WorkflowExecution"> | string | null
    mode?: StringFilter<"WorkflowExecution"> | string
    status?: StringFilter<"WorkflowExecution"> | string
    startedAt?: StringFilter<"WorkflowExecution"> | string
    completedAt?: StringNullableFilter<"WorkflowExecution"> | string | null
    workflow?: XOR<WorkflowScalarRelationFilter, WorkflowWhereInput>
    agentStrategy?: XOR<AgentStrategyNullableScalarRelationFilter, AgentStrategyWhereInput> | null
  }

  export type WorkflowExecutionOrderByWithRelationInput = {
    id?: SortOrder
    workflowId?: SortOrder
    agentStrategyId?: SortOrderInput | SortOrder
    mode?: SortOrder
    status?: SortOrder
    startedAt?: SortOrder
    completedAt?: SortOrderInput | SortOrder
    workflow?: WorkflowOrderByWithRelationInput
    agentStrategy?: AgentStrategyOrderByWithRelationInput
  }

  export type WorkflowExecutionWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: WorkflowExecutionWhereInput | WorkflowExecutionWhereInput[]
    OR?: WorkflowExecutionWhereInput[]
    NOT?: WorkflowExecutionWhereInput | WorkflowExecutionWhereInput[]
    workflowId?: StringFilter<"WorkflowExecution"> | string
    agentStrategyId?: StringNullableFilter<"WorkflowExecution"> | string | null
    mode?: StringFilter<"WorkflowExecution"> | string
    status?: StringFilter<"WorkflowExecution"> | string
    startedAt?: StringFilter<"WorkflowExecution"> | string
    completedAt?: StringNullableFilter<"WorkflowExecution"> | string | null
    workflow?: XOR<WorkflowScalarRelationFilter, WorkflowWhereInput>
    agentStrategy?: XOR<AgentStrategyNullableScalarRelationFilter, AgentStrategyWhereInput> | null
  }, "id">

  export type WorkflowExecutionOrderByWithAggregationInput = {
    id?: SortOrder
    workflowId?: SortOrder
    agentStrategyId?: SortOrderInput | SortOrder
    mode?: SortOrder
    status?: SortOrder
    startedAt?: SortOrder
    completedAt?: SortOrderInput | SortOrder
    _count?: WorkflowExecutionCountOrderByAggregateInput
    _max?: WorkflowExecutionMaxOrderByAggregateInput
    _min?: WorkflowExecutionMinOrderByAggregateInput
  }

  export type WorkflowExecutionScalarWhereWithAggregatesInput = {
    AND?: WorkflowExecutionScalarWhereWithAggregatesInput | WorkflowExecutionScalarWhereWithAggregatesInput[]
    OR?: WorkflowExecutionScalarWhereWithAggregatesInput[]
    NOT?: WorkflowExecutionScalarWhereWithAggregatesInput | WorkflowExecutionScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"WorkflowExecution"> | string
    workflowId?: StringWithAggregatesFilter<"WorkflowExecution"> | string
    agentStrategyId?: StringNullableWithAggregatesFilter<"WorkflowExecution"> | string | null
    mode?: StringWithAggregatesFilter<"WorkflowExecution"> | string
    status?: StringWithAggregatesFilter<"WorkflowExecution"> | string
    startedAt?: StringWithAggregatesFilter<"WorkflowExecution"> | string
    completedAt?: StringNullableWithAggregatesFilter<"WorkflowExecution"> | string | null
  }

  export type DesktopKvWhereInput = {
    AND?: DesktopKvWhereInput | DesktopKvWhereInput[]
    OR?: DesktopKvWhereInput[]
    NOT?: DesktopKvWhereInput | DesktopKvWhereInput[]
    key?: StringFilter<"DesktopKv"> | string
    value?: StringFilter<"DesktopKv"> | string
  }

  export type DesktopKvOrderByWithRelationInput = {
    key?: SortOrder
    value?: SortOrder
  }

  export type DesktopKvWhereUniqueInput = Prisma.AtLeast<{
    key?: string
    AND?: DesktopKvWhereInput | DesktopKvWhereInput[]
    OR?: DesktopKvWhereInput[]
    NOT?: DesktopKvWhereInput | DesktopKvWhereInput[]
    value?: StringFilter<"DesktopKv"> | string
  }, "key">

  export type DesktopKvOrderByWithAggregationInput = {
    key?: SortOrder
    value?: SortOrder
    _count?: DesktopKvCountOrderByAggregateInput
    _max?: DesktopKvMaxOrderByAggregateInput
    _min?: DesktopKvMinOrderByAggregateInput
  }

  export type DesktopKvScalarWhereWithAggregatesInput = {
    AND?: DesktopKvScalarWhereWithAggregatesInput | DesktopKvScalarWhereWithAggregatesInput[]
    OR?: DesktopKvScalarWhereWithAggregatesInput[]
    NOT?: DesktopKvScalarWhereWithAggregatesInput | DesktopKvScalarWhereWithAggregatesInput[]
    key?: StringWithAggregatesFilter<"DesktopKv"> | string
    value?: StringWithAggregatesFilter<"DesktopKv"> | string
  }

  export type DesktopWorkspaceWhereInput = {
    AND?: DesktopWorkspaceWhereInput | DesktopWorkspaceWhereInput[]
    OR?: DesktopWorkspaceWhereInput[]
    NOT?: DesktopWorkspaceWhereInput | DesktopWorkspaceWhereInput[]
    id?: StringFilter<"DesktopWorkspace"> | string
    name?: StringFilter<"DesktopWorkspace"> | string
    path?: StringFilter<"DesktopWorkspace"> | string
    linkedProjectId?: StringNullableFilter<"DesktopWorkspace"> | string | null
    fileIndex?: StringFilter<"DesktopWorkspace"> | string
    indexingState?: StringFilter<"DesktopWorkspace"> | string
    localDraftCount?: IntFilter<"DesktopWorkspace"> | number
    pendingSyncCount?: IntFilter<"DesktopWorkspace"> | number
    createdAt?: StringFilter<"DesktopWorkspace"> | string
    updatedAt?: StringFilter<"DesktopWorkspace"> | string
    lastOpenedAt?: StringFilter<"DesktopWorkspace"> | string
  }

  export type DesktopWorkspaceOrderByWithRelationInput = {
    id?: SortOrder
    name?: SortOrder
    path?: SortOrder
    linkedProjectId?: SortOrderInput | SortOrder
    fileIndex?: SortOrder
    indexingState?: SortOrder
    localDraftCount?: SortOrder
    pendingSyncCount?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    lastOpenedAt?: SortOrder
  }

  export type DesktopWorkspaceWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    path?: string
    AND?: DesktopWorkspaceWhereInput | DesktopWorkspaceWhereInput[]
    OR?: DesktopWorkspaceWhereInput[]
    NOT?: DesktopWorkspaceWhereInput | DesktopWorkspaceWhereInput[]
    name?: StringFilter<"DesktopWorkspace"> | string
    linkedProjectId?: StringNullableFilter<"DesktopWorkspace"> | string | null
    fileIndex?: StringFilter<"DesktopWorkspace"> | string
    indexingState?: StringFilter<"DesktopWorkspace"> | string
    localDraftCount?: IntFilter<"DesktopWorkspace"> | number
    pendingSyncCount?: IntFilter<"DesktopWorkspace"> | number
    createdAt?: StringFilter<"DesktopWorkspace"> | string
    updatedAt?: StringFilter<"DesktopWorkspace"> | string
    lastOpenedAt?: StringFilter<"DesktopWorkspace"> | string
  }, "id" | "path">

  export type DesktopWorkspaceOrderByWithAggregationInput = {
    id?: SortOrder
    name?: SortOrder
    path?: SortOrder
    linkedProjectId?: SortOrderInput | SortOrder
    fileIndex?: SortOrder
    indexingState?: SortOrder
    localDraftCount?: SortOrder
    pendingSyncCount?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    lastOpenedAt?: SortOrder
    _count?: DesktopWorkspaceCountOrderByAggregateInput
    _avg?: DesktopWorkspaceAvgOrderByAggregateInput
    _max?: DesktopWorkspaceMaxOrderByAggregateInput
    _min?: DesktopWorkspaceMinOrderByAggregateInput
    _sum?: DesktopWorkspaceSumOrderByAggregateInput
  }

  export type DesktopWorkspaceScalarWhereWithAggregatesInput = {
    AND?: DesktopWorkspaceScalarWhereWithAggregatesInput | DesktopWorkspaceScalarWhereWithAggregatesInput[]
    OR?: DesktopWorkspaceScalarWhereWithAggregatesInput[]
    NOT?: DesktopWorkspaceScalarWhereWithAggregatesInput | DesktopWorkspaceScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"DesktopWorkspace"> | string
    name?: StringWithAggregatesFilter<"DesktopWorkspace"> | string
    path?: StringWithAggregatesFilter<"DesktopWorkspace"> | string
    linkedProjectId?: StringNullableWithAggregatesFilter<"DesktopWorkspace"> | string | null
    fileIndex?: StringWithAggregatesFilter<"DesktopWorkspace"> | string
    indexingState?: StringWithAggregatesFilter<"DesktopWorkspace"> | string
    localDraftCount?: IntWithAggregatesFilter<"DesktopWorkspace"> | number
    pendingSyncCount?: IntWithAggregatesFilter<"DesktopWorkspace"> | number
    createdAt?: StringWithAggregatesFilter<"DesktopWorkspace"> | string
    updatedAt?: StringWithAggregatesFilter<"DesktopWorkspace"> | string
    lastOpenedAt?: StringWithAggregatesFilter<"DesktopWorkspace"> | string
  }

  export type DesktopSyncJobWhereInput = {
    AND?: DesktopSyncJobWhereInput | DesktopSyncJobWhereInput[]
    OR?: DesktopSyncJobWhereInput[]
    NOT?: DesktopSyncJobWhereInput | DesktopSyncJobWhereInput[]
    id?: StringFilter<"DesktopSyncJob"> | string
    workspaceId?: StringNullableFilter<"DesktopSyncJob"> | string | null
    type?: StringFilter<"DesktopSyncJob"> | string
    payload?: StringFilter<"DesktopSyncJob"> | string
    status?: StringFilter<"DesktopSyncJob"> | string
    error?: StringNullableFilter<"DesktopSyncJob"> | string | null
    retryCount?: IntFilter<"DesktopSyncJob"> | number
    createdAt?: StringFilter<"DesktopSyncJob"> | string
    updatedAt?: StringFilter<"DesktopSyncJob"> | string
  }

  export type DesktopSyncJobOrderByWithRelationInput = {
    id?: SortOrder
    workspaceId?: SortOrderInput | SortOrder
    type?: SortOrder
    payload?: SortOrder
    status?: SortOrder
    error?: SortOrderInput | SortOrder
    retryCount?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type DesktopSyncJobWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: DesktopSyncJobWhereInput | DesktopSyncJobWhereInput[]
    OR?: DesktopSyncJobWhereInput[]
    NOT?: DesktopSyncJobWhereInput | DesktopSyncJobWhereInput[]
    workspaceId?: StringNullableFilter<"DesktopSyncJob"> | string | null
    type?: StringFilter<"DesktopSyncJob"> | string
    payload?: StringFilter<"DesktopSyncJob"> | string
    status?: StringFilter<"DesktopSyncJob"> | string
    error?: StringNullableFilter<"DesktopSyncJob"> | string | null
    retryCount?: IntFilter<"DesktopSyncJob"> | number
    createdAt?: StringFilter<"DesktopSyncJob"> | string
    updatedAt?: StringFilter<"DesktopSyncJob"> | string
  }, "id">

  export type DesktopSyncJobOrderByWithAggregationInput = {
    id?: SortOrder
    workspaceId?: SortOrderInput | SortOrder
    type?: SortOrder
    payload?: SortOrder
    status?: SortOrder
    error?: SortOrderInput | SortOrder
    retryCount?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: DesktopSyncJobCountOrderByAggregateInput
    _avg?: DesktopSyncJobAvgOrderByAggregateInput
    _max?: DesktopSyncJobMaxOrderByAggregateInput
    _min?: DesktopSyncJobMinOrderByAggregateInput
    _sum?: DesktopSyncJobSumOrderByAggregateInput
  }

  export type DesktopSyncJobScalarWhereWithAggregatesInput = {
    AND?: DesktopSyncJobScalarWhereWithAggregatesInput | DesktopSyncJobScalarWhereWithAggregatesInput[]
    OR?: DesktopSyncJobScalarWhereWithAggregatesInput[]
    NOT?: DesktopSyncJobScalarWhereWithAggregatesInput | DesktopSyncJobScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"DesktopSyncJob"> | string
    workspaceId?: StringNullableWithAggregatesFilter<"DesktopSyncJob"> | string | null
    type?: StringWithAggregatesFilter<"DesktopSyncJob"> | string
    payload?: StringWithAggregatesFilter<"DesktopSyncJob"> | string
    status?: StringWithAggregatesFilter<"DesktopSyncJob"> | string
    error?: StringNullableWithAggregatesFilter<"DesktopSyncJob"> | string | null
    retryCount?: IntWithAggregatesFilter<"DesktopSyncJob"> | number
    createdAt?: StringWithAggregatesFilter<"DesktopSyncJob"> | string
    updatedAt?: StringWithAggregatesFilter<"DesktopSyncJob"> | string
  }

  export type DesktopRecentItemWhereInput = {
    AND?: DesktopRecentItemWhereInput | DesktopRecentItemWhereInput[]
    OR?: DesktopRecentItemWhereInput[]
    NOT?: DesktopRecentItemWhereInput | DesktopRecentItemWhereInput[]
    id?: StringFilter<"DesktopRecentItem"> | string
    kind?: StringFilter<"DesktopRecentItem"> | string
    label?: StringFilter<"DesktopRecentItem"> | string
    value?: StringFilter<"DesktopRecentItem"> | string
    openedAt?: StringFilter<"DesktopRecentItem"> | string
  }

  export type DesktopRecentItemOrderByWithRelationInput = {
    id?: SortOrder
    kind?: SortOrder
    label?: SortOrder
    value?: SortOrder
    openedAt?: SortOrder
  }

  export type DesktopRecentItemWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: DesktopRecentItemWhereInput | DesktopRecentItemWhereInput[]
    OR?: DesktopRecentItemWhereInput[]
    NOT?: DesktopRecentItemWhereInput | DesktopRecentItemWhereInput[]
    kind?: StringFilter<"DesktopRecentItem"> | string
    label?: StringFilter<"DesktopRecentItem"> | string
    value?: StringFilter<"DesktopRecentItem"> | string
    openedAt?: StringFilter<"DesktopRecentItem"> | string
  }, "id">

  export type DesktopRecentItemOrderByWithAggregationInput = {
    id?: SortOrder
    kind?: SortOrder
    label?: SortOrder
    value?: SortOrder
    openedAt?: SortOrder
    _count?: DesktopRecentItemCountOrderByAggregateInput
    _max?: DesktopRecentItemMaxOrderByAggregateInput
    _min?: DesktopRecentItemMinOrderByAggregateInput
  }

  export type DesktopRecentItemScalarWhereWithAggregatesInput = {
    AND?: DesktopRecentItemScalarWhereWithAggregatesInput | DesktopRecentItemScalarWhereWithAggregatesInput[]
    OR?: DesktopRecentItemScalarWhereWithAggregatesInput[]
    NOT?: DesktopRecentItemScalarWhereWithAggregatesInput | DesktopRecentItemScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"DesktopRecentItem"> | string
    kind?: StringWithAggregatesFilter<"DesktopRecentItem"> | string
    label?: StringWithAggregatesFilter<"DesktopRecentItem"> | string
    value?: StringWithAggregatesFilter<"DesktopRecentItem"> | string
    openedAt?: StringWithAggregatesFilter<"DesktopRecentItem"> | string
  }

  export type UserCreateInput = {
    id: string
    clerkId?: string | null
    email?: string | null
    name: string
    createdAt: string
    updatedAt: string
    organization: OrganizationCreateNestedOneWithoutUsersInput
  }

  export type UserUncheckedCreateInput = {
    id: string
    organizationId: string
    clerkId?: string | null
    email?: string | null
    name: string
    createdAt: string
    updatedAt: string
  }

  export type UserUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    clerkId?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    organization?: OrganizationUpdateOneRequiredWithoutUsersNestedInput
  }

  export type UserUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    organizationId?: StringFieldUpdateOperationsInput | string
    clerkId?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type UserCreateManyInput = {
    id: string
    organizationId: string
    clerkId?: string | null
    email?: string | null
    name: string
    createdAt: string
    updatedAt: string
  }

  export type UserUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    clerkId?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type UserUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    organizationId?: StringFieldUpdateOperationsInput | string
    clerkId?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type OrganizationCreateInput = {
    id: string
    name: string
    slug: string
    createdAt: string
    updatedAt: string
    users?: UserCreateNestedManyWithoutOrganizationInput
    posts?: PostCreateNestedManyWithoutOrganizationInput
    trends?: TrendCreateNestedManyWithoutOrganizationInput
    ingredients?: IngredientCreateNestedManyWithoutOrganizationInput
    agentStrategies?: AgentStrategyCreateNestedManyWithoutOrganizationInput
    workflows?: WorkflowCreateNestedManyWithoutOrganizationInput
  }

  export type OrganizationUncheckedCreateInput = {
    id: string
    name: string
    slug: string
    createdAt: string
    updatedAt: string
    users?: UserUncheckedCreateNestedManyWithoutOrganizationInput
    posts?: PostUncheckedCreateNestedManyWithoutOrganizationInput
    trends?: TrendUncheckedCreateNestedManyWithoutOrganizationInput
    ingredients?: IngredientUncheckedCreateNestedManyWithoutOrganizationInput
    agentStrategies?: AgentStrategyUncheckedCreateNestedManyWithoutOrganizationInput
    workflows?: WorkflowUncheckedCreateNestedManyWithoutOrganizationInput
  }

  export type OrganizationUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    users?: UserUpdateManyWithoutOrganizationNestedInput
    posts?: PostUpdateManyWithoutOrganizationNestedInput
    trends?: TrendUpdateManyWithoutOrganizationNestedInput
    ingredients?: IngredientUpdateManyWithoutOrganizationNestedInput
    agentStrategies?: AgentStrategyUpdateManyWithoutOrganizationNestedInput
    workflows?: WorkflowUpdateManyWithoutOrganizationNestedInput
  }

  export type OrganizationUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    users?: UserUncheckedUpdateManyWithoutOrganizationNestedInput
    posts?: PostUncheckedUpdateManyWithoutOrganizationNestedInput
    trends?: TrendUncheckedUpdateManyWithoutOrganizationNestedInput
    ingredients?: IngredientUncheckedUpdateManyWithoutOrganizationNestedInput
    agentStrategies?: AgentStrategyUncheckedUpdateManyWithoutOrganizationNestedInput
    workflows?: WorkflowUncheckedUpdateManyWithoutOrganizationNestedInput
  }

  export type OrganizationCreateManyInput = {
    id: string
    name: string
    slug: string
    createdAt: string
    updatedAt: string
  }

  export type OrganizationUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type OrganizationUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type PostCreateInput = {
    id: string
    workspaceId?: string | null
    platform: string
    type: string
    prompt: string
    content: string
    status: string
    publishIntent?: string | null
    sourceDraftId?: string | null
    sourceTrendId?: string | null
    sourceTrendTopic?: string | null
    publishedAt?: string | null
    views?: number
    engagements?: number
    createdAt: string
    updatedAt: string
    organization: OrganizationCreateNestedOneWithoutPostsInput
  }

  export type PostUncheckedCreateInput = {
    id: string
    organizationId: string
    workspaceId?: string | null
    platform: string
    type: string
    prompt: string
    content: string
    status: string
    publishIntent?: string | null
    sourceDraftId?: string | null
    sourceTrendId?: string | null
    sourceTrendTopic?: string | null
    publishedAt?: string | null
    views?: number
    engagements?: number
    createdAt: string
    updatedAt: string
  }

  export type PostUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: NullableStringFieldUpdateOperationsInput | string | null
    platform?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    prompt?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    publishIntent?: NullableStringFieldUpdateOperationsInput | string | null
    sourceDraftId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceTrendId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceTrendTopic?: NullableStringFieldUpdateOperationsInput | string | null
    publishedAt?: NullableStringFieldUpdateOperationsInput | string | null
    views?: IntFieldUpdateOperationsInput | number
    engagements?: IntFieldUpdateOperationsInput | number
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    organization?: OrganizationUpdateOneRequiredWithoutPostsNestedInput
  }

  export type PostUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    organizationId?: StringFieldUpdateOperationsInput | string
    workspaceId?: NullableStringFieldUpdateOperationsInput | string | null
    platform?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    prompt?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    publishIntent?: NullableStringFieldUpdateOperationsInput | string | null
    sourceDraftId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceTrendId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceTrendTopic?: NullableStringFieldUpdateOperationsInput | string | null
    publishedAt?: NullableStringFieldUpdateOperationsInput | string | null
    views?: IntFieldUpdateOperationsInput | number
    engagements?: IntFieldUpdateOperationsInput | number
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type PostCreateManyInput = {
    id: string
    organizationId: string
    workspaceId?: string | null
    platform: string
    type: string
    prompt: string
    content: string
    status: string
    publishIntent?: string | null
    sourceDraftId?: string | null
    sourceTrendId?: string | null
    sourceTrendTopic?: string | null
    publishedAt?: string | null
    views?: number
    engagements?: number
    createdAt: string
    updatedAt: string
  }

  export type PostUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: NullableStringFieldUpdateOperationsInput | string | null
    platform?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    prompt?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    publishIntent?: NullableStringFieldUpdateOperationsInput | string | null
    sourceDraftId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceTrendId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceTrendTopic?: NullableStringFieldUpdateOperationsInput | string | null
    publishedAt?: NullableStringFieldUpdateOperationsInput | string | null
    views?: IntFieldUpdateOperationsInput | number
    engagements?: IntFieldUpdateOperationsInput | number
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type PostUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    organizationId?: StringFieldUpdateOperationsInput | string
    workspaceId?: NullableStringFieldUpdateOperationsInput | string | null
    platform?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    prompt?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    publishIntent?: NullableStringFieldUpdateOperationsInput | string | null
    sourceDraftId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceTrendId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceTrendTopic?: NullableStringFieldUpdateOperationsInput | string | null
    publishedAt?: NullableStringFieldUpdateOperationsInput | string | null
    views?: IntFieldUpdateOperationsInput | number
    engagements?: IntFieldUpdateOperationsInput | number
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type IngredientCreateInput = {
    id: string
    title: string
    content: string
    platform?: string | null
    totalVotes?: number
    sourcePostId?: string | null
    createdAt: string
    updatedAt: string
    organization: OrganizationCreateNestedOneWithoutIngredientsInput
  }

  export type IngredientUncheckedCreateInput = {
    id: string
    organizationId: string
    title: string
    content: string
    platform?: string | null
    totalVotes?: number
    sourcePostId?: string | null
    createdAt: string
    updatedAt: string
  }

  export type IngredientUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
    platform?: NullableStringFieldUpdateOperationsInput | string | null
    totalVotes?: IntFieldUpdateOperationsInput | number
    sourcePostId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    organization?: OrganizationUpdateOneRequiredWithoutIngredientsNestedInput
  }

  export type IngredientUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    organizationId?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
    platform?: NullableStringFieldUpdateOperationsInput | string | null
    totalVotes?: IntFieldUpdateOperationsInput | number
    sourcePostId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type IngredientCreateManyInput = {
    id: string
    organizationId: string
    title: string
    content: string
    platform?: string | null
    totalVotes?: number
    sourcePostId?: string | null
    createdAt: string
    updatedAt: string
  }

  export type IngredientUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
    platform?: NullableStringFieldUpdateOperationsInput | string | null
    totalVotes?: IntFieldUpdateOperationsInput | number
    sourcePostId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type IngredientUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    organizationId?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
    platform?: NullableStringFieldUpdateOperationsInput | string | null
    totalVotes?: IntFieldUpdateOperationsInput | number
    sourcePostId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type TrendCreateInput = {
    id: string
    platform: string
    topic: string
    summary?: string | null
    viralityScore: number
    engagementScore: number
    createdAt: string
    organization: OrganizationCreateNestedOneWithoutTrendsInput
  }

  export type TrendUncheckedCreateInput = {
    id: string
    organizationId: string
    platform: string
    topic: string
    summary?: string | null
    viralityScore: number
    engagementScore: number
    createdAt: string
  }

  export type TrendUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    platform?: StringFieldUpdateOperationsInput | string
    topic?: StringFieldUpdateOperationsInput | string
    summary?: NullableStringFieldUpdateOperationsInput | string | null
    viralityScore?: IntFieldUpdateOperationsInput | number
    engagementScore?: IntFieldUpdateOperationsInput | number
    createdAt?: StringFieldUpdateOperationsInput | string
    organization?: OrganizationUpdateOneRequiredWithoutTrendsNestedInput
  }

  export type TrendUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    organizationId?: StringFieldUpdateOperationsInput | string
    platform?: StringFieldUpdateOperationsInput | string
    topic?: StringFieldUpdateOperationsInput | string
    summary?: NullableStringFieldUpdateOperationsInput | string | null
    viralityScore?: IntFieldUpdateOperationsInput | number
    engagementScore?: IntFieldUpdateOperationsInput | number
    createdAt?: StringFieldUpdateOperationsInput | string
  }

  export type TrendCreateManyInput = {
    id: string
    organizationId: string
    platform: string
    topic: string
    summary?: string | null
    viralityScore: number
    engagementScore: number
    createdAt: string
  }

  export type TrendUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    platform?: StringFieldUpdateOperationsInput | string
    topic?: StringFieldUpdateOperationsInput | string
    summary?: NullableStringFieldUpdateOperationsInput | string | null
    viralityScore?: IntFieldUpdateOperationsInput | number
    engagementScore?: IntFieldUpdateOperationsInput | number
    createdAt?: StringFieldUpdateOperationsInput | string
  }

  export type TrendUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    organizationId?: StringFieldUpdateOperationsInput | string
    platform?: StringFieldUpdateOperationsInput | string
    topic?: StringFieldUpdateOperationsInput | string
    summary?: NullableStringFieldUpdateOperationsInput | string | null
    viralityScore?: IntFieldUpdateOperationsInput | number
    engagementScore?: IntFieldUpdateOperationsInput | number
    createdAt?: StringFieldUpdateOperationsInput | string
  }

  export type AgentStrategyCreateInput = {
    id: string
    name: string
    avatar?: string | null
    platformsJson?: string
    status: string
    isActive?: boolean
    lastRunAt?: string | null
    createdAt: string
    updatedAt: string
    organization: OrganizationCreateNestedOneWithoutAgentStrategiesInput
    workflows?: WorkflowExecutionCreateNestedManyWithoutAgentStrategyInput
  }

  export type AgentStrategyUncheckedCreateInput = {
    id: string
    organizationId: string
    name: string
    avatar?: string | null
    platformsJson?: string
    status: string
    isActive?: boolean
    lastRunAt?: string | null
    createdAt: string
    updatedAt: string
    workflows?: WorkflowExecutionUncheckedCreateNestedManyWithoutAgentStrategyInput
  }

  export type AgentStrategyUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    avatar?: NullableStringFieldUpdateOperationsInput | string | null
    platformsJson?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    lastRunAt?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    organization?: OrganizationUpdateOneRequiredWithoutAgentStrategiesNestedInput
    workflows?: WorkflowExecutionUpdateManyWithoutAgentStrategyNestedInput
  }

  export type AgentStrategyUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    organizationId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    avatar?: NullableStringFieldUpdateOperationsInput | string | null
    platformsJson?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    lastRunAt?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    workflows?: WorkflowExecutionUncheckedUpdateManyWithoutAgentStrategyNestedInput
  }

  export type AgentStrategyCreateManyInput = {
    id: string
    organizationId: string
    name: string
    avatar?: string | null
    platformsJson?: string
    status: string
    isActive?: boolean
    lastRunAt?: string | null
    createdAt: string
    updatedAt: string
  }

  export type AgentStrategyUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    avatar?: NullableStringFieldUpdateOperationsInput | string | null
    platformsJson?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    lastRunAt?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type AgentStrategyUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    organizationId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    avatar?: NullableStringFieldUpdateOperationsInput | string | null
    platformsJson?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    lastRunAt?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type WorkflowCreateInput = {
    id: string
    name: string
    description?: string | null
    lifecycle: string
    nodeCount: number
    supportsBatch?: boolean
    lastExecutedAt?: string | null
    createdAt: string
    updatedAt: string
    organization: OrganizationCreateNestedOneWithoutWorkflowsInput
    executions?: WorkflowExecutionCreateNestedManyWithoutWorkflowInput
  }

  export type WorkflowUncheckedCreateInput = {
    id: string
    organizationId: string
    name: string
    description?: string | null
    lifecycle: string
    nodeCount: number
    supportsBatch?: boolean
    lastExecutedAt?: string | null
    createdAt: string
    updatedAt: string
    executions?: WorkflowExecutionUncheckedCreateNestedManyWithoutWorkflowInput
  }

  export type WorkflowUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    lifecycle?: StringFieldUpdateOperationsInput | string
    nodeCount?: IntFieldUpdateOperationsInput | number
    supportsBatch?: BoolFieldUpdateOperationsInput | boolean
    lastExecutedAt?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    organization?: OrganizationUpdateOneRequiredWithoutWorkflowsNestedInput
    executions?: WorkflowExecutionUpdateManyWithoutWorkflowNestedInput
  }

  export type WorkflowUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    organizationId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    lifecycle?: StringFieldUpdateOperationsInput | string
    nodeCount?: IntFieldUpdateOperationsInput | number
    supportsBatch?: BoolFieldUpdateOperationsInput | boolean
    lastExecutedAt?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    executions?: WorkflowExecutionUncheckedUpdateManyWithoutWorkflowNestedInput
  }

  export type WorkflowCreateManyInput = {
    id: string
    organizationId: string
    name: string
    description?: string | null
    lifecycle: string
    nodeCount: number
    supportsBatch?: boolean
    lastExecutedAt?: string | null
    createdAt: string
    updatedAt: string
  }

  export type WorkflowUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    lifecycle?: StringFieldUpdateOperationsInput | string
    nodeCount?: IntFieldUpdateOperationsInput | number
    supportsBatch?: BoolFieldUpdateOperationsInput | boolean
    lastExecutedAt?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type WorkflowUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    organizationId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    lifecycle?: StringFieldUpdateOperationsInput | string
    nodeCount?: IntFieldUpdateOperationsInput | number
    supportsBatch?: BoolFieldUpdateOperationsInput | boolean
    lastExecutedAt?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type WorkflowExecutionCreateInput = {
    id: string
    mode: string
    status: string
    startedAt: string
    completedAt?: string | null
    workflow: WorkflowCreateNestedOneWithoutExecutionsInput
    agentStrategy?: AgentStrategyCreateNestedOneWithoutWorkflowsInput
  }

  export type WorkflowExecutionUncheckedCreateInput = {
    id: string
    workflowId: string
    agentStrategyId?: string | null
    mode: string
    status: string
    startedAt: string
    completedAt?: string | null
  }

  export type WorkflowExecutionUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    mode?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    startedAt?: StringFieldUpdateOperationsInput | string
    completedAt?: NullableStringFieldUpdateOperationsInput | string | null
    workflow?: WorkflowUpdateOneRequiredWithoutExecutionsNestedInput
    agentStrategy?: AgentStrategyUpdateOneWithoutWorkflowsNestedInput
  }

  export type WorkflowExecutionUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    workflowId?: StringFieldUpdateOperationsInput | string
    agentStrategyId?: NullableStringFieldUpdateOperationsInput | string | null
    mode?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    startedAt?: StringFieldUpdateOperationsInput | string
    completedAt?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type WorkflowExecutionCreateManyInput = {
    id: string
    workflowId: string
    agentStrategyId?: string | null
    mode: string
    status: string
    startedAt: string
    completedAt?: string | null
  }

  export type WorkflowExecutionUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    mode?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    startedAt?: StringFieldUpdateOperationsInput | string
    completedAt?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type WorkflowExecutionUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    workflowId?: StringFieldUpdateOperationsInput | string
    agentStrategyId?: NullableStringFieldUpdateOperationsInput | string | null
    mode?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    startedAt?: StringFieldUpdateOperationsInput | string
    completedAt?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type DesktopKvCreateInput = {
    key: string
    value: string
  }

  export type DesktopKvUncheckedCreateInput = {
    key: string
    value: string
  }

  export type DesktopKvUpdateInput = {
    key?: StringFieldUpdateOperationsInput | string
    value?: StringFieldUpdateOperationsInput | string
  }

  export type DesktopKvUncheckedUpdateInput = {
    key?: StringFieldUpdateOperationsInput | string
    value?: StringFieldUpdateOperationsInput | string
  }

  export type DesktopKvCreateManyInput = {
    key: string
    value: string
  }

  export type DesktopKvUpdateManyMutationInput = {
    key?: StringFieldUpdateOperationsInput | string
    value?: StringFieldUpdateOperationsInput | string
  }

  export type DesktopKvUncheckedUpdateManyInput = {
    key?: StringFieldUpdateOperationsInput | string
    value?: StringFieldUpdateOperationsInput | string
  }

  export type DesktopWorkspaceCreateInput = {
    id: string
    name: string
    path: string
    linkedProjectId?: string | null
    fileIndex?: string
    indexingState?: string
    localDraftCount?: number
    pendingSyncCount?: number
    createdAt: string
    updatedAt: string
    lastOpenedAt: string
  }

  export type DesktopWorkspaceUncheckedCreateInput = {
    id: string
    name: string
    path: string
    linkedProjectId?: string | null
    fileIndex?: string
    indexingState?: string
    localDraftCount?: number
    pendingSyncCount?: number
    createdAt: string
    updatedAt: string
    lastOpenedAt: string
  }

  export type DesktopWorkspaceUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    path?: StringFieldUpdateOperationsInput | string
    linkedProjectId?: NullableStringFieldUpdateOperationsInput | string | null
    fileIndex?: StringFieldUpdateOperationsInput | string
    indexingState?: StringFieldUpdateOperationsInput | string
    localDraftCount?: IntFieldUpdateOperationsInput | number
    pendingSyncCount?: IntFieldUpdateOperationsInput | number
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    lastOpenedAt?: StringFieldUpdateOperationsInput | string
  }

  export type DesktopWorkspaceUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    path?: StringFieldUpdateOperationsInput | string
    linkedProjectId?: NullableStringFieldUpdateOperationsInput | string | null
    fileIndex?: StringFieldUpdateOperationsInput | string
    indexingState?: StringFieldUpdateOperationsInput | string
    localDraftCount?: IntFieldUpdateOperationsInput | number
    pendingSyncCount?: IntFieldUpdateOperationsInput | number
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    lastOpenedAt?: StringFieldUpdateOperationsInput | string
  }

  export type DesktopWorkspaceCreateManyInput = {
    id: string
    name: string
    path: string
    linkedProjectId?: string | null
    fileIndex?: string
    indexingState?: string
    localDraftCount?: number
    pendingSyncCount?: number
    createdAt: string
    updatedAt: string
    lastOpenedAt: string
  }

  export type DesktopWorkspaceUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    path?: StringFieldUpdateOperationsInput | string
    linkedProjectId?: NullableStringFieldUpdateOperationsInput | string | null
    fileIndex?: StringFieldUpdateOperationsInput | string
    indexingState?: StringFieldUpdateOperationsInput | string
    localDraftCount?: IntFieldUpdateOperationsInput | number
    pendingSyncCount?: IntFieldUpdateOperationsInput | number
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    lastOpenedAt?: StringFieldUpdateOperationsInput | string
  }

  export type DesktopWorkspaceUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    path?: StringFieldUpdateOperationsInput | string
    linkedProjectId?: NullableStringFieldUpdateOperationsInput | string | null
    fileIndex?: StringFieldUpdateOperationsInput | string
    indexingState?: StringFieldUpdateOperationsInput | string
    localDraftCount?: IntFieldUpdateOperationsInput | number
    pendingSyncCount?: IntFieldUpdateOperationsInput | number
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    lastOpenedAt?: StringFieldUpdateOperationsInput | string
  }

  export type DesktopSyncJobCreateInput = {
    id: string
    workspaceId?: string | null
    type: string
    payload: string
    status: string
    error?: string | null
    retryCount?: number
    createdAt: string
    updatedAt: string
  }

  export type DesktopSyncJobUncheckedCreateInput = {
    id: string
    workspaceId?: string | null
    type: string
    payload: string
    status: string
    error?: string | null
    retryCount?: number
    createdAt: string
    updatedAt: string
  }

  export type DesktopSyncJobUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: NullableStringFieldUpdateOperationsInput | string | null
    type?: StringFieldUpdateOperationsInput | string
    payload?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    error?: NullableStringFieldUpdateOperationsInput | string | null
    retryCount?: IntFieldUpdateOperationsInput | number
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type DesktopSyncJobUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: NullableStringFieldUpdateOperationsInput | string | null
    type?: StringFieldUpdateOperationsInput | string
    payload?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    error?: NullableStringFieldUpdateOperationsInput | string | null
    retryCount?: IntFieldUpdateOperationsInput | number
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type DesktopSyncJobCreateManyInput = {
    id: string
    workspaceId?: string | null
    type: string
    payload: string
    status: string
    error?: string | null
    retryCount?: number
    createdAt: string
    updatedAt: string
  }

  export type DesktopSyncJobUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: NullableStringFieldUpdateOperationsInput | string | null
    type?: StringFieldUpdateOperationsInput | string
    payload?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    error?: NullableStringFieldUpdateOperationsInput | string | null
    retryCount?: IntFieldUpdateOperationsInput | number
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type DesktopSyncJobUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: NullableStringFieldUpdateOperationsInput | string | null
    type?: StringFieldUpdateOperationsInput | string
    payload?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    error?: NullableStringFieldUpdateOperationsInput | string | null
    retryCount?: IntFieldUpdateOperationsInput | number
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type DesktopRecentItemCreateInput = {
    id: string
    kind: string
    label: string
    value: string
    openedAt: string
  }

  export type DesktopRecentItemUncheckedCreateInput = {
    id: string
    kind: string
    label: string
    value: string
    openedAt: string
  }

  export type DesktopRecentItemUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    kind?: StringFieldUpdateOperationsInput | string
    label?: StringFieldUpdateOperationsInput | string
    value?: StringFieldUpdateOperationsInput | string
    openedAt?: StringFieldUpdateOperationsInput | string
  }

  export type DesktopRecentItemUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    kind?: StringFieldUpdateOperationsInput | string
    label?: StringFieldUpdateOperationsInput | string
    value?: StringFieldUpdateOperationsInput | string
    openedAt?: StringFieldUpdateOperationsInput | string
  }

  export type DesktopRecentItemCreateManyInput = {
    id: string
    kind: string
    label: string
    value: string
    openedAt: string
  }

  export type DesktopRecentItemUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    kind?: StringFieldUpdateOperationsInput | string
    label?: StringFieldUpdateOperationsInput | string
    value?: StringFieldUpdateOperationsInput | string
    openedAt?: StringFieldUpdateOperationsInput | string
  }

  export type DesktopRecentItemUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    kind?: StringFieldUpdateOperationsInput | string
    label?: StringFieldUpdateOperationsInput | string
    value?: StringFieldUpdateOperationsInput | string
    openedAt?: StringFieldUpdateOperationsInput | string
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type OrganizationScalarRelationFilter = {
    is?: OrganizationWhereInput
    isNot?: OrganizationWhereInput
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type UserCountOrderByAggregateInput = {
    id?: SortOrder
    organizationId?: SortOrder
    clerkId?: SortOrder
    email?: SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type UserMaxOrderByAggregateInput = {
    id?: SortOrder
    organizationId?: SortOrder
    clerkId?: SortOrder
    email?: SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type UserMinOrderByAggregateInput = {
    id?: SortOrder
    organizationId?: SortOrder
    clerkId?: SortOrder
    email?: SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type UserListRelationFilter = {
    every?: UserWhereInput
    some?: UserWhereInput
    none?: UserWhereInput
  }

  export type PostListRelationFilter = {
    every?: PostWhereInput
    some?: PostWhereInput
    none?: PostWhereInput
  }

  export type TrendListRelationFilter = {
    every?: TrendWhereInput
    some?: TrendWhereInput
    none?: TrendWhereInput
  }

  export type IngredientListRelationFilter = {
    every?: IngredientWhereInput
    some?: IngredientWhereInput
    none?: IngredientWhereInput
  }

  export type AgentStrategyListRelationFilter = {
    every?: AgentStrategyWhereInput
    some?: AgentStrategyWhereInput
    none?: AgentStrategyWhereInput
  }

  export type WorkflowListRelationFilter = {
    every?: WorkflowWhereInput
    some?: WorkflowWhereInput
    none?: WorkflowWhereInput
  }

  export type UserOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type PostOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type TrendOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type IngredientOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type AgentStrategyOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type WorkflowOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type OrganizationCountOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    slug?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type OrganizationMaxOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    slug?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type OrganizationMinOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    slug?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type PostCountOrderByAggregateInput = {
    id?: SortOrder
    organizationId?: SortOrder
    workspaceId?: SortOrder
    platform?: SortOrder
    type?: SortOrder
    prompt?: SortOrder
    content?: SortOrder
    status?: SortOrder
    publishIntent?: SortOrder
    sourceDraftId?: SortOrder
    sourceTrendId?: SortOrder
    sourceTrendTopic?: SortOrder
    publishedAt?: SortOrder
    views?: SortOrder
    engagements?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type PostAvgOrderByAggregateInput = {
    views?: SortOrder
    engagements?: SortOrder
  }

  export type PostMaxOrderByAggregateInput = {
    id?: SortOrder
    organizationId?: SortOrder
    workspaceId?: SortOrder
    platform?: SortOrder
    type?: SortOrder
    prompt?: SortOrder
    content?: SortOrder
    status?: SortOrder
    publishIntent?: SortOrder
    sourceDraftId?: SortOrder
    sourceTrendId?: SortOrder
    sourceTrendTopic?: SortOrder
    publishedAt?: SortOrder
    views?: SortOrder
    engagements?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type PostMinOrderByAggregateInput = {
    id?: SortOrder
    organizationId?: SortOrder
    workspaceId?: SortOrder
    platform?: SortOrder
    type?: SortOrder
    prompt?: SortOrder
    content?: SortOrder
    status?: SortOrder
    publishIntent?: SortOrder
    sourceDraftId?: SortOrder
    sourceTrendId?: SortOrder
    sourceTrendTopic?: SortOrder
    publishedAt?: SortOrder
    views?: SortOrder
    engagements?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type PostSumOrderByAggregateInput = {
    views?: SortOrder
    engagements?: SortOrder
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type IngredientCountOrderByAggregateInput = {
    id?: SortOrder
    organizationId?: SortOrder
    title?: SortOrder
    content?: SortOrder
    platform?: SortOrder
    totalVotes?: SortOrder
    sourcePostId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type IngredientAvgOrderByAggregateInput = {
    totalVotes?: SortOrder
  }

  export type IngredientMaxOrderByAggregateInput = {
    id?: SortOrder
    organizationId?: SortOrder
    title?: SortOrder
    content?: SortOrder
    platform?: SortOrder
    totalVotes?: SortOrder
    sourcePostId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type IngredientMinOrderByAggregateInput = {
    id?: SortOrder
    organizationId?: SortOrder
    title?: SortOrder
    content?: SortOrder
    platform?: SortOrder
    totalVotes?: SortOrder
    sourcePostId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type IngredientSumOrderByAggregateInput = {
    totalVotes?: SortOrder
  }

  export type TrendCountOrderByAggregateInput = {
    id?: SortOrder
    organizationId?: SortOrder
    platform?: SortOrder
    topic?: SortOrder
    summary?: SortOrder
    viralityScore?: SortOrder
    engagementScore?: SortOrder
    createdAt?: SortOrder
  }

  export type TrendAvgOrderByAggregateInput = {
    viralityScore?: SortOrder
    engagementScore?: SortOrder
  }

  export type TrendMaxOrderByAggregateInput = {
    id?: SortOrder
    organizationId?: SortOrder
    platform?: SortOrder
    topic?: SortOrder
    summary?: SortOrder
    viralityScore?: SortOrder
    engagementScore?: SortOrder
    createdAt?: SortOrder
  }

  export type TrendMinOrderByAggregateInput = {
    id?: SortOrder
    organizationId?: SortOrder
    platform?: SortOrder
    topic?: SortOrder
    summary?: SortOrder
    viralityScore?: SortOrder
    engagementScore?: SortOrder
    createdAt?: SortOrder
  }

  export type TrendSumOrderByAggregateInput = {
    viralityScore?: SortOrder
    engagementScore?: SortOrder
  }

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type WorkflowExecutionListRelationFilter = {
    every?: WorkflowExecutionWhereInput
    some?: WorkflowExecutionWhereInput
    none?: WorkflowExecutionWhereInput
  }

  export type WorkflowExecutionOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type AgentStrategyCountOrderByAggregateInput = {
    id?: SortOrder
    organizationId?: SortOrder
    name?: SortOrder
    avatar?: SortOrder
    platformsJson?: SortOrder
    status?: SortOrder
    isActive?: SortOrder
    lastRunAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type AgentStrategyMaxOrderByAggregateInput = {
    id?: SortOrder
    organizationId?: SortOrder
    name?: SortOrder
    avatar?: SortOrder
    platformsJson?: SortOrder
    status?: SortOrder
    isActive?: SortOrder
    lastRunAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type AgentStrategyMinOrderByAggregateInput = {
    id?: SortOrder
    organizationId?: SortOrder
    name?: SortOrder
    avatar?: SortOrder
    platformsJson?: SortOrder
    status?: SortOrder
    isActive?: SortOrder
    lastRunAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type WorkflowCountOrderByAggregateInput = {
    id?: SortOrder
    organizationId?: SortOrder
    name?: SortOrder
    description?: SortOrder
    lifecycle?: SortOrder
    nodeCount?: SortOrder
    supportsBatch?: SortOrder
    lastExecutedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type WorkflowAvgOrderByAggregateInput = {
    nodeCount?: SortOrder
  }

  export type WorkflowMaxOrderByAggregateInput = {
    id?: SortOrder
    organizationId?: SortOrder
    name?: SortOrder
    description?: SortOrder
    lifecycle?: SortOrder
    nodeCount?: SortOrder
    supportsBatch?: SortOrder
    lastExecutedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type WorkflowMinOrderByAggregateInput = {
    id?: SortOrder
    organizationId?: SortOrder
    name?: SortOrder
    description?: SortOrder
    lifecycle?: SortOrder
    nodeCount?: SortOrder
    supportsBatch?: SortOrder
    lastExecutedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type WorkflowSumOrderByAggregateInput = {
    nodeCount?: SortOrder
  }

  export type WorkflowScalarRelationFilter = {
    is?: WorkflowWhereInput
    isNot?: WorkflowWhereInput
  }

  export type AgentStrategyNullableScalarRelationFilter = {
    is?: AgentStrategyWhereInput | null
    isNot?: AgentStrategyWhereInput | null
  }

  export type WorkflowExecutionCountOrderByAggregateInput = {
    id?: SortOrder
    workflowId?: SortOrder
    agentStrategyId?: SortOrder
    mode?: SortOrder
    status?: SortOrder
    startedAt?: SortOrder
    completedAt?: SortOrder
  }

  export type WorkflowExecutionMaxOrderByAggregateInput = {
    id?: SortOrder
    workflowId?: SortOrder
    agentStrategyId?: SortOrder
    mode?: SortOrder
    status?: SortOrder
    startedAt?: SortOrder
    completedAt?: SortOrder
  }

  export type WorkflowExecutionMinOrderByAggregateInput = {
    id?: SortOrder
    workflowId?: SortOrder
    agentStrategyId?: SortOrder
    mode?: SortOrder
    status?: SortOrder
    startedAt?: SortOrder
    completedAt?: SortOrder
  }

  export type DesktopKvCountOrderByAggregateInput = {
    key?: SortOrder
    value?: SortOrder
  }

  export type DesktopKvMaxOrderByAggregateInput = {
    key?: SortOrder
    value?: SortOrder
  }

  export type DesktopKvMinOrderByAggregateInput = {
    key?: SortOrder
    value?: SortOrder
  }

  export type DesktopWorkspaceCountOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    path?: SortOrder
    linkedProjectId?: SortOrder
    fileIndex?: SortOrder
    indexingState?: SortOrder
    localDraftCount?: SortOrder
    pendingSyncCount?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    lastOpenedAt?: SortOrder
  }

  export type DesktopWorkspaceAvgOrderByAggregateInput = {
    localDraftCount?: SortOrder
    pendingSyncCount?: SortOrder
  }

  export type DesktopWorkspaceMaxOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    path?: SortOrder
    linkedProjectId?: SortOrder
    fileIndex?: SortOrder
    indexingState?: SortOrder
    localDraftCount?: SortOrder
    pendingSyncCount?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    lastOpenedAt?: SortOrder
  }

  export type DesktopWorkspaceMinOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    path?: SortOrder
    linkedProjectId?: SortOrder
    fileIndex?: SortOrder
    indexingState?: SortOrder
    localDraftCount?: SortOrder
    pendingSyncCount?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    lastOpenedAt?: SortOrder
  }

  export type DesktopWorkspaceSumOrderByAggregateInput = {
    localDraftCount?: SortOrder
    pendingSyncCount?: SortOrder
  }

  export type DesktopSyncJobCountOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    type?: SortOrder
    payload?: SortOrder
    status?: SortOrder
    error?: SortOrder
    retryCount?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type DesktopSyncJobAvgOrderByAggregateInput = {
    retryCount?: SortOrder
  }

  export type DesktopSyncJobMaxOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    type?: SortOrder
    payload?: SortOrder
    status?: SortOrder
    error?: SortOrder
    retryCount?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type DesktopSyncJobMinOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    type?: SortOrder
    payload?: SortOrder
    status?: SortOrder
    error?: SortOrder
    retryCount?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type DesktopSyncJobSumOrderByAggregateInput = {
    retryCount?: SortOrder
  }

  export type DesktopRecentItemCountOrderByAggregateInput = {
    id?: SortOrder
    kind?: SortOrder
    label?: SortOrder
    value?: SortOrder
    openedAt?: SortOrder
  }

  export type DesktopRecentItemMaxOrderByAggregateInput = {
    id?: SortOrder
    kind?: SortOrder
    label?: SortOrder
    value?: SortOrder
    openedAt?: SortOrder
  }

  export type DesktopRecentItemMinOrderByAggregateInput = {
    id?: SortOrder
    kind?: SortOrder
    label?: SortOrder
    value?: SortOrder
    openedAt?: SortOrder
  }

  export type OrganizationCreateNestedOneWithoutUsersInput = {
    create?: XOR<OrganizationCreateWithoutUsersInput, OrganizationUncheckedCreateWithoutUsersInput>
    connectOrCreate?: OrganizationCreateOrConnectWithoutUsersInput
    connect?: OrganizationWhereUniqueInput
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type OrganizationUpdateOneRequiredWithoutUsersNestedInput = {
    create?: XOR<OrganizationCreateWithoutUsersInput, OrganizationUncheckedCreateWithoutUsersInput>
    connectOrCreate?: OrganizationCreateOrConnectWithoutUsersInput
    upsert?: OrganizationUpsertWithoutUsersInput
    connect?: OrganizationWhereUniqueInput
    update?: XOR<XOR<OrganizationUpdateToOneWithWhereWithoutUsersInput, OrganizationUpdateWithoutUsersInput>, OrganizationUncheckedUpdateWithoutUsersInput>
  }

  export type UserCreateNestedManyWithoutOrganizationInput = {
    create?: XOR<UserCreateWithoutOrganizationInput, UserUncheckedCreateWithoutOrganizationInput> | UserCreateWithoutOrganizationInput[] | UserUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: UserCreateOrConnectWithoutOrganizationInput | UserCreateOrConnectWithoutOrganizationInput[]
    createMany?: UserCreateManyOrganizationInputEnvelope
    connect?: UserWhereUniqueInput | UserWhereUniqueInput[]
  }

  export type PostCreateNestedManyWithoutOrganizationInput = {
    create?: XOR<PostCreateWithoutOrganizationInput, PostUncheckedCreateWithoutOrganizationInput> | PostCreateWithoutOrganizationInput[] | PostUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: PostCreateOrConnectWithoutOrganizationInput | PostCreateOrConnectWithoutOrganizationInput[]
    createMany?: PostCreateManyOrganizationInputEnvelope
    connect?: PostWhereUniqueInput | PostWhereUniqueInput[]
  }

  export type TrendCreateNestedManyWithoutOrganizationInput = {
    create?: XOR<TrendCreateWithoutOrganizationInput, TrendUncheckedCreateWithoutOrganizationInput> | TrendCreateWithoutOrganizationInput[] | TrendUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: TrendCreateOrConnectWithoutOrganizationInput | TrendCreateOrConnectWithoutOrganizationInput[]
    createMany?: TrendCreateManyOrganizationInputEnvelope
    connect?: TrendWhereUniqueInput | TrendWhereUniqueInput[]
  }

  export type IngredientCreateNestedManyWithoutOrganizationInput = {
    create?: XOR<IngredientCreateWithoutOrganizationInput, IngredientUncheckedCreateWithoutOrganizationInput> | IngredientCreateWithoutOrganizationInput[] | IngredientUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: IngredientCreateOrConnectWithoutOrganizationInput | IngredientCreateOrConnectWithoutOrganizationInput[]
    createMany?: IngredientCreateManyOrganizationInputEnvelope
    connect?: IngredientWhereUniqueInput | IngredientWhereUniqueInput[]
  }

  export type AgentStrategyCreateNestedManyWithoutOrganizationInput = {
    create?: XOR<AgentStrategyCreateWithoutOrganizationInput, AgentStrategyUncheckedCreateWithoutOrganizationInput> | AgentStrategyCreateWithoutOrganizationInput[] | AgentStrategyUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: AgentStrategyCreateOrConnectWithoutOrganizationInput | AgentStrategyCreateOrConnectWithoutOrganizationInput[]
    createMany?: AgentStrategyCreateManyOrganizationInputEnvelope
    connect?: AgentStrategyWhereUniqueInput | AgentStrategyWhereUniqueInput[]
  }

  export type WorkflowCreateNestedManyWithoutOrganizationInput = {
    create?: XOR<WorkflowCreateWithoutOrganizationInput, WorkflowUncheckedCreateWithoutOrganizationInput> | WorkflowCreateWithoutOrganizationInput[] | WorkflowUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: WorkflowCreateOrConnectWithoutOrganizationInput | WorkflowCreateOrConnectWithoutOrganizationInput[]
    createMany?: WorkflowCreateManyOrganizationInputEnvelope
    connect?: WorkflowWhereUniqueInput | WorkflowWhereUniqueInput[]
  }

  export type UserUncheckedCreateNestedManyWithoutOrganizationInput = {
    create?: XOR<UserCreateWithoutOrganizationInput, UserUncheckedCreateWithoutOrganizationInput> | UserCreateWithoutOrganizationInput[] | UserUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: UserCreateOrConnectWithoutOrganizationInput | UserCreateOrConnectWithoutOrganizationInput[]
    createMany?: UserCreateManyOrganizationInputEnvelope
    connect?: UserWhereUniqueInput | UserWhereUniqueInput[]
  }

  export type PostUncheckedCreateNestedManyWithoutOrganizationInput = {
    create?: XOR<PostCreateWithoutOrganizationInput, PostUncheckedCreateWithoutOrganizationInput> | PostCreateWithoutOrganizationInput[] | PostUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: PostCreateOrConnectWithoutOrganizationInput | PostCreateOrConnectWithoutOrganizationInput[]
    createMany?: PostCreateManyOrganizationInputEnvelope
    connect?: PostWhereUniqueInput | PostWhereUniqueInput[]
  }

  export type TrendUncheckedCreateNestedManyWithoutOrganizationInput = {
    create?: XOR<TrendCreateWithoutOrganizationInput, TrendUncheckedCreateWithoutOrganizationInput> | TrendCreateWithoutOrganizationInput[] | TrendUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: TrendCreateOrConnectWithoutOrganizationInput | TrendCreateOrConnectWithoutOrganizationInput[]
    createMany?: TrendCreateManyOrganizationInputEnvelope
    connect?: TrendWhereUniqueInput | TrendWhereUniqueInput[]
  }

  export type IngredientUncheckedCreateNestedManyWithoutOrganizationInput = {
    create?: XOR<IngredientCreateWithoutOrganizationInput, IngredientUncheckedCreateWithoutOrganizationInput> | IngredientCreateWithoutOrganizationInput[] | IngredientUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: IngredientCreateOrConnectWithoutOrganizationInput | IngredientCreateOrConnectWithoutOrganizationInput[]
    createMany?: IngredientCreateManyOrganizationInputEnvelope
    connect?: IngredientWhereUniqueInput | IngredientWhereUniqueInput[]
  }

  export type AgentStrategyUncheckedCreateNestedManyWithoutOrganizationInput = {
    create?: XOR<AgentStrategyCreateWithoutOrganizationInput, AgentStrategyUncheckedCreateWithoutOrganizationInput> | AgentStrategyCreateWithoutOrganizationInput[] | AgentStrategyUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: AgentStrategyCreateOrConnectWithoutOrganizationInput | AgentStrategyCreateOrConnectWithoutOrganizationInput[]
    createMany?: AgentStrategyCreateManyOrganizationInputEnvelope
    connect?: AgentStrategyWhereUniqueInput | AgentStrategyWhereUniqueInput[]
  }

  export type WorkflowUncheckedCreateNestedManyWithoutOrganizationInput = {
    create?: XOR<WorkflowCreateWithoutOrganizationInput, WorkflowUncheckedCreateWithoutOrganizationInput> | WorkflowCreateWithoutOrganizationInput[] | WorkflowUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: WorkflowCreateOrConnectWithoutOrganizationInput | WorkflowCreateOrConnectWithoutOrganizationInput[]
    createMany?: WorkflowCreateManyOrganizationInputEnvelope
    connect?: WorkflowWhereUniqueInput | WorkflowWhereUniqueInput[]
  }

  export type UserUpdateManyWithoutOrganizationNestedInput = {
    create?: XOR<UserCreateWithoutOrganizationInput, UserUncheckedCreateWithoutOrganizationInput> | UserCreateWithoutOrganizationInput[] | UserUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: UserCreateOrConnectWithoutOrganizationInput | UserCreateOrConnectWithoutOrganizationInput[]
    upsert?: UserUpsertWithWhereUniqueWithoutOrganizationInput | UserUpsertWithWhereUniqueWithoutOrganizationInput[]
    createMany?: UserCreateManyOrganizationInputEnvelope
    set?: UserWhereUniqueInput | UserWhereUniqueInput[]
    disconnect?: UserWhereUniqueInput | UserWhereUniqueInput[]
    delete?: UserWhereUniqueInput | UserWhereUniqueInput[]
    connect?: UserWhereUniqueInput | UserWhereUniqueInput[]
    update?: UserUpdateWithWhereUniqueWithoutOrganizationInput | UserUpdateWithWhereUniqueWithoutOrganizationInput[]
    updateMany?: UserUpdateManyWithWhereWithoutOrganizationInput | UserUpdateManyWithWhereWithoutOrganizationInput[]
    deleteMany?: UserScalarWhereInput | UserScalarWhereInput[]
  }

  export type PostUpdateManyWithoutOrganizationNestedInput = {
    create?: XOR<PostCreateWithoutOrganizationInput, PostUncheckedCreateWithoutOrganizationInput> | PostCreateWithoutOrganizationInput[] | PostUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: PostCreateOrConnectWithoutOrganizationInput | PostCreateOrConnectWithoutOrganizationInput[]
    upsert?: PostUpsertWithWhereUniqueWithoutOrganizationInput | PostUpsertWithWhereUniqueWithoutOrganizationInput[]
    createMany?: PostCreateManyOrganizationInputEnvelope
    set?: PostWhereUniqueInput | PostWhereUniqueInput[]
    disconnect?: PostWhereUniqueInput | PostWhereUniqueInput[]
    delete?: PostWhereUniqueInput | PostWhereUniqueInput[]
    connect?: PostWhereUniqueInput | PostWhereUniqueInput[]
    update?: PostUpdateWithWhereUniqueWithoutOrganizationInput | PostUpdateWithWhereUniqueWithoutOrganizationInput[]
    updateMany?: PostUpdateManyWithWhereWithoutOrganizationInput | PostUpdateManyWithWhereWithoutOrganizationInput[]
    deleteMany?: PostScalarWhereInput | PostScalarWhereInput[]
  }

  export type TrendUpdateManyWithoutOrganizationNestedInput = {
    create?: XOR<TrendCreateWithoutOrganizationInput, TrendUncheckedCreateWithoutOrganizationInput> | TrendCreateWithoutOrganizationInput[] | TrendUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: TrendCreateOrConnectWithoutOrganizationInput | TrendCreateOrConnectWithoutOrganizationInput[]
    upsert?: TrendUpsertWithWhereUniqueWithoutOrganizationInput | TrendUpsertWithWhereUniqueWithoutOrganizationInput[]
    createMany?: TrendCreateManyOrganizationInputEnvelope
    set?: TrendWhereUniqueInput | TrendWhereUniqueInput[]
    disconnect?: TrendWhereUniqueInput | TrendWhereUniqueInput[]
    delete?: TrendWhereUniqueInput | TrendWhereUniqueInput[]
    connect?: TrendWhereUniqueInput | TrendWhereUniqueInput[]
    update?: TrendUpdateWithWhereUniqueWithoutOrganizationInput | TrendUpdateWithWhereUniqueWithoutOrganizationInput[]
    updateMany?: TrendUpdateManyWithWhereWithoutOrganizationInput | TrendUpdateManyWithWhereWithoutOrganizationInput[]
    deleteMany?: TrendScalarWhereInput | TrendScalarWhereInput[]
  }

  export type IngredientUpdateManyWithoutOrganizationNestedInput = {
    create?: XOR<IngredientCreateWithoutOrganizationInput, IngredientUncheckedCreateWithoutOrganizationInput> | IngredientCreateWithoutOrganizationInput[] | IngredientUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: IngredientCreateOrConnectWithoutOrganizationInput | IngredientCreateOrConnectWithoutOrganizationInput[]
    upsert?: IngredientUpsertWithWhereUniqueWithoutOrganizationInput | IngredientUpsertWithWhereUniqueWithoutOrganizationInput[]
    createMany?: IngredientCreateManyOrganizationInputEnvelope
    set?: IngredientWhereUniqueInput | IngredientWhereUniqueInput[]
    disconnect?: IngredientWhereUniqueInput | IngredientWhereUniqueInput[]
    delete?: IngredientWhereUniqueInput | IngredientWhereUniqueInput[]
    connect?: IngredientWhereUniqueInput | IngredientWhereUniqueInput[]
    update?: IngredientUpdateWithWhereUniqueWithoutOrganizationInput | IngredientUpdateWithWhereUniqueWithoutOrganizationInput[]
    updateMany?: IngredientUpdateManyWithWhereWithoutOrganizationInput | IngredientUpdateManyWithWhereWithoutOrganizationInput[]
    deleteMany?: IngredientScalarWhereInput | IngredientScalarWhereInput[]
  }

  export type AgentStrategyUpdateManyWithoutOrganizationNestedInput = {
    create?: XOR<AgentStrategyCreateWithoutOrganizationInput, AgentStrategyUncheckedCreateWithoutOrganizationInput> | AgentStrategyCreateWithoutOrganizationInput[] | AgentStrategyUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: AgentStrategyCreateOrConnectWithoutOrganizationInput | AgentStrategyCreateOrConnectWithoutOrganizationInput[]
    upsert?: AgentStrategyUpsertWithWhereUniqueWithoutOrganizationInput | AgentStrategyUpsertWithWhereUniqueWithoutOrganizationInput[]
    createMany?: AgentStrategyCreateManyOrganizationInputEnvelope
    set?: AgentStrategyWhereUniqueInput | AgentStrategyWhereUniqueInput[]
    disconnect?: AgentStrategyWhereUniqueInput | AgentStrategyWhereUniqueInput[]
    delete?: AgentStrategyWhereUniqueInput | AgentStrategyWhereUniqueInput[]
    connect?: AgentStrategyWhereUniqueInput | AgentStrategyWhereUniqueInput[]
    update?: AgentStrategyUpdateWithWhereUniqueWithoutOrganizationInput | AgentStrategyUpdateWithWhereUniqueWithoutOrganizationInput[]
    updateMany?: AgentStrategyUpdateManyWithWhereWithoutOrganizationInput | AgentStrategyUpdateManyWithWhereWithoutOrganizationInput[]
    deleteMany?: AgentStrategyScalarWhereInput | AgentStrategyScalarWhereInput[]
  }

  export type WorkflowUpdateManyWithoutOrganizationNestedInput = {
    create?: XOR<WorkflowCreateWithoutOrganizationInput, WorkflowUncheckedCreateWithoutOrganizationInput> | WorkflowCreateWithoutOrganizationInput[] | WorkflowUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: WorkflowCreateOrConnectWithoutOrganizationInput | WorkflowCreateOrConnectWithoutOrganizationInput[]
    upsert?: WorkflowUpsertWithWhereUniqueWithoutOrganizationInput | WorkflowUpsertWithWhereUniqueWithoutOrganizationInput[]
    createMany?: WorkflowCreateManyOrganizationInputEnvelope
    set?: WorkflowWhereUniqueInput | WorkflowWhereUniqueInput[]
    disconnect?: WorkflowWhereUniqueInput | WorkflowWhereUniqueInput[]
    delete?: WorkflowWhereUniqueInput | WorkflowWhereUniqueInput[]
    connect?: WorkflowWhereUniqueInput | WorkflowWhereUniqueInput[]
    update?: WorkflowUpdateWithWhereUniqueWithoutOrganizationInput | WorkflowUpdateWithWhereUniqueWithoutOrganizationInput[]
    updateMany?: WorkflowUpdateManyWithWhereWithoutOrganizationInput | WorkflowUpdateManyWithWhereWithoutOrganizationInput[]
    deleteMany?: WorkflowScalarWhereInput | WorkflowScalarWhereInput[]
  }

  export type UserUncheckedUpdateManyWithoutOrganizationNestedInput = {
    create?: XOR<UserCreateWithoutOrganizationInput, UserUncheckedCreateWithoutOrganizationInput> | UserCreateWithoutOrganizationInput[] | UserUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: UserCreateOrConnectWithoutOrganizationInput | UserCreateOrConnectWithoutOrganizationInput[]
    upsert?: UserUpsertWithWhereUniqueWithoutOrganizationInput | UserUpsertWithWhereUniqueWithoutOrganizationInput[]
    createMany?: UserCreateManyOrganizationInputEnvelope
    set?: UserWhereUniqueInput | UserWhereUniqueInput[]
    disconnect?: UserWhereUniqueInput | UserWhereUniqueInput[]
    delete?: UserWhereUniqueInput | UserWhereUniqueInput[]
    connect?: UserWhereUniqueInput | UserWhereUniqueInput[]
    update?: UserUpdateWithWhereUniqueWithoutOrganizationInput | UserUpdateWithWhereUniqueWithoutOrganizationInput[]
    updateMany?: UserUpdateManyWithWhereWithoutOrganizationInput | UserUpdateManyWithWhereWithoutOrganizationInput[]
    deleteMany?: UserScalarWhereInput | UserScalarWhereInput[]
  }

  export type PostUncheckedUpdateManyWithoutOrganizationNestedInput = {
    create?: XOR<PostCreateWithoutOrganizationInput, PostUncheckedCreateWithoutOrganizationInput> | PostCreateWithoutOrganizationInput[] | PostUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: PostCreateOrConnectWithoutOrganizationInput | PostCreateOrConnectWithoutOrganizationInput[]
    upsert?: PostUpsertWithWhereUniqueWithoutOrganizationInput | PostUpsertWithWhereUniqueWithoutOrganizationInput[]
    createMany?: PostCreateManyOrganizationInputEnvelope
    set?: PostWhereUniqueInput | PostWhereUniqueInput[]
    disconnect?: PostWhereUniqueInput | PostWhereUniqueInput[]
    delete?: PostWhereUniqueInput | PostWhereUniqueInput[]
    connect?: PostWhereUniqueInput | PostWhereUniqueInput[]
    update?: PostUpdateWithWhereUniqueWithoutOrganizationInput | PostUpdateWithWhereUniqueWithoutOrganizationInput[]
    updateMany?: PostUpdateManyWithWhereWithoutOrganizationInput | PostUpdateManyWithWhereWithoutOrganizationInput[]
    deleteMany?: PostScalarWhereInput | PostScalarWhereInput[]
  }

  export type TrendUncheckedUpdateManyWithoutOrganizationNestedInput = {
    create?: XOR<TrendCreateWithoutOrganizationInput, TrendUncheckedCreateWithoutOrganizationInput> | TrendCreateWithoutOrganizationInput[] | TrendUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: TrendCreateOrConnectWithoutOrganizationInput | TrendCreateOrConnectWithoutOrganizationInput[]
    upsert?: TrendUpsertWithWhereUniqueWithoutOrganizationInput | TrendUpsertWithWhereUniqueWithoutOrganizationInput[]
    createMany?: TrendCreateManyOrganizationInputEnvelope
    set?: TrendWhereUniqueInput | TrendWhereUniqueInput[]
    disconnect?: TrendWhereUniqueInput | TrendWhereUniqueInput[]
    delete?: TrendWhereUniqueInput | TrendWhereUniqueInput[]
    connect?: TrendWhereUniqueInput | TrendWhereUniqueInput[]
    update?: TrendUpdateWithWhereUniqueWithoutOrganizationInput | TrendUpdateWithWhereUniqueWithoutOrganizationInput[]
    updateMany?: TrendUpdateManyWithWhereWithoutOrganizationInput | TrendUpdateManyWithWhereWithoutOrganizationInput[]
    deleteMany?: TrendScalarWhereInput | TrendScalarWhereInput[]
  }

  export type IngredientUncheckedUpdateManyWithoutOrganizationNestedInput = {
    create?: XOR<IngredientCreateWithoutOrganizationInput, IngredientUncheckedCreateWithoutOrganizationInput> | IngredientCreateWithoutOrganizationInput[] | IngredientUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: IngredientCreateOrConnectWithoutOrganizationInput | IngredientCreateOrConnectWithoutOrganizationInput[]
    upsert?: IngredientUpsertWithWhereUniqueWithoutOrganizationInput | IngredientUpsertWithWhereUniqueWithoutOrganizationInput[]
    createMany?: IngredientCreateManyOrganizationInputEnvelope
    set?: IngredientWhereUniqueInput | IngredientWhereUniqueInput[]
    disconnect?: IngredientWhereUniqueInput | IngredientWhereUniqueInput[]
    delete?: IngredientWhereUniqueInput | IngredientWhereUniqueInput[]
    connect?: IngredientWhereUniqueInput | IngredientWhereUniqueInput[]
    update?: IngredientUpdateWithWhereUniqueWithoutOrganizationInput | IngredientUpdateWithWhereUniqueWithoutOrganizationInput[]
    updateMany?: IngredientUpdateManyWithWhereWithoutOrganizationInput | IngredientUpdateManyWithWhereWithoutOrganizationInput[]
    deleteMany?: IngredientScalarWhereInput | IngredientScalarWhereInput[]
  }

  export type AgentStrategyUncheckedUpdateManyWithoutOrganizationNestedInput = {
    create?: XOR<AgentStrategyCreateWithoutOrganizationInput, AgentStrategyUncheckedCreateWithoutOrganizationInput> | AgentStrategyCreateWithoutOrganizationInput[] | AgentStrategyUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: AgentStrategyCreateOrConnectWithoutOrganizationInput | AgentStrategyCreateOrConnectWithoutOrganizationInput[]
    upsert?: AgentStrategyUpsertWithWhereUniqueWithoutOrganizationInput | AgentStrategyUpsertWithWhereUniqueWithoutOrganizationInput[]
    createMany?: AgentStrategyCreateManyOrganizationInputEnvelope
    set?: AgentStrategyWhereUniqueInput | AgentStrategyWhereUniqueInput[]
    disconnect?: AgentStrategyWhereUniqueInput | AgentStrategyWhereUniqueInput[]
    delete?: AgentStrategyWhereUniqueInput | AgentStrategyWhereUniqueInput[]
    connect?: AgentStrategyWhereUniqueInput | AgentStrategyWhereUniqueInput[]
    update?: AgentStrategyUpdateWithWhereUniqueWithoutOrganizationInput | AgentStrategyUpdateWithWhereUniqueWithoutOrganizationInput[]
    updateMany?: AgentStrategyUpdateManyWithWhereWithoutOrganizationInput | AgentStrategyUpdateManyWithWhereWithoutOrganizationInput[]
    deleteMany?: AgentStrategyScalarWhereInput | AgentStrategyScalarWhereInput[]
  }

  export type WorkflowUncheckedUpdateManyWithoutOrganizationNestedInput = {
    create?: XOR<WorkflowCreateWithoutOrganizationInput, WorkflowUncheckedCreateWithoutOrganizationInput> | WorkflowCreateWithoutOrganizationInput[] | WorkflowUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: WorkflowCreateOrConnectWithoutOrganizationInput | WorkflowCreateOrConnectWithoutOrganizationInput[]
    upsert?: WorkflowUpsertWithWhereUniqueWithoutOrganizationInput | WorkflowUpsertWithWhereUniqueWithoutOrganizationInput[]
    createMany?: WorkflowCreateManyOrganizationInputEnvelope
    set?: WorkflowWhereUniqueInput | WorkflowWhereUniqueInput[]
    disconnect?: WorkflowWhereUniqueInput | WorkflowWhereUniqueInput[]
    delete?: WorkflowWhereUniqueInput | WorkflowWhereUniqueInput[]
    connect?: WorkflowWhereUniqueInput | WorkflowWhereUniqueInput[]
    update?: WorkflowUpdateWithWhereUniqueWithoutOrganizationInput | WorkflowUpdateWithWhereUniqueWithoutOrganizationInput[]
    updateMany?: WorkflowUpdateManyWithWhereWithoutOrganizationInput | WorkflowUpdateManyWithWhereWithoutOrganizationInput[]
    deleteMany?: WorkflowScalarWhereInput | WorkflowScalarWhereInput[]
  }

  export type OrganizationCreateNestedOneWithoutPostsInput = {
    create?: XOR<OrganizationCreateWithoutPostsInput, OrganizationUncheckedCreateWithoutPostsInput>
    connectOrCreate?: OrganizationCreateOrConnectWithoutPostsInput
    connect?: OrganizationWhereUniqueInput
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type OrganizationUpdateOneRequiredWithoutPostsNestedInput = {
    create?: XOR<OrganizationCreateWithoutPostsInput, OrganizationUncheckedCreateWithoutPostsInput>
    connectOrCreate?: OrganizationCreateOrConnectWithoutPostsInput
    upsert?: OrganizationUpsertWithoutPostsInput
    connect?: OrganizationWhereUniqueInput
    update?: XOR<XOR<OrganizationUpdateToOneWithWhereWithoutPostsInput, OrganizationUpdateWithoutPostsInput>, OrganizationUncheckedUpdateWithoutPostsInput>
  }

  export type OrganizationCreateNestedOneWithoutIngredientsInput = {
    create?: XOR<OrganizationCreateWithoutIngredientsInput, OrganizationUncheckedCreateWithoutIngredientsInput>
    connectOrCreate?: OrganizationCreateOrConnectWithoutIngredientsInput
    connect?: OrganizationWhereUniqueInput
  }

  export type OrganizationUpdateOneRequiredWithoutIngredientsNestedInput = {
    create?: XOR<OrganizationCreateWithoutIngredientsInput, OrganizationUncheckedCreateWithoutIngredientsInput>
    connectOrCreate?: OrganizationCreateOrConnectWithoutIngredientsInput
    upsert?: OrganizationUpsertWithoutIngredientsInput
    connect?: OrganizationWhereUniqueInput
    update?: XOR<XOR<OrganizationUpdateToOneWithWhereWithoutIngredientsInput, OrganizationUpdateWithoutIngredientsInput>, OrganizationUncheckedUpdateWithoutIngredientsInput>
  }

  export type OrganizationCreateNestedOneWithoutTrendsInput = {
    create?: XOR<OrganizationCreateWithoutTrendsInput, OrganizationUncheckedCreateWithoutTrendsInput>
    connectOrCreate?: OrganizationCreateOrConnectWithoutTrendsInput
    connect?: OrganizationWhereUniqueInput
  }

  export type OrganizationUpdateOneRequiredWithoutTrendsNestedInput = {
    create?: XOR<OrganizationCreateWithoutTrendsInput, OrganizationUncheckedCreateWithoutTrendsInput>
    connectOrCreate?: OrganizationCreateOrConnectWithoutTrendsInput
    upsert?: OrganizationUpsertWithoutTrendsInput
    connect?: OrganizationWhereUniqueInput
    update?: XOR<XOR<OrganizationUpdateToOneWithWhereWithoutTrendsInput, OrganizationUpdateWithoutTrendsInput>, OrganizationUncheckedUpdateWithoutTrendsInput>
  }

  export type OrganizationCreateNestedOneWithoutAgentStrategiesInput = {
    create?: XOR<OrganizationCreateWithoutAgentStrategiesInput, OrganizationUncheckedCreateWithoutAgentStrategiesInput>
    connectOrCreate?: OrganizationCreateOrConnectWithoutAgentStrategiesInput
    connect?: OrganizationWhereUniqueInput
  }

  export type WorkflowExecutionCreateNestedManyWithoutAgentStrategyInput = {
    create?: XOR<WorkflowExecutionCreateWithoutAgentStrategyInput, WorkflowExecutionUncheckedCreateWithoutAgentStrategyInput> | WorkflowExecutionCreateWithoutAgentStrategyInput[] | WorkflowExecutionUncheckedCreateWithoutAgentStrategyInput[]
    connectOrCreate?: WorkflowExecutionCreateOrConnectWithoutAgentStrategyInput | WorkflowExecutionCreateOrConnectWithoutAgentStrategyInput[]
    createMany?: WorkflowExecutionCreateManyAgentStrategyInputEnvelope
    connect?: WorkflowExecutionWhereUniqueInput | WorkflowExecutionWhereUniqueInput[]
  }

  export type WorkflowExecutionUncheckedCreateNestedManyWithoutAgentStrategyInput = {
    create?: XOR<WorkflowExecutionCreateWithoutAgentStrategyInput, WorkflowExecutionUncheckedCreateWithoutAgentStrategyInput> | WorkflowExecutionCreateWithoutAgentStrategyInput[] | WorkflowExecutionUncheckedCreateWithoutAgentStrategyInput[]
    connectOrCreate?: WorkflowExecutionCreateOrConnectWithoutAgentStrategyInput | WorkflowExecutionCreateOrConnectWithoutAgentStrategyInput[]
    createMany?: WorkflowExecutionCreateManyAgentStrategyInputEnvelope
    connect?: WorkflowExecutionWhereUniqueInput | WorkflowExecutionWhereUniqueInput[]
  }

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean
  }

  export type OrganizationUpdateOneRequiredWithoutAgentStrategiesNestedInput = {
    create?: XOR<OrganizationCreateWithoutAgentStrategiesInput, OrganizationUncheckedCreateWithoutAgentStrategiesInput>
    connectOrCreate?: OrganizationCreateOrConnectWithoutAgentStrategiesInput
    upsert?: OrganizationUpsertWithoutAgentStrategiesInput
    connect?: OrganizationWhereUniqueInput
    update?: XOR<XOR<OrganizationUpdateToOneWithWhereWithoutAgentStrategiesInput, OrganizationUpdateWithoutAgentStrategiesInput>, OrganizationUncheckedUpdateWithoutAgentStrategiesInput>
  }

  export type WorkflowExecutionUpdateManyWithoutAgentStrategyNestedInput = {
    create?: XOR<WorkflowExecutionCreateWithoutAgentStrategyInput, WorkflowExecutionUncheckedCreateWithoutAgentStrategyInput> | WorkflowExecutionCreateWithoutAgentStrategyInput[] | WorkflowExecutionUncheckedCreateWithoutAgentStrategyInput[]
    connectOrCreate?: WorkflowExecutionCreateOrConnectWithoutAgentStrategyInput | WorkflowExecutionCreateOrConnectWithoutAgentStrategyInput[]
    upsert?: WorkflowExecutionUpsertWithWhereUniqueWithoutAgentStrategyInput | WorkflowExecutionUpsertWithWhereUniqueWithoutAgentStrategyInput[]
    createMany?: WorkflowExecutionCreateManyAgentStrategyInputEnvelope
    set?: WorkflowExecutionWhereUniqueInput | WorkflowExecutionWhereUniqueInput[]
    disconnect?: WorkflowExecutionWhereUniqueInput | WorkflowExecutionWhereUniqueInput[]
    delete?: WorkflowExecutionWhereUniqueInput | WorkflowExecutionWhereUniqueInput[]
    connect?: WorkflowExecutionWhereUniqueInput | WorkflowExecutionWhereUniqueInput[]
    update?: WorkflowExecutionUpdateWithWhereUniqueWithoutAgentStrategyInput | WorkflowExecutionUpdateWithWhereUniqueWithoutAgentStrategyInput[]
    updateMany?: WorkflowExecutionUpdateManyWithWhereWithoutAgentStrategyInput | WorkflowExecutionUpdateManyWithWhereWithoutAgentStrategyInput[]
    deleteMany?: WorkflowExecutionScalarWhereInput | WorkflowExecutionScalarWhereInput[]
  }

  export type WorkflowExecutionUncheckedUpdateManyWithoutAgentStrategyNestedInput = {
    create?: XOR<WorkflowExecutionCreateWithoutAgentStrategyInput, WorkflowExecutionUncheckedCreateWithoutAgentStrategyInput> | WorkflowExecutionCreateWithoutAgentStrategyInput[] | WorkflowExecutionUncheckedCreateWithoutAgentStrategyInput[]
    connectOrCreate?: WorkflowExecutionCreateOrConnectWithoutAgentStrategyInput | WorkflowExecutionCreateOrConnectWithoutAgentStrategyInput[]
    upsert?: WorkflowExecutionUpsertWithWhereUniqueWithoutAgentStrategyInput | WorkflowExecutionUpsertWithWhereUniqueWithoutAgentStrategyInput[]
    createMany?: WorkflowExecutionCreateManyAgentStrategyInputEnvelope
    set?: WorkflowExecutionWhereUniqueInput | WorkflowExecutionWhereUniqueInput[]
    disconnect?: WorkflowExecutionWhereUniqueInput | WorkflowExecutionWhereUniqueInput[]
    delete?: WorkflowExecutionWhereUniqueInput | WorkflowExecutionWhereUniqueInput[]
    connect?: WorkflowExecutionWhereUniqueInput | WorkflowExecutionWhereUniqueInput[]
    update?: WorkflowExecutionUpdateWithWhereUniqueWithoutAgentStrategyInput | WorkflowExecutionUpdateWithWhereUniqueWithoutAgentStrategyInput[]
    updateMany?: WorkflowExecutionUpdateManyWithWhereWithoutAgentStrategyInput | WorkflowExecutionUpdateManyWithWhereWithoutAgentStrategyInput[]
    deleteMany?: WorkflowExecutionScalarWhereInput | WorkflowExecutionScalarWhereInput[]
  }

  export type OrganizationCreateNestedOneWithoutWorkflowsInput = {
    create?: XOR<OrganizationCreateWithoutWorkflowsInput, OrganizationUncheckedCreateWithoutWorkflowsInput>
    connectOrCreate?: OrganizationCreateOrConnectWithoutWorkflowsInput
    connect?: OrganizationWhereUniqueInput
  }

  export type WorkflowExecutionCreateNestedManyWithoutWorkflowInput = {
    create?: XOR<WorkflowExecutionCreateWithoutWorkflowInput, WorkflowExecutionUncheckedCreateWithoutWorkflowInput> | WorkflowExecutionCreateWithoutWorkflowInput[] | WorkflowExecutionUncheckedCreateWithoutWorkflowInput[]
    connectOrCreate?: WorkflowExecutionCreateOrConnectWithoutWorkflowInput | WorkflowExecutionCreateOrConnectWithoutWorkflowInput[]
    createMany?: WorkflowExecutionCreateManyWorkflowInputEnvelope
    connect?: WorkflowExecutionWhereUniqueInput | WorkflowExecutionWhereUniqueInput[]
  }

  export type WorkflowExecutionUncheckedCreateNestedManyWithoutWorkflowInput = {
    create?: XOR<WorkflowExecutionCreateWithoutWorkflowInput, WorkflowExecutionUncheckedCreateWithoutWorkflowInput> | WorkflowExecutionCreateWithoutWorkflowInput[] | WorkflowExecutionUncheckedCreateWithoutWorkflowInput[]
    connectOrCreate?: WorkflowExecutionCreateOrConnectWithoutWorkflowInput | WorkflowExecutionCreateOrConnectWithoutWorkflowInput[]
    createMany?: WorkflowExecutionCreateManyWorkflowInputEnvelope
    connect?: WorkflowExecutionWhereUniqueInput | WorkflowExecutionWhereUniqueInput[]
  }

  export type OrganizationUpdateOneRequiredWithoutWorkflowsNestedInput = {
    create?: XOR<OrganizationCreateWithoutWorkflowsInput, OrganizationUncheckedCreateWithoutWorkflowsInput>
    connectOrCreate?: OrganizationCreateOrConnectWithoutWorkflowsInput
    upsert?: OrganizationUpsertWithoutWorkflowsInput
    connect?: OrganizationWhereUniqueInput
    update?: XOR<XOR<OrganizationUpdateToOneWithWhereWithoutWorkflowsInput, OrganizationUpdateWithoutWorkflowsInput>, OrganizationUncheckedUpdateWithoutWorkflowsInput>
  }

  export type WorkflowExecutionUpdateManyWithoutWorkflowNestedInput = {
    create?: XOR<WorkflowExecutionCreateWithoutWorkflowInput, WorkflowExecutionUncheckedCreateWithoutWorkflowInput> | WorkflowExecutionCreateWithoutWorkflowInput[] | WorkflowExecutionUncheckedCreateWithoutWorkflowInput[]
    connectOrCreate?: WorkflowExecutionCreateOrConnectWithoutWorkflowInput | WorkflowExecutionCreateOrConnectWithoutWorkflowInput[]
    upsert?: WorkflowExecutionUpsertWithWhereUniqueWithoutWorkflowInput | WorkflowExecutionUpsertWithWhereUniqueWithoutWorkflowInput[]
    createMany?: WorkflowExecutionCreateManyWorkflowInputEnvelope
    set?: WorkflowExecutionWhereUniqueInput | WorkflowExecutionWhereUniqueInput[]
    disconnect?: WorkflowExecutionWhereUniqueInput | WorkflowExecutionWhereUniqueInput[]
    delete?: WorkflowExecutionWhereUniqueInput | WorkflowExecutionWhereUniqueInput[]
    connect?: WorkflowExecutionWhereUniqueInput | WorkflowExecutionWhereUniqueInput[]
    update?: WorkflowExecutionUpdateWithWhereUniqueWithoutWorkflowInput | WorkflowExecutionUpdateWithWhereUniqueWithoutWorkflowInput[]
    updateMany?: WorkflowExecutionUpdateManyWithWhereWithoutWorkflowInput | WorkflowExecutionUpdateManyWithWhereWithoutWorkflowInput[]
    deleteMany?: WorkflowExecutionScalarWhereInput | WorkflowExecutionScalarWhereInput[]
  }

  export type WorkflowExecutionUncheckedUpdateManyWithoutWorkflowNestedInput = {
    create?: XOR<WorkflowExecutionCreateWithoutWorkflowInput, WorkflowExecutionUncheckedCreateWithoutWorkflowInput> | WorkflowExecutionCreateWithoutWorkflowInput[] | WorkflowExecutionUncheckedCreateWithoutWorkflowInput[]
    connectOrCreate?: WorkflowExecutionCreateOrConnectWithoutWorkflowInput | WorkflowExecutionCreateOrConnectWithoutWorkflowInput[]
    upsert?: WorkflowExecutionUpsertWithWhereUniqueWithoutWorkflowInput | WorkflowExecutionUpsertWithWhereUniqueWithoutWorkflowInput[]
    createMany?: WorkflowExecutionCreateManyWorkflowInputEnvelope
    set?: WorkflowExecutionWhereUniqueInput | WorkflowExecutionWhereUniqueInput[]
    disconnect?: WorkflowExecutionWhereUniqueInput | WorkflowExecutionWhereUniqueInput[]
    delete?: WorkflowExecutionWhereUniqueInput | WorkflowExecutionWhereUniqueInput[]
    connect?: WorkflowExecutionWhereUniqueInput | WorkflowExecutionWhereUniqueInput[]
    update?: WorkflowExecutionUpdateWithWhereUniqueWithoutWorkflowInput | WorkflowExecutionUpdateWithWhereUniqueWithoutWorkflowInput[]
    updateMany?: WorkflowExecutionUpdateManyWithWhereWithoutWorkflowInput | WorkflowExecutionUpdateManyWithWhereWithoutWorkflowInput[]
    deleteMany?: WorkflowExecutionScalarWhereInput | WorkflowExecutionScalarWhereInput[]
  }

  export type WorkflowCreateNestedOneWithoutExecutionsInput = {
    create?: XOR<WorkflowCreateWithoutExecutionsInput, WorkflowUncheckedCreateWithoutExecutionsInput>
    connectOrCreate?: WorkflowCreateOrConnectWithoutExecutionsInput
    connect?: WorkflowWhereUniqueInput
  }

  export type AgentStrategyCreateNestedOneWithoutWorkflowsInput = {
    create?: XOR<AgentStrategyCreateWithoutWorkflowsInput, AgentStrategyUncheckedCreateWithoutWorkflowsInput>
    connectOrCreate?: AgentStrategyCreateOrConnectWithoutWorkflowsInput
    connect?: AgentStrategyWhereUniqueInput
  }

  export type WorkflowUpdateOneRequiredWithoutExecutionsNestedInput = {
    create?: XOR<WorkflowCreateWithoutExecutionsInput, WorkflowUncheckedCreateWithoutExecutionsInput>
    connectOrCreate?: WorkflowCreateOrConnectWithoutExecutionsInput
    upsert?: WorkflowUpsertWithoutExecutionsInput
    connect?: WorkflowWhereUniqueInput
    update?: XOR<XOR<WorkflowUpdateToOneWithWhereWithoutExecutionsInput, WorkflowUpdateWithoutExecutionsInput>, WorkflowUncheckedUpdateWithoutExecutionsInput>
  }

  export type AgentStrategyUpdateOneWithoutWorkflowsNestedInput = {
    create?: XOR<AgentStrategyCreateWithoutWorkflowsInput, AgentStrategyUncheckedCreateWithoutWorkflowsInput>
    connectOrCreate?: AgentStrategyCreateOrConnectWithoutWorkflowsInput
    upsert?: AgentStrategyUpsertWithoutWorkflowsInput
    disconnect?: AgentStrategyWhereInput | boolean
    delete?: AgentStrategyWhereInput | boolean
    connect?: AgentStrategyWhereUniqueInput
    update?: XOR<XOR<AgentStrategyUpdateToOneWithWhereWithoutWorkflowsInput, AgentStrategyUpdateWithoutWorkflowsInput>, AgentStrategyUncheckedUpdateWithoutWorkflowsInput>
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type OrganizationCreateWithoutUsersInput = {
    id: string
    name: string
    slug: string
    createdAt: string
    updatedAt: string
    posts?: PostCreateNestedManyWithoutOrganizationInput
    trends?: TrendCreateNestedManyWithoutOrganizationInput
    ingredients?: IngredientCreateNestedManyWithoutOrganizationInput
    agentStrategies?: AgentStrategyCreateNestedManyWithoutOrganizationInput
    workflows?: WorkflowCreateNestedManyWithoutOrganizationInput
  }

  export type OrganizationUncheckedCreateWithoutUsersInput = {
    id: string
    name: string
    slug: string
    createdAt: string
    updatedAt: string
    posts?: PostUncheckedCreateNestedManyWithoutOrganizationInput
    trends?: TrendUncheckedCreateNestedManyWithoutOrganizationInput
    ingredients?: IngredientUncheckedCreateNestedManyWithoutOrganizationInput
    agentStrategies?: AgentStrategyUncheckedCreateNestedManyWithoutOrganizationInput
    workflows?: WorkflowUncheckedCreateNestedManyWithoutOrganizationInput
  }

  export type OrganizationCreateOrConnectWithoutUsersInput = {
    where: OrganizationWhereUniqueInput
    create: XOR<OrganizationCreateWithoutUsersInput, OrganizationUncheckedCreateWithoutUsersInput>
  }

  export type OrganizationUpsertWithoutUsersInput = {
    update: XOR<OrganizationUpdateWithoutUsersInput, OrganizationUncheckedUpdateWithoutUsersInput>
    create: XOR<OrganizationCreateWithoutUsersInput, OrganizationUncheckedCreateWithoutUsersInput>
    where?: OrganizationWhereInput
  }

  export type OrganizationUpdateToOneWithWhereWithoutUsersInput = {
    where?: OrganizationWhereInput
    data: XOR<OrganizationUpdateWithoutUsersInput, OrganizationUncheckedUpdateWithoutUsersInput>
  }

  export type OrganizationUpdateWithoutUsersInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    posts?: PostUpdateManyWithoutOrganizationNestedInput
    trends?: TrendUpdateManyWithoutOrganizationNestedInput
    ingredients?: IngredientUpdateManyWithoutOrganizationNestedInput
    agentStrategies?: AgentStrategyUpdateManyWithoutOrganizationNestedInput
    workflows?: WorkflowUpdateManyWithoutOrganizationNestedInput
  }

  export type OrganizationUncheckedUpdateWithoutUsersInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    posts?: PostUncheckedUpdateManyWithoutOrganizationNestedInput
    trends?: TrendUncheckedUpdateManyWithoutOrganizationNestedInput
    ingredients?: IngredientUncheckedUpdateManyWithoutOrganizationNestedInput
    agentStrategies?: AgentStrategyUncheckedUpdateManyWithoutOrganizationNestedInput
    workflows?: WorkflowUncheckedUpdateManyWithoutOrganizationNestedInput
  }

  export type UserCreateWithoutOrganizationInput = {
    id: string
    clerkId?: string | null
    email?: string | null
    name: string
    createdAt: string
    updatedAt: string
  }

  export type UserUncheckedCreateWithoutOrganizationInput = {
    id: string
    clerkId?: string | null
    email?: string | null
    name: string
    createdAt: string
    updatedAt: string
  }

  export type UserCreateOrConnectWithoutOrganizationInput = {
    where: UserWhereUniqueInput
    create: XOR<UserCreateWithoutOrganizationInput, UserUncheckedCreateWithoutOrganizationInput>
  }

  export type UserCreateManyOrganizationInputEnvelope = {
    data: UserCreateManyOrganizationInput | UserCreateManyOrganizationInput[]
    skipDuplicates?: boolean
  }

  export type PostCreateWithoutOrganizationInput = {
    id: string
    workspaceId?: string | null
    platform: string
    type: string
    prompt: string
    content: string
    status: string
    publishIntent?: string | null
    sourceDraftId?: string | null
    sourceTrendId?: string | null
    sourceTrendTopic?: string | null
    publishedAt?: string | null
    views?: number
    engagements?: number
    createdAt: string
    updatedAt: string
  }

  export type PostUncheckedCreateWithoutOrganizationInput = {
    id: string
    workspaceId?: string | null
    platform: string
    type: string
    prompt: string
    content: string
    status: string
    publishIntent?: string | null
    sourceDraftId?: string | null
    sourceTrendId?: string | null
    sourceTrendTopic?: string | null
    publishedAt?: string | null
    views?: number
    engagements?: number
    createdAt: string
    updatedAt: string
  }

  export type PostCreateOrConnectWithoutOrganizationInput = {
    where: PostWhereUniqueInput
    create: XOR<PostCreateWithoutOrganizationInput, PostUncheckedCreateWithoutOrganizationInput>
  }

  export type PostCreateManyOrganizationInputEnvelope = {
    data: PostCreateManyOrganizationInput | PostCreateManyOrganizationInput[]
    skipDuplicates?: boolean
  }

  export type TrendCreateWithoutOrganizationInput = {
    id: string
    platform: string
    topic: string
    summary?: string | null
    viralityScore: number
    engagementScore: number
    createdAt: string
  }

  export type TrendUncheckedCreateWithoutOrganizationInput = {
    id: string
    platform: string
    topic: string
    summary?: string | null
    viralityScore: number
    engagementScore: number
    createdAt: string
  }

  export type TrendCreateOrConnectWithoutOrganizationInput = {
    where: TrendWhereUniqueInput
    create: XOR<TrendCreateWithoutOrganizationInput, TrendUncheckedCreateWithoutOrganizationInput>
  }

  export type TrendCreateManyOrganizationInputEnvelope = {
    data: TrendCreateManyOrganizationInput | TrendCreateManyOrganizationInput[]
    skipDuplicates?: boolean
  }

  export type IngredientCreateWithoutOrganizationInput = {
    id: string
    title: string
    content: string
    platform?: string | null
    totalVotes?: number
    sourcePostId?: string | null
    createdAt: string
    updatedAt: string
  }

  export type IngredientUncheckedCreateWithoutOrganizationInput = {
    id: string
    title: string
    content: string
    platform?: string | null
    totalVotes?: number
    sourcePostId?: string | null
    createdAt: string
    updatedAt: string
  }

  export type IngredientCreateOrConnectWithoutOrganizationInput = {
    where: IngredientWhereUniqueInput
    create: XOR<IngredientCreateWithoutOrganizationInput, IngredientUncheckedCreateWithoutOrganizationInput>
  }

  export type IngredientCreateManyOrganizationInputEnvelope = {
    data: IngredientCreateManyOrganizationInput | IngredientCreateManyOrganizationInput[]
    skipDuplicates?: boolean
  }

  export type AgentStrategyCreateWithoutOrganizationInput = {
    id: string
    name: string
    avatar?: string | null
    platformsJson?: string
    status: string
    isActive?: boolean
    lastRunAt?: string | null
    createdAt: string
    updatedAt: string
    workflows?: WorkflowExecutionCreateNestedManyWithoutAgentStrategyInput
  }

  export type AgentStrategyUncheckedCreateWithoutOrganizationInput = {
    id: string
    name: string
    avatar?: string | null
    platformsJson?: string
    status: string
    isActive?: boolean
    lastRunAt?: string | null
    createdAt: string
    updatedAt: string
    workflows?: WorkflowExecutionUncheckedCreateNestedManyWithoutAgentStrategyInput
  }

  export type AgentStrategyCreateOrConnectWithoutOrganizationInput = {
    where: AgentStrategyWhereUniqueInput
    create: XOR<AgentStrategyCreateWithoutOrganizationInput, AgentStrategyUncheckedCreateWithoutOrganizationInput>
  }

  export type AgentStrategyCreateManyOrganizationInputEnvelope = {
    data: AgentStrategyCreateManyOrganizationInput | AgentStrategyCreateManyOrganizationInput[]
    skipDuplicates?: boolean
  }

  export type WorkflowCreateWithoutOrganizationInput = {
    id: string
    name: string
    description?: string | null
    lifecycle: string
    nodeCount: number
    supportsBatch?: boolean
    lastExecutedAt?: string | null
    createdAt: string
    updatedAt: string
    executions?: WorkflowExecutionCreateNestedManyWithoutWorkflowInput
  }

  export type WorkflowUncheckedCreateWithoutOrganizationInput = {
    id: string
    name: string
    description?: string | null
    lifecycle: string
    nodeCount: number
    supportsBatch?: boolean
    lastExecutedAt?: string | null
    createdAt: string
    updatedAt: string
    executions?: WorkflowExecutionUncheckedCreateNestedManyWithoutWorkflowInput
  }

  export type WorkflowCreateOrConnectWithoutOrganizationInput = {
    where: WorkflowWhereUniqueInput
    create: XOR<WorkflowCreateWithoutOrganizationInput, WorkflowUncheckedCreateWithoutOrganizationInput>
  }

  export type WorkflowCreateManyOrganizationInputEnvelope = {
    data: WorkflowCreateManyOrganizationInput | WorkflowCreateManyOrganizationInput[]
    skipDuplicates?: boolean
  }

  export type UserUpsertWithWhereUniqueWithoutOrganizationInput = {
    where: UserWhereUniqueInput
    update: XOR<UserUpdateWithoutOrganizationInput, UserUncheckedUpdateWithoutOrganizationInput>
    create: XOR<UserCreateWithoutOrganizationInput, UserUncheckedCreateWithoutOrganizationInput>
  }

  export type UserUpdateWithWhereUniqueWithoutOrganizationInput = {
    where: UserWhereUniqueInput
    data: XOR<UserUpdateWithoutOrganizationInput, UserUncheckedUpdateWithoutOrganizationInput>
  }

  export type UserUpdateManyWithWhereWithoutOrganizationInput = {
    where: UserScalarWhereInput
    data: XOR<UserUpdateManyMutationInput, UserUncheckedUpdateManyWithoutOrganizationInput>
  }

  export type UserScalarWhereInput = {
    AND?: UserScalarWhereInput | UserScalarWhereInput[]
    OR?: UserScalarWhereInput[]
    NOT?: UserScalarWhereInput | UserScalarWhereInput[]
    id?: StringFilter<"User"> | string
    organizationId?: StringFilter<"User"> | string
    clerkId?: StringNullableFilter<"User"> | string | null
    email?: StringNullableFilter<"User"> | string | null
    name?: StringFilter<"User"> | string
    createdAt?: StringFilter<"User"> | string
    updatedAt?: StringFilter<"User"> | string
  }

  export type PostUpsertWithWhereUniqueWithoutOrganizationInput = {
    where: PostWhereUniqueInput
    update: XOR<PostUpdateWithoutOrganizationInput, PostUncheckedUpdateWithoutOrganizationInput>
    create: XOR<PostCreateWithoutOrganizationInput, PostUncheckedCreateWithoutOrganizationInput>
  }

  export type PostUpdateWithWhereUniqueWithoutOrganizationInput = {
    where: PostWhereUniqueInput
    data: XOR<PostUpdateWithoutOrganizationInput, PostUncheckedUpdateWithoutOrganizationInput>
  }

  export type PostUpdateManyWithWhereWithoutOrganizationInput = {
    where: PostScalarWhereInput
    data: XOR<PostUpdateManyMutationInput, PostUncheckedUpdateManyWithoutOrganizationInput>
  }

  export type PostScalarWhereInput = {
    AND?: PostScalarWhereInput | PostScalarWhereInput[]
    OR?: PostScalarWhereInput[]
    NOT?: PostScalarWhereInput | PostScalarWhereInput[]
    id?: StringFilter<"Post"> | string
    organizationId?: StringFilter<"Post"> | string
    workspaceId?: StringNullableFilter<"Post"> | string | null
    platform?: StringFilter<"Post"> | string
    type?: StringFilter<"Post"> | string
    prompt?: StringFilter<"Post"> | string
    content?: StringFilter<"Post"> | string
    status?: StringFilter<"Post"> | string
    publishIntent?: StringNullableFilter<"Post"> | string | null
    sourceDraftId?: StringNullableFilter<"Post"> | string | null
    sourceTrendId?: StringNullableFilter<"Post"> | string | null
    sourceTrendTopic?: StringNullableFilter<"Post"> | string | null
    publishedAt?: StringNullableFilter<"Post"> | string | null
    views?: IntFilter<"Post"> | number
    engagements?: IntFilter<"Post"> | number
    createdAt?: StringFilter<"Post"> | string
    updatedAt?: StringFilter<"Post"> | string
  }

  export type TrendUpsertWithWhereUniqueWithoutOrganizationInput = {
    where: TrendWhereUniqueInput
    update: XOR<TrendUpdateWithoutOrganizationInput, TrendUncheckedUpdateWithoutOrganizationInput>
    create: XOR<TrendCreateWithoutOrganizationInput, TrendUncheckedCreateWithoutOrganizationInput>
  }

  export type TrendUpdateWithWhereUniqueWithoutOrganizationInput = {
    where: TrendWhereUniqueInput
    data: XOR<TrendUpdateWithoutOrganizationInput, TrendUncheckedUpdateWithoutOrganizationInput>
  }

  export type TrendUpdateManyWithWhereWithoutOrganizationInput = {
    where: TrendScalarWhereInput
    data: XOR<TrendUpdateManyMutationInput, TrendUncheckedUpdateManyWithoutOrganizationInput>
  }

  export type TrendScalarWhereInput = {
    AND?: TrendScalarWhereInput | TrendScalarWhereInput[]
    OR?: TrendScalarWhereInput[]
    NOT?: TrendScalarWhereInput | TrendScalarWhereInput[]
    id?: StringFilter<"Trend"> | string
    organizationId?: StringFilter<"Trend"> | string
    platform?: StringFilter<"Trend"> | string
    topic?: StringFilter<"Trend"> | string
    summary?: StringNullableFilter<"Trend"> | string | null
    viralityScore?: IntFilter<"Trend"> | number
    engagementScore?: IntFilter<"Trend"> | number
    createdAt?: StringFilter<"Trend"> | string
  }

  export type IngredientUpsertWithWhereUniqueWithoutOrganizationInput = {
    where: IngredientWhereUniqueInput
    update: XOR<IngredientUpdateWithoutOrganizationInput, IngredientUncheckedUpdateWithoutOrganizationInput>
    create: XOR<IngredientCreateWithoutOrganizationInput, IngredientUncheckedCreateWithoutOrganizationInput>
  }

  export type IngredientUpdateWithWhereUniqueWithoutOrganizationInput = {
    where: IngredientWhereUniqueInput
    data: XOR<IngredientUpdateWithoutOrganizationInput, IngredientUncheckedUpdateWithoutOrganizationInput>
  }

  export type IngredientUpdateManyWithWhereWithoutOrganizationInput = {
    where: IngredientScalarWhereInput
    data: XOR<IngredientUpdateManyMutationInput, IngredientUncheckedUpdateManyWithoutOrganizationInput>
  }

  export type IngredientScalarWhereInput = {
    AND?: IngredientScalarWhereInput | IngredientScalarWhereInput[]
    OR?: IngredientScalarWhereInput[]
    NOT?: IngredientScalarWhereInput | IngredientScalarWhereInput[]
    id?: StringFilter<"Ingredient"> | string
    organizationId?: StringFilter<"Ingredient"> | string
    title?: StringFilter<"Ingredient"> | string
    content?: StringFilter<"Ingredient"> | string
    platform?: StringNullableFilter<"Ingredient"> | string | null
    totalVotes?: IntFilter<"Ingredient"> | number
    sourcePostId?: StringNullableFilter<"Ingredient"> | string | null
    createdAt?: StringFilter<"Ingredient"> | string
    updatedAt?: StringFilter<"Ingredient"> | string
  }

  export type AgentStrategyUpsertWithWhereUniqueWithoutOrganizationInput = {
    where: AgentStrategyWhereUniqueInput
    update: XOR<AgentStrategyUpdateWithoutOrganizationInput, AgentStrategyUncheckedUpdateWithoutOrganizationInput>
    create: XOR<AgentStrategyCreateWithoutOrganizationInput, AgentStrategyUncheckedCreateWithoutOrganizationInput>
  }

  export type AgentStrategyUpdateWithWhereUniqueWithoutOrganizationInput = {
    where: AgentStrategyWhereUniqueInput
    data: XOR<AgentStrategyUpdateWithoutOrganizationInput, AgentStrategyUncheckedUpdateWithoutOrganizationInput>
  }

  export type AgentStrategyUpdateManyWithWhereWithoutOrganizationInput = {
    where: AgentStrategyScalarWhereInput
    data: XOR<AgentStrategyUpdateManyMutationInput, AgentStrategyUncheckedUpdateManyWithoutOrganizationInput>
  }

  export type AgentStrategyScalarWhereInput = {
    AND?: AgentStrategyScalarWhereInput | AgentStrategyScalarWhereInput[]
    OR?: AgentStrategyScalarWhereInput[]
    NOT?: AgentStrategyScalarWhereInput | AgentStrategyScalarWhereInput[]
    id?: StringFilter<"AgentStrategy"> | string
    organizationId?: StringFilter<"AgentStrategy"> | string
    name?: StringFilter<"AgentStrategy"> | string
    avatar?: StringNullableFilter<"AgentStrategy"> | string | null
    platformsJson?: StringFilter<"AgentStrategy"> | string
    status?: StringFilter<"AgentStrategy"> | string
    isActive?: BoolFilter<"AgentStrategy"> | boolean
    lastRunAt?: StringNullableFilter<"AgentStrategy"> | string | null
    createdAt?: StringFilter<"AgentStrategy"> | string
    updatedAt?: StringFilter<"AgentStrategy"> | string
  }

  export type WorkflowUpsertWithWhereUniqueWithoutOrganizationInput = {
    where: WorkflowWhereUniqueInput
    update: XOR<WorkflowUpdateWithoutOrganizationInput, WorkflowUncheckedUpdateWithoutOrganizationInput>
    create: XOR<WorkflowCreateWithoutOrganizationInput, WorkflowUncheckedCreateWithoutOrganizationInput>
  }

  export type WorkflowUpdateWithWhereUniqueWithoutOrganizationInput = {
    where: WorkflowWhereUniqueInput
    data: XOR<WorkflowUpdateWithoutOrganizationInput, WorkflowUncheckedUpdateWithoutOrganizationInput>
  }

  export type WorkflowUpdateManyWithWhereWithoutOrganizationInput = {
    where: WorkflowScalarWhereInput
    data: XOR<WorkflowUpdateManyMutationInput, WorkflowUncheckedUpdateManyWithoutOrganizationInput>
  }

  export type WorkflowScalarWhereInput = {
    AND?: WorkflowScalarWhereInput | WorkflowScalarWhereInput[]
    OR?: WorkflowScalarWhereInput[]
    NOT?: WorkflowScalarWhereInput | WorkflowScalarWhereInput[]
    id?: StringFilter<"Workflow"> | string
    organizationId?: StringFilter<"Workflow"> | string
    name?: StringFilter<"Workflow"> | string
    description?: StringNullableFilter<"Workflow"> | string | null
    lifecycle?: StringFilter<"Workflow"> | string
    nodeCount?: IntFilter<"Workflow"> | number
    supportsBatch?: BoolFilter<"Workflow"> | boolean
    lastExecutedAt?: StringNullableFilter<"Workflow"> | string | null
    createdAt?: StringFilter<"Workflow"> | string
    updatedAt?: StringFilter<"Workflow"> | string
  }

  export type OrganizationCreateWithoutPostsInput = {
    id: string
    name: string
    slug: string
    createdAt: string
    updatedAt: string
    users?: UserCreateNestedManyWithoutOrganizationInput
    trends?: TrendCreateNestedManyWithoutOrganizationInput
    ingredients?: IngredientCreateNestedManyWithoutOrganizationInput
    agentStrategies?: AgentStrategyCreateNestedManyWithoutOrganizationInput
    workflows?: WorkflowCreateNestedManyWithoutOrganizationInput
  }

  export type OrganizationUncheckedCreateWithoutPostsInput = {
    id: string
    name: string
    slug: string
    createdAt: string
    updatedAt: string
    users?: UserUncheckedCreateNestedManyWithoutOrganizationInput
    trends?: TrendUncheckedCreateNestedManyWithoutOrganizationInput
    ingredients?: IngredientUncheckedCreateNestedManyWithoutOrganizationInput
    agentStrategies?: AgentStrategyUncheckedCreateNestedManyWithoutOrganizationInput
    workflows?: WorkflowUncheckedCreateNestedManyWithoutOrganizationInput
  }

  export type OrganizationCreateOrConnectWithoutPostsInput = {
    where: OrganizationWhereUniqueInput
    create: XOR<OrganizationCreateWithoutPostsInput, OrganizationUncheckedCreateWithoutPostsInput>
  }

  export type OrganizationUpsertWithoutPostsInput = {
    update: XOR<OrganizationUpdateWithoutPostsInput, OrganizationUncheckedUpdateWithoutPostsInput>
    create: XOR<OrganizationCreateWithoutPostsInput, OrganizationUncheckedCreateWithoutPostsInput>
    where?: OrganizationWhereInput
  }

  export type OrganizationUpdateToOneWithWhereWithoutPostsInput = {
    where?: OrganizationWhereInput
    data: XOR<OrganizationUpdateWithoutPostsInput, OrganizationUncheckedUpdateWithoutPostsInput>
  }

  export type OrganizationUpdateWithoutPostsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    users?: UserUpdateManyWithoutOrganizationNestedInput
    trends?: TrendUpdateManyWithoutOrganizationNestedInput
    ingredients?: IngredientUpdateManyWithoutOrganizationNestedInput
    agentStrategies?: AgentStrategyUpdateManyWithoutOrganizationNestedInput
    workflows?: WorkflowUpdateManyWithoutOrganizationNestedInput
  }

  export type OrganizationUncheckedUpdateWithoutPostsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    users?: UserUncheckedUpdateManyWithoutOrganizationNestedInput
    trends?: TrendUncheckedUpdateManyWithoutOrganizationNestedInput
    ingredients?: IngredientUncheckedUpdateManyWithoutOrganizationNestedInput
    agentStrategies?: AgentStrategyUncheckedUpdateManyWithoutOrganizationNestedInput
    workflows?: WorkflowUncheckedUpdateManyWithoutOrganizationNestedInput
  }

  export type OrganizationCreateWithoutIngredientsInput = {
    id: string
    name: string
    slug: string
    createdAt: string
    updatedAt: string
    users?: UserCreateNestedManyWithoutOrganizationInput
    posts?: PostCreateNestedManyWithoutOrganizationInput
    trends?: TrendCreateNestedManyWithoutOrganizationInput
    agentStrategies?: AgentStrategyCreateNestedManyWithoutOrganizationInput
    workflows?: WorkflowCreateNestedManyWithoutOrganizationInput
  }

  export type OrganizationUncheckedCreateWithoutIngredientsInput = {
    id: string
    name: string
    slug: string
    createdAt: string
    updatedAt: string
    users?: UserUncheckedCreateNestedManyWithoutOrganizationInput
    posts?: PostUncheckedCreateNestedManyWithoutOrganizationInput
    trends?: TrendUncheckedCreateNestedManyWithoutOrganizationInput
    agentStrategies?: AgentStrategyUncheckedCreateNestedManyWithoutOrganizationInput
    workflows?: WorkflowUncheckedCreateNestedManyWithoutOrganizationInput
  }

  export type OrganizationCreateOrConnectWithoutIngredientsInput = {
    where: OrganizationWhereUniqueInput
    create: XOR<OrganizationCreateWithoutIngredientsInput, OrganizationUncheckedCreateWithoutIngredientsInput>
  }

  export type OrganizationUpsertWithoutIngredientsInput = {
    update: XOR<OrganizationUpdateWithoutIngredientsInput, OrganizationUncheckedUpdateWithoutIngredientsInput>
    create: XOR<OrganizationCreateWithoutIngredientsInput, OrganizationUncheckedCreateWithoutIngredientsInput>
    where?: OrganizationWhereInput
  }

  export type OrganizationUpdateToOneWithWhereWithoutIngredientsInput = {
    where?: OrganizationWhereInput
    data: XOR<OrganizationUpdateWithoutIngredientsInput, OrganizationUncheckedUpdateWithoutIngredientsInput>
  }

  export type OrganizationUpdateWithoutIngredientsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    users?: UserUpdateManyWithoutOrganizationNestedInput
    posts?: PostUpdateManyWithoutOrganizationNestedInput
    trends?: TrendUpdateManyWithoutOrganizationNestedInput
    agentStrategies?: AgentStrategyUpdateManyWithoutOrganizationNestedInput
    workflows?: WorkflowUpdateManyWithoutOrganizationNestedInput
  }

  export type OrganizationUncheckedUpdateWithoutIngredientsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    users?: UserUncheckedUpdateManyWithoutOrganizationNestedInput
    posts?: PostUncheckedUpdateManyWithoutOrganizationNestedInput
    trends?: TrendUncheckedUpdateManyWithoutOrganizationNestedInput
    agentStrategies?: AgentStrategyUncheckedUpdateManyWithoutOrganizationNestedInput
    workflows?: WorkflowUncheckedUpdateManyWithoutOrganizationNestedInput
  }

  export type OrganizationCreateWithoutTrendsInput = {
    id: string
    name: string
    slug: string
    createdAt: string
    updatedAt: string
    users?: UserCreateNestedManyWithoutOrganizationInput
    posts?: PostCreateNestedManyWithoutOrganizationInput
    ingredients?: IngredientCreateNestedManyWithoutOrganizationInput
    agentStrategies?: AgentStrategyCreateNestedManyWithoutOrganizationInput
    workflows?: WorkflowCreateNestedManyWithoutOrganizationInput
  }

  export type OrganizationUncheckedCreateWithoutTrendsInput = {
    id: string
    name: string
    slug: string
    createdAt: string
    updatedAt: string
    users?: UserUncheckedCreateNestedManyWithoutOrganizationInput
    posts?: PostUncheckedCreateNestedManyWithoutOrganizationInput
    ingredients?: IngredientUncheckedCreateNestedManyWithoutOrganizationInput
    agentStrategies?: AgentStrategyUncheckedCreateNestedManyWithoutOrganizationInput
    workflows?: WorkflowUncheckedCreateNestedManyWithoutOrganizationInput
  }

  export type OrganizationCreateOrConnectWithoutTrendsInput = {
    where: OrganizationWhereUniqueInput
    create: XOR<OrganizationCreateWithoutTrendsInput, OrganizationUncheckedCreateWithoutTrendsInput>
  }

  export type OrganizationUpsertWithoutTrendsInput = {
    update: XOR<OrganizationUpdateWithoutTrendsInput, OrganizationUncheckedUpdateWithoutTrendsInput>
    create: XOR<OrganizationCreateWithoutTrendsInput, OrganizationUncheckedCreateWithoutTrendsInput>
    where?: OrganizationWhereInput
  }

  export type OrganizationUpdateToOneWithWhereWithoutTrendsInput = {
    where?: OrganizationWhereInput
    data: XOR<OrganizationUpdateWithoutTrendsInput, OrganizationUncheckedUpdateWithoutTrendsInput>
  }

  export type OrganizationUpdateWithoutTrendsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    users?: UserUpdateManyWithoutOrganizationNestedInput
    posts?: PostUpdateManyWithoutOrganizationNestedInput
    ingredients?: IngredientUpdateManyWithoutOrganizationNestedInput
    agentStrategies?: AgentStrategyUpdateManyWithoutOrganizationNestedInput
    workflows?: WorkflowUpdateManyWithoutOrganizationNestedInput
  }

  export type OrganizationUncheckedUpdateWithoutTrendsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    users?: UserUncheckedUpdateManyWithoutOrganizationNestedInput
    posts?: PostUncheckedUpdateManyWithoutOrganizationNestedInput
    ingredients?: IngredientUncheckedUpdateManyWithoutOrganizationNestedInput
    agentStrategies?: AgentStrategyUncheckedUpdateManyWithoutOrganizationNestedInput
    workflows?: WorkflowUncheckedUpdateManyWithoutOrganizationNestedInput
  }

  export type OrganizationCreateWithoutAgentStrategiesInput = {
    id: string
    name: string
    slug: string
    createdAt: string
    updatedAt: string
    users?: UserCreateNestedManyWithoutOrganizationInput
    posts?: PostCreateNestedManyWithoutOrganizationInput
    trends?: TrendCreateNestedManyWithoutOrganizationInput
    ingredients?: IngredientCreateNestedManyWithoutOrganizationInput
    workflows?: WorkflowCreateNestedManyWithoutOrganizationInput
  }

  export type OrganizationUncheckedCreateWithoutAgentStrategiesInput = {
    id: string
    name: string
    slug: string
    createdAt: string
    updatedAt: string
    users?: UserUncheckedCreateNestedManyWithoutOrganizationInput
    posts?: PostUncheckedCreateNestedManyWithoutOrganizationInput
    trends?: TrendUncheckedCreateNestedManyWithoutOrganizationInput
    ingredients?: IngredientUncheckedCreateNestedManyWithoutOrganizationInput
    workflows?: WorkflowUncheckedCreateNestedManyWithoutOrganizationInput
  }

  export type OrganizationCreateOrConnectWithoutAgentStrategiesInput = {
    where: OrganizationWhereUniqueInput
    create: XOR<OrganizationCreateWithoutAgentStrategiesInput, OrganizationUncheckedCreateWithoutAgentStrategiesInput>
  }

  export type WorkflowExecutionCreateWithoutAgentStrategyInput = {
    id: string
    mode: string
    status: string
    startedAt: string
    completedAt?: string | null
    workflow: WorkflowCreateNestedOneWithoutExecutionsInput
  }

  export type WorkflowExecutionUncheckedCreateWithoutAgentStrategyInput = {
    id: string
    workflowId: string
    mode: string
    status: string
    startedAt: string
    completedAt?: string | null
  }

  export type WorkflowExecutionCreateOrConnectWithoutAgentStrategyInput = {
    where: WorkflowExecutionWhereUniqueInput
    create: XOR<WorkflowExecutionCreateWithoutAgentStrategyInput, WorkflowExecutionUncheckedCreateWithoutAgentStrategyInput>
  }

  export type WorkflowExecutionCreateManyAgentStrategyInputEnvelope = {
    data: WorkflowExecutionCreateManyAgentStrategyInput | WorkflowExecutionCreateManyAgentStrategyInput[]
    skipDuplicates?: boolean
  }

  export type OrganizationUpsertWithoutAgentStrategiesInput = {
    update: XOR<OrganizationUpdateWithoutAgentStrategiesInput, OrganizationUncheckedUpdateWithoutAgentStrategiesInput>
    create: XOR<OrganizationCreateWithoutAgentStrategiesInput, OrganizationUncheckedCreateWithoutAgentStrategiesInput>
    where?: OrganizationWhereInput
  }

  export type OrganizationUpdateToOneWithWhereWithoutAgentStrategiesInput = {
    where?: OrganizationWhereInput
    data: XOR<OrganizationUpdateWithoutAgentStrategiesInput, OrganizationUncheckedUpdateWithoutAgentStrategiesInput>
  }

  export type OrganizationUpdateWithoutAgentStrategiesInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    users?: UserUpdateManyWithoutOrganizationNestedInput
    posts?: PostUpdateManyWithoutOrganizationNestedInput
    trends?: TrendUpdateManyWithoutOrganizationNestedInput
    ingredients?: IngredientUpdateManyWithoutOrganizationNestedInput
    workflows?: WorkflowUpdateManyWithoutOrganizationNestedInput
  }

  export type OrganizationUncheckedUpdateWithoutAgentStrategiesInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    users?: UserUncheckedUpdateManyWithoutOrganizationNestedInput
    posts?: PostUncheckedUpdateManyWithoutOrganizationNestedInput
    trends?: TrendUncheckedUpdateManyWithoutOrganizationNestedInput
    ingredients?: IngredientUncheckedUpdateManyWithoutOrganizationNestedInput
    workflows?: WorkflowUncheckedUpdateManyWithoutOrganizationNestedInput
  }

  export type WorkflowExecutionUpsertWithWhereUniqueWithoutAgentStrategyInput = {
    where: WorkflowExecutionWhereUniqueInput
    update: XOR<WorkflowExecutionUpdateWithoutAgentStrategyInput, WorkflowExecutionUncheckedUpdateWithoutAgentStrategyInput>
    create: XOR<WorkflowExecutionCreateWithoutAgentStrategyInput, WorkflowExecutionUncheckedCreateWithoutAgentStrategyInput>
  }

  export type WorkflowExecutionUpdateWithWhereUniqueWithoutAgentStrategyInput = {
    where: WorkflowExecutionWhereUniqueInput
    data: XOR<WorkflowExecutionUpdateWithoutAgentStrategyInput, WorkflowExecutionUncheckedUpdateWithoutAgentStrategyInput>
  }

  export type WorkflowExecutionUpdateManyWithWhereWithoutAgentStrategyInput = {
    where: WorkflowExecutionScalarWhereInput
    data: XOR<WorkflowExecutionUpdateManyMutationInput, WorkflowExecutionUncheckedUpdateManyWithoutAgentStrategyInput>
  }

  export type WorkflowExecutionScalarWhereInput = {
    AND?: WorkflowExecutionScalarWhereInput | WorkflowExecutionScalarWhereInput[]
    OR?: WorkflowExecutionScalarWhereInput[]
    NOT?: WorkflowExecutionScalarWhereInput | WorkflowExecutionScalarWhereInput[]
    id?: StringFilter<"WorkflowExecution"> | string
    workflowId?: StringFilter<"WorkflowExecution"> | string
    agentStrategyId?: StringNullableFilter<"WorkflowExecution"> | string | null
    mode?: StringFilter<"WorkflowExecution"> | string
    status?: StringFilter<"WorkflowExecution"> | string
    startedAt?: StringFilter<"WorkflowExecution"> | string
    completedAt?: StringNullableFilter<"WorkflowExecution"> | string | null
  }

  export type OrganizationCreateWithoutWorkflowsInput = {
    id: string
    name: string
    slug: string
    createdAt: string
    updatedAt: string
    users?: UserCreateNestedManyWithoutOrganizationInput
    posts?: PostCreateNestedManyWithoutOrganizationInput
    trends?: TrendCreateNestedManyWithoutOrganizationInput
    ingredients?: IngredientCreateNestedManyWithoutOrganizationInput
    agentStrategies?: AgentStrategyCreateNestedManyWithoutOrganizationInput
  }

  export type OrganizationUncheckedCreateWithoutWorkflowsInput = {
    id: string
    name: string
    slug: string
    createdAt: string
    updatedAt: string
    users?: UserUncheckedCreateNestedManyWithoutOrganizationInput
    posts?: PostUncheckedCreateNestedManyWithoutOrganizationInput
    trends?: TrendUncheckedCreateNestedManyWithoutOrganizationInput
    ingredients?: IngredientUncheckedCreateNestedManyWithoutOrganizationInput
    agentStrategies?: AgentStrategyUncheckedCreateNestedManyWithoutOrganizationInput
  }

  export type OrganizationCreateOrConnectWithoutWorkflowsInput = {
    where: OrganizationWhereUniqueInput
    create: XOR<OrganizationCreateWithoutWorkflowsInput, OrganizationUncheckedCreateWithoutWorkflowsInput>
  }

  export type WorkflowExecutionCreateWithoutWorkflowInput = {
    id: string
    mode: string
    status: string
    startedAt: string
    completedAt?: string | null
    agentStrategy?: AgentStrategyCreateNestedOneWithoutWorkflowsInput
  }

  export type WorkflowExecutionUncheckedCreateWithoutWorkflowInput = {
    id: string
    agentStrategyId?: string | null
    mode: string
    status: string
    startedAt: string
    completedAt?: string | null
  }

  export type WorkflowExecutionCreateOrConnectWithoutWorkflowInput = {
    where: WorkflowExecutionWhereUniqueInput
    create: XOR<WorkflowExecutionCreateWithoutWorkflowInput, WorkflowExecutionUncheckedCreateWithoutWorkflowInput>
  }

  export type WorkflowExecutionCreateManyWorkflowInputEnvelope = {
    data: WorkflowExecutionCreateManyWorkflowInput | WorkflowExecutionCreateManyWorkflowInput[]
    skipDuplicates?: boolean
  }

  export type OrganizationUpsertWithoutWorkflowsInput = {
    update: XOR<OrganizationUpdateWithoutWorkflowsInput, OrganizationUncheckedUpdateWithoutWorkflowsInput>
    create: XOR<OrganizationCreateWithoutWorkflowsInput, OrganizationUncheckedCreateWithoutWorkflowsInput>
    where?: OrganizationWhereInput
  }

  export type OrganizationUpdateToOneWithWhereWithoutWorkflowsInput = {
    where?: OrganizationWhereInput
    data: XOR<OrganizationUpdateWithoutWorkflowsInput, OrganizationUncheckedUpdateWithoutWorkflowsInput>
  }

  export type OrganizationUpdateWithoutWorkflowsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    users?: UserUpdateManyWithoutOrganizationNestedInput
    posts?: PostUpdateManyWithoutOrganizationNestedInput
    trends?: TrendUpdateManyWithoutOrganizationNestedInput
    ingredients?: IngredientUpdateManyWithoutOrganizationNestedInput
    agentStrategies?: AgentStrategyUpdateManyWithoutOrganizationNestedInput
  }

  export type OrganizationUncheckedUpdateWithoutWorkflowsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    users?: UserUncheckedUpdateManyWithoutOrganizationNestedInput
    posts?: PostUncheckedUpdateManyWithoutOrganizationNestedInput
    trends?: TrendUncheckedUpdateManyWithoutOrganizationNestedInput
    ingredients?: IngredientUncheckedUpdateManyWithoutOrganizationNestedInput
    agentStrategies?: AgentStrategyUncheckedUpdateManyWithoutOrganizationNestedInput
  }

  export type WorkflowExecutionUpsertWithWhereUniqueWithoutWorkflowInput = {
    where: WorkflowExecutionWhereUniqueInput
    update: XOR<WorkflowExecutionUpdateWithoutWorkflowInput, WorkflowExecutionUncheckedUpdateWithoutWorkflowInput>
    create: XOR<WorkflowExecutionCreateWithoutWorkflowInput, WorkflowExecutionUncheckedCreateWithoutWorkflowInput>
  }

  export type WorkflowExecutionUpdateWithWhereUniqueWithoutWorkflowInput = {
    where: WorkflowExecutionWhereUniqueInput
    data: XOR<WorkflowExecutionUpdateWithoutWorkflowInput, WorkflowExecutionUncheckedUpdateWithoutWorkflowInput>
  }

  export type WorkflowExecutionUpdateManyWithWhereWithoutWorkflowInput = {
    where: WorkflowExecutionScalarWhereInput
    data: XOR<WorkflowExecutionUpdateManyMutationInput, WorkflowExecutionUncheckedUpdateManyWithoutWorkflowInput>
  }

  export type WorkflowCreateWithoutExecutionsInput = {
    id: string
    name: string
    description?: string | null
    lifecycle: string
    nodeCount: number
    supportsBatch?: boolean
    lastExecutedAt?: string | null
    createdAt: string
    updatedAt: string
    organization: OrganizationCreateNestedOneWithoutWorkflowsInput
  }

  export type WorkflowUncheckedCreateWithoutExecutionsInput = {
    id: string
    organizationId: string
    name: string
    description?: string | null
    lifecycle: string
    nodeCount: number
    supportsBatch?: boolean
    lastExecutedAt?: string | null
    createdAt: string
    updatedAt: string
  }

  export type WorkflowCreateOrConnectWithoutExecutionsInput = {
    where: WorkflowWhereUniqueInput
    create: XOR<WorkflowCreateWithoutExecutionsInput, WorkflowUncheckedCreateWithoutExecutionsInput>
  }

  export type AgentStrategyCreateWithoutWorkflowsInput = {
    id: string
    name: string
    avatar?: string | null
    platformsJson?: string
    status: string
    isActive?: boolean
    lastRunAt?: string | null
    createdAt: string
    updatedAt: string
    organization: OrganizationCreateNestedOneWithoutAgentStrategiesInput
  }

  export type AgentStrategyUncheckedCreateWithoutWorkflowsInput = {
    id: string
    organizationId: string
    name: string
    avatar?: string | null
    platformsJson?: string
    status: string
    isActive?: boolean
    lastRunAt?: string | null
    createdAt: string
    updatedAt: string
  }

  export type AgentStrategyCreateOrConnectWithoutWorkflowsInput = {
    where: AgentStrategyWhereUniqueInput
    create: XOR<AgentStrategyCreateWithoutWorkflowsInput, AgentStrategyUncheckedCreateWithoutWorkflowsInput>
  }

  export type WorkflowUpsertWithoutExecutionsInput = {
    update: XOR<WorkflowUpdateWithoutExecutionsInput, WorkflowUncheckedUpdateWithoutExecutionsInput>
    create: XOR<WorkflowCreateWithoutExecutionsInput, WorkflowUncheckedCreateWithoutExecutionsInput>
    where?: WorkflowWhereInput
  }

  export type WorkflowUpdateToOneWithWhereWithoutExecutionsInput = {
    where?: WorkflowWhereInput
    data: XOR<WorkflowUpdateWithoutExecutionsInput, WorkflowUncheckedUpdateWithoutExecutionsInput>
  }

  export type WorkflowUpdateWithoutExecutionsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    lifecycle?: StringFieldUpdateOperationsInput | string
    nodeCount?: IntFieldUpdateOperationsInput | number
    supportsBatch?: BoolFieldUpdateOperationsInput | boolean
    lastExecutedAt?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    organization?: OrganizationUpdateOneRequiredWithoutWorkflowsNestedInput
  }

  export type WorkflowUncheckedUpdateWithoutExecutionsInput = {
    id?: StringFieldUpdateOperationsInput | string
    organizationId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    lifecycle?: StringFieldUpdateOperationsInput | string
    nodeCount?: IntFieldUpdateOperationsInput | number
    supportsBatch?: BoolFieldUpdateOperationsInput | boolean
    lastExecutedAt?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type AgentStrategyUpsertWithoutWorkflowsInput = {
    update: XOR<AgentStrategyUpdateWithoutWorkflowsInput, AgentStrategyUncheckedUpdateWithoutWorkflowsInput>
    create: XOR<AgentStrategyCreateWithoutWorkflowsInput, AgentStrategyUncheckedCreateWithoutWorkflowsInput>
    where?: AgentStrategyWhereInput
  }

  export type AgentStrategyUpdateToOneWithWhereWithoutWorkflowsInput = {
    where?: AgentStrategyWhereInput
    data: XOR<AgentStrategyUpdateWithoutWorkflowsInput, AgentStrategyUncheckedUpdateWithoutWorkflowsInput>
  }

  export type AgentStrategyUpdateWithoutWorkflowsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    avatar?: NullableStringFieldUpdateOperationsInput | string | null
    platformsJson?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    lastRunAt?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    organization?: OrganizationUpdateOneRequiredWithoutAgentStrategiesNestedInput
  }

  export type AgentStrategyUncheckedUpdateWithoutWorkflowsInput = {
    id?: StringFieldUpdateOperationsInput | string
    organizationId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    avatar?: NullableStringFieldUpdateOperationsInput | string | null
    platformsJson?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    lastRunAt?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type UserCreateManyOrganizationInput = {
    id: string
    clerkId?: string | null
    email?: string | null
    name: string
    createdAt: string
    updatedAt: string
  }

  export type PostCreateManyOrganizationInput = {
    id: string
    workspaceId?: string | null
    platform: string
    type: string
    prompt: string
    content: string
    status: string
    publishIntent?: string | null
    sourceDraftId?: string | null
    sourceTrendId?: string | null
    sourceTrendTopic?: string | null
    publishedAt?: string | null
    views?: number
    engagements?: number
    createdAt: string
    updatedAt: string
  }

  export type TrendCreateManyOrganizationInput = {
    id: string
    platform: string
    topic: string
    summary?: string | null
    viralityScore: number
    engagementScore: number
    createdAt: string
  }

  export type IngredientCreateManyOrganizationInput = {
    id: string
    title: string
    content: string
    platform?: string | null
    totalVotes?: number
    sourcePostId?: string | null
    createdAt: string
    updatedAt: string
  }

  export type AgentStrategyCreateManyOrganizationInput = {
    id: string
    name: string
    avatar?: string | null
    platformsJson?: string
    status: string
    isActive?: boolean
    lastRunAt?: string | null
    createdAt: string
    updatedAt: string
  }

  export type WorkflowCreateManyOrganizationInput = {
    id: string
    name: string
    description?: string | null
    lifecycle: string
    nodeCount: number
    supportsBatch?: boolean
    lastExecutedAt?: string | null
    createdAt: string
    updatedAt: string
  }

  export type UserUpdateWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    clerkId?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type UserUncheckedUpdateWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    clerkId?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type UserUncheckedUpdateManyWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    clerkId?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type PostUpdateWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: NullableStringFieldUpdateOperationsInput | string | null
    platform?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    prompt?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    publishIntent?: NullableStringFieldUpdateOperationsInput | string | null
    sourceDraftId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceTrendId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceTrendTopic?: NullableStringFieldUpdateOperationsInput | string | null
    publishedAt?: NullableStringFieldUpdateOperationsInput | string | null
    views?: IntFieldUpdateOperationsInput | number
    engagements?: IntFieldUpdateOperationsInput | number
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type PostUncheckedUpdateWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: NullableStringFieldUpdateOperationsInput | string | null
    platform?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    prompt?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    publishIntent?: NullableStringFieldUpdateOperationsInput | string | null
    sourceDraftId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceTrendId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceTrendTopic?: NullableStringFieldUpdateOperationsInput | string | null
    publishedAt?: NullableStringFieldUpdateOperationsInput | string | null
    views?: IntFieldUpdateOperationsInput | number
    engagements?: IntFieldUpdateOperationsInput | number
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type PostUncheckedUpdateManyWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: NullableStringFieldUpdateOperationsInput | string | null
    platform?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    prompt?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    publishIntent?: NullableStringFieldUpdateOperationsInput | string | null
    sourceDraftId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceTrendId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceTrendTopic?: NullableStringFieldUpdateOperationsInput | string | null
    publishedAt?: NullableStringFieldUpdateOperationsInput | string | null
    views?: IntFieldUpdateOperationsInput | number
    engagements?: IntFieldUpdateOperationsInput | number
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type TrendUpdateWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    platform?: StringFieldUpdateOperationsInput | string
    topic?: StringFieldUpdateOperationsInput | string
    summary?: NullableStringFieldUpdateOperationsInput | string | null
    viralityScore?: IntFieldUpdateOperationsInput | number
    engagementScore?: IntFieldUpdateOperationsInput | number
    createdAt?: StringFieldUpdateOperationsInput | string
  }

  export type TrendUncheckedUpdateWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    platform?: StringFieldUpdateOperationsInput | string
    topic?: StringFieldUpdateOperationsInput | string
    summary?: NullableStringFieldUpdateOperationsInput | string | null
    viralityScore?: IntFieldUpdateOperationsInput | number
    engagementScore?: IntFieldUpdateOperationsInput | number
    createdAt?: StringFieldUpdateOperationsInput | string
  }

  export type TrendUncheckedUpdateManyWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    platform?: StringFieldUpdateOperationsInput | string
    topic?: StringFieldUpdateOperationsInput | string
    summary?: NullableStringFieldUpdateOperationsInput | string | null
    viralityScore?: IntFieldUpdateOperationsInput | number
    engagementScore?: IntFieldUpdateOperationsInput | number
    createdAt?: StringFieldUpdateOperationsInput | string
  }

  export type IngredientUpdateWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
    platform?: NullableStringFieldUpdateOperationsInput | string | null
    totalVotes?: IntFieldUpdateOperationsInput | number
    sourcePostId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type IngredientUncheckedUpdateWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
    platform?: NullableStringFieldUpdateOperationsInput | string | null
    totalVotes?: IntFieldUpdateOperationsInput | number
    sourcePostId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type IngredientUncheckedUpdateManyWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
    platform?: NullableStringFieldUpdateOperationsInput | string | null
    totalVotes?: IntFieldUpdateOperationsInput | number
    sourcePostId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type AgentStrategyUpdateWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    avatar?: NullableStringFieldUpdateOperationsInput | string | null
    platformsJson?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    lastRunAt?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    workflows?: WorkflowExecutionUpdateManyWithoutAgentStrategyNestedInput
  }

  export type AgentStrategyUncheckedUpdateWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    avatar?: NullableStringFieldUpdateOperationsInput | string | null
    platformsJson?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    lastRunAt?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    workflows?: WorkflowExecutionUncheckedUpdateManyWithoutAgentStrategyNestedInput
  }

  export type AgentStrategyUncheckedUpdateManyWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    avatar?: NullableStringFieldUpdateOperationsInput | string | null
    platformsJson?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    lastRunAt?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type WorkflowUpdateWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    lifecycle?: StringFieldUpdateOperationsInput | string
    nodeCount?: IntFieldUpdateOperationsInput | number
    supportsBatch?: BoolFieldUpdateOperationsInput | boolean
    lastExecutedAt?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    executions?: WorkflowExecutionUpdateManyWithoutWorkflowNestedInput
  }

  export type WorkflowUncheckedUpdateWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    lifecycle?: StringFieldUpdateOperationsInput | string
    nodeCount?: IntFieldUpdateOperationsInput | number
    supportsBatch?: BoolFieldUpdateOperationsInput | boolean
    lastExecutedAt?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
    executions?: WorkflowExecutionUncheckedUpdateManyWithoutWorkflowNestedInput
  }

  export type WorkflowUncheckedUpdateManyWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    lifecycle?: StringFieldUpdateOperationsInput | string
    nodeCount?: IntFieldUpdateOperationsInput | number
    supportsBatch?: BoolFieldUpdateOperationsInput | boolean
    lastExecutedAt?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: StringFieldUpdateOperationsInput | string
    updatedAt?: StringFieldUpdateOperationsInput | string
  }

  export type WorkflowExecutionCreateManyAgentStrategyInput = {
    id: string
    workflowId: string
    mode: string
    status: string
    startedAt: string
    completedAt?: string | null
  }

  export type WorkflowExecutionUpdateWithoutAgentStrategyInput = {
    id?: StringFieldUpdateOperationsInput | string
    mode?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    startedAt?: StringFieldUpdateOperationsInput | string
    completedAt?: NullableStringFieldUpdateOperationsInput | string | null
    workflow?: WorkflowUpdateOneRequiredWithoutExecutionsNestedInput
  }

  export type WorkflowExecutionUncheckedUpdateWithoutAgentStrategyInput = {
    id?: StringFieldUpdateOperationsInput | string
    workflowId?: StringFieldUpdateOperationsInput | string
    mode?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    startedAt?: StringFieldUpdateOperationsInput | string
    completedAt?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type WorkflowExecutionUncheckedUpdateManyWithoutAgentStrategyInput = {
    id?: StringFieldUpdateOperationsInput | string
    workflowId?: StringFieldUpdateOperationsInput | string
    mode?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    startedAt?: StringFieldUpdateOperationsInput | string
    completedAt?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type WorkflowExecutionCreateManyWorkflowInput = {
    id: string
    agentStrategyId?: string | null
    mode: string
    status: string
    startedAt: string
    completedAt?: string | null
  }

  export type WorkflowExecutionUpdateWithoutWorkflowInput = {
    id?: StringFieldUpdateOperationsInput | string
    mode?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    startedAt?: StringFieldUpdateOperationsInput | string
    completedAt?: NullableStringFieldUpdateOperationsInput | string | null
    agentStrategy?: AgentStrategyUpdateOneWithoutWorkflowsNestedInput
  }

  export type WorkflowExecutionUncheckedUpdateWithoutWorkflowInput = {
    id?: StringFieldUpdateOperationsInput | string
    agentStrategyId?: NullableStringFieldUpdateOperationsInput | string | null
    mode?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    startedAt?: StringFieldUpdateOperationsInput | string
    completedAt?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type WorkflowExecutionUncheckedUpdateManyWithoutWorkflowInput = {
    id?: StringFieldUpdateOperationsInput | string
    agentStrategyId?: NullableStringFieldUpdateOperationsInput | string | null
    mode?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    startedAt?: StringFieldUpdateOperationsInput | string
    completedAt?: NullableStringFieldUpdateOperationsInput | string | null
  }



  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}
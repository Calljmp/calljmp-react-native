/**
 * @fileoverview Database query API for executing SQL operations on the backend SQLite database.
 *
 * Provides full SQLite database access with no restrictions, allowing raw SQL queries
 * to be executed on the backend database with proper authentication and security.
 */

import {
  DotPaths,
  ProjectedType,
  SignalDatabaseDelete,
  SignalDatabaseEventType,
  SignalDatabaseInsert,
  SignalDatabaseRow,
  SignalDatabaseRowId,
  SignalDatabaseSubscribe,
  SignalDatabaseTopic,
  SignalDatabaseUnsubscribe,
  SignalDatabaseUpdate,
  SignalFilter,
  SignalMessageAck,
  SignalMessageData,
  SignalMessageError,
  SignalMessageType,
} from './common';
import { Config } from './config';
import { access } from './middleware/access';
import { context } from './middleware/context';
import { request } from './request';
import { SecureStore } from './secure-store';
import { Signal, SignalLock, SignalResult } from './signal';

const DatabaseComponent = 'database';

/**
 * Database subscription event types
 * @public
 */
export type DatabaseSubscriptionEvent = 'insert' | 'update' | 'delete';

/**
 * Provides database query APIs for executing SQL operations on the backend SQLite database.
 *
 * The Database class allows you to execute raw SQL queries against your project's SQLite
 * database on the backend. This provides full database control without restrictions,
 * enabling complex queries, transactions, and database operations.
 *
 * All database operations are authenticated and executed securely on the backend,
 * ensuring data integrity and proper access control.
 *
 * @example Basic query
 * ```typescript
 * const result = await sdk.database.query({
 *   sql: 'SELECT * FROM users WHERE active = ?',
 *   params: [true]
 * });
 * console.log('Active users:', result.rows);
 * ```
 *
 * @example Insert operation
 * ```typescript
 * const result = await sdk.database.query({
 *   sql: 'INSERT INTO users (name, email) VALUES (?, ?)',
 *   params: ['John Doe', 'john@example.com']
 * });
 * console.log('New user ID:', result.insertId);
 * ```
 *
 * @public
 */
export class Database {
  private _signalLock: SignalLock | null = null;
  private _subscriptions: Array<DatabaseSubscription> = [];

  /**
   * Creates a new Database instance.
   *
   * @param _config - SDK configuration containing API endpoints
   * @param _store - Secure storage for access tokens and authentication
   * @param _signal - Signal instance for managing real-time updates and events
   *
   * @internal
   */
  constructor(
    private _config: Config,
    private _store: SecureStore,
    private _signal: Signal
  ) {}

  /**
   * Executes a SQL query on the backend SQLite database.
   *
   * This method allows you to execute any valid SQLite query, including SELECT, INSERT,
   * UPDATE, DELETE, and DDL operations. Parameters are safely bound to prevent SQL
   * injection attacks.
   *
   * @param params - Query parameters object
   * @param params.sql - The SQL query string to execute
   * @param params.params - Optional array of parameters to bind to the query
   *
   * @returns A promise that resolves to the query result containing rows and metadata
   *
   * @throws {ServiceError} When the query fails due to syntax errors, permission issues, or network problems
   *
   * @example SELECT query
   * ```typescript
   * const result = await sdk.database.query({
   *   sql: 'SELECT id, name, email FROM users WHERE created_at > ?',
   *   params: ['2024-01-01']
   * });
   *
   * result.rows.forEach(user => {
   *   console.log(`User: ${user.name} (${user.email})`);
   * });
   * ```
   *
   * @example INSERT with auto-increment ID
   * ```typescript
   * const result = await sdk.database.query({
   *   sql: 'INSERT INTO posts (title, content, user_id) VALUES (?, ?, ?)',
   *   params: ['My First Post', 'Hello world!', 123]
   * });
   *
   * console.log('New post ID:', result.insertId);
   * console.log('Rows affected:', result.affectedRows);
   * ```
   *
   * @example UPDATE operation
   * ```typescript
   * const result = await sdk.database.query({
   *   sql: 'UPDATE users SET last_login = ? WHERE id = ?',
   *   params: [new Date().toISOString(), 456]
   * });
   *
   * console.log('Users updated:', result.affectedRows);
   * ```
   *
   * @remarks
   * - All queries are executed with proper authentication and access control
   * - Parameters are safely bound to prevent SQL injection
   * - Complex queries including JOINs, subqueries, and CTEs are supported
   * - DDL operations (CREATE TABLE, ALTER TABLE, etc.) are allowed
   * - Transactions can be managed using BEGIN/COMMIT/ROLLBACK
   */
  async query({ sql, params }: { sql: string; params?: (string | number)[] }) {
    return request(`${this._config.serviceUrl}/database/query`)
      .use(context(this._config), access(this._store))
      .post({
        sql,
        params,
      })
      .json<{
        insertId?: number;
        affectedRows?: number;
        rows: unknown[];
      }>();
  }

  private async _acquireSignalLock() {
    if (!this._signalLock) {
      this._signalLock =
        this._signal.findLock(DatabaseComponent) ||
        (await this._signal.acquireLock(DatabaseComponent));
    }
  }

  private async _releaseSignalLock() {
    if (this._signalLock) {
      this._signal.releaseLock(this._signalLock);
      this._signalLock = null;
    }
  }

  /**
   * Observe database changes for a specific table and event type.
   *
   * @param path - Table name followed by event type (e.g., "users.insert", "posts.update")
   * @returns A DatabaseObserver for setting up event handlers and subscriptions
   *
   * @example Basic usage
   * ```typescript
   * const observer = db.observe<User>('users.insert')
   *   .on('insert', ({ rows }) => {
   *     console.log('New users:', rows);
   *   });
   *
   * const subscription = await observer.subscribe();
   * ```
   *
   * @example Available events
   * ```typescript
   * db.observe('users.insert')   // New records inserted
   * db.observe('users.update')   // Existing records updated
   * db.observe('users.delete')   // Records deleted
   * ```
   */
  observe<T = unknown, Path extends DatabaseObservePath = DatabaseObservePath>(
    path: Path
  ): DatabaseObserverForEvent<T, Path> {
    const [table, event] = path.split('.') as [
      string,
      DatabaseSubscriptionEvent,
    ];
    return new DatabaseObserver<T>(
      this._subscribe.bind(this),
      table,
      event
    ) as any;
  }

  private async _subscribe<T>(
    options: DatabaseSubscribeOptions<T>
  ): Promise<DatabaseSubscription> {
    const topic: SignalDatabaseTopic = `database.${options.table}.${options.event}`;
    const subscriptionId = await Signal.messageId();
    const subscription = new DatabaseSubscriptionInternal();
    this._subscriptions.push(subscription);

    const removeSubscription = async () => {
      this._signal.off(SignalMessageType.Ack, handleAck);
      this._signal.off(SignalMessageType.Error, handleError);
      this._signal.off(SignalMessageType.Data, handleData);

      subscription.active = false;
      this._subscriptions = this._subscriptions.filter(
        sub => sub !== subscription
      );

      if (this._subscriptions.length === 0) {
        await this._releaseSignalLock();
      }
    };

    const unsubscribe = async () => {
      await this._signal
        .send<SignalDatabaseUnsubscribe>({
          type: SignalMessageType.Unsubscribe,
          topic,
        })
        .catch(error => {
          console.error(
            `Failed to unsubscribe from table ${options.table} event ${options.event}:`,
            error
          );
        });
    };

    const handleData = async (
      message:
        | SignalMessageData
        | SignalDatabaseInsert
        | SignalDatabaseUpdate
        | SignalDatabaseDelete
    ) => {
      if (
        subscription.active &&
        message.topic === topic &&
        'eventType' in message
      ) {
        try {
          if (message.eventType === SignalDatabaseEventType.Insert) {
            if (options.onInsert) {
              await options.onInsert({ rows: message.rows as T[] });
            }
          } else if (message.eventType === SignalDatabaseEventType.Update) {
            if (options.onUpdate) {
              await options.onUpdate({ rows: message.rows as T[] });
            }
          } else if (message.eventType === SignalDatabaseEventType.Delete) {
            if (options.onDelete) {
              await options.onDelete({ rowIds: message.rowIds });
            }
          }
        } catch (error) {
          console.error(
            `Error handling data for table ${options.table} event ${options.event}:`,
            error
          );
        }
      }
    };

    const handleAck = async (message: SignalMessageAck) => {
      if (message.id !== subscriptionId) return;
      this._signal.off(SignalMessageType.Ack, handleAck);
      this._signal.off(SignalMessageType.Error, handleError);
      return SignalResult.handled;
    };

    const handleError = async (message: SignalMessageError) => {
      if (message.id !== subscriptionId) return;
      await removeSubscription();
      return SignalResult.handled;
    };

    subscription.onUnsubscribe = async () => {
      await unsubscribe();
      await removeSubscription();
    };

    this._signal.on(SignalMessageType.Ack, handleAck);
    this._signal.on(SignalMessageType.Error, handleError);
    this._signal.on(SignalMessageType.Data, handleData);

    await this._acquireSignalLock();
    await this._signal.send<SignalDatabaseSubscribe>({
      type: SignalMessageType.Subscribe,
      id: subscriptionId,
      topic,
      fields: options.fields,
      filter: options.filter,
    });

    return subscription;
  }
}

export type DatabaseRowId = SignalDatabaseRowId;
export type DatabaseRow = SignalDatabaseRow;

/**
 * Path template for database observations with autocomplete support
 * @public
 */
export type DatabaseObservePath<Table extends string = string> =
  | `${Table}.insert`
  | `${Table}.update`
  | `${Table}.delete`;

/**
 * Event-specific observer interface for insert operations
 * @public
 */
export interface DatabaseInsertObserver<T> {
  on(event: 'insert', handler: DatabaseSubscriptionInsertHandler<T>): this;
  subscribe(): Promise<DatabaseSubscription>;
}

/**
 * Event-specific observer interface for update operations
 * @public
 */
export interface DatabaseUpdateObserver<T> {
  on(event: 'update', handler: DatabaseSubscriptionUpdateHandler<T>): this;
  subscribe(): Promise<DatabaseSubscription>;
}

/**
 * Event-specific observer interface for delete operations
 * @public
 */
export interface DatabaseDeleteObserver {
  on(event: 'delete', handler: DatabaseSubscriptionDeleteHandler): this;
  subscribe(): Promise<DatabaseSubscription>;
}

/**
 * Conditional type mapping for event-specific observers
 * @public
 */
export type DatabaseObserverForEvent<
  T,
  Path extends DatabaseObservePath,
> = Path extends `${string}.insert`
  ? DatabaseInsertObserver<T>
  : Path extends `${string}.update`
    ? DatabaseUpdateObserver<T>
    : Path extends `${string}.delete`
      ? DatabaseDeleteObserver
      : never;

export interface DatabaseSubscriptionInsertHandler<T = DatabaseRow> {
  (event: { rows: Partial<T>[] }): Promise<void> | void;
}

export interface DatabaseSubscriptionUpdateHandler<T = DatabaseRow> {
  (event: { rows: Partial<T>[] }): Promise<void> | void;
}

export interface DatabaseSubscriptionDeleteHandler {
  (event: { rowIds: DatabaseRowId[] }): Promise<void> | void;
}

export interface DatabaseSubscription {
  readonly active: boolean;

  unsubscribe: () => Promise<void>;
}

class DatabaseSubscriptionInternal implements DatabaseSubscription {
  private _active = true;
  private _unsubscribe: (() => Promise<void>) | null = null;

  set active(value: boolean) {
    this._active = value;
  }

  get active() {
    return this._active;
  }

  set onUnsubscribe(fn: () => Promise<void>) {
    this._unsubscribe = fn;
  }

  unsubscribe = async () => {
    if (this._active) {
      this._active = false;
      if (this._unsubscribe) {
        await this._unsubscribe();
      }
    }
  };
}

interface DatabaseSubscribeOptions<T = DatabaseRow> {
  table: string;
  event: DatabaseSubscriptionEvent;
  fields?: string[];
  filter?: SignalFilter;
  onInsert?: DatabaseSubscriptionInsertHandler<T>;
  onUpdate?: DatabaseSubscriptionUpdateHandler<T>;
  onDelete?: DatabaseSubscriptionDeleteHandler;
}

interface DatabaseSubscribe<T> {
  (options: DatabaseSubscribeOptions<T>): Promise<DatabaseSubscription>;
}

class DatabaseObserver<
    T,
    const Fields extends readonly DotPaths<T>[] | undefined = undefined,
    Data = Fields extends readonly DotPaths<T>[] ? ProjectedType<T, Fields> : T,
  >
  implements
    DatabaseInsertObserver<Data>,
    DatabaseUpdateObserver<Data>,
    DatabaseDeleteObserver
{
  private _fields: string[] | undefined;
  private _filter: SignalFilter<T> | undefined;
  private _insertHandler: DatabaseSubscriptionInsertHandler<Data> | undefined;
  private _updateHandler: DatabaseSubscriptionUpdateHandler<Data> | undefined;
  private _deleteHandler: DatabaseSubscriptionDeleteHandler | undefined;

  constructor(
    private _subscribe: DatabaseSubscribe<Data>,
    private _table: string,
    private _event: DatabaseSubscriptionEvent
  ) {}

  // fields<const F extends readonly DotPaths<Data>[]>(fields: F) {
  //   this._fields = [fields].flat();
  //   return this as DatabaseObserver<Data, F>;
  // }

  // filter(filter: SignalFilter<T>) {
  //   this._filter = filter;
  //   return this;
  // }

  on(event: 'insert', handler: DatabaseSubscriptionInsertHandler<Data>): this;
  on(event: 'update', handler: DatabaseSubscriptionUpdateHandler<Data>): this;
  on(event: 'delete', handler: DatabaseSubscriptionDeleteHandler): this;
  // on(event: 'error', handler: (error: Error) => void): this;

  on(event: DatabaseSubscriptionEvent, handler: any) {
    if (event === 'insert') {
      this._insertHandler = handler;
    } else if (event === 'update') {
      this._updateHandler = handler;
    } else if (event === 'delete') {
      this._deleteHandler = handler;
    }
    return this;
  }

  async subscribe(): Promise<DatabaseSubscription> {
    return this._subscribe({
      table: this._table,
      event: this._event,
      fields: this._fields,
      filter: this._filter,
      onInsert: this._insertHandler,
      onUpdate: this._updateHandler,
      onDelete: this._deleteHandler,
    });
  }
}

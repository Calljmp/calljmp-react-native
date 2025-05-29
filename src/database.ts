/**
 * @fileoverview Database query API for executing SQL operations on the backend SQLite database.
 *
 * Provides full SQLite database access with no restrictions, allowing raw SQL queries
 * to be executed on the backend database with proper authentication and security.
 */

import { Config } from './config';
import { access } from './middleware/access';
import { context } from './middleware/context';
import { request } from './request';
import { SecureStore } from './secure-store';

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
  /**
   * Creates a new Database instance.
   *
   * @param _config - SDK configuration containing API endpoints
   * @param _store - Secure storage for access tokens and authentication
   *
   * @internal
   */
  constructor(
    private _config: Config,
    private _store: SecureStore
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
}

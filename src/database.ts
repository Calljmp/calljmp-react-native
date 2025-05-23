import { Config } from './config';
import { access } from './middleware/access';
import { context } from './middleware/context';
import { request } from './request';
import { SecureStore } from './secure-store';

/**
 * Provides database query APIs for executing SQL queries on the backend.
 */
export class Database {
  /**
   * @param _config SDK configuration
   * @param _store Secure storage for tokens
   */
  constructor(
    private _config: Config,
    private _store: SecureStore
  ) {}

  /**
   * Executes a SQL query on the backend database.
   * @param sql SQL query string
   * @param params Optional query parameters
   * @returns Query result with rows and metadata
   */
  async query({ sql, params }: { sql: string; params?: (string | number)[] }) {
    const result = await request(`${this._config.serviceUrl}/database/query`)
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
    return result;
  }
}

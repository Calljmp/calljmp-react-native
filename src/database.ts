import { Config } from './config';
import { access } from './middleware/access';
import { context } from './middleware/context';
import { request } from './request';
import { SecureStore } from './secure-store';

export class Database {
  constructor(
    private _config: Config,
    private _store: SecureStore
  ) {}

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

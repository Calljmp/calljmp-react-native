import { jsonToUser } from '../common';
import { Attestation } from '../attestation';
import { Config } from '../config';
import { context } from '../middleware/context';
import { request } from '../request';
import { SecureStore } from '../secure-store';
import { access } from '../middleware/access';
import { Auth } from './auth';

export class Users {
  public readonly auth: Auth;

  constructor(
    private _config: Config,
    attestation: Attestation,
    private _store: SecureStore
  ) {
    this.auth = new Auth(_config, attestation, _store);
  }

  async retrieve() {
    const result = await request(`${this._config.serviceUrl}/users`)
      .use(context(this._config), access(this._store))
      .get()
      .json();
    return {
      data: result.data && jsonToUser(result.data),
      error: result.error,
    };
  }
}

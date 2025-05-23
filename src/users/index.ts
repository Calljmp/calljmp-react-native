import { jsonToUser } from '../common';
import { Attestation } from '../attestation';
import { Config } from '../config';
import { context } from '../middleware/context';
import { request } from '../request';
import { SecureStore } from '../secure-store';
import { access } from '../middleware/access';
import { Auth } from './auth';

/**
 * Provides user management and authentication APIs.
 */
export class Users {
  /** User authentication API */
  public readonly auth: Auth;

  /**
   * @param _config SDK configuration
   * @param attestation Device attestation provider
   * @param _store Secure storage for tokens
   */
  constructor(
    private _config: Config,
    attestation: Attestation,
    private _store: SecureStore
  ) {
    this.auth = new Auth(_config, attestation, _store);
  }

  /**
   * Retrieves the current authenticated user, if any.
   * @returns User data and error (if any)
   */
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

import { AccessToken } from './access';
import { Config } from './config';
import { Integrity } from './integrity';
import { access } from './middleware/access';
import { context } from './middleware/context';
import { request } from './request';
import { SecureStore } from './secure-store';

/**
 * Provides access to backend service APIs, including access token management.
 */
export class Service {
  /**
   * @param _config SDK configuration
   * @param _integrity Device integrity provider
   * @param _store Secure storage for tokens
   */
  constructor(
    private _config: Config,
    private _integrity: Integrity,
    private _store: SecureStore
  ) {}

  /**
   * Resolves and returns a valid access token, refreshing if needed.
   * @returns Access token data and error (if any)
   */
  private async _resolveAccess() {
    let token = await this._store.get('accessToken');
    if (token) {
      const { data: accessToken } = AccessToken.tryParse(token);
      if (accessToken && accessToken.isValid) {
        return {
          data: accessToken,
          error: undefined,
        };
      }
      await this._store.delete('accessToken');
    }

    const result = await this._integrity.access();
    if (result.error) {
      return result;
    }

    token = await this._store.get('accessToken');
    if (!token) {
      return {
        data: undefined,
        error: new Error('Failed to get access token'),
      };
    }

    const { data: accessToken, error } = AccessToken.tryParse(token);
    if (!accessToken || error) {
      return {
        data: undefined,
        error: new Error('Failed to parse access token', { cause: error }),
      };
    }

    if (accessToken.isExpired) {
      return {
        data: undefined,
        error: new Error('Access token is expired'),
      };
    }

    return {
      data: accessToken,
      error: undefined,
    };
  }

  /**
   * Returns the service URL based on the current configuration.
   * If development mode is enabled and a baseUrl is set, returns that.
   * Otherwise, returns the default service URL.
   * @returns An object containing the URL and an optional error.
   */
  async url() {
    if (this._config.development?.enabled && this._config.service?.baseUrl) {
      return {
        data: {
          url: this._config.service.baseUrl,
        },
        error: undefined,
      };
    }
    return {
      data: {
        url: `${this._config.serviceUrl}/service`,
      },
      error: undefined,
    };
  }

  /**
   * Retrieves a valid access token, refreshing it if necessary.
   * @returns An object containing the access token and an optional error.
   */
  async accessToken() {
    const access = await this._resolveAccess();
    if (access.error) {
      return access;
    }
    return {
      data: access.data,
      error: undefined,
    };
  }

  /**
   * Creates a request object for the given route, applying context and access middleware.
   * @param route The API route (default is '/').
   * @returns A request object with middleware applied.
   */
  request(route = '/') {
    return request(
      this.url().then(result => {
        if (result.error) {
          throw result.error;
        }
        const sanitizedRoute = route.replace(/^\//, '');
        return `${result.data.url}/${sanitizedRoute}`;
      })
    ).use(context(this._config), access(this._store));
  }
}

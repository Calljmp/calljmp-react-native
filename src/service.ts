import { AccessToken } from './access';
import { Config } from './config';
import { Integrity } from './integrity';
import { access } from './middleware/access';
import { context } from './middleware/context';
import { request } from './request';
import { SecureStore } from './secure-store';

export class Service {
  constructor(
    private _config: Config,
    private _integrity: Integrity,
    private _store: SecureStore
  ) {}

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

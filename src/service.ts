import { AccessToken } from './access';
import { Config } from './config';
import { Integrity } from './integrity';
import { access } from './middleware/access';
import { context } from './middleware/context';
import { request } from './request';
import { SecureStore } from './secure-store';

export class Service {
  private _serviceId: string | null;

  constructor(
    private _config: Config,
    private _integrity: Integrity,
    private _store: SecureStore
  ) {
    this._serviceId = _config.service?.serviceId ?? null;
  }

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

  async id() {
    if (this._serviceId) {
      return {
        data: {
          id: this._serviceId,
        },
        error: undefined,
      };
    }
    const access = await this._resolveAccess();
    if (access.error) {
      return access;
    }
    try {
      if (!access.data.serviceUuid) {
        throw new Error('Service is not configured');
      }
      this._serviceId = access.data.serviceUuid;
      return {
        data: {
          id: access.data.serviceUuid,
        },
        error: undefined,
      };
    } catch (error) {
      return {
        data: undefined,
        error: new Error('Failed to decode access token', { cause: error }),
      };
    }
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
    const serviceId = await this.id();
    if (serviceId.error) {
      return serviceId;
    }
    return {
      data: {
        url: `${this._config.serviceUrl}/service/${serviceId.data.id}`,
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

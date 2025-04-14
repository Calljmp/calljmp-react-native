import { decodeAccessToken } from './access';
import { Config } from './config';
import { Integrity } from './integrity';
import { access } from './middleware/access';
import { context } from './middleware/context';
import { request } from './request';
import { Store } from './store';

export class Service {
  private _serviceId: string | null;

  constructor(
    private _config: Config,
    private _integrity: Integrity,
    private _store: Store
  ) {
    this._serviceId = _config.service?.serviceId ?? null;
  }

  private async _maybeAccess() {
    const accessToken = await this._store.secureGet('accessToken');
    if (!accessToken) {
      const result = await this._integrity.access();
      if (result.error) {
        return result;
      }
      await this._store.securePut('accessToken', result.data.accessToken);
      return {
        data: result.data,
        error: undefined,
      };
    }
    return {
      data: { accessToken },
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
    const accessResult = await this._maybeAccess();
    if (accessResult.error) {
      return accessResult;
    }
    try {
      const { serviceUuid } = decodeAccessToken(accessResult.data.accessToken);
      if (!serviceUuid) {
        throw new Error('Service is not configured');
      }
      this._serviceId = serviceUuid;
      return {
        data: {
          id: serviceUuid,
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
    const result = await this._maybeAccess();
    if (result.error) {
      return result;
    }
    return {
      data: result.data.accessToken,
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

/**
 * @fileoverview Service API for making authenticated requests to custom backend endpoints.
 *
 * Provides access to backend service APIs with automatic access token management,
 * enabling integration with custom backend logic and third-party services.
 */

import { AccessToken } from './access';
import { Config } from './config';
import { Integrity } from './integrity';
import { access } from './middleware/access';
import { context } from './middleware/context';
import { request } from './request';
import { SecureStore } from './secure-store';

/**
 * Provides access to backend service APIs with automatic authentication and token management.
 *
 * The Service class enables you to make authenticated requests to custom backend endpoints
 * and third-party integrations. It automatically handles access token acquisition, refresh,
 * and attachment to requests, ensuring secure communication with your backend services.
 *
 * @example Making a service request
 * ```typescript
 * // Get current access token
 * const tokenResult = await sdk.service.accessToken();
 * if (tokenResult.error) {
 *   console.error('Failed to get access token:', tokenResult.error);
 *   return;
 * }
 *
 * // Make authenticated request to custom endpoint
 * const response = await sdk.service.request('/custom-endpoint')
 *   .post({ data: 'example' })
 *   .json();
 * ```
 *
 * @public
 */
export class Service {
  /**
   * Creates a new Service instance.
   *
   * @param _config - SDK configuration containing API endpoints and settings
   * @param _integrity - Device integrity provider for attestation and access token acquisition
   * @param _store - Secure storage for access tokens and sensitive data
   *
   * @internal
   */
  constructor(
    private _config: Config,
    private _integrity: Integrity,
    private _store: SecureStore
  ) {}

  /**
   * Resolves and returns a valid access token, automatically refreshing if needed.
   *
   * This internal method handles the complex logic of access token management:
   * - Checks if a stored token exists and is valid
   * - Automatically refreshes expired tokens through device integrity attestation
   * - Handles token parsing and validation errors
   *
   * @returns A promise that resolves to an object containing the access token or an error
   *
   * @internal
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
   * Returns the appropriate service URL based on current configuration.
   *
   * In development mode with a custom service baseUrl, returns that URL.
   * Otherwise, returns the default service URL for production usage.
   *
   * @returns An object containing the resolved service URL and any error that occurred
   *
   * @example
   * ```typescript
   * const urlResult = sdk.service.url;
   * if (urlResult.error) {
   *   console.error('Failed to get service URL:', urlResult.error);
   * } else {
   *   console.log('Service URL:', urlResult.data.url);
   * }
   * ```
   */
  get url() {
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
   * Retrieves a valid access token for authenticated API requests.
   *
   * This method ensures you have a valid, non-expired access token for making
   * authenticated requests to backend services. It automatically handles token
   * refresh through device attestation if the current token is expired or missing.
   *
   * @returns A promise that resolves to an object containing the access token and any error
   *
   * @throws {Error} When device attestation fails or network errors occur
   *
   * @example Get and use access token
   * ```typescript
   * const tokenResult = await sdk.service.accessToken();
   * if (tokenResult.error) {
   *   console.error('Authentication failed:', tokenResult.error);
   *   return;
   * }
   *
   * const token = tokenResult.data;
   * console.log('User ID:', token.userId);
   * console.log('Token expires:', new Date(token.exp * 1000));
   * ```
   *
   * @remarks
   * - Automatically refreshes expired tokens using device integrity attestation
   * - Caches valid tokens in secure storage to avoid unnecessary network requests
   * - Returns user information embedded in the token claims
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
   * Creates an authenticated request object for making API calls to service endpoints.
   *
   * This method creates a pre-configured request object that automatically includes
   * authentication headers and context middleware. It's the recommended way to make
   * requests to custom backend endpoints.
   *
   * @param route - The API route path (default: '/') - leading slash is optional
   *
   * @returns A configured request object with authentication and context middleware applied
   *
   * @example Simple GET request
   * ```typescript
   * const response = await sdk.service.request('/users/profile')
   *   .get()
   *   .json();
   *
   * if (response.error) {
   *   console.error('Request failed:', response.error);
   * } else {
   *   console.log('Profile data:', response.data);
   * }
   * ```
   *
   * @example POST request with data
   * ```typescript
   * const response = await sdk.service.request('/users/update')
   *   .post({
   *     name: 'John Doe',
   *     email: 'john@example.com'
   *   })
   *   .json();
   * ```
   *
   * @example Request with query parameters
   * ```typescript
   * const response = await sdk.service.request('/search')
   *   .params({ q: 'react native', limit: 10 })
   *   .get()
   *   .json();
   * ```
   *
   * @remarks
   * - Automatically includes authentication headers (Bearer token)
   * - Adds platform information (iOS/Android) to request headers
   * - Handles development mode tokens when configured
   * - Leading slashes in routes are automatically normalized
   */
  request(route = '/') {
    const sanitizedRoute = route.replace(/^\//, '');
    return request(`${this.url}/${sanitizedRoute}`).use(
      context(this._config),
      access(this._store)
    );
  }
}

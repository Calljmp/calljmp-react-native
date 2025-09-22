import { AccessToken } from '../access';
import { Integrity } from '../integrity';
import { SecureStore } from '../secure-store';

export class AccessResolver {
  constructor(
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
  async resolve() {
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
}

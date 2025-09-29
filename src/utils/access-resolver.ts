import { AccessToken } from '../access';
import { Integrity } from '../integrity';
import { SecureStore } from '../secure-store';

export class AccessResolver {
  private _accessToken: AccessToken | null = null;

  constructor(
    private readonly _integrity: Integrity,
    private readonly _store: SecureStore
  ) {}

  /**
   * Clears the stored access token from memory and secure storage.
   *
   * This method is useful for logging out or resetting the authentication state.
   *
   * @returns A promise that resolves when the token has been cleared
   *
   * @public
   */
  async clear() {
    this._accessToken = null;
    await this._store.delete('accessToken');
  }

  /**
   * Stores a new access token in memory and secure storage.
   *
   * This method is typically called after successful authentication or token refresh.
   *
   * @param token - The access token to store
   * @returns A promise that resolves when the token has been stored
   *
   * @public
   */
  async put(token: AccessToken) {
    this._accessToken = token;
    await this._store.put('accessToken', token.toString());
  }

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
    if (this._accessToken && this._accessToken.isValid) {
      return {
        data: this._accessToken,
        error: undefined,
      };
    }

    const token = await this._store.get('accessToken');
    if (token) {
      const { data: accessToken } = AccessToken.tryParse(token);
      if (accessToken && accessToken.isValid) {
        this._accessToken = accessToken;
        return {
          data: accessToken,
          error: undefined,
        };
      }
      await this.clear();
    }

    const integrityResult = await this._integrity.access();
    if (integrityResult.error) {
      return integrityResult;
    }

    const { data: accessToken, error } = AccessToken.tryParse(
      integrityResult.data.accessToken
    );
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

    await this.put(accessToken);
    return {
      data: accessToken,
      error: undefined,
    };
  }
}

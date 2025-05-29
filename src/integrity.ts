/**
 * @fileoverview Device integrity and access token management for secure API authentication.
 *
 * Handles device integrity verification and access token lifecycle management,
 * providing the foundation for secure authenticated API requests.
 */

import { Attestation } from './attestation';
import { Config } from './config';
import { request } from './request';
import { context } from './middleware/context';
import { SecureStore } from './secure-store';
import { AccessToken } from './access';

/**
 * Provides device integrity verification and access token management for secure API authentication.
 *
 * The Integrity class is responsible for establishing and maintaining the security foundation
 * for all API requests. It combines device attestation with access token management to ensure
 * that only legitimate, verified devices can access backend services.
 *
 * This class handles:
 * - Device integrity challenges and verification
 * - Access token acquisition through attestation
 * - Token lifecycle management (validation, refresh, clearing)
 * - Authentication state management
 *
 * @example Check device authentication status
 * ```typescript
 * const isAuthenticated = await sdk.integrity.authenticated();
 * if (!isAuthenticated) {
 *   console.log('Device needs to authenticate');
 *   const result = await sdk.integrity.access();
 *   if (result.error) {
 *     console.error('Authentication failed:', result.error);
 *   }
 * }
 * ```
 *
 * @example Manual integrity verification
 * ```typescript
 * // Get challenge from backend
 * const challengeResult = await sdk.integrity.challenge();
 * if (challengeResult.error) {
 *   console.error('Failed to get challenge:', challengeResult.error);
 *   return;
 * }
 *
 * // Perform attestation and get access token
 * const accessResult = await sdk.integrity.access({
 *   challengeToken: challengeResult.data.challengeToken
 * });
 * ```
 *
 * @public
 */
export class Integrity {
  /**
   * Creates a new Integrity instance.
   *
   * @param _config - SDK configuration containing API endpoints and settings
   * @param _attestation - Device attestation provider for platform-specific verification
   * @param _store - Secure storage for access tokens and sensitive data
   *
   * @internal
   */
  constructor(
    private _config: Config,
    private _attestation: Attestation,
    private _store: SecureStore
  ) {}

  /**
   * Requests a new integrity challenge token from the backend.
   *
   * Challenge tokens are used in the attestation process to prevent replay attacks
   * and ensure that attestation requests are fresh and legitimate. Each challenge
   * token is typically single-use and time-limited.
   *
   * @returns A promise that resolves to an object containing the challenge token
   *
   * @throws {ServiceError} When the request fails due to network or server errors
   *
   * @example Get a challenge token
   * ```typescript
   * const result = await sdk.integrity.challenge();
   * if (result.error) {
   *   console.error('Failed to get challenge:', result.error);
   * } else {
   *   console.log('Challenge token:', result.data.challengeToken);
   * }
   * ```
   *
   * @remarks
   * - Challenge tokens are typically valid for a short period (e.g., 5-10 minutes)
   * - Each token should only be used once for attestation
   * - The token includes cryptographic randomness to prevent prediction
   */
  async challenge() {
    return request(`${this._config.serviceUrl}/integrity/challenge`)
      .use(context(this._config))
      .get()
      .json<{ challengeToken: string }>();
  }

  /**
   * Checks if the current device has a valid access token and is authenticated.
   *
   * This method verifies that:
   * - An access token exists in secure storage
   * - The token can be parsed successfully
   * - The token is not expired
   *
   * This is useful for determining if the device needs to go through the
   * attestation process to obtain a new access token.
   *
   * @returns A promise that resolves to true if authenticated, false otherwise
   *
   * @example Check authentication before making API calls
   * ```typescript
   * if (await sdk.integrity.authenticated()) {
   *   // Device is authenticated, can make API calls
   *   const result = await sdk.database.query({ sql: 'SELECT * FROM users' });
   * } else {
   *   // Need to authenticate first
   *   console.log('Device not authenticated, performing attestation...');
   *   await sdk.integrity.access();
   * }
   * ```
   *
   * @remarks
   * - Returns false if no token exists, token is malformed, or token is expired
   * - This check is performed locally and doesn't make network requests
   * - Consider calling this before making authenticated API requests
   */
  async authenticated() {
    const token = await this._store.get('accessToken');
    if (token) {
      const { data: accessToken } = AccessToken.tryParse(token);
      if (accessToken) {
        return accessToken.isValid;
      }
    }
    return false;
  }

  /**
   * Clears the current access token from secure storage, effectively logging out the device.
   *
   * This method removes the stored access token, which will require the device to
   * go through the attestation process again to obtain a new token for future
   * authenticated requests.
   *
   * @returns A promise that resolves when the token is cleared
   *
   * @example Clear authentication on logout
   * ```typescript
   * await sdk.integrity.clear();
   * console.log('Device authentication cleared');
   * ```
   *
   * @remarks
   * - This only clears the local token, it doesn't invalidate the token on the server
   * - After calling this method, `authenticated()` will return false
   * - Subsequent API calls will need to re-authenticate through `access()`
   */
  async clear() {
    await this._store.delete('accessToken');
  }

  /**
   * Performs device attestation and acquires an access token for authenticated API requests.
   *
   * This is the core method for establishing device authentication. It performs the following steps:
   * 1. Obtains a challenge token from the backend (if not provided)
   * 2. Performs platform-specific device attestation with the challenge
   * 3. Sends the attestation proof to the backend
   * 4. Receives and stores an access token for future authenticated requests
   *
   * The access token enables the device to make authenticated API calls to database,
   * user management, and other secured endpoints.
   *
   * @param options - Optional parameters for the attestation process
   * @param options.challengeToken - Pre-existing challenge token (if available)
   *
   * @returns A promise that resolves to success/error result
   *
   * @throws {Error} When attestation fails or network errors occur
   *
   * @example Basic device authentication
   * ```typescript
   * const result = await sdk.integrity.access();
   * if (result.error) {
   *   console.error('Device attestation failed:', result.error);
   * } else {
   *   console.log('Device successfully authenticated');
   *   // Now can make authenticated API calls
   * }
   * ```
   *
   * @example Using pre-existing challenge token
   * ```typescript
   * const challengeResult = await sdk.integrity.challenge();
   * if (challengeResult.data) {
   *   const accessResult = await sdk.integrity.access({
   *     challengeToken: challengeResult.data.challengeToken
   *   });
   * }
   * ```
   *
   * @remarks
   * - **iOS**: Uses App Attestation to prove device and app authenticity
   * - **Android**: Uses Play Integrity API to verify device and app integrity
   * - Attestation may fail on compromised devices, emulators, or debug environments
   * - The acquired access token is automatically stored in secure storage
   * - Token is used automatically by other SDK methods for authentication
   * - In development mode on simulators, attestation failures are logged as warnings
   */
  async access({
    challengeToken,
  }: {
    challengeToken?: string;
  } = {}) {
    if (!challengeToken) {
      const result = await this.challenge();
      if (result.error) {
        return result;
      }
      challengeToken = result.data.challengeToken;
    }

    const attest = await this._attestation
      .attest({ token: challengeToken })
      .catch(e => {
        console.warn(
          'Failed to attest, this is a fatal error unless it is in development mode on simulator.',
          e
        );
        return null;
      });
    const attestationToken = btoa(JSON.stringify(attest));

    const result = await request(`${this._config.serviceUrl}/integrity/access`)
      .use(context(this._config))
      .post({
        token: challengeToken,
        attestationToken,
      })
      .json<{ accessToken: string }>();
    if (result.error) {
      return result;
    }

    await this._store.put('accessToken', result.data.accessToken);
    return {
      data: {},
      error: undefined,
    };
  }
}

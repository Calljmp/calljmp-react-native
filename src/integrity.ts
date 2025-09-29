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
import { accessSupport } from './middleware/access';

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
    private _attestation: Attestation
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
      .catch(() => {
        console.info(
          '[Integrity] Attestation failed - this may happen on simulators or debug environments'
        );
        return null;
      });
    const attestationToken = btoa(JSON.stringify(attest));

    return request(`${this._config.serviceUrl}/integrity/access`)
      .use(context(this._config), accessSupport(this._config))
      .post({
        token: challengeToken,
        attestationToken,
        devApiToken:
          this._config.development?.enabled &&
          this._config.development?.apiToken,
      })
      .json<{ accessToken: string }>();
  }
}

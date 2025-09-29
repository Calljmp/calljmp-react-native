/**
 * @fileoverview User authentication functionality for the Calljmp SDK.
 *
 * This module provides comprehensive user authentication capabilities including:
 * - Email-based authentication with verification
 * - Password management (reset/change)
 * - Challenge-response authentication flow
 * - Secure token storage and management
 * - Device attestation integration
 *
 * The authentication system uses a challenge-response pattern combined with
 * device attestation to ensure secure user authentication. Email verification
 * is used for account validation and password recovery.
 *
 * @example Basic email authentication
 * ```typescript
 * const auth = new Auth(config, attestation, secureStore);
 *
 * // Start email verification
 * const { data: verifyResult } = await auth.email.verify({
 *   email: 'user@example.com',
 *   provider: UserAuthenticationProvider.EmailPassword
 * });
 *
 * // User enters verification code, then authenticate
 * const { data: user, error } = await auth.email.authenticate({
 *   email: 'user@example.com',
 *   password: 'userPassword',
 *   challengeToken: verifyResult.challengeToken
 * });
 *
 * if (error) {
 *   console.error('Authentication failed:', error.message);
 * } else {
 *   console.log('User authenticated:', user);
 * }
 * ```
 *
 * @example Password reset flow
 * ```typescript
 * // Initiate password reset
 * const { data: resetData } = await auth.email.forgotPassword({
 *   email: 'user@example.com'
 * });
 *
 * // User receives email with code, then reset password
 * const { error } = await auth.email.resetPassword({
 *   email: 'user@example.com',
 *   password: 'newPassword',
 *   challengeToken: resetData.challengeToken
 * });
 * ```
 *
 * @example Check authentication status
 * ```typescript
 * const isAuthenticated = await auth.email.authenticated();
 * if (!isAuthenticated) {
 *   // Redirect to login
 * }
 * ```
 *
 * @public
 */

import { Attestation } from '../../attestation';
import { Config } from '../../config';
import { context } from '../../middleware/context';
import { request } from '../../request';
import { Provider } from './provider';
import { Email } from './email';
import { UserAuthenticationProvider } from '../../common';
import { AccessResolver } from '../../utils/access-resolver';

/**
 * Main authentication class providing access to various authentication methods.
 *
 * The Auth class serves as the central hub for all authentication operations
 * in the Calljmp SDK. It provides access to email-based authentication and
 * manages the overall authentication state and challenge tokens.
 *
 * Features:
 * - Email authentication with verification
 * - Challenge token generation and management
 * - Secure token storage and cleanup
 * - Device attestation integration
 *
 * @example
 * ```typescript
 * const auth = new Auth(config, attestation, secureStore);
 *
 * // Use email authentication
 * const { data: user, error } = await auth.email.authenticate({
 *   email: 'user@example.com',
 *   password: 'userPassword'
 * });
 *
 * // Clear authentication state
 * await auth.clear();
 * ```
 *
 * @public
 */
export class Auth {
  /**
   * Email authentication provider instance.
   *
   * Provides access to all email-based authentication methods including
   * verification, password management, and user authentication.
   *
   * @public
   */
  readonly email: Email;

  /**
   * Apple authentication provider instance.
   *
   * Provides access to Apple ID authentication methods, allowing users to sign in with their Apple accounts.
   *
   * @public
   */
  readonly apple: Provider;

  /**
   * Google authentication provider instance.
   *
   * Provides access to Google account authentication methods, allowing users to sign in with their Google accounts.
   */
  readonly google: Provider;

  /**
   * Creates a new Auth instance with the specified configuration and dependencies.
   *
   * @param _config - SDK configuration containing service URLs and settings
   * @param attestation - Device attestation provider for security verification
   * @param _store - Secure storage for access tokens and sensitive data
   *
   * @public
   */
  constructor(
    private _config: Config,
    attestation: Attestation,
    private _access: AccessResolver
  ) {
    this.email = new Email(_config, attestation, _access, this);
    this.apple = new Provider(
      UserAuthenticationProvider.Apple,
      _config,
      attestation,
      _access,
      this
    );
    this.google = new Provider(
      UserAuthenticationProvider.Google,
      _config,
      attestation,
      _access,
      this
    );
  }

  /**
   * Checks if the current user is authenticated.
   *
   * Verifies authentication by checking for a valid, non-expired access token
   * in secure storage. The token must be associated with a specific user ID.
   *
   * @returns Promise resolving to true if authenticated, false otherwise
   *
   * @example
   * ```typescript
   * if (await auth.authenticated()) {
   *   // User is logged in, proceed with authenticated operations
   *   console.log('User is authenticated');
   * } else {
   *   // Redirect to login screen
   *   showLoginScreen();
   * }
   * ```
   *
   * @public
   */
  async authenticated() {
    const { data: token } = await this._access.resolve();
    return token?.isValid === true && token.userId !== null;
  }

  /**
   * Requests a new authentication challenge token from the backend service.
   *
   * Challenge tokens are used as part of the secure authentication flow and
   * must be obtained before performing user authentication or password operations.
   * These tokens have a limited lifespan and ensure request authenticity.
   *
   * @returns Promise resolving to an object containing the challenge token
   *
   * @example
   * ```typescript
   * const { data, error } = await auth.challenge();
   *
   * if (error) {
   *   console.error('Failed to get challenge token:', error.message);
   * } else {
   *   console.log('Challenge token:', data.challengeToken);
   *   // Use token for subsequent authentication operations
   * }
   * ```
   *
   * @public
   */
  async challenge() {
    return request(`${this._config.serviceUrl}/users/auth/challenge`)
      .use(context(this._config))
      .get()
      .json<{ challengeToken: string }>();
  }

  /**
   * Clears the stored access token, effectively logging the user out.
   *
   * This method removes the access token from secure storage, which will
   * cause subsequent authentication checks to fail. This is the recommended
   * way to implement user logout functionality.
   *
   * @returns Promise that resolves when the token is successfully deleted
   *
   * @example
   * ```typescript
   * // Logout user
   * await auth.clear();
   *
   * // Verify user is logged out
   * const isAuthenticated = await auth.authenticated();
   * console.log('User logged out:', !isAuthenticated);
   *
   * // Redirect to login screen
   * navigateToLogin();
   * ```
   *
   * @public
   */
  async clear() {
    await this._access.clear();
  }
}

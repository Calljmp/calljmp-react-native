/**
 * @fileoverview User management and authentication API for the Calljmp SDK.
 *
 * This module provides the main `Users` class that serves as the entry point
 * for all user-related operations including authentication, user profile
 * management, and user data retrieval.
 *
 * The Users class combines authentication capabilities with user management
 * functionality, providing a unified interface for user operations.
 *
 * @example Basic user operations
 * ```typescript
 * const users = new Users(config, attestation, secureStore);
 *
 * // Authenticate user
 * const { data: user, error } = await users.auth.email.authenticate({
 *   email: 'user@example.com',
 *   password: 'userPassword'
 * });
 *
 * if (user) {
 *   // Retrieve current user profile
 *   const { data: profile } = await users.retrieve();
 *   console.log('User profile:', profile);
 * }
 * ```
 *
 * @example Check authentication and retrieve user
 * ```typescript
 * // Check if user is authenticated
 * if (await users.auth.email.authenticated()) {
 *   // Get current user data
 *   const { data: user, error } = await users.retrieve();
 *
 *   if (error) {
 *     console.error('Failed to retrieve user:', error.message);
 *   } else {
 *     console.log('Current user:', user);
 *   }
 * }
 * ```
 *
 * @public
 */

import { jsonToUser } from '../common';
import { Attestation } from '../attestation';
import { Config } from '../config';
import { context } from '../middleware/context';
import { request } from '../request';
import { access } from '../middleware/access';
import { Auth } from './auth';
import { AccessResolver } from '../utils/access-resolver';

/**
 * Provides comprehensive user management and authentication APIs.
 *
 * The Users class serves as the main interface for all user-related operations
 * in the Calljmp SDK. It combines authentication functionality with user
 * profile management, providing a unified API for user operations.
 *
 * Key features:
 * - User authentication (email-based)
 * - User profile retrieval
 * - Authentication state management
 * - Secure token handling
 *
 * @example
 * ```typescript
 * const users = new Users(config, attestation, secureStore);
 *
 * // Complete authentication flow
 * const { data: verifyResult } = await users.auth.email.verify({
 *   email: 'user@example.com',
 *   provider: 'email'
 * });
 *
 * const { data: user } = await users.auth.email.authenticate({
 *   email: 'user@example.com',
 *   password: 'userPassword',
 *   challengeToken: verifyResult.challengeToken
 * });
 *
 * // Get user profile
 * const { data: profile } = await users.retrieve();
 * ```
 *
 * @public
 */
export class Users {
  /**
   * User authentication API providing email-based authentication methods.
   *
   * Access to comprehensive authentication functionality including email
   * verification, password management, and secure user login/registration.
   *
   * @example
   * ```typescript
   * // Use authentication API
   * const { data: user } = await users.auth.email.authenticate({
   *   email: 'user@example.com',
   *   password: 'userPassword'
   * });
   *
   * // Check authentication status
   * const isAuthenticated = await users.auth.email.authenticated();
   * ```
   *
   * @public
   */
  public readonly auth: Auth;

  /**
   * Creates a new Users instance with the specified configuration and dependencies.
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
    this.auth = new Auth(_config, attestation, _access);
  }

  /**
   * Retrieves the current authenticated user's profile data.
   *
   * Fetches the complete user profile for the currently authenticated user.
   * This method requires a valid authentication token and will return an
   * error if the user is not authenticated or the token has expired.
   *
   * @returns Promise resolving to the user profile data or an error
   *
   * @example
   * ```typescript
   * const { data: user, error } = await users.retrieve();
   *
   * if (error) {
   *   console.error('Failed to retrieve user:', error.message);
   *
   *   // Handle specific error cases
   *   if (error.code === 'UNAUTHORIZED') {
   *     // Redirect to login
   *     await users.auth.clear();
   *     navigateToLogin();
   *   }
   * } else {
   *   console.log('User profile:', user);
   *   console.log('User ID:', user.id);
   *   console.log('Email:', user.email);
   *   console.log('Name:', user.name);
   * }
   * ```
   *
   * @example Check authentication before retrieving
   * ```typescript
   * if (await users.auth.email.authenticated()) {
   *   const { data: user } = await users.retrieve();
   *   console.log('Current user:', user?.name);
   * } else {
   *   console.log('User not authenticated');
   * }
   * ```
   *
   * @public
   */
  async retrieve() {
    return request(`${this._config.serviceUrl}/users`)
      .use(context(this._config), access(this._config, this._access))
      .get()
      .json(jsonToUser);
  }

  /**
   * Updates the current user's profile with new data.
   *
   * Allows modification of user profile fields such as name, avatar, and tags.
   * This method requires the user to be authenticated and will return an error
   * if the authentication token is invalid or expired.
   *
   * @param args - Object containing fields to update
   * @param args.name - New name for the user (optional)
   * @param args.avatar - New avatar URL for the user (optional)
   * @param args.tags - Array of tags to associate with the user (optional)
   *
   * @returns Promise resolving to the updated user profile data
   *
   * @example
   * ```typescript
   * const updatedUser = await users.update({
   *   name: 'New Name',
   *   avatar: 'https://example.com/avatar.png',
   * });
   *
   * console.log('Updated user:', updatedUser);
   * ```
   *
   * @public
   */
  async update(args: {
    name?: string | null;
    avatar?: string | null;
    tags?: string[] | null;
  }) {
    return request(`${this._config.serviceUrl}/users`)
      .use(context(this._config), access(this._config, this._access))
      .put(args)
      .json(jsonToUser);
  }
}

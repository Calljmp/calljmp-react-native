import { Auth } from '.';
import { AccessToken } from '../../access';
import { Attestation } from '../../attestation';
import {
  UserAuthenticationPolicy,
  UserAuthenticationProvider,
  jsonToUser,
} from '../../common';
import { Config } from '../../config';
import { sha256 } from '../../crypto';
import { access, accessSupport } from '../../middleware/access';
import { context } from '../../middleware/context';
import { request } from '../../request';
import { AccessResolver } from '../../utils/access-resolver';

/**
 * Provides email-based authentication methods for user registration and login.
 *
 * The Email class handles the complete email authentication flow including:
 * - Email verification for new and existing users
 * - Password-based authentication with device attestation
 * - Password reset and recovery
 * - Authentication status checking
 *
 * All operations integrate with device attestation for enhanced security
 * and use secure storage for token management.
 *
 * @example Complete authentication flow
 * ```typescript
 * const emailAuth = auth.email;
 *
 * // Check if already authenticated
 * if (await emailAuth.authenticated()) {
 *   console.log('User already logged in');
 *   return;
 * }
 *
 * // Start verification for new/existing user
 * const { data: verifyResult } = await emailAuth.verify({
 *   email: 'user@example.com',
 *   provider: UserAuthenticationProvider.EmailPassword
 * });
 *
 * console.log('Existing user:', verifyResult.existingUser);
 *
 * // User enters verification code and password
 * const { data: user, error } = await emailAuth.authenticate({
 *   email: 'user@example.com',
 *   password: 'userPassword',
 *   challengeToken: verifyResult.challengeToken,
 *   name: verifyResult.existingUser ? undefined : 'User Name'
 * });
 * ```
 *
 * @public
 */
export class Email {
  /**
   * Creates a new Email authentication instance.
   *
   * @param _config - SDK configuration containing service URLs and settings
   * @param _attestation - Device attestation provider for security verification
   * @param _store - Secure storage for access tokens and sensitive data
   * @param _auth - Parent Auth instance for challenge token generation
   *
   * @internal
   */
  constructor(
    private _config: Config,
    private _attestation: Attestation,
    private _access: AccessResolver,
    private _auth: Auth
  ) {}

  /**
   * Initiates email verification for user authentication.
   *
   * Starts the email verification process by sending a verification code to the
   * specified email address. This is the first step in the authentication flow
   * for both new user registration and existing user login.
   *
   * @param args - Verification parameters
   * @param args.email - Email address to verify (optional if previously set)
   * @param args.provider - Authentication provider type
   * @param args.doNotNotify - If true, suppresses email notification
   * @returns Promise resolving to challenge token and user existence status
   *
   * @example New user registration
   * ```typescript
   * const { data, error } = await auth.email.verify({
   *   email: 'newuser@example.com',
   *   provider: UserAuthenticationProvider.EmailPassword
   * });
   *
   * if (error) {
   *   console.error('Verification failed:', error.message);
   * } else {
   *   console.log('Challenge token:', data.challengeToken);
   *   console.log('Existing user:', data.existingUser);
   *
   *   // Show appropriate UI based on existingUser flag
   *   if (data.existingUser) {
   *     showPasswordInput();
   *   } else {
   *     showRegistrationForm();
   *   }
   * }
   * ```
   *
   * @public
   */
  async verify(args: {
    email?: string;
    provider: UserAuthenticationProvider;
    doNotNotify?: boolean;
  }) {
    return request(`${this._config.serviceUrl}/users/auth/email/verify`)
      .use(context(this._config), access(this._config, this._access))
      .post(args)
      .json<{
        challengeToken: string;
        existingUser: boolean;
      }>();
  }

  /**
   * Confirms email verification using the challenge token.
   *
   * Validates the email verification code entered by the user. This step
   * confirms that the user has access to the specified email address.
   *
   * @param args - Confirmation parameters
   * @param args.email - Email address being verified (optional if previously set)
   * @param args.challengeToken - Challenge token received from verification step
   * @returns Promise resolving to confirmation result with user existence status
   *
   * @example
   * ```typescript
   * // User enters verification code received via email
   * const verificationCode = getUserInput();
   *
   * const { data, error } = await auth.email.confirm({
   *   email: 'user@example.com',
   *   challengeToken: verificationCode
   * });
   *
   * if (error) {
   *   console.error('Invalid verification code:', error.message);
   * } else {
   *   console.log('Email verified successfully');
   *   console.log('Existing user:', data.existingUser);
   *
   *   // Proceed to password step
   *   if (data.existingUser) {
   *     showPasswordLogin();
   *   } else {
   *     showPasswordSetup();
   *   }
   * }
   * ```
   *
   * @public
   */
  async confirm(args: { email?: string; challengeToken: string }) {
    return request(`${this._config.serviceUrl}/users/auth/email/confirm`)
      .use(context(this._config), access(this._config, this._access))
      .post({
        ...args,
        token: args.challengeToken,
      })
      .json<{ existingUser: boolean }>();
  }

  /**
   * Initiates the password reset process for a user account.
   *
   * Sends a password reset email with a challenge token that can be used
   * to reset the user's password. The user will receive an email with
   * instructions and a verification code.
   *
   * @param args - Password reset parameters (optional)
   * @param args.email - Email address for password reset (optional if previously set)
   * @param args.doNotNotify - If true, suppresses email notification
   * @returns Promise resolving to challenge token for password reset
   *
   * @example
   * ```typescript
   * const { data, error } = await auth.email.forgotPassword({
   *   email: 'user@example.com'
   * });
   *
   * if (error) {
   *   console.error('Password reset failed:', error.message);
   * } else {
   *   console.log('Password reset email sent');
   *   console.log('Challenge token:', data.challengeToken);
   *
   *   // Show form for user to enter reset code and new password
   *   showPasswordResetForm(data.challengeToken);
   * }
   * ```
   *
   * @public
   */
  async forgotPassword(
    args: {
      email?: string;
      doNotNotify?: boolean;
    } = {}
  ) {
    return request(`${this._config.serviceUrl}/users/auth/email/password`)
      .use(context(this._config), access(this._config, this._access))
      .post(args)
      .json<{ challengeToken: string }>();
  }

  /**
   * Resets the user's password using a challenge token from the reset email.
   *
   * Completes the password reset process by validating the challenge token
   * and setting a new password for the user account.
   *
   * @param args - Password reset parameters
   * @param args.email - Email address (optional if previously set)
   * @param args.password - New password to set
   * @param args.challengeToken - Challenge token from password reset email
   * @param args.doNotNotify - If true, suppresses confirmation email
   * @returns Promise resolving to success/failure result
   *
   * @example
   * ```typescript
   * // User enters reset code and new password
   * const resetCode = getUserResetCode();
   * const newPassword = getUserNewPassword();
   *
   * const { error } = await auth.email.resetPassword({
   *   email: 'user@example.com',
   *   password: newPassword,
   *   challengeToken: resetCode
   * });
   *
   * if (error) {
   *   console.error('Password reset failed:', error.message);
   * } else {
   *   console.log('Password reset successful');
   *   // Redirect to login screen
   *   showLoginScreen();
   * }
   * ```
   *
   * @public
   */
  async resetPassword(args: {
    email?: string;
    password: string;
    challengeToken: string;
    doNotNotify?: boolean;
  }) {
    return request(`${this._config.serviceUrl}/users/auth/email/password`)
      .use(context(this._config), access(this._config, this._access))
      .put({
        ...args,
        token: args.challengeToken,
      })
      .json();
  }

  /**
   * Authenticates a user with email and password, including device attestation.
   *
   * Performs the final authentication step by validating the user's password
   * and generating an access token. This method integrates device attestation
   * for enhanced security and stores the resulting access token securely.
   *
   * @param args - Authentication parameters
   * @param args.challengeToken - Optional challenge token from verification
   * @param args.email - User's email address
   * @param args.emailVerified - Whether email has been verified
   * @param args.name - User's display name (required for new users)
   * @param args.password - User's password (required)
   * @param args.tags - Optional user tags for categorization
   * @param args.policy - Authentication policy settings
   * @param args.doNotNotify - If true, suppresses notification emails
   * @returns Promise resolving to authenticated user data or error
   *
   * @example Existing user login
   * ```typescript
   * const { data: user, error } = await auth.email.authenticate({
   *   email: 'user@example.com',
   *   password: 'userPassword',
   *   challengeToken: verificationToken
   * });
   *
   * if (error) {
   *   console.error('Authentication failed:', error.message);
   *   // Handle specific error cases
   *   if (error.code === 'INVALID_CREDENTIALS') {
   *     showError('Invalid email or password');
   *   }
   * } else {
   *   console.log('User authenticated:', user);
   *   // Navigate to main app screen
   *   navigateToMainApp();
   * }
   * ```
   *
   * @example New user registration
   * ```typescript
   * const { data: user, error } = await auth.email.authenticate({
   *   email: 'newuser@example.com',
   *   password: 'newPassword',
   *   name: 'John Doe',
   *   challengeToken: verificationToken,
   *   tags: ['premium', 'beta-tester']
   * });
   * ```
   *
   * @throws Error if password is not provided
   *
   * @public
   */
  async authenticate({
    challengeToken,
    ...args
  }: {
    challengeToken?: string;
    email: string;
    emailVerified?: boolean;
    name?: string | null;
    password?: string;
    tags?: string[] | null;
    policy?: UserAuthenticationPolicy;
    doNotNotify?: boolean;
  }) {
    if (!args.password) {
      throw new Error('Password is required');
    }

    if (!challengeToken) {
      const result = await this._auth.challenge();
      if (result.error) {
        return result;
      }
      challengeToken = result.data.challengeToken;
    }

    const attestationHash = await sha256(`${args.email}:${challengeToken}`);
    const attest = await this._attestation
      .attest({ hash: attestationHash })
      .catch(() => {
        console.info(
          '[Integrity] Attestation failed - this may happen on simulators or debug environments'
        );
        return null;
      });
    const attestationToken = btoa(JSON.stringify(attest));

    const result = await request(`${this._config.serviceUrl}/users/auth/email`)
      .use(context(this._config), accessSupport(this._config))
      .post({
        ...args,
        token: challengeToken,
        attestationToken,
        devApiToken:
          this._config.development?.enabled &&
          this._config.development?.apiToken,
      })
      .json(json => ({
        accessToken: json.accessToken as string,
        user: jsonToUser(json.user),
      }));
    if (result.error) {
      return result;
    }

    const { data: accessToken, error } = AccessToken.tryParse(
      result.data.accessToken
    );
    if (error || !accessToken) {
      return {
        data: undefined,
        error: error || new Error('Failed to parse access token'),
      };
    }

    await this._access.put(accessToken);

    return {
      data: {
        user: result.data.user,
      },
      error: undefined,
    };
  }
}

import { AccessToken } from '../access';
import { Attestation } from '../attestation';
import {
  UserAuthenticationPolicy,
  UserAuthenticationProvider,
  jsonToUser,
} from '../common';
import { Config } from '../config';
import { access } from '../middleware/access';
import { context } from '../middleware/context';
import { request } from '../request';
import { SecureStore } from '../secure-store';

/**
 * Provides email-based authentication methods for users.
 */
export class Email {
  /**
   * @param _config SDK configuration
   * @param _attestation Device attestation provider
   * @param _store Secure storage for tokens
   * @param _auth Auth instance
   */
  constructor(
    private _config: Config,
    private _attestation: Attestation,
    private _store: SecureStore,
    private _auth: Auth
  ) {}

  /**
   * Checks if the user is authenticated via email.
   * @returns True if authenticated, false otherwise
   */
  async authenticated() {
    const token = await this._store.get('accessToken');
    if (token) {
      const { data: accessToken } = AccessToken.tryParse(token);
      if (accessToken) {
        return accessToken.isValid && accessToken.userId !== null;
      }
    }
    return false;
  }

  /**
   * Initiates email verification for authentication.
   * @param args Verification arguments (email, provider, doNotNotify)
   * @returns Challenge token and user existence flag
   */
  async verify(args: {
    email?: string;
    provider: UserAuthenticationProvider;
    doNotNotify?: boolean;
  }) {
    return request(`${this._config.serviceUrl}/users/auth/email/verify`)
      .use(context(this._config), access(this._store))
      .post(args)
      .json<{
        challengeToken: string;
        existingUser: boolean;
      }>();
  }

  /**
   * Confirms email verification with a challenge token.
   * @param args Confirmation arguments (email, challengeToken)
   * @returns Confirmation result
   */
  async confirm(args: { email?: string; challengeToken: string }) {
    return request(`${this._config.serviceUrl}/users/auth/email/confirm`)
      .use(context(this._config), access(this._store))
      .post({
        ...args,
        token: args.challengeToken,
      })
      .json<{ existingUser: boolean }>();
  }

  /**
   * Initiates the password reset process for the given email.
   * @param args Email address and notification preference
   * @returns Challenge token for password reset
   */
  async forgotPassword(
    args: {
      email?: string;
      doNotNotify?: boolean;
    } = {}
  ) {
    return request(`${this._config.serviceUrl}/users/auth/email/password`)
      .use(context(this._config), access(this._store))
      .post(args)
      .json<{ challengeToken: string }>();
  }

  /**
   * Resets the password using the provided challenge token.
   * @param args Email, new password, challenge token, and notification preference
   * @returns Success or failure of the password reset
   */
  async resetPassword(args: {
    email?: string;
    password: string;
    challengeToken: string;
    doNotNotify?: boolean;
  }) {
    return request(`${this._config.serviceUrl}/users/auth/email/password`)
      .use(context(this._config), access(this._store))
      .put({
        ...args,
        token: args.challengeToken,
      })
      .json();
  }

  /**
   * Authenticates the user with email and password.
   * @param args Email, password, and optional parameters like challengeToken, name, tags, and policy
   * @returns Access token and user information
   */
  async authenticate({
    challengeToken,
    ...args
  }: {
    challengeToken?: string;
    email: string;
    emailVerified?: boolean;
    name?: string;
    password?: string;
    tags?: string[];
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

    const result = await request(`${this._config.serviceUrl}/users/auth/email`)
      .use(context(this._config))
      .post({
        ...args,
        token: challengeToken,
        attestationToken,
      })
      .json<{ accessToken: string; user: Record<string, unknown> }>();
    if (result.error) {
      return result;
    }

    await this._store.put('accessToken', result.data.accessToken);

    return {
      data: {
        user: jsonToUser(result.data.user),
      },
      error: undefined,
    };
  }
}

export class Auth {
  public readonly email: Email;

  /**
   * @param _config SDK configuration
   * @param attestation Device attestation provider
   * @param _store Secure storage for tokens
   */
  constructor(
    private _config: Config,
    attestation: Attestation,
    private _store: SecureStore
  ) {
    this.email = new Email(_config, attestation, _store, this);
  }

  /**
   * Requests a new authentication challenge token from the backend.
   * @returns An object containing the challenge token.
   */
  async challenge() {
    return request(`${this._config.serviceUrl}/users/auth/challenge`)
      .use(context(this._config))
      .get()
      .json<{ challengeToken: string }>();
  }

  /**
   * Clears the stored access token, effectively logging the user out.
   * @returns A promise that resolves when the token is deleted.
   */
  async clear() {
    await this._store.delete('accessToken');
  }
}

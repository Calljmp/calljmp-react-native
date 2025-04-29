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

export class Email {
  constructor(
    private _config: Config,
    private _attestation: Attestation,
    private _store: SecureStore,
    private _auth: Auth
  ) {}

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

  async confirm(args: { email?: string; challengeToken: string }) {
    return request(`${this._config.serviceUrl}/users/auth/email/confirm`)
      .use(context(this._config), access(this._store))
      .post({
        ...args,
        token: args.challengeToken,
      })
      .json<{ existingUser: boolean }>();
  }

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

  constructor(
    private _config: Config,
    attestation: Attestation,
    private _store: SecureStore
  ) {
    this.email = new Email(_config, attestation, _store, this);
  }

  async challenge() {
    return request(`${this._config.serviceUrl}/users/auth/challenge`)
      .use(context(this._config))
      .get()
      .json<{ challengeToken: string }>();
  }

  async clear() {
    await this._store.delete('accessToken');
  }
}

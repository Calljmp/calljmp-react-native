import { Attestation } from './attestation';
import { Config } from './config';
import { request } from './request';
import { context } from './middleware/context';

export class Integrity {
  constructor(
    private _config: Config,
    private _attestation: Attestation
  ) {}

  async challenge() {
    return request(`${this._config.serviceUrl}/integrity/challenge`)
      .use(context(this._config))
      .get()
      .json<{ challengeToken: string }>();
  }

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

    return result;
  }
}

import { Platform } from 'react-native';
import { Attestation } from './attestation';
import { Config } from './config';
import { request } from './request';
import { context } from './middleware/context';

export class Project {
  constructor(private _config: Config, private _attestation: Attestation) {}

  async connect() {
    const attest = await this._attestation.attest({
      platform: Platform.OS,
    });
    const attestationToken = btoa(JSON.stringify(attest));
    return await request(`${this._config.projectUrl}/app/connect`)
      .use(context(this._config))
      .post({ attestationToken })
      .json();
  }
}

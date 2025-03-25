import NativeDevice from './specs/NativeDevice';

export class Attestation {
  private _keyId: string | null = null;

  constructor(keyId: string | null = null) {
    this._keyId = keyId;
  }

  private async _generateKeyId() {
    if (!this._keyId) {
      this._keyId = await NativeDevice.appleGenerateAttestationKey();
    }
    return this._keyId;
  }

  async keyId() {
    return await this._generateKeyId();
  }

  async attest(data: string | Record<string, unknown>) {
    const keyId = await this._generateKeyId();
    return await NativeDevice.appleAttestKey(
      keyId,
      typeof data === 'string' ? data : JSON.stringify(data)
    );
  }
}

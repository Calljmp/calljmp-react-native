import { Platform } from 'react-native';
import NativeDevice from './specs/NativeCalljmpDevice';

export class Attestation {
  private _keyId: string | null;
  private _cloudProjectNumber: number | null = null;

  constructor({
    keyId = null,
    android,
  }: {
    keyId?: string | null;
    android?: {
      cloudProjectNumber?: number;
    };
  } = {}) {
    this._keyId = keyId;

    if (Platform.OS === 'android') {
      this._cloudProjectNumber = android?.cloudProjectNumber ?? null;
    }
  }

  private async _generateKeyId() {
    if (Platform.OS === 'ios') {
      if (!this._keyId) {
        this._keyId = await NativeDevice.appleGenerateAttestationKey();
      }
      return this._keyId;
    }

    throw new Error('Key ID generation is only supported on iOS');
  }

  async attest(data: string | Record<string, unknown>) {
    if (Platform.OS === 'ios') {
      const keyId = await this._generateKeyId();
      return NativeDevice.appleAttestKey(
        keyId,
        typeof data === 'string' ? data : JSON.stringify(data)
      );
    }

    if (Platform.OS === 'android') {
      return NativeDevice.androidRequestIntegrityToken(
        this._cloudProjectNumber,
        typeof data === 'string' ? data : JSON.stringify(data)
      );
    }

    throw new Error(`Unsupported platform: ${Platform.OS}`);
  }
}

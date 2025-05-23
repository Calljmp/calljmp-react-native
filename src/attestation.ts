import { Platform } from 'react-native';
import NativeDevice from './specs/NativeCalljmpDevice';

/**
 * Provides device attestation APIs for iOS and Android platforms.
 */
export class Attestation {
  private _keyId: string | null;
  private _cloudProjectNumber: number | null = null;

  /**
   * @param options Optional attestation configuration
   * @param options.keyId Optional iOS attestation key ID
   * @param options.android Optional Android-specific config
   * @param options.android.cloudProjectNumber Optional Android cloud project number
   */
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

  /**
   * Generates a new attestation key ID (iOS only).
   * @returns The generated key ID
   * @throws Error if not supported on the current platform
   */
  private async _generateKeyId() {
    if (Platform.OS === 'ios') {
      if (!this._keyId) {
        this._keyId = await NativeDevice.appleGenerateAttestationKey();
      }
      return this._keyId;
    }

    throw new Error('Key ID generation is only supported on iOS');
  }

  /**
   * Performs device attestation and returns a platform-specific attestation result.
   * @param data Data to attest (string or object)
   * @returns Attestation result from the native platform
   */
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

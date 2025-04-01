import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  appleGenerateAttestationKey(): Promise<string>;
  appleAttestKey(
    keyId: string,
    data: string
  ): Promise<{
    attestation: string;
    bundleId: string;
    keyId: string;
  }>;

  androidRequestIntegrityToken(
    cloudProjectNumber: number,
    data: string
  ): Promise<{
    integrityToken: string;
    packageName: string;
  }>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeCalljmpDevice');

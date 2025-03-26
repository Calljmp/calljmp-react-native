import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  isSimulator(): boolean;

  appleGenerateAttestationKey(): Promise<string>;
  appleAttestKey(
    keyId: string,
    data: string
  ): Promise<{
    attestation: string;
    bundleId: string;
    keyId: string;
  }>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeCalljmpDevice');

import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  sha256(data: number[]): Promise<number[]>;
  uuid(): Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeCalljmpCrypto');

import { Attestation } from './attestation';
import { SecureStore } from './secure-store';
import { Users } from './users';
import { Config } from './config';
import { Project } from './project';
import { Database } from './database';
import { Service } from './service';
import { Integrity } from './integrity';
import { Storage } from './storage';

/**
 * Main entry point for the Calljmp React Native SDK.
 *
 * Provides access to project, user, database, service, integrity, and storage APIs.
 *
 * Example usage:
 * ```ts
 * import { Calljmp } from 'sdk-react-native';
 * const sdk = new Calljmp({ ...config });
 * ```
 */
export class Calljmp {
  /** Project management API */
  public readonly project: Project;
  /** User management API */
  public readonly users: Users;
  /** Database query API */
  public readonly database: Database;
  /** Service API for backend operations */
  public readonly service: Service;
  /** Device integrity and attestation API */
  public readonly integrity: Integrity;
  /** Cloud storage API */
  public readonly storage: Storage;

  /**
   * Create a new Calljmp SDK instance.
   * @param config Optional configuration for endpoints and development mode.
   */
  constructor(config: Partial<Config> = {}) {
    const baseUrl =
      (config.development?.enabled ? config.development?.baseUrl : null) ??
      'https://api.calljmp.com';

    const finalConfig: Config = {
      serviceUrl: `${baseUrl}/target/v1`,
      projectUrl: `${baseUrl}/project`,
      ...config,
    };

    const store = new SecureStore();
    const attestation = new Attestation(config);

    this.integrity = new Integrity(finalConfig, attestation, store);
    this.users = new Users(finalConfig, attestation, store);
    this.project = new Project(finalConfig, attestation);
    this.database = new Database(finalConfig, store);
    this.service = new Service(finalConfig, this.integrity, store);
    this.storage = new Storage(finalConfig, store);
  }
}

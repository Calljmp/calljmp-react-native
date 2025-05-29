/**
 * @fileoverview Main Calljmp SDK client implementation.
 *
 * Provides the primary entry point for all SDK functionality including project management,
 * user authentication, database operations, service calls, device integrity, and storage.
 */

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
 * This class provides access to all SDK functionality through organized API modules.
 * Each module handles a specific aspect of the backend-as-a-service functionality.
 *
 * @example Initialize and use the SDK
 * ```typescript
 * import { Calljmp } from '@calljmp/react-native';
 *
 * const sdk = new Calljmp({
 *   development: {
 *     enabled: __DEV__,
 *     baseUrl: 'http://localhost:3000',
 *     apiToken: 'dev-token'
 *   }
 * });
 *
 * // Connect to your project
 * await sdk.project.connect();
 *
 * // Authenticate a user
 * await sdk.users.auth.email.authenticate({
 *   email: 'user@example.com',
 *   password: 'password123'
 * });
 *
 * // Query the database
 * const users = await sdk.database.query({
 *   sql: 'SELECT * FROM users WHERE active = ?',
 *   params: [true]
 * });
 * ```
 *
 * @public
 */
export class Calljmp {
  /**
   * Project management API for connecting to backend projects and handling project-level operations.
   * @readonly
   */
  public readonly project: Project;

  /**
   * User management and authentication API for handling user registration, login, and profile operations.
   * @readonly
   */
  public readonly users: Users;

  /**
   * Database query API for executing SQL operations on the backend SQLite database.
   * @readonly
   */
  public readonly database: Database;

  /**
   * Service API for making authenticated requests to custom backend endpoints.
   * @readonly
   */
  public readonly service: Service;

  /**
   * Device integrity and attestation API for iOS App Attestation and Android Play Integrity.
   * @readonly
   */
  public readonly integrity: Integrity;

  /**
   * Cloud storage API for uploading, downloading, and managing files in storage buckets.
   * @readonly
   */
  public readonly storage: Storage;

  /**
   * Creates a new Calljmp SDK instance with the specified configuration.
   *
   * @param config - Optional configuration for endpoints, development mode, and platform-specific settings
   *
   * @example Production configuration
   * ```typescript
   * const sdk = new Calljmp();
   * ```
   *
   * @example Development configuration
   * ```typescript
   * const sdk = new Calljmp({
   *   development: {
   *     enabled: true,
   *     baseUrl: 'http://localhost:3000',
   *     apiToken: 'your-dev-token'
   *   },
   *   android: {
   *     cloudProjectNumber: 123456789
   *   }
   * });
   * ```
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

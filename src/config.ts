/**
 * @fileoverview Configuration types and interfaces for the Calljmp React Native SDK.
 *
 * Defines the structure for SDK configuration options including API endpoints,
 * platform-specific settings, and development mode configuration.
 */

/**
 * SDK configuration options for the Calljmp React Native SDK.
 *
 * This interface defines all available configuration options for customizing
 * the SDK's behavior, including API endpoints, platform-specific settings,
 * and development mode features.
 *
 * @example Basic configuration
 * ```typescript
 * const config: Config = {
 *   projectUrl: 'https://api.calljmp.com/project',
 *   serviceUrl: 'https://api.calljmp.com/target/v1'
 * };
 * ```
 *
 * @example Development configuration
 * ```typescript
 * const config: Config = {
 *   projectUrl: 'http://localhost:3000/project',
 *   serviceUrl: 'http://localhost:3000/target/v1',
 *   development: {
 *     enabled: true,
 *     baseUrl: 'http://localhost:3000',
 *     apiToken: 'dev-api-token'
 *   },
 *   android: {
 *     cloudProjectNumber: 123456789
 *   }
 * };
 * ```
 *
 * @public
 */
export interface Config {
  /**
   * Project API endpoint URL for project-level operations like connection and authentication.
   * @defaultValue 'https://api.calljmp.com/project'
   */
  projectUrl: string;

  /**
   * Service API endpoint URL for database queries, user operations, and other services.
   * @defaultValue 'https://api.calljmp.com/target/v1'
   */
  serviceUrl: string;

  /**
   * Optional service configuration for custom backend endpoints.
   * Used primarily for custom service integrations and development.
   */
  service?: {
    /** Base URL for custom service endpoints */
    baseUrl?: string;
  };

  /**
   * Android-specific configuration options for Play Integrity attestation.
   * Required for Android device integrity verification.
   */
  android?: {
    /**
     * Google Cloud project number for Play Integrity API.
     * This is required for Android attestation to work properly.
     * Can be found in your Google Cloud Console project settings.
     */
    cloudProjectNumber?: number;
  };

  /**
   * Configuration for real-time features like WebSocket connections.
   */
  realtime?: {
    /**
     * Delay in seconds before automatically disconnecting idle WebSocket connections. 0 means no auto-disconnect.
     * @defaultValue 60
     */
    autoDisconnectDelay?: number;
    /**
     * Interval in seconds for sending heartbeat messages to keep the WebSocket connection alive. 0 means no heartbeat.
     * Setting this to non-zero value is recommended for long-lived connections but can incur additional costs.
     * @defaultValue 0
     */
    heartbeatInterval?: number;
  };

  /**
   * Development mode configuration for testing and debugging.
   * When enabled, allows bypassing certain security checks and using local endpoints.
   */
  development?: {
    /**
     * Whether development mode is enabled.
     * @defaultValue false
     */
    enabled?: boolean;

    /**
     * Base URL for development API endpoints.
     * Overrides production URLs when development mode is enabled.
     * @example 'http://localhost:3000'
     */
    baseUrl?: string;

    /**
     * Development API token for bypassing certain authentication requirements.
     * Should only be used in development environments.
     */
    apiToken?: string;
  };
}

/**
 * SDK configuration options for Calljmp React Native SDK.
 */
export interface Config {
  /** Project API endpoint URL */
  projectUrl: string;
  /** Service API endpoint URL */
  serviceUrl: string;

  /** Optional service configuration */
  service?: {
    baseUrl?: string;
  };

  /** Optional Android-specific configuration */
  android?: {
    cloudProjectNumber?: number;
  };

  /** Optional development mode configuration */
  development?: {
    enabled?: boolean;
    baseUrl?: string;
    apiToken?: string;
  };
}

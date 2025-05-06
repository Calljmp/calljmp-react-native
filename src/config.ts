export interface Config {
  projectUrl: string;
  serviceUrl: string;

  service?: {
    baseUrl?: string;
  };

  android?: {
    cloudProjectNumber?: number;
  };

  development?: {
    enabled?: boolean;
    baseUrl?: string;
    apiToken?: string;
  };
}

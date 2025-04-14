export interface Config {
  projectUrl: string;
  serviceUrl: string;

  service?: {
    serviceId?: string;
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

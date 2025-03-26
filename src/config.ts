export interface Config {
  projectUrl: string;
  serviceUrl: string;

  development?: {
    enabled?: boolean;
    baseUrl?: string;
    apiToken?: string;
  };
}

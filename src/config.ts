export interface Config {
  projectUrl: string;
  serviceUrl: string;

  development?: {
    enabled?: boolean;
    apiToken?: string;
  };
}

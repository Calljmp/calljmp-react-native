import { Platform } from 'react-native';
import { Config } from '../config';
import { HttpRequest, HttpResponse } from '../request';

export function context(config: Config) {
  return async (
    request: HttpRequest,
    next: (request: HttpRequest) => Promise<HttpResponse>
  ): Promise<HttpResponse> => {
    request.header('X-Platform', Platform.OS);
    if (config.development?.enabled && config.development?.apiToken) {
      request.header('X-Development-Api-Token', config.development.apiToken);
    }
    return next(request);
  };
}

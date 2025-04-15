import { HttpRequest, HttpResponse } from '../request';
import { Store } from '../store';

export function access(store: Store) {
  return async (
    request: HttpRequest,
    next: (request: HttpRequest) => Promise<HttpResponse>
  ): Promise<HttpResponse> => {
    const accessToken = await store.secureGet('accessToken');
    if (accessToken) {
      request.header('Authorization', `Bearer ${accessToken}`);
    }

    const response = await next(request);

    const refreshAccessToken = response.header('X-Calljmp-Access-Token');
    if (refreshAccessToken) {
      await store.securePut('accessToken', refreshAccessToken);
    }

    return response;
  };
}

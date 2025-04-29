import { HttpRequest, HttpResponse } from '../request';
import { SecureStore } from '../secure-store';

export function access(store: SecureStore) {
  return async (
    request: HttpRequest,
    next: (request: HttpRequest) => Promise<HttpResponse>
  ): Promise<HttpResponse> => {
    const accessToken = await store.get('accessToken');
    if (accessToken) {
      request.header('Authorization', `Bearer ${accessToken}`);
    }

    const response = await next(request);

    const refreshAccessToken = response.header('X-Calljmp-Access-Token');
    if (refreshAccessToken) {
      await store.put('accessToken', refreshAccessToken);
    }

    return response;
  };
}

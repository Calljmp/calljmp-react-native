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
    return next(request);
  };
}

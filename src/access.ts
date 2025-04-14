export function decodeAccessToken(token: string) {
  const parts = token.split('.');
  if (parts.length < 2) {
    throw new Error(`Invalid JWT token: ${token}`);
  }
  const base64Payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const decodedPayload = atob(base64Payload);
  return JSON.parse(decodedPayload) as {
    userId: number | null;
    projectId: number;
    databaseId: string;
    serviceUuid: string | null;
  };
}

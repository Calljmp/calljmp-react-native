import NativeCrypto from './specs/NativeCalljmpCrypto';

export function sha256(
  value: string,
  encoding?: 'base64' | 'base64url' | 'hex'
): Promise<string>;
export function sha256(
  value: ArrayBuffer | ArrayBufferView
): Promise<ArrayBuffer>;

export async function sha256(
  value: string | ArrayBuffer | ArrayBufferView,
  encoding: 'base64' | 'base64url' | 'hex' = 'base64'
): Promise<string | ArrayBuffer> {
  let data: ArrayBuffer | ArrayBufferView;
  if (typeof value === 'string') {
    const encoder = new TextEncoder();
    data = encoder.encode(value);
  } else {
    data = value;
  }

  const bytes =
    data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

  const digest = await NativeCrypto.sha256(Array.from(bytes)).then(
    bytes => new Uint8Array(bytes)
  );

  if (typeof value === 'string') {
    if (encoding === 'base64url') {
      return btoa(String.fromCharCode(...digest))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    } else if (encoding === 'hex') {
      return Array.from(digest)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
    }
    return btoa(String.fromCharCode(...digest));
  }

  return digest.buffer;
}

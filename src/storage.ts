import { jsonToBucketFile } from './common';
import { Config } from './config';
import { access } from './middleware/access';
import { context } from './middleware/context';
import { request } from './request';
import { SecureStore } from './secure-store';

/**
 * Provides cloud storage APIs for uploading and managing files in buckets.
 */
export class Storage {
  /**
   * @param _config SDK configuration
   * @param _store Secure storage for tokens
   */
  constructor(
    private _config: Config,
    private _store: SecureStore
  ) {}

  /**
   * Uploads a file or content to a storage bucket.
   * @param content File content as string or Blob
   * @param bucketId Target bucket ID
   * @param key Storage key (filename)
   * @param description Optional file description
   * @param tags Optional tags for the file
   * @param sha256 Optional SHA-256 hash of the file
   * @param type Optional MIME type
   * @returns Uploaded file metadata
   */
  async upload({
    content,
    bucketId,
    key,
    description,
    tags,
    sha256,
    type,
  }: {
    content: string | Blob;
    bucketId: string;
    key: string;
    description?: string | null;
    tags?: string[];
    sha256?: string;
    type?: string | null;
  }) {
    const formData = new FormData();
    formData.append('content', content);
    formData.append(
      'metadata',
      JSON.stringify({
        sha256,
        type,
        description,
        tags,
      })
    );
    const result = await request(
      `${this._config.serviceUrl}/data/${bucketId}/${key}`
    )
      .use(context(this._config), access(this._store))
      .post(formData)
      .json();
    return jsonToBucketFile(result);
  }

  /**
   * Retrieves a file or its content from a storage bucket.
   * @param bucketId Target bucket ID
   * @param key Storage key (filename)
   * @param offset Optional byte offset to start reading from
   * @param length Optional number of bytes to read
   * @returns The file content as a Blob
   */
  async retrieve({
    bucketId,
    key,
    offset,
    length,
  }: {
    bucketId: string;
    key: string;
    offset?: number;
    length?: number;
  }) {
    return await request(`${this._config.serviceUrl}/data/${bucketId}/${key}`)
      .use(context(this._config), access(this._store))
      .params({
        offset,
        length,
      })
      .get()
      .blob();
  }

  /**
   * Updates the metadata (description, tags) of a file in a storage bucket.
   * @param bucketId Target bucket ID
   * @param key Storage key (filename)
   * @param description Optional new description
   * @param tags Optional new tags
   * @returns Updated file metadata
   */
  async update({
    bucketId,
    key,
    description,
    tags,
  }: {
    bucketId: string;
    key: string;
    description?: string | null;
    tags?: string[];
  }) {
    const result = await request(
      `${this._config.serviceUrl}/data/${bucketId}/${key}`
    )
      .use(context(this._config), access(this._store))
      .put({
        description,
        tags,
      })
      .json();
    return jsonToBucketFile(result);
  }

  /**
   * Deletes a file from a storage bucket.
   * @param bucketId Target bucket ID
   * @param key Storage key (filename)
   * @returns A promise that resolves when the file is deleted
   */
  async delete({ bucketId, key }: { bucketId: string; key: string }) {
    await request(`${this._config.serviceUrl}/data/${bucketId}/${key}`)
      .use(context(this._config), access(this._store))
      .delete()
      .json();
  }
}

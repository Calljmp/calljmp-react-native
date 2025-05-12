import { jsonToBucketFile } from './common';
import { Config } from './config';
import { access } from './middleware/access';
import { context } from './middleware/context';
import { request } from './request';
import { SecureStore } from './secure-store';

export class Storage {
  constructor(
    private _config: Config,
    private _store: SecureStore
  ) {}

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

  async delete({ bucketId, key }: { bucketId: string; key: string }) {
    await request(`${this._config.serviceUrl}/data/${bucketId}/${key}`)
      .use(context(this._config), access(this._store))
      .delete()
      .json();
  }
}

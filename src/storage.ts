/**
 * @fileoverview Cloud storage API for file upload, download, and management operations.
 *
 * Provides comprehensive file storage capabilities including upload, download, metadata management,
 * and file listing with support for multiple storage buckets and advanced file operations.
 */

import { jsonToBucketFile } from './common';
import { Config } from './config';
import { access } from './middleware/access';
import { context } from './middleware/context';
import { request } from './request';
import { SecureStore } from './secure-store';

/**
 * Provides cloud storage APIs for uploading, downloading, and managing files in storage buckets.
 *
 * The Storage class enables you to work with files in cloud storage buckets, supporting
 * operations like upload, download, metadata management, and file listing. Each file
 * can have associated metadata including descriptions, tags, and content types.
 *
 * Files are organized in buckets, which act as containers for related files. You can
 * perform operations like:
 * - Upload files with metadata and tags
 * - Download files or retrieve metadata only
 * - Update file descriptions and tags
 * - List files with pagination and sorting
 * - Delete files when no longer needed
 *
 * @example Upload a file
 * ```typescript
 * const file = await sdk.storage.upload({
 *   content: 'Hello, world!',
 *   bucket: 'documents',
 *   key: 'greeting.txt',
 *   description: 'A simple greeting file',
 *   tags: ['greeting', 'text'],
 *   type: 'text/plain'
 * });
 * console.log('Uploaded file:', file.data.key);
 * ```
 *
 * @example Download a file
 * ```typescript
 * const fileBlob = await sdk.storage.retrieve({
 *   bucket: 'documents',
 *   key: 'greeting.txt'
 * });
 * const content = await fileBlob.data.text();
 * console.log('File content:', content);
 * ```
 *
 * @public
 */
export class Storage {
  /**
   * Creates a new Storage instance.
   *
   * @param _config - SDK configuration containing API endpoints
   * @param _store - Secure storage for access tokens and authentication
   *
   * @internal
   */
  constructor(
    private _config: Config,
    private _store: SecureStore
  ) {}

  /**
   * Uploads a file or content to a storage bucket with optional metadata and tags.
   *
   * This method allows you to upload files to cloud storage with rich metadata support.
   * You can upload either string content or binary data (Blob), and associate it with
   * descriptions, tags, and content type information.
   *
   * @param params - Upload parameters
   * @param params.content - File content as string or Blob
   * @param params.bucket - Target bucket name where the file will be stored
   * @param params.key - Unique storage key (filename/path) within the bucket
   * @param params.description - Optional human-readable description of the file
   * @param params.tags - Optional array of tags for categorizing and searching files
   * @param params.sha256 - Optional SHA-256 hash for content verification
   * @param params.type - Optional MIME type (e.g., 'text/plain', 'image/jpeg')
   *
   * @returns A promise that resolves to the uploaded file metadata
   *
   * @throws {ServiceError} When upload fails due to permissions, network, or server errors
   *
   * @example Upload text content
   * ```typescript
   * const result = await sdk.storage.upload({
   *   content: 'This is my document content',
   *   bucket: 'documents',
   *   key: 'my-document.txt',
   *   description: 'Personal document',
   *   tags: ['personal', 'document'],
   *   type: 'text/plain'
   * });
   *
   * if (result.error) {
   *   console.error('Upload failed:', result.error);
   * } else {
   *   console.log('File uploaded:', result.data.key);
   *   console.log('File size:', result.data.size);
   *   console.log('Upload time:', result.data.createdAt);
   * }
   * ```
   *
   * @remarks
   * - The `key` should be unique within the bucket to avoid conflicts
   * - Tags can be used for filtering and searching files later
   * - SHA-256 hash enables content verification and deduplication
   * - Large files may have upload size limits depending on configuration
   */
  async upload({
    content,
    bucket,
    key,
    description,
    tags,
    sha256,
    type,
  }: {
    content:
      | string
      | {
          uri: string;
          type: string;
        };
    bucket: string;
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
    return request(`${this._config.serviceUrl}/data/${bucket}/${key}`)
      .use(context(this._config), access(this._store))
      .post(formData)
      .json(jsonToBucketFile);
  }

  /**
   * Retrieves file content from a storage bucket with support for partial downloads.
   *
   * This method downloads file content from cloud storage, with optional support for
   * range requests to download only specific portions of a file. This is useful for
   * large files or when you only need a specific section of the content.
   *
   * @param params - Retrieval parameters
   * @param params.bucket - Source bucket identifier
   * @param params.key - Storage key (filename/path) of the file to retrieve
   * @param params.offset - Optional byte offset to start reading from (0-based)
   * @param params.length - Optional number of bytes to read from the offset
   *
   * @returns A promise that resolves to the file content as a Blob
   *
   * @throws {ServiceError} When retrieval fails due to file not found, permissions, or network errors
   *
   * @example Download complete file
   * ```typescript
   * const result = await sdk.storage.retrieve({
   *   bucket: 'documents',
   *   key: 'report.pdf'
   * });
   *
   * if (result.error) {
   *   console.error('Download failed:', result.error);
   * } else {
   *   const fileBlob = result.data;
   *   console.log('Downloaded file size:', fileBlob.size);
   *
   *   // Convert to different formats as needed
   *   const arrayBuffer = await fileBlob.arrayBuffer();
   *   const text = await fileBlob.text(); // for text files
   * }
   * ```
   *
   * @example Download file range (partial content)
   * ```typescript
   * // Download first 1KB of a large file
   * const result = await sdk.storage.retrieve({
   *   bucket: 'large-files',
   *   key: 'big-dataset.csv',
   *   offset: 0,
   *   length: 1024
   * });
   *
   * const headerText = await result.data.text();
   * console.log('File header:', headerText);
   * ```
   *
   * @example Download file chunk for streaming
   * ```typescript
   * const chunkSize = 64 * 1024; // 64KB chunks
   * let offset = 0;
   *
   * while (true) {
   *   const result = await sdk.storage.retrieve({
   *     bucket: 'videos',
   *     key: 'movie.mp4',
   *     offset,
   *     length: chunkSize
   *   });
   *
   *   if (result.data.size === 0) break; // End of file
   *
   *   // Process chunk
   *   await processChunk(result.data);
   *   offset += chunkSize;
   * }
   * ```
   *
   * @remarks
   * - Returns the complete file if no offset/length specified
   * - Range requests are useful for large files to avoid memory issues
   * - The returned Blob can be converted to various formats (text, ArrayBuffer, etc.)
   * - Supports resumable downloads by specifying appropriate offset values
   */
  async retrieve({
    bucket,
    key,
    offset,
    length,
  }: {
    bucket: string;
    key: string;
    offset?: number;
    length?: number;
  }) {
    return request(`${this._config.serviceUrl}/data/${bucket}/${key}`)
      .use(context(this._config), access(this._store))
      .params({
        offset,
        length,
      })
      .get()
      .blob();
  }

  /**
   * Retrieves file metadata from a storage bucket.
   * @param bucket Target bucket
   * @param key Storage key (filename)
  /**
   * Retrieves file metadata from a storage bucket without downloading the content.
   * 
   * This method fetches only the metadata associated with a file, such as size,
   * creation date, content type, description, and tags, without downloading the
   * actual file content. This is useful for displaying file information, validation,
   * or building file browsers.
   * 
   * @param params - Peek parameters
   * @param params.bucket - Source bucket
   * @param params.key - Storage key (filename/path) of the file
   * 
   * @returns A promise that resolves to the file metadata
   * 
   * @throws {ServiceError} When the operation fails due to file not found, permissions, or network errors
   * 
   * @example Get file metadata
   * ```typescript
   * const result = await sdk.storage.peek({
   *   bucket: 'documents',
   *   key: 'report.pdf'
   * });
   * 
   * if (result.error) {
   *   console.error('Failed to get metadata:', result.error);
   * } else {
   *   const file = result.data;
   *   console.log('File name:', file.key);
   *   console.log('File size:', file.size);
   *   console.log('Content type:', file.type);
   *   console.log('Description:', file.description);
   *   console.log('Tags:', file.tags);
   *   console.log('Created:', file.createdAt);
   *   console.log('Modified:', file.updatedAt);
   * }
   * ```
   * 
   * @example Build a file browser
   * ```typescript
   * async function getFileInfo(bucket: string, key: string) {
   *   const result = await sdk.storage.peek({ bucket, key });
   *   if (result.data) {
   *     return {
   *       name: result.data.key,
   *       size: formatFileSize(result.data.size),
   *       type: result.data.type || 'Unknown',
   *       modified: new Date(result.data.updatedAt).toLocaleDateString()
   *     };
   *   }
   *   return null;
   * }
   * ```
   * 
   * @remarks
   * - Much faster than `retrieve()` when you only need metadata
   * - Useful for file validation before download
   * - Essential for building file management UIs
   * - Returns the same metadata structure as `upload()` and `update()`
   */
  async peek({ bucket, key }: { bucket: string; key: string }) {
    return request(`${this._config.serviceUrl}/data/${bucket}/${key}`)
      .use(context(this._config), access(this._store))
      .params({ peek: true })
      .get()
      .json(jsonToBucketFile);
  }

  /**
   * Updates the metadata (description and tags) of an existing file in a storage bucket.
   *
   * This method allows you to modify the description and tags associated with a file
   * without changing the file content itself. This is useful for improving file
   * organization, searchability, and maintaining up-to-date file information.
   *
   * @param params - Update parameters
   * @param params.bucket - Target bucket
   * @param params.key - Storage key (filename/path) of the file to update
   * @param params.description - New description for the file (null to remove)
   * @param params.tags - New array of tags for the file
   *
   * @returns A promise that resolves to the updated file metadata
   *
   * @throws {ServiceError} When the update fails due to file not found, permissions, or network errors
   *
   * @example Update file description and tags
   * ```typescript
   * const result = await sdk.storage.update({
   *   bucket: 'documents',
   *   key: 'report.pdf',
   *   description: 'Updated quarterly financial report',
   *   tags: ['finance', 'quarterly', '2024', 'updated']
   * });
   *
   * if (result.error) {
   *   console.error('Update failed:', result.error);
   * } else {
   *   console.log('File updated:', result.data.key);
   *   console.log('New description:', result.data.description);
   *   console.log('New tags:', result.data.tags);
   * }
   * ```
   *
   * @example Remove description but keep tags
   * ```typescript
   * await sdk.storage.update({
   *   bucket: 'files',
   *   key: 'temp-data.json',
   *   description: null, // Remove description
   *   tags: ['temporary', 'json'] // Keep these tags
   * });
   * ```
   *
   * @example Batch update file tags
   * ```typescript
   * const filesToTag = ['file1.txt', 'file2.txt', 'file3.txt'];
   * const newTags = ['batch-processed', 'reviewed'];
   *
   * for (const filename of filesToTag) {
   *   await sdk.storage.update({
   *     bucket: 'processing',
   *     key: filename,
   *     tags: newTags
   *   });
   * }
   * ```
   *
   * @remarks
   * - File content and other metadata (size, type, creation date) remain unchanged
   * - Description can be set to null to remove it entirely
   * - Tags array replaces the existing tags completely
   * - Useful for implementing file organization and search features
   */
  async update({
    bucket,
    key,
    description,
    tags,
  }: {
    bucket: string;
    key: string;
    description?: string | null;
    tags?: string[];
  }) {
    return request(`${this._config.serviceUrl}/data/${bucket}/${key}`)
      .use(context(this._config), access(this._store))
      .put({
        description,
        tags,
      })
      .json(jsonToBucketFile);
  }

  /**
   * Permanently deletes a file from a storage bucket.
   *
   * This method removes a file and all its associated metadata from the storage bucket.
   * The operation is irreversible, so use with caution. Consider implementing
   * confirmation dialogs or soft-delete patterns for important files.
   *
   * @param params - Deletion parameters
   * @param params.bucket - Target bucket
   * @param params.key - Storage key (filename/path) of the file to delete
   *
   * @returns A promise that resolves when the file is successfully deleted
   *
   * @throws {ServiceError} When deletion fails due to file not found, permissions, or network errors
   *
   * @example Delete a single file
   * ```typescript
   * const result = await sdk.storage.delete({
   *   bucket: 'temp-files',
   *   key: 'temporary-data.json'
   * });
   *
   * if (result.error) {
   *   console.error('Deletion failed:', result.error);
   * } else {
   *   console.log('File successfully deleted');
   * }
   * ```
   *
   * @example Delete with confirmation
   * ```typescript
   * async function deleteFileWithConfirmation(bucket: string, key: string) {
   *   const confirmed = confirm(`Are you sure you want to delete ${key}?`);
   *   if (confirmed) {
   *     const result = await sdk.storage.delete({ bucket, key });
   *     if (result.error) {
   *       alert('Failed to delete file: ' + result.error.message);
   *     } else {
   *       alert('File deleted successfully');
   *     }
   *   }
   * }
   * ```
   *
   * @example Batch delete files
   * ```typescript
   * const filesToDelete = ['old-file1.txt', 'old-file2.txt', 'old-file3.txt'];
   *
   * for (const filename of filesToDelete) {
   *   try {
   *     await sdk.storage.delete({
   *       bucket: 'cleanup-bucket',
   *       key: filename
   *     });
   *     console.log(`Deleted: ${filename}`);
   *   } catch (error) {
   *     console.error(`Failed to delete ${filename}:`, error);
   *   }
   * }
   * ```
   *
   * @remarks
   * - This operation is permanent and cannot be undone
   * - File content and all metadata are removed
   * - Consider implementing backup or versioning strategies for important files
   * - No error is thrown if the file doesn't exist (idempotent operation)
   */
  async delete({ bucket, key }: { bucket: string; key: string }) {
    return request(`${this._config.serviceUrl}/data/${bucket}/${key}`)
      .use(context(this._config), access(this._store))
      .delete()
      .json();
  }

  /**
   * Lists files in a storage bucket with support for pagination, filtering, and sorting.
   *
   * This method retrieves a paginated list of files in a bucket, with options for
   * controlling the sort order and pagination. It's essential for building file
   * browsers, implementing search functionality, and managing large collections of files.
   *
   * @param params - Listing parameters
   * @param params.bucket - Target bucket to list files from
   * @param params.offset - Starting position for pagination (default: 0)
   * @param params.limit - Maximum number of files to return in one request
   * @param params.orderDirection - Sort direction: 'asc' for ascending, 'desc' for descending
   * @param params.orderField - Field to sort by (e.g., 'createdAt', 'updatedAt', 'size', 'key')
   *
   * @returns A promise that resolves to an object containing the file list and pagination info
   *
   * @throws {ServiceError} When listing fails due to bucket not found, permissions, or network errors
   *
   * @example List recent files
   * ```typescript
   * const result = await sdk.storage.list({
   *   bucket: 'documents',
   *   limit: 20,
   *   orderField: 'createdAt',
   *   orderDirection: 'desc'
   * });
   *
   * if (result.error) {
   *   console.error('Failed to list files:', result.error);
   * } else {
   *   console.log(`Found ${result.data.files.length} files`);
   *   result.data.files.forEach(file => {
   *     console.log(`- ${file.key} (${file.size} bytes)`);
   *   });
   *
   *   if (result.data.nextOffset) {
   *     console.log(`More files available at offset ${result.data.nextOffset}`);
   *   }
   * }
   * ```
   *
   * @example Paginated file browser
   * ```typescript
   * async function loadFilesPage(bucket: string, page: number, pageSize: number) {
   *   const offset = page * pageSize;
   *   const result = await sdk.storage.list({
   *     bucket,
   *     offset,
   *     limit: pageSize,
   *     orderField: 'updatedAt',
   *     orderDirection: 'desc'
   *   });
   *
   *   return {
   *     files: result.data?.files || [],
   *     hasMore: result.data?.nextOffset !== undefined,
   *     nextPage: result.data?.nextOffset ? page + 1 : null
   *   };
   * }
   * ```
   *
   * @example List all files with pagination
   * ```typescript
   * async function getAllFiles(bucket: string) {
   *   const allFiles = [];
   *   let offset = 0;
   *   const limit = 100;
   *
   *   while (true) {
   *     const result = await sdk.storage.list({
   *       bucket,
   *       offset,
   *       limit
   *     });
   *
   *     if (result.error || !result.data.files.length) break;
   *
   *     allFiles.push(...result.data.files);
   *
   *     if (!result.data.nextOffset) break;
   *     offset = result.data.nextOffset;
   *   }
   *
   *   return allFiles;
   * }
   * ```
   *
   * @remarks
   * - Use pagination for large buckets to avoid memory and performance issues
   * - Sort by 'createdAt' to see newest files first, or 'size' to find large files
   * - The `nextOffset` value indicates if more files are available
   * - Each file object includes full metadata (size, type, description, tags, timestamps)
   */
  async list({
    bucket,
    offset = 0,
    limit,
    orderDirection,
    orderField,
  }: {
    bucket: string;
    offset?: number;
    limit?: number;
    orderDirection?: 'asc' | 'desc';
    orderField?: string;
  }) {
    return request(`${this._config.serviceUrl}/data/${bucket}/list`)
      .use(context(this._config), access(this._store))
      .params({
        offset,
        limit,
        orderDirection,
        orderField,
      })
      .get()
      .json(json => ({
        files: (json.files as any[]).map(jsonToBucketFile),
        nextOffset: json.nextOffset as number | undefined,
      }));
  }

  /**
   * Signs a public URL for accessing a file in a storage bucket.
   *
   * This method generates a signed URL that allows temporary public access to a file
   * in the storage bucket. The URL can be used to download or view the file without
   * requiring authentication, and it can be configured to expire after a specified time.
   *
   * @param params - Signing parameters
   * @param params.bucket - Bucket containing the file
   * @param params.key - Storage key (filename/path) of the file to sign
   * @param params.expiresIn - Optional expiration time in seconds (default: never)
   * @param params.cacheTtl - Optional cache TTL in seconds for CDN caching (default: never)
   *
   * @returns A promise that resolves to an object containing the signed URL
   *
   * @throws {ServiceError} When signing fails due to permissions, network, or server errors
   *
   * @example Sign a public URL for a file
   * ```typescript
   * const result = await sdk.storage.signPublicUrl({
   *   bucket: 'public-files',
   *   key: 'image.jpg',
   *   expiresIn: 3600 // URL valid for 1 hour
   * });
   *
   * if (result.error) {
   *   console.error('Failed to sign URL:', result.error);
   * } else {
   *   console.log('Public URL:', result.data.url);
   * }
   * ```
   *
   * @remarks
   * - Signed URLs are useful for sharing files publicly without exposing access tokens
   * - Expiration helps prevent unauthorized access after the link is shared
   * - Cache TTL can improve performance when serving files via CDN
   */
  async signPublicUrl({
    bucket,
    key,
    expiresIn,
    cacheTtl,
  }: {
    bucket: string;
    key: string;
    expiresIn?: number;
    cacheTtl?: number;
  }) {
    return request(`${this._config.serviceUrl}/data/${bucket}/${key}/url`)
      .use(context(this._config), access(this._store))
      .post({ expiresIn, cacheTtl })
      .json<{ url: string }>();
  }
}

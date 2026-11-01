export type StoredDocument = { url: string; name: string }

export interface DocumentStorage {
  upload(file: File, key: string): Promise<StoredDocument>
}

export class StorageUnavailableError extends Error {
  constructor() { super('Document uploads are unavailable until a storage provider is configured.') }
}

export const documentStorage: DocumentStorage | null = null

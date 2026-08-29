import type { Readable } from "node:stream";

export type ArtifactMetadata = {
  id: string;
  storageKey: string;
  sizeBytes: number;
  sha256: string;
  mimeType: string;
};

export type ArtifactPutInput = {
  id: string;
  workspaceId: string;
  projectId: string;
  kind: string;
  mimeType: string;
  originalName?: string;
  body: Readable;
};

export type StoredArtifact = ArtifactMetadata;

export interface ArtifactStorage {
  put(input: ArtifactPutInput): Promise<StoredArtifact>;
  get(id: string): Promise<Readable>;
  delete(id: string): Promise<void>;
  getMetadata(id: string): Promise<ArtifactMetadata>;
}

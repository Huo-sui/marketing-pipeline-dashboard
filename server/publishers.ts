import { xiaohongshuHttpPublisher } from "./platforms/xiaohongshuPublisher.js";

export type PublisherArtifact = {
  id: string;
  storageProvider: string;
  storageKey: string;
  mimeType: string;
  originalName?: string;
  sha256: string;
  contentUrl: string;
};

export type PublisherInput = {
  publicationDraftId: string;
  idempotencyKey: string;
  platform: string;
  title: string;
  copy: string;
  account: {
    id: string;
    externalUserId?: string;
    handle: string;
    displayName?: string;
  };
  runner?: {
    id: string;
    runnerType: string;
    deviceId?: string;
    appPackage?: string;
  };
  artifacts: PublisherArtifact[];
};

export type PublisherResult =
  | { status: "succeeded"; platformPostId: string; canonicalUrl: string; publishedAt: string; externalRequestId?: string; evidence?: Record<string, unknown> }
  | { status: "failed_retryable"; code: string; message: string; externalRequestId?: string; evidence?: Record<string, unknown> }
  | { status: "unknown_requires_review"; code: string; message: string; externalRequestId?: string; evidence?: Record<string, unknown> };

export type PublisherAdapter = {
  id: string;
  platform: string;
  requirements: { confirmedIdentity: boolean; phoneRunner: boolean };
  configured: () => boolean;
  publish(input: PublisherInput): Promise<PublisherResult>;
};

const publishers = new Map<string, PublisherAdapter>();

export function getPublisher(platform: string): PublisherAdapter | undefined {
  const publisher = publishers.get(platform);
  return publisher?.configured() ? publisher : undefined;
}

/** Register a platform-owned publisher without changing the pipeline controller. */
export function registerPublisher(adapter: PublisherAdapter) {
  publishers.set(adapter.platform, adapter);
}

registerPublisher(xiaohongshuHttpPublisher);

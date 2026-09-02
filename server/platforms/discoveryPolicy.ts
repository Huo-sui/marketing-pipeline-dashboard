export type MediaTypeFilter = "any" | "video" | "image_text";

export const CANDIDATE_LIMIT_PER_TERM = 3 as const;

export function parseMediaTypeFilter(value: unknown, fallback: MediaTypeFilter = "any") {
  if (value === undefined) return fallback;
  return value === "any" || value === "video" || value === "image_text" ? value : undefined;
}

export function supportsMediaType(supported: MediaTypeFilter[], value: MediaTypeFilter) {
  return supported.includes(value);
}

export function discoveryPolicy(mediaTypeFilter: MediaTypeFilter) {
  return { candidateLimitPerTerm: CANDIDATE_LIMIT_PER_TERM, mediaTypeFilter };
}

export function httpDiscoveryPayload(platform: string, request: { accountId: string; deviceId?: string; traceId: string; terms: string[]; policy: ReturnType<typeof discoveryPolicy> }) {
  return { platform, accountId: request.accountId, deviceId: request.deviceId, traceId: request.traceId, terms: request.terms, policy: request.policy };
}

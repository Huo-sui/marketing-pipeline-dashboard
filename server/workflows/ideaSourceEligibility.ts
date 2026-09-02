import { evaluateViralAdmission } from "../scoring/viralAdmission.ts";

type IdeaSource = {
  id: string;
  publishedAt: Date | null;
};

type SourceMetric = {
  sourcePostId: string;
  likes: number | null;
  comments: number | null;
  capturedAt: Date;
};

type SourceMatch = {
  sourcePostId: string;
  topicWatchId: string | null;
};

type TopicPolicy = {
  id: string;
  minLikes: number;
  minComments: number;
  minScore: number;
  maxAgeHours: number;
};

/**
 * Source posts are eligible for idea generation solely through the current
 * TopicWatch hard gates. Legacy source review fields are intentionally absent.
 * Metrics must be ordered newest-first so the first snapshot per post is used.
 */
export function allIdeaSourcesCurrentlyAdmitted(
  sources: readonly IdeaSource[],
  metrics: readonly SourceMetric[],
  matches: readonly SourceMatch[],
  topics: readonly TopicPolicy[],
) {
  const latestMetric = new Map<string, SourceMetric>();
  for (const metric of metrics) if (!latestMetric.has(metric.sourcePostId)) latestMetric.set(metric.sourcePostId, metric);
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const matchesBySource = new Map<string, SourceMatch[]>();
  for (const match of matches) {
    const sourceMatches = matchesBySource.get(match.sourcePostId) ?? [];
    sourceMatches.push(match);
    matchesBySource.set(match.sourcePostId, sourceMatches);
  }

  return sources.every((post) => {
    const metric = latestMetric.get(post.id);
    if (!metric) return false;
    return (matchesBySource.get(post.id) ?? []).some((match) => {
      const topic = match.topicWatchId ? topicById.get(match.topicWatchId) : undefined;
      return topic ? evaluateViralAdmission(
        { likes: metric.likes, comments: metric.comments, publishedAt: post.publishedAt, capturedAt: metric.capturedAt },
        { minLikes: topic.minLikes, minComments: topic.minComments, minScore: topic.minScore, maxAgeHours: topic.maxAgeHours },
      ).passed : false;
    });
  });
}

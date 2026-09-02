# Topic Radar anomaly policy

The radar treats an anomaly as an unusually strong positive engagement result, not as fraud or bad data.

## Collection, admission score, and anomaly are separate

Platform collectors return source facts and evidence only. They do not assign a
score. The control plane calculates `velocity-triangle-v1` from:

- publication age at capture time;
- likes per publication hour;
- comments per publication hour and comment rate.

Freshness contributes 25%, like velocity 35%, and comment strength 40%.
Comment strength is 60% comment velocity and 40% comment rate. Exponential
saturation prevents large accounts from forcing every result to 100. A zero
`minComments` value never awards free points: the curve falls back to a 3%
comment reference. `minLikes`, `minComments`, and `maxAgeHours` calibrate the
curve. Admission then requires all three deterministic hard gates:
`likes >= minLikes`, `comments >= minComments`, and `score >= minScore`.
`maxAgeHours` remains calibration-only.

Anomaly scoring then compares the post with a cohort from the same platform, tracked term, and comparable publication-age bucket. This prevents an established account or an older post from being compared directly with a new post from a different topic.

## Robust MAD method

Likes per hour, comments per hour, and comment rate are transformed with `log1p` because social engagement is heavy-tailed. Each metric receives a modified z-score:

```text
modified_z = 0.6745 * (value - median) / MAD
MAD = median(abs(value - median))
```

The default positive-outlier boundary is `3.5`. The implementation uses the largest of like velocity, comment velocity, and comment-rate scores and records every component as evidence.

The cohort is built only from the same workspace, project, platform, topic watch,
tracked term, and publication-age bucket (`0–24h`, `24–72h`, `3–7d`,
`7–30d`, or `30d+`). Only the latest snapshot for each source post is used, so
repeated collection does not give one post extra weight. Snapshot age is
calculated from the source post's publication time, never from capture time.

At least 30 comparable observations are required. When the cohort is smaller, the anomaly state is `insufficient_baseline`; the post may still pass the hard thresholds, but the system must not manufacture an anomaly score. A missing publication time produces `missing_published_at` and never receives an anomaly score.

## Why this is the first method

- Median and MAD remain stable when a cohort already contains viral posts.
- The boundary is inspectable and can be explained in the Dashboard.
- It works before enough labelled examples exist for a supervised model.
- Multivariate methods such as Isolation Forest or PyOD can be added later, after each cohort has enough history and offline evaluation data.

References:

- NIST, Detection of Outliers: https://www.itl.nist.gov/div898/handbook/eda/section3/eda35h.htm
- scikit-learn, Novelty and Outlier Detection: https://scikit-learn.org/stable/modules/outlier_detection.html
- PyOD documentation: https://pyod.readthedocs.io/en/latest/

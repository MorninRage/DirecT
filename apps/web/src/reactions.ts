/** Keep aligned with relay `REACTION_KINDS`. */
export const EMOTIONS = [
  "like",
  "dislike",
  "shameful",
  "impressed",
  "empathy",
  "anger",
  "sadness",
  "joy",
  "love",
  "fear",
  "disgust",
  "surprise",
  "hope",
  "curious",
  "gratitude",
] as const;

export type Emotion = (typeof EMOTIONS)[number];

export const REACTION_KINDS = [
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

export type ReactionKind = (typeof REACTION_KINDS)[number];

export function isReactionKind(s: string): s is ReactionKind {
  return (REACTION_KINDS as readonly string[]).includes(s);
}

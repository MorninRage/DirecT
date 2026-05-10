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

/** Display emoji per wire-format emotion (relay unchanged). */
export const EMOTION_EMOJI: Record<Emotion, string> = {
  like: "👍",
  dislike: "👎",
  shameful: "😳",
  impressed: "🤩",
  empathy: "💜",
  anger: "😠",
  sadness: "😢",
  joy: "😄",
  love: "❤️",
  fear: "😨",
  disgust: "🤢",
  surprise: "😮",
  hope: "🌟",
  curious: "🤔",
  gratitude: "🙏",
};

export function formatReactionMetricLine(reactions: Record<string, number>): string {
  return Object.entries(reactions)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => {
      const emoji = EMOTION_EMOJI[k as Emotion] ?? "·";
      return `${emoji}${n}`;
    })
    .join(" · ");
}


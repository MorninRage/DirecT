import { useState, type WheelEvent } from "react";
import { EMOTIONS, type Emotion } from "../reactions";

type Props = {
  disabled?: boolean;
  onPick: (emotion: Emotion) => void;
};

export function EmotionDial({ disabled, onPick }: Props) {
  const [idx, setIdx] = useState(0);
  const emotion = EMOTIONS[idx]!;

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    const step = e.deltaY > 0 ? 1 : -1;
    setIdx((i) => (i + step + EMOTIONS.length) % EMOTIONS.length);
  };

  return (
    <div className="emotion-row">
      <div className="emotion-dial" onWheel={onWheel} role="slider" aria-valuenow={idx}>
        <div className="emotion-dial__list" aria-hidden />
        <div className="emotion-dial__inner">
          <div className="emotion-dial__label">Signal</div>
          <div className="emotion-dial__value">{emotion}</div>
          <div className="emotion-dial__hint">scroll wheel · brass ring</div>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 180 }}>
        <button
          type="button"
          className="hud-btn hud-btn--primary"
          disabled={disabled}
          onClick={() => onPick(emotion)}
        >
          Broadcast {emotion}
        </button>
        <div className="hud-token-note">
          Emotions and shares accumulate on-chain-ready metrics for future DIR emission weighting and anti-Sybil review.
        </div>
      </div>
    </div>
  );
}

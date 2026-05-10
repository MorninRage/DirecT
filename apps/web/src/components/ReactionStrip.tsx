import { EMOTIONS, EMOTION_EMOJI, type Emotion } from "../reactions";

export function ReactionStrip({
  disabled,
  onReact,
}: {
  disabled?: boolean;
  onReact: (e: Emotion) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        marginTop: 10,
        maxHeight: 120,
        overflowY: "auto",
        paddingRight: 4,
      }}
    >
      {EMOTIONS.map((e) => (
        <button
          key={e}
          type="button"
          className="hud-btn hud-btn--reaction"
          style={{ fontSize: 18, padding: "6px 10px", lineHeight: 1 }}
          title={e}
          disabled={disabled}
          onClick={() => onReact(e)}
        >
          <span aria-hidden>{EMOTION_EMOJI[e]}</span>
          <span className="hud-sr-only">{e}</span>
        </button>
      ))}
    </div>
  );
}

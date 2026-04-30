import { EMOTIONS, type Emotion } from "../reactions";

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
        <button key={e} type="button" className="hud-btn" style={{ fontSize: 10, padding: "4px 8px" }} disabled={disabled} onClick={() => onReact(e)}>
          {e}
        </button>
      ))}
    </div>
  );
}

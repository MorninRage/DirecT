/** Drag handle + chrome for react-grid-layout tiles (owner-only drag strip). */
export function GridTileFrame({ title, owner }: { title: string; owner: boolean }) {
  if (!owner) return null;
  return (
    <div className="hud-grid-drag" title="Drag to move — other tiles shift out of the way. Resize from edges or corners.">
      <span className="hud-grid-drag__grips" aria-hidden>
        <span />
        <span />
        <span />
      </span>
      <span className="hud-grid-drag__title">{title}</span>
    </div>
  );
}

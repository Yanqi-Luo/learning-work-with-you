export function Mascot({ size = 280, listening = false }: { size?: number; listening?: boolean }) {
  return (
    <div
      className={listening ? "mascot-live is-listening" : "mascot-live"}
      style={{ width: size }}
    >
      <img className="mascot-still" src="/mascot/orb.png" alt="" width={1254} height={1254} />
      <picture className="mascot-move">
        <source srcSet="/mascot/jump.webp" type="image/webp" />
        <img src="/mascot/jump.gif" alt="" width={1254} height={1428} />
      </picture>
    </div>
  );
}

interface ContextMenuProps {
  label: string;
  onDelete: () => void;
  x: number;
  y: number;
}

export function ContextMenu({ label, onDelete, x, y }: ContextMenuProps) {
  return (
    <div
      aria-label={label}
      className="context-menu"
      onPointerDown={(event) => event.stopPropagation()}
      role="menu"
      style={{ left: x, top: y }}
    >
      <button className="context-menu__danger" onClick={onDelete} role="menuitem" type="button">
        删除节点
      </button>
    </div>
  );
}

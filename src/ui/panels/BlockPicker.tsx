import { paletteGroups, CATEGORY_META } from '../../core/steps/registry.ts';
import { Icon } from '../components/Icon.tsx';

export function BlockPicker({
  onPick,
  onClose,
}: {
  onPick: (type: string) => void;
  onClose: () => void;
}) {
  const groups = paletteGroups();
  return (
    <div className="picker">
      {groups.map((g) => (
        <div className="picker-group" key={g.category}>
          <div className="picker-group-title">{CATEGORY_META[g.category].label}</div>
          {g.items.map((def) => (
            <button
              key={def.type}
              className="picker-item"
              style={{ ['--cat' as string]: CATEGORY_META[def.category].color }}
              onClick={() => onPick(def.type)}
            >
              <span className="picker-item-icon">
                <Icon name={def.icon} size={14} />
              </span>
              <span>
                <div className="picker-item-name">{def.name}</div>
                <div className="picker-item-hint">{def.hint}</div>
              </span>
            </button>
          ))}
        </div>
      ))}
      <div className="picker-group">
        <button className="picker-item" onClick={onClose}>
          <span className="picker-item-icon">
            <Icon name="x" size={14} />
          </span>
          <span className="picker-item-name">收起</span>
        </button>
      </div>
    </div>
  );
}

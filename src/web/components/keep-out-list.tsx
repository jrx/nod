import { X } from './icons';
import { Button } from './ui';

export function KeepOutList({
  title,
  hint,
  items,
  removeLabel,
  disabled,
  onRemove,
}: {
  title: string;
  hint: string;
  items: string[];
  removeLabel: (item: string) => string;
  disabled: boolean;
  onRemove: (item: string) => void;
}) {
  return (
    <>
      <div className="account-preference-row">
        <span>{title}</span>
      </div>
      <p className="field-hint">{hint}</p>
      {items.map((item) => (
        <div key={item} className="account-preference-row">
          <span className="local-files-keep-out">{item}</span>
          <Button
            variant="ghost"
            size="sm"
            aria-label={removeLabel(item)}
            disabled={disabled}
            onClick={() => onRemove(item)}
          >
            <X size={14} aria-hidden="true" />
          </Button>
        </div>
      ))}
    </>
  );
}

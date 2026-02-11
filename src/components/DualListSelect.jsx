import { useState } from 'react';

/**
 * Dual-list multiselect: left = available, right = selected.
 * User selects items on the left and moves to right (Add), or selects on right and moves to left (Remove).
 *
 * @param {Object} props
 * @param {{ id: string, label: string }[]} props.options - All options in display order
 * @param {Record<string, boolean>} props.value - Selected ids (true = shown on right)
 * @param {(value: Record<string, boolean>) => void} props.onChange
 * @param {string} props.leftTitle - Heading for available list
 * @param {string} props.rightTitle - Heading for selected list
 * @param {string} [props.leftEmptyMessage] - Shown when no available items
 * @param {string} [props.rightEmptyMessage] - Shown when no selected items
 * @param {boolean} [props.disabled] - Disable lists and buttons (e.g. loading)
 */
export default function DualListSelect({
  options,
  value,
  onChange,
  leftTitle,
  rightTitle,
  leftEmptyMessage = 'None',
  rightEmptyMessage = 'None',
  disabled = false,
}) {
  const available = options.filter((o) => !value[o.id]);
  const selected = options.filter((o) => value[o.id]);

  const [leftSelected, setLeftSelected] = useState([]);
  const [rightSelected, setRightSelected] = useState([]);

  function handleAdd() {
    if (leftSelected.length === 0) return;
    const next = { ...value };
    leftSelected.forEach((id) => (next[id] = true));
    onChange(next);
    setLeftSelected([]);
  }

  function handleRemove() {
    if (rightSelected.length === 0) return;
    const next = { ...value };
    rightSelected.forEach((id) => (next[id] = false));
    onChange(next);
    setRightSelected([]);
  }

  function handleAddAll() {
    const next = { ...value };
    available.forEach((o) => (next[o.id] = true));
    onChange(next);
    setLeftSelected([]);
  }

  function handleRemoveAll() {
    const next = { ...value };
    selected.forEach((o) => (next[o.id] = false));
    onChange(next);
    setRightSelected([]);
  }

  return (
    <div className="dual-list">
      <div className="dual-list__panel">
        <div className="dual-list__title">{leftTitle}</div>
        <select
          multiple
          size={10}
          className="dual-list__select"
          value={leftSelected}
          onChange={(e) => setLeftSelected(Array.from(e.target.selectedOptions, (o) => o.value))}
          disabled={disabled}
          aria-label={leftTitle}
        >
          {available.length === 0 ? (
            <option disabled>{leftEmptyMessage}</option>
          ) : (
            available.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))
          )}
        </select>
      </div>
      <div className="dual-list__actions">
        <button
          type="button"
          className="btn btn--secondary btn--sm dual-list__btn"
          onClick={handleAdd}
          disabled={disabled || leftSelected.length === 0}
          title="Add selected to right"
          aria-label="Add selected to selected list"
        >
          Add →
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--sm dual-list__btn"
          onClick={handleRemove}
          disabled={disabled || rightSelected.length === 0}
          title="Remove selected from right"
          aria-label="Remove selected from selected list"
        >
          ← Remove
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm dual-list__btn"
          onClick={handleAddAll}
          disabled={disabled || available.length === 0}
          title="Add all to right"
          aria-label="Add all to selected list"
        >
          Add all →
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm dual-list__btn"
          onClick={handleRemoveAll}
          disabled={disabled || selected.length === 0}
          title="Remove all from right"
          aria-label="Remove all from selected list"
        >
          ← Remove all
        </button>
      </div>
      <div className="dual-list__panel">
        <div className="dual-list__title">{rightTitle}</div>
        <select
          multiple
          size={10}
          className="dual-list__select"
          value={rightSelected}
          onChange={(e) => setRightSelected(Array.from(e.target.selectedOptions, (o) => o.value))}
          disabled={disabled}
          aria-label={rightTitle}
        >
          {selected.length === 0 ? (
            <option disabled>{rightEmptyMessage}</option>
          ) : (
            selected.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))
          )}
        </select>
      </div>
    </div>
  );
}

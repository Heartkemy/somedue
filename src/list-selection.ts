export function selectListItems(
  visible: string[],
  selected: string[],
  anchor: string,
  target: string,
  modifiers: { toggle?: boolean; range?: boolean } = {},
) {
  const end = visible.indexOf(target);
  if (end < 0) return selected;
  const start = visible.indexOf(anchor);
  if (modifiers.range && start >= 0) {
    const range = visible.slice(Math.min(start, end), Math.max(start, end) + 1);
    return modifiers.toggle ? [...new Set([...selected, ...range])] : range;
  }
  if (modifiers.toggle)
    return selected.includes(target)
      ? selected.filter((id) => id !== target)
      : [...selected, target];
  return [target];
}

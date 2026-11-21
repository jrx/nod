export function createLiteralMasker(entries) {
  const masks = new Map(entries.filter(([value]) => value));
  const pattern = [...masks.keys()]
    .sort((a, b) => b.length - a.length)
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  if (!pattern) return (value) => value;
  const matches = new RegExp(`(?=(${pattern}))`, 'g');
  return (value) => {
    const spans = [];
    for (const match of value.matchAll(matches)) {
      const span = {
        start: match.index,
        end: match.index + match[1].length,
        mask: masks.get(match[1]),
      };
      const previous = spans.at(-1);
      if (previous && span.start < previous.end) {
        if (span.end > previous.end) {
          previous.end = span.end;
          previous.mask = '[redacted]';
        }
      } else spans.push(span);
    }
    let result = '';
    let end = 0;
    for (const span of spans) {
      result += value.slice(end, span.start) + span.mask;
      end = span.end;
    }
    return result + value.slice(end);
  };
}

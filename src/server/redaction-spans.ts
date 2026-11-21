export interface RedactionSpan {
  start: number;
  end: number;
  replacement: string;
}

export function addRedactionSpan(
  spans: RedactionSpan[],
  start: number,
  end: number,
  replacement: string,
) {
  if (end <= start) return;
  if (spans.length >= 4096) throw new Error('Redaction match limit exceeded.');
  spans.push({ start, end, replacement });
}

export function redactionMatches(
  input: string,
  pattern: RegExp,
  visit: (match: RegExpExecArray) => void,
  overlapping = false,
) {
  const expression = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, '') + 'g');
  let count = 0;
  for (let match = expression.exec(input); match; match = expression.exec(input)) {
    if (++count > 8192) throw new Error('Redaction match limit exceeded.');
    visit(match);
    if (overlapping || !match[0].length)
      expression.lastIndex =
        match.index +
        (expression.unicode && (input.codePointAt(match.index) ?? 0) > 0xffff ? 2 : 1);
  }
}

export function renderRedactionSpans(input: string, spans: RedactionSpan[]) {
  const merged: RedactionSpan[] = [];
  for (const span of [...spans].sort((a, b) => a.start - b.start || b.end - a.end)) {
    const previous = merged.at(-1);
    if (!previous || span.start >= previous.end) merged.push({ ...span });
    else {
      previous.end = Math.max(previous.end, span.end);
      if (previous.replacement !== span.replacement) previous.replacement = '[redacted]';
    }
  }
  let result = '';
  let offset = 0;
  for (const span of merged) {
    result += input.slice(offset, span.start) + span.replacement;
    offset = span.end;
  }
  return result + input.slice(offset);
}

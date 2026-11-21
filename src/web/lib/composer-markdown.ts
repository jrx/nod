import type { JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Root as HtmlRoot } from 'hast';
import type {
  BlockContent,
  Heading,
  Html,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
} from 'mdast';
import { LinkifyIt } from 'linkify-it';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import remarkInlineLinks from 'remark-inline-links';
import { SKIP, visit } from 'unist-util-visit';
import { rehypeLocalLinks } from './markdown';
import { safeMessageLink } from './message-links';

const markdown = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkInlineLinks)
  .use(remarkStringify, {
    bullet: '-',
    emphasis: '*',
    fences: true,
    listItemIndent: 'one',
  });
const linkify = new LinkifyIt({ fuzzyLink: true });
const formatted = ['delete', 'emphasis', 'inlineCode', 'link', 'strong'];
let verdicts = new Map<string, boolean>();
let previousVerdicts = verdicts;
const entity = /&#x([0-9a-f]+);/iy;
const linkedTails = new Map<string, string>();

function literal(value: string): PhrasingContent[] {
  if (!value.startsWith('/') && safeMessageLink(value, window.location.origin))
    return [{ type: 'link', url: value, children: [{ type: 'text', value }] }];
  const local = (value: string): PhrasingContent[] => {
    const tree: HtmlRoot = { type: 'root', children: [{ type: 'text', value }] };
    rehypeLocalLinks()(tree);
    return tree.children.map((node) =>
      node.type === 'element' && typeof node.properties.href === 'string'
        ? {
            type: 'link',
            url: node.properties.href,
            children: [{ type: 'text', value: node.properties.href }],
          }
        : { type: 'text', value: 'value' in node ? String(node.value) : '' },
    );
  };
  const result: PhrasingContent[] = [];
  let offset = 0;
  for (const link of linkify.match(value) ?? []) {
    if (!safeMessageLink(link.url, window.location.origin)) continue;
    result.push(...local(value.slice(offset, link.index)));
    result.push({ type: 'link', url: link.url, children: [{ type: 'text', value: link.raw }] });
    offset = link.lastIndex;
  }
  result.push(...local(value.slice(offset)));
  return result;
}

function inline(
  nodes: JSONContent[],
  linked = false,
  rawText = false,
  display = false,
): PhrasingContent[] {
  const result: PhrasingContent[] = [];
  const appendRaw = (value: string) => {
    const last = result.at(-1);
    if (last?.type === 'html') last.value += value;
    else result.push({ type: 'html', value });
  };
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    const mark = node.marks?.[0];
    if (mark) {
      const span = [node];
      while (
        index + 1 < nodes.length &&
        JSON.stringify(nodes[index + 1].marks?.[0]) === JSON.stringify(mark)
      )
        span.push(nodes[++index]);
      if (mark.type === 'code') {
        result.push({ type: 'inlineCode', value: span.map((item) => item.text ?? '').join('') });
        continue;
      }
      const children = inline(
        span.map((item) => ({ ...item, marks: item.marks!.slice(1) })),
        linked || mark.type === 'link',
        mark.type === 'rawPaste' && rawText,
        display,
      );
      if (mark.type === 'rawPaste') {
        let lineStart = true;
        for (const child of children) {
          if (display && lineStart && child.type === 'text') {
            const spaces = child.value.match(/^[ \t]+/)?.[0];
            if (spaces) {
              result.push({ type: 'html', value: `<span>${spaces}</span>` });
              if (spaces.length < child.value.length)
                result.push({ ...child, value: child.value.slice(spaces.length) });
              lineStart = false;
              continue;
            }
          }
          if (!display && child.type === 'html') appendRaw(child.value);
          else result.push(child);
          lineStart = child.type === 'break' || (child.type === 'html' && child.value === '<br>');
        }
      } else if (mark.type === 'link')
        result.push({
          type: 'link',
          url: mark.attrs?.href ?? '',
          title: mark.attrs?.title,
          children,
        });
      else if (mark.type === 'bold') result.push({ type: 'strong', children });
      else if (mark.type === 'italic') result.push({ type: 'emphasis', children });
      else if (mark.type === 'strike') result.push({ type: 'delete', children });
      else if (mark.type === 'underline')
        result.push({ type: 'html', value: '<u>' }, ...children, { type: 'html', value: '</u>' });
      else result.push(...children);
    } else if (node.type === 'hardBreak') {
      if (rawText) appendRaw('\n');
      else result.push({ type: 'html', value: '<br>' });
    } else if (node.type === 'text') {
      if (rawText) appendRaw(node.text ?? '');
      else
        result.push(
          ...(linked
            ? [{ type: 'text' as const, value: node.text ?? '' }]
            : literal(node.text ?? '')),
        );
    } else result.push(...inline(node.content ?? [], linked, rawText, display));
  }
  return result;
}

function blocks(nodes: JSONContent[], display = false): RootContent[] {
  return nodes.flatMap((node): RootContent[] => {
    const content = node.content ?? [];
    switch (node.type) {
      case 'paragraph':
        return [{ type: 'paragraph', children: inline(content, false, !display, display) }];
      case 'heading':
        return [
          {
            type: 'heading',
            depth: node.attrs?.level ?? 1,
            children: inline(content, false, !display, display),
          },
        ];
      case 'blockquote':
        return [{ type: 'blockquote', children: blocks(content, display) as BlockContent[] }];
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        return [
          {
            type: 'list',
            ordered: node.type === 'orderedList',
            start: node.type === 'orderedList' ? (node.attrs?.start ?? 1) : undefined,
            spread: false,
            children: content.map((item) => ({
              type: 'listItem',
              checked: item.type === 'taskItem' ? Boolean(item.attrs?.checked) : null,
              spread: false,
              children: blocks(item.content ?? [], display) as BlockContent[],
            })),
          },
        ];
      case 'codeBlock':
        return [
          {
            type: 'code',
            lang: node.attrs?.language,
            value: content.map((n) => n.text ?? '').join(''),
          },
        ];
      case 'horizontalRule':
        return [{ type: 'thematicBreak' }];
      case 'table':
        return [
          {
            type: 'table',
            children: content.map((row) => ({
              type: 'tableRow',
              children: (row.content ?? []).map((cell) => ({
                type: 'tableCell',
                children: tableInline(
                  (cell.content ?? []).flatMap((paragraph, index) => [
                    ...(index ? [{ type: 'html' as const, value: '\n' }] : []),
                    ...inline(paragraph.content ?? [], false, !display, display),
                  ]),
                ),
              })),
            })),
          },
        ];
      default:
        return blocks(content, display);
    }
  });
}

function tableInline(nodes: PhrasingContent[]): PhrasingContent[] {
  return nodes
    .reduce<PhrasingContent[]>((merged, node) => {
      const last = merged.at(-1);
      if (node.type === 'html' && last?.type === 'html')
        merged[merged.length - 1] = { ...last, value: last.value + node.value };
      else merged.push(node);
      return merged;
    }, [])
    .map((node) =>
      node.type === 'html'
        ? {
            ...node,
            value: node.value
              .replace(
                /(\\*)\|/g,
                (_, slashes: string) => `${'\\'.repeat(slashes.length * 2 + 1)}|`,
              )
              .replace(/(\\*)\n/g, (_, slashes: string) => `${slashes}${slashes}<br>`),
          }
        : 'children' in node
          ? { ...node, children: tableInline(node.children) }
          : node,
    );
}

function phrasingMarkdown(children: PhrasingContent[]) {
  return markdown
    .stringify({ type: 'root', children: [{ type: 'paragraph', children }] })
    .slice(0, -1);
}

function isFormatted(node: { type: string; value?: unknown }) {
  return formatted.includes(node.type) || (node.type === 'html' && node.value === '<u>');
}

function isPlain(child: PhrasingContent): child is Html {
  return child.type === 'html' && !isFormatted(child);
}

function nearFormatting(value: string, before: boolean, after: boolean) {
  const lines = value.split('\n');
  return lines
    .flatMap((line, number) => {
      const first = number === 0 && before;
      const last = number === lines.length - 1 && after;
      if (!line.trim() || /^ {0,3}(```|~~~|<)/.test(line) || (first && last && line.length <= 2000))
        return [line];
      if (first && last) return [`${line.slice(0, 1000)} ${line.slice(-1000)}`];
      if (first) return [line.slice(0, 1000)];
      if (last) return [line.slice(-1000)];
      return [];
    })
    .join('\n');
}

function keepsFormatting(children: PhrasingContent[], heading?: Heading) {
  if (!children.some((child) => child.type === 'html' && /[*_~`]|<!/.test(child.value)))
    return true;
  const large = children.reduce(
    (size, child) => size + (isPlain(child) ? child.value.length : 0),
    0,
  );
  const checked =
    large > 5000
      ? children.map((child, index) =>
          isPlain(child)
            ? {
                ...child,
                value: nearFormatting(child.value, index > 0, index < children.length - 1),
              }
            : child,
        )
      : children;
  const key = `${heading?.depth ?? 0}${JSON.stringify(checked)}`;
  const verdict = verdicts.get(key) ?? previousVerdicts.get(key) ?? parsesBack(checked, heading);
  verdicts.set(key, verdict);
  return verdict;
}

function parsesBack(checked: PhrasingContent[], heading?: Heading) {
  const parts = checked.map((child, index) => {
    const [previous, next] = [checked[index - 1], checked[index + 1]];
    if (isPlain(child)) return child.value;
    if (isFormatted(child) || previous?.type !== 'html' || next?.type !== 'html')
      return phrasingMarkdown([child]);
    return phrasingMarkdown([previous, child, next]).slice(
      previous.value.length,
      -next.value.length,
    );
  });
  const source = markdown.stringify({
    type: 'root',
    children: [{ ...(heading ?? { type: 'paragraph' }), children: checked } as Heading | Paragraph],
  });
  const atx = heading && !source.slice(0, -1).includes('\n');
  const prefix = atx ? `${'#'.repeat(heading.depth)} ` : '';
  const joined = prefix + parts.join('');
  const offsets: number[] = [];
  let at = 0;
  for (const char of joined) {
    if (char === '\\' && !source.startsWith(char, at)) {
      offsets.push(at);
      continue;
    }
    if (char !== '\\' && source[at] === '\\' && source.startsWith(char, at + 1)) at++;
    offsets.push(at, ...(char.length > 1 ? [at + 1] : []));
    if (source.startsWith(char, at)) {
      at += char.length;
      continue;
    }
    entity.lastIndex = at;
    const match = entity.exec(source);
    if (!match || String.fromCodePoint(parseInt(match[1], 16)) !== char) return false;
    at += match[0].length;
  }
  offsets.push(at);
  const expected = new Set<string>();
  let position = prefix.length;
  parts.forEach((part, index) => {
    const [from, to] = [offsets[position], offsets[position + part.length]];
    if (isFormatted(checked[index])) expected.add(`${from}:${source.slice(from, to)}`);
    position += part.length;
  });
  visit(markdown.parse(source), (node, _, parent) => {
    const { start, end } = node.position ?? {};
    if (isFormatted(node) && start && end && ['paragraph', 'heading'].includes(parent?.type ?? ''))
      expected.delete(`${start.offset}:${source.slice(start.offset, end.offset)}`);
  });
  return !expected.size;
}

function closeAutolink(value: string) {
  const tail = value.match(/\S*$/)![0];
  if (tail.length > 2000 || !/:\/\/|www\.|@/i.test(tail)) return value;
  if (!linkedTails.has(tail)) {
    if (linkedTails.size > 5000) linkedTails.clear();
    linkedTails.set(tail, linkTail(tail));
  }
  return value.slice(0, value.length - tail.length) + linkedTails.get(tail);
}

function linkTail(tail: string) {
  const paragraph = markdown.parse(tail).children[0];
  const link =
    paragraph?.type === 'paragraph'
      ? paragraph.children.findLast((child) => child.type === 'link')
      : undefined;
  const [from, to] = [link?.position?.start.offset, link?.position?.end.offset];
  if (link?.type !== 'link' || from === undefined || link.children[0]?.type !== 'text') return tail;
  const text = link.children[0].value;
  if (tail.slice(from, to) !== text) return tail;
  return (
    tail.slice(0, from) +
    (tail.slice(0, from).match(/\\*$/)![0].length % 2 ? '\\' : '') +
    phrasingMarkdown([{ type: 'link', url: link.url, children: [{ type: 'text', value: text }] }]) +
    tail.slice(from + text.length)
  );
}

function serializeComposerMarkdown(document: ProseMirrorNode, display = false) {
  const content: JSONContent[] = document.toJSON().content ?? [];
  const tree: Root = { type: 'root', children: blocks(content, display) };
  if (!display) [previousVerdicts, verdicts] = [verdicts, new Map()];
  const escape = (run: string) => run.replace(/./g, '\\$&');
  visit(tree, (node) => {
    if (display || !('children' in node) || !node.children.some((child) => child.type === 'html'))
      return;
    const children = node.children as PhrasingContent[];
    children.forEach((child, index) => {
      if (child.type !== 'html' || !children[index + 1]) return;
      if (children[index + 1].type !== 'html') child.value = closeAutolink(child.value);
      if (children[index + 1].type === 'link')
        child.value = child.value.replace(
          /(?<!\\)((?:\\\\)*)(!+)$/,
          (_, slashes: string, run: string) => slashes + escape(run),
        );
      if (child.value.match(/\\*$/)![0].length % 2) child.value += '\\';
    });
    if (!keepsFormatting(children, node.type === 'heading' ? node : undefined))
      for (const child of children)
        if (child.type === 'html')
          child.value = child.value.replace(/(?<!\\)((?:\\\\)*)([*_~`]|<(?=!))/g, '$1\\$2');
  });
  const last = content.at(-1);
  const trailingBreak = last?.type === 'paragraph' && last.content?.at(-1)?.type === 'hardBreak';
  const value = markdown.stringify(tree);
  return trailingBreak ? value : value.replace(/\n$/, '');
}

export function composerMarkdown(document: ProseMirrorNode) {
  return serializeComposerMarkdown(document);
}

export function composerDisplayMarkdown(document: ProseMirrorNode) {
  return serializeComposerMarkdown(document, true);
}

function text(value: string, marks: JSONContent['marks'] = []): JSONContent[] {
  return value
    .split('\n')
    .flatMap((line, index) => [
      ...(index ? [{ type: 'hardBreak' }] : []),
      ...(line ? [{ type: 'text', text: line, ...(marks.length ? { marks } : {}) }] : []),
    ]);
}

function isHtmlBreak(node: PhrasingContent | undefined) {
  return node?.type === 'html' && ['<br>', '<br/>', '<br />'].includes(node.value);
}

function readInline(
  nodes: PhrasingContent[],
  marks: NonNullable<JSONContent['marks']> = [],
): JSONContent[] {
  const result: JSONContent[] = [];
  let underline = 0;
  let closing = nodes.filter((node) => node.type === 'html' && node.value === '</u>').length;
  for (const [index, node] of nodes.entries()) {
    if (node.type === 'html' && node.value === '<u>' && closing > 0) {
      underline++;
      continue;
    }
    if (node.type === 'html' && node.value === '</u>' && underline) {
      underline--;
      closing--;
      continue;
    }
    const active = underline ? [...marks, { type: 'underline' }] : marks;
    if (node.type === 'break' || isHtmlBreak(node)) result.push({ type: 'hardBreak' });
    else if (node.type === 'text' || node.type === 'html')
      result.push(
        ...text(
          node.type === 'text' && isHtmlBreak(nodes[index - 1])
            ? node.value.replace(/^\r?\n/, '')
            : node.value,
          active,
        ),
      );
    else if (node.type === 'inlineCode')
      result.push({ type: 'text', text: node.value, marks: [...active, { type: 'code' }] });
    else if (node.type === 'link')
      result.push(
        ...readInline(node.children, [
          ...active,
          { type: 'link', attrs: { href: node.url, title: node.title } },
        ]),
      );
    else if (node.type === 'strong' || node.type === 'emphasis' || node.type === 'delete')
      result.push(
        ...readInline(node.children, [
          ...active,
          { type: { strong: 'bold', emphasis: 'italic', delete: 'strike' }[node.type] },
        ]),
      );
    else
      result.push(
        ...text(
          markdown
            .stringify({ type: 'root', children: [{ type: 'paragraph', children: [node] }] })
            .trim(),
          active,
        ),
      );
  }
  return result;
}

function readBlocks(nodes: RootContent[]): JSONContent[] {
  return nodes.flatMap((node): JSONContent[] => {
    switch (node.type) {
      case 'paragraph':
      case 'heading':
        return [
          {
            type: node.type,
            ...(node.type === 'heading' ? { attrs: { level: node.depth } } : {}),
            content: readInline(node.children),
          },
        ];
      case 'blockquote':
        return [{ type: 'blockquote', content: readBlocks(node.children) }];
      case 'code':
        return [
          {
            type: 'codeBlock',
            attrs: { language: node.lang ?? null },
            content: node.value ? [{ type: 'text', text: node.value }] : [],
          },
        ];
      case 'thematicBreak':
        return [{ type: 'horizontalRule' }];
      case 'list': {
        const lists: JSONContent[] = [];
        node.children.forEach((item, index) => {
          const task = typeof item.checked === 'boolean';
          const type = task ? 'taskList' : node.ordered ? 'orderedList' : 'bulletList';
          let list = lists.at(-1);
          if (list?.type !== type) {
            list = {
              type,
              ...(node.ordered ? { attrs: { start: (node.start ?? 1) + index } } : {}),
              content: [],
            };
            lists.push(list);
          }
          list.content!.push({
            type: task ? 'taskItem' : 'listItem',
            ...(task ? { attrs: { checked: item.checked } } : {}),
            content: readBlocks(item.children),
          });
        });
        return lists;
      }
      case 'table':
        return [
          {
            type: 'table',
            content: node.children.map((row, index) => ({
              type: 'tableRow',
              content: row.children.map((cell) => ({
                type: index ? 'tableCell' : 'tableHeader',
                content: [{ type: 'paragraph', content: readInline(cell.children) }],
              })),
            })),
          },
        ];
      case 'html':
        return [{ type: 'paragraph', content: text(node.value) }];
      case 'definition':
        return [];
      default:
        return [
          {
            type: 'paragraph',
            content: text(markdown.stringify({ type: 'root', children: [node] }).trim()),
          },
        ];
    }
  });
}

export function parseComposerMarkdown(value: string): JSONContent {
  if (!value.startsWith('/') && safeMessageLink(value, window.location.origin))
    return { type: 'doc', content: readBlocks([{ type: 'paragraph', children: literal(value) }]) };
  let parsed = markdown.parse(value);
  const protectedRanges: [number, number][] = [];
  visit(parsed, (node) => {
    if (
      [
        'code',
        'inlineCode',
        'link',
        'linkReference',
        'image',
        'imageReference',
        'html',
        'definition',
      ].includes(node.type)
    ) {
      if (node.position)
        protectedRanges.push([node.position.start.offset!, node.position.end.offset!]);
      return SKIP;
    }
  });
  let offset = 0;
  let source = '';
  for (const link of linkify.match(value) ?? []) {
    if (
      !safeMessageLink(link.raw, window.location.origin) ||
      protectedRanges.some(([start, end]) => link.index < end && link.lastIndex > start)
    )
      continue;
    source += value.slice(offset, link.index) + '<' + link.raw + '>';
    offset = link.lastIndex;
  }
  if (offset) parsed = markdown.parse(source + value.slice(offset));
  const tree = markdown.runSync(parsed) as Root;
  return { type: 'doc', content: readBlocks(tree.children) };
}

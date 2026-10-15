import type { ReactNode } from 'react';

// Разрешаем только относительные пути и http/https. Блокируем javascript:, data: и пр.
function isSafeUrl(raw: string): boolean {
  const value = raw.trim();

  if (value === '') {
    return false;
  }

  if (value.startsWith('/') || value.startsWith('#')) {
    return true;
  }

  const lower = value.toLowerCase();

  return lower.startsWith('http://') || lower.startsWith('https://');
}

let keyCounter = 0;
function nextKey(prefix: string): string {
  keyCounter += 1;
  return `${prefix}-${keyCounter}`;
}

// Инлайн-парсинг: code, image, link, bold, italic. Возвращает React-узлы.
// Содержимое bold/italic/текст ссылки парсится рекурсивно; содержимое code — литерал.
function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];

  // Порядок альтернатив важен: code и image раньше link, чтобы "![" не матчился как "[".
  const pattern =
    /(`[^`]+`)|(!\[[^\]]*\]\([^)]+\))|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*|_[^_]+_)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];

    if (token.startsWith('`')) {
      nodes.push(<code key={nextKey('c')}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('![')) {
      const parsed = parseImageOrLink(token, true);
      if (parsed) {
        nodes.push(parsed);
      } else {
        nodes.push(token);
      }
    } else if (token.startsWith('[')) {
      const parsed = parseImageOrLink(token, false);
      if (parsed) {
        nodes.push(parsed);
      } else {
        nodes.push(token);
      }
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={nextKey('b')}>{parseInline(token.slice(2, -2))}</strong>);
    } else {
      // *italic* или _italic_
      nodes.push(<em key={nextKey('i')}>{parseInline(token.slice(1, -1))}</em>);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function parseImageOrLink(token: string, isImage: boolean): ReactNode | null {
  // Формат: ![alt](url) или [text](url)
  const closeBracket = token.indexOf('](');
  if (closeBracket === -1 || !token.endsWith(')')) {
    return null;
  }

  const label = token.slice(isImage ? 2 : 1, closeBracket);
  const url = token.slice(closeBracket + 2, -1).trim();

  if (!isSafeUrl(url)) {
    return null;
  }

  if (isImage) {
    return <img key={nextKey('img')} src={url} alt={label} loading="lazy" />;
  }

  return (
    <a key={nextKey('a')} href={url} target="_blank" rel="noopener noreferrer">
      {parseInline(label)}
    </a>
  );
}

function headingLevel(line: string): number {
  let level = 0;
  while (level < line.length && line[level] === '#') {
    level += 1;
  }
  return level;
}

export function renderMarkdown(markdown: string): ReactNode[] {
  keyCounter = 0;

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];

  let i = 0;
  let paragraph: string[] = [];

  function flushParagraph() {
    if (paragraph.length === 0) {
      return;
    }

    const text = paragraph.join(' ').trim();
    paragraph = [];

    if (text === '') {
      return;
    }

    blocks.push(<p key={nextKey('p')}>{parseInline(text)}</p>);
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code block
    if (trimmed.startsWith('```')) {
      flushParagraph();

      const codeLines: string[] = [];
      i += 1;

      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }

      i += 1; // пропускаем закрывающий ```

      blocks.push(
        <pre key={nextKey('pre')}>
          <code>{codeLines.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    // Пустая строка — граница блока
    if (trimmed === '') {
      flushParagraph();
      i += 1;
      continue;
    }

    // Горизонтальный разделитель
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph();
      blocks.push(<hr key={nextKey('hr')} />);
      i += 1;
      continue;
    }

    // Заголовок
    const level = headingLevel(trimmed);
    if (level >= 1 && level <= 6 && trimmed[level] === ' ') {
      flushParagraph();
      const content = trimmed.slice(level + 1).trim();
      const Tag = (`h${level}` as unknown) as 'h1';
      blocks.push(<Tag key={nextKey('h')}>{parseInline(content)}</Tag>);
      i += 1;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      flushParagraph();
      const quoteLines: string[] = [];

      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }

      blocks.push(
        <blockquote key={nextKey('q')}>
          {quoteLines.map((q, idx) => (
            <p key={idx}>{parseInline(q)}</p>
          ))}
        </blockquote>,
      );
      continue;
    }

    // Упорядоченный список
    if (/^\d+[.)]\s+/.test(trimmed)) {
      flushParagraph();
      const items: string[] = [];

      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''));
        i += 1;
      }

      blocks.push(
        <ol key={nextKey('ol')}>
          {items.map((item, idx) => (
            <li key={idx}>{parseInline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Маркированный список
    if (/^[-*+]\s+/.test(trimmed)) {
      flushParagraph();
      const items: string[] = [];

      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
        i += 1;
      }

      blocks.push(
        <ul key={nextKey('ul')}>
          {items.map((item, idx) => (
            <li key={idx}>{parseInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Обычная строка абзаца
    paragraph.push(trimmed);
    i += 1;
  }

  flushParagraph();

  return blocks;
}
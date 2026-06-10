// src/ui/changelog-md.ts
//
// A deliberately tiny markdown renderer for ONE input: CHANGELOG.md, shown in
// the About modal. It is not a general markdown engine — it covers exactly the
// subset the changelog uses (##/### headings, "-" lists with wrapped
// continuation lines, **bold**, `code`, [links](url)) and HTML-escapes
// everything else. Rendering from the file keeps the in-app version history a
// single source of truth that updates itself every release.

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Inline formatting on already-block-split text. */
function inline(s: string): string {
  let t = escapeHtml(s);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return t;
}

export function renderChangelog(md: string): string {
  const lines = md.split('\n');
  // Skip the dev preamble (title, format note, release-process blockquote);
  // start at the first version heading.
  const start = lines.findIndex((l) => /^## \[/.test(l));
  const body = start >= 0 ? lines.slice(start) : lines;

  const out: string[] = [];
  let inList = false;
  const closeList = (): void => { if (inList) { out.push('</ul>'); inList = false; } };

  for (const raw of body) {
    const line = raw.replace(/\s+$/, '');

    if (/^### /.test(line)) { closeList(); out.push(`<h4>${inline(line.slice(4))}</h4>`); continue; }
    if (/^## /.test(line))  { closeList(); out.push(`<h3>${inline(line.slice(3))}</h3>`); continue; }
    if (/^# /.test(line))   { closeList(); out.push(`<h3>${inline(line.slice(2))}</h3>`); continue; }

    if (/^[-*] /.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(line.slice(2))}</li>`);
      continue;
    }

    // Indented, non-empty line while in a list → continuation of the last <li>.
    if (inList && /^\s+\S/.test(raw) && out.length) {
      const last = out.length - 1;
      out[last] = out[last]!.replace(/<\/li>$/, ` ${inline(line.trim())}</li>`);
      continue;
    }

    if (line.trim() === '') { closeList(); continue; }

    closeList();
    out.push(`<p>${inline(line.trim())}</p>`);
  }
  closeList();
  return out.join('\n');
}

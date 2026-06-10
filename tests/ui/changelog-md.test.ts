// tests/ui/changelog-md.test.ts
//
// The About modal renders CHANGELOG.md live (single source of truth). This is
// the small markdown subset renderer that drives it — the only risky logic, so
// it's tested directly. It covers exactly what the changelog uses: ##/###
// headings, "-" list items (with wrapped continuation lines), **bold**, `code`,
// and [links](url), HTML-escaped. The dev preamble before the first version
// heading is dropped.
import { describe, it, expect } from 'vitest';
import { renderChangelog } from '../../src/ui/changelog-md';

describe('changelog markdown renderer', () => {
  it('renders version + section headings', () => {
    const html = renderChangelog('## [1.1.0] — 2026-06-10\n\n### Added\n');
    expect(html).toContain('<h3>[1.1.0] — 2026-06-10</h3>');
    expect(html).toContain('<h4>Added</h4>');
  });

  it('renders list items inside a <ul>, with inline bold/code/links', () => {
    const md = '## [1.1.0]\n\n### Added\n- **Foo.** uses `bar` see [docs](https://x.test)\n';
    const html = renderChangelog(md);
    expect(html).toContain('<ul>');
    expect(html).toContain('<li><strong>Foo.</strong> uses <code>bar</code> see <a href="https://x.test" target="_blank" rel="noopener">docs</a></li>');
  });

  it('joins wrapped continuation lines into the same list item', () => {
    const md = '## [1.1.0]\n\n- First line\n  wrapped continuation\n';
    const html = renderChangelog(md);
    expect(html).toContain('<li>First line wrapped continuation</li>');
  });

  it('escapes HTML in content', () => {
    const md = '## [1.1.0]\n\n- a < b & c > d\n';
    expect(renderChangelog(md)).toContain('<li>a &lt; b &amp; c &gt; d</li>');
  });

  it('drops the dev preamble before the first version heading', () => {
    const md = '# Changelog\n\nSome intro.\n\n> Release process: run deploy.sh\n\n## [1.1.0]\n\n- thing\n';
    const html = renderChangelog(md);
    expect(html).not.toContain('Release process');
    expect(html).not.toContain('Some intro');
    expect(html).toContain('<h3>[1.1.0]</h3>');
  });

  it('does not turn bracketed-but-unlinked text into a link', () => {
    const html = renderChangelog('## [1.0.0]\n\n- nothing here\n');
    expect(html).toContain('<h3>[1.0.0]</h3>');
    expect(html).not.toContain('<a ');
  });
});

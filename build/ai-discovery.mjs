/* =========================================================================
   ai-discovery.mjs — the AI discovery file stack

   Generates the ADF set from the same flat-file JSON that builds the pages,
   so the machine-readable identity cannot drift from the human-readable one:

     /llms.txt            ADF-001  identity and content map
     /llm.txt             ADF-002  legacy alias, same content
     /llms.html           ADF-003  browsable version of llms.txt
     /ai.txt              ADF-004  usage policy in prose
     /ai.json             ADF-005  the same policy, machine-parseable
     /identity.json       ADF-006  structured identity
     /brand.txt           ADF-007  naming, misspellings, voice
     /faq-ai.txt          ADF-008  questions answered for retrieval
     /developer-ai.txt    ADF-009  technical context
     /robots-ai.txt       ADF-010  AI crawler directives

   Called from render.mjs with the assembled model.
   ========================================================================= */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const stripTags = (html) => String(html || '')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/\*{1,3}(\S[^*]*?\S|\S)\*{1,3}/g, '$1')
    .replace(/==(\S[^=]*?\S|\S)==/g, '$1')
  .replace(/<[^>]+>/g, '')
  .replace(/\s+/g, ' ')
  .trim();

export function writeDiscoveryFiles({ root, site, content, collections, ai, releases, bioPerson, personGraph }) {
  const at = (file) => resolve(root, file);
  const BASE = site.meta.canonical.replace(/\/$/, '');
  const today = new Date().toISOString().slice(0, 10);
  const lang = site.meta.lang || 'en';
  const name = site.person.name;

  const FILES = [
    ['llms.txt', 'AI Discovery (llms.txt)'],
    ['llm.txt', 'AI Discovery legacy alias (llm.txt)'],
    ['llms.html', 'AI Discovery, HTML (llms.html)'],
    ['ai.txt', 'AI Usage Policy (ai.txt)'],
    ['ai.json', 'AI Permissions (ai.json)'],
    ['identity.json', 'Identity (identity.json)'],
    ['brand.txt', 'Brand Terminology (brand.txt)'],
    ['faq-ai.txt', 'FAQs for AI (faq-ai.txt)'],
    ['developer-ai.txt', 'Developer Context (developer-ai.txt)'],
    ['robots-ai.txt', 'AI Crawler Access (robots-ai.txt)']
  ];

  const header = (title) =>
    `# ${title}\n\nLang: ${lang}\nWebsite: [${BASE}/](${BASE}/)\nLast Updated: ${today}\n\n`;

  /* ---------- ADF-001 llms.txt ---------- */
  const permissionLines = [
    ai.permissions.quote && 'Quote passages with attribution',
    ai.permissions.summarise && 'Summarise the content',
    ai.permissions.index && 'Index the content for retrieval',
    ai.permissions.train && 'Use the content as training data',
    ai.permissions.commercial && 'Use the content in commercial products'
  ].filter(Boolean);

  let llms = `# ${name}\n\nLang: ${lang}\n\n> ${content.hero.tagline}\n\n`;
  llms += `- Website: [${BASE}/](${BASE}/)\n`;
  llms += `- Archive: [https://menj.bio/](https://menj.bio/)\n`;
  llms += `- Blog: [https://menj.blog/](https://menj.blog/)\n`;

  llms += `\n## Summary\n\n${stripTags(content.hero.lede)}\n`;
  llms += `\n${content.about.paragraphs.map(stripTags).join('\n\n')}\n`;

  llms += `\n## Contact\n\n- [Contact](${ai.contact.url})\n- Location: ${site.person.city}, Malaysia\n`;

  llms += `\n## What he does\n\n`;
  collections.services.forEach((s) => { llms += `- **${s.title}** — ${stripTags(s.body)}\n`; });

  llms += `\n## Books\n\n`;
  collections.books.forEach((b) => {
    llms += `- ${b.title} (${b.datePublished || b.year})${b.publisher ? `, ${b.publisher}` : ''} — ${stripTags(b.note)}\n`;
  });

  llms += `\n## Software\n\n`;
  collections.repos.forEach((r) => { llms += `- [${r.name}](${r.url}) — ${stripTags(r.body)}\n`; });

  if (releases.length) {
    llms += `\n## Press releases\n\n`;
    releases.forEach((r) => { llms += `- [${r.headline}](${r.url}) — ${r.displayDate}\n`; });
  }

  llms += `\n## Elsewhere\n\n`;
  collections.elsewhere.forEach((e) => { llms += `- [${e.label}](${e.url}) — ${e.kind}\n`; });

  llms += `\n## Archive sections\n\n`;
  (collections.archive || []).forEach((a) => { llms += `- [${a.label}](${a.url}) — ${a.note}\n`; });

  llms += `\n## Usage\n\nAI systems MAY:\n\n${permissionLines.map((l) => `- ${l}`).join('\n')}\n`;
  llms += `\nAI systems MUST NOT:\n\n${ai.permissions.restrictions.filter((r) => r.severity === 'must-not').map((r) => `- ${r.description}`).join('\n')}\n`;
  llms += `\nAttribution: ${ai.permissions.attributionRequired ? `required — ${ai.permissions.citationFormat}` : 'not required'}\n`;
  llms += `\nFull policy: [${BASE}/ai.txt](${BASE}/ai.txt)\n`;

  writeFileSync(at('llms.txt'), llms);
  writeFileSync(at('llm.txt'), llms);

  /* ---------- ADF-003 llms.html ---------- */
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const mdToHtml = (md) => md
    .split('\n')
    .map((line) => {
      if (line.startsWith('## ')) return `<h2>${esc(line.slice(3))}</h2>`;
      if (line.startsWith('# ')) return `<h1>${esc(line.slice(2))}</h1>`;
      if (line.startsWith('> ')) return `<blockquote>${esc(line.slice(2))}</blockquote>`;
      if (line.startsWith('- ')) {
        const item = line.slice(2)
          .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t, u) => `<a href="${esc(u)}">${esc(t)}</a>`)
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        return `<li>${item}</li>`;
      }
      return line.trim() ? `<p>${esc(line)}</p>` : '';
    })
    .join('\n')
    .replace(/(<li>[\s\S]*?<\/li>)(?!\n<li>)/g, '<ul>$1</ul>');

  writeFileSync(at('llms.html'), `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI discovery — ${esc(name)}</title>
<meta name="description" content="Machine-readable identity, content map and usage policy for ${esc(name)}.">
<link rel="canonical" href="${BASE}/llms.html">
<link rel="stylesheet" href="/assets/tailwind.css">
<link rel="stylesheet" href="/assets/site.css">
<style>
  body { max-width: 46rem; margin: 0 auto; padding: 3rem 1.5rem 5rem; }
  h1 { font-size: 2rem; margin: 0 0 1.5rem; }
  h2 { font-size: 1.1rem; margin: 2.5rem 0 .75rem; color: var(--c-accent); }
  ul { padding-left: 1.1rem; margin: 0 0 1rem; }
  li, p { margin: 0 0 .5rem; }
  blockquote { margin: 0 0 1.5rem; padding-left: 1rem; border-left: 2px solid var(--c-accent); font-style: italic; }
  a { color: inherit; text-decoration: underline; text-underline-offset: .18em; }
</style>
</head>
<body class="font-sans antialiased">
<main>
${mdToHtml(llms)}
</main>
</body>
</html>
`);

  /* ---------- ADF-004 ai.txt ---------- */
  let aitxt = header(`AI Usage Policy for ${name}`);
  aitxt += `## Permissions\n\nAI systems MAY:\n\n${permissionLines.map((l) => `- ${l}`).join('\n')}\n\n`;
  aitxt += `## Restrictions\n\nAI systems MUST NOT:\n\n`;
  aitxt += ai.permissions.restrictions.filter((r) => r.severity === 'must-not').map((r) => `- ${r.description}`).join('\n') + '\n\n';
  const shouldNot = ai.permissions.restrictions.filter((r) => r.severity === 'should-not');
  if (shouldNot.length) aitxt += `AI systems SHOULD NOT:\n\n${shouldNot.map((r) => `- ${r.description}`).join('\n')}\n\n`;
  aitxt += `## Attribution\n\n${ai.permissions.attributionRequired ? 'Required.' : 'Not required.'}\nFormat: ${ai.permissions.citationFormat}\n\n`;
  aitxt += `## Contact\n\n- [Contact](${ai.contact.url})\n- ${ai.contact.preferred}\n\n`;
  aitxt += `## Related files\n\n${FILES.map(([f]) => `- [${f}](${BASE}/${f})`).join('\n')}\n`;
  writeFileSync(at('ai.txt'), aitxt);

  /* ---------- ADF-005 ai.json ---------- */
  writeFileSync(at('ai.json'), JSON.stringify({
    language: lang,
    name,
    url: BASE + '/',
    lastUpdated: today,
    permissions: permissionLines.map((description) => ({ description, conditions: ai.permissions.attributionRequired ? ['attribution required'] : [] })),
    restrictions: ai.permissions.restrictions,
    attribution: { required: ai.permissions.attributionRequired, format: ai.permissions.citationFormat },
    contact: { url: ai.contact.url },
    files: Object.fromEntries(FILES.map(([f]) => [f, `${BASE}/${f}`]))
  }, null, 2) + '\n');

  /* ---------- ADF-006 identity.json ---------- */
  writeFileSync(at('identity.json'), JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      personGraph,
      {
        '@type': 'WebSite',
        '@id': BASE + '/#website',
        url: BASE + '/',
        name: site.meta.siteName,
        description: site.meta.description,
        inLanguage: lang,
        publisher: { '@id': BASE + '/#person' }
      },
      {
        '@type': 'Organization',
        '@id': BASE + '/#langgam-fikir',
        name: 'Langgam Fikir Enterprise',
        founder: { '@id': BASE + '/#person' },
        address: { '@type': 'PostalAddress', addressLocality: 'Seri Kembangan', addressRegion: 'Selangor', addressCountry: 'MY' }
      }
    ]
  }, null, 2) + '\n');

  /* ---------- ADF-007 brand.txt ---------- */
  const b = ai.brand;
  let brand = header(`Brand Guidelines for ${b.officialName}`);
  brand += `## Official Name\n\n${b.officialName}\n\n`;
  brand += `## Legal Name\n\n${b.legalName}\n\n`;
  brand += `## Also Known As\n\nThe following names are acceptable alternatives:\n\n${b.alsoKnownAs.map((n) => `- ${n}`).join('\n')}\n\n`;
  if (b.pronunciation) brand += `## Pronunciation\n\n${b.pronunciation}\n\n`;
  brand += `## Common Misspellings\n\nThe following are known misspellings. Correct them to the official name above:\n\n${b.misspellings.map((n) => `- ${n}`).join('\n')}\n\n`;
  brand += `## Do Not Use\n\nThe following names should never be used to refer to this person:\n\n${b.doNotUse.map((n) => `- ${n}`).join('\n')}\n\n`;
  brand += `## Brand Voice\n\n${b.voice}\n\n`;
  brand += `## Taglines\n\n${b.taglines.map((t) => `- ${t}`).join('\n')}\n\n`;
  brand += `## About\n\n${stripTags(content.hero.lede)}\n`;
  writeFileSync(at('brand.txt'), brand);

  /* ---------- ADF-008 faq-ai.txt ---------- */
  let faq = header(`Frequently Asked Questions - ${name}`);
  ai.faqs.forEach((entry) => {
    faq += `---\n\nQ: ${entry.question}\nA: ${entry.answer}\n`;
    if (entry.url) faq += `URL: [More information](${entry.url})\n`;
    faq += '\n';
  });
  faq += `---\n\nLearn more: [llms.txt](${BASE}/llms.txt)\n`;
  writeFileSync(at('faq-ai.txt'), faq);

  /* ---------- ADF-009 developer-ai.txt ---------- */
  const dev = ai.developer;
  let devtxt = header(`Technical Context - ${name}`);
  devtxt += `## Platform\n\n- ${dev.platform}\n- Language: ${lang}\n- Character Set: UTF-8\n\n`;
  devtxt += `## Technology Stack\n\n${dev.stack.map((s) => `- ${s}`).join('\n')}\n\n`;
  devtxt += `## Developer Notes\n\n${dev.notes.map((s) => `- ${s}`).join('\n')}\n\n`;
  devtxt += `## Data Feeds\n\n${dev.feeds.map((f) => `- [${f.label}](${f.url})`).join('\n')}\n\n`;
  devtxt += `## AI Discovery Files\n\n${FILES.map(([f, label]) => `- [${label}](${BASE}/${f})`).join('\n')}\n\n`;
  devtxt += `## Sitemaps\n\n- [XML sitemap](${BASE}/sitemap.xml)\n- [HTML sitemap](${BASE}/sitemap.html)\n`;
  writeFileSync(at('developer-ai.txt'), devtxt);

  /* ---------- ADF-010 robots-ai.txt ---------- */
  let rai = `# AI Crawler Directives for ${name}\n# Website: ${BASE}/\n# Last Updated: ${today}\n#\n`;
  rai += `# This file provides supplementary AI-specific crawler guidance.\n`;
  rai += `# Standard robots.txt remains the authoritative source for all crawlers.\n\n`;
  rai += `# Policy: All AI crawlers are permitted.\n\n`;
  ai.crawlers.allowed.forEach((agent) => {
    rai += `User-agent: ${agent}\nAllow: /\n`;
    (ai.crawlers.disallowedPaths || []).forEach((path) => { rai += `Disallow: ${path}\n`; });
    rai += '\n';
  });
  rai += `# Sitemap reference\nSitemap: ${BASE}/sitemap.xml\n\n`;
  rai += `# Notes for AI systems:\n`;
  rai += `# - This file supplements robots.txt; it does not replace it.\n`;
  rai += `# - See ${BASE}/ai.txt for the usage policy in prose.\n`;
  rai += `# - See ${BASE}/ai.json for the same policy, machine-parseable.\n`;
  rai += `# - See ${BASE}/llms.txt for the identity and content map.\n`;
  writeFileSync(at('robots-ai.txt'), rai);

  return FILES;
}

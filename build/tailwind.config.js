/* Tailwind build configuration.
   Colours resolve to the CSS variables declared in assets/site.css, so the
   palette is changed in one place. Rebuild with build/build.sh after adding
   or removing any utility class in index.html or assets/site.js. */
module.exports = {
  content: [
    '../index.html',
    '../press/**/*.html',
    '../sitemap/*.html',
    '../404.html',
    '../assets/site.js'
  ],
  theme: {
    extend: {
      colors: {
        ink:     'var(--c-ink)',
        surface: 'var(--c-surface)',
        line:    'var(--c-line)',
        cream:   'var(--c-cream)',
        muted:   'var(--c-muted)',
        accent:  'var(--c-accent)',
        accent2: 'var(--c-accent2)'
      },
      fontFamily: {
        display: ['"Sabon Next LT"', '"EB Garamond"', 'Georgia', 'serif'],
        sans:    ['"EB Garamond"', '"Sabon Next LT"', 'Georgia', 'serif'],
        body:    ['"EB Garamond"', 'Georgia', 'serif'],
        mono:    ['"Special Elite"', 'Courier New', 'monospace']
      }
    }
  }
};

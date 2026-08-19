// Regenerates public/sitemap.xml from the static blog post list before every
// build, so a new blog post automatically gets a sitemap entry instead of
// someone having to remember to hand-edit an XML file every time one's
// added. Runs as a plain Node script (no TS import) — reads
// src/pages/data/blogPosts.ts as text and regex-extracts each post's slug,
// rather than pulling in a TS loader just for this. If that file's `slug:`
// field format ever changes, update the regex below to match.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const blogPostsSrc = fs.readFileSync(path.join(root, 'src/pages/data/blogPosts.ts'), 'utf8');
const slugs = [...blogPostsSrc.matchAll(/slug:\s*'([^']+)'/g)].map(m => m[1]);

const BASE_URL = 'https://pipecho.com';
const today = new Date().toISOString().slice(0, 10);

const staticRoutes = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/pricing', priority: '0.8', changefreq: 'monthly' },
  { path: '/blog', priority: '0.8', changefreq: 'weekly' },
];

const blogRoutes = slugs.map(slug => ({ path: `/blog/${slug}`, priority: '0.6', changefreq: 'monthly' }));

const urls = [...staticRoutes, ...blogRoutes]
  .map(
    r => `  <url>
    <loc>${BASE_URL}${r.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority}</priority>
  </url>`
  )
  .join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

fs.writeFileSync(path.join(root, 'public/sitemap.xml'), xml);
console.log(`Generated sitemap.xml with ${staticRoutes.length + blogRoutes.length} URLs (${blogRoutes.length} blog posts).`);

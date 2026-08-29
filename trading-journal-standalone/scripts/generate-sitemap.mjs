// Regenerates public/sitemap.xml from the static blog post list and the
// feature list before every build, so a new blog post or feature
// automatically gets a sitemap entry instead of someone having to remember
// to hand-edit an XML file every time one's added. Runs as a plain Node
// script (no TS import) — reads src/pages/data/blogPosts.ts and
// src/pages/data/features.ts as text and regex-extracts each post's slug /
// each feature's title, rather than pulling in a TS loader just for this. If
// either file's field format ever changes, update the matching regex below.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const blogPostsSrc = fs.readFileSync(path.join(root, 'src/pages/data/blogPosts.ts'), 'utf8');
const slugs = [...blogPostsSrc.matchAll(/slug:\s*'([^']+)'/g)].map(m => m[1]);

// Mirrors src/lib/featureSlug.ts's featureSlug() exactly — kept in sync by
// hand since this script can't import the real TS function.
function featureSlug(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
const featuresSrc = fs.readFileSync(path.join(root, 'src/pages/data/features.ts'), 'utf8');
const featureTitles = [...featuresSrc.matchAll(/title:\s*'([^']+)'/g)].map(m => m[1]);
const featureSlugs = featureTitles.map(featureSlug);

const BASE_URL = 'https://pipecho.com';
const today = new Date().toISOString().slice(0, 10);

const staticRoutes = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/demo', priority: '0.9', changefreq: 'monthly' },
  { path: '/demo/app', priority: '0.7', changefreq: 'monthly' },
  { path: '/pricing', priority: '0.8', changefreq: 'monthly' },
  { path: '/tools/session-clock', priority: '0.7', changefreq: 'monthly' },
  { path: '/blog', priority: '0.8', changefreq: 'weekly' },
];

const blogRoutes = slugs.map(slug => ({ path: `/blog/${slug}`, priority: '0.6', changefreq: 'monthly' }));
const featureRoutes = featureSlugs.map(slug => ({ path: `/features/${slug}`, priority: '0.7', changefreq: 'monthly' }));

const allRoutes = [...staticRoutes, ...featureRoutes, ...blogRoutes];
const urls = allRoutes
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
console.log(`Generated sitemap.xml with ${allRoutes.length} URLs (${blogRoutes.length} blog posts, ${featureRoutes.length} feature pages).`);

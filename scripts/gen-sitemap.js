// 產生 sitemap.xml —— 掃描整個 repo 的 .html 頁面
// 用法：node scripts/gen-sitemap.js（新增頁面後重跑）
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASE = 'https://ploglin.github.io/';
const SKIP_DIRS = new Set(['.git', '.idea', 'node_modules', 'assets', 'scripts', 'scratchpad', '.github']);

const urls = [];

function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const rel = path.relative(ROOT, full).split(path.sep).join('/');
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
            if (SKIP_DIRS.has(name)) continue;
            walk(full);
        } else if (name.endsWith('.html')) {
            let url;
            if (name === 'index.html') {
                const d = rel.slice(0, -'index.html'.length); // 保留結尾斜線
                url = BASE + d;
            } else {
                url = BASE + rel;
            }
            urls.push(url);
        }
    }
}

walk(ROOT);
urls.sort();

// 首頁優先權高一點，其餘預設
const body = urls.map(function (u) {
    const isHome = u === BASE;
    return '  <url>\n    <loc>' + u + '</loc>\n' +
        (isHome ? '    <priority>1.0</priority>\n' : '') +
        '  </url>';
}).join('\n');

const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    body + '\n</urlset>\n';

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml, 'utf8');
console.log('sitemap.xml 已產生，共 ' + urls.length + ' 個 URL');

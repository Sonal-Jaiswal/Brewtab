// Local pages for E2E tests (no internet needed). Port 4599.
import { createServer } from 'node:http';

const article = (title) => `<!doctype html><html><head><title>${title}</title>
<style>body{font-family:Arial;background:#fff;color:#111;margin:0} header{position:fixed;top:0;left:0;right:0;height:40px;background:#eee}
main{max-width:700px;margin:60px auto;padding:0 16px} p{line-height:1.6} .tall{height:2600px;background:linear-gradient(#fff,#ccd)}</style></head>
<body><header>Sticky header</header><main><article><h1>${title}</h1>
${Array.from({ length: 12 }, (_, i) => `<p>Paragraph ${i + 1}. Brewtab test content about focus, calm browsing and reading. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.</p>`).join('\n')}
</article><div class="tall"></div><img id="pic" alt="" width="40" height="40" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect width='40' height='40' fill='red'/></svg>"></main>
<script>setTimeout(()=>{const d=document.createElement('div');d.id='late';d.textContent='Loaded later';document.querySelector('main').appendChild(d)},300)</script>
</body></html>`;

const dark = `<!doctype html><html><head><title>Dark site</title></head><body style="background:#111;color:#eee"><p>Already dark</p></body></html>`;

createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.url?.startsWith('/dark')) return res.end(dark);
  res.end(article(req.url === '/' ? 'Fixture home' : `Fixture ${req.url}`));
}).listen(4599, () => console.log('fixture server on http://localhost:4599'));

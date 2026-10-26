import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
function build(url = '', legacy = false) {
  execFileSync(process.execPath, ['tools/build.mjs', ...(legacy ? ['--legacy'] : [])], {cwd:root, env:{...process.env, FEEDBACK_URL:url}});
  const html = fs.readFileSync(path.join(out,'index.html'),'utf8');
  const refs = [...html.matchAll(/src="([^"]+)"/g)].map(m => m[1]);
  for (const ref of refs) assert.ok(fs.existsSync(path.join(out,ref)), ref);
  const config = {window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(out,refs.find(r => r.startsWith('js/config.'))),'utf8'), config);
  return {html, refs, config:config.window.MEGALUL_CONFIG};
}
test('static builds have complete assets, stable hashes, and configurable safe feedback URL', () => {
  try {
    const first = build(); assert.equal(first.config.feedbackUrl, '');
    assert.equal(build().html, first.html);
    const next = build('https://example.org/feedback');
    assert.notEqual(next.config.version, first.config.version);
    assert.notEqual(next.refs.find(r => r.startsWith('js/config.')), first.refs.find(r => r.startsWith('js/config.')));
    assert.equal(next.config.feedbackUrl, 'https://example.org/feedback');
    for (const f of ['_redirects','_headers','icon.svg','manifest.webmanifest']) assert.ok(fs.existsSync(path.join(out,f)));
    assert.ok(!fs.existsSync(path.join(out,'functions')));
    for (const url of ['javascript:alert(1)', 'http://example.org', 'https://user:password@example.org']) {
      const result = spawnSync(process.execPath, ['tools/build.mjs'], {cwd:root,env:{...process.env,FEEDBACK_URL:url}});
      assert.notEqual(result.status,0);
    }
    build('',true);
    assert.ok(fs.existsSync(path.join(out,'vendor/three.r128.min.js')));
    assert.ok(fs.existsSync(path.join(out,'admin.html')));
  } finally { build(); }
});

test('feedback link is only shown for a configured HTTPS form', () => {
  const source = fs.readFileSync(path.join(root,'public/js/feedback.js'),'utf8');
  for (const url of ['', 'javascript:alert(1)', 'https://example.org/form']) {
    let visible = false; const link = {classList:{remove(){ visible = true; }}};
    vm.runInNewContext(source, {window:{MEGALUL_CONFIG:{feedbackUrl:url}},URL,M:{el:() => link}});
    assert.equal(visible,url.startsWith('https:'));
    if (visible) assert.equal(link.href,url);
  }
});

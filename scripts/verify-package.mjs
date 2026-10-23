import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('..', import.meta.url).pathname)
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
assert.equal(pkg.name, 'dsh-semantic-cache-layer')
assert.equal(pkg.version, '0.2.1-rc.2')
assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
assert.equal(pkg.engines.dsh, '0.2.1-rc.2')
assert.equal(pkg.peerDependencies['@deepseek-ai/cordis'], '0.2.1-rc.2')
assert.equal(pkg.peerDependencies['@deepseek-ai/dsh-tools'], '0.2.1-rc.2')
assert.equal(pkg.peerDependencies['@deepseek-ai/schemastery'], '0.2.1-rc.2')
assert.ok(pkg.peerDependencies['@deepseek-ai/cordis'])
assert.ok(pkg.peerDependencies['@deepseek-ai/dsh-tools'])
assert.ok(pkg.peerDependencies['@deepseek-ai/schemastery'])
const skill = join(root, 'skills', 'semantic-cache-operations', 'SKILL.md')
const skillText = readFileSync(skill, 'utf8')
assert.match(skillText, /^---\nname: dsh-semantic-cache-operations\ndescription: .+\n---\n/s)
assert.ok(statSync(skill).isFile())
const walked = []
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    assert.ok(!entry.isSymbolicLink(), `symlink is not allowed: ${path}`)
    if (entry.isDirectory()) walk(path)
    else walked.push(path)
  }
}
walk(root)
for (const path of walked) {
  assert.ok(!path.includes(`${join('node_modules', '')}`), `vendored node_modules: ${path}`)
  assert.ok(!path.endsWith('.pyc'))
  assert.ok(!path.endsWith('.env') && !path.endsWith('.env.local'))
}
const icon = readFileSync(join(root, 'icon.svg'), 'utf8')
assert.match(icon, /<svg[^>]+width="128"[^>]+height="128"[^>]+viewBox="0 0 128 128"/)
console.log(JSON.stringify({ ok: true, package: pkg.name, version: pkg.version, filesChecked: walked.length, skillFound: true, iconSquare: true }, null, 2))

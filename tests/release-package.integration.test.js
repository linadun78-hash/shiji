const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.join(__dirname, '..');
const windowsOnly = { skip: process.platform !== 'win32' };

function fixture(t) {
  const tempParent = path.join(projectRoot, 'tmp');
  fs.mkdirSync(tempParent, { recursive: true });
  const base = fs.mkdtempSync(path.join(tempParent, 'release-package-test-'));
  const root = path.join(base, 'project');
  const links = [];
  t.after(() => {
    for (const link of links) if (fs.existsSync(link)) fs.unlinkSync(link);
    fs.rmSync(base, { recursive: true, force: true });
  });
  for (const name of ['scripts', 'src', 'assets', 'backend', 'dist']) {
    fs.mkdirSync(path.join(root, name), { recursive: true });
  }
  fs.copyFileSync(path.join(projectRoot, 'scripts/package-local-preview.ps1'), path.join(root, 'scripts/package-local-preview.ps1'));
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: '\u62fe\u96c6', version: '0.3.0' }));
  fs.writeFileSync(path.join(root, 'src/main.js'), 'globalThis.preview = true;\n');
  fs.writeFileSync(path.join(root, 'assets/mark.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  fs.writeFileSync(path.join(root, 'backend/private.txt'), 'excluded backend fixture');
  const zipPath = path.join(root, 'dist/xhs-task-material-collector-v0.3.0.zip');
  return {
    root, base, zipPath,
    junction(relative, target) {
      const link = path.join(root, relative);
      fs.symlinkSync(target, link, 'junction');
      links.push(link);
    },
  };
}

function runPackage(root, output = 'dist') {
  const result = spawnSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    path.join(root, 'scripts/package-local-preview.ps1'), '-OutputDirectory', output,
  ], { encoding: 'utf8', timeout: 30000 });
  assert.ifError(result.error);
  return result;
}

function inspectArchive(zipPath) {
  const command = `
    $ErrorActionPreference = 'Stop'
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($env:XMC_TEST_ZIP)
    try {
      $entry = $archive.GetEntry('manifest.json')
      $reader = [IO.StreamReader]::new($entry.Open(), [Text.Encoding]::UTF8)
      try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
      @{ entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\\', '/') }); name = $manifest.name } | ConvertTo-Json -Compress
    } finally { $archive.Dispose() }
  `;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], {
    encoding: 'utf8', timeout: 30000, env: { ...process.env, XMC_TEST_ZIP: zipPath },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('real packager writes only runtime files and an accurate checksum', windowsOnly, (t) => {
  const fixtureData = fixture(t);
  const result = runPackage(fixtureData.root);
  assert.equal(result.status, 0, result.stderr);
  const contents = inspectArchive(fixtureData.zipPath);
  assert.deepEqual(contents.entries.filter((name) => !name.endsWith('/')).sort(), ['assets/mark.svg', 'manifest.json', 'src/main.js']);
  assert.equal(contents.name, '\u62fe\u96c6');
  assert.equal(fs.readFileSync(fixtureData.zipPath + '.sha256', 'utf8').trim(), createHash('sha256').update(fs.readFileSync(fixtureData.zipPath)).digest('hex'));
});

for (const secretName of ['src/.env', 'src/.env.local', 'assets/private.key', 'src/settings.json']) {
  test(`real packager rejects nested credential file ${secretName} before replacing a release`, windowsOnly, (t) => {
    const { root, zipPath } = fixture(t);
    fs.writeFileSync(zipPath, 'previous release');
    fs.writeFileSync(zipPath + '.sha256', 'previous checksum');
    fs.writeFileSync(path.join(root, secretName), 'synthetic test credential');
    const result = runPackage(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /sensitive|credential/i);
    assert.equal(fs.readFileSync(zipPath, 'utf8'), 'previous release');
    assert.equal(fs.readFileSync(zipPath + '.sha256', 'utf8'), 'previous checksum');
  });
}

test('real packager rejects output directories outside dist', windowsOnly, (t) => {
  const { root, base } = fixture(t);
  for (const output of ['backend', '../outside']) {
    const result = runPackage(root, output);
    assert.notEqual(result.status, 0, `accepted ${output}`);
    assert.match(result.stderr, /dist/i);
  }
  assert.deepEqual(fs.readdirSync(path.join(root, 'backend')), ['private.txt']);
  assert.equal(fs.existsSync(path.join(base, 'outside')), false);
});

test('real packager rejects source junctions without reading external files', windowsOnly, (t) => {
  const fixtureData = fixture(t);
  const outside = path.join(fixtureData.base, 'outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'private.txt'), 'must stay outside');
  fixtureData.junction('assets/external', outside);
  const result = runPackage(fixtureData.root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /reparse|junction|symbolic/i);
  assert.equal(fs.existsSync(fixtureData.zipPath), false);
  assert.equal(fs.readFileSync(path.join(outside, 'private.txt'), 'utf8'), 'must stay outside');
});

test('real packager rejects output junctions without replacing external output', windowsOnly, (t) => {
  const fixtureData = fixture(t);
  const outside = path.join(fixtureData.base, 'outside');
  fs.mkdirSync(outside);
  const externalZip = path.join(outside, path.basename(fixtureData.zipPath));
  fs.writeFileSync(externalZip, 'external original');
  fixtureData.junction('dist/external', outside);
  const result = runPackage(fixtureData.root, 'dist/external');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /reparse|junction|symbolic/i);
  assert.equal(fs.readFileSync(externalZip, 'utf8'), 'external original');
  assert.deepEqual(fs.readdirSync(outside), [path.basename(externalZip)]);
});

test('real packager produces identical bytes after source timestamp changes', windowsOnly, (t) => {
  const { root, zipPath } = fixture(t);
  assert.equal(runPackage(root).status, 0);
  const first = fs.readFileSync(zipPath);
  const changedTime = new Date('2024-01-01T00:00:00Z');
  for (const name of ['manifest.json', 'src/main.js', 'assets/mark.svg']) fs.utimesSync(path.join(root, name), changedTime, changedTime);
  assert.equal(runPackage(root).status, 0);
  assert.deepEqual(fs.readFileSync(zipPath), first);
});

test('real packager preserves the previous release when archive validation fails', windowsOnly, (t) => {
  const { root, zipPath } = fixture(t);
  fs.writeFileSync(zipPath, 'previous release');
  fs.writeFileSync(zipPath + '.sha256', 'previous checksum');
  fs.unlinkSync(path.join(root, 'assets/mark.svg'));
  const result = runPackage(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing required entry/);
  assert.equal(fs.readFileSync(zipPath, 'utf8'), 'previous release');
  assert.equal(fs.readFileSync(zipPath + '.sha256', 'utf8'), 'previous checksum');
  assert.deepEqual(fs.readdirSync(path.join(root, 'dist')).sort(), [path.basename(zipPath), path.basename(zipPath) + '.sha256']);
});

test('real packager rejects manifest versions containing path components', windowsOnly, (t) => {
  const { root } = fixture(t);
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ version: '../outside' }));
  const result = runPackage(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /numeric extension version/);
  assert.deepEqual(fs.readdirSync(path.join(root, 'dist')), []);
});

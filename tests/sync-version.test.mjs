import { test } from 'node:test';
import assert from 'node:assert/strict';
import { semverToPep440, pypiClassifierFor, SEMVER_REGEX, DATE_REGEX } from '../tools/sync-version.mjs';

test('SEMVER_REGEX validates strict X.Y.Z[-(alpha|beta|rc).N] format', () => {
  assert.ok(SEMVER_REGEX.test('0.3.1'));
  assert.ok(SEMVER_REGEX.test('1.0.0'));
  assert.ok(SEMVER_REGEX.test('1.0.0-alpha.1'));
  assert.ok(SEMVER_REGEX.test('1.0.0-beta.2'));
  assert.ok(SEMVER_REGEX.test('1.0.0-rc.10'));

  // Invalid formats must fail closed
  assert.ok(!SEMVER_REGEX.test('1.0'));
  assert.ok(!SEMVER_REGEX.test('v1.0.0'));
  assert.ok(!SEMVER_REGEX.test('1.0.0-alpha'));
  assert.ok(!SEMVER_REGEX.test('1.0.0-alpha.0'));
  assert.ok(!SEMVER_REGEX.test('1.0.0-preview.1'));
  assert.ok(!SEMVER_REGEX.test('1.0.0.0'));
  assert.ok(!SEMVER_REGEX.test(''));
});

test('DATE_REGEX validates YYYY-MM-DD format', () => {
  assert.ok(DATE_REGEX.test('2026-11-12'));
  assert.ok(!DATE_REGEX.test('2026-1-1'));
  assert.ok(!DATE_REGEX.test('12-11-2026'));
  assert.ok(!DATE_REGEX.test('invalid'));
});

test('semverToPep440 translates standard SemVer and pre-releases deterministically', () => {
  assert.equal(semverToPep440('0.3.1'), '0.3.1');
  assert.equal(semverToPep440('1.0.0'), '1.0.0');
  assert.equal(semverToPep440('1.0.0-alpha.1'), '1.0.0a1');
  assert.equal(semverToPep440('1.0.0-beta.2'), '1.0.0b2');
  assert.equal(semverToPep440('1.0.0-rc.3'), '1.0.0rc3');
  assert.equal(semverToPep440('2.14.7-alpha.15'), '2.14.7a15');
});

test('semverToPep440 throws RangeError on invalid or malformed SemVer strings', () => {
  assert.throws(() => semverToPep440('invalid'), /Invalid SemVer format/);
  assert.throws(() => semverToPep440('v1.0.0'), /Invalid SemVer format/);
  assert.throws(() => semverToPep440('1.0.0-alpha.0'), /Invalid SemVer format/);
  assert.throws(() => semverToPep440('1.0.0-dev.1'), /Invalid SemVer format/);
  assert.throws(() => semverToPep440(null), /must be a non-empty string/);
  assert.throws(() => semverToPep440(123), /must be a non-empty string/);
});

test('pypiClassifierFor determines correct Development Status classifier', () => {
  assert.equal(pypiClassifierFor('1.0.0-alpha.1'), 'Development Status :: 3 - Alpha');
  assert.equal(pypiClassifierFor('1.0.0-beta.1'), 'Development Status :: 4 - Beta');
  assert.equal(pypiClassifierFor('1.0.0-rc.1'), 'Development Status :: 4 - Beta');
  assert.equal(pypiClassifierFor('1.0.0'), 'Development Status :: 5 - Production/Stable');
  assert.equal(pypiClassifierFor('2.0.0'), 'Development Status :: 5 - Production/Stable');
  assert.equal(pypiClassifierFor('0.3.1'), 'Development Status :: 4 - Beta');
  assert.equal(pypiClassifierFor('0.4.0-alpha.1'), 'Development Status :: 3 - Alpha');
});

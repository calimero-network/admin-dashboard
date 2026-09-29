/**
 * Pinned bundle fixtures for the live e2e suite, shared by
 * scripts/prepare-merod.mjs (downloads + verifies them into .merod/fixtures),
 * scripts/live-registry.mjs (serves them to the node) and e2e-live/fixtures.
 *
 * No side effects on import: prepare-merod.mjs runs its download on load, so
 * the constants live here rather than there.
 */
import path from 'node:path';

const CORE_REPO = 'calimero-network/core';

export const FIXTURES_DIR = path.resolve(
  import.meta.dirname,
  '..',
  '.merod',
  'fixtures',
);

/**
 * Bundles the live suite installs, pinned by sha256 and served to the node by
 * the local stub registry.
 *
 * - kv-store: the fixture core ships with EVERY release, built against it, for
 *   arrange steps that just need an app (install-dev-application takes a path
 *   to a `.mpk`; raw wasm is refused since rc.31).
 * - Mero Chat: a real fleet bundle — icon, links.frontend, and an `init` with
 *   five typed params — for the install, Open and create-context tests. Pinned
 *   to one version so a new publish cannot change what is tested.
 */
export const FIXTURES = {
  kvStore: {
    file: 'kv-store-test-fixture.mpk',
    url: (version) =>
      `https://github.com/${CORE_REPO}/releases/download/${version}/kv-store-test-fixture.mpk`,
    sha256: {
      '0.11.0-rc.62':
        '1569af1549e458fd567acaa9c3d8f25fbfd9a49afee7aff92c326d6f9bdc073f',
    },
  },
  chat: {
    package: 'com.calimero.chat',
    version: '3.1.16',
    file: 'com.calimero.chat-3.1.16.mpk',
    url: () =>
      'https://apps.calimero.network/artifacts/com.calimero.chat/3.1.16/com.calimero.chat-3.1.16.mpk',
    sha256: '0ac6221a39b6c0d77c09d98f534424959cdc9ac3ea75e11b1406284a055bdae0',
  },
};

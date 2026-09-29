import { describe, it, expect, vi, beforeEach } from 'vitest';

import { installApplication } from '../utils/installApp';

vi.mock('@calimero-network/calimero-client', () => ({
  getAccessToken: () => 'admin.jwt',
}));
vi.mock('../utils/nodeUrl', () => ({
  getNodeUrl: () => 'http://localhost:2528',
}));
const recorded = vi.hoisted(() => [] as string[]);
vi.mock('../utils/registry', () => ({
  recordDownload: (_r: string, id: string, v: string) =>
    recorded.push(`${id}@${v}`),
}));

const APP = {
  id: 'com.calimero.merochat',
  name: 'Mero Chat',
  registry: 'https://apps.calimero.network',
} as Parameters<typeof installApplication>[0];

function respond(status: number, body: string) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response);
}

describe('installApplication', () => {
  beforeEach(() => {
    recorded.length = 0;
  });

  it('posts exactly the coordinates, authorised', async () => {
    const fetchImpl = respond(
      200,
      JSON.stringify({ data: { applicationId: 'app-1' } }),
    );
    await expect(installApplication(APP, '1.2.0', fetchImpl)).resolves.toBe(
      'app-1',
    );

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:2528/admin-api/install-application');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer admin.jwt',
    );
    expect(Object.keys(JSON.parse(init.body as string)).sort()).toEqual([
      'package',
      'version',
    ]);
    expect(JSON.parse(init.body as string)).toEqual({
      package: 'com.calimero.merochat',
      version: '1.2.0',
    });
    expect(recorded).toEqual(['com.calimero.merochat@1.2.0']);
  });

  it("surfaces the node's plain-text refusal", async () => {
    const fetchImpl = respond(
      502,
      'the configured Http source has no application published at com.calimero.merochat@1.2.0',
    );
    await expect(installApplication(APP, '1.2.0', fetchImpl)).rejects.toThrow(
      /no application published at com.calimero.merochat@1.2.0/,
    );
    expect(recorded).toEqual([]);
  });

  it('surfaces a JSON error body', async () => {
    const fetchImpl = respond(
      400,
      JSON.stringify({ error: { message: 'unknown field `url`' } }),
    );
    await expect(installApplication(APP, '1.2.0', fetchImpl)).rejects.toThrow(
      'unknown field `url`',
    );
  });

  it('refuses a 200 without an application id', async () => {
    await expect(
      installApplication(APP, '1.2.0', respond(200, '{"data":{}}')),
    ).rejects.toThrow(/application id/);
  });

  it('refuses a malformed version before touching the node', async () => {
    const fetchImpl = respond(200, '{}');
    await expect(
      installApplication(APP, '1.2.0; rm -rf', fetchImpl),
    ).rejects.toThrow('Invalid version string');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

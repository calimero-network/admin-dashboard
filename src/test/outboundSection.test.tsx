import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  within,
} from '@testing-library/react';

import { OutboundSection } from '../components/namespaces/OutboundSection';
import { OutboundChecklist } from '../components/namespaces/OutboundChecklist';
import type { InstalledApp } from '../components/namespaces/CreateContextPanel';

vi.mock('@calimero-network/calimero-client', () => ({
  getAppEndpointKey: () => 'http://localhost:2428',
  getAccessToken: () => 'test-token',
}));

const NS = 'c'.repeat(64);
const APP_ID = 'd'.repeat(64);
const SIGNER = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
const OTHER_SIGNER = 'did:key:z6MkotherPublisher1111111111111111111111111111';
const STRIPE = 'https://api.stripe.com/v1/';
const TURNSTILE = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MODEL = 'https://api.model.example/v2/';

const APP: InstalledApp = {
  id: APP_ID,
  name: 'Mero Forms',
  signerId: SIGNER,
  outbound: [STRIPE, TURNSTILE, MODEL],
};

const mockFetch = vi.fn();
global.fetch = mockFetch;

function ok(body: unknown) {
  return Promise.resolve({
    ok: true,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

beforeEach(() => mockFetch.mockReset());
afterEach(cleanup);

function rowOf(prefix: string): HTMLElement {
  const row = screen
    .getAllByTestId('ns-outbound-row')
    .find((r) => within(r).queryByText(prefix) !== null);
  if (!row) throw new Error(`no row for ${prefix}`);
  return row;
}

async function findRow(prefix: string): Promise<HTMLElement> {
  await screen.findByText(prefix);
  return rowOf(prefix);
}

function statusOf(prefix: string): string | null {
  return within(rowOf(prefix)).getByText(/Approved|Revoked|Awaiting approval/)
    .textContent;
}

describe('OutboundSection', () => {
  it('lists approved, revoked and awaiting prefixes for the app’s publisher', async () => {
    mockFetch.mockReturnValueOnce(
      ok({
        data: [
          { signer: SIGNER, prefixes: [STRIPE], reviewed: [STRIPE, TURNSTILE] },
        ],
      }),
    );
    render(
      <OutboundSection
        namespaceId={NS}
        targetApplicationId={APP_ID}
        installedApps={[APP]}
        showToast={() => {}}
      />,
    );
    await screen.findByText(STRIPE);
    expect(statusOf(STRIPE)).toBe('Approved');
    expect(statusOf(TURNSTILE)).toBe('Revoked');
    expect(statusOf(MODEL)).toBe('Awaiting approval');
    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      `http://localhost:2428/admin-api/namespaces/${NS}/outbound-approvals`,
    );
  });

  it('revoking PUTs the full remaining list for the target application', async () => {
    mockFetch.mockReturnValueOnce(
      ok({
        data: [
          {
            signer: SIGNER,
            prefixes: [STRIPE, TURNSTILE],
            reviewed: [STRIPE, TURNSTILE, MODEL],
          },
        ],
      }),
    );
    const toast = vi.fn();
    render(
      <OutboundSection
        namespaceId={NS}
        targetApplicationId={APP_ID}
        installedApps={[APP]}
        showToast={toast}
      />,
    );
    const row = await findRow(STRIPE);
    mockFetch.mockReturnValueOnce(
      ok({
        data: {
          namespaceId: NS,
          signer: SIGNER,
          prefixes: [TURNSTILE],
          reviewed: [STRIPE, TURNSTILE, MODEL],
          published: true,
        },
      }),
    );
    fireEvent.click(within(row).getByRole('button', { name: 'Revoke' }));
    fireEvent.click(
      within(row).getByRole('button', { name: 'Confirm revoke' }),
    );

    await waitFor(() => expect(statusOf(STRIPE)).toBe('Revoked'));
    const put = mockFetch.mock.calls[1];
    expect(put?.[1].method).toBe('PUT');
    expect(JSON.parse(put?.[1].body)).toEqual({
      applicationId: APP_ID,
      approve: [TURNSTILE],
    });
    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining('revoked'),
      'success',
    );
  });

  it('re-approving PUTs the approved list plus that prefix', async () => {
    mockFetch.mockReturnValueOnce(
      ok({
        data: [
          { signer: SIGNER, prefixes: [STRIPE], reviewed: [STRIPE, TURNSTILE] },
        ],
      }),
    );
    render(
      <OutboundSection
        namespaceId={NS}
        targetApplicationId={APP_ID}
        installedApps={[APP]}
        showToast={() => {}}
      />,
    );
    const row = await findRow(TURNSTILE);
    mockFetch.mockReturnValueOnce(
      ok({
        data: {
          namespaceId: NS,
          signer: SIGNER,
          prefixes: [STRIPE, TURNSTILE],
          reviewed: [STRIPE, TURNSTILE],
          published: true,
        },
      }),
    );
    fireEvent.click(within(row).getByRole('button', { name: 'Re-approve' }));
    await waitFor(() => expect(statusOf(TURNSTILE)).toBe('Approved'));
    expect(JSON.parse(mockFetch.mock.calls[1]?.[1].body)).toEqual({
      applicationId: APP_ID,
      approve: [STRIPE, TURNSTILE],
    });
  });

  it('shows another publisher read-only', async () => {
    mockFetch.mockReturnValueOnce(
      ok({
        data: [{ signer: OTHER_SIGNER, prefixes: [MODEL], reviewed: [MODEL] }],
      }),
    );
    render(
      <OutboundSection
        namespaceId={NS}
        targetApplicationId={APP_ID}
        installedApps={[{ ...APP, outbound: [] }]}
        showToast={() => {}}
      />,
    );
    const row = await findRow(MODEL);
    expect(within(row).queryByRole('button')).toBeNull();
  });

  it('renders nothing when nothing is approved and the app declares nothing', async () => {
    mockFetch.mockReturnValueOnce(ok({ data: [] }));
    const { container } = render(
      <OutboundSection
        namespaceId={NS}
        targetApplicationId={APP_ID}
        installedApps={[{ ...APP, outbound: [] }]}
        showToast={() => {}}
      />,
    );
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

describe('OutboundChecklist', () => {
  it('renders nothing for an app that declares no prefixes', () => {
    const { container } = render(
      <OutboundChecklist
        declared={[]}
        checked={new Set()}
        onChange={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists each prefix with its checkbox state and reports toggles', () => {
    const onChange = vi.fn();
    render(
      <OutboundChecklist
        declared={[STRIPE, TURNSTILE]}
        checked={new Set([STRIPE])}
        onChange={onChange}
      />,
    );
    expect(screen.getByText('This app sends requests to:')).toBeInTheDocument();
    const stripe = screen.getByLabelText(`Approve requests to ${STRIPE}`);
    const turnstile = screen.getByLabelText(`Approve requests to ${TURNSTILE}`);
    expect(stripe).toBeChecked();
    expect(turnstile).not.toBeChecked();
    expect(screen.getByTestId('ns-outbound-unchecked')).toHaveTextContent(
      '1 prefix will be refused.',
    );
    fireEvent.click(turnstile);
    expect(onChange).toHaveBeenCalledWith(new Set([STRIPE, TURNSTILE]));
  });
});

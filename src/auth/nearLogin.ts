import apiClient from '../api';
import {
  NodeChallenge,
  SignatureMessage,
  SignatureMessageMetadata,
} from '../api/dataSource/NodeDataSource';
import { ResponseData } from '../api/response';
import { getOrCreateKeypair } from './ed25519';
import { randomBytes } from 'crypto';
import type { AccountState, WalletSelector } from '@near-wallet-selector/core';
import { WalletSelectorModal } from '@near-wallet-selector/modal-ui/src/lib/modal.types';
import { Account } from '../pages/Near';

export interface HandleSignMessageProps {
  selector: WalletSelector;
  appName: string;
  setErrorMessage: (message: string) => void;
}

export async function handleSignMessage({
  selector,
  appName,
  setErrorMessage,
}: HandleSignMessageProps) {
  try {
    const challengeResponseData: ResponseData<NodeChallenge> = await apiClient
      .node()
      .requestChallenge();
    const { publicKey } = await getOrCreateKeypair();

    if (challengeResponseData.error) {
      console.log('requestChallenge api error', challengeResponseData.error);
      return;
    }

    const wallet = await selector.wallet('my-near-wallet');

    const challengeNonce =
      challengeResponseData?.data?.nonce ?? randomBytes(32).toString('hex');

    const nonce: Buffer = Buffer.from(challengeNonce, 'base64');
    const recipient = appName;
    const callbackUrl = window.location.href;
    const challengeContextId = challengeResponseData.data?.contextId ?? null;
    const nodeSignature = challengeResponseData.data?.nodeSignature ?? '';
    const timestamp =
      challengeResponseData.data?.timestamp ?? new Date().getTime();

    const signatureMessage: SignatureMessage = {
      nodeSignature,
      publicKey: publicKey,
    };
    const message: string = JSON.stringify(signatureMessage);

    const state: SignatureMessageMetadata = {
      publicKey: publicKey,
      nodeSignature,
      nonce: nonce.toString('base64'),
      contextId: challengeContextId,
      timestamp,
      message,
    };

    if (wallet.type === 'browser') {
      console.log('browser');

      localStorage.setItem(
        'message',
        JSON.stringify({
          message,
          nonce: [...nonce],
          recipient,
          callbackUrl,
          state: JSON.stringify(state),
        }),
      );
    }

    await wallet.signMessage({ message, nonce, recipient, callbackUrl });
  } catch (error) {
    console.error('Error while signing message', error);
    setErrorMessage('Error while signing message.');
  }
}

export function handleSwitchWallet(modal: WalletSelectorModal) {
  modal.show();
}

interface HandleSignoutProps {
  account: Account;
  selector: WalletSelector;
  setAccount: (account: Account | null) => void;
  setErrorMessage: (message: string) => void;
}

export async function handleSignOut({
  account,
  selector,
  setAccount,
  setErrorMessage,
}: HandleSignoutProps) {
  if (!account) {
    return;
  }
  const wallet = await selector.wallet();

  wallet
    .signOut()
    .then(() => {
      setAccount(null);
    })
    .catch((err: any) => {
      console.log('Failed to sign out');
      setErrorMessage('Failed to sign out');
      console.error(err);
    });
}

interface HandleSwitchAccountProps {
  accounts: AccountState[];
  accountId: string | null;
  selector: WalletSelector;
}

export function handleSwitchAccount({
  accounts,
  accountId,
  selector,
}: HandleSwitchAccountProps) {
  const currentIndex = accounts.findIndex(
    (x: AccountState) => x.accountId === accountId,
  );
  const nextIndex = currentIndex < accounts.length - 1 ? currentIndex + 1 : 0;

  const nextAccountId = accounts[nextIndex]?.accountId;

  selector.setActiveAccount(nextAccountId ?? '');

  alert('Switched account to ' + nextAccountId);
}

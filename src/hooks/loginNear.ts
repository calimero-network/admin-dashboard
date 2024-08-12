import { useCallback } from 'react';
import { Account } from '../pages/Near';
import type { AccountView } from 'near-api-js/lib/providers/provider';
import { WalletSelector } from '@near-wallet-selector/core';
import { providers } from 'near-api-js';
import {
  verifyFullKeyBelongsToUser,
  verifySignature,
  type SignedMessage,
  type SignMessageParams,
} from '@near-wallet-selector/core';
import {
  LoginRequest,
  LoginResponse,
  NearSignatureMessageMetadata,
  Payload,
  SignatureMessageMetadata,
  WalletMetadata,
  WalletSignatureData,
  WalletType,
} from '../api/dataSource/NodeDataSource';
import apiClient from '../api';
import { ResponseData } from '../api/response';
import { setStorageNodeAuthorized } from '../auth/storage';
import { useNavigate } from 'react-router-dom';

interface UseVerifyProps {
  accountId: string | null;
  selector: WalletSelector;
}

export function useVerifyNear({ accountId, selector }: UseVerifyProps) {
  const navigate = useNavigate();
  const getAccount = useCallback(async (): Promise<Account | null> => {
    if (!accountId) {
      return null;
    }

    const { network } = selector.options;
    const provider = new providers.JsonRpcProvider({ url: network.nodeUrl });

    return provider
      .query<AccountView>({
        request_type: 'view_account',
        finality: 'final',
        account_id: accountId,
      })
      .then((data: any) => ({
        ...data,
        account_id: accountId,
      }));
  }, [accountId, selector]);

  const verifyMessage = useCallback(
    async (
      message: SignMessageParams,
      signedMessage: SignedMessage,
      setErrorMessage: (message: string) => void,
    ): Promise<boolean> => {
      console.log('verifyMessage', { message, signedMessage });
      try {
        const verifiedSignature = verifySignature({
          publicKey: signedMessage.publicKey,
          signature: signedMessage.signature,
          message: message.message,
          nonce: message.nonce,
          recipient: message.recipient,
          callbackUrl: message.callbackUrl ?? '',
        });
        const verifiedFullKeyBelongsToUser = await verifyFullKeyBelongsToUser({
          publicKey: signedMessage.publicKey,
          accountId: signedMessage.accountId,
          network: selector.options.network,
        });

        const isMessageVerified =
          verifiedFullKeyBelongsToUser && verifiedSignature;

        const resultMessage = isMessageVerified
          ? 'Successfully verified'
          : 'Failed to verify';

        console.log(
          `${resultMessage} signed message: '${
            message.message
          }': \n ${JSON.stringify(signedMessage)}`,
        );

        return isMessageVerified;
      } catch (error) {
        console.error('Error while verifying message', error);
        setErrorMessage('Error while verifying message');
        return false;
      }
    },
    [selector.options.network],
  );

  const verifyMessageBrowserWallet = useCallback(
    async (setErrorMessage: (message: string) => void) => {
      const urlParams = new URLSearchParams(window.location.hash.substring(1));
      const accId = urlParams.get('accountId') as string;
      const publicKey = urlParams.get('publicKey') as string;
      const signature = urlParams.get('signature') as string;

      if (!accId && !publicKey && !signature) {
        console.error('Missing params in url.');
        return;
      }

      const message: SignMessageParams = JSON.parse(
        localStorage.getItem('message')!,
      );

      const state: SignatureMessageMetadata = JSON.parse(message.state!);

      if (!state.publicKey) {
        state.publicKey = publicKey;
      }

      const stateMessage: SignatureMessageMetadata = JSON.parse(state.message);
      if (!stateMessage.publicKey) {
        stateMessage.publicKey = publicKey;
        state.message = JSON.stringify(stateMessage);
      }

      const signedMessage = {
        accountId: accId,
        publicKey,
        signature,
      };

      const isMessageVerified: boolean = await verifyMessage(
        message,
        signedMessage,
        setErrorMessage,
      );

      const url = new URL(window.location.href);
      url.hash = '';
      url.search = '';
      window.history.replaceState({}, document.title, url);
      localStorage.removeItem('message');
      if (isMessageVerified) {
        const signatureMetadata: NearSignatureMessageMetadata = {
          recipient: message.recipient,
          callbackUrl: message.callbackUrl!,
          nonce: message.nonce.toString('base64'),
        };
        const payload: Payload = {
          message: state,
          metadata: signatureMetadata,
        };
        const walletSignatureData: WalletSignatureData = {
          payload: payload,
          publicKey: publicKey,
        };
        const walletMetadata: WalletMetadata = {
          wallet: WalletType.NEAR({
            networkId: selector.options.network.networkId,
          }),
          signingKey: publicKey,
        };
        const loginRequest: LoginRequest = {
          walletSignature: signature,
          payload: walletSignatureData.payload!,
          walletMetadata: walletMetadata,
        };

        await apiClient
          .node()
          .login(loginRequest)
          .then((result: ResponseData<LoginResponse>) => {
            console.log('result', result);
            if (result.error) {
              console.error('login error', result.error);
              setErrorMessage(`Error while login: ${result.error.message}`);
            } else {
              setStorageNodeAuthorized();
              navigate('/identity');
              console.log('login success');
            }
          })
          .catch(() => {
            console.error('error while login');
            setErrorMessage(`Error while login`);
          });
      } else {
        console.error('Message not verified');
        setErrorMessage('Message not verified');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [verifyMessage],
  );

  return { getAccount, verifyMessage, verifyMessageBrowserWallet };
}

import React, { Fragment, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { randomBytes } from 'crypto';
import { providers } from 'near-api-js';
import type { AccountView } from 'near-api-js/lib/providers/provider';
import {
  verifyFullKeyBelongsToUser,
  verifySignature,
  type SignedMessage,
  type SignMessageParams,
} from '@near-wallet-selector/core';
import styled from 'styled-components';

import { useWalletSelector } from '../context/WalletSelectorContext';
import Loading from '../components/common/Loading';
import { getOrCreateKeypair } from '../auth/ed25519';
import { ResponseData } from '../api/response';
import apiClient from '../api';
import {
  LoginRequest,
  LoginResponse,
  NearSignatureMessageMetadata,
  NodeChallenge,
  Payload,
  SignatureMessage,
  SignatureMessageMetadata,
  WalletMetadata,
  WalletSignatureData,
  WalletType,
} from '../api/dataSource/NodeDataSource';
import { setStorageNodeAuthorized } from '../auth/storage';
import LoginIcon from '../components/common/LoginIcon';
import translations from '../constants/en.global.json';

export interface Message {
  premium: boolean;
  sender: string;
  text: string;
}

export type Account = AccountView & {
  account_id: string;
};

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: #1c1c1c;
  width: fit-content;
  padding: 2.5rem;
  gap: 1rem;
  border-radius: 0.5rem;
  max-width: 25rem;

  .title {
    margin-top: 1.5rem;
    display: grid;
    font-size: 1.25rem;
    font-weight: 500;
    text-align: center;
    margin-bottom: 0.5rem;
    color: #fff;
  }

  .subtitle {
    display: flex;
    justify-content: start;
    align-items: center;
    font-size: 0.875rem;
    color: #778899;
    white-space: break-spaces;
  }

  .back-button {
    padding-top: 1rem;
    font-size: 0.875rem;
    color: #fff;
    text-align: center;
    cursor: pointer;
  }

  .action-button {
    background-color: #ff7a00;
    color: white;
    width: fit-content;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    height: 2.875rem;
    cursor: pointer;
    fontsize: 1rem;
    fontweight: 500;
    border-radius: 0.375rem;
    border: none;
    outline: none;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }

  .padding-wrapper {
    display: flex;
    gap: 1rem;
  }

  .account-wrapper-padding-lg {
    margin-top: 10rem;
  }

  .account-wrapper-padding-sm {
    margin-top: 0.75rem;
  }

  .logout-button {
    background-color: rgba(26, 26, 26, 0.05);
    color: #fff;
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 0.25rem;
  }

  .user-account-container {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: #25282d;
    height: 4.625rem;
    border-radius: 0.375rem;
    border: none;
    outline: none;
    padding: 0.25rem 0.75rem;
    width: 100%;
  }

  .center-container {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .user-account-icon-wrapper {
    display: inline-block;
    margin: 0rem;
    overflow: hidden;
    padding: 0rem;
    background-color: rgb(241, 153, 2);
    height: 1.875rem;
    width: 1.875rem;
    border-radius: 3.125rem;
  }

  .flex-column-container {
    display: flex;
    flex-direction: column;
    padding-left: 1rem;
  }

  .account-id-title {
    color: #fff;
    font-size: 0.813rem;
    line-height: 1.125rem;
    height: 1.219rem;
    font-weight:;
  }

  .account-id-value {
    color: #fff;
    font-size: 0.688rem;
    height: 1.031rem;
    font-weight: 500;
  }

  .error-message {
    color: red;
    font-size: 0.875rem;
  }
`;

export default function NearLogin() {
  const navigate = useNavigate();
  const { selector, accounts, modal, accountId } = useWalletSelector();
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState('');
  const t = translations.loginPage.nearLogin;
  const appName = 'me';

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

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      verifyMessageBrowserWallet();
    }, 500);

    return () => {
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!accountId) {
      return setAccount(null);
    }

    setLoading(true);

    getAccount().then((nextAccount: any) => {
      setAccount(nextAccount);
      setLoading(false);
    });
  }, [accountId, getAccount]);

  async function handleSignOut() {
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

  function handleSwitchWallet() {
    modal.show();
  }

  function handleSwitchAccount() {
    const currentIndex = accounts.findIndex((x) => x.accountId === accountId);
    const nextIndex = currentIndex < accounts.length - 1 ? currentIndex + 1 : 0;

    const nextAccountId = accounts[nextIndex]?.accountId;

    selector.setActiveAccount(nextAccountId ?? '');

    alert('Switched account to ' + nextAccountId);
  }

  const verifyMessage = useCallback(
    async (
      message: SignMessageParams,
      signedMessage: SignedMessage,
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

  const verifyMessageBrowserWallet = useCallback(async () => {
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
            setErrorMessage(`Error while login: ${result.error}`);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyMessage]);

  async function handleSignMessage() {
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

  if (loading) {
    return <Loading />;
  }

  return (
    <Fragment>
      <Wrapper>
        <span className="title">{t.title}</span>
        <div className="subtitle">
          <span>{t.subtitle}</span>
        </div>
        {account && (
          <div className="user-account-container">
            <div className="center-container">
              <div className="user-account-icon-wrapper">
                <LoginIcon />
              </div>
              <div className="flex-column-container">
                <span className="account-id-title ">{t.accountIdText}</span>
                <span className="account-id-value">{accountId}</span>
              </div>
            </div>
            <div className="logout-button" onClick={handleSignOut}>
              {t.logoutButtonText}
            </div>
          </div>
        )}
        <div className="error-message">{errorMessage}</div>
        <div
          className={`padding-wrapper ${account ? 'account-wrapper-padding-lg' : 'account-wrapper-padding-sm'}`}
        >
          <button className="action-button" onClick={handleSwitchWallet}>
            {t.switchWalletButtonText}
          </button>
          <button className="action-button" onClick={handleSignMessage}>
            {t.authButtonText}
          </button>
          {accounts.length > 1 && (
            <button className="action-button" onClick={handleSwitchAccount}>
              {t.switchAccountButtonText}
            </button>
          )}
        </div>
        <div className="back-button" onClick={() => navigate('/auth')}>
          {t.backButtonText}
        </div>
      </Wrapper>
    </Fragment>
  );
}

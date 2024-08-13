import React, { useCallback, useEffect, useState } from 'react';
import { randomBytes } from 'crypto';
import { getOrCreateKeypair } from '../../auth/ed25519';

import {
  useAccount,
  MetaMaskButton,
  useSDK,
  useSignMessage,
} from '@metamask/sdk-react-ui';

import apiClient from '../../api';
import Loading from '../common/Loading';
import { ResponseData } from '../../api/response';
import { getNetworkType } from '../../utils/ethWalletType';
import { setStorageNodeAuthorized } from '../../auth/storage';
import {
  EthSignatureMessageMetadata,
  LoginRequest,
  NodeChallenge,
  Payload,
  SignatureMessage,
  SignatureMessageMetadata,
  WalletMetadata,
  WalletSignatureData,
} from '../../api/dataSource/NodeDataSource';
import { styled } from 'styled-components';
import translations from '../../constants/en.global.json';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.5rem;
  max-width: 400px;

  .content-card {
    margin-top: 1.5rem;
    display: grid;
    color: white;
    font-size: 1.25rem;
    font-weight: 500;
    text-align: center;

    .title {
      margin-bottom: 0.5rem;
      color: #fff;
    }

    .subtitle {
      display: flex;
      justify-content: start;
      align-items: center;
      font-size: 14px;
      color: #778899;
      white-space: break-spaces;
    }
  }

  .header {
    margin-top: 1.5rem;
    display: flex;
    flex-direction
  }

  .options-wrapper {
    margin-top: 9.75rem;

    .button-sign {
      background-color: #ff7a00;
      color: white;
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 0.5rem;
      height: 2.875rem;
      cursor: pointer;
      font-size: 1rem;
      font-weight: 500;
      border-radius: 0.375rem;
      border: none;
      outline: none;
      padding-left: 0.5rem;
      padding-right: 0.5rem;
    }

    .error-title {
      color: red;
      font-size: 0.875rem;
      font-weight: 500;
      margin-top: 0.5rem;
    }

    .error-message {
      color: red;
      font-size: 0.875rem;
      font-weight: 500;
      margin-top: 0.5rem;
    }
  }

  .button-back {
    padding-top: 1rem;
    font-size: 0.875rem;
    color: #fff;
    text-align: center;
    cursor: pointer;
  }
`;

const connectedButtonStyle = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: '#25282D',
  height: '73px',
  borderRadius: '6px',
  border: 'none',
  outline: 'none',
};

const disconnectedButtonStyle = {
  cursor: 'pointer',
};

interface LoginWithMetamaskProps {
  successRedirect: () => void;
  navigateBack: () => void | undefined;
}

export function LoginWithMetamask({
  successRedirect,
  navigateBack,
}: LoginWithMetamaskProps) {
  const { chainId, ready } = useSDK();
  const { isConnected, address } = useAccount();
  const [walletSignatureData, setWalletSignatureData] =
    useState<WalletSignatureData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const t = translations.loginPage.metamaskLogin;

  const signatureMessage = useCallback((): string | undefined => {
    return walletSignatureData
      ? walletSignatureData?.payload?.message.message
      : undefined;
  }, [walletSignatureData]);

  const {
    data: signData,
    isError: isSignError,
    isLoading: isSignLoading,
    isSuccess: isSignSuccess,
    signMessage,
  } = useSignMessage({ message: signatureMessage() ?? '' });

  const requestNodeData = useCallback(async () => {
    const challengeResponseData: ResponseData<NodeChallenge> = await apiClient
      .node()
      .requestChallenge();
    const { publicKey } = await getOrCreateKeypair();

    if (challengeResponseData.error) {
      console.error('requestNodeData error', challengeResponseData.error);
      return;
    }

    const signatureMessage: SignatureMessage = {
      nodeSignature: challengeResponseData.data?.nodeSignature ?? '',
      publicKey: publicKey,
    };

    const signatureMessageMetadata: SignatureMessageMetadata = {
      publicKey: publicKey,
      nodeSignature: challengeResponseData.data?.nodeSignature ?? '',
      nonce:
        challengeResponseData.data?.nonce ?? randomBytes(32).toString('hex'),
      timestamp: challengeResponseData.data?.timestamp ?? new Date().getTime(),
      message: JSON.stringify(signatureMessage),
    };
    const signatureMetadata: EthSignatureMessageMetadata = {};
    const payload: Payload = {
      message: signatureMessageMetadata,
      metadata: signatureMetadata,
    };
    const wsd: WalletSignatureData = {
      payload,
      publicKey,
    };
    setWalletSignatureData(wsd);
  }, []);

  const login = useCallback(async () => {
    setErrorMessage(null);
    if (!signData) {
      console.error('signature is empty');
      //TODO handle error
    } else if (!address) {
      console.error('address is empty');
      //TODO handle error
    } else {
      const walletMetadata: WalletMetadata = {
        wallet: getNetworkType(chainId ?? ''),
        signingKey: address,
      };
      if (walletSignatureData?.payload) {
        const loginRequest: LoginRequest = {
          walletSignature: signData,
          payload: walletSignatureData.payload,
          walletMetadata: walletMetadata,
        };
        await apiClient
          .node()
          .login(loginRequest)
          .then((result) => {
            if (result.error) {
              console.error('Login error: ', result.error);
              setErrorMessage(result.error.message);
            } else {
              setStorageNodeAuthorized();
              successRedirect();
            }
          })
          .catch(() => {
            console.error('error while login!');
            setErrorMessage('Error while login!');
          });
      }
    }
  }, [
    address,
    chainId,
    signData,
    successRedirect,
    walletSignatureData?.payload,
  ]);

  useEffect(() => {
    if (isConnected) {
      requestNodeData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  useEffect(() => {
    if (isSignSuccess && walletSignatureData) {
      console.log('signature', signData);
      console.log('address', address);
      login();
    }
  }, [address, isSignSuccess, login, signData, walletSignatureData]);

  if (!ready) {
    return <Loading />;
  }

  return (
    <Wrapper>
      <div className="content-card">
        <span className="title">{t.title}</span>
        <div className="subtitle">
          <span>{t.subtitle}</span>
        </div>
        <header className="header">
          <MetaMaskButton
            theme="dark"
            color={isConnected && walletSignatureData ? 'blue' : 'white'}
            buttonStyle={
              isConnected && walletSignatureData
                ? connectedButtonStyle
                : disconnectedButtonStyle
            }
          />
          {isConnected && walletSignatureData && (
            <div className="options-wrapper">
              <button
                className="button-sign"
                disabled={isSignLoading}
                onClick={() => signMessage()}
              >
                {t.authButtonText}
              </button>
              {isSignError && (
                <div className="error-title">{t.errorTitleText}</div>
              )}
              <div className="error-message">{errorMessage}</div>
            </div>
          )}
        </header>
      </div>
      <div className="button-back" onClick={navigateBack}>
        {t.backButtonText}
      </div>
    </Wrapper>
  );
}

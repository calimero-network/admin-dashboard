import React from 'react';
import { MetamaskIcon } from '../../common/MetamaskIcon';
import { NearIcon } from '../../common/NearIcon';
import { styled } from 'styled-components';
import translations from "../../../constants/en.global.json";

export interface LoginSelectorProps {
  navigateMetamaskLogin: () => void | undefined;
  navigateNearLogin: () => void | undefined;
}

const Wrapper = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background-color: #1C1C1C;
    gap: 1rem;
    border-radius: 0.5rem;
    width: fit-content;

    .container {
        padding: 2rem;
    }
    
    .center-container {
        width: 100%;
        text-align: center;
        color: white;
        margin-top: 0.375rem;
        margin-bottom: 0.375rem;
        font-size: 1.5rem;
        line-height: 2rem;
        font-weight: medium;
    }
    
    .flex-container {
        display: flex;
        flex-direction: column;
        width: 100%;
        gap: 0.5rem;
        padding-top: 3.125rem;
    }

    .button-metamask {
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 0.125rem;
        height: 2.875rem;
        cursor: pointer;
        font-size: 1rem;
        line-height: 1.5rem;
        font-weight: 500;
        line-height: 1.25rem;
        border-radius: 0.375rem;
        background-color: #FF7A00;
        color: white;
        border: none;
        outline: none;
    }

    .button-near {
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 0.125rem;
        height: 2.875rem;
        cursor: pointer;
        font-size: 1rem;
        line-height: 1.5rem;
        font-weight: 500;
        line-height: 1.25rem;
        border-radius: 0.375rem;
        background-color: #D1D5DB;
        color: black;
        border: none;
        outline: none;
    }
`;

export default function LoginSelector({
  navigateMetamaskLogin,
  navigateNearLogin,
}: LoginSelectorProps) {
    const t = translations.loginPage.loginSelector;
  return (
    <Wrapper>
      <div
       className='container'
      >
        <div
          className='center-container'
        >
          {t.title}
        </div>
        <div
          className='flex-container'
        >
          <button
            className='button-metamask'
            onClick={navigateMetamaskLogin}
          >
            <MetamaskIcon />
            <span>{t.metamaskButtonText}</span>
          </button>
          <button
            className='button-near'
            onClick={navigateNearLogin}
          >
            <NearIcon />
            <span>{t.nearButtonText}</span>
          </button>
        </div>
      </div>
    </Wrapper>
  );
}

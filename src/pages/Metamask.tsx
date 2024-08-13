import React from 'react';
import ContentWrapper from '../components/login/ContentWrapper';
import styled from 'styled-components';

interface MetamaskLoginProps {
  isLogin: boolean;
}

const CardContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: #1c1c1c;
  padding: 2rem;
  gap: 1rem;
  border-radius: 0.5rem;
  width: fit-content;
`;

export default function MetamaskLogin({ isLogin }: MetamaskLoginProps) {
  console.log(isLogin);
  return (
    <ContentWrapper>
      <CardContainer>
        <div></div>
      </CardContainer>
    </ContentWrapper>
  );
}

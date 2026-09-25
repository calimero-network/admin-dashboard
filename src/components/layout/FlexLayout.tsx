import React from 'react';
import styled from 'styled-components';

const FlexWrapper = styled.div`
  display: flex;
  height: 100vh;
  background-color: var(--bg-primary);
`;

interface FlexLayoutProps {
  children: React.ReactNode;
}

export function FlexLayout({ children }: FlexLayoutProps) {
  return <FlexWrapper>{children}</FlexWrapper>;
}

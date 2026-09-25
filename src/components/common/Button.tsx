import React from 'react';
import styled from 'styled-components';
import Loading from './Loading';

interface StyledButtonProps {
  $btnWidth?: string;
  $color: string;
  $disabledColor: string;
  $highlightColor: string;
  $textColor: string;
  $fontSize: string;
  $lineHeight: string;
  $height: string;
  $padding: string;
  $borderRadius: string;
}

const ButtonStyled = styled.button<StyledButtonProps>`
  background-color: ${(props) =>
    props.disabled ? props.$color : props.$disabledColor};
  height: ${(props) => props.$height};
  width: ${(props) => (props.$btnWidth ? props.$btnWidth : 'fit-content')};
  padding: ${(props) => props.$padding};
  border-radius: ${(props) => props.$borderRadius};
  color: ${(props) => props.$textColor};
  font-size: ${(props) => props.$fontSize};
  font-family: inherit;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: var(--tracking-button);
  line-height: ${(props) => props.$lineHeight};
  transition: box-shadow var(--duration-color) ease-out;
  text-align: center;
  cursor: pointer;
  outline: none;
  border: none;

  &:hover {
    background-color: ${(props) => props.$highlightColor};
    box-shadow: var(--shadow-button);
  }
`;

interface ButtonProps {
  onClick: () => void;
  text: string;
  width?: string;
  isLoading?: boolean;
  isDisabled?: boolean;
  color?: string;
  disabledColor?: string;
  highlightColor?: string;
  textColor?: string;
  fontSize?: string;
  lineHeight?: string;
  height?: string;
  padding?: string;
  borderRadius?: string;
}

export default function Button({
  onClick,
  text,
  width,
  isLoading,
  isDisabled = false,
  color = 'var(--border-color)',
  disabledColor = 'var(--accent-fill)',
  highlightColor = 'var(--accent-fill)',
  textColor = 'var(--on-accent)',
  fontSize = '0.875rem',
  lineHeight = '1.25rem',
  height = '2.375rem',
  padding = '0.625rem 0.75rem',
  borderRadius = '0',
}: ButtonProps) {
  return (
    <ButtonStyled
      onClick={onClick}
      $btnWidth={width ?? ''}
      disabled={isDisabled}
      $color={color}
      $disabledColor={disabledColor}
      $highlightColor={highlightColor}
      $textColor={textColor}
      $fontSize={fontSize}
      $lineHeight={lineHeight}
      $height={height}
      $padding={padding}
      $borderRadius={borderRadius}
    >
      {isLoading ? <Loading /> : text}
    </ButtonStyled>
  );
}

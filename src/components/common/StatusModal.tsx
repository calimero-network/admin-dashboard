import React from 'react';
import Modal from 'react-bootstrap/Modal';
import styled from 'styled-components';
import {
  ExclamationTriangleIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/solid';
import translations from '../../constants/en.global.json';
import Button from './Button';

const ModalWrapper = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 1rem;
  border-radius: 0;
  items-align: center;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  text-align: center;

  .error-icon,
  .success-icon {
    height: 2rem;
    width: 2rem;
  }

  .error-icon {
    color: var(--error);
  }

  .success-icon {
    color: var(--success);
  }

  .modal-title {
    font-size: 1rem;
    font-weight: 500;
    line-height: 1.25rem;
    color: var(--text-primary);
  }

  .container {
    margin-top: 1.25rem;

    .modal-subtitle {
      width: 100%;
      font-size: 0.875rem;
      font-weight: 500;
      line-height: 1.25rem;
      color: var(--text-secondary);
    }

    .button-wrapper {
      width: 100%;
      margin-top: 0.75rem;
    }
  }
`;

export interface ModalContent {
  title: string;
  message: string;
  error: boolean;
}

interface StatusModalProps {
  show: boolean;
  closeModal: () => void;
  modalContent: ModalContent;
}

export default function StatusModal({
  show,
  closeModal,
  modalContent,
}: StatusModalProps) {
  const t = translations.statusModal;
  return (
    <Modal
      show={show}
      backdrop="static"
      keyboard={false}
      aria-labelledby="contained-modal-title-vcenter"
      centered
    >
      <ModalWrapper>
        <div>
          {modalContent.error ? (
            <ExclamationTriangleIcon className="error-icon" />
          ) : (
            <ShieldCheckIcon className="success-icon" />
          )}
        </div>
        <div className="modal-title">{modalContent.title}</div>
        <div className="container">
          <div className="modal-subtitle">{modalContent.message}</div>
          <div className="button-wrapper">
            <Button
              width="100%"
              text={t.buttonContinueText}
              onClick={closeModal}
            />
          </div>
        </div>
      </ModalWrapper>
    </Modal>
  );
}

import React, { useState } from 'react';
import styled from 'styled-components';
import Button from '../../common/Button';
import translations from '../../../constants/en.global.json';
import StatusModal, { ModalContent } from '../../common/StatusModal';
import { parseAppMetadata } from '../../../utils/metadata';
import { InstalledApplication } from '@calimero-network/calimero-client/lib/api/nodeApi';

const Wrapper = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 1rem;
  font-optical-sizing: auto;
  font-weight: 500;
  font-style: normal;
  font-variation-settings: 'slnt' 0;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-smooth: never;

  .section-title {
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.25rem;
    text-align: left;
    color: #6b7280;
  }

  .cancel-icon {
    position: relative;
    right: -0.25rem;
    cursor: pointer;
    height: 1.25rem;
    width: 1.25rem;
    color: #fff;
    cursor: pointer;
    &:hover {
      color: #4cfafc;
    }
  }

  .select-app-section {
    .button-container {
      display: flex;
      padding-top: 1rem;
      gap: 1rem;
    }

    .selected-app {
      display: flex;
      flex-direction: column;
      padding-top: 0.25rem;
      padding-left: 0.5rem;
      font-size: 0.875rem;
      font-weight: 500;
      line-height: 1.25rem;
      text-align: left;
      .label {
        color: #6b7280;
      }
      .value {
        color: #fff;
      }
    }
  }

  .init-section {
    padding-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;

    .init-title {
      display: flex;
      justify-content: flex-start;
      align-items: center;
      gap: 0.5rem;
    }

    .form-check-input {
      margin: 0;
      padding: 0;
      background-color: #121216;
      border: 1px solid #4cfafc;
    }

    .input {
      margin-top: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      .label {
        font-size: 0.75rem;
        font-weight: 500;
        line-height: 0.875rem;
        text-align: left;
        color: #6b7280;
      }

      .method-input {
        width: 30%;
        font-size: 0.875rem;
        font-weight: 500;
        line-height: 0.875rem;
        padding: 0.25rem;
      }

      .args-input {
        position: relative;
        height: 12.5rem;
        font-size: 0.875rem;
        font-weight: 500;
        line-height: 0.875rem;
        padding: 0.25rem;
        resize: none;
      }

      .flex-wrapper {
        display: flex;
        justify-content: flex-end;
        padding-right: 0.5rem;
      }

      .format-btn {
        cursor: pointer;
        font-size: 0.825rem;
        font-weight: 500;
        line-height: 0.875rem;

        &:hover {
          color: #4cfafc;
        }
      }
    }
  }

  .init-args-section {
    .init-args-title {
      font-size: 0.875rem;
      font-weight: 500;
      line-height: 1.25rem;
      text-align: left;
      color: #6b7280;
      margin-bottom: 0.5rem;
    }

    .error-message {
      color: #ef4444;
      font-size: 0.75rem;
      margin-top: 0.25rem;
    }

    textarea.args-input {
      width: 100%;
      min-height: 120px;
      padding: 8px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 14px;
      font-family: monospace;
      background-color: #121216;
      color: #fff;
      resize: vertical;

      &:focus {
        outline: none;
        border-color: #007bff;
      }

      &::placeholder {
        color: #6b7280;
      }
    }
  }

  .protocol-input,
  .application-input {
    width: 100%;
    padding: 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 14px;
    background-color: white;
  }

  .protocol-input:focus,
  .application-input:focus {
    outline: none;
    border-color: #007bff;
  }

  /* Optional: Style the dropdown arrow */
  .protocol-input,
  .application-input {
    appearance: none;
    background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23007CB2%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.4-12.8z%22%2F%3E%3C%2Fsvg%3E');
    background-repeat: no-repeat;
    background-position: right 8px center;
    background-size: 12px;
    padding-right: 30px;
    background-color: transparent;
    margin-top: 5px;
  }
`;

interface StartContextCardProps {
  applicationId: string;
  setApplicationId: (appId: string) => void;
  startContext: (initArgs: string) => void;
  setProtocol: (protocol: string) => void;
  isLoading: boolean;
  showStatusModal: boolean;
  closeModal: () => void;
  startContextStatus: ModalContent;
  applications: InstalledApplication[];
}

export default function StartContextCard({
  applicationId,
  setApplicationId,
  startContext,
  setProtocol,
  isLoading,
  showStatusModal,
  closeModal,
  startContextStatus,
  applications,
}: StartContextCardProps) {
  const t = translations.startContextPage;
  const [initArgs, setInitArgs] = useState('{}');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const formatJson = () => {
    try {
      const parsed = JSON.parse(initArgs);
      setInitArgs(JSON.stringify(parsed, null, 2));
      setJsonError(null);
    } catch (e) {
      setJsonError('Invalid JSON format');
    }
  };

  const validateJson = (value: string) => {
    try {
      JSON.parse(value);
      setJsonError(null);
      return true;
    } catch (e) {
      setJsonError('Invalid JSON format');
      return false;
    }
  };

  const onStartContextClick = async () => {
    if (applicationId && validateJson(initArgs)) {
      await startContext(initArgs);
    }
  };

  return (
    <Wrapper>
      <StatusModal
        show={showStatusModal}
        closeModal={closeModal}
        modalContent={startContextStatus}
      />
      <div className="select-app-section">
        <div className="section-title">{t.selectApplicationTitleNew}</div>
      </div>
      <div className="init-section">
        <div className="application-section">
          <div className="appplication-title">{t.applicationLabelText}</div>
          <select
            className="application-input"
            onChange={(e) => setApplicationId(e.target.value)}
            defaultValue=""
            required
          >
            <option value="" disabled>
              Select an application
            </option>
            {applications.length > 0 &&
              applications.map((app, i) => (
                <option key={i} value={app.id}>
                  {parseAppMetadata(app.metadata)?.applicationName ?? ''} -{' '}
                  {app.id}
                </option>
              ))}
          </select>
        </div>
        <div className="protocol-section">
          <div className="protocol-title">{t.protocolLabelText}</div>
          <select
            className="protocol-input"
            onChange={(e) => setProtocol(e.target.value)}
            defaultValue=""
            required
          >
            <option value="" disabled>
              Select a protocol
            </option>
            <option value="near">NEAR</option>
            <option value="starknet">Starknet</option>
            <option value="icp">ICP</option>
            <option value="stellar">Stellar</option>
            <option value="ethereum">Ethereum</option>
          </select>
        </div>
        <div className="init-args-section">
          <div className="init-args-title">Initialization Arguments (JSON)</div>
          <div className="input">
            <textarea
              className="args-input"
              value={initArgs}
              onChange={(e) => {
                setInitArgs(e.target.value);
                validateJson(e.target.value);
              }}
              placeholder="Enter JSON initialization arguments"
            />
            <div className="flex-wrapper">
              <div className="format-btn" onClick={formatJson}>
                Format JSON
              </div>
            </div>
            {jsonError && <div className="error-message">{jsonError}</div>}
          </div>
        </div>
        <Button
          text="Start"
          width={'144px'}
          onClick={onStartContextClick}
          isLoading={isLoading}
        />
      </div>
    </Wrapper>
  );
}

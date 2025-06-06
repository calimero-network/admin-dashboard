import React from 'react';
import styled from 'styled-components';

import { AppMetadata } from '../../pages/InstallApplication';
import Button from '../common/Button';
import StatusModal, { ModalContent } from '../common/StatusModal';
import translations from '../../constants/en.global.json';

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
    margin-bottom: 1rem;
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

  .label {
    color: rgb(255, 255, 255, 0.4);
    font-size: 0.625rem;
    font-weight: 500;
    line-height: 0.75rem;
    text-align: left;
    margin-bottom: 1rem;
  }

  input {
    background-color: transparent;
    margin-bottom: 1rem;
    padding: 0.5rem;
    border: 1px solid rgb(255, 255, 255, 0.1);
    background-color: rgb(255, 255, 255, 0.2);
    border-radius: 0.25rem;
    font-size: 0.875rem;
    color: rgb(255, 255, 255, 0.7);
    outline: none;
    width: 60%;
  }

  .input:focus {
    border: 1px solid #4cfafc;
  }

  .flex-container {
    display: flex;
    flex-direction: row;
    width: 100%;
    gap: 1rem;

    .section {
      width: 50%;
    }
  }
`;

interface InstallApplicationCardProps {
  application: AppMetadata;
  setApplication: (application: AppMetadata) => void;
  installApplication: () => void;
  isLoading: boolean;
  showStatusModal: boolean;
  closeModal: () => void;
  installAppStatus: ModalContent;
}

export default function InstallApplicationCard({
  application,
  setApplication,
  installApplication,
  isLoading,
  showStatusModal,
  closeModal,
  installAppStatus,
}: InstallApplicationCardProps) {
  const t = translations.applicationsPage.installApplication;

  return (
    <Wrapper>
      <StatusModal
        show={showStatusModal}
        closeModal={closeModal}
        modalContent={installAppStatus}
      />
      <div className="select-app-section">
        <div className="application-title">{t.title}</div>
      </div>
      <div className="flex-container">
        <div className="section">
          <div className="label">{t.applicationName}</div>
          <input
            type="text"
            name="applicationName"
            className="input input-name"
            value={application.applicationName}
            onChange={(e) =>
              setApplication({
                ...application,
                applicationName: e.target.value,
              })
            }
          />
        </div>
        <div className="section">
          <div className="label">{t.applicationOwner}</div>
          <input
            type="text"
            name="applicationOwner"
            className="input input-owner"
            placeholder={t.optionalField}
            value={application.applicationOwner}
            onChange={(e) =>
              setApplication({
                ...application,
                applicationOwner: e.target.value,
              })
            }
          />
        </div>
      </div>
      <div className="flex-container">
        <div className="section">
          <div className="label">{t.applicationVersion}</div>
          <input
            type="text"
            name="applicationVersion"
            className="input input-version"
            placeholder={t.optionalField}
            value={application.applicationVersion}
            onChange={(e) =>
              setApplication({
                ...application,
                applicationVersion: e.target.value,
              })
            }
          />
        </div>
        <div className="section">
          <div className="label">{t.description}</div>
          <input
            type="text"
            name="description"
            className="input input-description"
            placeholder={t.optionalField}
            value={application.description}
            onChange={(e) =>
              setApplication({ ...application, description: e.target.value })
            }
          />
        </div>
      </div>
      <div className="label">{t.applicationUrl}</div>
      <input
        type="text"
        name="applicationUrl"
        className="input input-url"
        value={application.applicationUrl}
        onChange={(e) =>
          setApplication({ ...application, applicationUrl: e.target.value })
        }
      />
      <div className="label">{t.repositoryUrl}</div>
      <input
        type="text"
        name="repositoryUrl"
        className="input input-repository-url"
        placeholder={t.optionalField}
        value={application.repositoryUrl}
        onChange={(e) =>
          setApplication({ ...application, repositoryUrl: e.target.value })
        }
      />
      <div className="init-section">
        <Button
          text={t.installButtonText}
          width={'144px'}
          onClick={installApplication}
          isLoading={isLoading}
          isDisabled={
            isLoading ||
            !application.applicationUrl ||
            !application.applicationName
          }
        />
      </div>
    </Wrapper>
  );
}

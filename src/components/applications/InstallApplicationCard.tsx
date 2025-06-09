import React, { useState } from 'react';
import styled from 'styled-components';

import { AppMetadata } from '../../pages/InstallApplication';
import Button from '../common/Button';
import StatusModal, { ModalContent } from '../common/StatusModal';
import translations from '../../constants/en.global.json';
import { CloudArrowUpIcon } from '@heroicons/react/24/solid';
import axios from 'axios';

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
    margin-top: 1rem;
  }

  input {
    background-color: transparent;
    padding: 0.5rem;
    border: 1px solid rgb(255, 255, 255, 0.1);
    background-color: rgb(255, 255, 255, 0.2);
    border-radius: 0.25rem;
    font-size: 0.875rem;
    color: rgb(255, 255, 255, 0.7);
    outline: none;
    width: 60%;
    height: 2.5rem;
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

  .relative-container {
    .h-flex {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: start;
      width: 100%;

      .cloud-arrow-up-icon {
        margin-left: 1rem;
        background-color: rgb(255, 255, 255, 0.2);
        border-radius: 0.25rem;
        cursor: pointer;
        height: 2.5rem;
        width: 2.5rem;
        padding: 0.5rem;
        color: #6b7280;
        cursor: pointer;
      }

      .cloud-arrow-up-icon:hover {
        color: #fff;
      }
    }
  }

  .install-button-container {
    margin-top: 1rem;
  }
`;

const HiddenInput = styled.input`
  display: none;
`;

const IconLabel = styled.label<{ disabled?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ disabled }) => (disabled ? 0.5 : 1)};
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.25rem;
  background-color: rgb(255, 255, 255, 0.2);
  transition: background-color 0.2s ease;
  margin-left: 0.5rem;

  &:hover {
    background-color: ${({ disabled }) => (disabled ? '#f0f0f0' : '#e0e0e0')};
  }

  svg {
    width: 24px;
    height: 24px;
    color: #333;
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
  const [uploading, setUploading] = useState(false);
  const t = translations.applicationsPage.installApplication;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;

    setUploading(true);

    const file = e.target.files[0];

    try {
      const res = await axios.post(
        `${import.meta.env['VITE_SERVER_URL']}/get-upload-url`,
        {
          fileName: file.name,
          fileType: file.type,
        },
      );
      const response = await fetch(res.data.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'image/png',
          'x-amz-acl': 'public-read',
        },
        body: file,
      });

      if (response.ok) {
        setApplication({ ...application, applicationUrl: res.data.fileUrl });
        setUploading(false);
      } else {
        window.alert('Error uploading image');
        console.error(response);
      }
    } catch (error) {
      window.alert('Error uploading image');
      console.error(error);
    }
  };

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
      <div className="relative-container">
        <div className="label">{t.applicationUrl}</div>
        <div className="h-flex">
          <input
            type="text"
            name="applicationUrl"
            className="input input-url input-url-container"
            placeholder={t.applicationUrlPlaceholder}
            value={application.applicationUrl}
            disabled={uploading}
            onChange={(e) =>
              setApplication({ ...application, applicationUrl: e.target.value })
            }
          />
          <HiddenInput
            id="upload-wasm"
            type="file"
            accept=".wasm"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <IconLabel htmlFor="upload-wasm" disabled={uploading}>
            <CloudArrowUpIcon />
          </IconLabel>
        </div>
      </div>
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
      <div className="install-button-container">
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

import React, { useState } from 'react';
import styled from 'styled-components';
import { truncateHash } from '../../utils/displayFunctions';
import { ClipboardDocumentIcon } from '@heroicons/react/24/solid';
import { Application } from '../../pages/Applications';
import { AppMetadata } from '../../pages/InstallApplication';
import { createAppMetadata } from '../../utils/metadata';
import { apiClient } from '@calimero-network/calimero-client';
import translations from '../../constants/en.global.json';
import StatusModal, { ModalContent } from '../common/StatusModal';

interface ApplicationRowItemProps {
  $hasBorders: boolean;
}

const RowItem = styled.div<ApplicationRowItemProps>`
  display: flex;
  width: 100%;
  align-items: center;
  gap: 1px;
  font-size: 0.875rem;
  font-optical-sizing: auto;
  font-weight: 500;
  font-style: normal;
  font-variation-settings: 'slnt' 0;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-smooth: never;
  line-height: 1.25rem;
  text-align: left;
  padding-right: 1.5rem;
  padding-left: 1.5rem;
  border-top: 1px solid #23262d;
  ${(props) => props.$hasBorders && `border-bottom: 1px solid #23262D;`}

  .row-item {
    padding: 0.75rem 0rem;
    height: 4.5rem;
    display: flex;
    align-items: center;
    width: 25%;
  }

  .name {
    text-align: left;

    &:hover {
      color: #4cfafc;
      cursor: pointer;
    }
  }

  .read {
    color: #9c9da3;
  }

  .copy-icon {
    height: 1.5rem;
    width: 1.5rem;
    color: #9c9da3;
    cursor: pointer;
  }
  .copy-icon:hover {
    color: #fff;
  }

  .menu-dropdown {
    margin-right: 1rem;
  }

  .install-button-wrapper {
    display: flex;
    justify-content: end;
    .install-button {
      border: none;
      background-color: transparent;
      color: #4cfafc;
      border-radius: 0.5rem;
      cursor: pointer;
      &:hover {
        color: #fff;
      }
    }
  }
`;

export default function marketplaceRowItem(
  item: Application,
  id: number,
  count: number,
  onRowItemClick?: (id: string) => void,
  installAppStatus?: { title: string; message: string; error: boolean },
  setInstallAppStatus?: (status: {
    title: string;
    message: string;
    error: boolean;
  }) => void,
): JSX.Element {
  const t = translations.applicationsPage.installApplication;

  const copyToClippboard = (text: string) => {
    navigator.clipboard.writeText(text).catch((err) => {
      console.error('Failed to copy text to clipboard: ', err);
    });
  };

  const handleApplicationInstall = async () => {
    setInstallAppStatus &&
      setInstallAppStatus({
        title: '',
        message: '',
        error: false,
      });
    const appMetadata: AppMetadata = {
      applicationUrl: item.source,
      applicationName: item.name ?? '',
      applicationOwner: item.owner ?? '',
      applicationVersion: item.version ?? '',
      description: item.description ?? '',
      contractAppId: item.contract_app_id ?? '',
      repositoryUrl: item.repository ?? '',
    };

    const response = await apiClient
      .node()
      .installApplication(
        appMetadata.applicationUrl,
        createAppMetadata(appMetadata),
      );
    if (response.error) {
      setInstallAppStatus &&
        setInstallAppStatus({
          title: t.failInstallTitle,
          message: response.error.message,
          error: true,
        });
      return null;
    } else {
      setInstallAppStatus &&
        setInstallAppStatus({
          title: t.successInstallTitle,
          message: `Installed application ${item.name}, with ID ${response.data.applicationId}.`,
          error: false,
        });
      return response.data.applicationId;
    }
  };

  return (
    <RowItem key={item.id} $hasBorders={id === count}>
      <StatusModal
        show={
          (installAppStatus?.message ||
            installAppStatus?.title ||
            installAppStatus?.error) as boolean
        }
        closeModal={() => {
          setInstallAppStatus &&
            setInstallAppStatus({
              title: '',
              message: '',
              error: false,
            });
        }}
        modalContent={installAppStatus as ModalContent}
      />
      <div className="row-item name">{item.name}</div>
      <div className="row-item read">
        <ClipboardDocumentIcon
          className="copy-icon"
          onClick={() => copyToClippboard(item.source)}
        />
        <span>{truncateHash(item.source)}</span>
      </div>
      <div className="row-item read">{item.version ?? 'N/A'}</div>
      <div className="row-item read">{item.owner ?? 'N/A'}</div>
      <div className="row-item read install-button-wrapper">
        <button className="install-button" onClick={handleApplicationInstall}>
          Install
        </button>
      </div>
    </RowItem>
  );
}

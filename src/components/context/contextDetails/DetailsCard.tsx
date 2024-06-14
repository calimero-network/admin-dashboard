import React from "react";
import styled from "styled-components";
import LoaderSpinner from "../../common/LoaderSpinner";
import translations from "../../../constants/en.global.json";
import { ApiResponse, ContextObject } from "../../../pages/ContextDetails";

const DetailsCardWrapper = styled.div`
  padding-left: 1rem;

  .container,
  .container-full {
    padding: 1rem;
    display: flex;
    flex-direction: column;

    .title {
      padding-top: 1rem;
      padding-bottom: 1rem;
    }

    .context-id,
    .highlight,
    .item {
      font-size: 1rem;
      line-height: 1.25rem;
      text-align: left;
    }

    .context-id {
      font-weight: 400;
      color: #6b7280;
    }

    .highlight {
      font-weight: 500;
      color: #fff;
    }

    .item {
      font-weight: 500;
      color: #6b7280;
      padding-bottom: 4px;
    }
  }
  .container-full {
    display: flex;
    align-items: center;
  }
`;

interface DetailsCardProps {
  details: ApiResponse<ContextObject>;
}

export default function DetailsCard({ details }: DetailsCardProps) {
  const t = translations.contextPage.contextDetails;

  if (!details) {
    return <LoaderSpinner />;
  }

  return (
    <DetailsCardWrapper>
      {details.data ? (
        <div className="container">
          <div className="context-id">
            {t.labelIdText}
            {details.data.contextId}
          </div>
          <div className="highlight title inter-mid">{t.titleApps}</div>
          <div className="item">
            {t.labelNameText}
            <span className="highlight">{details.data.name}</span>
          </div>
          <div className="item">
            {t.labelOwnerText}
            <span className="highlight">{details.data.owner}</span>
          </div>
          <div className="item">
            {t.labelDescriptionText}
            {details.data.description}
          </div>
          <div className="item">
            {t.labelRepositoryText}
            {details.data.repository}
          </div>
          <div className="item">
            {t.lableVersionText}
            <span className="highlight">{details.data.version}</span>
          </div>
          <div className="item">
            {t.labelAppId}
            {details.data.applicationId}
          </div>
          <div className="highlight title">{t.titleStorage}</div>
          <div className="item">
            {t.labelStorageText}
            <span className="highlight">{"-"}</span>
          </div>
        </div>
      ) : (
        <div className="container-full">
          <div className="item">{details.error}</div>
        </div>
      )}
    </DetailsCardWrapper>
  );
}

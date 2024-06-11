import React from "react";
import { useNavigate } from "react-router-dom";
import { MetamaskWrapper } from "@calimero-is-near/calimero-p2p-sdk";
import ContentWrapper from "../components/login/ContentWrapper";
import { getNodeUrl } from "../utils/node";

export default function Metamask() {
  const navigate = useNavigate();
  return (
    <ContentWrapper>
      <MetamaskWrapper
        applicationId={"admin-ui"}
        rpcBaseUrl={getNodeUrl()}
        successRedirect={() => navigate("/identity")}
        navigateBack={() => navigate("/")}
        clientLogin={true}
      />
    </ContentWrapper>
  );
}

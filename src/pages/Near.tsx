import React from "react";
import { useNavigate } from "react-router-dom";
import { WalletSelectorContextProvider } from "@calimero-is-near/calimero-p2p-sdk";
import { NearLogin } from "@calimero-is-near/calimero-p2p-sdk";
import ContentWrapper from "../components/login/ContentWrapper";

import "@near-wallet-selector/modal-ui/styles.css";
import { getNearEnvironment, getNodeUrl } from "../utils/node";

export default function Near() {
  const navigate = useNavigate();

  return (
    <ContentWrapper>
      <WalletSelectorContextProvider network={getNearEnvironment()}>
        <NearLogin
          appId={"admin-ui"}
          rpcBaseUrl={getNodeUrl()}
          successRedirect={() => navigate("/identity")}
          navigateBack={() => navigate("/auth")}
          cardBackgroundColor={"#1c1c1c"}
          nearTitleColor={"white"}
        />
      </WalletSelectorContextProvider>
    </ContentWrapper>
  );
}

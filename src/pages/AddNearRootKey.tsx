import React from "react";
import { useNavigate } from "react-router-dom";
import { WalletSelectorContextProvider } from "@calimero-is-near/calimero-p2p-sdk/lib/wallets/NearLogin/WalletSelectorContext";
import NearRootKey from "@calimero-is-near/calimero-p2p-sdk/lib/wallets/NearLogin/NearRootKey";
import ContentWrapper from "../components/login/ContentWrapper";

import "@near-wallet-selector/modal-ui/styles.css";
import { getNearEnvironment, getNodeUrl } from "../utils/node";

export default function AddNearRootKey() {
  const navigate = useNavigate();

  return (
    <ContentWrapper>
      <WalletSelectorContextProvider network={getNearEnvironment()}>
        <NearRootKey
          appId={"admin-ui"}
          rpcBaseUrl={getNodeUrl()}
          successRedirect={() => navigate("/identity")}
          navigateBack={() => navigate("/")}
          cardBackgroundColor={"#1c1c1c"}
          nearTitleColor={"white"}
        />
      </WalletSelectorContextProvider>
    </ContentWrapper>
  );
}

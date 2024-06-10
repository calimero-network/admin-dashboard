import React from "react";
import SetupModal from "@calimero-is-near/calimero-p2p-sdk/lib/setup/SetupModal";
import { useNavigate } from "react-router-dom";
import { getNodeUrl } from "../../utils/node";
import { setAppEndpointKey } from "../../utils/storage";
import { styled } from "styled-components";

const FullPageCenter = styled.div`
  display: flex;
  height: 100vh;
  width: 100vw;
  background-color: #111111;
  justify-content: center;
  align-items: center;
`;

export default function SetupPage() {
  const navigate = useNavigate();

  return (
    <FullPageCenter>
      <SetupModal
        successRoute={() => navigate("/auth")}
        getNodeUrl={getNodeUrl}
        setNodeUrl={setAppEndpointKey}
      />
    </FullPageCenter>
  );
}

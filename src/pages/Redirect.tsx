import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Near() {
  const navigate = useNavigate();
  const clientKey = localStorage.getItem("client-key"); 

  useEffect(() => {
    if (clientKey) {
      navigate("/identity");
    } else {
      navigate("/auth");
    }
  }, [clientKey]);
  return (
    <div></div>
  );
}

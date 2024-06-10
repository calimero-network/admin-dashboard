import React, { useEffect } from "react";
import { useNavigate, Outlet } from "react-router-dom";

export default function ProtectedRoute() {
  const navigate = useNavigate();
  const clientKey = localStorage.getItem("client-key");
  const basePath = "/admin-dashboard";
  const pathname = location.pathname.startsWith(basePath)
    ? location.pathname.slice(basePath.length)
    : location.pathname;

  useEffect(() => {
    if (clientKey) {
      if (
        pathname === "/auth" ||
        pathname === "/auth/near" ||
        pathname === "/auth/metamask"
      ) {
        navigate("/identity");
      }
    } else {
      if (
        !(
          pathname === "/auth" ||
          pathname === "/auth/near" ||
          pathname === "/auth/metamask"
        )
      ) {
        navigate("/");
      }
    }
  }, [clientKey]);

  return <Outlet />;
}

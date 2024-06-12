import React, { useEffect } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { getClientKey } from "../../utils/storage";
import { getPathname } from "../../utils/protectedRoute";

export default function ProtectedRoute() {
  const navigate = useNavigate();
  const clientKey = getClientKey();
  const pathname = getPathname();

  useEffect(() => {
    const isAuthPath = pathname.startsWith("/auth");
    if (clientKey) {
      if (isAuthPath) {
        navigate("/identity");
      }
    } else {
      navigate("/auth");
    }
  }, [clientKey]);

  return <Outlet />;
}

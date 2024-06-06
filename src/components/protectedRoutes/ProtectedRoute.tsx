import React, { useEffect } from "react";
import { useNavigate, Outlet } from "react-router-dom";

const ProtectedRoute = () => {
  const navigate = useNavigate();
  const isAuthorized =
    JSON.parse(localStorage.getItem("node-authorized")!) ?? false;
  const basePath = "/admin-dashboard";
  const pathname = location.pathname.startsWith(basePath)
    ? location.pathname.slice(basePath.length)
    : location.pathname;

  useEffect(() => {
    if (isAuthorized) {
      if (
        pathname === "/" ||
        pathname === "/near" ||
        pathname === "/metamask"
      ) {
        navigate("/identity");
      }
    } else {
      if (
        !(pathname === "/" || pathname === "/near" || pathname === "/metamask")
      ) {
        navigate("/");
      }
    }
  }, [isAuthorized]);

  return <Outlet />;
};

export default ProtectedRoute;

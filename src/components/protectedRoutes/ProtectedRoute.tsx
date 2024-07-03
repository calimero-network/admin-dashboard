import React, { useEffect } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import { isNodeAuthorized } from '../../utils/storage';
import { getPathname } from '../../utils/protectedRoute';

export default function ProtectedRoute() {
  const navigate = useNavigate();
  const isAuthorized = isNodeAuthorized();
  const pathname = getPathname();

  useEffect(() => {
    const isAuthPath = pathname.startsWith('/auth');
    if (isAuthorized) {
      if (isAuthPath) {
        navigate('/identity');
      }
    } else {
      navigate('/auth');
    }
  }, [isAuthorized]);

  return <Outlet />;
}

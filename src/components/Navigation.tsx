import React from 'react';
import styled from 'styled-components';
import translations from '../constants/en.global.json';
import { Link } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import {
  getAccessToken,
  getRefreshToken,
  getAppEndpointKey,
  clearAccessToken,
  clearApplicationId,
  clearContextId,
  clearExecutorPublicKey,
} from '@calimero-network/calimero-client';

// Use a public URL that works regardless of the application path
const CalimeroLogo = '/assets/calimero-logo.svg';

const NavigationWrapper = styled.div`
  background-color: #111111;
  width: fit-content;
  padding-left: 2rem;
  padding-right: 2rem;
  padding-top: 2rem;
  height: 100vh;

  .logo-wrapper {
    display: flex;
    -webkit-box-pack: justify;
    justify-content: space-between;
  }

  .logo-container {
    position: relative;
    display: flex;
    justify-content: center;
  }

  .calimero-logo {
    width: 8.75rem;
    height: 2.706rem;
  }

  .dashboard-text {
    position: absolute;
    left: 2.8rem;
    top: 2rem;
    width: max-content;
    font-size: 0.625rem;
    color: #fff;
  }

  .items-wrapper {
    margin-top: 4.5rem;
    display: flex;
    flex-direction: column;
  }

  .navigation-items-wrapper {
    display: flex;
    flex-direction: column;
    justify-content: center;
    width: 100%;
    gap: 0.25rem;
  }

  .nav-item-active {
    color: #fff !important;
    background-color: rgb(255, 255, 255, 0.05);
  }

  .nav-item,
  .nav-item-active {
    color: #9ca3af;
    cursor: pointer;
    text-decoration: none;
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.25rem;
    text-align: left;
    padding: 0.5rem;
    border-radius: 0.5rem;
    width: 14.5rem;
  }

  .nav-item:hover {
    color: #fff;
  }

  .logout:hover {
    color: #4cfafc;
  }
`;

const NavigationItems = [
  {
    id: 0,
    title: 'Identity',
    path: '/identity',
  },
  {
    id: 1,
    title: 'Contexts',
    path: '/contexts',
  },
  {
    id: 2,
    title: 'Applications',
    path: '/applications',
  },
  {
    id: 3,
    title: 'Blobs',
    path: '/blobs',
  },
  {
    id: 4,
    title: 'Export',
    path: '/export',
  },
  {
    id: 5,
    title: 'Logout',
    path: '',
  },
];

export function Navigation() {
  const t = translations.navigation;
  const location = useLocation();

  // Check if user is authenticated by checking for tokens
  const hasTokens = () => {
    const accessToken = getAccessToken();
    const refreshToken = getRefreshToken();
    return !!(accessToken && refreshToken);
  };

  // Filter navigation items based on authentication status
  const filteredNavigationItems = NavigationItems.filter((item) => {
    if (item.id === 0 && !hasTokens()) {
      return false;
    }
    return true;
  });

  const logout = () => {
    // Get the stored app URL to determine the correct redirect path
    const appUrl = getAppEndpointKey();
    
    // Determine the correct admin dashboard URL
    let adminDashboardUrl = '/admin-dashboard/';
    
    if (appUrl) {
      try {
        const url = new URL(appUrl);
        // Extract the path from the app URL (e.g., /node1, /myapp, etc.)
        const pathSegments = url.pathname.split('/').filter(segment => segment.length > 0);
        if (pathSegments.length > 0) {
          const nodePath = pathSegments[0];
          adminDashboardUrl = `/${nodePath}/admin-dashboard/`;
        }
      } catch (error) {
        console.error('Error parsing app URL:', error);
      }
    }
    
    // Clear auth data using the same methods as clientLogout but without the reload
    clearAccessToken();
    clearApplicationId();
    clearContextId();
    clearExecutorPublicKey();
    
    // Redirect to the correct admin dashboard URL
    window.location.href = adminDashboardUrl;
  };
  return (
    <NavigationWrapper>
      <div className="logo-wrapper">
        <div className="logo-container">
          <img
            src={CalimeroLogo as unknown as string}
            className="calimero-logo"
            alt="Calimero Logo"
          />
          <h4 className="dashboard-text">{t.logoDashboardText}</h4>
        </div>
      </div>
      <div className="items-wrapper">
        <div className="navigation-items-wrapper">
          {filteredNavigationItems.map((item) =>
            item.id === 5 ? (
              <div key={item.id} className="nav-item logout" onClick={logout}>
                {item.title}
              </div>
            ) : (
              <Link
                to={item.path}
                key={item.id}
                className={
                  location.pathname === item.path ||
                  location.pathname.includes(item.path)
                    ? 'nav-item-active'
                    : 'nav-item'
                }
              >
                {item.title}
              </Link>
            ),
          )}
        </div>
      </div>
    </NavigationWrapper>
  );
}

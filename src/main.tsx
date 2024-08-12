import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import 'react-tooltip/dist/react-tooltip.css';
import App from './App';
import { WalletSelectorContextProvider } from './context/WalletSelectorContext';
import { getNearEnvironment } from './utils/node';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

root.render(
  <React.StrictMode>
    <WalletSelectorContextProvider network={getNearEnvironment()}>
      <App />
    </WalletSelectorContextProvider>
  </React.StrictMode>,
);

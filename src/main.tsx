import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/dm-sans';
import './styles.css';
import { App } from './App';
import { StoreProvider } from './store';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><StoreProvider><App /></StoreProvider></React.StrictMode>,
);

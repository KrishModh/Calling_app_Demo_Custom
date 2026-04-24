import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

// StrictMode intentionally removed – it double-invokes effects which causes
// duplicate Socket.IO event listeners and double WebRTC offer/answer exchange.
ReactDOM.createRoot(document.getElementById('root')).render(
<App />
);

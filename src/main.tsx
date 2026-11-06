import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './styles/app.css';
createRoot(document.getElementById('root')!).render(<App/>);
if('serviceWorker' in navigator&&import.meta.env.PROD&&/^https?:$/.test(location.protocol)&&!('__TAURI_INTERNALS__' in window)){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));}

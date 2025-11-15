import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

const strictModeEnabled = true; // true/false 바꾸기만 하면 됨


ReactDOM.createRoot(document.getElementById('root')).render(
  strictModeEnabled 
    ? <React.StrictMode><App /></React.StrictMode>
    : <App />
)

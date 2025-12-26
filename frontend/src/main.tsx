import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";
import ErrorBoundary from "./components/ErrorBoundary";

if (window && !window.__TESTING_MODE) {
  window.__TESTING_MODE = true;
}
if (window && !window.__API_RESPONSES) {
  window.__API_RESPONSES = [];
}
if (window && window.__SIMULATE_NETWORK_FAILURE === undefined) {
  window.__SIMULATE_NETWORK_FAILURE = false;
}
if (window && !window.__ERROR_LOGS) {
  window.__ERROR_LOGS = [];
}
if (window && window.__MOCK_API === undefined) {
  window.__MOCK_API = false;
}
if (window && window.__PERMISSION_OVERRIDE === undefined) {
  window.__PERMISSION_OVERRIDE = "prompt";
}
if (window && window.__TIME_SKEW_MS === undefined) {
  window.__TIME_SKEW_MS = 0;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>
);

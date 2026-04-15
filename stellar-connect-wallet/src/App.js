/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Wallet,
  LogOut,
  Send,
  AlertCircle,
  CheckCircle2,
  Clock,
  Plus,
  Trash2,
  FileText,
  Activity,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Zap,
  XCircle,
  ChevronDown,
  Loader2,
  Sun,
  Moon,
} from "lucide-react";

import {
  detectWallets,
  connectWallet,
  disconnectWallet as walletDisconnect,
  tryAutoConnect,
  getActiveWallet,
} from "./walletKit";

import {
  fetchBalance,
  sendPayment,
  recordPaymentOnContract,
  isValidStellarAddress,
  getPayments,
  getTransactionHistory,
} from "./contractClient";

import {
  WALLET_TYPES,
  ERROR_TYPES,
  ERROR_MESSAGES,
  TX_STATUS,
  CONTRACT_ID,
} from "./constants";

import "./App.css";

// ─── Main App ───────────────────────────────────────────────────────────────

function App() {
  // Theme state
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("stellarpay-theme") || "light";
  });

  // Wallet state
  const [publicKey, setPublicKey] = useState("");
  const [walletType, setWalletType] = useState(null);
  const [balance, setBalance] = useState(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [availableWallets, setAvailableWallets] = useState([]);

  // Payment form state
  const [recipients, setRecipients] = useState([
    { address: "", amount: "1", memo: "" },
  ]);
  const [recordOnContract, setRecordOnContract] = useState(true);

  // Transaction state
  const [txStatus, setTxStatus] = useState(TX_STATUS.IDLE);
  const [txHash, setTxHash] = useState("");
  const [txError, setTxError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Data state
  const [contractPayments, setContractPayments] = useState([]);
  const [txHistory, setTxHistory] = useState([]);
  const [activeTab, setActiveTab] = useState("payments"); // 'payments' | 'history'

  // Polling ref
  const pollRef = useRef(null);

  // ── Theme Persistance ─────────────────────────────────────────────────────

  useEffect(() => {
    localStorage.setItem("stellarpay-theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // ── Auto-Connect on mount ─────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const result = await tryAutoConnect();
      if (result) {
        setPublicKey(result.address);
        setWalletType(result.walletType);
        const bal = await fetchBalance(result.address);
        setBalance(bal);
      }
    })();
  }, []);

  // ── Polling for payment updates ───────────────────────────────────────────

  useEffect(() => {
    if (publicKey) {
      refreshData();
      pollRef.current = setInterval(refreshData, 15000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey]);

  const refreshData = useCallback(async () => {
    if (!publicKey) return;
    try {
      const [payments, history, bal] = await Promise.all([
        getPayments(),
        getTransactionHistory(publicKey),
        fetchBalance(publicKey),
      ]);
      setContractPayments(payments);
      setTxHistory(history);
      setBalance(bal);
    } catch (e) {
      console.error("Data refresh error:", e);
    }
  }, [publicKey]);

  // ── Wallet Actions ────────────────────────────────────────────────────────

  const handleOpenWalletModal = async () => {
    const wallets = await detectWallets();
    setAvailableWallets(wallets);
    setShowWalletModal(true);
  };

  const handleConnectWallet = async (type) => {
    setLoading(true);
    setTxError(null);
    try {
      const result = await connectWallet(type);
      setPublicKey(result.address);
      setWalletType(result.walletType);
      const bal = await fetchBalance(result.address);
      setBalance(bal);
      setShowWalletModal(false);
    } catch (error) {
      setTxError({
        type: error.type || ERROR_TYPES.WALLET_NOT_FOUND,
        message: error.message || ERROR_MESSAGES[ERROR_TYPES.WALLET_NOT_FOUND],
      });
    }
    setLoading(false);
  };

  const handleDisconnect = () => {
    walletDisconnect();
    setPublicKey("");
    setWalletType(null);
    setBalance(null);
    setTxStatus(TX_STATUS.IDLE);
    setTxHash("");
    setTxError(null);
    setContractPayments([]);
    setTxHistory([]);
  };

  // ── Recipients ────────────────────────────────────────────────────────────

  const addRecipient = () => {
    if (recipients.length < 5) {
      setRecipients([...recipients, { address: "", amount: "1", memo: "" }]);
    }
  };

  const removeRecipient = (index) => {
    if (recipients.length > 1) {
      setRecipients(recipients.filter((_, i) => i !== index));
    }
  };

  const updateRecipient = (index, field, value) => {
    const updated = [...recipients];
    updated[index][field] = value;
    setRecipients(updated);
  };

  // ── Submit Payments ───────────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setTxError(null);
    setTxHash("");

    for (let i = 0; i < recipients.length; i++) {
      const { address, amount, memo } = recipients[i];

      // Validate address
      if (!isValidStellarAddress(address)) {
        setTxError({
          type: ERROR_TYPES.INVALID_ADDRESS,
          message: `Recipient ${i + 1}: ${ERROR_MESSAGES[ERROR_TYPES.INVALID_ADDRESS]}`,
        });
        setTxStatus(TX_STATUS.FAILED);
        setLoading(false);
        return;
      }

      try {
        // Send XLM payment
        const result = await sendPayment(
          publicKey,
          address,
          amount,
          setTxStatus
        );
        setTxHash(result.hash);

        // Optionally record on contract
        if (recordOnContract) {
          await recordPaymentOnContract(
            publicKey,
            address,
            amount,
            memo || `Payment #${i + 1}`,
            (s) => { } // silent status for contract recording
          );
        }
      } catch (error) {
        setTxStatus(TX_STATUS.FAILED);
        setTxError({
          type: error.type || ERROR_TYPES.NETWORK_ERROR,
          message:
            error.message ||
            ERROR_MESSAGES[error.type] ||
            "Transaction failed",
        });
        setLoading(false);
        return;
      }
    }

    setTxStatus(TX_STATUS.SUCCESS);
    setLoading(false);

    // Refresh data after successful payment
    setTimeout(refreshData, 2000);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="app-root" data-theme={theme}>
      {/* Animated Background */}
      <div className="bg-blob blob-1" />
      <div className="bg-blob blob-2" />
      <div className="bg-blob blob-3" />

      <div className="app-container">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <header className="app-header fadeIn-delayed">
          <div className="header-left">
            <div className="logo-group scale-in">
              <div className="logo-circle">
                <Activity size={24} strokeWidth={2.5} />
              </div>
              <div className="logo-text">
                <h1 className="app-title">STELLARPAY</h1>
                <span className="app-subtitle">PAYMENT TRACKER</span>
              </div>
            </div>
            <nav className="header-nav">
              <a href="https://laboratory.stellar.org/#account-creator?network=test" target="_blank" rel="noreferrer" className="nav-link">
                Faucet <ExternalLink size={12} />
              </a>
              <a href="https://stellar.expert/explorer/testnet" target="_blank" rel="noreferrer" className="nav-link">
                Explorer <ExternalLink size={12} />
              </a>
            </nav>
          </div>

          <div className="header-right">
            <div className="header-actions">
              <button
                className="theme-toggle"
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              >
                {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
              </button>

              {!publicKey ? (
                <button
                  className="btn btn-primary btn-elevated"
                  onClick={handleOpenWalletModal}
                  disabled={loading}
                >
                  <Wallet size={16} />
                  {loading ? "CONNECTING..." : "CONNECT WALLET"}
                </button>
              ) : (
                <div className="wallet-info slideIn-right">
                  <div className="wallet-badge">
                    <div className="status-dot pulse-indigo" />
                    <span>
                      {walletType === WALLET_TYPES.FREIGHTER
                        ? "FREIGHTER"
                        : "XBULL"}
                    </span>
                  </div>
                  <span className="wallet-address">
                    {publicKey.slice(0, 4)}...{publicKey.slice(-4)}
                  </span>
                  <button
                    className="btn-ghost-circle disconnect-btn"
                    onClick={handleDisconnect}
                    title="Disconnect Wallet"
                  >
                    <LogOut size={18} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── Wallet Selection Modal ─────────────────────────────────── */}
        {showWalletModal && (
          <div
            className="modal-overlay"
            onClick={() => setShowWalletModal(false)}
          >
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <h2 className="modal-title">CONNECT WALLET</h2>
              <p className="modal-subtitle">CHOOSE YOUR STELLAR PROVIDER</p>
              <div className="wallet-list">
                {availableWallets.map((w) => (
                  <button
                    key={w.id}
                    className={`wallet-option ${!w.available ? "disabled" : ""}`}
                    onClick={() =>
                      w.available && handleConnectWallet(w.id)
                    }
                    disabled={!w.available || loading}
                  >
                    <span className="wallet-option-icon">{w.icon}</span>
                    <span className="wallet-option-name">{w.name.toUpperCase()}</span>
                    {w.available ? (
                      <span className="wallet-option-status available">
                        READY
                      </span>
                    ) : (
                      <span className="wallet-option-status unavailable">
                        MISSING
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <button
                className="btn btn-ghost modal-close"
                onClick={() => setShowWalletModal(false)}
              >
                CANCEL
              </button>
            </div>
          </div>
        )}

        {/* ── Error Toast ────────────────────────────────────────────── */}
        {txError && (
          <div className={`error-toast error-${txError.type} slideIn-right`}>
            <div className="error-toast-icon">
              {txError.type === ERROR_TYPES.WALLET_NOT_FOUND && (
                <XCircle size={20} />
              )}
              {txError.type === ERROR_TYPES.TX_REJECTED && (
                <XCircle size={20} />
              )}
              {txError.type === ERROR_TYPES.INSUFFICIENT_BALANCE && (
                <AlertCircle size={20} />
              )}
              {txError.type === ERROR_TYPES.INVALID_ADDRESS && (
                <AlertCircle size={20} />
              )}
              {txError.type === ERROR_TYPES.CONTRACT_ERROR && (
                <AlertCircle size={20} />
              )}
              {txError.type === ERROR_TYPES.NETWORK_ERROR && (
                <AlertCircle size={20} />
              )}
            </div>
            <div className="error-toast-content">
              <span className="error-toast-type">
                {txError.type.replace(/_/g, " ")}
              </span>
              <p className="error-toast-message">{txError.message}</p>
            </div>
            <button
              className="error-toast-close"
              onClick={() => setTxError(null)}
            >
              ×
            </button>
          </div>
        )}

        {/* ── Not Connected State ────────────────────────────────────── */}
        {!publicKey && (
          <div className="welcome-panel slideUp-heavy">
            <div className="welcome-icon-wrap">
              <Zap size={40} strokeWidth={2.5} />
            </div>
            <h2 className="welcome-title text-focus-in">Clean. Professional. Fast.</h2>
            <p className="welcome-desc">
              Experience the next generation of Stellar payments. Multi-address tracking across wallets with professional-grade smart contract logging.
            </p>
            <div className="welcome-features">
              <div className="feature-chip">
                MULTI-WALLET
              </div>
              <div className="feature-chip">
                SMART LOGS
              </div>
              <div className="feature-chip">
                TESTNET READY
              </div>
            </div>
            <button
              className="btn btn-primary btn-lg mt-8"
              onClick={handleOpenWalletModal}
              disabled={loading}
            >
              GET STARTED <Send size={16} />
            </button>
          </div>
        )}

        {/* ── Connected Dashboard ────────────────────────────────────── */}
        {publicKey && (
          <div className="dashboard">
            {/* Balance Card */}
            <div className="balance-card glass-card">
              <div className="balance-card-glow" />
              <div className="balance-card-content">
                <p className="balance-label">Testnet Balance</p>
                <div className="balance-value">
                  <span className="balance-amount">
                    {balance !== null ? balance : "..."}
                  </span>
                  <span className="balance-unit">XLM</span>
                </div>
                <p className="balance-address">{publicKey}</p>
              </div>
            </div>

            {/* Main Grid */}
            <div className="dashboard-grid">
              {/* Left Column - Payment Form */}
              <div className="payment-form-card glass-card">
                <div className="card-header">
                  <h2>
                    <Send size={18} /> Send Payments
                  </h2>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={addRecipient}
                    disabled={recipients.length >= 5}
                    title="Add another recipient"
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="payment-form">
                  {recipients.map((r, i) => (
                    <div key={i} className="recipient-row">
                      <div className="recipient-header">
                        <span className="recipient-number">#{i + 1}</span>
                        {recipients.length > 1 && (
                          <button
                            type="button"
                            className="btn-icon-danger"
                            onClick={() => removeRecipient(i)}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="Destination address (G...)"
                        value={r.address}
                        onChange={(e) =>
                          updateRecipient(i, "address", e.target.value)
                        }
                        className="input-field input-mono"
                        required
                      />
                      <div className="recipient-row-inline">
                        <input
                          type="number"
                          step="0.0000001"
                          min="0.0000001"
                          placeholder="Amount (XLM)"
                          value={r.amount}
                          onChange={(e) =>
                            updateRecipient(i, "amount", e.target.value)
                          }
                          className="input-field"
                          required
                        />
                        <input
                          type="text"
                          placeholder="Memo (optional)"
                          value={r.memo}
                          onChange={(e) =>
                            updateRecipient(i, "memo", e.target.value)
                          }
                          className="input-field"
                        />
                      </div>
                    </div>
                  ))}

                  {/* Contract Toggle */}
                  <div className="contract-toggle">
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={recordOnContract}
                        onChange={(e) =>
                          setRecordOnContract(e.target.checked)
                        }
                        className="toggle-checkbox"
                      />
                      <span className="toggle-slider" />
                      <span className="toggle-text">
                        <FileText size={14} />
                        Record on Smart Contract
                      </span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary btn-submit"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 size={18} className="spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Send size={18} />
                        Submit{" "}
                        {recipients.length > 1
                          ? `${recipients.length} Payments`
                          : "Payment"}
                      </>
                    )}
                  </button>
                </form>

                {/* Transaction Status Timeline */}
                {txStatus !== TX_STATUS.IDLE && (
                  <div className="tx-timeline">
                    <h3 className="tx-timeline-title">Transaction Status</h3>
                    <div className="timeline-steps">
                      <TimelineStep
                        label="Building"
                        status={getStepStatus("building", txStatus)}
                        icon={<FileText size={14} />}
                      />
                      <TimelineStep
                        label="Signing"
                        status={getStepStatus("signing", txStatus)}
                        icon={<ShieldCheck size={14} />}
                      />
                      <TimelineStep
                        label="Submitting"
                        status={getStepStatus("submitting", txStatus)}
                        icon={<Send size={14} />}
                      />
                      <TimelineStep
                        label="Confirming"
                        status={getStepStatus("confirming", txStatus)}
                        icon={<Clock size={14} />}
                      />
                      <TimelineStep
                        label={
                          txStatus === TX_STATUS.FAILED ? "Failed" : "Done"
                        }
                        status={getStepStatus("result", txStatus)}
                        icon={
                          txStatus === TX_STATUS.FAILED ? (
                            <XCircle size={14} />
                          ) : (
                            <CheckCircle2 size={14} />
                          )
                        }
                      />
                    </div>
                    {txHash && (
                      <a
                        href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="tx-hash-link"
                      >
                        <ExternalLink size={12} />
                        {txHash.slice(0, 8)}...{txHash.slice(-8)}
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column - Payment History / Tx History */}
              <div className="history-card glass-card">
                <div className="card-header">
                  <div className="tab-group">
                    <button
                      className={`tab-btn ${activeTab === "payments" ? "active" : ""}`}
                      onClick={() => setActiveTab("payments")}
                    >
                      <FileText size={14} /> Contract Log
                    </button>
                    <button
                      className={`tab-btn ${activeTab === "history" ? "active" : ""}`}
                      onClick={() => setActiveTab("history")}
                    >
                      <Activity size={14} /> Tx History
                    </button>
                  </div>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={refreshData}
                    title="Refresh"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>

                <div className="history-list">
                  {activeTab === "payments" && (
                    <>
                      {contractPayments.length === 0 ? (
                        <div className="empty-state">
                          <FileText size={32} />
                          <p>No payments recorded yet</p>
                          <span>
                            Send a payment with "Record on Smart Contract"
                            enabled
                          </span>
                        </div>
                      ) : (
                        contractPayments.map((p, i) => (
                          <div key={i} className="payment-item">
                            <div className="payment-item-header">
                              <span className="payment-id">#{p.id}</span>
                              <span className="payment-status completed">
                                <CheckCircle2 size={12} /> Completed
                              </span>
                            </div>
                            <div className="payment-detail">
                              <span className="label">To:</span>
                              <span className="value mono">
                                {typeof p.recipient === "string"
                                  ? `${p.recipient.slice(0, 8)}...${p.recipient.slice(-4)}`
                                  : "—"}
                              </span>
                            </div>
                            <div className="payment-detail">
                              <span className="label">Amount:</span>
                              <span className="value highlight">
                                {typeof p.amount === "number"
                                  ? p.amount.toFixed(2)
                                  : p.amount}{" "}
                                XLM
                              </span>
                            </div>
                            {p.memo && (
                              <div className="payment-detail">
                                <span className="label">Memo:</span>
                                <span className="value">{p.memo}</span>
                              </div>
                            )}
                            <div className="payment-detail">
                              <span className="label">Time:</span>
                              <span className="value">
                                {new Date(
                                  p.timestamp * 1000
                                ).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </>
                  )}

                  {activeTab === "history" && (
                    <>
                      {txHistory.length === 0 ? (
                        <div className="empty-state">
                          <Activity size={32} />
                          <p>No transactions yet</p>
                          <span>Send a payment to see transactions here</span>
                        </div>
                      ) : (
                        txHistory.map((tx, i) => (
                          <div key={i} className="payment-item">
                            <div className="payment-item-header">
                              <a
                                href={`https://stellar.expert/explorer/testnet/tx/${tx.hash}`}
                                target="_blank"
                                rel="noreferrer"
                                className="tx-link"
                              >
                                {tx.hash.slice(0, 10)}...
                                <ExternalLink size={10} />
                              </a>
                              <span
                                className={`payment-status ${tx.successful ? "completed" : "failed"}`}
                              >
                                {tx.successful ? (
                                  <>
                                    <CheckCircle2 size={12} /> Success
                                  </>
                                ) : (
                                  <>
                                    <XCircle size={12} /> Failed
                                  </>
                                )}
                              </span>
                            </div>
                            <div className="payment-detail">
                              <span className="label">Date:</span>
                              <span className="value">
                                {new Date(tx.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <div className="payment-detail">
                              <span className="label">Ops:</span>
                              <span className="value">
                                {tx.operationCount}
                              </span>
                            </div>
                            <div className="payment-detail">
                              <span className="label">Fee:</span>
                              <span className="value">
                                {(tx.feeCharged / 10000000).toFixed(7)} XLM
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </>
                  )}
                </div>

                {/* Real-time sync indicator */}
                <div className="sync-indicator">
                  <div className="sync-dot" />
                  <span>Auto-syncing every 15s</span>
                </div>
              </div>
            </div>

            {/* Contract Info Footer */}
            <div className="contract-info glass-card">
              <FileText size={14} />
              <span>Contract ID: </span>
              <code>{CONTRACT_ID.slice(0, 12)}...{CONTRACT_ID.slice(-6)}</code>
              <span className="contract-network">
                <div className="status-dot pulse-purple" />
                Testnet
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Timeline Step Component ────────────────────────────────────────────────

function TimelineStep({ label, status, icon }) {
  return (
    <div className={`timeline-step ${status}`}>
      <div className="timeline-dot">
        {status === "active" ? <Loader2 size={12} className="spin" /> : icon}
      </div>
      <span className="timeline-label">{label}</span>
    </div>
  );
}

// ─── Status Helper ──────────────────────────────────────────────────────────

function getStepStatus(step, currentStatus) {
  const order = ["building", "signing", "submitting", "confirming", "result"];
  const statusMap = {
    [TX_STATUS.BUILDING]: 0,
    [TX_STATUS.SIGNING]: 1,
    [TX_STATUS.SUBMITTING]: 2,
    [TX_STATUS.CONFIRMING]: 3,
    [TX_STATUS.SUCCESS]: 4,
    [TX_STATUS.FAILED]: 4,
  };
  const stepIndex = order.indexOf(step);
  const currentIndex = statusMap[currentStatus] ?? -1;

  if (stepIndex < currentIndex) return "completed";
  if (stepIndex === currentIndex) {
    if (step === "result") {
      if (currentStatus === TX_STATUS.SUCCESS) return "completed";
      if (currentStatus === TX_STATUS.FAILED) return "failed";
    }
    return "active";
  }
  return "pending";
}

export default App;

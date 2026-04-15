// ─── Network & Contract Constants ───────────────────────────────────────────
// Replace CONTRACT_ID with your deployed contract address after deployment.

export const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
export const HORIZON_URL = "https://horizon-testnet.stellar.org";
export const SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";

// ⚠️ Replace this with your actual deployed contract ID
export const CONTRACT_ID =
  "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2OOTH67I";

// ─── Wallet Types ───────────────────────────────────────────────────────────

export const WALLET_TYPES = {
  FREIGHTER: "freighter",
  XBULL: "xbull",
  MANUAL: "manual",
};

// ─── Error Types ────────────────────────────────────────────────────────────

export const ERROR_TYPES = {
  WALLET_NOT_FOUND: "WALLET_NOT_FOUND",
  TX_REJECTED: "TX_REJECTED",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  INVALID_ADDRESS: "INVALID_ADDRESS",
  CONTRACT_ERROR: "CONTRACT_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
};

export const ERROR_MESSAGES = {
  [ERROR_TYPES.WALLET_NOT_FOUND]:
    "No compatible wallet found. Please install Freighter or xBull browser extension.",
  [ERROR_TYPES.TX_REJECTED]:
    "Transaction was rejected. You declined the signing request in your wallet.",
  [ERROR_TYPES.INSUFFICIENT_BALANCE]:
    "Insufficient XLM balance to complete this transaction.",
  [ERROR_TYPES.INVALID_ADDRESS]:
    "Invalid Stellar address. Public keys must start with 'G' and be 56 characters.",
  [ERROR_TYPES.CONTRACT_ERROR]:
    "Smart contract call failed. The contract may not be deployed or is unreachable.",
  [ERROR_TYPES.NETWORK_ERROR]:
    "Network error. Unable to reach the Stellar testnet. Please try again.",
};

// ─── Transaction Statuses ───────────────────────────────────────────────────

export const TX_STATUS = {
  IDLE: "idle",
  BUILDING: "building",
  SIGNING: "signing",
  SUBMITTING: "submitting",
  CONFIRMING: "confirming",
  SUCCESS: "success",
  FAILED: "failed",
};

/**
 * StellarWalletsKit — Multi-wallet abstraction layer
 * Follows the StellarWalletsKit pattern: a unified API to connect, sign,
 * and interact with multiple Stellar wallet providers.
 *
 * Supported wallets:
 *   • Freighter  (@stellar/freighter-api)
 *   • xBull      (window.xBullSDK)
 */

import {
  isConnected as freighterIsConnected,
  isAllowed as freighterIsAllowed,
  requestAccess as freighterRequestAccess,
  getAddress as freighterGetAddress,
  signTransaction as freighterSignTransaction,
} from "@stellar/freighter-api";

import { WALLET_TYPES, ERROR_TYPES, NETWORK_PASSPHRASE } from "./constants";

// ─── Internal State ─────────────────────────────────────────────────────────

let _activeWallet = null; // 'freighter' | 'xbull' | null
let _address = null;

// ─── Wallet Detection ───────────────────────────────────────────────────────

/** Returns which wallets are available in the browser. */
export async function detectWallets() {
  const wallets = [];

  // Check Freighter
  try {
    const conn = await freighterIsConnected();
    if (conn && conn.isConnected) {
      wallets.push({
        id: WALLET_TYPES.FREIGHTER,
        name: "Freighter",
        icon: "🦊",
        available: true,
      });
    }
  } catch {
    // Freighter not installed
  }

  // Check xBull
  if (window.xBullSDK) {
    wallets.push({
      id: WALLET_TYPES.XBULL,
      name: "xBull Wallet",
      icon: "🐂",
      available: true,
    });
  }

  // Always show options even if not installed (for error handling demo)
  if (!wallets.find((w) => w.id === WALLET_TYPES.FREIGHTER)) {
    wallets.push({
      id: WALLET_TYPES.FREIGHTER,
      name: "Freighter",
      icon: "🦊",
      available: false,
    });
  }
  if (!wallets.find((w) => w.id === WALLET_TYPES.XBULL)) {
    wallets.push({
      id: WALLET_TYPES.XBULL,
      name: "xBull Wallet",
      icon: "🐂",
      available: false,
    });
  }

  return wallets;
}

// ─── Connect ────────────────────────────────────────────────────────────────

/** Connect to a specific wallet by type. Returns { address, walletType }. */
export async function connectWallet(walletType) {
  switch (walletType) {
    case WALLET_TYPES.FREIGHTER:
      return await connectFreighter();
    case WALLET_TYPES.XBULL:
      return await connectXBull();
    default:
      throw {
        type: ERROR_TYPES.WALLET_NOT_FOUND,
        message: "Unknown wallet type",
      };
  }
}

async function connectFreighter() {
  try {
    const conn = await freighterIsConnected();
    if (!conn || !conn.isConnected) {
      throw {
        type: ERROR_TYPES.WALLET_NOT_FOUND,
        message:
          "Freighter extension not detected. Please install it from freighter.app",
      };
    }

    const { address, error } = await freighterRequestAccess();
    if (error) {
      throw {
        type: ERROR_TYPES.TX_REJECTED,
        message: "Freighter access was denied by user.",
      };
    }

    _activeWallet = WALLET_TYPES.FREIGHTER;
    _address = address;
    return { address, walletType: WALLET_TYPES.FREIGHTER };
  } catch (e) {
    if (e.type) throw e;
    throw {
      type: ERROR_TYPES.WALLET_NOT_FOUND,
      message:
        "Failed to connect to Freighter. Is the extension installed and unlocked?",
    };
  }
}

async function connectXBull() {
  if (!window.xBullSDK) {
    throw {
      type: ERROR_TYPES.WALLET_NOT_FOUND,
      message:
        "xBull Wallet not detected. Please install it from xbull.app",
    };
  }

  try {
    const { publicKey } = await window.xBullSDK.connect();
    _activeWallet = WALLET_TYPES.XBULL;
    _address = publicKey;
    return { address: publicKey, walletType: WALLET_TYPES.XBULL };
  } catch (e) {
    throw {
      type: ERROR_TYPES.TX_REJECTED,
      message: "xBull connection request was rejected.",
    };
  }
}

// ─── Auto-Reconnect ────────────────────────────────────────────────────────

/** Try to reconnect to previously used wallet (Freighter only). */
export async function tryAutoConnect() {
  try {
    const conn = await freighterIsConnected();
    if (conn && conn.isConnected) {
      const allowed = await freighterIsAllowed();
      if (allowed && allowed.isAllowed) {
        const { address, error } = await freighterGetAddress();
        if (address && !error) {
          _activeWallet = WALLET_TYPES.FREIGHTER;
          _address = address;
          return { address, walletType: WALLET_TYPES.FREIGHTER };
        }
      }
    }
  } catch {
    // Silent fail — no wallet connected
  }
  return null;
}

// ─── Sign Transaction ───────────────────────────────────────────────────────

/** Sign a transaction XDR with the active wallet. */
export async function walletSignTransaction(txXdr, opts = {}) {
  const networkPassphrase = opts.networkPassphrase || NETWORK_PASSPHRASE;

  if (!_activeWallet) {
    throw {
      type: ERROR_TYPES.WALLET_NOT_FOUND,
      message: "No wallet connected. Please connect a wallet first.",
    };
  }

  switch (_activeWallet) {
    case WALLET_TYPES.FREIGHTER: {
      const { signedTxXdr, error } = await freighterSignTransaction(txXdr, {
        networkPassphrase,
      });
      if (error) {
        throw { type: ERROR_TYPES.TX_REJECTED, message: error };
      }
      return signedTxXdr;
    }

    case WALLET_TYPES.XBULL: {
      if (!window.xBullSDK) {
        throw {
          type: ERROR_TYPES.WALLET_NOT_FOUND,
          message: "xBull wallet disconnected.",
        };
      }
      try {
        const signedXdr = await window.xBullSDK.signXDR(txXdr, {
          networkPassphrase,
        });
        return signedXdr;
      } catch (e) {
        throw {
          type: ERROR_TYPES.TX_REJECTED,
          message: "Transaction signing rejected in xBull.",
        };
      }
    }

    default:
      throw {
        type: ERROR_TYPES.WALLET_NOT_FOUND,
        message: "Active wallet not supported for signing.",
      };
  }
}

// ─── Disconnect ─────────────────────────────────────────────────────────────

export function disconnectWallet() {
  _activeWallet = null;
  _address = null;
}

// ─── Getters ────────────────────────────────────────────────────────────────

export function getActiveWallet() {
  return _activeWallet;
}

export function getConnectedAddress() {
  return _address;
}

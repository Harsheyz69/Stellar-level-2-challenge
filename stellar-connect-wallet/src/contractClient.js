/* eslint-disable no-throw-literal, no-unused-vars */
/**
 * contractClient.js — Soroban Contract Interaction Layer
 *
 * Handles building, simulating, and submitting Soroban smart contract
 * invocations for the Payment Tracker contract on the Stellar Testnet.
 *
 * Also provides a local fallback mode when no contract is deployed.
 */

import {
  TransactionBuilder,
  Networks,
  Operation,
  Asset,
  Horizon,
  Address,
  Contract,
  nativeToScVal,
  scValToNative,
  xdr,
  rpc as SorobanRpc,
} from "@stellar/stellar-sdk";
import { walletSignTransaction } from "./walletKit";
import {
  CONTRACT_ID,
  HORIZON_URL,
  SOROBAN_RPC_URL,
  TX_STATUS,
  ERROR_TYPES,
  NETWORK_PASSPHRASE,
} from "./constants";

// ─── Servers ────────────────────────────────────────────────────────────────

const horizonServer = new Horizon.Server(HORIZON_URL);
let sorobanServer;
try {
  sorobanServer = new SorobanRpc.Server(SOROBAN_RPC_URL);
} catch (e) {
  console.warn("Soroban RPC server initialization failed:", e);
}

// ─── Local Payment Store (Fallback) ─────────────────────────────────────────
// Used when no contract is deployed — stores payments in memory for demo

let localPayments = [];
let localPaymentCount = 0;

function isContractDeployed() {
  return (
    CONTRACT_ID &&
    CONTRACT_ID !== "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2OOTH67I"
  );
}

// ─── Balance ────────────────────────────────────────────────────────────────

export async function fetchBalance(publicKey) {
  try {
    const account = await horizonServer.loadAccount(publicKey);
    const native = account.balances.find((b) => b.asset_type === "native");
    return native ? native.balance : "0";
  } catch (e) {
    console.error("Balance fetch error:", e);
    return "0 (Unfunded)";
  }
}

// ─── Address Validation ─────────────────────────────────────────────────────

export function isValidStellarAddress(address) {
  if (!address || typeof address !== "string") return false;
  if (!address.startsWith("G")) return false;
  if (address.length !== 56) return false;
  try {
    // Basic check — the SDK will validate the checksum on use
    return /^G[A-Z2-7]{55}$/.test(address);
  } catch {
    return false;
  }
}

// ─── Send XLM Payment ──────────────────────────────────────────────────────

/**
 * Send a native XLM payment. Returns { hash, status }.
 * @param {string} sourcePublicKey
 * @param {string} destination
 * @param {string} amount
 * @param {function} onStatusChange - callback (status) => void
 */
export async function sendPayment(
  sourcePublicKey,
  destination,
  amount,
  onStatusChange
) {
  onStatusChange(TX_STATUS.BUILDING);

  // Validate address
  if (!isValidStellarAddress(destination)) {
    throw { type: ERROR_TYPES.INVALID_ADDRESS };
  }

  // Check balance
  const currentBalance = await fetchBalance(sourcePublicKey);
  const numericBalance = parseFloat(currentBalance);
  const numericAmount = parseFloat(amount);
  if (isNaN(numericBalance) || numericAmount > numericBalance - 1) {
    // Keep 1 XLM for fees/reserve
    throw { type: ERROR_TYPES.INSUFFICIENT_BALANCE };
  }

  try {
    const sourceAccount = await horizonServer.loadAccount(sourcePublicKey);
    const fee = await horizonServer.fetchBaseFee();

    const tx = new TransactionBuilder(sourceAccount, {
      fee: String(fee),
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({
          destination,
          asset: Asset.native(),
          amount: String(amount),
        })
      )
      .setTimeout(180)
      .build();

    onStatusChange(TX_STATUS.SIGNING);
    const signedTxXdr = await walletSignTransaction(tx.toXDR());

    onStatusChange(TX_STATUS.SUBMITTING);
    const signedTx = TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET);
    const result = await horizonServer.submitTransaction(signedTx);

    onStatusChange(TX_STATUS.SUCCESS);
    return { hash: result.hash, status: TX_STATUS.SUCCESS };
  } catch (error) {
    // Re-throw typed errors
    if (error.type) throw error;

    let errorMsg = error?.message || "Transaction failed";
    if (error?.response?.data?.extras?.result_codes) {
      const rc = error.response.data.extras.result_codes;
      errorMsg = `Horizon: tx=${rc.transaction}, ops=${rc.operations?.join(",")}`;
    }

    // Detect rejected signing
    if (
      errorMsg.includes("User declined") ||
      errorMsg.includes("rejected") ||
      errorMsg.includes("cancelled")
    ) {
      throw { type: ERROR_TYPES.TX_REJECTED, message: errorMsg };
    }

    throw { type: ERROR_TYPES.NETWORK_ERROR, message: errorMsg };
  }
}

// ─── Record Payment on Contract ─────────────────────────────────────────────

/**
 * Record a payment on the Soroban contract.
 * Falls back to local store if contract isn't deployed.
 */
export async function recordPaymentOnContract(
  senderPublicKey,
  recipientAddress,
  amount,
  memo,
  onStatusChange
) {
  // Local fallback mode
  if (!isContractDeployed() || !sorobanServer) {
    onStatusChange(TX_STATUS.BUILDING);
    await sleep(400);
    onStatusChange(TX_STATUS.SUBMITTING);
    await sleep(600);

    localPaymentCount++;
    const record = {
      id: localPaymentCount,
      sender: senderPublicKey,
      recipient: recipientAddress,
      amount: parseFloat(amount),
      memo: memo || "Payment",
      timestamp: Math.floor(Date.now() / 1000),
      status: 1,
    };
    localPayments.push(record);

    onStatusChange(TX_STATUS.SUCCESS);
    return { paymentId: localPaymentCount, local: true };
  }

  // Real contract invocation
  try {
    onStatusChange(TX_STATUS.BUILDING);

    const contract = new Contract(CONTRACT_ID);
    const sourceAccount = await sorobanServer.getAccount(senderPublicKey);

    const tx = new TransactionBuilder(sourceAccount, {
      fee: "1000000",
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        contract.call(
          "record_payment",
          new Address(senderPublicKey).toScVal(),
          new Address(recipientAddress).toScVal(),
          nativeToScVal(Math.floor(parseFloat(amount) * 10000000), {
            type: "i128",
          }),
          nativeToScVal(memo || "Payment", { type: "string" })
        )
      )
      .setTimeout(180)
      .build();

    // Simulate
    const simulated = await sorobanServer.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(simulated)) {
      throw {
        type: ERROR_TYPES.CONTRACT_ERROR,
        message: `Simulation failed: ${simulated.error}`,
      };
    }

    const preparedTx = SorobanRpc.assembleTransaction(tx, simulated).build();

    onStatusChange(TX_STATUS.SIGNING);
    const signedXdr = await walletSignTransaction(preparedTx.toXDR());

    onStatusChange(TX_STATUS.SUBMITTING);
    const signedTx = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
    const sendResult = await sorobanServer.sendTransaction(signedTx);

    onStatusChange(TX_STATUS.CONFIRMING);

    // Poll for confirmation
    let getResult;
    let attempts = 0;
    while (attempts < 30) {
      getResult = await sorobanServer.getTransaction(sendResult.hash);
      if (getResult.status !== "NOT_FOUND") break;
      await sleep(1000);
      attempts++;
    }

    if (getResult.status === "SUCCESS") {
      const paymentId = scValToNative(getResult.returnValue);
      onStatusChange(TX_STATUS.SUCCESS);
      return { paymentId, hash: sendResult.hash, local: false };
    } else {
      throw {
        type: ERROR_TYPES.CONTRACT_ERROR,
        message: `Contract call status: ${getResult.status}`,
      };
    }
  } catch (error) {
    if (error.type) throw error;
    throw {
      type: ERROR_TYPES.CONTRACT_ERROR,
      message: error.message || "Contract invocation failed",
    };
  }
}

// ─── Read Contract Data ─────────────────────────────────────────────────────

export async function getPaymentCount() {
  if (!isContractDeployed() || !sorobanServer) {
    return localPaymentCount;
  }

  try {
    const contract = new Contract(CONTRACT_ID);
    const account = await sorobanServer.getAccount(
      "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
    ); // Dummy for simulation

    const tx = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(contract.call("get_payment_count"))
      .setTimeout(30)
      .build();

    const sim = await sorobanServer.simulateTransaction(tx);
    if (sim.result) {
      return scValToNative(sim.result.retval);
    }
    return 0;
  } catch {
    return localPaymentCount;
  }
}

export async function getPayments() {
  if (!isContractDeployed() || !sorobanServer) {
    return [...localPayments].reverse();
  }

  try {
    const count = await getPaymentCount();
    const payments = [];
    for (let i = count; i >= Math.max(1, count - 9); i--) {
      try {
        const contract = new Contract(CONTRACT_ID);
        const account = await sorobanServer.getAccount(
          "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
        );
        const tx = new TransactionBuilder(account, {
          fee: "100",
          networkPassphrase: Networks.TESTNET,
        })
          .addOperation(
            contract.call("get_payment", nativeToScVal(i, { type: "u64" }))
          )
          .setTimeout(30)
          .build();

        const sim = await sorobanServer.simulateTransaction(tx);
        if (sim.result) {
          payments.push(scValToNative(sim.result.retval));
        }
      } catch {
        // Skip missing payments
      }
    }
    return payments;
  } catch {
    return [...localPayments].reverse();
  }
}

// ─── Transaction History from Horizon ───────────────────────────────────────

export async function getTransactionHistory(publicKey, limit = 10) {
  try {
    const txs = await horizonServer
      .transactions()
      .forAccount(publicKey)
      .order("desc")
      .limit(limit)
      .call();

    return txs.records.map((tx) => ({
      hash: tx.hash,
      createdAt: tx.created_at,
      operationCount: tx.operation_count,
      successful: tx.successful,
      memo: tx.memo || "",
      feeCharged: tx.fee_charged,
      sourceAccount: tx.source_account,
    }));
  } catch {
    return [];
  }
}

// ─── Event Polling ──────────────────────────────────────────────────────────

/**
 * Poll Soroban RPC for contract events (real-time sync).
 * Returns recent events since `startLedger`.
 */
export async function pollContractEvents(startLedger) {
  if (!isContractDeployed() || !sorobanServer) return [];

  try {
    const events = await sorobanServer.getEvents({
      startLedger,
      filters: [
        {
          type: "contract",
          contractIds: [CONTRACT_ID],
        },
      ],
      limit: 20,
    });
    return events.events || [];
  } catch {
    return [];
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

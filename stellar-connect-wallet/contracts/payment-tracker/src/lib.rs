#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String, Symbol, Vec,
};

// ── Data types ──────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PaymentRecord {
    pub id: u64,
    pub sender: Address,
    pub recipient: Address,
    pub amount: i128,
    pub memo: String,
    pub timestamp: u64,
    pub status: u32, // 1 = completed
}

#[contracttype]
pub enum DataKey {
    PaymentCount,
    Payment(u64),
    SenderPayments(Address),
}

// ── Contract ────────────────────────────────────────────────────────────────

#[contract]
pub struct PaymentTracker;

#[contractimpl]
impl PaymentTracker {
    /// Record a new payment on-chain. Caller must authorize as `sender`.
    pub fn record_payment(
        env: Env,
        sender: Address,
        recipient: Address,
        amount: i128,
        memo: String,
    ) -> u64 {
        // Require the sender to have signed / authorized this call
        sender.require_auth();

        // Auto-increment payment ID
        let mut count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::PaymentCount)
            .unwrap_or(0);
        count += 1;

        // Build the record
        let record = PaymentRecord {
            id: count,
            sender: sender.clone(),
            recipient: recipient.clone(),
            amount,
            memo,
            timestamp: env.ledger().timestamp(),
            status: 1,
        };

        // Persist
        env.storage()
            .persistent()
            .set(&DataKey::Payment(count), &record);
        env.storage()
            .instance()
            .set(&DataKey::PaymentCount, &count);

        // Maintain sender → [payment_ids] index
        let mut sender_payments: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::SenderPayments(sender.clone()))
            .unwrap_or(Vec::new(&env));
        sender_payments.push_back(count);
        env.storage()
            .persistent()
            .set(&DataKey::SenderPayments(sender.clone()), &sender_payments);

        // Emit event for real-time listeners
        env.events().publish(
            (symbol_short!("pay_rec"), sender),
            (count, recipient, amount),
        );

        count
    }

    /// Read a single payment by ID.
    pub fn get_payment(env: Env, payment_id: u64) -> PaymentRecord {
        env.storage()
            .persistent()
            .get(&DataKey::Payment(payment_id))
            .expect("Payment not found")
    }

    /// Return the total number of payments recorded.
    pub fn get_payment_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::PaymentCount)
            .unwrap_or(0)
    }

    /// Return all payment IDs for a given sender.
    pub fn get_payments_by_sender(env: Env, sender: Address) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::SenderPayments(sender))
            .unwrap_or(Vec::new(&env))
    }
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env, String};

    #[test]
    fn test_record_and_get_payment() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(PaymentTracker, ());
        let client = PaymentTrackerClient::new(&env, &contract_id);

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let memo = String::from_str(&env, "Test payment");

        // Record a payment
        let id = client.record_payment(&sender, &recipient, &1_000_000_i128, &memo);
        assert_eq!(id, 1);

        // Verify count
        assert_eq!(client.get_payment_count(), 1);

        // Read it back
        let record = client.get_payment(&1u64);
        assert_eq!(record.sender, sender);
        assert_eq!(record.recipient, recipient);
        assert_eq!(record.amount, 1_000_000);
        assert_eq!(record.status, 1);

        // Verify sender index
        let sender_payments = client.get_payments_by_sender(&sender);
        assert_eq!(sender_payments.len(), 1);
        assert_eq!(sender_payments.get(0).unwrap(), 1);
    }

    #[test]
    fn test_multiple_payments() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(PaymentTracker, ());
        let client = PaymentTrackerClient::new(&env, &contract_id);

        let sender = Address::generate(&env);
        let r1 = Address::generate(&env);
        let r2 = Address::generate(&env);

        client.record_payment(&sender, &r1, &500_i128, &String::from_str(&env, "First"));
        client.record_payment(&sender, &r2, &750_i128, &String::from_str(&env, "Second"));

        assert_eq!(client.get_payment_count(), 2);
        assert_eq!(client.get_payments_by_sender(&sender).len(), 2);
    }
}

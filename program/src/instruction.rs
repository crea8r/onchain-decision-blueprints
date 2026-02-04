use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub enum BlueprintInstruction {
    /// Create a new blueprint account.
    /// Accounts:
    /// 0. [signer] authority
    /// 1. [writable] blueprint (PDA)
    /// 2. [] system_program
    InitializeBlueprint {
        /// List of approver pubkeys.
        approvers: Vec<Pubkey>,
        /// Required approvals to execute.
        threshold: u8,
    },

    /// Create a proposal under a blueprint.
    /// Accounts:
    /// 0. [signer] proposer
    /// 1. [] blueprint
    /// 2. [writable] proposal (PDA)
    /// 3. [] system_program
    ProposeAction {
        /// Arbitrary action type discriminator (for UI / allowlists later).
        action_type: u16,
        /// Hash of off-chain payload / intended transaction.
        payload_hash: [u8; 32],
    },

    /// Approve an existing proposal.
    /// Accounts:
    /// 0. [signer] approver
    /// 1. [] blueprint
    /// 2. [writable] proposal
    ApproveAction,

    /// Mark proposal executed once approvals are satisfied.
    /// Accounts:
    /// 0. [signer] executor
    /// 1. [] blueprint
    /// 2. [writable] proposal
    ExecuteAction,
}

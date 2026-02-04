use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct Blueprint {
    pub authority: Pubkey,
    pub approvers: Vec<Pubkey>,
    pub threshold: u8,
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct Proposal {
    pub blueprint: Pubkey,
    pub proposer: Pubkey,
    pub action_type: u16,
    pub payload_hash: [u8; 32],
    pub approvals: Vec<Pubkey>,
    pub executed: bool,
}

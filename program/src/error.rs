use solana_program::program_error::ProgramError;
use thiserror::Error;

#[derive(Error, Debug, Copy, Clone)]
pub enum BlueprintError {
    #[error("Invalid instruction")]
    InvalidInstruction,

    #[error("Unauthorized")]
    Unauthorized,

    #[error("Already approved")]
    AlreadyApproved,

    #[error("Not enough approvals")]
    NotEnoughApprovals,

    #[error("Proposal already executed")]
    AlreadyExecuted,
}

impl From<BlueprintError> for ProgramError {
    fn from(e: BlueprintError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

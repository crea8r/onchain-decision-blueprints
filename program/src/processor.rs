use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::{invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
    system_instruction,
    sysvar::{rent::Rent, Sysvar},
};

use crate::{
    error::BlueprintError,
    instruction::BlueprintInstruction,
    state::{Blueprint, Proposal},
};

pub struct Processor;

impl Processor {
    pub fn process(program_id: &Pubkey, accounts: &[AccountInfo], input: &[u8]) -> ProgramResult {
        let ix = BlueprintInstruction::try_from_slice(input)
            .map_err(|_| BlueprintError::InvalidInstruction)?;

        match ix {
            BlueprintInstruction::InitializeBlueprint { approvers, threshold } => {
                Self::process_initialize_blueprint(program_id, accounts, approvers, threshold)
            }
            BlueprintInstruction::ProposeAction { action_type, payload_hash } => {
                Self::process_propose(program_id, accounts, action_type, payload_hash)
            }
            BlueprintInstruction::ApproveAction => Self::process_approve(program_id, accounts),
            BlueprintInstruction::ExecuteAction => Self::process_execute(program_id, accounts),
        }
    }

    fn process_initialize_blueprint(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        approvers: Vec<Pubkey>,
        threshold: u8,
    ) -> ProgramResult {
        let acc_iter = &mut accounts.iter();
        let authority = next_account_info(acc_iter)?;
        let blueprint_ai = next_account_info(acc_iter)?;
        let system_program = next_account_info(acc_iter)?;

        if !authority.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }
        if threshold == 0 || threshold as usize > approvers.len() {
            return Err(ProgramError::InvalidArgument);
        }

        // Create blueprint PDA account (seed: ["blueprint", authority])
        let (pda, bump) = Pubkey::find_program_address(
            &[b"blueprint", authority.key.as_ref()],
            program_id,
        );
        if pda != *blueprint_ai.key {
            return Err(ProgramError::InvalidSeeds);
        }

        let blueprint = Blueprint {
            authority: *authority.key,
            approvers,
            threshold,
        };
        let data = blueprint.try_to_vec()?;
        let rent = Rent::get()?;
        let lamports = rent.minimum_balance(data.len());

        invoke_signed(
            &system_instruction::create_account(
                authority.key,
                blueprint_ai.key,
                lamports,
                data.len() as u64,
                program_id,
            ),
            &[authority.clone(), blueprint_ai.clone(), system_program.clone()],
            &[&[b"blueprint", authority.key.as_ref(), &[bump]]],
        )?;

        blueprint_ai.data.borrow_mut()[..data.len()].copy_from_slice(&data);
        msg!("Blueprint initialized");
        Ok(())
    }

    fn process_propose(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        action_type: u16,
        payload_hash: [u8; 32],
    ) -> ProgramResult {
        let acc_iter = &mut accounts.iter();
        let proposer = next_account_info(acc_iter)?;
        let blueprint_ai = next_account_info(acc_iter)?;
        let proposal_ai = next_account_info(acc_iter)?;
        let system_program = next_account_info(acc_iter)?;

        if !proposer.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        let blueprint = Blueprint::try_from_slice(&blueprint_ai.data.borrow())?;

        // Create proposal PDA (seed: ["proposal", blueprint, payload_hash])
        let (pda, bump) = Pubkey::find_program_address(
            &[b"proposal", blueprint_ai.key.as_ref(), &payload_hash],
            program_id,
        );
        if pda != *proposal_ai.key {
            return Err(ProgramError::InvalidSeeds);
        }

        let proposal = Proposal {
            blueprint: *blueprint_ai.key,
            proposer: *proposer.key,
            action_type,
            payload_hash,
            approvals: vec![],
            executed: false,
        };
        let data = proposal.try_to_vec()?;
        let rent = Rent::get()?;
        let lamports = rent.minimum_balance(data.len());

        invoke_signed(
            &system_instruction::create_account(
                proposer.key,
                proposal_ai.key,
                lamports,
                data.len() as u64,
                program_id,
            ),
            &[proposer.clone(), proposal_ai.clone(), system_program.clone()],
            &[&[b"proposal", blueprint_ai.key.as_ref(), &payload_hash, &[bump]]],
        )?;

        proposal_ai.data.borrow_mut()[..data.len()].copy_from_slice(&data);
        msg!("Proposal created: action_type={} threshold={}", action_type, blueprint.threshold);
        Ok(())
    }

    fn process_approve(_program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        let acc_iter = &mut accounts.iter();
        let approver = next_account_info(acc_iter)?;
        let blueprint_ai = next_account_info(acc_iter)?;
        let proposal_ai = next_account_info(acc_iter)?;

        if !approver.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        let blueprint = Blueprint::try_from_slice(&blueprint_ai.data.borrow())?;
        let mut proposal = Proposal::try_from_slice(&proposal_ai.data.borrow())?;

        if proposal.executed {
            return Err(BlueprintError::AlreadyExecuted.into());
        }

        // Ensure approver is in approvers list
        if !blueprint.approvers.iter().any(|k| k == approver.key) {
            return Err(BlueprintError::Unauthorized.into());
        }

        // Ensure not already approved
        if proposal.approvals.iter().any(|k| k == approver.key) {
            return Err(BlueprintError::AlreadyApproved.into());
        }

        proposal.approvals.push(*approver.key);
        let data = proposal.try_to_vec()?;
        proposal_ai.data.borrow_mut()[..data.len()].copy_from_slice(&data);
        msg!("Approved: {}/{}", proposal.approvals.len(), blueprint.threshold);
        Ok(())
    }

    fn process_execute(_program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        let acc_iter = &mut accounts.iter();
        let executor = next_account_info(acc_iter)?;
        let blueprint_ai = next_account_info(acc_iter)?;
        let proposal_ai = next_account_info(acc_iter)?;

        if !executor.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        let blueprint = Blueprint::try_from_slice(&blueprint_ai.data.borrow())?;
        let mut proposal = Proposal::try_from_slice(&proposal_ai.data.borrow())?;

        if proposal.executed {
            return Err(BlueprintError::AlreadyExecuted.into());
        }

        if proposal.approvals.len() < blueprint.threshold as usize {
            return Err(BlueprintError::NotEnoughApprovals.into());
        }

        proposal.executed = true;
        let data = proposal.try_to_vec()?;
        proposal_ai.data.borrow_mut()[..data.len()].copy_from_slice(&data);

        msg!("Executed proposal for action_type={} payload_hash={:?}", proposal.action_type, proposal.payload_hash);
        Ok(())
    }
}

use crate::{
    error::ErrorCode,
    state::{GatingConfig, MarketState, SellingResourceState},
    utils::*,
    Buy,
};
use anchor_lang::prelude::*;
use anchor_lang::{
    solana_program::{program::invoke, program_pack::Pack},
    system_program::System,
};
use anchor_spl::token;
use mpl_token_metadata::{state::Metadata, utils::get_supply_off_master_edition};

impl<'info> Buy<'info> {
    pub fn process(
        &mut self,
        _trade_history_bump: u8,
        vault_owner_bump: u8,
        remaining_accounts: &[AccountInfo<'info>],
    ) -> Result<()> {
        let market = &mut self.market;
        let admin = &mut self.admin;
        let owner = &self.owner;
        let selling_resource = &mut self.selling_resource;
        let buyer_wallet = &mut self.buyer_wallet;
        let trade_history = &mut self.trade_history;
        let buyer_receiver_token_account = &mut self.buyer_receiver_token_account;
        let vault_token_account = &mut self.vault_token_account;
        let buyer_exchange_token_account = &mut self.buyer_exchange_token_account;
        let buyer_resource_mint = &self.buyer_resource_mint;
        
        let vault = &mut self.vault;
        let clock = &self.clock;
        let token_program = &self.token_program;

        // Check, that `Market` is not in `Suspended` state
        if market.state == MarketState::Suspended {
            return Err(ErrorCode::MarketIsSuspended.into());
        }

        // Check, that `Market` is started
        if market.start_date > clock.unix_timestamp as u64 {
            return Err(ErrorCode::MarketIsNotStarted.into());
        }

        // Check, that `Market` is ended
        if let Some(end_date) = market.end_date {
            if clock.unix_timestamp as u64 > end_date {
                return Err(ErrorCode::MarketIsEnded.into());
            }
        } else if market.state == MarketState::Ended {
            return Err(ErrorCode::MarketIsEnded.into());
        }

        if trade_history.market != market.key() {
            trade_history.market = market.key();
        }

        if trade_history.wallet != buyer_wallet.key() {
            trade_history.wallet = buyer_wallet.key();
        }

        // Check, that user not reach buy limit
        if let Some(pieces_in_one_wallet) = market.pieces_in_one_wallet {
            if trade_history.already_bought == pieces_in_one_wallet {
                return Err(ErrorCode::UserReachBuyLimit.into());
            }
        }

        if market.state != MarketState::Active {
            market.state = MarketState::Active;
        }

        /**
         * Check the valid tokens for swap
         */
        
         /**
          * Swap
          * 1. transfer assets from vault to destination token account
          * 2. transfer assets from payer to market vault 
          */

        let authority_seeds =  &[
            VAULT_OWNER_PREFIX.as_bytes(),
            selling_resource.resource.as_ref(),
            selling_resource.store.as_ref(),
            &[vault_owner_bump],
        ];

        let signer = &[&authority_seeds[..]];

        // let cpi_program = token_program.to_account_info();
        // let cpi_accounts = token::Transfer {
        //     from: vault.to_account_info().clone(),
        //     to: buyer_receiver_token_account.to_account_info().clone(),
        //     authority: owner.to_account_info().clone(),
        // };
        // let cpi_ctx = CpiContext::new(cpi_program.clone(), cpi_accounts);
        // // wtf is this syntax &[&authority_seeds[..]]
        // token::transfer(cpi_ctx.with_signer(&[&authority_seeds[..]]), 1)?;

        let cpi_ctx = CpiContext::new_with_signer(
            token_program.to_account_info(),
            token::Transfer {
                from: vault.to_account_info(),
                to: buyer_receiver_token_account.to_account_info().clone(),
                authority: owner.to_account_info()
            },
            signer
        );

        token::transfer(cpi_ctx, 1)?;

        // let cpi_program = token_program.to_account_info();
        // let cpi_accounts = token::Transfer {
        //     from: vault.to_account_info(),
        //     to: buyer_receiver_token_account.to_account_info(),
        //     authority: owner.to_account_info(),
        // };
        // let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        // token::transfer(cpi_ctx, 1)?;

        // let (vault_owner, bump_seed) = Pubkey::find_program_address(
        //     &[
        //         VAULT_OWNER_PREFIX.as_bytes(),
        //         selling_resource.resource.as_ref(),
        //         selling_resource.store.as_ref(),
        //     ],
        //     &mpl_token_metadata::id(),
        // );

        // transfer assets from user_account to vault account
        // let cpi_program = token_program.to_account_info();
        // let cpi_accounts = token::Transfer {
        //     from: buyer_exchange_token_account.to_account_info(),
        //     to: vault_token_account.to_account_info(),
        //     authority: buyer_wallet.to_account_info(),
        // };
        // let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        // token::transfer(cpi_ctx, 1)?;

        trade_history.already_bought = trade_history
            .already_bought
            .checked_add(1)
            .ok_or(ErrorCode::MathOverflow)?;

        selling_resource.supply = selling_resource
            .supply
            .checked_add(1)
            .ok_or(ErrorCode::MathOverflow)?;

        // Check, that `SellingResource::max_supply` is not overflowed by `supply`
        // if let Some(max_supply) = selling_resource.max_supply {
        //     if selling_resource.supply > max_supply {
        //         return Err(ErrorCode::SupplyIsGtThanMaxSupply.into());
        //     } else if selling_resource.supply == max_supply {
        //         selling_resource.state = SellingResourceState::Exhausted;
        //         market.state = MarketState::Ended;
        //     }
        // }
        
        market.state = MarketState::Ended;

        Ok(())
    }

    fn verify_gating_token(
        gate: &Option<GatingConfig>,
        buyer_wallet: &AccountInfo<'info>,
        remaining_accounts: &[AccountInfo<'info>],
        current_time: u64,
    ) -> Result<()> {
        if let Some(gatekeeper) = gate {
            if let Some(gating_time) = gatekeeper.gating_time {
                if current_time > gating_time {
                    return Ok(());
                }
            }

            let user_token_acc;
            let token_acc_mint;

            if remaining_accounts.len() == 2 {
                user_token_acc = &remaining_accounts[0];
                token_acc_mint = &remaining_accounts[1];

                Self::verify_spl_gating_token(
                    user_token_acc,
                    &buyer_wallet.key(),
                    &gatekeeper.collection,
                )?;
            } else if remaining_accounts.len() == 3 {
                user_token_acc = &remaining_accounts[0];
                token_acc_mint = &remaining_accounts[1];

                let metadata = &remaining_accounts[2];

                Self::verify_collection_gating_token(
                    user_token_acc,
                    metadata,
                    &buyer_wallet.key(),
                    &gatekeeper.collection,
                )?;
            } else {
                return Err(ErrorCode::GatingTokenMissing.into());
            }

            if gatekeeper.expire_on_use {
                invoke(
                    &spl_token::instruction::burn(
                        &spl_token::id(),
                        &user_token_acc.key(),
                        &token_acc_mint.key(),
                        &buyer_wallet.key(),
                        &[&buyer_wallet.key()],
                        1,
                    )?,
                    &[
                        user_token_acc.clone(),
                        token_acc_mint.clone(),
                        buyer_wallet.clone(),
                    ],
                )?;
            }

            Ok(())
        } else {
            Ok(())
        }
    }

    fn verify_spl_gating_token(
        user_token_acc: &AccountInfo,
        buyer_wallet: &Pubkey,
        collection: &Pubkey,
    ) -> Result<()> {
        if user_token_acc.owner != &spl_token::id() {
            return Err(ErrorCode::InvalidOwnerForGatingToken.into());
        }

        let user_token_acc_data = spl_token::state::Account::unpack_from_slice(
            user_token_acc.try_borrow_data()?.as_ref(),
        )?;

        if user_token_acc_data.owner != *buyer_wallet {
            return Err(ErrorCode::WrongOwnerInTokenGatingAcc.into());
        }

        if user_token_acc_data.mint != *collection {
            return Err(ErrorCode::WrongGatingToken.into());
        }

        Ok(())
    }

    fn verify_collection_gating_token(
        user_token_acc: &AccountInfo,
        metadata: &AccountInfo,
        buyer_wallet: &Pubkey,
        collection_key: &Pubkey,
    ) -> Result<()> {
        if user_token_acc.owner != &spl_token::id() {
            return Err(ErrorCode::InvalidOwnerForGatingToken.into());
        }
        let user_token_acc_data = spl_token::state::Account::unpack_from_slice(
            user_token_acc.try_borrow_data()?.as_ref(),
        )?;

        let metadata_data = Metadata::from_account_info(metadata)?;

        let token_metadata_program_key = mpl_token_metadata::id();
        let metadata_seeds = &[
            mpl_token_metadata::state::PREFIX.as_bytes(),
            token_metadata_program_key.as_ref(),
            user_token_acc_data.mint.as_ref(),
        ];
        let (metadata_key, _metadata_bump_seed) =
            Pubkey::find_program_address(metadata_seeds, &mpl_token_metadata::id());

        if metadata.key() != metadata_key {
            return Err(ErrorCode::WrongGatingMetadataAccount.into());
        }

        if user_token_acc_data.owner != *buyer_wallet {
            return Err(ErrorCode::WrongOwnerInTokenGatingAcc.into());
        }

        if let Some(collection) = metadata_data.collection {
            if !collection.verified {
                return Err(ErrorCode::WrongGatingMetadataAccount.into());
            }
            if collection.key != *collection_key {
                return Err(ErrorCode::WrongGatingMetadataAccount.into());
            }
        } else {
            return Err(ErrorCode::WrongGatingMetadataAccount.into());
        }

        Ok(())
    }
}

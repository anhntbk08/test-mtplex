import * as anchor from "@project-serum/anchor";
import { Program, Wallet } from "@project-serum/anchor";
import { MplStoneage } from "../target/types/mpl_stoneage";
import {
    TOKEN_PROGRAM_ID,
    AccountLayout,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    createAssociatedTokenAccount,
    MINT_SIZE,
    createInitializeAccountInstruction,
    createInitializeMintInstruction
} from '@solana/spl-token'
import * as splToken from "@solana/spl-token";
const { SystemProgram, } = anchor.web3;
import { Keypair, PublicKey } from "@solana/web3.js";
import * as web3 from "@solana/web3.js";
import { Connection, Transaction } from '@solana/web3.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey(
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

const createTokenAccount = async ({
    payer,
    mint,
    connection,
    owner,
}) => {
    try {
        const tokenAccount = Keypair.generate();
        const createTokenTx = new Transaction();
        const accountRentExempt = await connection.getMinimumBalanceForRentExemption(AccountLayout.span);
        createTokenTx.add(
            SystemProgram.createAccount({
                fromPubkey: payer,
                newAccountPubkey: tokenAccount.publicKey,
                lamports: accountRentExempt,
                space: AccountLayout.span,
                // programId: TOKEN_PROGRAM_ID,
                programId: new anchor.web3.PublicKey(TOKEN_PROGRAM_ID),
            }),
        );

        createTokenTx.add(
            createInitializeAccountInstruction(tokenAccount.publicKey, mint, owner),
        );

        createTokenTx.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
        createTokenTx.feePayer = payer;
        createTokenTx.partialSign(tokenAccount);

        return {
            tokenAccount,
            createTokenTx,
        };
    } catch (error) {
        throw error;
    }
};

describe('stoneage-createmarket-buy', () => {
    const provider = anchor.AnchorProvider.env();
    const wallet = provider.wallet as Wallet;
    console.log(wallet.publicKey.toBase58())
    anchor.setProvider(provider);

    // console.log("anchor.workspace.MplStoneage ", anchor.workspace.MplStoneage);
    const program = anchor.workspace.MplStoneage as Program<MplStoneage>
    let storeGKey: anchor.web3.Keypair;

    const findTreasuryOwnerAddress = async (
        treasury_mint_keypair: anchor.web3.PublicKey,
        selling_resource_keypair: anchor.web3.PublicKey,
    ): Promise<[anchor.web3.PublicKey, number]> => {
        return (
            await anchor.web3.PublicKey.findProgramAddress(
                [
                    anchor.utils.bytes.utf8.encode("holder"),
                    treasury_mint_keypair.toBuffer(),
                    selling_resource_keypair.toBuffer(),
                ],
                program.programId
            )
        );
    };

    const getMetadata = async (
        mint: anchor.web3.PublicKey
    ): Promise<anchor.web3.PublicKey> => {
        return (
            await anchor.web3.PublicKey.findProgramAddress(
                [
                    anchor.utils.bytes.utf8.encode("metadata"),
                    TOKEN_METADATA_PROGRAM_ID.toBuffer(),
                    mint.toBuffer(),
                ],
                TOKEN_METADATA_PROGRAM_ID
            )
        )[0];
    };

    const getMasterEdition = async (
        mint: anchor.web3.PublicKey
    ): Promise<[anchor.web3.PublicKey, number]> => {
        return (
            await anchor.web3.PublicKey.findProgramAddress(
                [
                    anchor.utils.bytes.utf8.encode("metadata"),
                    TOKEN_METADATA_PROGRAM_ID.toBuffer(),
                    mint.toBuffer(),
                    anchor.utils.bytes.utf8.encode("edition"),
                ],
                TOKEN_METADATA_PROGRAM_ID
            )
        );
    };

    it("Create store!", async () => {
        // metaplex address on devnet
        const storeKey: anchor.web3.Keypair = anchor.web3.Keypair.generate();
        const adminKey: anchor.web3.Keypair = anchor.web3.Keypair.generate();
        storeGKey = storeKey;
        console.log("wallet.publicKey ", wallet.publicKey.toString());
        console.log("storeKey.publicKey ", storeKey.publicKey.toString());
        console.log("storeKey: ", storeKey.publicKey.toBase58());

        await provider.connection.confirmTransaction(
            await provider.connection.requestAirdrop(adminKey.publicKey, 10000000000),
            "confirmed"
        );

        await program.rpc.createStore("store_1", "test store", {
            accounts: {
                admin: wallet.publicKey,
                store: storeKey.publicKey,
                systemProgram: SystemProgram.programId,
            },
            signers: [storeKey],
        });

        // get store info to double check
        const storeData = await program.account.store.fetch(storeKey.publicKey);
        console.log("storeData ", storeData);
    });

    /**
     *
     *  wallet.publicKey  7DvRvZGR19SUrsYnA47aeBTKMCUkdij2jA9uk6aXn6L7
        storeKey.publicKey  Dwg32oqhikCwZzViywapdwMXTthZr6LTA9XJekRrgWdo
        storeKey:  Dwg32oqhikCwZzViywapdwMXTthZr6LTA9XJekRrgWdo
     */
    it("Initselling resource + create Market!", async () => {
        // await provider.connection.confirmTransaction(
        //     await provider.connection.requestAirdrop(wallet.publicKey, 10000000000),
        //     "confirmed"
        // );
        // metaplex address on devnet
        const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey(
            "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
        );
        const lamports: number = await program.provider.connection.getMinimumBalanceForRentExemption(MINT_SIZE);

        // shitty code
        const storeData = new PublicKey("G6NL2KSQwYEK9p6BWbwerXHYbwUnHVFQPZLcYP7z4nHb");
        let storeKey = new PublicKey("G6NL2KSQwYEK9p6BWbwerXHYbwUnHVFQPZLcYP7z4nHb");

        console.log("storeData ", storeData);

        const NFTOne = require("./minted_nfts/nft_6.json");
        const exchangeTo = require("./minted_nfts/nft_8.json");
        const mintPubkey = new PublicKey(NFTOne.mint_key);
        
        const exchangeMintPubkey = new PublicKey(exchangeTo.mint_key);
        const exchangeResourceToken = new PublicKey(exchangeTo.nft_account);

        const resourceToken = new PublicKey(NFTOne.nft_account);
        const sellingResourceKeypair: anchor.web3.Keypair = anchor.web3.Keypair.generate();

        console.log("wallet.publicKey ", wallet.publicKey)
        console.log("storeKey.publicKey ", storeKey)

        const getVault = async (
            mint: anchor.web3.PublicKey,
            store: anchor.web3.PublicKey,
        ): Promise<[anchor.web3.PublicKey, number]> => {
            return (
                await anchor.web3.PublicKey.findProgramAddress(
                    [
                        anchor.utils.bytes.utf8.encode("mt_vault"),
                        mint.toBuffer(),
                        store.toBuffer(),
                    ],
                    program.programId
                )
            );
        };

        console.log("program.programId ", program.programId.toBase58())
        const getHistory = async (
            payer: anchor.web3.PublicKey,
            market: anchor.web3.PublicKey,
        ): Promise<[anchor.web3.PublicKey, number]> => {
            return (
                await anchor.web3.PublicKey.findProgramAddress(
                    [
                        anchor.utils.bytes.utf8.encode("history"),
                        payer.toBuffer(),
                        market.toBuffer(),
                    ],
                    program.programId
                )
            );
        };

        const [masterEdition, master_edition_bump] = await getMasterEdition(mintPubkey);
        await delay(1000);
        /**
         * create an token account and assign the owner to vaultOwner, vaultOwnerBump
         */
        console.log("storeKey ", storeKey.toBase58());
        const [vaultOwner, vaultOwnerBump] = await getVault(mintPubkey, storeKey);
        console.log(vaultOwner.toBase58());
        await delay(1000);
        const metadataAddress = await getMetadata(mintPubkey);

        try {
            const { tokenAccount: vault, createTokenTx } = await createTokenAccount({
                payer: wallet.publicKey,
                mint: mintPubkey,
                connection: program.provider.connection,
                owner: vaultOwner,
            });
            await delay(1000);
            let res = await program.provider.sendAndConfirm(createTokenTx, [vault]);
            console.log("create token response ", res);
            console.log(vault.publicKey.toBase58())
            console.log(
                await program.provider.connection.getParsedAccountInfo(vault.publicKey)
            );
            await delay(1000);
            let tx = await program.rpc.initSellingResource(master_edition_bump,
                vaultOwnerBump,
                {
                    accounts: {
                        admin: wallet.publicKey,
                        store: storeData,
                        sellingResource: sellingResourceKeypair.publicKey,
                        sellingResourceOwner: wallet.publicKey,
                        resourceMint: mintPubkey,
                        masterEdition,
                        metadata: metadataAddress,
                        vault: vault.publicKey,
                        owner: vaultOwner,
                        resourceToken: resourceToken,
                        tokenProgram: TOKEN_PROGRAM_ID,
                        systemProgram: SystemProgram.programId,
                        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                    },
                    signers: [sellingResourceKeypair],
                }
            );

            // console.log(tx);
            const resourceData = await program.account.sellingResource.fetch(sellingResourceKeypair.publicKey);
            console.log("sellingResourceKeypair ", resourceData);

            // create_market
            const marketKeyPair = Keypair.generate();

            // for storing market fee
            const treasureMint = Keypair.generate();

            let [treasury_owner, treasury_owner_bump] = await findTreasuryOwnerAddress(
                treasureMint.publicKey,
                sellingResourceKeypair.publicKey
            );
            await delay(1000);
            const initTreasureTx = new anchor.web3.Transaction().add(
                anchor.web3.SystemProgram.createAccount({
                    fromPubkey: wallet.publicKey,
                    newAccountPubkey: treasureMint.publicKey,
                    space: MINT_SIZE,
                    programId: TOKEN_PROGRAM_ID,
                    lamports,
                }),
                createInitializeMintInstruction(
                    treasureMint.publicKey,
                    0,
                    wallet.publicKey,
                    wallet.publicKey
                ),

            );

            await program.provider.sendAndConfirm(initTreasureTx, [treasureMint]);
            await delay(1000);
            const { tokenAccount: treasureHolder, createTokenTx: initTreasureHolderTx } = await createTokenAccount({
                payer: wallet.publicKey,
                mint: treasureMint.publicKey,
                connection: program.provider.connection,
                owner: treasury_owner,
            });

            await program.provider.sendAndConfirm(initTreasureHolderTx, [treasureHolder]);
            const startDate = Math.round(Date.now() / 1000) + 10;
            const endDate =  startDate + 5 * 20;
            /**
             * treasury_owner_bump: u8,
             * name: String,
             * description: String,
             * mutable: bool,
             * allowed_tokens: Vec<Pubkey>,
             * pieces_in_one_wallet: Option<u64>,
             * start_date: u64,
             * end_date: Option<u64>,
             * gating_config: Option<GatingConfig>
             */
            const { tokenAccount: vaultReceiver, createTokenTx: creatExchangeTokeAccTx } = await createTokenAccount({
                payer: wallet.publicKey,
                mint: exchangeMintPubkey,
                connection: program.provider.connection,
                owner: vaultOwner,
            });

            res = await program.provider.sendAndConfirm(creatExchangeTokeAccTx, [vaultReceiver]);
            console.log("create token response ", res);
            console.log(vaultReceiver.publicKey.toBase58())

            let response = await program.rpc.createMarket(
                treasury_owner_bump,
                "Dep trai co gi sai",
                "Dep trai co gi sai",
                true,
                [exchangeMintPubkey],
                [vaultReceiver.publicKey],
                new anchor.BN(1),
                new anchor.BN(startDate),
                new anchor.BN(endDate),
                null,
                {
                    accounts: {
                        market: marketKeyPair.publicKey,
                        store: storeData,
                        sellingResourceOwner: wallet.publicKey,
                        sellingResource: sellingResourceKeypair.publicKey,
                        mint: treasureMint.publicKey,
                        treasuryHolder: treasureHolder.publicKey,
                        owner: treasury_owner,
                        systemProgram: SystemProgram.programId,
                    },
                    instructions: [
                        await program.account.market.createInstruction(
                            marketKeyPair,
                            500
                        ),
                      ],
                    signers: [marketKeyPair, wallet.payer],
                }
            );
            console.log(response);
            const marketData = await program.account.market.fetch(marketKeyPair.publicKey);
            console.log("marketData ", marketData);
            
            // buy
            let buyer = anchor.web3.Keypair.generate();
            await provider.connection.confirmTransaction(
                await provider.connection.requestAirdrop(buyer.publicKey, 10000000000),
                "confirmed"
            );
            
            let [trade_history, trade_history_bump] = await getHistory(buyer.publicKey, marketKeyPair.publicKey);
            
            // account for storing swapped token
            let user_token_account = anchor.web3.Keypair.generate();
            // let buyerReceiverTokenAccount = anchor.web3.Keypair.generate();
            
            // TODO init token account for receiver token
            const { tokenAccount: buyerReceiverTokenAccount, createTokenTx: createBuyerReceiverTx } = await createTokenAccount({
                payer: wallet.publicKey,
                mint: exchangeMintPubkey,
                connection: program.provider.connection,
                owner: wallet.publicKey,
            });
            await delay(1000);
            res = await program.provider.sendAndConfirm(createBuyerReceiverTx, [buyerReceiverTokenAccount]);

            console.log("res ", res);
            console.log("vault.publicKey ", vault.publicKey.toBase58());
            console.log("vaultOwner.publicKey ", vaultOwner.toBase58());
            console.log("buyerReceiverTokenAccount ", buyerReceiverTokenAccount.publicKey.toBase58());

            let buyResponse = await program.rpc.buy(trade_history_bump,
                vaultOwnerBump,
                {
                    accounts: {
                        market: marketKeyPair.publicKey,
                        sellingResource: sellingResourceKeypair.publicKey,
                        buyerWallet: wallet.publicKey,
                        buyerExchangeTokenAccount: exchangeResourceToken,
                        buyerResourceMint: exchangeMintPubkey,
                        buyerReceiverTokenAccount: buyerReceiverTokenAccount.publicKey,
                        vaultTokenAccount: vaultReceiver.publicKey,
                        tradeHistory: trade_history,
                        treasuryHolder: treasureHolder.publicKey,
                        masterEdition : masterEdition,
                        vault: vault.publicKey,
                        owner: vaultOwner,
                        admin: wallet.publicKey,
                        masterEditionMetadata: metadataAddress,
                        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
                        tokenProgram: TOKEN_PROGRAM_ID,
                        systemProgram: SystemProgram.programId,
                        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY
                    },
                    signers: [wallet.payer],
                }
            )
        } catch (ex) {
            console.log(ex);
            console.log(ex.error);
            console.log(ex.error.comparedValues[0].toBase58());
            console.log(ex.error.comparedValues[1].toBase58());
        }
    });
});
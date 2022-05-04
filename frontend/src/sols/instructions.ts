// @ts-ignore
import {
    Connection,
    LAMPORTS_PER_SOL,
    PublicKey,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
    Transaction,
    TransactionInstruction,
    SignatureResult
} from "@solana/web3.js";
import * as anchor from '@project-serum/anchor';
import { NATIVE_MINT, TOKEN_PROGRAM_ID} from "@solana/spl-token";
import {getAllowed, getBetState, getCoreState, getVaultAuth, getVaultTokenAccount} from "./pda";

export interface CreateHouse {
    admin: PublicKey;
    executer: PublicKey;
    ratio: number;
    core: PublicKey;
    vault: PublicKey;
    mint: PublicKey;
    program: anchor.Program;
    fee: number;
    allowed: number[];
}

export interface TxnResult {
    SignatureResult: SignatureResult,
    Signature: string
}

export async function betDirectly(admin: PublicKey, user: PublicKey, tokenMint: PublicKey, amount: number, betSide: boolean, program: anchor.Program): Promise<TransactionInstruction> {
    const [coreState] = await getCoreState(program.programId, admin);
    const [vaultAuthority] = await getVaultAuth(program.programId, admin);

    const userTokenAccount = user;
    let vaultTokenAccount;
    if (tokenMint.toBase58() === NATIVE_MINT.toBase58()) {
        vaultTokenAccount = vaultAuthority;
    } else {
        const [_vaultTokenAccount] = await getVaultTokenAccount(program.programId, tokenMint, admin);
        vaultTokenAccount = _vaultTokenAccount;
    }
    const [allowed, allowedNonce] = await getAllowed(program.programId, tokenMint, admin);

    return program.instruction.betDirectly({
        amount: new anchor.BN(amount),
        betSide,
        allowedNonce
    }, {
        accounts: {
            coreState,
            user: user,
            vaultAuthority,
            tokenMint,
            userTokenAccount,
            vaultTokenAccount,
            allowedBets: allowed,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId
        },
    });
}

export async function processTransaction(instructions: TransactionInstruction[],
                                         connection: Connection,
                                         user: PublicKey,
                                         signTransaction:  ((transaction: anchor.web3.Transaction) => Promise<anchor.web3.Transaction>)): Promise<TxnResult> {
    const tx = new Transaction();
    instructions.map(i => tx.add(i));
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = user;
    const signedTx = await signTransaction(tx);
    const sig = await connection.sendRawTransaction(signedTx.serialize(), {
        maxRetries: 3,
        preflightCommitment: "confirmed",
        skipPreflight: false
    });
    const result = await connection.confirmTransaction(sig, 'confirmed');
    console.log(`sig => ${sig} => result ${JSON.stringify(result, null, 2)}`)
    return {
        Signature: sig,
        SignatureResult: result.value
    }
}

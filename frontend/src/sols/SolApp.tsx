import React, { FC, FormEvent, FormEventHandler, useCallback, useEffect, useRef, useState } from 'react';
import { useConnection, useWallet, useAnchorWallet, useLocalStorage } from '@solana/wallet-adapter-react';
import { Keypair, SystemProgram, Transaction, Connection, PublicKey, sendAndConfirmTransaction } from '@solana/web3.js';
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as anchor from '@project-serum/anchor';
import { betDirectly } from "./instructions";

const REAL_MODE = true;

const programId = new PublicKey(
    REAL_MODE ? "JBCDbYBpBWakaPfqKANjDfzHzyCiZNx1qZDZZ37vGWW1" : "5Q6qsgU6hSV2VKjwSgEFr33tGLY1TomyddMMi3oRGpkJ");
const admin = new PublicKey(
    REAL_MODE ? "D847SkfYbTAapeFENJqmW9NTaueV5ZeYTstcNvzVNh5L" : "D1V6GJkfp62DwW9mL54Wm8x1W7EwaFqnFKqNJepNj56o");
let idl: any;
let provider: anchor.AnchorProvider;
let program: anchor.Program;
let coreState: any;
let allowed: any;
// const PRIVATE_KEY: string = "";
// const myAccount = Keypair.fromSecretKey(new Uint8Array(JSON.parse(Buffer.from(PRIVATE_KEY).toString())));

export const SolApp: FC = () => {
  const anchorWallet = useAnchorWallet();
  const { connection } = useConnection();
  const { publicKey, sendTransaction, signMessage, signTransaction, signAllTransactions, autoConnect, wallet } = useWallet();


  const onSubmit = async (event: any) => {
    if (!publicKey) return;
    if (!anchorWallet) return;

    const opts = anchor.AnchorProvider.defaultOptions();
    provider = new anchor.AnchorProvider(connection, anchorWallet, opts);
    anchor.setProvider(provider);
    console.log(provider);
    
    idl = await anchor.Program.fetchIdl(programId);

    console.log(idl);

    program = new anchor.Program(idl as anchor.Idl, programId, provider);
    console.log(program);

    let tx = new Transaction();
    tx.add(await betDirectly(admin, publicKey, NATIVE_MINT, 100_000_000, true, program));
    const signature = await sendTransaction(tx, connection);
    const rlt = await connection.confirmTransaction(signature, 'processed');
    console.log("result", rlt);
  }

  return (
    <div>
      <button onClick={onSubmit}>
        hello
      </button>
    </div>
  );
};

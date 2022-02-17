import express from 'express'
import cors from 'cors';
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from '@solana/web3.js';
import { Wallet } from '@project-serum/anchor';
import { actions } from '@metaplex/js';
import { JWKInterface } from 'arweave/node/lib/wallet';
import Arweave from 'arweave';
import fs from 'fs';
import { MintNFTResponse } from '@metaplex/js/lib/actions';
import { ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';

require('dotenv').config()

const PORT = 3001;

const app = express();
app.use(express.json());
app.use(cors());

app.post("/mintNFT", async function (req: any, res: any) {
  const { account, transactionHash, uri, network, depositedLamports, mintCnt } = req.body;
  console.log({ account, transactionHash, uri, network, depositedLamports, mintCnt });
  let connection: Connection;
  if (network === "dev") connection = new Connection("https://api.devnet.solana.com");
  else connection = new Connection("https://solana-api.projectserum.com");
  const privateKey: Keypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(Buffer.from(process.env.private_key).toString()))
  );
  console.log(privateKey.publicKey.toBase58());
  const wallet: Wallet = new Wallet(privateKey);
  let responses: Array<MintNFTResponse> = [];
  for (let i = 1; i <= mintCnt; i++) {
    // step 1. mint NFT
    let rsp: MintNFTResponse = await actions.mintNFT({
      connection,
      wallet,
      uri: uri,
      maxSupply: 1
    });
    console.log(`${i} NFTs are minted ${rsp.mint.toBase58()}`);

    // step 2. create associated account to user    
    let ata = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID, // always ASSOCIATED_TOKEN_PROGRAM_ID
      TOKEN_PROGRAM_ID, // always TOKEN_PROGRAM_ID
      rsp.mint, // mint
      new PublicKey(account) // owner
    );
    console.log(`ATA: ${ata.toBase58()}`);
    console.log(privateKey.publicKey.toBase58());
    let tx = new Transaction().add(
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID, // always ASSOCIATED_TOKEN_PROGRAM_ID
        TOKEN_PROGRAM_ID, // always TOKEN_PROGRAM_ID
        rsp.mint, // mint
        ata, // ata
        new PublicKey(account), // owner of token account
        privateKey.publicKey // fee payer
      )
    );
    await (new Promise(resolve => setTimeout(resolve, 20000)));
    let rlt = await connection.sendTransaction(tx, [privateKey]);
    console.log(rlt);

    // step 3. send NFT to user
    // Add token transfer instructions to transaction
    let fromTokenAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID, // always ASSOCIATED_TOKEN_PROGRAM_ID
      TOKEN_PROGRAM_ID, // always TOKEN_PROGRAM_ID
      rsp.mint, // mint
      privateKey.publicKey // owner
    );
    let toTokenAccount = ata;
    await (new Promise(resolve => setTimeout(resolve, 20000)));
    const transaction = new Transaction().add(
      Token.createTransferInstruction(
        TOKEN_PROGRAM_ID,
        fromTokenAccount,
        toTokenAccount,
        privateKey.publicKey,
        [],
        1,
      ),
    );

    // Sign transaction, broadcast, and confirm
    let finalResult = await sendAndConfirmTransaction(
      connection,
      transaction,
      [privateKey]
    );
    console.log("finalResult", finalResult);

    responses.push(rsp);
  }
  res.json(responses.map(response => ({
      txId: response.txId,
      mint: response.mint,
      metadata: response.metadata.toBase58(),
      edition: response.edition.toBase58()
  })));
});

app.listen(PORT, () => {
  console.log(`Backend listening at http://localhost:${PORT}`);
});

import React, { FC, FormEvent, FormEventHandler, useCallback, useEffect, useRef, useState } from 'react';
import { WalletNotConnectedError } from '@solana/wallet-adapter-base';
import { useConnection, useWallet, useAnchorWallet, useLocalStorage } from '@solana/wallet-adapter-react';
import bs58 from 'bs58';
import { Keypair, SystemProgram, Transaction, Connection, PublicKey, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { actions, NodeWallet, Wallet } from '@metaplex/js';
import { Metadata } from '@metaplex-foundation/mpl-token-metadata';
import Arweave from 'arweave';
import axios from "axios";
import { sign } from 'tweetnacl';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { mintMultipleNFTs } from './NFTMinter';

const TRAIT_CNT: number = 6;

const URL_BACKEND = () => {
  return process.env.REACT_APP_PRIVI_BACKEND_URL;
}

export type Attribute = {
  trait_type: string,
  value: string
};

export async function requestRandomNonce(
  address: string
): Promise<any> {
  const res = await axios.post(`${URL_BACKEND()}/user/requestSignInUsingRandomNonce/`, {
    address,
  });
  const nonce = res.data.nonce; // original nonce
  return nonce;
}

export async function signInWithSolanaWallet(
  address: string,
  signature: string,
  domain: string,
  nonce: string,
  handleException?: () => void
): Promise<any> {
  if (handleException) {
    handleException();
  }
  return new Promise<any>((resolve, reject) => {
    
    axios
      .post(`${URL_BACKEND()}/user/signInWithSolanaWallet/`, { address, signature, domain, nonce })
      .then(res => {
        resolve(res.data);
      })
      .catch(async err => {
        if (err.response?.status === 400 && err.response.data) {
          resolve({ ...err.response.data, signature });
        } else {
          console.log("Error in signInWithSolanaWallet : ", err.message);
          reject("Error");
        }
      });
  });
}

export async function signUpWithSolanaWallet(
  address: string,
  signature: string,
  appName: string
): Promise<any> {
  let token: string = "PRIVI2021";
  return new Promise<any>((resolve, reject) => {
    axios
      .post(`${URL_BACKEND()}/user/signUpWithSolanaWallet`, { address, signature, token, appName })
      .then(res => {
        resolve(res.data);
      })
      .catch(async err => {
        // console.log("Error in SignIn.tsx -> fetchUser() : ", err);
        reject("Error");
      });
  });
};

export const getNFTs = async (
  connection: Connection,
  owner: PublicKey
) => {
  const accounts = await connection.getParsedTokenAccountsByOwner(
    owner,
    { programId: TOKEN_PROGRAM_ID }
  );
  let NFTs: Array<Metadata> = [];
  for (let i = 0; i < accounts.value.length; i++) {
    let account = accounts.value[i];
    let tokenMint = account.account.data.parsed.info.mint;
    let metadataPDA = await Metadata.getPDA(new PublicKey(tokenMint));
    Metadata.load(connection, metadataPDA).then(tokenMetadata => {
      NFTs.push(tokenMetadata);
    }).catch(er => {// has no metadata
    })
  };
  console.log(NFTs);
  return NFTs;
}

export const uploadToArweave = async (
  content: any,
  contentType: string,
  arweaveWallet: JWKInterface | undefined = undefined
) => {
  const arweave = Arweave.init({
    host: 'arweave.net',
    port: 443,
    protocol: 'https'
  });
  const transaction = await arweave.createTransaction({
      data: content
  });
  
  transaction.addTag('Content-Type', contentType);
  if (!arweaveWallet) arweaveWallet = await arweave.wallets.generate();

  await arweave.transactions.sign(transaction, arweaveWallet);
  const rspTxn = await arweave.transactions.post(transaction);

  const { id } = transaction;
  const uri = id ? `https://arweave.net/${id}` : undefined;
  return { uri, arweaveWallet };
}

export const mintNFT = async (
  metadataUri: string,
  connection: Connection,
  wallet: Wallet,
  amount: number
) => {
  let responses = [];
  for (let i = 1; i <= amount; i++) {
    let rsp = await actions.mintNFT({
      connection,
      wallet,
      uri: metadataUri,
      maxSupply: 1
    });
    console.log(`${i} NFTs are minted ${rsp}`);
    responses.push(rsp);
  }
  return responses;
}

export const SolApp: FC = () => {
  const [imgSrc, setImgSrc] = useState("");
  const [imgType, setImgType] = useState("");
  const [imgBuffer, setImgBuffer] = useState(new ArrayBuffer(0));
  const { connection } = useConnection();
  const { publicKey, sendTransaction, signMessage, signTransaction, signAllTransactions, autoConnect, wallet } = useWallet();

  const onClickTest = useCallback(async () => {
  }, [publicKey, sendTransaction, connection]);

  const onSubmit = async (event: any) => {
    if (!publicKey) return;
    event.preventDefault();

    const { uri, arweaveWallet } = await uploadToArweave(
      imgBuffer,
      imgType
    );
    let attributes = Array.from(Array(TRAIT_CNT+1).keys()).slice(1).map(traitId => {
      const nameKey = `traitKey${traitId}`;
      const nameValue = `traitValue${traitId}`;
      return { trait_type: event.target[nameKey]?.value, value: event.target[nameValue]?.value };
    });
    attributes = attributes.filter(attribute => attribute.trait_type && attribute.value && 
      attribute.trait_type.length > 0 && attribute.value.length > 0);
    const metadata = {
      name: event.target.title.value,
      symbol: event.target.title.value,
      description: event.target.description.value,
      seller_fee_basis_points: 500,
      external_url: "https://www.customnft.com/",
      attributes: attributes,
      collection: {
        name: event.target.collection.value,
        family: "Custom NFTs",
      },
      properties: {
        files: [
          {
            uri: uri,
            type: imgType,
          },
        ],
        category: "image",
        maxSupply: 0,
        creators: [
          {
            address: publicKey,
            share: 100,
          },
          {
            address: process.env.REACT_APP_ADMIN_ADDRESS,
            share: 0,
          }
        ],
      },
      image: uri,
    };
    const rsp = await uploadToArweave(
      JSON.stringify(metadata),
      'application/json',
      arweaveWallet
    );
    if (!rsp.uri || !process.env.REACT_APP_ADMIN_ADDRESS) return;
    const adminAddress = new PublicKey(process.env.REACT_APP_ADMIN_ADDRESS);
    const lamportsToSend = Math.ceil(parseFloat(event.target.deposit.value) * 1_000_000_000);
    if (!adminAddress || !signTransaction || lamportsToSend < 1) return;
    const mintCnt = parseInt(event.target.count.value);
    const transferTransaction = new Transaction()
      .add(SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: adminAddress,
        lamports: lamportsToSend
      }));
    const signature = await sendTransaction(transferTransaction, connection);
    const rlt = await connection.confirmTransaction(signature, 'processed');
    if (rlt.value.err === null)
      mintMultipleNFTs(publicKey.toBase58(), signature, rsp.uri, "dev", lamportsToSend, mintCnt);
  }

  const onImgFileChange = (event: any) => {
    const file: File = event.target.files[0];
    setImgSrc(URL.createObjectURL(event.target.files[0]));
    setImgType(file.type);
    file.arrayBuffer().then(buf => setImgBuffer(buf));
  }

  return (
    <div>
      <form onSubmit={onSubmit}>
        <img src={imgSrc}/>
        <br />
        <label>
          Artwork:
          <input name="artwork" type="file" accept="image/*" onChange={onImgFileChange}/>
        </label>
        <br />
        <label>
          Title:
          <input name="title" type="text" />
        </label>
        <br />
        <label>
          Description:
          <input name="description" type="text" />
        </label>
        <br />
        <label>
          Collection:
          <input name="collection" type="text" />
        </label>
        <br />
        {Array.from(Array(TRAIT_CNT+1).keys()).slice(1).map(traitId => {
          const nameKey = `traitKey${traitId}`;
          const nameValue = `traitValue${traitId}`;
          return (<div key={traitId}>
            <label>
              Trait {traitId}:
              <input name={nameKey} type="text" />
              <input name={nameValue} type="text" />
            </label>
            <br />
          </div>);
        })}
        <label>
          Number of Mints
          <input name="count" type="number" defaultValue="1"/>
        </label>
        <br />
        <label>
          Deposit Amount of SOL
          <input name="deposit" type="number" defaultValue="0" step="0.0000001" />
        </label>
        <br />
        <input name="submit" type="submit" value="Mint NFTs" />
      </form>
    </div>
  );
};

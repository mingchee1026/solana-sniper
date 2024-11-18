import * as anchor from '@coral-xyz/anchor';
import {PublicKey} from '@solana/web3.js';
import bs58 from 'bs58';

// Wallet keypair
const walletKeypair = anchor.web3.Keypair.fromSecretKey(
  bs58.decode(process.env.WALLET_PRIV_BASE_58 || '')
);

// const exchangeSolWallet = new PublicKey(process.env.EXCHANGE_SOL_WALLET || '');
const exchangeSolWallet = new PublicKey(
  '4AAVgaihGVCLeEm6JjHCeUp4fa95P2UVPXfDUwJacKWc'
);

const wallet = new anchor.Wallet(walletKeypair);

export {wallet, exchangeSolWallet};

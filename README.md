# Sniper Bot

This is a MVP project that defines simple buy and sell swap orders and also placing limit order using jupiter contract in solana.

## Installation

To get started with this project, follow these steps:

1. **Clone the repository:**

   ```bash
   git clone https://github.com/hamedkalantari/SwapBot.git
   cd swapbot
   ```

2. **Install dependencies:**

   Make sure you have Yarn installed. Then, run:

   ```bash
   yarn install
   ```

3. **Set environment variables:**

   Make sure you setup the environment variable in .env file. You have to add connection parameters like the following:

   ```bash
   HOST=server listening host address
   PORT=server listening port address

   DB_PGPASSWORD=cluster pswd
   DB_PGUSER=cluster usrname
   DB_PGDATABASE=cluster db
   DB_PGHOST=cluster address
   DB_PGPORT=cluster port
   DB_PGSSLMODE=require (improve security by running requests using SSL)

   HELIUS_URL=helius api url
   MAINNET_CLUSTER_HTTPS=solana's mainnet cluster rpc url
   MAINNET_CLUSTER_WSS=solana's mainnet cluster websocket url
   WALLET_PRIV_BASE_58=wallet's private key encoded in base 58 format
   ```

## Usage

To run the script, use the following command:

```bash
yarn run start
```

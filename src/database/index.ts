/**
 * Defines database initialization and connection establishment
 */

require('dotenv-safe').config({
  allowEmptyValues: false,
});
import {Sequelize} from 'sequelize';
import {User, UserModel} from './models/user.model';
import {Network, NetworkModel} from './models/network.model';
import {Token, TokenModel} from './models/token.model';
import {Market, MarketModel} from './models/market.model';
import {Key, KeyModel} from './models/key.model';
import {Wallet, WalletModel} from './models/wallet.model';
import {Order, OrderModel} from './models/order.model';
import {OnChainSwap, OnChainSwapModel} from './models/on-chain-swap.model';
import {PnL, PnLModel} from './models/pnl.model';

class Database {
  public sequelize: Sequelize;

  constructor(database: string) {
    this.sequelize = new Sequelize(
      database,
      String(process.env.DB_PGUSER),
      String(process.env.DB_PGPASSWORD),
      {
        host: String(process.env.DB_PGHOST),
        port: Number(process.env.DB_PGPORT),
        logging: false,
        dialect: 'postgres',
        protocol: 'postgres',
        dialectOptions: {
          ssl: {
            require:
              String(process.env.DB_PGSSLMODE) === 'require' ? true : false,
            rejectUnauthorized: false,
          },
        },
        pool: {
          max: 5,
          min: 0,
          idle: 10000,
        },
      }
    );
  }

  public async init(force: boolean): Promise<void> {
    await this.checkConnection().catch(console.log);

    this.initModels();
    this.initAssociations();
    this.initHooks();

    await this.sequelize.sync({force}).catch(console.log);
  }

  public async initDatabase(force: boolean): Promise<void> {
    await this.init(force);
  }

  public async initDatabaseContext(
    force: boolean,
    func: Function
  ): Promise<void> {
    await this.init(force);

    await func();
    await this.sequelize.close(); //! we close the connection, be careful when using this
  }

  private async checkConnection() {
    await this.sequelize.authenticate();
    console.log('Database connection has been established successfully.');
  }

  private initModels() {
    UserModel.init(this.sequelize);
    NetworkModel.init(this.sequelize);
    TokenModel.init(this.sequelize);
    MarketModel.init(this.sequelize);
    KeyModel.init(this.sequelize);
    WalletModel.init(this.sequelize);
    OrderModel.init(this.sequelize);
    OnChainSwapModel.init(this.sequelize);
    PnLModel.init(this.sequelize);
  }

  private initAssociations() {
    UserModel.applyAssociations();
    NetworkModel.applyAssociations();
    TokenModel.applyAssociations();
    MarketModel.applyAssociations();
    KeyModel.applyAssociations();
    WalletModel.applyAssociations();
    OrderModel.applyAssociations();
    OnChainSwapModel.applyAssociations();
    PnLModel.applyAssociations();
  }

  private initHooks() {
    UserModel.applyHooks();
    NetworkModel.applyHooks();
    TokenModel.applyHooks();
    MarketModel.applyHooks();
    KeyModel.applyHooks();
    WalletModel.applyHooks();
    OrderModel.applyHooks();
    OnChainSwapModel.applyHooks();
    PnLModel.applyHooks();
  }
}

const db = new Database(String(process.env.DB_PGDATABASE));

export {db};
export {Database};
export {User};
export {Network};
export {Token};
export {Market};
export {Key};
export {Wallet};
export {Order};
export {OnChainSwap};
export {PnL};

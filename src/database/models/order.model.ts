import {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
  Model,
  DataTypes,
  NonAttribute,
} from 'sequelize';
import {Sequelize} from 'sequelize';
import {Wallet} from './wallet.model';
import {Market} from './market.model';
import {BlockHash} from '../../types';
import {User} from './user.model';

class Order extends Model<
  InferAttributes<Order>,
  InferCreationAttributes<Order>
> {
  // id can be undefined during creation when using `autoIncrement`
  declare id: CreationOptional<string>;
  declare userId: string;
  declare marketId: string;
  declare inputWalletId: string;
  declare outputWalletId: string;
  declare transactionId: string | null;
  declare inAmount: string;
  declare inAmountInUsd: string;
  declare outAmount: string | null;
  declare commission: string;
  declare networkFee: string;
  declare orderType: 'swap' | 'limit' | 'dca';
  declare orderDirection: 'buy' | 'sell';
  declare succeeded: boolean;
  declare status:
    | 'created'
    | 'submitting'
    | 'submitted'
    | 'confirming'
    | 'confirmed'
    | 'failed'
    | 'limit_new'
    | 'limit_filled'
    | 'limit_partially_filled';
  declare details: {
    recentBlockHash?: BlockHash;
    estimatedFee?: {
      priorityFee?: string;
      computeUnit?: string;
    };
  } | null;
  // these two can be undefined during creation
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare user?: NonAttribute<User>;
  declare inputWallet?: NonAttribute<Wallet>;
  declare outputWallet?: NonAttribute<Wallet>;
}

class OrderModel {
  public static init(sequelize: Sequelize) {
    Order.init(
      {
        id: {
          type: DataTypes.BIGINT,
          primaryKey: true,
          autoIncrement: true,
        },
        userId: {
          type: DataTypes.BIGINT,
          allowNull: false,
        },
        marketId: {
          type: DataTypes.BIGINT,
          allowNull: false,
        },
        inputWalletId: {
          type: DataTypes.BIGINT,
          allowNull: false,
        },
        outputWalletId: {
          type: DataTypes.BIGINT,
          allowNull: false,
        },
        transactionId: {
          type: DataTypes.STRING(128),
          allowNull: true, // TODO for some networks it might be undefined first
          unique: 'txid_wlt',
        },
        inAmount: {
          type: DataTypes.DECIMAL(78, 0),
          allowNull: false,
          defaultValue: 0,
          validate: {
            min: 0,
            isNumeric: true,
          },
        },
        inAmountInUsd: {
          type: DataTypes.DECIMAL(20, 7),
          allowNull: false,
          defaultValue: 0,
          validate: {
            min: 0,
            isNumeric: true,
          },
        },
        outAmount: {
          type: DataTypes.DECIMAL(78, 0),
          allowNull: true,
          validate: {
            min: 0,
            isNumeric: true,
          },
        },
        commission: {
          type: DataTypes.DECIMAL(78, 0),
          allowNull: false,
          defaultValue: 0,
          validate: {
            min: 0,
            isNumeric: true,
          },
        },
        networkFee: {
          type: DataTypes.DECIMAL(78, 0),
          allowNull: false,
          defaultValue: 0,
          validate: {
            min: 0,
            isNumeric: true,
          },
        },
        orderType: {
          type: DataTypes.ENUM('swap', 'limit', 'dca'),
          allowNull: false,
        },
        orderDirection: {
          type: DataTypes.ENUM('buy', 'sell'),
          allowNull: false,
        },
        succeeded: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        status: {
          type: DataTypes.ENUM(
            'created',
            'processing',
            'submitting',
            'submitted',
            'confirming',
            'confirmed',
            'failed',
            'limit_new',
            'limit_filled',
            'limit_partially_filled'
          ),
          allowNull: false,
          defaultValue: 'created',
        },
        details: {
          type: DataTypes.JSONB,
          allowNull: true,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      {
        sequelize,
        tableName: 'orders',
        modelName: 'Order',
        underscored: true,
      }
    );
  }

  public static applyAssociations() {
    Order.belongsTo(User, {
      as: 'user',
      foreignKey: 'userId',
      onDelete: 'RESTRICT',
    });
    Order.belongsTo(Market, {
      as: 'market',
      foreignKey: 'marketId',
      onDelete: 'RESTRICT',
    });
    Order.belongsTo(Wallet, {
      as: 'inputWallet',
      foreignKey: 'inputWalletId',
      onDelete: 'RESTRICT',
    });
    Order.belongsTo(Wallet, {
      as: 'outputWallet',
      foreignKey: 'outputWalletId',
      onDelete: 'RESTRICT',
    });

    User.hasMany(Order, {
      as: 'users',
      foreignKey: 'userId',
      onDelete: 'RESTRICT',
    });
    Market.hasMany(Order, {
      as: 'orders',
      foreignKey: 'marketId',
      onDelete: 'RESTRICT',
    });
    Wallet.hasMany(Order, {
      as: 'inputOrders',
      foreignKey: 'inputWalletId',
      onDelete: 'RESTRICT',
    });
    Wallet.hasMany(Order, {
      as: 'outputOrders',
      foreignKey: 'outputWalletId',
      onDelete: 'RESTRICT',
    });
  }

  public static applyHooks() {}
}

export {Order};
export {OrderModel};

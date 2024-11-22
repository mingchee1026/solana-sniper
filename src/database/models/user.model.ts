import {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
  DataTypes,
} from 'sequelize';
import {Sequelize} from 'sequelize';
import {Wallet} from './wallet.model';

class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  // id can be undefined during creation when using `autoIncrement`
  declare id: CreationOptional<string>;
  declare telegramId: string;
  declare username: string | null;
  declare firstName: string | null;
  declare lastName: string | null;
  declare defaultWalletId: string | null;
  declare status: string;
  declare selectedTransactionId: string;
  declare selectedOrderDirection: 'buy' | 'sell';
  declare selectedOrderType: 'swap' | 'limit' | 'dca';
  declare selectedPoolAddress: string | null;
  declare selectedInputMint: string | null;
  declare selectedOutputMint: string | null;
  declare selectedInputAmount: string;
  declare selectedInputDecimals: number;
  declare selectedEstimatedOutput: string | null;
  declare selectedOutputDecimals: number;
  declare selectedPriceImpact: number;
  declare selectedSellPercent: number;
  declare selectedSellAmount: string;
  declare selectedTokenUsdPrice: string;
  declare selectedSlippage: number;
  // Jupiter Limit Order
  declare selectedLimitOutAmount: string;
  // Jupiter DCA Order
  declare selectedDCAInAmount: number;
  declare selectedDCAInAmountPerCycle: number;
  declare selectedDCACycleSecondsApart: number;
  // these two can be undefined during creation
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare defaultWallet?: NonAttribute<Wallet>;
}

class UserModel {
  public static init(sequelize: Sequelize) {
    User.init(
      {
        id: {
          type: DataTypes.BIGINT,
          primaryKey: true,
          autoIncrement: true,
        },
        telegramId: {
          type: DataTypes.BIGINT,
          allowNull: false,
          unique: true,
        },
        username: {
          type: DataTypes.STRING(128),
          allowNull: true,
        },
        firstName: {
          type: DataTypes.STRING(128),
          allowNull: true,
        },
        lastName: {
          type: DataTypes.STRING(128),
          allowNull: true,
        },
        defaultWalletId: {
          type: DataTypes.BIGINT,
          allowNull: true,
        },
        status: {
          type: DataTypes.ENUM('active', 'suspended'),
          allowNull: false,
          defaultValue: 'active',
        },
        selectedTransactionId: {
          type: DataTypes.STRING(128),
          allowNull: false,
          defaultValue: '0',
        },
        selectedOrderDirection: {
          type: DataTypes.ENUM('buy', 'sell'),
          allowNull: false,
          defaultValue: 'buy',
        },
        selectedOrderType: {
          type: DataTypes.ENUM('swap', 'limit', 'dca'),
          allowNull: false,
          defaultValue: 'swap',
        },
        selectedPoolAddress: {
          type: DataTypes.STRING(110),
          allowNull: true,
        },
        selectedInputMint: {
          type: DataTypes.STRING(110),
          allowNull: true,
        },
        selectedOutputMint: {
          type: DataTypes.STRING(110),
          allowNull: true,
        },
        selectedInputAmount: {
          type: DataTypes.DECIMAL(156, 78),
          allowNull: false,
          defaultValue: 0.5,
        },
        selectedInputDecimals: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        selectedEstimatedOutput: {
          type: DataTypes.DECIMAL(156, 78),
          allowNull: true,
        },
        selectedOutputDecimals: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        selectedPriceImpact: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        selectedSellPercent: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 100,
        },
        selectedSellAmount: {
          type: DataTypes.DECIMAL(156, 78),
          allowNull: false,
          defaultValue: 0,
        },
        selectedTokenUsdPrice: {
          type: DataTypes.DECIMAL(20, 7),
          allowNull: false,
          defaultValue: 0,
        },
        selectedSlippage: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 1500,
        },
        // Jupiter Limit Order
        selectedLimitOutAmount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        // Jupiter DCA Order
        selectedDCAInAmount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        selectedDCAInAmountPerCycle: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        selectedDCACycleSecondsApart: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      {
        sequelize,
        tableName: 'users',
        modelName: 'User',
        underscored: true,
        indexes: [
          //! note these should be underlined
          {name: 'user_tid', fields: ['telegram_id']}, // for getting users by telegramId
        ],
      }
    );
  }

  public static applyAssociations() {
    User.belongsTo(Wallet, {
      as: 'defaultWallet',
      foreignKey: 'defaultWalletId',
      onDelete: 'RESTRICT',
    });
  }

  public static applyHooks() {}
}

export {User};
export {UserModel};

import {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
  Model,
  DataTypes,
} from 'sequelize';
import {Sequelize} from 'sequelize';
import {Wallet} from './wallet.model';
import {Market} from './market.model';

class PnL extends Model<InferAttributes<PnL>, InferCreationAttributes<PnL>> {
  // id can be undefined during creation when using `autoIncrement`
  declare id: CreationOptional<string>;
  declare walletId: string;
  declare cumulativeBuyQuantity: string;
  declare cumulativeBuyCostInUsd: string;
  declare cumulativeBuyCostInSol: string;
  declare cumulativeSellQuantity: CreationOptional<string>;
  declare cumulativeSellProceedsInUsd: CreationOptional<string>;
  declare cumulativeSellProceedsInSol: CreationOptional<string>;
  declare isClosed: CreationOptional<boolean>;
  // these two can be undefined during creation
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

class PnLModel {
  public static init(sequelize: Sequelize) {
    PnL.init(
      {
        id: {
          type: DataTypes.BIGINT,
          primaryKey: true,
          autoIncrement: true,
        },
        walletId: {
          type: DataTypes.BIGINT,
          allowNull: false,
        },
        cumulativeBuyQuantity: {
          type: DataTypes.DECIMAL(156, 78),
          allowNull: false,
          defaultValue: 0,
          validate: {
            min: 0,
            isNumeric: true,
          },
        },
        cumulativeBuyCostInUsd: {
          type: DataTypes.DECIMAL(20, 7),
          allowNull: false,
          defaultValue: 0,
          validate: {
            min: 0,
            isNumeric: true,
          },
        },
        cumulativeBuyCostInSol: {
          type: DataTypes.DECIMAL(156, 78),
          allowNull: false,
          defaultValue: 0,
          validate: {
            min: 0,
            isNumeric: true,
          },
        },
        cumulativeSellQuantity: {
          type: DataTypes.DECIMAL(156, 78),
          allowNull: false,
          defaultValue: 0,
          validate: {
            min: 0,
            isNumeric: true,
          },
        },
        cumulativeSellProceedsInUsd: {
          type: DataTypes.DECIMAL(20, 7),
          allowNull: false,
          defaultValue: 0,
          validate: {
            min: 0,
            isNumeric: true,
          },
        },
        cumulativeSellProceedsInSol: {
          type: DataTypes.DECIMAL(156, 78),
          allowNull: false,
          defaultValue: 0,
          validate: {
            min: 0,
            isNumeric: true,
          },
        },
        isClosed: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      {
        sequelize,
        tableName: 'pnls',
        modelName: 'PnL',
        underscored: true,
        indexes: [
          //! note these should be underlined
          {name: 'pnl_is_closed', fields: ['is_closed']}, // for getting pnl of open positions
          {name: 'pnl_created_at', fields: ['created_at']}, // for getting last pnl of an asset
        ],
      }
    );
  }

  public static applyAssociations() {
    PnL.belongsTo(Wallet, {
      as: 'wallet',
      foreignKey: 'walletId',
      onDelete: 'RESTRICT',
    });

    Wallet.hasMany(PnL, {
      as: 'pnls',
      foreignKey: 'walletId',
      onDelete: 'RESTRICT',
    });
  }

  public static applyHooks() {}
}

export {PnL};
export {PnLModel};

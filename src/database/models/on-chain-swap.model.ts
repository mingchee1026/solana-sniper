/**
 * Defines swap model
 */

import {
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
  DataTypes,
} from 'sequelize';
import {Sequelize} from 'sequelize';
import {Market} from './market.model';

export type LiquidityType = 'NONE' | 'ADDED' | 'REMOVED';

class OnChainSwap extends Model<
  InferAttributes<OnChainSwap>,
  InferCreationAttributes<OnChainSwap>
> {
  // id can be undefined during creation when using `autoIncrement`

  declare time: Date;
  declare marketId: string;
  declare liquidityType: LiquidityType; //!
  declare nativeAmountSum: string; //!
  declare tokenAmountSum: string; //!
  declare spent: string; //! volume
  declare price: string;
  declare nativePrice: string;
  declare newMC: string; //!
  // declare hash: string;
  declare from: string;
  declare typeSwap: 'buy' | 'sell';
  // declare position?: string;
  // declare nativeCurrency?: boolean;
}

class OnChainSwapModel {
  public static init(sequelize: Sequelize) {
    OnChainSwap.init(
      {
        time: {
          // TODO this is for efficiency in timescaleDB
          primaryKey: true,
          type: DataTypes.DATE,
        },
        marketId: {
          type: DataTypes.BIGINT,
          allowNull: false,
        },
        liquidityType: {
          type: DataTypes.ENUM('NONE', 'ADDED', 'REMOVED'),
          allowNull: false,
        },
        nativeAmountSum: {
          type: DataTypes.DECIMAL(78, 0),
          allowNull: false,
        },
        tokenAmountSum: {
          type: DataTypes.DECIMAL(78, 0),
          allowNull: false,
        },
        spent: {
          type: DataTypes.DECIMAL(78, 0),
          allowNull: false,
        },
        price: {
          type: DataTypes.DECIMAL(78, 0),
          allowNull: false,
        },
        nativePrice: {
          type: DataTypes.DECIMAL(78, 0),
          allowNull: false,
        },
        newMC: {
          type: DataTypes.DECIMAL(78, 0),
          allowNull: false,
        },
        // hash: {
        //   type: DataTypes.STRING(128),
        //   allowNull: false,
        // },
        from: {
          type: DataTypes.STRING(110),
          allowNull: false,
        },
        typeSwap: {
          type: DataTypes.ENUM('buy', 'sell'),
          allowNull: false,
        },
        // position: {
        //   type: DataTypes.BIGINT,
        //   allowNull: true,
        // },
        // nativeCurrency: {
        //   type: DataTypes.BOOLEAN,
        //   allowNull: true,
        // },
      },
      {
        sequelize,
        tableName: 'on_chain_swaps',
        modelName: 'OnChainSwap',
        underscored: true,
        timestamps: false,
      }
    );
  }

  public static applyAssociations() {
    OnChainSwap.belongsTo(Market, {
      as: 'market',
      foreignKey: 'marketId',
      onDelete: 'RESTRICT',
    });
    Market.hasMany(OnChainSwap, {
      as: 'onChainSwaps',
      foreignKey: 'marketId',
      onDelete: 'RESTRICT',
    });
  }

  public static applyHooks() {
    // Add custom ORM based triggers (hooks) is desired
  }
}

export {OnChainSwap};
export {OnChainSwapModel};

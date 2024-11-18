/**
 * Defines market model
 */

import {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
  DataTypes,
} from 'sequelize';
import {Sequelize} from 'sequelize';
import {Token} from './token.model';

class Market extends Model<
  InferAttributes<Market>,
  InferCreationAttributes<Market>
> {
  // id can be undefined during creation when using `autoIncrement`

  declare id: CreationOptional<string>;
  declare networkId: string;
  declare dexId: string;
  declare poolAddress: string;
  declare baseTokenId: string;
  declare quoteTokenId: string;
  declare isRevoked: boolean;
  declare status: 'active' | 'halted';

  declare baseToken?: NonAttribute<Token>;
  declare quoteToken?: NonAttribute<Token>;
}

class MarketModel {
  public static init(sequelize: Sequelize) {
    Market.init(
      {
        id: {
          type: DataTypes.BIGINT,
          primaryKey: true,
          autoIncrement: true,
        },
        networkId: {
          type: DataTypes.BIGINT,
          allowNull: false,
        },
        dexId: {
          type: DataTypes.STRING(42),
          allowNull: false,
        },
        poolAddress: {
          type: DataTypes.STRING(110),
          allowNull: false,
        },
        baseTokenId: {
          type: DataTypes.BIGINT,
          allowNull: false,
        },
        quoteTokenId: {
          type: DataTypes.BIGINT,
          allowNull: false,
        },
        isRevoked: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        status: {
          type: DataTypes.ENUM('active', 'halted'),
          allowNull: false,
          defaultValue: 'halted',
        },
      },
      {
        sequelize,
        tableName: 'markets',
        modelName: 'Market',
        underscored: true,
        timestamps: false,
        indexes: [
          {
            unique: false,
            name: 'market_pool_addr',
            fields: ['pool_address'],
          },
          {
            unique: true,
            name: 'market_base_quote',
            fields: ['base_token_id', 'quote_token_id'],
          },
        ],
      }
    );
  }

  public static applyAssociations() {
    Market.belongsTo(Token, {
      as: 'baseToken',
      foreignKey: 'baseTokenId',
      onDelete: 'RESTRICT',
    });
    Market.belongsTo(Token, {
      as: 'quoteToken',
      foreignKey: 'quoteTokenId',
      onDelete: 'RESTRICT',
    });

    Token.hasMany(Market, {
      as: 'baseTokens',
      foreignKey: 'baseTokenId',
      onDelete: 'RESTRICT',
    });
    Token.hasMany(Market, {
      as: 'quoteTokens',
      foreignKey: 'quoteTokenId',
      onDelete: 'RESTRICT',
    });
  }

  public static applyHooks() {
    // Add custom ORM based triggers (hooks) is desired
  }
}

export {Market};
export {MarketModel};

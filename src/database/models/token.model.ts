import {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
  DataTypes,
} from 'sequelize';
import {Sequelize} from 'sequelize';
import {Network} from './network.model';

class Token extends Model<
  InferAttributes<Token>,
  InferCreationAttributes<Token>
> {
  // id can be undefined during creation when using `autoIncrement`
  declare id: CreationOptional<string>;
  declare networkId: string;
  declare parentId: string | null;
  declare name: string;
  declare title: string;
  declare symbol: string;
  declare contractAddress: string;
  declare tokenProgramAddress: string;
  declare unitName: string;
  declare unitDecimals: number;
  declare decimalsToShow: number;
  declare isWithdrawEnabled: boolean;
  declare withdrawCommission: string;
  declare withdrawMin: string;
  declare withdrawMax: string;
  declare status: 'active' | 'halted';
  // these two can be undefined during creation
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare network?: NonAttribute<Network>;
}

class TokenModel {
  public static init(sequelize: Sequelize) {
    Token.init(
      {
        id: {
          type: DataTypes.BIGINT,
          primaryKey: true,
          autoIncrement: true,
        },
        networkId: {
          type: DataTypes.BIGINT,
          allowNull: false,
          unique: 'contract_network',
        },
        parentId: {
          type: DataTypes.BIGINT,
          allowNull: true,
        },
        name: {
          type: DataTypes.STRING(32),
          allowNull: false,
        },
        title: {
          type: DataTypes.STRING(48),
          allowNull: false,
        },
        symbol: {
          type: DataTypes.STRING(16),
          allowNull: false,
        },
        contractAddress: {
          type: DataTypes.STRING(110),
          allowNull: false,
          unique: 'contract_network',
        },
        tokenProgramAddress: {
          type: DataTypes.STRING(110),
          allowNull: false,
        },
        unitName: {
          type: DataTypes.STRING(48),
          allowNull: false,
        },
        unitDecimals: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
        decimalsToShow: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
        isWithdrawEnabled: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        withdrawCommission: {
          type: DataTypes.DECIMAL(78, 0),
          allowNull: false,
          validate: {
            min: 0,
          },
        },
        withdrawMin: {
          type: DataTypes.DECIMAL(78, 0),
          allowNull: false,
          validate: {
            min: 0,
          },
        },
        withdrawMax: {
          type: DataTypes.DECIMAL(78, 0),
          allowNull: false,
          validate: {
            min: 0,
          },
        },
        status: {
          type: DataTypes.ENUM('active', 'halted'),
          allowNull: false,
          defaultValue: 'halted',
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      {
        sequelize,
        tableName: 'tokens',
        modelName: 'Token',
        underscored: true,
        indexes: [
          {
            unique: false,
            name: 'token_netid',
            fields: [
              // for getting tokens by network id
              'network_id',
            ],
          },
        ],
      }
    );
  }

  public static applyAssociations() {
    Token.belongsTo(Network, {
      as: 'network',
      foreignKey: 'networkId',
      onDelete: 'RESTRICT',
    });
    Token.hasOne(Token, {
      as: 'parent',
      foreignKey: 'parentId',
      onDelete: 'RESTRICT',
    });

    Network.hasMany(Token, {
      as: 'tokens',
      foreignKey: 'networkId',
      onDelete: 'RESTRICT',
    });
  }

  public static applyHooks() {
    // TODO we should add before/after create hook, so we create new wallets for existing users
  }
}

export {Token};
export {TokenModel};

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
import {Key} from './key.model';
import {User} from './user.model';

class Wallet extends Model<
  InferAttributes<Wallet>,
  InferCreationAttributes<Wallet>
> {
  // id can be undefined during creation when using `autoIncrement`
  declare id: CreationOptional<string>;
  declare userId: string;
  declare parentId: string | null;
  // declare networkId: string;
  declare tokenId: string;
  declare keyId: string;
  declare address: string;
  declare confirmedBalance: string;
  declare unconfirmedBalance: string;
  declare status: 'active' | 'suspended';
  // these two can be undefined during creation
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare parent?: NonAttribute<Wallet>;
  declare token?: NonAttribute<Token>;
  declare key?: NonAttribute<Key>;
}

class WalletModel {
  public static init(sequelize: Sequelize) {
    Wallet.init(
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
        parentId: {
          type: DataTypes.BIGINT,
          allowNull: true,
        },
        // networkId: {
        //   type: DataTypes.BIGINT,
        //   allowNull: false,
        // },
        tokenId: {
          type: DataTypes.BIGINT,
          allowNull: false,
        },
        keyId: {
          type: DataTypes.BIGINT,
          allowNull: false,
        },
        address: {
          type: DataTypes.STRING(110),
          allowNull: false,
        },
        confirmedBalance: {
          type: DataTypes.DECIMAL(78, 0),
          allowNull: false,
          defaultValue: 0,
          validate: {
            min: 0,
          },
        },
        unconfirmedBalance: {
          type: DataTypes.DECIMAL(78, 0),
          allowNull: false,
          defaultValue: 0,
        },
        status: {
          type: DataTypes.ENUM('active', 'suspended'),
          allowNull: false,
          defaultValue: 'active',
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      {
        sequelize,
        tableName: 'wallets',
        modelName: 'Wallet',
        underscored: true,
        indexes: [
          //! note these should be underlined
          {name: 'wallet_uid', fields: ['user_id']}, // for getting wallets by userId
          {name: 'wallet_addr', fields: ['address']}, // for getting wallets by address
        ],
      }
    );
  }

  public static applyAssociations() {
    Wallet.belongsTo(User, {
      as: 'user',
      foreignKey: 'userId',
      onDelete: 'RESTRICT',
    });
    Wallet.belongsTo(Token, {
      as: 'token',
      foreignKey: 'tokenId',
      onDelete: 'RESTRICT',
    });
    // Wallet.belongsTo(Network, {
    //   as: 'network',
    //   foreignKey: 'networkId',
    //   onDelete: 'RESTRICT',
    // });
    Wallet.belongsTo(Key, {
      as: 'key',
      foreignKey: 'keyId',
      onDelete: 'RESTRICT',
    });
    Wallet.hasOne(Wallet, {
      as: 'parent',
      foreignKey: 'parentId',
      onDelete: 'RESTRICT',
    });

    // Network.hasMany(Wallet, {
    //   as: 'wallets',
    //   foreignKey: 'networkId',
    //   onDelete: 'RESTRICT',
    // });
    User.hasMany(Wallet, {
      as: 'wallets',
      foreignKey: 'userId',
      onDelete: 'RESTRICT',
    });
    Token.hasMany(Wallet, {
      as: 'wallets',
      foreignKey: 'tokenId',
      onDelete: 'RESTRICT',
    });
    Key.hasMany(Wallet, {
      as: 'wallets',
      foreignKey: 'keyId',
      onDelete: 'RESTRICT',
    });
  }

  public static applyHooks() {}
}

export {Wallet};
export {WalletModel};

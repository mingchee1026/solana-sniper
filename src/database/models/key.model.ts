import {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
  Model,
  DataTypes,
} from 'sequelize';
import {Sequelize} from 'sequelize';

class Key extends Model<InferAttributes<Key>, InferCreationAttributes<Key>> {
  // id can be undefined during creation when using `autoIncrement`
  declare id: CreationOptional<string>;
  declare userId: string;
  declare publicKey: string;
  declare privateKey: string;
  declare algorithm: 'ecdsa' | 'ed25519';
  declare status: 'active' | 'busy' | 'suspended';
  // these two can be undefined during creation
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

class KeyModel {
  public static init(sequelize: Sequelize) {
    Key.init(
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
        publicKey: {
          type: DataTypes.STRING(140),
          allowNull: false,
          unique: true,
        },
        privateKey: {
          type: DataTypes.STRING(376),
          allowNull: false,
          unique: true,
        },
        algorithm: {
          type: DataTypes.ENUM('ecdsa', 'ed25519'),
          allowNull: false,
        },
        status: {
          type: DataTypes.ENUM('active', 'busy', 'suspended'),
          allowNull: false,
          defaultValue: 'active',
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      {
        sequelize,
        tableName: 'keys',
        modelName: 'Key',
        underscored: true,
      }
    );
  }

  public static applyAssociations() {}

  public static applyHooks() {}
}

export {Key};
export {KeyModel};

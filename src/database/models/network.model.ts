import {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
  Model,
  DataTypes,
} from 'sequelize';
import {Sequelize} from 'sequelize';

class Network extends Model<
  InferAttributes<Network>,
  InferCreationAttributes<Network>
> {
  // id can be undefined during creation when using `autoIncrement`
  declare id: CreationOptional<string>;
  declare name: string;
  declare title: string;
  declare isWithdrawEnabled: boolean;
  declare status: 'active' | 'halted';
  declare config: {
    requiredConfirmation: number;
  };

  // these two can be undefined during creation
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

class NetworkModel {
  public static init(sequelize: Sequelize) {
    Network.init(
      {
        id: {
          type: DataTypes.BIGINT,
          primaryKey: true,
          autoIncrement: true,
        },
        name: {
          type: DataTypes.STRING(48),
          allowNull: false,
          unique: true,
        },
        title: {
          type: DataTypes.STRING(48),
          allowNull: false,
          unique: true,
        },
        isWithdrawEnabled: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        status: {
          type: DataTypes.ENUM('active', 'halted'),
          allowNull: false,
          defaultValue: 'halted',
        },
        config: {
          type: DataTypes.JSONB,
          allowNull: false,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      {
        sequelize,
        tableName: 'networks',
        modelName: 'Network',
        underscored: true,
      }
    );
  }

  public static applyAssociations() {}

  public static applyHooks() {
    // TODO we should add before/after create hook, so we create new wallets for existing users
  }
}

export {Network};
export {NetworkModel};

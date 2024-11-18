import cron from 'node-cron';
import {db, Order, User} from '../database';
import {checkConfirmation} from './check-confirmation';
import axios from 'axios';
import {Transaction} from 'sequelize';

export function start() {
  // Cron job to periodically check for unconfirmed transactions
  cron.schedule('*/1 * * * * *', async () => {
    try {
      await db.sequelize.transaction(
        {isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED}, // TODO bug skip locked
        async transaction => {
          const orders = await Order.findAll({
            attributes: ['id', 'userId', 'status'],
            where: {status: 'submitted'},
            lock: true, // ! IMPORTANT: It will lock other queries as it is modyfing find all.
            skipLocked: true, // ! IMPORTANT: It will lock other queries as it is modyfing find all.
            raw: true,
            transaction, // ! IMPORTANT: lock the database so it cannot overwrite by another process
          });
          // console.log(orders);

          for (const order of orders) {
            const result = await checkConfirmation(
              // TODO parallelize this block
              order.id,
              transaction,
              'confirmed' // TODO change to confirmed?
            );
            if (result) {
              // send it to Arya
              const user = await User.findOne({
                // TODO parallelize this block
                attributes: ['telegramId'],
                where: {id: order.userId},
                raw: true,
              });
              if (!user)
                throw new Error(
                  'FATAL: user not found in cronjob: check for confirmation.'
                );
              await axios.post(
                `https://9d3f-64-23-172-25.ngrok-free.app/webhook/api/update/${user.telegramId}`,
                {
                  message: result.success ? 'SUCCESS' : 'FAILED',
                  transactionId: order.transactionId,
                },
                {
                  headers: {
                    'Content-Type': 'application/json',
                  },
                }
              );
            }
          }
        }
      );
    } catch (e) {
      console.log(e);
    }
  });
}

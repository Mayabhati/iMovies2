const mongoose = require('mongoose');
const config = require('./env');

const REPLICA_SET_HELP = 'MongoDB transactions require a replica set or sharded cluster. Use MongoDB Atlas, or start local mongod with --replSet rs0 and initialize it with `npm run db:init-replset` from server/. Ensure MONGO_URI includes the correct database and (for local MongoDB) ?replicaSet=rs0.';

async function connectDb(uri = config.mongoUri) {
  if (!uri) throw new Error('MONGO_URI is required before connecting to MongoDB');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    const topologyType = mongoose.connection.client?.topology?.description?.type;
    // Check the driver's topology as well as the server response: a replica-set member connected
    // with directConnection=true can report setName but still be treated as a single-server topology.
    const transactionCapable = ['ReplicaSetWithPrimary', 'Sharded', 'LoadBalanced'].includes(topologyType);
    if (!transactionCapable || (!hello.setName && hello.msg !== 'isdbgrid' && topologyType !== 'LoadBalanced')) {
      const observed = topologyType || 'unknown';
      const setName = hello.setName || 'none';
      throw new Error(`MongoDB connection is not using a transaction-capable topology (driver topology: ${observed}; reported replica set: ${setName}). ${REPLICA_SET_HELP}`);
    }
  } catch (error) {
    await mongoose.disconnect().catch(() => {});
    throw error;
  }
  return mongoose.connection;
}

module.exports = { connectDb };

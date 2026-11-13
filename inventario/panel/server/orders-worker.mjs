import { workerData, parentPort } from 'node:worker_threads';
import { openDatabase } from './db.mjs';
import { createApp } from './app.mjs';
const db = openDatabase(workerData);
const server = createApp(db);
server.listen(0, '127.0.0.1', () => parentPort.postMessage(server.address().port));
parentPort.on('message', () => { server.closeAllConnections(); server.close(() => { db.close(); parentPort.close(); }); });

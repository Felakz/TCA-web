import { openDatabase } from './db.mjs';
import { createApp } from './app.mjs';
const db = openDatabase();
const server = createApp(db);
server.listen(3001, '127.0.0.1', () => console.log('API SQLite en http://127.0.0.1:3001 (uso local)'));
process.on('SIGINT', () => server.close(() => { db.close(); process.exit(); }));

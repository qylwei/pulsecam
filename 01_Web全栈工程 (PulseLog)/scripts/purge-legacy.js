const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.PULSELOG_DATA_DIR || path.join(__dirname, '..', 'data'), 'pulselog.db');
const db = new Database(dbPath, { fileMustExist: true });
try {
  const removed = db.prepare("DELETE FROM daily_checkins WHERE data_source = 'legacy'").run().changes;
  console.log(`Removed ${removed} legacy records.`);
} finally {
  db.close();
}

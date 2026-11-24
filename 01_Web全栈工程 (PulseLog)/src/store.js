const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const dataDir = process.env.PULSELOG_DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'pulselog.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS daily_checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    sleep_hours REAL NOT NULL,
    activity_minutes INTEGER NOT NULL,
    fatigue INTEGER NOT NULL,
    stress INTEGER NOT NULL,
    mood INTEGER NOT NULL,
    scenario TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

const userColumns = db.prepare('PRAGMA table_info(users)').all().map(column => column.name);
if (!userColumns.includes('membership_status')) {
  db.exec("ALTER TABLE users ADD COLUMN membership_status TEXT NOT NULL DEFAULT 'inactive'");
  db.exec('ALTER TABLE users ADD COLUMN membership_expires_at TEXT');
}

const checkinColumns = db.prepare('PRAGMA table_info(daily_checkins)').all().map(column => column.name);
if (!checkinColumns.includes('heart_rate')) {
  db.exec("ALTER TABLE daily_checkins ADD COLUMN heart_rate INTEGER");
}
if (!checkinColumns.includes('hrv')) {
  db.exec("ALTER TABLE daily_checkins ADD COLUMN hrv INTEGER");
}
if (!checkinColumns.includes('respiration')) {
  db.exec("ALTER TABLE daily_checkins ADD COLUMN respiration INTEGER");
}
if (!checkinColumns.includes('recovery_score')) {
  db.exec("ALTER TABLE daily_checkins ADD COLUMN recovery_score INTEGER");
}
if (!checkinColumns.includes('data_source')) {
  db.exec("ALTER TABLE daily_checkins ADD COLUMN data_source TEXT NOT NULL DEFAULT 'legacy'");
}
if (!checkinColumns.includes('quality')) {
  db.exec("ALTER TABLE daily_checkins ADD COLUMN quality REAL");
}

function createAnonymousUser(id) {
  db.prepare('INSERT OR IGNORE INTO users (id, created_at) VALUES (?, ?)').run(id, new Date().toISOString());
  return { id };
}

function addCheckin(input) {
  const data = {
    userId: input.userId,
    recordedAt: input.recordedAt,
    sleepHours: input.sleepHours,
    activityMinutes: input.activityMinutes,
    fatigue: input.fatigue,
    stress: input.stress,
    mood: input.mood,
    scenario: input.scenario,
    note: input.note || '',
    heartRate: input.heartRate ?? null,
    hrv: input.hrv ?? null,
    respiration: input.respiration ?? null,
    recoveryScore: input.recoveryScore ?? null,
    dataSource: input.dataSource || 'manual',
    quality: input.quality ?? null
  };
  const result = db.prepare(`
    INSERT INTO daily_checkins
      (user_id, recorded_at, sleep_hours, activity_minutes, fatigue, stress, mood, scenario, note, heart_rate, hrv, respiration, recovery_score, data_source, quality)
    VALUES (@userId, @recordedAt, @sleepHours, @activityMinutes, @fatigue, @stress, @mood, @scenario, @note, @heartRate, @hrv, @respiration, @recoveryScore, @dataSource, @quality)
  `).run(data);
  return db.prepare('SELECT * FROM daily_checkins WHERE id = ?').get(result.lastInsertRowid);
}

function listCheckins(userId) {
  return db.prepare(`SELECT * FROM daily_checkins WHERE user_id = ? AND data_source != 'legacy' ORDER BY recorded_at DESC LIMIT 90`).all(userId);
}

function deleteCheckin(userId, id) {
  return db.prepare('DELETE FROM daily_checkins WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}

function updateCheckin(userId, id, input) {
  const data = {
    userId,
    id,
    recordedAt: input.recordedAt,
    sleepHours: input.sleepHours,
    activityMinutes: input.activityMinutes,
    fatigue: input.fatigue,
    stress: input.stress,
    mood: input.mood,
    scenario: input.scenario,
    note: input.note || '',
    heartRate: input.heartRate ?? null,
    hrv: input.hrv ?? null,
    respiration: input.respiration ?? null,
    recoveryScore: input.recoveryScore ?? null,
    dataSource: input.dataSource || 'manual',
    quality: input.quality ?? null
  };
  const result = db.prepare(`
    UPDATE daily_checkins SET
      recorded_at=@recordedAt,
      sleep_hours=@sleepHours,
      activity_minutes=@activityMinutes,
      fatigue=@fatigue,
      stress=@stress,
      mood=@mood,
      scenario=@scenario,
      note=@note,
      heart_rate=@heartRate,
      hrv=@hrv,
      respiration=@respiration,
      recovery_score=@recoveryScore,
      data_source=@dataSource,
      quality=@quality
    WHERE id=@id AND user_id=@userId
  `).run(data);
  return result.changes ? db.prepare('SELECT * FROM daily_checkins WHERE id = ?').get(id) : null;
}

function clearCheckins(userId) {
  return db.prepare('DELETE FROM daily_checkins WHERE user_id = ?').run(userId).changes;
}

function membershipFor(userId) {
  return db.prepare('SELECT membership_status, membership_expires_at FROM users WHERE id = ?').get(userId) || { membership_status: 'inactive', membership_expires_at: null };
}

function setMembership(userId, status, expiresAt) {
  createAnonymousUser(userId);
  db.prepare('UPDATE users SET membership_status = ?, membership_expires_at = ? WHERE id = ?').run(status, expiresAt || null, userId);
  return membershipFor(userId);
}

module.exports = { createAnonymousUser, addCheckin, listCheckins, deleteCheckin, updateCheckin, clearCheckins, membershipFor, setMembership };

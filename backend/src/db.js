import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
export function openDb(
  path = process.env.DATABASE_PATH || "./data/salon.sqlite",
) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,phone TEXT NOT NULL DEFAULT '',password TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'cliente' CHECK(role IN ('admin','cliente')));
 CREATE TABLE IF NOT EXISTS services(id INTEGER PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',price INTEGER NOT NULL CHECK(price>=0),duration INTEGER NOT NULL CHECK(duration>0),buffer INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS professionals(id INTEGER PRIMARY KEY,name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS skills(professional_id INTEGER REFERENCES professionals(id),service_id INTEGER REFERENCES services(id),PRIMARY KEY(professional_id,service_id));
 CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),open_hour INTEGER NOT NULL DEFAULT 9,close_hour INTEGER NOT NULL DEFAULT 19,close_time TEXT NOT NULL DEFAULT '20:00',days TEXT NOT NULL DEFAULT '[1,2,3,4,5,6]',cancel_hours INTEGER NOT NULL DEFAULT 24);
 INSERT OR IGNORE INTO settings(id) VALUES(1);
 CREATE TABLE IF NOT EXISTS blocks(id INTEGER PRIMARY KEY,professional_id INTEGER REFERENCES professionals(id),start TEXT NOT NULL,end TEXT NOT NULL,reason TEXT NOT NULL DEFAULT '');
 CREATE TABLE IF NOT EXISTS appointments(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),service_id INTEGER NOT NULL REFERENCES services(id),professional_id INTEGER NOT NULL REFERENCES professionals(id),start TEXT NOT NULL,end TEXT NOT NULL,price INTEGER NOT NULL,service_name TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'confirmado',notes TEXT NOT NULL DEFAULT '');
 CREATE INDEX IF NOT EXISTS appointment_window ON appointments(professional_id,start,end);
 CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY,appointment_id INTEGER NOT NULL REFERENCES appointments(id),amount INTEGER NOT NULL CHECK(amount>0),method TEXT NOT NULL CHECK(method IN ('dinheiro','pix','debito','credito')),created_at TEXT NOT NULL,request_key TEXT UNIQUE NOT NULL);
 CREATE TABLE IF NOT EXISTS expenses(id INTEGER PRIMARY KEY,description TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),method TEXT NOT NULL,date TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS cash_days(date TEXT PRIMARY KEY,initial INTEGER NOT NULL,expected INTEGER, counted INTEGER, status TEXT NOT NULL DEFAULT 'aberto',closed_at TEXT);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id),action TEXT NOT NULL,entity_id INTEGER,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id),title TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS appointment_items(id INTEGER PRIMARY KEY,appointment_id INTEGER REFERENCES appointments(id),kind TEXT NOT NULL,name TEXT NOT NULL,quantity INTEGER NOT NULL,unit_price INTEGER NOT NULL,product_id INTEGER,commission INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY,name TEXT NOT NULL,price INTEGER NOT NULL,stock INTEGER NOT NULL,minimum INTEGER NOT NULL DEFAULT 3,active INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS order_adjustments(appointment_id INTEGER PRIMARY KEY REFERENCES appointments(id),discount INTEGER NOT NULL DEFAULT 0,extra INTEGER NOT NULL DEFAULT 0,reason TEXT NOT NULL DEFAULT '');
 CREATE TABLE IF NOT EXISTS commission_rules(service_id INTEGER PRIMARY KEY REFERENCES services(id),percent INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS commissions(appointment_id INTEGER PRIMARY KEY REFERENCES appointments(id),professional_id INTEGER REFERENCES professionals(id),amount INTEGER NOT NULL,paid_at TEXT,expense_id INTEGER REFERENCES expenses(id));
 CREATE TABLE IF NOT EXISTS refunds(id INTEGER PRIMARY KEY,payment_id INTEGER REFERENCES payments(id),amount INTEGER NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL,request_key TEXT UNIQUE NOT NULL);
 CREATE TABLE IF NOT EXISTS password_resets(token TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),expires TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS waitlist(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id),service_id INTEGER REFERENCES services(id),professional_id INTEGER REFERENCES professionals(id),date TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'aguardando');
 CREATE TABLE IF NOT EXISTS job_keys(key TEXT PRIMARY KEY);
 CREATE TABLE IF NOT EXISTS monthly_reports(month TEXT PRIMARY KEY,data TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS push_devices(token TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),enabled INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS push_queue(id INTEGER PRIMARY KEY,notification_id INTEGER REFERENCES notifications(id),token TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_attempt TEXT NOT NULL DEFAULT '',ticket_id TEXT,sent_at TEXT,error TEXT,UNIQUE(notification_id,token));
 PRAGMA user_version=3;`);
  return db;
}
export function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

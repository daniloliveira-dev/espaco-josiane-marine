import { AsyncLocalStorage } from "node:async_hooks";
import mysql from "mysql2/promise";
import { QueryRepository } from "./app/Repositories/QueryRepository.js";

const transactionConnection = new AsyncLocalStorage();
const schema = [
  `CREATE TABLE IF NOT EXISTS users (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,name VARCHAR(100) NOT NULL,email VARCHAR(254) NOT NULL UNIQUE,phone VARCHAR(30) NOT NULL DEFAULT '',password VARCHAR(255) NOT NULL,role ENUM('admin','cliente') NOT NULL DEFAULT 'cliente') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS services (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,name VARCHAR(100) NOT NULL,description VARCHAR(500) NOT NULL DEFAULT '',price INT NOT NULL CHECK(price>=0),duration INT NOT NULL CHECK(duration>0),buffer INT NOT NULL DEFAULT 0,active TINYINT NOT NULL DEFAULT 1) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS professionals (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,name VARCHAR(100) NOT NULL,active TINYINT NOT NULL DEFAULT 1) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS products (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,name VARCHAR(100) NOT NULL,price INT NOT NULL,stock INT NOT NULL,minimum INT NOT NULL DEFAULT 3,active TINYINT NOT NULL DEFAULT 1) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS skills (professional_id INT NOT NULL,service_id INT NOT NULL,PRIMARY KEY(professional_id,service_id),CONSTRAINT skills_professional_fk FOREIGN KEY(professional_id) REFERENCES professionals(id),CONSTRAINT skills_service_fk FOREIGN KEY(service_id) REFERENCES services(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS settings (id INT NOT NULL PRIMARY KEY,open_hour INT NOT NULL DEFAULT 9,close_hour INT NOT NULL DEFAULT 19,close_time CHAR(5) NOT NULL DEFAULT '20:00',days VARCHAR(32) NOT NULL DEFAULT '[1,2,3,4,5,6]',cancel_hours INT NOT NULL DEFAULT 24,CONSTRAINT settings_singleton CHECK(id=1)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS blocks (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,professional_id INT NULL,\`start\` VARCHAR(35) NOT NULL,\`end\` VARCHAR(35) NOT NULL,reason VARCHAR(200) NOT NULL DEFAULT '',INDEX blocks_window(professional_id,\`start\`,\`end\`),CONSTRAINT blocks_professional_fk FOREIGN KEY(professional_id) REFERENCES professionals(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS appointments (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,user_id INT NOT NULL,service_id INT NOT NULL,professional_id INT NOT NULL,\`start\` VARCHAR(35) NOT NULL,\`end\` VARCHAR(35) NOT NULL,price INT NOT NULL,service_name VARCHAR(100) NOT NULL,status VARCHAR(32) NOT NULL DEFAULT 'confirmado',notes VARCHAR(500) NOT NULL DEFAULT '',INDEX appointment_window(professional_id,\`start\`,\`end\`),INDEX appointments_user_start(user_id,\`start\`),CONSTRAINT appointments_user_fk FOREIGN KEY(user_id) REFERENCES users(id),CONSTRAINT appointments_service_fk FOREIGN KEY(service_id) REFERENCES services(id),CONSTRAINT appointments_professional_fk FOREIGN KEY(professional_id) REFERENCES professionals(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS payments (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,appointment_id INT NOT NULL,amount INT NOT NULL CHECK(amount>0),method ENUM('dinheiro','pix','debito','credito') NOT NULL,created_at VARCHAR(35) NOT NULL,request_key VARCHAR(100) NOT NULL UNIQUE,INDEX payments_appointment(appointment_id),INDEX payments_created_at(created_at),CONSTRAINT payments_appointment_fk FOREIGN KEY(appointment_id) REFERENCES appointments(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS expenses (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,description VARCHAR(200) NOT NULL,amount INT NOT NULL CHECK(amount>0),method ENUM('dinheiro','pix','debito','credito') NOT NULL,\`date\` CHAR(10) NOT NULL,INDEX expenses_date_method(\`date\`,method)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS cash_days (\`date\` CHAR(10) NOT NULL PRIMARY KEY,initial INT NOT NULL,expected INT NULL,counted INT NULL,status VARCHAR(32) NOT NULL DEFAULT 'aberto',closed_at VARCHAR(35) NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS audit (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,user_id INT NULL,action VARCHAR(100) NOT NULL,entity_id INT NULL,created_at VARCHAR(35) NOT NULL,INDEX audit_created_at(created_at),CONSTRAINT audit_user_fk FOREIGN KEY(user_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS notifications (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,user_id INT NULL,title VARCHAR(500) NOT NULL,created_at VARCHAR(35) NOT NULL,INDEX notifications_user_id(user_id),CONSTRAINT notifications_user_fk FOREIGN KEY(user_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS appointment_items (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,appointment_id INT NULL,kind ENUM('servico','produto') NOT NULL,name VARCHAR(100) NOT NULL,quantity INT NOT NULL,unit_price INT NOT NULL,product_id INT NULL,commission INT NOT NULL DEFAULT 0,INDEX appointment_items_appointment(appointment_id),CONSTRAINT appointment_items_appointment_fk FOREIGN KEY(appointment_id) REFERENCES appointments(id),CONSTRAINT appointment_items_product_fk FOREIGN KEY(product_id) REFERENCES products(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS order_adjustments (appointment_id INT NOT NULL PRIMARY KEY,discount INT NOT NULL DEFAULT 0,extra INT NOT NULL DEFAULT 0,reason VARCHAR(200) NOT NULL DEFAULT '',CONSTRAINT order_adjustments_appointment_fk FOREIGN KEY(appointment_id) REFERENCES appointments(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS commission_rules (service_id INT NOT NULL PRIMARY KEY,percent INT NOT NULL DEFAULT 0,CONSTRAINT commission_rules_service_fk FOREIGN KEY(service_id) REFERENCES services(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS commissions (appointment_id INT NOT NULL PRIMARY KEY,professional_id INT NULL,amount INT NOT NULL,paid_at VARCHAR(35) NULL,expense_id INT NULL,CONSTRAINT commissions_appointment_fk FOREIGN KEY(appointment_id) REFERENCES appointments(id),CONSTRAINT commissions_professional_fk FOREIGN KEY(professional_id) REFERENCES professionals(id),CONSTRAINT commissions_expense_fk FOREIGN KEY(expense_id) REFERENCES expenses(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS refunds (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,payment_id INT NULL,amount INT NOT NULL,reason VARCHAR(200) NOT NULL,created_at VARCHAR(35) NOT NULL,request_key VARCHAR(100) NOT NULL UNIQUE,INDEX refunds_payment_id(payment_id),INDEX refunds_created_at(created_at),CONSTRAINT refunds_payment_fk FOREIGN KEY(payment_id) REFERENCES payments(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS password_resets (token CHAR(64) NOT NULL PRIMARY KEY,user_id INT NULL,expires VARCHAR(35) NOT NULL,INDEX password_resets_user(user_id),CONSTRAINT password_resets_user_fk FOREIGN KEY(user_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS waitlist (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,user_id INT NULL,service_id INT NULL,professional_id INT NULL,\`date\` CHAR(10) NOT NULL,status VARCHAR(32) NOT NULL DEFAULT 'aguardando',INDEX waitlist_date_status(\`date\`,status),CONSTRAINT waitlist_user_fk FOREIGN KEY(user_id) REFERENCES users(id),CONSTRAINT waitlist_service_fk FOREIGN KEY(service_id) REFERENCES services(id),CONSTRAINT waitlist_professional_fk FOREIGN KEY(professional_id) REFERENCES professionals(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS job_keys (\`key\` VARCHAR(120) NOT NULL PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS monthly_reports (month CHAR(7) NOT NULL PRIMARY KEY,data LONGTEXT NOT NULL,created_at VARCHAR(35) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS push_devices (token VARCHAR(255) NOT NULL PRIMARY KEY,user_id INT NULL,enabled TINYINT NOT NULL DEFAULT 1,INDEX push_devices_user(user_id),CONSTRAINT push_devices_user_fk FOREIGN KEY(user_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE IF NOT EXISTS push_queue (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,notification_id INT NULL,token VARCHAR(255) NOT NULL,status VARCHAR(32) NOT NULL DEFAULT 'pending',attempts INT NOT NULL DEFAULT 0,next_attempt VARCHAR(35) NOT NULL DEFAULT '',ticket_id VARCHAR(255) NULL,sent_at VARCHAR(35) NULL,error VARCHAR(500) NULL,UNIQUE KEY push_notification_token(notification_id,token),INDEX push_queue_status_due(status,next_attempt),CONSTRAINT push_queue_notification_fk FOREIGN KEY(notification_id) REFERENCES notifications(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
];

const mysqlSql = (sql) => sql.replace(/\b(start|end|date)\b/gi, "`$1`");

export async function openDb() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || "salon",
    user: process.env.DB_USER || "salon",
    password: process.env.DB_PASSWORD || "local_salon_password_change_me",
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    queueLimit: 0,
    charset: "utf8mb4",
    timezone: "Z",
    dateStrings: true,
  });
  for (const statement of schema) await pool.query(statement);

  async function execute(sql, params) {
    return (transactionConnection.getStore() || pool).execute(sql, params);
  }
  const db = {
    prepare(sql) {
      const statement = mysqlSql(sql);
      return {
        async get(...params) {
          const [rows] = await execute(statement, params);
          return rows[0];
        },
        async all(...params) {
          const [rows] = await execute(statement, params);
          return rows;
        },
        async run(...params) {
          const [result] = await execute(statement, params);
          return {
            changes: result.affectedRows,
            lastInsertRowid: Number(result.insertId || 0),
          };
        },
      };
    },
    async close() {
      await pool.end();
    },
    pool,
  };
  await new QueryRepository(db).ensureSettingsRow();
  return db;
}

export async function transaction(db, work) {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await transactionConnection.run(connection, work);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
    }
    throw error;
  } finally {
    connection.release();
  }
}

import { parentPort, workerData } from "node:worker_threads";
import mysql from "mysql2/promise";

let queryPort = null;

const pool = mysql.createPool({
  host: workerData.host,
  port: workerData.port,
  database: workerData.database,
  user: workerData.user,
  password: workerData.password,
  connectionLimit: workerData.connectionLimit,
  charset: "utf8mb4",
  namedPlaceholders: false,
  multipleStatements: true,
  supportBigNumbers: true,
  dateStrings: true,
  timezone: "Z",
});

parentPort.on("message", (message) => {
  if (message?.type === "attachPort" && message.port) {
    queryPort = message.port;
    queryPort.on("message", (payload) => {
      void handleQuery(payload);
    });
  }
});

async function handleQuery(payload) {
  const { requestId, mode, sql, params, signalBuffer } = payload || {};
  const signal = new Int32Array(signalBuffer);

  try {
    const { sql: normalizedSql, values } = normalizeQuery(sql, params);
    const [rows] = await pool.query(normalizedSql, values);
    const result = formatResult(mode, rows);

    queryPort.postMessage({
      requestId,
      ok: true,
      result,
    });
  } catch (error) {
    queryPort.postMessage({
      requestId,
      ok: false,
      error: {
        message: error?.message || "Errore database.",
        code: error?.code || null,
        status: 500,
      },
    });
  } finally {
    Atomics.store(signal, 0, 1);
    Atomics.notify(signal, 0, 1);
  }
}

function normalizeQuery(sql, params) {
  if (Array.isArray(params)) {
    return { sql, values: params };
  }

  if (!params || typeof params !== "object") {
    return { sql, values: [] };
  }

  const values = [];
  const normalizedSql = String(sql).replace(/@([A-Za-z0-9_]+)/g, (_, key) => {
    values.push(params[key]);
    return "?";
  });

  return {
    sql: normalizedSql,
    values,
  };
}

function formatResult(mode, rows) {
  if (mode === "exec") {
    return true;
  }

  if (mode === "run") {
    return {
      changes: Number(rows?.affectedRows || 0),
      lastInsertRowid: Number(rows?.insertId || 0),
    };
  }

  if (mode === "get") {
    return Array.isArray(rows) ? rows[0] : null;
  }

  return Array.isArray(rows) ? rows : [];
}

const { Pool } = require("pg");

const isProduction = process.env.NODE_ENV === "production";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,

    ssl: isProduction
        ? { rejectUnauthorized: false }
        : false,

    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 20000,
});

pool.on("error", (err) => {
    console.error("Unexpected PostgreSQL pool error:", err);
});

const query = (text, params) => pool.query(text, params);

const withTransaction = async (callback) => {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const result = await callback(client);

        await client.query("COMMIT");

        return result;
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
};

module.exports = {
    pool,
    query,
    withTransaction,
};
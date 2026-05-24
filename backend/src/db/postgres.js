const { Pool, types } = require("pg");
const { DATABASE_URL } = require("../config/env");

types.setTypeParser(1700, (val) => Number(val));

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 10,
});

module.exports = pool;

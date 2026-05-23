const pool = require("../db/postgres");

async function listProducts({ q, limit = 20, offset = 0 } = {}, client = pool) {
  if (q) {
    const query = `
      SELECT id, sku, name, description, price, stock,
             created_at AS "createdAt", updated_at AS "updatedAt"
      FROM products
      WHERE name ILIKE $1 OR sku ILIKE $1
      ORDER BY id ASC
      LIMIT $2 OFFSET $3
    `;
    const searchTerm = `%${q}%`;
    const { rows } = await client.query(query, [searchTerm, limit, offset]);
    return rows;
  }

  const query = `
    SELECT id, sku, name, description, price, stock,
           created_at AS "createdAt", updated_at AS "updatedAt"
    FROM products
    ORDER BY id ASC
    LIMIT $1 OFFSET $2
  `;
  const { rows } = await client.query(query, [limit, offset]);
  return rows;
}

async function getProductById(productId, client = pool) {
  const query = `
    SELECT id, sku, name, description, price, stock,
           created_at AS "createdAt", updated_at AS "updatedAt"
    FROM products
    WHERE id = $1
  `;
  const { rows } = await client.query(query, [productId]);
  return rows[0] || null;
}

async function getProductByIdForUpdate(productId, client) {
  const query = `
    SELECT id, sku, name, description, price, stock
    FROM products
    WHERE id = $1
    FOR UPDATE
  `;
  const { rows } = await client.query(query, [productId]);
  return rows[0] || null;
}

async function decrementStock(productId, quantity, client) {
  const query = `
    UPDATE products
    SET stock = stock - $2, updated_at = NOW()
    WHERE id = $1 AND stock >= $2
    RETURNING id, stock
  `;
  const { rows } = await client.query(query, [productId, quantity]);
  return rows[0] || null;
}

async function createProduct({ sku, name, description, price, stock }) {
  const query = `
    INSERT INTO products (sku, name, description, price, stock)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, sku, name, description, price, stock,
              created_at AS "createdAt", updated_at AS "updatedAt"
  `;
  const { rows } = await pool.query(query, [
    sku,
    name,
    description || "",
    price,
    stock,
  ]);
  return rows[0];
}

async function updateProduct(productId, fields = {}) {
  const allowedFields = ["price", "stock", "description", "name"];

  const updates = [];
  const values = [productId];
  let index = 2;

  for (const key of allowedFields) {
    if (fields[key] !== undefined) {
      updates.push(`${key} = $${index}`);
      values.push(fields[key]);
      index++;
    }
  }

  if (updates.length === 0) return getProductById(productId);

  const query = `
    UPDATE products
    SET ${updates.join(", ")},
        updated_at = NOW()
    WHERE id = $1
    RETURNING id, sku, name, description, price, stock,
              created_at AS "createdAt",
              updated_at AS "updatedAt"
  `;

  const { rows } = await pool.query(query, values);
  return rows[0] || null;
}

module.exports = {
  listProducts,
  getProductById,
  getProductByIdForUpdate,
  decrementStock,
  createProduct,
  updateProduct,
};

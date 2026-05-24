import { useEffect, useState } from "react";
import { listOrdersAdmin, listProducts, updateProductAdmin } from "../api";
import type { Order, Product } from "../types";

type EditingState = Record<number, Partial<Product>>;
type SavingState = Record<number, boolean>;

export default function AdminPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<EditingState>({});
  const [saving, setSaving] = useState<SavingState>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [ordersData, productsData] = await Promise.all([
          listOrdersAdmin(),
          listProducts(),
        ]);

        setOrders(ordersData);
        setProducts(productsData);
      } catch (err) {
        console.error(err);
        setError("Failed to load admin data");
      }
    }

    load();
  }, []);

  function onChangeField<K extends keyof Product>(
    id: number,
    field: K,
    value: Product[K],
  ) {
    setEditing((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  }

  async function save(product: Product) {
    const draft = editing[product.id];

    if (!draft) return;

    if (
      draft.price !== undefined &&
      (Number.isNaN(draft.price) || draft.price < 0)
    ) {
      setError("Price must be a valid positive number");
      return;
    }

    if (
      draft.stock !== undefined &&
      (!Number.isInteger(draft.stock) || draft.stock < 0)
    ) {
      setError("Stock must be a valid positive integer");
      return;
    }

    const previousProducts = products;

    const updatedProducts = products.map((p) =>
      p.id === product.id ? { ...p, ...draft } : p,
    );

    setProducts(updatedProducts);

    setSaving((prev) => ({
      ...prev,
      [product.id]: true,
    }));

    setError(null);

    try {
      const updated = await updateProductAdmin(product.id, {
        name: draft.name,
        description: draft.description,
        price: draft.price,
        stock: draft.stock,
      });

      setProducts((current) =>
        current.map((p) => (p.id === updated.id ? updated : p)),
      );

      setEditing((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
    } catch (err) {
      console.error(err);
      setProducts(previousProducts);
      setError("Failed to update product");
    } finally {
      setSaving((prev) => ({
        ...prev,
        [product.id]: false,
      }));
    }
  }

  return (
    <div className="page">
      <h1>Admin</h1>

      {error && <p className="error">{error}</p>}

      <section>
        <h2>Orders</h2>

        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Customer</th>
              <th>Total</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>

          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.id}</td>
                <td>{order.customerId}</td>
                <td>${order.totalAmount.toFixed(2)}</td>
                <td>{order.status}</td>
                <td>{new Date(order.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Products</h2>

        <ul className="admin-products">
          {products.map((product) => (
            <li key={product.id} className="admin-product">
              <input
                type="text"
                value={editing[product.id]?.name ?? product.name}
                onChange={(e) =>
                  onChangeField(product.id, "name", e.target.value)
                }
              />

              <input
                type="number"
                min="0"
                step="0.01"
                value={editing[product.id]?.price ?? product.price}
                onChange={(e) =>
                  onChangeField(
                    product.id,
                    "price",
                    Number(e.target.value),
                  )
                }
              />

              <input
                type="number"
                min="0"
                step="1"
                value={editing[product.id]?.stock ?? product.stock}
                onChange={(e) =>
                  onChangeField(
                    product.id,
                    "stock",
                    Number(e.target.value),
                  )
                }
              />

              <textarea
                value={
                  editing[product.id]?.description ?? product.description
                }
                onChange={(e) =>
                  onChangeField(
                    product.id,
                    "description",
                    e.target.value,
                  )
                }
              />

              <button
                onClick={() => save(product)}
                disabled={saving[product.id]}
              >
                {saving[product.id] ? "Saving..." : "Save"}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
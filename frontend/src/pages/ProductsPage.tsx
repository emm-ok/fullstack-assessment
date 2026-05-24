import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listProducts } from "../api";
import type { Product } from "../types";

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {

    const controller = new AbortController();

    const timeout = setTimeout(async() => {
      try {
        setLoading(true);
        setError(null);
  
        const data = await listProducts(q, controller.signal);
  
        setProducts(data);
      } catch (err) {
        if (err instanceof DOMException) return;
          console.error(err);
          setError("Failed to load products");
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    }
  }, [q]);


  return (
    <div className="page">
      <h1>Products</h1>
      <div className="toolbar">
        <input
          type="text"
          value={q}
          placeholder="Search products"
          onChange={(e) => {
            setQ(e.target.value);
          }}
        />
      </div>
      {loading && <p>Loading...</p>}

      {error && <p className="error">{error}</p>}
      
      <ul className="product-grid">
        {products.map((p) => (
          <li key={p.id} className="product-card">
            <Link to={`/products/${p.id}`}>
              <h3>{p.name}</h3>
              <p className="sku">{p.sku}</p>
              <p className="price">${p.price.toFixed(2)}</p>
              <p className="stock">
                {p.stock > 0 ? `${p.stock} in stock` : "Out of stock"}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

import { ChangeEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createOrder, getProduct } from "../api";
import { useCart } from "../state/CartContext";
import type { Product } from "../types";
import DOMPurify from "dompurify";

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { add } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const controller = new AbortController();

    async function loadProduct() {
      try {
        setLoading(true);
        setError(null);

        const data = await getProduct(id as string, controller.signal);

        setProduct(data);
      } catch (err) {
        if (err instanceof DOMException) return;
        console.error(err);
        setError("Failed to load product");
      } finally {
        setLoading(false);
      }
    }

    loadProduct();

    return () => controller.abort();
  }, [id]);

  function handleQuantity(e: ChangeEvent<HTMLInputElement>) {
    if (!product) return;
    const value = Math.max(1, Number(e.target.value) || 1);
    const safeQuantity = Math.min(value, product.stock);
    setQuantity(safeQuantity);
  }

  async function buyNow() {
    if (!product || buying) return;

    if (quantity > product.stock) {
      setError("Quantity exceeds available stock");
      return;
    }

    try {
      setBuying(true);
      setError(null);

      const order = await createOrder({
        customerId: "customer_001",
        items: [
          {
            productId: product.id,
            quantity,
          },
        ],
        totalAmount: product.price * quantity,
      });

      navigate(`/orders/${order.id}`);
    } catch (err) {
      console.error(err);
      setError("Failed to create order");
    } finally {
      setBuying(false);
    }
  }

  if (loading) {
    return <p>Loading...</p>;
  }

  if (error && !product) {
    return <p>{error}</p>;
  }


  if (!product) {
    return <p>Product not found.</p>;
  }

  return (
    <div className="page">
      <h1>{product.name}</h1>
      <p className="sku">{product.sku}</p>
      <div
        className="description"
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(product.description),
        }}
      />
      <p className="price">${product.price.toFixed(2)}</p>
      <p className="stock">
        {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
      </p>
      <div className="qty-row">
        <input
          type="number"
          min={1}
          max={product.stock}
          value={quantity}
          onChange={handleQuantity}
        />
      </div>
      <div className="actions">
        <button
          onClick={() => add(product, quantity)}
          disabled={product.stock === 0}
        >
          Add to cart
        </button>
        <button
          onClick={buyNow}
          disabled={product.stock === 0 || buying}
          className="primary"
        >
          {buying ? "Processing..." : "Buy now"}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createOrder, getProduct } from "../api";
import { useCart } from "../state/CartContext";
import type { Product } from "../types";

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { add } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (!id) return;
    getProduct(id)
      .then(setProduct)
      .catch((err) => console.error(err));
  }, [id]);

  if (!product) return <p>Loading...</p>;

  const handleQuantity = (e: any) => {
    const value = Math.max(1, Number(e.target.value) || 1);
    setQuantity(value);
  }

  async function buyNow() {
    if (!product) return;
    const order = await createOrder({
      customerId: "customer_001",
      items: [{ productId: product.id, quantity }],
      totalAmount: product.price * quantity,
    });
    navigate(`/orders/${order.id}`);
  }

  return (
    <div className="page">
      <h1>{product.name}</h1>
      <p className="sku">{product.sku}</p>
      <div
        className="description"
        dangerouslySetInnerHTML={{ __html: product.description }}
      />
      <p className="price">${product.price}</p>
      <p className="stock">
        {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
      </p>
      <div className="qty-row">
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => handleQuantity(e)}
        />
      </div>
      <div className="actions">
        <button onClick={() => add(product, quantity)}>Add to cart</button>
        <button onClick={buyNow} className="primary">
          Buy now
        </button>
      </div>
    </div>
  );
}

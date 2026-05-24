import { useNavigate } from "react-router-dom";
import { useCart } from "../state/CartContext";
import { createOrder } from "../api";

export default function CartPage() {
  const { items, total, remove, clear } = useCart();
  const navigate = useNavigate();

  console.log(items)
  async function checkout() {
    if (items.length === 0) return;
    const order = await createOrder({
      customerId: "customer_001",
      items: items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
      })),
      totalAmount: total,
    });
    clear();
    navigate(`/orders/${order.id}`);
  }

  if (items.length === 0) {
    return (
      <div className="page">
        <h1>Cart</h1>
        <p>Your cart is empty.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Cart</h1>
      <ul className="cart-list">
        {items.map((item) => (
          <li key={item.productId} className="cart-item">
            <span>{item.name}</span>
            <span>
              {item.quantity} x ${item.price.toFixed(2)}
            </span>
            <span>${(item.price * item.quantity).toFixed(2)}</span>
            <button onClick={() => remove(item.productId)}>Remove</button>
          </li>
        ))}
      </ul>
      <div className="cart-total">
        <strong>Total:</strong> ${total.toFixed(2)}
      </div>
      <button className="primary" onClick={checkout}>
        Checkout
      </button>
    </div>
  );
}

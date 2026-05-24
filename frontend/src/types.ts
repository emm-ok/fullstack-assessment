export interface Product {
  id: number;
  sku: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
}

export interface OrderItem {
  id: number;
  productId: number;
  quantity: number;
  unitPrice: number;
  name: string;
  sku: string;
}

export interface Payment {
  id: number;
  orderId: number;
  amount: number;
  providerTxnId: string;
  status: "SUCCESS" | "FAILED";
  createdAt: string;
}

export interface Order {
  id: number;
  customerId: string;
  totalAmount: number;
  status: "PENDING" | "PAID" | "FAILED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
  items?: OrderItem[];
  payments?: Payment[];
}

import { repo } from "../repo";
import { createPaymentLink, square } from "../providers/square";
import { syncInventory } from "../providers/convex";
import { assertStoreEnvironment, requirePayments } from "./config";
import { AppError } from "./errors";
import type { Order } from "../contracts";

export type SquarePayment = {
  id: string;
  order_id: string;
  location_id: string;
  status: string;
  amount_money: { amount: number; currency: string };
  receipt_url?: string;
};

export function acceptPayment(order: Order, payment: SquarePayment) {
  assertStoreEnvironment(repo.store(order.storeId)!);
  if (payment.status !== "COMPLETED") return false;
  if (
    payment.order_id !== order.squareOrderId ||
    payment.location_id !== repo.store(order.storeId)?.locationId ||
    payment.amount_money?.currency !== "USD"
  )
    throw new AppError(400, "Payment does not match this checkout.");
  repo.complete(
    order.id,
    payment.id,
    payment.amount_money.amount,
    payment.receipt_url,
  );
  return true;
}

export async function reconcileOrder(order: Order) {
  assertStoreEnvironment(repo.store(order.storeId)!);
  if (
    order.state === "paid" ||
    order.state === "failed" ||
    !order.squareOrderId
  )
    return;
  const remote = await square<{
    order: { state: string; tenders?: { payment_id?: string }[] };
  }>(`/orders/${order.squareOrderId}`, undefined, "GET", order.storeId);
  for (const tender of remote.order.tenders || []) {
    if (!tender.payment_id) continue;
    const { payment } = await square<{ payment: SquarePayment }>(
      `/payments/${tender.payment_id}`,
      undefined,
      "GET",
      order.storeId,
    );
    if (acceptPayment(order, payment)) return;
  }
  if (remote.order.state === "CANCELED" && !remote.order.tenders?.length)
    repo.cancelOrder(order.id);
}

export async function cancelCheckout(order: Order) {
  assertStoreEnvironment(repo.store(order.storeId)!);
  if (order.state === "paid")
    throw new AppError(409, "This order is already paid.");
  if (order.state === "failed") return;
  // Retry an uncertain creation with the SAME key before attempting cancellation.
  const linked = order.linkId
    ? order
    : repo.linkOrder(
        order.id,
        await createPaymentLink(
          order,
          requirePayments(repo.store(order.storeId)),
        ),
      );
  await square(
    `/online-checkout/payment-links/${linked.linkId}`,
    undefined,
    "DELETE",
    order.storeId,
  );
  await reconcileOrder(linked);
  const current = repo.order(order.id)!;
  if (current.state === "paid")
    throw new AppError(
      409,
      "Square confirmed payment. Your items are purchased.",
    );
  if (current.state !== "failed")
    throw new AppError(
      409,
      "Square has not confirmed cancellation. Items remain reserved while payment is checked.",
    );
}

export async function maintenance() {
  if (!repo.acquireJob("reconcile", 900_000))
    return { busy: true, checked: 0, failed: 0 };
  let checked = 0,
    failed = 0;
  try {
    for (const order of repo.pendingOrders().slice(0, 10)) {
      try {
        if (new Date(order.expiresAt).getTime() < Date.now())
          await cancelCheckout(order);
        else await reconcileOrder(order);
        checked++;
      } catch {
        failed++;
      } finally {
        repo.markChecked(order.id);
      }
    }
    await syncInventory();
    return { busy: false, checked, failed };
  } finally {
    repo.releaseJob("reconcile");
  }
}

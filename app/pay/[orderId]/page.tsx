import { Checkout } from "@/components/checkout";
export default async function Page({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  return <Checkout id={(await params).orderId} />;
}

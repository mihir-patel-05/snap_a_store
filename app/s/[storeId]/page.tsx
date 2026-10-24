import { Storefront } from "@/components/storefront";
export default async function Page({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  return <Storefront id={storeId} />;
}

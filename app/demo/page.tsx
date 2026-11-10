import { notFound } from "next/navigation";
import { isDevelopPreview } from "../lib/develop-preview";

export default async function DemoPage() {
  if (!isDevelopPreview()) notFound();
  const { default: DevelopDemo } = await import("../ui/develop-demo");
  return <DevelopDemo />;
}

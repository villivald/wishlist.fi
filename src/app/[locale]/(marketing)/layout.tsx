import DocumentLayout from "@/components/document-layout";

export { generateMetadata } from "@/components/document-layout";

export default function MarketingLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  return <DocumentLayout {...props} marketing />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentPage } from "@/features/content/content-page";
import {
  getSiteContentPage,
  getSiteContentPages,
} from "@/features/content/site-content";

type ContentRouteProps = { params: Promise<{ content: string[] }> };

export function generateStaticParams() {
  return getSiteContentPages().map((page) => ({
    content: page.path.split("/"),
  }));
}

export async function generateMetadata({
  params,
}: ContentRouteProps): Promise<Metadata> {
  const { content } = await params;
  const page = getSiteContentPage(content.join("/"));
  if (!page) return {};
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: `/${page.path}` },
  };
}

export default async function ContentRoute({ params }: ContentRouteProps) {
  const { content } = await params;
  const page = getSiteContentPage(content.join("/"));
  if (!page) notFound();
  return <ContentPage page={page} />;
}

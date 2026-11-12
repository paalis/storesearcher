import type { Metadata } from "next";
import { CategoriesView } from "./CategoriesView";

export const metadata: Metadata = { title: "Kategorier" };

export default function Page() {
  return <CategoriesView />;
}

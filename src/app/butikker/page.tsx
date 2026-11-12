import type { Metadata } from "next";
import { StoresView } from "./StoresView";

export const metadata: Metadata = { title: "Butikker" };

export default function Page() {
  return <StoresView />;
}

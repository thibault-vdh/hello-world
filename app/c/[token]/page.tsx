import type { Metadata } from "next";
import { ConfirmClient } from "./ConfirmClient";

export const metadata: Metadata = {
  title: "Confirm · Noon",
  robots: { index: false, follow: false },
};

export default function ConfirmPage() {
  return <ConfirmClient />;
}

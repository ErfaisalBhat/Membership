import { useEffect, useRef, useState } from "react";
import { formatMoney } from "../shared/format";
import { Alert, buttonClass } from "../ui/form";
import { payWithZoho } from "./zoho";

// Runs the payment for a checkout started by the backend, then calls
// onResult(result) with what the backend's provider needs to verify it.
// onCancel() when the person closes the payment window.
//
// provider "test": shows two buttons to simulate the gateway (local testing only).
// provider "zoho": opens the Zoho Payments widget (frontend/src/payments/zoho.js).
export default function Checkout({ checkout, onResult, onCancel }) {
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (checkout.provider !== "zoho" || started.current) return;
    started.current = true;
    payWithZoho(checkout)
      .then(onResult)
      .catch((err) => {
        if (err && err.code === "widget_closed") onCancel();
        else setError(err.message || "The payment window could not be opened.");
      });
  }, [checkout, onResult, onCancel]);

  if (checkout.provider === "test") {
    return (
      <div className="space-y-4 rounded-lg border border-dashed border-amber-300 bg-amber-50 p-5">
        <div>
          <p className="text-sm font-semibold text-amber-900">Test payment — no money is charged</p>
          <p className="mt-1 text-sm text-amber-800">
            The site is in test mode (PAYMENT_PROVIDER=test). Choose what the payment gateway should report for{" "}
            <strong>{formatMoney(checkout.amount)}</strong> (order {checkout.orderNo}).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass.primary} onClick={() => onResult({ outcome: "success" })}>
            Simulate successful payment
          </button>
          <button type="button" className={buttonClass.secondary} onClick={() => onResult({ outcome: "failure" })}>
            Simulate failed payment
          </button>
          <button type="button" className={buttonClass.ghost} onClick={onCancel}>
            Close
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <Alert>{error}</Alert>
        <button type="button" className={buttonClass.secondary} onClick={onCancel}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-700" />
      Opening the secure payment window…
    </div>
  );
}

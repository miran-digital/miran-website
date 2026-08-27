"use client";

import { useEffect, useState } from "react";
import { dateTimeTimestamp } from "@/lib/jalali";

function getRemaining(endsAt: string) {
  return Math.max(0, dateTimeTimestamp(endsAt) - Date.now());
}

function formatRemaining(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const clock = [hours, minutes, seconds]
    .map((value) => value.toLocaleString("fa-IR", { minimumIntegerDigits: 2, useGrouping: false }))
    .join(":");
  return days > 0 ? `${days.toLocaleString("fa-IR")} روز · ${clock}` : clock;
}

export function OfferCountdown({ endsAt }: { endsAt: string }) {
  const [remaining, setRemaining] = useState(() => getRemaining(endsAt));
  useEffect(() => {
    const update = () => setRemaining(getRemaining(endsAt));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [endsAt]);
  if (remaining <= 0) return null;
  return (
    <span className="miran-offer-countdown" aria-label="زمان باقی‌مانده پیشنهاد">
      {formatRemaining(remaining)}
    </span>
  );
}

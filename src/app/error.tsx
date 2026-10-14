"use client";
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (<div role="alert"><h1>Something went wrong</h1><p className="muted">{error.message.includes("not found") ? error.message : "An unexpected error occurred."}</p><button onClick={reset}>Try again</button></div>);
}

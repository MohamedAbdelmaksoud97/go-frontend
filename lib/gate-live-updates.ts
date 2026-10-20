// Opt in at build time to restore the gate event stream and device polling.
export const gateLiveUpdatesEnabled = process.env.NEXT_PUBLIC_GATE_LIVE_UPDATES_ENABLED === "true"

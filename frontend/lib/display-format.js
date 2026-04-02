export function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

export function formatUsd(value) {
  const amount = Number(value || 0);
  return amount > 0 ? `$${amount.toFixed(4)}` : "$0.0000";
}

export function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`;
}

export function joinWithDot(values) {
  return values.filter(Boolean).join(" � ");
}

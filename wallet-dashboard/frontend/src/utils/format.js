export const formatAddress = (address, start = 6, end = 4) => {
  if (!address) return '—';
  if (address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
};

export const formatHash = (hash, start = 10, end = 4) => {
  if (!hash) return '—';
  if (hash.length <= start + end) return hash;
  return `${hash.slice(0, start)}...${hash.slice(-end)}`;
};

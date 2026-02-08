const BASE_URL = "http://localhost:8000";

export const fetchWalletData = async (address, hop, limit) => {
  const res = await fetch(`${BASE_URL}/api/v1/dashboard?address=${address}&hops=${hop}&limit=${limit}`);
  return res.json();
};

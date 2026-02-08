// import styled from "styled-components";

// const Grid = styled.div`
//   display: grid;
//   grid-template-columns: repeat(6, 1fr);
//   gap: 12px;
// `;

// const Card = styled.div`
//   background: linear-gradient(145deg, #081a1f, #020d10);
//   border: 1px solid #00ffcc;
//   padding: 12px;
//   box-shadow: 0 0 12px #00ffcc55;
// `;

// export default function WalletSummary({ data }) {
//   return (
//     <Grid>
//       <Card>Wallet: {data.wallet}</Card>
//       <Card>Currency: {data.currency}</Card>
//       <Card>Smart Contract: {data.contract}</Card>
//       <Card>TX: {data.total}</Card>
//       {/* <Card>Receiver: {data.receiver}</Card> */}
//       <Card>Balance: {data.balance} {data.currency}</Card>
//     </Grid>
//   );
// }

import styled from "styled-components";

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
`;

const Card = styled.div`
  background: linear-gradient(145deg, #081a1f, #020d10);
  border: 1px solid #00ffcc;
  padding: 12px;
  box-shadow: 0 0 12px #00ffcc55;
`;

export default function WalletSummary({ data = {} }) {
  const wallet = data.wallet ?? "";
  const currency = data.currency;
  const isContract = data.is_smart_contract === true || data.is_smart_contract === "true";
  const rawCount = data.transaction_count ?? 0;
  const shownCount = (data.transactions && data.transactions.length) || 0;
  const balance = Number(data.balance ?? 0).toFixed(6);

  return (
    <Grid>
      <Card>Wallet: {wallet}</Card>
      <Card>Currency: {currency}</Card>
      <Card>Smart Contract: {String(isContract ? "yes" : "no")}</Card>
      <Card>TX: {rawCount} (showing {shownCount})</Card>
      <Card>Balance: {balance} {currency}</Card>
    </Grid>
  );
}
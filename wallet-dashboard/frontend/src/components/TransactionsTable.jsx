import styled from "styled-components";

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 20px;
`;

const Th = styled.th`
  border-bottom: 1px solid #00ffcc;
  padding: 8px;
`;

const Td = styled.td`
  padding: 8px;
  border-bottom: 1px solid #033;
`;

export default function TransactionTable({ rows }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>FROM</Th>
          <Th>TO</Th>
          <Th>TIME</Th>
          <Th>CUR</Th>
          <Th>HASH</Th>
          <Th>VALUE</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((tx, i) => (
          <tr key={i}>
            <Td>{tx.from}</Td>
            <Td>{tx.to}</Td>
            <Td>{tx.time}</Td>
            <Td>{tx.chain.toUpperCase()}</Td>
            {/* <Td>{tx.hash.slice(0, 12)}...</Td> */}
            <Td>{tx.hash}</Td>
            <Td>{tx.value}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

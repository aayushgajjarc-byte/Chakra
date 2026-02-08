import styled from "styled-components";

const Select = styled.select`
  background: black;
  color: #00ffcc;
  border: 1px solid #00ffcc;
  padding: 8px;
`;

export default function HopSelector({ hop, setHop }) {
  return (
    <Select value={hop} onChange={(e) => setHop(e.target.value)}>
      {[...Array(10)].map((_, i) => (
        <option key={i} value={i + 1}>
          Hop {i + 1}
        </option>
      ))}
    </Select>
  );
}

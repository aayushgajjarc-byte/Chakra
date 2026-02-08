import CytoscapeComponent from "react-cytoscapejs";
import { useLocation } from "react-router-dom";

export default function GraphPage() {
  const { state } = useLocation();

  const elements = [
    ...state.nodes.map(n => ({
      data: { id: n.id, label: n.label }
    })),
    ...state.edges.map(e => ({
      data: { source: e.from, target: e.to, label: e.value }
    }))
  ];

  return (
    <CytoscapeComponent
      elements={elements}
      style={{ width: "100vw", height: "100vh" }}
      layout={{ name: "cose" }}
      stylesheet={[
        {
          selector: "node",
          style: {
            label: "data(label)",
            backgroundColor: "#00ffcc",
            textOutlineColor: "#000",
            textOutlineWidth: 2,
            boxShadow: "0 0 20px #00ffcc"
          }
        },
        {
          selector: "edge",
          style: {
            curveStyle: "bezier",
            targetArrowShape: "triangle",
            lineColor: "#ff00ff",
            targetArrowColor: "#ff00ff"
          }
        }
      ]}
    />
  );
}

import { useState, useMemo } from 'react'
import ReactFlow, { Background, Controls, MiniMap, MarkerType } from 'reactflow'
import 'reactflow/dist/style.css'

export default function GraphView({ data, onBack }) {
  const [expanded, setExpanded] = useState(false)

  const { nodes, edges } = useMemo(() => {
    if (!data) return { nodes: [], edges: [] }

    const centerId = 'center'
    const centerNode = {
      id: centerId,
      position: { x: 580, y: 320 },
      data: { 
        label: `${data.wallet.slice(0,10)}...${data.wallet.slice(-8)}\n${data.balance.toFixed(4)} ${data.currency}` 
      },
      style: { 
        background: '#052e16', 
        border: '5px solid #10b981', 
        color: '#fff', 
        padding: 24, 
        borderRadius: 20, 
        fontSize: 17,
        width: 260,
        cursor: 'pointer'
      }
    }

    const nodesList = [centerNode]
    const edgesList = []

    if (!expanded) return { nodes: nodesList, edges: edgesList }

    // Build incoming & outgoing
    const incoming = new Map()
    const outgoing = new Map()

    data.transactions.forEach(tx => {
      const val = parseFloat(tx.value) || 0
      if (tx.to.toLowerCase() === data.wallet.toLowerCase()) {
        incoming.set(tx.from, (incoming.get(tx.from) || 0) + val)
      }
      if (tx.from.toLowerCase() === data.wallet.toLowerCase()) {
        outgoing.set(tx.to, (outgoing.get(tx.to) || 0) + val)
      }
    })

    let y = 80
    incoming.forEach((val, addr) => {
      const id = 'in-' + addr
      nodesList.push({
        id,
        position: { x: 80, y },
        data: { label: `${addr.slice(0,10)}...${addr.slice(-8)}\n${val.toFixed(4)} ${data.currency}` },
        style: { background: '#111827', border: '3px solid #67e8f9', color: '#fff', padding: 16, borderRadius: 16, width: 210 }
      })
      edgesList.push({
        id: 'e-in-' + addr,
        source: id,
        target: centerId,
        style: { stroke: '#67e8f9', strokeWidth: 3 },
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#67e8f9' }
      })
      y += 130
    })

    y = 80
    outgoing.forEach((val, addr) => {
      const id = 'out-' + addr
      nodesList.push({
        id,
        position: { x: 1080, y },
        data: { label: `${addr.slice(0,10)}...${addr.slice(-8)}\n${val.toFixed(4)} ${data.currency}` },
        style: { background: '#111827', border: '3px solid #f97316', color: '#fff', padding: 16, borderRadius: 16, width: 210 }
      })
      edgesList.push({
        id: 'e-out-' + addr,
        source: centerId,
        target: id,
        style: { stroke: '#f97316', strokeWidth: 3 },
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#f97316' }
      })
      y += 130
    })

    return { nodes: nodesList, edges: edgesList }
  }, [data, expanded])

  const onNodeClick = (event, node) => {
    if (node.id === 'center') {
      setExpanded(!expanded)   // ← Click center toggles expand/collapse
    }
  }

  return (
    <div className="h-screen flex flex-col bg-[#0a0f1a]">
      <div className="bg-zinc-900 border-b border-zinc-800 px-10 py-6 flex items-center justify-between">
        <button onClick={onBack} className="bg-zinc-800 hover:bg-zinc-700 px-10 py-4 rounded-2xl font-medium flex items-center gap-3">← BACK</button>
        <div className="text-4xl font-bold tracking-widest neon-green">TRANSACTION GRAPH</div>
        <div className="text-zinc-500 text-sm">[ CLICK CENTER NODE TO EXPAND ]</div>
      </div>

      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodeClick={onNodeClick}
          fitView
        >
          <Background color="#1f2937" gap={30} />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </div>
  )
}
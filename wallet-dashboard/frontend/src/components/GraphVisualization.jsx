import { useState, useMemo, useCallback, useEffect } from 'react'
import ReactFlow, { Background, Controls, MiniMap, MarkerType, Panel, useNodesState, useEdgesState, Handle, Position } from 'reactflow'
import 'reactflow/dist/style.css'
import { X, ChevronRight, Map as MapIcon, Network, GitGraph } from 'lucide-react'
import { api } from '../services/api'
import dagre from 'dagre/dist/dagre.js'
import CustomEdge from './CustomEdge'
import { formatAddress, formatHash } from '../utils/format'

const nodeTypes = {
  normal: { background: '#3B82F6', border: '#2563EB' },
  incoming: { background: '#0f172a', border: '#22d3ee' },
  outgoing: { background: '#0f172a', border: '#fb923c' },
  highRisk: { background: '#ff3b3b', border: '#ff0000', boxShadow: '0 0 16px rgba(255, 0, 0, 0.4)' },
  exchange: { background: '#8B5CF6', border: '#7C3AED' },
  contract: { background: '#F59E0B', border: '#D97706' },
}

const IN_COLOR = '#22d3ee'
const OUT_COLOR = '#fb923c'
const DIRECT_TRANSFER_GRAY = '#6b7280'

/** Only Etherscan external txs (txlist) — excludes internal + ERC-20 rows. */
function isGraphNormalTx(tx) {
  if (!tx) return false
  if (tx.type === 'internal' || tx.type === 'erc20') return false
  if (tx.tokenSymbol) return false
  if (tx.type === 'normal') return true
  return Boolean(tx.hash && tx.from && tx.to && tx.value !== undefined && tx.value !== null)
}

/**
 * Same class of rows we want in the graph as “plain” table-style transfers:
 * txlist + empty / 0x input (no contract calls).
 */
function isPlainEthTransfer(tx) {
  if (!isGraphNormalTx(tx)) return false
  const input = (tx.input ?? '').toString().trim().toLowerCase()
  if (input && input !== '0x' && input !== '0x0') return false
  return true
}

function isNonCenterContractAddr(addr, center, txs) {
  const a = (addr || '').toLowerCase()
  const c = (center || '').toLowerCase()
  if (!a || a === c) return false
  return txs.some((tx) => {
    if (tx.is_contract !== true) return false
    return tx.from?.toLowerCase() === a || tx.to?.toLowerCase() === a
  })
}

/**
 * Legend-aligned edge styling (center = wallet under analysis):
 * - Outgoing: center is source → orange solid
 * - Incoming: center is target → cyan solid
 * - Other: peer plain-ETH link → solid gray
 */
function getLegendEdgeVisual(source, target, centerWallet) {
  const c = (centerWallet || '').toLowerCase()
  const s = (source || '').toLowerCase()
  const t = (target || '').toLowerCase()
  if (s === c) {
    return {
      stroke: OUT_COLOR,
      strokeDasharray: undefined,
      legend: 'outgoing',
    }
  }
  if (t === c) {
    return {
      stroke: IN_COLOR,
      strokeDasharray: undefined,
      legend: 'incoming',
    }
  }
  return {
    stroke: DIRECT_TRANSFER_GRAY,
    strokeDasharray: undefined,
    legend: 'peer',
  }
}

function inferDirectionFromCenter(addr, centerWallet, pairs) {
  const c = (centerWallet || '').toLowerCase()
  const a = (addr || '').toLowerCase()
  if (!a || a === c) return undefined
  let inFromCenter = false
  let outToCenter = false
  for (const { from, to } of pairs) {
    if (from === c && to === a) inFromCenter = true
    if (from === a && to === c) outToCenter = true
  }
  if (inFromCenter && !outToCenter) return 'incoming'
  if (outToCenter && !inFromCenter) return 'outgoing'
  if (inFromCenter && outToCenter) return 'incoming'
  return undefined
}

function getNodeStyle(type, isCenter = false) {
  const colors = nodeTypes[type] || nodeTypes.normal
  return {
    background: colors.background,
    border: isCenter ? `4px solid ${colors.border}` : `2px solid ${colors.border}`,
    color: '#fff',
    padding: 16,
    borderRadius: 12,
    width: 200,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    ...(isCenter && type !== 'highRisk' && { boxShadow: '0 0 20px rgba(59, 130, 246, 0.5)' }),
    ...(colors.boxShadow && { boxShadow: colors.boxShadow }),
  }
}

function NodeWithBadge({ data }) {
  const isIn = data.type === 'incoming' || data.direction === 'incoming'
  const isOut = data.type === 'outgoing' || data.direction === 'outgoing'
  const isHighRisk = data.riskLevel === 'HIGH' || data.riskLevel === 'CRITICAL' || (typeof data.riskScore === 'number' && data.riskScore >= 80)
  const isCritical = data.riskLevel === 'CRITICAL'
  const showInOutBadge = (isIn || isOut) && !data.isCenter
  const showHighRiskBadge = isHighRisk && !data.isCenter
  return (
    <div
      className={`relative w-full h-full flex items-center justify-center rounded-xl ${isCritical ? 'animate-pulse' : ''}`}
      style={isCritical ? { animationDuration: '2s' } : undefined}
    >
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !border-2 !bg-surface" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !border-2 !bg-surface" />
      {showInOutBadge && (
        <span
          className="absolute -top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded"
          style={{
            background: isIn ? IN_COLOR : OUT_COLOR,
            color: '#0f172a',
          }}
        >
          {isIn ? 'IN' : 'OUT'}
        </span>
      )}
      {showHighRiskBadge && (
        <span
          className="absolute -top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded"
          style={{
            background: '#8B0000',
            color: '#fff',
          }}
        >
          HIGH RISK
        </span>
      )}
      <div className="whitespace-pre-line text-center text-xs text-white">{data.label}</div>
    </div>
  )
}

const customNodeTypes = {
  default: NodeWithBadge,
}

const customEdgeTypes = {
  custom: CustomEdge,
}

const getLayoutedElements = (nodes, edges, direction = 'LR') => {
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))

  const isHorizontal = direction === 'LR'
  dagreGraph.setGraph({ rankdir: direction, ranksep: 200, nodesep: 80 })

  nodes.forEach((node) => {
    // dagre needs node dimensions
    dagreGraph.setNode(node.id, { width: 220, height: 80 })
  })

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target)
  })

  dagre.layout(dagreGraph)

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id)
    node.targetPosition = isHorizontal ? 'left' : 'top'
    node.sourcePosition = isHorizontal ? 'right' : 'bottom'

    // We are shifting the dagre node position (anchor=center) to ReactFlow (anchor=top left)
    node.position = {
      x: nodeWithPosition.x - 110,
      y: nodeWithPosition.y - 40,
    }
  })

  return { nodes, edges }
}

export default function GraphVisualization({ data, onBack }) {
  const initialNodes = useMemo(() => {
    if (!data || !data.wallet) return []
    const balance = typeof data.balance === 'number' ? data.balance : parseFloat(data.balance) || 0
    const label = `${formatAddress(data.wallet, 10, 8)}\n${balance.toFixed(4)} ${data.currency || 'ETH'}`
    const risk = typeof data.risk_score === 'number' ? data.risk_score : 0
    const centerVisualType = risk >= 80 ? 'highRisk' : 'normal'
    const centerNode = {
      id: 'center',
      position: { x: 400, y: 300 }, // centered
      data: { 
        label, 
        isCenter: true,
        address: data.wallet,
        balance: balance,
        transactions: data.transaction_count ?? 0,
        type: centerVisualType,
        riskScore: risk,
      },
      style: {
        ...getNodeStyle(centerVisualType, true),
        width: 220,
        height: 70,
      },
      type: 'default',
    }
    return [centerNode]
  }, [data])

  const initialEdges = useMemo(() => [], [])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedNode, setSelectedNode] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [reactFlowInstance, setReactFlowInstance] = useState(null)
  const [showMinimap, setShowMinimap] = useState(false)
  const [hoveredNodeId, setHoveredNodeId] = useState(null)
  const [hoveredEdgeId, setHoveredEdgeId] = useState(null)
  const [edgeTooltip, setEdgeTooltip] = useState(null)
  const [edgeTooltipPos, setEdgeTooltipPos] = useState({ x: 0, y: 0 })
  const [viewMode, setViewMode] = useState('NETWORK') // 'NETWORK' or 'INVESTIGATION'
  const [minEthFilter, setMinEthFilter] = useState(0.01)

  // Helper to process transactions without calling API
  const processTransactionsForGraph = useCallback((newTxs, sourceAddress, currentNodes, currentEdges) => {
    const currency = data?.currency || 'ETH'
    const txs = (newTxs || []).filter(isPlainEthTransfer)
    const edgePairs = txs.map((tx) => ({
      from: (tx.from || '').toLowerCase(),
      to: (tx.to || '').toLowerCase(),
    }))

    const addressToNodeId = new Map()
    currentNodes.forEach(n => {
      addressToNodeId.set(n.id, n.id)
      if (n.data?.address) {
        addressToNodeId.set(n.data.address.toLowerCase(), n.id)
      }
    })

    const checkNodeExists = (addr, pendingNodes = []) => {
      if (addressToNodeId.has(addr)) return true
      return pendingNodes.some(n => n.id === addr || n.data?.address?.toLowerCase() === addr)
    }
    const getNodeId = (addr, pendingNodes = []) => {
      if (addressToNodeId.has(addr)) return addressToNodeId.get(addr)
      const pending = pendingNodes.find(n => n.id === addr || n.data?.address?.toLowerCase() === addr)
      return pending ? pending.id : addr
    }

    const existingEdgeIds = new Set(currentEdges.map(e => e.id))
    const addressesToProcess = new Set()
    txs.forEach((tx) => {
      if (tx.from) addressesToProcess.add(tx.from.toLowerCase())
      if (tx.to) addressesToProcess.add(tx.to.toLowerCase())
    })

    const valueByAddress = new Map()
    addressesToProcess.forEach(addr => {
      const total = txs.reduce((sum, tx) => {
        if (tx.from?.toLowerCase() === addr || tx.to?.toLowerCase() === addr) {
          return sum + (parseFloat(tx.value) || 0)
        }
        return sum
      }, 0)
      valueByAddress.set(addr, total)
    })

    const nodesToAdd = []
    const sourceNode = currentNodes.find(n => n.data.address?.toLowerCase() === sourceAddress.toLowerCase()) || currentNodes[0]
    const centerX = sourceNode ? sourceNode.position.x : 400
    const centerY = sourceNode ? sourceNode.position.y : 300
    const radius = 300
    const unplacedAddresses = [...addressesToProcess].filter(
      (addr) =>
        !addressToNodeId.has(addr) && !isNonCenterContractAddr(addr, sourceAddress, txs),
    )

    unplacedAddresses.forEach((addr, i) => {
      const angle = (2 * Math.PI * i) / (unplacedAddresses.length || 1)
      const x = centerX + radius * Math.cos(angle)
      const y = centerY + radius * Math.sin(angle)
      const val = valueByAddress.get(addr) || 0
      
      const isContractAddr = txs.some(tx => 
        (tx.to?.toLowerCase() === addr && tx.is_contract === true) ||
        (tx.from?.toLowerCase() === addr && tx.is_contract === true)
      )
      const visualType = getNodeType(addr, isContractAddr)
      const direction = inferDirectionFromCenter(addr, sourceAddress, edgePairs)

      const addrTimes = txs
        .filter(tx => tx.from?.toLowerCase() === addr || tx.to?.toLowerCase() === addr)
        .map(tx => tx.time).filter(Boolean).sort()
      const firstSeen = addrTimes.length > 0 ? new Date(addrTimes[0]).toLocaleDateString() : null
      const lastActive = addrTimes.length > 0 ? new Date(addrTimes[addrTimes.length - 1]).toLocaleDateString() : null

      nodesToAdd.push({
        id: addr,
        position: { x, y },
        data: {
          label: `${formatAddress(addr, 6, 4)}\n${val.toFixed(4)} ${currency}`,
          address: addr, balance: val, transactions: 1, type: visualType, direction, is_contract: isContractAddr, firstSeen, lastActive,
        },
        style: { ...getNodeStyle(visualType), width: 180, height: 60, opacity: 1 },
        type: 'default',
        sourcePosition: viewMode === 'INVESTIGATION' ? 'right' : 'bottom',
        targetPosition: viewMode === 'INVESTIGATION' ? 'left' : 'top',
      })
    })

    const edgesToAdd = []
    txs.forEach((tx, idx) => {
      const from = (tx.from || '').toLowerCase()
      const to = (tx.to || '').toLowerCase()
      if (!from || !to) return
      if (isNonCenterContractAddr(from, sourceAddress, txs) || isNonCenterContractAddr(to, sourceAddress, txs)) return
      const eid = `e-${tx.hash || Date.now()}-${from}-${to}-${idx}`
      if (existingEdgeIds.has(eid)) return

      if (checkNodeExists(from, nodesToAdd) && checkNodeExists(to, nodesToAdd)) {
        const val = parseFloat(tx.value) || 0
        const vis = getLegendEdgeVisual(from, to, sourceAddress)
        edgesToAdd.push({
          id: eid, source: getNodeId(from, nodesToAdd), target: getNodeId(to, nodesToAdd),
          type: viewMode === 'INVESTIGATION' ? 'custom' : 'default',
          style: { stroke: vis.stroke, strokeWidth: 2, strokeDasharray: vis.strokeDasharray },
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed, color: vis.stroke },
          data: {
            value: val,
            isTop10: false,
            label: `${val.toFixed(4)} ETH`,
            fromAddr: from,
            toAddr: to,
            hash: tx.hash || '',
            legend: vis.legend,
          },
        })
      }
    })

    if (nodesToAdd.length > 0 || edgesToAdd.length > 0) {
      // NOTE: We do not use functional update with prev because getLayoutedElements
      // needs access to the FULL array of nodes and edges simultaneously.
      // Since we pass currentNodes and currentEdges correctly, we can construct the new array.
      let newNodes = [...currentNodes, ...nodesToAdd];
      let newEdges = [...currentEdges, ...edgesToAdd];

      if (viewMode === 'INVESTIGATION') {
        const layouted = getLayoutedElements(newNodes, newEdges)
        newNodes = [...layouted.nodes]
        newEdges = [...layouted.edges]
      }

      setNodes(newNodes);
      setEdges(newEdges);
    }
  }, [data, viewMode, setNodes, setEdges])

  // Initialize / update graph when backend data changes.
  // Priority:
  // 1) If backend provides a graph (data.graph.nodes / data.graph.edges), render that directly.
  // 2) Otherwise, fall back to building the graph from data.transactions.
  useEffect(() => {
    console.log('[GraphVisualization] data prop changed, re-initializing graph. data:', data)
    setViewMode('NETWORK')

    // Always start from a fresh center node based on the latest wallet
    setNodes([...initialNodes])
    setEdges([...initialEdges])

    // STEP 1: Prefer backend-provided graph structure if available
    if (
      Array.isArray(data?.graph?.nodes) &&
      data.graph.nodes.length > 0 &&
      Array.isArray(data?.graph?.edges) &&
      data.graph.edges.length > 0
    ) {
      console.log('[GraphVisualization] Using backend graph from API:', data.graph)

      const backendNodes = Array.isArray(data.graph.nodes) ? data.graph.nodes : []
      const backendEdges = Array.isArray(data.graph.edges) ? data.graph.edges : []
      const centerWallet = data.wallet || ''
      const filteredBackendEdges = backendEdges.filter(
        (e) => String(e.type || 'eth').toLowerCase() === 'eth',
      )

      const edgePairsForDir = filteredBackendEdges
        .map((e) => ({
          from: String(e.from || e.source || '').toLowerCase(),
          to: String(e.to || e.target || '').toLowerCase(),
        }))
        .filter((p) => p.from && p.to)

      const addrInGraph = new Set([(centerWallet || '').toLowerCase()])
      edgePairsForDir.forEach(({ from, to }) => {
        addrInGraph.add(from)
        addrInGraph.add(to)
      })

      // Basic ReactFlow node conversion (only addresses that appear on normal-tx edges)
      const rfNodes = backendNodes
        .filter((node) => {
          const addr = String(node.address || node.id || '').toLowerCase()
          return addrInGraph.has(addr)
        })
        .map((node, index) => {
        const rawId = node.id || node.address || `node-${index}`
        const id = String(rawId)
        const address = node.address || node.data?.address || id
        const label =
          node.label ||
          node.data?.label ||
          (address ? formatAddress(String(address), 10, 4) : id)

        const isCenter =
          id === 'center' ||
          (data.wallet &&
            String(address || '').toLowerCase() === data.wallet.toLowerCase())

        const baseType = node.data?.type || node.type || 'normal'
        const direction = inferDirectionFromCenter(String(address).toLowerCase(), centerWallet, edgePairsForDir)

        return {
          id,
          position: { x: 0, y: 0 },
          data: {
            ...node.data,
            label,
            address,
            type: baseType,
            isCenter,
            direction,
          },
          style: {
            ...getNodeStyle(baseType, isCenter),
            ...(node.style || {}),
          },
          type: 'default',
        }
      })

      // For edge validation we need the set of node ids
      const nodeIdSet = new Set(rfNodes.map((n) => n.id))

      // ReactFlow edges — legend-aligned stroke / dash (only normal txlist edge types)
      const rfEdges = filteredBackendEdges
        .map((edge, index) => {
          const source = String(edge.from || edge.source || '')
          const target = String(edge.to || edge.target || '')
          if (!source || !target) return null
          if (!nodeIdSet.has(source) || !nodeIdSet.has(target)) return null

          const vis = getLegendEdgeVisual(source, target, centerWallet)
          const rawVal = edge.value ?? edge.data?.value
          const valNum = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal ?? '0')) || 0

          return {
            id: String(edge.id || `edge-${index}`),
            source,
            target,
            type: 'default',
            label: valNum ? `${valNum.toFixed(4)} ETH` : '',
            animated: true,
            data: {
              ...(edge.data || {}),
              value: valNum,
              label: valNum ? `${valNum.toFixed(4)} ETH` : '',
              fromAddr: source,
              toAddr: target,
              hash: edge.hash || edge.data?.hash || '',
              legend: vis.legend,
            },
            style: {
              stroke: vis.stroke,
              strokeWidth: 2,
              strokeDasharray: vis.strokeDasharray,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: vis.stroke,
            },
          }
        })
        .filter(Boolean)

      console.log('[GraphVisualization] RF Nodes:', rfNodes)
      console.log('[GraphVisualization] RF Edges:', rfEdges)

      // Apply dagre layout for nicer positioning
      const layouted = getLayoutedElements([...rfNodes], [...rfEdges])
      setNodes([...layouted.nodes])
      setEdges([...layouted.edges])
      return
    }

    // STEP 2: Fallback — build graph from transactions if graph is not present
    const normalOnlyTxs = (data?.transactions || []).filter(isGraphNormalTx)
    if (normalOnlyTxs.length > 0) {
      console.log(
        '[GraphVisualization] No backend graph found. Building graph from normal txs only. tx count=',
        normalOnlyTxs.length,
      )
      processTransactionsForGraph(
        normalOnlyTxs,
        data.wallet,
        initialNodes,
        initialEdges,
      )
    }
  }, [data, initialNodes, initialEdges, processTransactionsForGraph])

  // Fit view once container and nodes are ready
  useEffect(() => {
    if (reactFlowInstance && nodes.length > 0) {
      const t = setTimeout(() => reactFlowInstance.fitView({ padding: 0.2 }), 100)
      return () => clearTimeout(t)
    }
  }, [reactFlowInstance, nodes.length])

  // Determine node visual type using backend-provided data fields.
  // is_contract is set by the backend via eth_getCode — no randomness.
  const getNodeType = (address, isContract = false) => {
    if (!address || typeof address !== 'string') return 'normal'
    if (isContract) return 'contract'
    return 'normal'
  }

  const expandConnections = useCallback(async (targetAddress) => {
    // If no specific address is provided, it might be the initial load or a reset, 
    // but for "Expand", we expect a targetAddress.
    // If targetAddress is missing, we might fallback to data.wallet or just return.
    const addressToExpand = targetAddress || data?.wallet
    if (!addressToExpand || loading) return

    console.log(`[Expand] Triggered for ${addressToExpand}`)
    setLoading(true)

    try {
      // 1. Fetch new data for the specific address
      // We use a small hop count (e.g., 1) to get immediate neighbors
      console.log(`[Expand] Fetching data for ${addressToExpand}...`)
      const newData = await api.fetchWalletDashboard(addressToExpand, 1) // default hops=1 for expansion
      console.log('[Expand] Response:', newData)
      console.log('[Expand] Transactions received:', newData?.transactions?.length ?? 0)

      const newTxs = (newData?.transactions || []).filter(isPlainEthTransfer)
      if (!newData || newTxs.length === 0) {
        console.log('[Expand] No new normal transactions found.')
        return
      }

      processTransactionsForGraph(newTxs, addressToExpand, nodes, edges)

    } catch (error) {
      console.error('[Expand] Error:', error)
    } finally {
      setLoading(false)
    }
  }, [data, loading, nodes, edges, setNodes, setEdges])

  const onNodeClick = useCallback((event, node) => {
    if (node.id === 'center') {
      expandConnections()
    } else {
      setSelectedNode(node)
      setDrawerOpen(true)
    }
  }, [expandConnections])

  const closeDrawer = () => {
    setDrawerOpen(false)
    setSelectedNode(null)
  }

  const displayNodes = useMemo(() => {
    // Basic nodes if no hover interaction
    if (!hoveredNodeId && !hoveredEdgeId) {
      return nodes.map(n => ({
        ...n,
        style: {
          ...n.style,
          opacity: 1,
          zIndex: 1, // Default z-index
        }
      }))
    }

    const connected = new Set()
    if (hoveredNodeId) {
      edges.forEach((e) => {
        if (e.source === hoveredNodeId || e.target === hoveredNodeId) {
          connected.add(e.source)
          connected.add(e.target)
        }
      })
    }
    if (hoveredEdgeId) {
      const edge = edges.find((e) => e.id === hoveredEdgeId)
      if (edge) {
        connected.add(edge.source)
        connected.add(edge.target)
      }
    }

    return nodes.map((n) => {
      const isHovered = n.id === hoveredNodeId
      const isConnected = connected.has(n.id)
      const isRelated = isHovered || isConnected
      const isHoveredEdgeRelated = hoveredEdgeId && isConnected

      let opacity = 0.2 // Default dimmed opacity
      let zIndex = 0    // Default low z-index
      let boxShadow = n.style?.boxShadow

      if (isRelated || isHoveredEdgeRelated) {
        opacity = 1
        zIndex = isHovered ? 10 : 5 // Hovered on top, connected slightly below

        if (isHovered) {
          boxShadow = '0 0 24px rgba(0, 240, 255, 0.45)'
        }
      }

      return {
        ...n,
        style: {
          ...n.style,
          opacity,
          zIndex,
          boxShadow,
        },
      }
    })
  }, [nodes, edges, hoveredNodeId, hoveredEdgeId])

  // Process edges based on viewMode and minimum threshold
  const processedGraphEdges = useMemo(() => {
    let sourceEdges = edges;

    // In INVESTIGATION mode, apply threshold and aggregations
    if (viewMode === 'INVESTIGATION') {
      // 1. Filter out edges below threshold
      let filtered = sourceEdges.filter(e => !e.data?.value || e.data.value >= minEthFilter);

      // 2. Aggregate edges between same source/target
      const grouped = new Map();
      filtered.forEach(e => {
        const key = `${e.source}-${e.target}`;
        if (!grouped.has(key)) {
          grouped.set(key, { ...e, data: { ...e.data, count: 1 } });
        } else {
          const merged = grouped.get(key);
          const combinedVal = merged.data.value + (e.data?.value || 0);
          merged.data.value = combinedVal;
          merged.data.label = `${combinedVal.toFixed(2)} ETH`;
          merged.data.count += 1;
        }
      });

      filtered = Array.from(grouped.values());

      // 3. Highlight top 10 edges
      const sortedByValue = [...filtered].sort((a, b) => (b.data?.value || 0) - (a.data?.value || 0));
      const top10Keys = new Set(sortedByValue.slice(0, 10).map(e => e.id));

      // Calculate max value for thickness scaling
      const maxVal = sortedByValue[0]?.data?.value || 1;

      filtered = filtered.map(e => {
        const isTop10 = top10Keys.has(e.id);
        const ratio = Math.max(0.1, Math.min(1, (e.data?.value || 0) / maxVal));
        const thickness = 1 + (ratio * 5); // From 1px to 6px thick

        return {
          ...e,
          type: 'custom',
          sourcePosition: 'right',
          targetPosition: 'left',
          data: {
            ...e.data,
            isTop10,
            thickness
          }
        };
      });

      sourceEdges = filtered;
    } else {
      // Reset to default lines for network view
      sourceEdges = sourceEdges.map(e => ({
        ...e,
        type: 'default',
        sourcePosition: 'bottom',
        targetPosition: 'top',
      }));
    }

    return sourceEdges;
  }, [edges, viewMode, minEthFilter]);

  const displayEdges = useMemo(() => {
    if (!hoveredNodeId && !hoveredEdgeId) return processedGraphEdges

    const highlightEdgeIds = new Set()
    if (hoveredNodeId) {
      processedGraphEdges.forEach((e) => {
        if (e.source === hoveredNodeId || e.target === hoveredNodeId) {
          highlightEdgeIds.add(e.id)
        }
      })
    }
    if (hoveredEdgeId) {
      highlightEdgeIds.add(hoveredEdgeId)
    }

    return processedGraphEdges.map((e) => {
      const isHighlight = highlightEdgeIds.has(e.id)
      const baseWidth = e.style?.strokeWidth || 2
      const width = isHighlight ? baseWidth + 1.5 : baseWidth
      const opacity = isHighlight ? 1 : 0.15
      const zIndex = isHighlight ? 10 : 0

      return {
        ...e,
        style: {
          ...e.style,
          strokeWidth: width,
          opacity,
        },
        zIndex,
        animated: isHighlight || e.animated // Keep animation if highlighted or originally animated
      }
    })
  }, [processedGraphEdges, hoveredNodeId, hoveredEdgeId])

  // ReactFlow requires parent with explicit width and height - use inline style so it always renders
  const graphContainerStyle = {
    width: '100%',
    height: '70vh',
    minHeight: 500,
    background: '#0B0F17',
  }

  // Debug: log nodes and edges before render (ensure edges array and config are valid)
  console.log('[Graph] render: displayNodes=', displayNodes.length, 'displayEdges=', displayEdges.length, 'edges state=', edges.length, 'displayEdges sample=', displayEdges[0])

  if (!data || !data.wallet) {
    return (
      <div className="h-screen flex flex-col bg-background items-center justify-center gap-4 p-6">
        <div className="bg-card border border-border px-6 py-4 flex items-center justify-between w-full max-w-2xl rounded-lg">
          <button onClick={onBack} className="bg-border hover:bg-border/80 px-4 py-2 rounded-lg font-medium">
            ← Back
          </button>
          <div className="flex items-center gap-2">
            <img src="/chakra-logo.png" alt="CHAKRA" className="h-6 w-auto object-contain" />
            <span className="text-xl font-bold text-textPrimary">Transaction Graph</span>
          </div>
        </div>
        <div className="text-textSecondary text-lg">No wallet data. Scan a wallet from the dashboard first.</div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-background" style={{ minHeight: 600 }}>
      {/* Header bar */}
      <div className="flex-shrink-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
        <button onClick={onBack} className="bg-border hover:bg-border/80 px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors">
          ← Back
        </button>
        <div className="flex items-center gap-2">
          <img src="/chakra-logo.png" alt="CHAKRA" className="h-6 w-auto object-contain" />
          <span className="text-xl font-bold text-textPrimary">Transaction Graph</span>
        </div>

        <div className="flex items-center gap-6">
          {/* Toggle View Mode */}
          <div className="flex items-center bg-surface p-1 rounded-lg border border-border">
            <button
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'NETWORK' ? 'bg-primary text-background' : 'text-textSecondary hover:text-textPrimary'}`}
              onClick={() => {
                setViewMode('NETWORK')
                // Restore logic radial if needed, but simple re-layout is fine
              }}
            >
              <Network size={16} /> Network
            </button>
            <button
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'INVESTIGATION' ? 'bg-primary text-background' : 'text-textSecondary hover:text-textPrimary'}`}
              onClick={() => {
                setViewMode('INVESTIGATION')
                const layouted = getLayoutedElements(nodes, edges)
                setNodes([...layouted.nodes])
                setEdges([...layouted.edges])
                if (reactFlowInstance) {
                  setTimeout(() => reactFlowInstance.fitView({ padding: 0.2 }), 50)
                }
              }}
            >
              <GitGraph size={16} /> Investigation Flow
            </button>
          </div>

          {viewMode === 'INVESTIGATION' && (
            <div className="flex items-center gap-2 text-sm text-textSecondary border-r border-border pr-6">
              <label>Min ETH</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="bg-surface border border-border rounded px-2 py-1 w-20 text-white"
                value={minEthFilter}
                onChange={(e) => setMinEthFilter(parseFloat(e.target.value) || 0)}
              />
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowMinimap((v) => !v)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${showMinimap ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-border/50 text-textSecondary hover:text-textPrimary border border-border'}`}
              title={showMinimap ? 'Hide minimap' : 'Show minimap'}
            >
              <MapIcon size={16} />
              {showMinimap ? 'Hide minimap' : 'Show minimap'}
            </button>
            <span className="text-textSecondary text-sm">
              {loading ? 'Loading...' : 'Click center node to expand'}
            </span>
          </div>
        </div>
      </div>

      {/* Graph area with optional Wallet Details overlay at top-left */}
      <div className="relative flex-1 min-h-0">
        <div style={graphContainerStyle} className="relative">
          <ReactFlow
            key={data.wallet}
            nodes={displayNodes}
            edges={displayEdges}
            nodeTypes={customNodeTypes}
            edgeTypes={customEdgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)}
            onNodeMouseLeave={() => setHoveredNodeId(null)}
            onEdgeMouseEnter={(evt, edge) => {
              setHoveredEdgeId(edge.id)
              const rect = evt.currentTarget?.closest('.react-flow')?.getBoundingClientRect()
              if (rect) {
                setEdgeTooltipPos({ x: evt.clientX - rect.left, y: evt.clientY - rect.top })
                setEdgeTooltip(edge.data || null)
              }
            }}
            onEdgeMouseLeave={() => {
              setHoveredEdgeId(null)
              setEdgeTooltip(null)
            }}
            onInit={setReactFlowInstance}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          >
            <Background color="#1F2937" gap={30} />
            <Controls />
            {showMinimap && <MiniMap />}
            <Panel position="top-right" className="m-4">
              <div className="bg-card/95 border border-border rounded-lg shadow-lg px-4 py-3 text-left text-xs space-y-2 min-w-[200px] max-w-[240px]">
                <div className="font-semibold text-textPrimary border-b border-border pb-1.5">Legend</div>
                <p className="text-[10px] text-muted leading-snug">
                  Graph shows <span className="text-textSecondary">plain ETH transfers</span> only (txlist with 0x input — same class as simple transfers, no contract calls). Smart-contract counterparties are omitted unless it is the wallet you opened.
                </p>
                <div className="text-[10px] font-semibold text-textSecondary uppercase tracking-wide pt-1">Edges</div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-5" style={{ borderTop: `2px solid ${OUT_COLOR}` }} />
                  <span className="text-textSecondary">Outgoing (from focused wallet)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-5" style={{ borderTop: `2px solid ${IN_COLOR}` }} />
                  <span className="text-textSecondary">Incoming (to focused wallet)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-5" style={{ borderTop: `2px solid ${DIRECT_TRANSFER_GRAY}` }} />
                  <span className="text-textSecondary">Peer (plain ETH, neither end is focused wallet)</span>
                </div>
                <div className="text-[10px] font-semibold text-textSecondary uppercase tracking-wide pt-1">Nodes</div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: nodeTypes.normal.background, border: `2px solid ${nodeTypes.normal.border}` }} />
                  <span className="text-textSecondary">Wallet (EOA)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: nodeTypes.highRisk.background, border: `2px solid ${nodeTypes.highRisk.border}` }} />
                  <span className="text-textSecondary">High risk (score ≥ 80)</span>
                </div>
              </div>
            </Panel>
            {edgeTooltip && (
              <div
                className="absolute z-10 pointer-events-none bg-card border border-border rounded-lg shadow-xl px-3 py-2 text-left text-xs max-w-[280px]"
                style={{
                  left: edgeTooltipPos.x + 12,
                  top: edgeTooltipPos.y + 8,
                }}
              >
                <div className="font-mono text-textPrimary truncate">
                  {formatAddress(edgeTooltip.fromAddr, 10, 0)} → {formatAddress(edgeTooltip.toAddr, 10, 0)}
                </div>
                <div className="text-textSecondary mt-0.5">
                  Amount: {typeof edgeTooltip.value === 'number' ? edgeTooltip.value.toFixed(4) : edgeTooltip.value} ETH
                </div>
                {edgeTooltip.hash && (
                  <div className="text-muted truncate mt-0.5" title={edgeTooltip.hash}>
                    {formatHash(edgeTooltip.hash, 18, 0)}
                  </div>
                )}
              </div>
            )}
          </ReactFlow>
        </div>

        {/* Wallet Details panel - top-left overlay */}
        {drawerOpen && selectedNode && (
          <div className="absolute left-4 top-4 z-10 w-80 bg-card border border-border rounded-lg shadow-xl flex flex-col max-h-[calc(70vh-2rem)]">
            <div className="p-4 border-b border-border flex items-center justify-between flex-shrink-0">
              <h3 className="text-lg font-semibold text-textPrimary">Wallet Details</h3>
              <button onClick={closeDrawer} className="p-1 hover:bg-border rounded" aria-label="Close">
                <X size={20} className="text-textSecondary" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-textSecondary">Address</label>
                <div className="font-mono text-sm text-textPrimary break-all">{selectedNode.data.address}</div>
              </div>

              <div>
                <label className="text-sm font-medium text-textSecondary">Balance</label>
                <div className="text-lg font-semibold text-textPrimary">
                  {selectedNode.data.balance?.toFixed(4) || 'N/A'} {data?.currency || 'ETH'}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-textSecondary">Total Transactions</label>
                <div className="text-lg font-semibold text-textPrimary">{selectedNode.data.transactions || 'N/A'}</div>
              </div>

              <div>
                <label className="text-sm font-medium text-textSecondary">Risk Score</label>
                <div className="text-lg font-semibold text-success">LOW</div>
              </div>

              <div>
                <label className="text-sm font-medium text-textSecondary">First Seen</label>
                <div className="text-sm text-textSecondary">
                  {selectedNode.data.firstSeen || '—'}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-textSecondary">Last Active</label>
                <div className="text-sm text-textSecondary">
                  {selectedNode.data.lastActive || '—'}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-textSecondary">Type</label>
                <div className="text-sm text-textPrimary capitalize flex items-center gap-2">
                  {selectedNode.data.type || 'normal'}
                  {selectedNode.data.is_contract && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 font-semibold">CONTRACT</span>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-border flex-shrink-0">
              <button
                onClick={() => expandConnections(selectedNode.data.address)}
                className="w-full bg-primary hover:bg-primary/80 text-background font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                Expand Connections <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

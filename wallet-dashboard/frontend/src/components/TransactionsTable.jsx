import { useState, useMemo } from 'react'
import { ArrowUpDown, Search, Filter } from 'lucide-react'
import { TableSkeleton } from './ui/Skeleton'

export default function TransactionsTable({ 
  transactions, 
  currency, 
  loading, 
  totalCount = 0, 
  onPageChange, 
  currentPage = 1,
  pageSize = 10
}) {
  const [sortField, setSortField] = useState('time')
  const [sortDirection, setSortDirection] = useState('desc')
  const [searchTerm, setSearchTerm] = useState('')
  const itemsPerPage = pageSize // Match the dynamic limit from the dashboard

  const sortedAndFilteredTransactions = useMemo(() => {
    if (!transactions || transactions.length === 0) return []

    let filtered = transactions.filter(
      (tx) =>
        (tx.hash && tx.hash.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (tx.from && tx.from.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (tx.to && tx.to.toLowerCase().includes(searchTerm.toLowerCase()))
    )

    filtered.sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]

      if (sortField === 'time') {
        aVal = new Date(aVal)
        bVal = new Date(bVal)
      } else if (sortField === 'value') {
        aVal = parseFloat(aVal || 0)
        bVal = parseFloat(bVal || 0)
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return filtered
  }, [transactions, sortField, sortDirection, searchTerm])

  const totalPages = Math.ceil(totalCount / itemsPerPage)

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const getRiskFlag = (tx) => {
    const value = parseFloat(tx.value || 0)
    if (value > 10) return 'HIGH'
    if (value > 1) return 'MEDIUM'
    return 'LOW'
  }

  if (loading) {
    return <TableSkeleton rows={10} />
  }

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden" data-testid="transactions-table">
      {/* Search and Filters */}
      <div className="p-6 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search
              size={20}
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted pointer-events-none"
            />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-surface border border-border rounded-lg pl-10 pr-4 py-2 text-textPrimary placeholder-muted focus:outline-none focus:border-primary focus:ring-0 focus:shadow-[0_0_0_1px_#00F0FF] caret-primary transition-all"
              placeholder="Search local page..."
              data-testid="transaction-search-input"
            />
          </div>
        </div>
        <div className="text-xs text-muted">
          Showing {totalCount > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} - {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount.toLocaleString()} total
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-surface sticky top-0">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-medium text-textSecondary uppercase tracking-wider">Tx Hash</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-textSecondary uppercase tracking-wider">From</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-textSecondary uppercase tracking-wider">To</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-textSecondary uppercase tracking-wider">Amount</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-textSecondary uppercase tracking-wider">Timestamp</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-textSecondary uppercase tracking-wider">Risk Flag</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedAndFilteredTransactions.map((tx, index) => {
              const risk = getRiskFlag(tx)
              return (
                <tr
                  key={tx.hash ? `${tx.hash}-${index}` : `row-${index}`}
                  className="hover:bg-background/50 transition-all duration-200"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-primary">
                    {tx.hash ? `${tx.hash.slice(0, 10)}...` : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-textPrimary">
                    {tx.from ? `${tx.from.slice(0, 10)}...` : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-textPrimary">
                    {tx.to ? `${tx.to.slice(0, 10)}...` : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-textPrimary">
                    {parseFloat(tx.value || 0).toFixed(4)} {currency}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-textSecondary">
                    {tx.time ? new Date(tx.time).toLocaleString() : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      risk === 'HIGH' ? 'bg-danger/20 text-danger border border-danger/30' :
                      risk === 'MEDIUM' ? 'bg-warning/20 text-warning border border-warning/30' :
                      'bg-success/20 text-success border border-success/30'
                    }`}>
                      {risk}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div className="px-6 py-4 border-t border-border flex items-center justify-between">
        <div className="flex space-x-2">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1 border border-border rounded text-textSecondary hover:bg-border disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          
          <div className="flex items-center px-4 text-sm font-mono text-primary">
            Page {currentPage} of {totalPages || 1}
          </div>

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="px-3 py-1 border border-border rounded text-textSecondary hover:bg-border disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
        <div className="text-xs text-muted uppercase tracking-widest">
          Live Blockchain Paging
        </div>
      </div>
    </div>
  )
}

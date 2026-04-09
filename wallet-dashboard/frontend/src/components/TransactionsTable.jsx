import { useState, useMemo } from 'react'
import { ArrowUpDown, Search, Filter } from 'lucide-react'
import { TableSkeleton } from './ui/Skeleton'

export default function TransactionsTable({ transactions, currency, loading }) {
  const [sortField, setSortField] = useState('time')
  const [sortDirection, setSortDirection] = useState('desc')
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [riskFilter, setRiskFilter] = useState('ALL')
  const itemsPerPage = 10

  const sortedAndFilteredTransactions = useMemo(() => {
    if (!transactions || transactions.length === 0) return []

    let filtered = transactions.filter(
      (tx) =>
        (tx.hash && tx.hash.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (tx.from && tx.from.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (tx.to && tx.to.toLowerCase().includes(searchTerm.toLowerCase()))
    )

    if (riskFilter !== 'ALL') {
      filtered = filtered.filter((tx) => getRiskFlag(tx) === riskFilter)
    }

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
  }, [transactions, sortField, sortDirection, searchTerm, riskFilter])

  const paginatedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return sortedAndFilteredTransactions.slice(startIndex, startIndex + itemsPerPage)
  }, [sortedAndFilteredTransactions, currentPage])

  const totalPages = Math.ceil(sortedAndFilteredTransactions.length / itemsPerPage)

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
              placeholder="Search transactions..."
              data-testid="transaction-search-input"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-muted" />
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="bg-surface border border-border rounded-lg px-3 py-2 text-textPrimary placeholder-muted focus:outline-none focus:border-primary focus:ring-0 focus:shadow-[0_0_0_1px_#00F0FF] caret-primary transition-all"
              data-testid="risk-filter-select"
            >
              <option value="ALL">All Risk Levels</option>
              <option value="LOW">Low Risk</option>
              <option value="MEDIUM">Medium Risk</option>
              <option value="HIGH">High Risk</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-surface sticky top-0">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-medium text-textSecondary uppercase tracking-wider">
                <button
                  onClick={() => handleSort('hash')}
                  className="flex items-center hover:text-textPrimary transition-colors"
                  data-testid="sort-hash-button"
                >
                  Tx Hash <ArrowUpDown size={14} className="ml-1" />
                </button>
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium text-textSecondary uppercase tracking-wider">
                <button
                  onClick={() => handleSort('from')}
                  className="flex items-center hover:text-textPrimary transition-colors"
                  data-testid="sort-from-button"
                >
                  From <ArrowUpDown size={14} className="ml-1" />
                </button>
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium text-textSecondary uppercase tracking-wider">
                <button
                  onClick={() => handleSort('to')}
                  className="flex items-center hover:text-textPrimary transition-colors"
                  data-testid="sort-to-button"
                >
                  To <ArrowUpDown size={14} className="ml-1" />
                </button>
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium text-textSecondary uppercase tracking-wider">
                <button
                  onClick={() => handleSort('value')}
                  className="flex items-center hover:text-textPrimary transition-colors"
                  data-testid="sort-value-button"
                >
                  Amount <ArrowUpDown size={14} className="ml-1" />
                </button>
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium text-textSecondary uppercase tracking-wider">
                <button
                  onClick={() => handleSort('time')}
                  className="flex items-center hover:text-textPrimary transition-colors"
                  data-testid="sort-time-button"
                >
                  Timestamp <ArrowUpDown size={14} className="ml-1" />
                </button>
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium text-textSecondary uppercase tracking-wider">
                Risk Flag
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginatedTransactions.map((tx, index) => {
              const risk = getRiskFlag(tx)
              const rowIndex = (currentPage - 1) * itemsPerPage + index
              return (
                <tr
                  key={tx.hash ? `${tx.hash}-${rowIndex}` : `row-${rowIndex}`}
                  className="hover:bg-background/50 transition-all duration-200 hover:shadow-glow border-l-2 border-l-transparent hover:border-l-primary"
                  data-testid={`transaction-row-${index}`}
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
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          risk === 'HIGH'
                            ? 'bg-danger'
                            : risk === 'MEDIUM'
                            ? 'bg-warning'
                            : 'bg-success'
                        }`}
                      ></div>
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          risk === 'HIGH'
                            ? 'bg-danger/20 text-danger border border-danger/30'
                            : risk === 'MEDIUM'
                            ? 'bg-warning/20 text-warning border border-warning/30'
                            : 'bg-success/20 text-success border border-success/30'
                        }`}
                        data-testid={`risk-badge-${risk.toLowerCase()}`}
                      >
                        {risk}
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-6 py-4 border-t border-border flex items-center justify-between">
        <div className="text-sm text-textSecondary" data-testid="pagination-info">
          Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
          {Math.min(currentPage * itemsPerPage, sortedAndFilteredTransactions.length)} of{' '}
          {sortedAndFilteredTransactions.length} transactions
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 border border-border rounded text-textSecondary hover:bg-border disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            data-testid="pagination-prev-button"
          >
            Previous
          </button>
          {[...Array(Math.min(5, totalPages))].map((_, i) => {
            const pageNum = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i
            if (pageNum > totalPages) return null
            return (
              <button
                key={pageNum}
                onClick={() => setCurrentPage(pageNum)}
                className={`px-3 py-1 border rounded transition-all ${
                  currentPage === pageNum
                    ? 'border-primary text-primary shadow-glow'
                    : 'border-border text-textSecondary hover:bg-border'
                }`}
                data-testid={`pagination-page-${pageNum}`}
              >
                {pageNum}
              </button>
            )
          })}
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1 border border-border rounded text-textSecondary hover:bg-border disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            data-testid="pagination-next-button"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}

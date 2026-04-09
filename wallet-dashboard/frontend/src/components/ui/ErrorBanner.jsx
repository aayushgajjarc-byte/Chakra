import { AlertTriangle, X, RefreshCw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export default function ErrorBanner({ message, onRetry, onDismiss }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="bg-danger/10 border border-danger/30 rounded-lg p-4 mb-6"
        data-testid="error-banner"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} className="text-danger" />
            <div>
              <p className="text-textPrimary font-medium">Error Loading Data</p>
              <p className="text-textSecondary text-sm">{message}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-2 px-4 py-2 bg-danger/20 hover:bg-danger/30 border border-danger/40 text-textPrimary rounded-lg transition-all duration-200"
                data-testid="error-retry-button"
              >
                <RefreshCw size={16} />
                Retry
              </button>
            )}
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="p-2 hover:bg-hover rounded transition-colors"
                data-testid="error-dismiss-button"
              >
                <X size={18} className="text-textSecondary" />
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

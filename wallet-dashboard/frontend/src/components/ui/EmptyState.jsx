import { motion } from 'framer-motion'

export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center p-12 text-center"
      data-testid="empty-state"
    >
      {Icon && <Icon size={48} className="text-textSecondary mb-4" />}
      <h3 className="text-xl font-semibold text-textPrimary mb-2">{title}</h3>
      <p className="text-textSecondary mb-6 max-w-md">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-6 py-3 bg-primary/10 border border-primary/20 text-primary rounded-lg hover:shadow-glow transition-all duration-300"
          data-testid="empty-state-action"
        >
          {action.label}
        </button>
      )}
    </motion.div>
  )
}

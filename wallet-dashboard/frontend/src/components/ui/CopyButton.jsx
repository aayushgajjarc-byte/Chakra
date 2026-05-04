import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export default function CopyButton({ value, size = 14, className = "" }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = (e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className={`p-1.5 rounded-md hover:bg-hover text-muted hover:text-primary transition-all ${className}`}
      title="Copy to clipboard"
    >
      {copied ? <Check size={size} className="text-success" /> : <Copy size={size} />}
    </button>
  )
}

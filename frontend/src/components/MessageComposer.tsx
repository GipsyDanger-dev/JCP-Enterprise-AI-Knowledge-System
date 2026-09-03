import { useRef, useState } from 'react'
import { Loader2, Paperclip, Send, X } from 'lucide-react'
import { fileToAttachment, formatFileSize, getFileIcon } from '@/utils/files'
import type { MessageAttachment } from '@/api/types'

interface MessageComposerProps {
  onSend: (content: string, attachments: MessageAttachment[]) => void
  onTyping?: () => void
  disabled?: boolean
  placeholder?: string
  isId: boolean
}

export function MessageComposer({ onSend, onTyping, disabled, placeholder, isId }: MessageComposerProps) {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<MessageAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    e.target.value = '' // reset
    setFileError(null)

    setUploading(true)
    try {
      const results = await Promise.allSettled(
        Array.from(files).map(fileToAttachment)
      )
      const accepted: MessageAttachment[] = []
      const errors: string[] = []
      for (const r of results) {
        if (r.status === 'fulfilled') accepted.push(r.value)
        else errors.push(r.reason?.message ?? 'File tidak valid')
      }
      if (accepted.length > 0) setAttachments((prev) => [...prev, ...accepted])
      if (errors.length > 0) setFileError(errors[0])
    } catch {
      // ignore errors
    } finally {
      setUploading(false)
    }
  }

  const removeAttachment = (id: number) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if ((!input.trim() && attachments.length === 0) || disabled) return
    onSend(input.trim(), [...attachments])
    setInput('')
    setAttachments([])
  }

  const canSend = (input.trim() || attachments.length > 0) && !disabled && !uploading

  return (
    <form className="mc-composer" onSubmit={handleSubmit}>
      {/* Attachment preview */}
      {attachments.length > 0 && (
        <div className="mc-attachments-preview">
          {attachments.map((att) => (
            <div key={att.id} className="mc-attachment-chip">
              {att.type === 'image' && att.dataUrl ? (
                <img src={att.dataUrl} alt={att.name} className="mc-attachment-thumb" />
              ) : (
                <span className="mc-attachment-icon">{getFileIcon(att.mimeType)}</span>
              )}
              <div className="mc-attachment-info">
                <span className="mc-attachment-name">{att.name}</span>
                <span className="mc-attachment-size">{formatFileSize(att.size)}</span>
              </div>
              <button type="button" className="mc-attachment-remove" onClick={() => removeAttachment(att.id)}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {fileError && <div className="mc-file-error"><span>{fileError}</span><button type="button" onClick={() => setFileError(null)}><X size={14} /></button></div>}

      {/* Input row */}
      <div className="mc-input-row">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
          style={{ display: 'none' }}
        />
        <button
          type="button"
          className="mc-attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          title={isId ? 'Lampirkan file' : 'Attach file'}
        >
          {uploading ? <Loader2 size={18} className="spin" /> : <Paperclip size={18} />}
        </button>
        <input
          value={input}
          onChange={(e) => { setInput(e.target.value); onTyping?.() }}
          placeholder={placeholder ?? (isId ? 'Ketik pesan…' : 'Type a message…')}
          disabled={disabled}
        />
        <button type="submit" disabled={!canSend}>
          <Send size={18} />
        </button>
      </div>
    </form>
  )
}

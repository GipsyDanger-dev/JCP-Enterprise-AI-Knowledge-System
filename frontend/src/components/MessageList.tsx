import { useMemo, useState } from 'react'
import { Check, CheckCheck, Check as Save, Pencil, Trash2, X } from 'lucide-react'
import type { DirectMessage, MessageAttachment } from '@/api/types'
import { formatFileSize, getFileIcon } from '@/utils/files'

interface MessageListProps {
  messages: DirectMessage[]
  currentSender: 'employee' | 'admin'
  isId: boolean
  bottomRef?: React.RefObject<HTMLDivElement | null>
  onEdit?: (messageId: string, content: string) => Promise<void>
  onDelete?: (messageId: string) => Promise<void>
}

interface DateGroup {
  date: string
  messages: DirectMessage[]
}

function formatDateLabel(iso: string, isId: boolean): string {
  const d = new Date(iso)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.floor((startOfToday.getTime() - startOfMsg.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return isId ? 'Hari ini' : 'Today'
  if (diffDays === 1) return isId ? 'Kemarin' : 'Yesterday'
  return d.toLocaleDateString(isId ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

function getDateKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function MessageList({ messages, currentSender, isId, bottomRef, onEdit, onDelete }: MessageListProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  // Group messages by date
  const dateGroups = useMemo<DateGroup[]>(() => {
    const groups: DateGroup[] = []
    let currentGroup: DateGroup | null = null

    for (const msg of messages) {
      const dateKey = getDateKey(msg.createdAt)
      if (!currentGroup || currentGroup.date !== dateKey) {
        currentGroup = { date: dateKey, messages: [] }
        groups.push(currentGroup)
      }
      currentGroup.messages.push(msg)
    }

    return groups
  }, [messages])

  return (
    <div className="messaging-messages">
      {dateGroups.map((group) => (
        <div key={group.date} className="messaging-date-group">
          <div className="messaging-date-divider">
            <span>{formatDateLabel(group.messages[0].createdAt, isId)}</span>
          </div>
          {group.messages.map((msg, idx) => {
            const isMine = msg.sender === currentSender
            const prevMsg = idx > 0 ? group.messages[idx - 1] : null
            const senderChanged = !prevMsg || prevMsg.sender !== msg.sender
            const showSenderName = senderChanged && !isMine

            return (
              <div
                key={msg.id}
                className={`messaging-bubble-wrap ${isMine ? 'sent' : 'received'} ${senderChanged ? 'group-start' : 'group-continuation'}`}
              >
                {showSenderName && (
                  <span className="messaging-sender-name">{msg.senderName}</span>
                )}
                <div className={`messaging-bubble ${isMine ? 'sent' : 'received'}`}>
                  {/* Attachments */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mc-bubble-attachments">
                      {msg.attachments.map((att) => (
                        <AttachmentPreview key={att.id} attachment={att} />
                      ))}
                    </div>
                  )}
                  {/* Text content */}
                  {msg.content && (
                    <div className="messaging-bubble-content">
                      {editingId === msg.id ? (
                        <div className="message-edit-form">
                          <textarea value={editingText} onChange={(event) => setEditingText(event.target.value)} autoFocus />
                          <div className="message-edit-actions">
                            <button type="button" onClick={() => setEditingId(null)}><X size={13} /> {isId ? 'Batal' : 'Cancel'}</button>
                            <button type="button" disabled={!editingText.trim() || busyId === msg.id} onClick={async () => { setBusyId(msg.id); await onEdit?.(msg.id, editingText.trim()); setBusyId(null); setEditingId(null) }}><Save size={13} /> {isId ? 'Simpan' : 'Save'}</button>
                          </div>
                        </div>
                      ) : <p>{msg.content}</p>}
                    </div>
                  )}
                  <small className="messaging-bubble-time">
                    {formatTime(msg.createdAt)}
                    {msg.editedAt && <span>· {isId ? 'diedit' : 'edited'}</span>}
                    {isMine && (msg.read ? <CheckCheck size={13} aria-label="Read" /> : <Check size={13} aria-label="Sent" />)}
                  </small>
                  {isMine && editingId !== msg.id && (onEdit || onDelete) && (
                    <div className="message-actions">
                      {onEdit && msg.content && <button type="button" title={isId ? 'Edit pesan' : 'Edit message'} onClick={() => { setEditingId(msg.id); setEditingText(msg.content) }}><Pencil size={12} /></button>}
                      {onDelete && <button type="button" title={isId ? 'Hapus pesan' : 'Delete message'} disabled={busyId === msg.id} onClick={async () => { if (!window.confirm(isId ? 'Hapus pesan ini?' : 'Delete this message?')) return; setBusyId(msg.id); await onDelete(msg.id); setBusyId(null) }}><Trash2 size={12} /></button>}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
      {bottomRef && <div ref={bottomRef} />}
    </div>
  )
}

function AttachmentPreview({ attachment }: { attachment: MessageAttachment }) {
  if (attachment.type === 'image' && attachment.dataUrl) {
    return (
      <div className="mc-attachment-image">
        <img src={attachment.dataUrl} alt={attachment.name} />
      </div>
    )
  }

  return (
    <a className="mc-attachment-file" href={attachment.dataUrl ?? undefined} download={attachment.name} target="_blank" rel="noreferrer">
      <span className="mc-attachment-file-icon">{getFileIcon(attachment.mimeType)}</span>
      <div className="mc-attachment-file-info">
        <span className="mc-attachment-file-name">{attachment.name}</span>
        <span className="mc-attachment-file-size">{formatFileSize(attachment.size)}</span>
      </div>
    </a>
  )
}

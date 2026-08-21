import { useMemo } from 'react'
import type { DirectMessage } from '@/api/types'

interface MessageListProps {
  messages: DirectMessage[]
  currentSender: 'employee' | 'admin'
  isId: boolean
  bottomRef?: React.RefObject<HTMLDivElement | null>
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

export function MessageList({ messages, currentSender, isId, bottomRef }: MessageListProps) {
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
                  <div className="messaging-bubble-content">
                    <p>{msg.content}</p>
                  </div>
                  <small className="messaging-bubble-time">{formatTime(msg.createdAt)}</small>
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

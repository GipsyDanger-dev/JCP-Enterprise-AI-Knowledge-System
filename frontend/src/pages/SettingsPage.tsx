import { useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Loader2, Save, ShieldCheck, User, Users } from 'lucide-react'
import { PageHeading } from '@/components/PageHeading'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import { userRoleLabel } from '@/api/mockUsers'

export function SettingsPage() {
  const { user } = useAuth()
  const { role } = useWorkspace()
  const [displayName, setDisplayName] = useState(user?.name ?? '')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    // Mock delay
    await new Promise((r) => setTimeout(r, 600))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="standard-page">
      <PageHeading
        eyebrow="Configuration"
        title="Settings"
        detail="Manage your profile and workspace preferences."
      />

      <div className="settings-grid">
        {/* Profile section */}
        <section className="settings-section">
          <div className="settings-section-header">
            <span className="settings-icon"><User size={18} /></span>
            <div>
              <h3>Profile</h3>
              <small>Your personal information</small>
            </div>
          </div>
          <form className="settings-form" onSubmit={handleSave}>
            <div className="settings-field">
              <label htmlFor="settings-name">Display name</label>
              <input
                id="settings-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div className="settings-field">
              <label htmlFor="settings-email">Email address</label>
              <input
                id="settings-email"
                type="email"
                value={user?.email ?? ''}
                disabled
                className="disabled-input"
              />
              <small>Email cannot be changed. Contact admin to update.</small>
            </div>
            <div className="settings-field">
              <label>Role</label>
              <div className="settings-role-display">
                <span className={`role-badge ${role}`}>
                  {role === 'admin' ? <ShieldCheck size={13} /> : <Users size={13} />}
                  {userRoleLabel(user?.role ?? 'EMPLOYEE')}
                </span>
                <small>Assigned by workspace administrator</small>
              </div>
            </div>
            <div className="settings-actions">
              <button type="submit" className="primary-button" disabled={saving || !displayName.trim()}>
                {saving ? <><Loader2 size={15} className="spin" /> Saving…</> : saved ? <><Check size={15} /> Saved!</> : <><Save size={15} /> Save changes</>}
              </button>
            </div>
          </form>
        </section>

        {/* Workspace section */}
        <section className="settings-section">
          <div className="settings-section-header">
            <span className="settings-icon"><ShieldCheck size={18} /></span>
            <div>
              <h3>Workspace</h3>
              <small>Workspace information and access</small>
            </div>
          </div>
          <div className="settings-info-grid">
            <div className="settings-info-item">
              <label>Workspace name</label>
              <span>Jogja Creative</span>
            </div>
            <div className="settings-info-item">
              <label>Workspace ID</label>
              <span>JC-001</span>
            </div>
            <div className="settings-info-item">
              <label>Your access level</label>
              <span>{role === 'admin' ? 'Full access (Admin)' : 'Knowledge library (Employee)'}</span>
            </div>
            <div className="settings-info-item">
              <label>Collections accessible</label>
              <span>{role === 'admin' ? 'All collections' : '3 collections'}</span>
            </div>
          </div>
        </section>

        {/* Appearance section */}
        <section className="settings-section">
          <div className="settings-section-header">
            <span className="settings-icon"><User size={18} /></span>
            <div>
              <h3>Appearance</h3>
              <small>Customize your interface</small>
            </div>
          </div>
          <div className="settings-info-grid">
            <div className="settings-info-item">
              <label>Theme</label>
              <span>Light (default)</span>
            </div>
            <div className="settings-info-item">
              <label>Language</label>
              <span>English / Bahasa Indonesia</span>
            </div>
            <div className="settings-info-item">
              <label>Compact mode</label>
              <span>Off</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

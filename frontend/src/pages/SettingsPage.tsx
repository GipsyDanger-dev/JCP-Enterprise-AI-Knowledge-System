import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Globe, Loader2, Moon, Palette, Save, Sun, User } from 'lucide-react'
import { ShieldCheck } from 'lucide-react'
import { PageHeading } from '@/components/PageHeading'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import { userRoleLabel } from '@/api/mockUsers'

const THEME_KEY = 'jcp-theme'
const LANG_KEY = 'jcp-lang'

function getStoredTheme(): 'light' | 'dark' {
  const v = localStorage.getItem(THEME_KEY)
  if (v === 'dark' || v === 'light') return v
  return 'light'
}

function getStoredLang(): 'en' | 'id' {
  const v = localStorage.getItem(LANG_KEY)
  if (v === 'en' || v === 'id') return v
  return 'en'
}

export function SettingsPage() {
  const { user } = useAuth()
  const { role } = useWorkspace()
  const [displayName, setDisplayName] = useState(user?.name ?? '')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(getStoredTheme)
  const [language, setLanguage] = useState<'en' | 'id'>(getStoredLang)
  const [compact, setCompact] = useState(false)
  const [notifications, setNotifications] = useState(true)
  const [emailDigest, setEmailDigest] = useState(false)

  // Apply theme to <html> and persist
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  // Persist language
  useEffect(() => {
    localStorage.setItem(LANG_KEY, language)
  }, [language])

  // Apply initial theme on mount
  useEffect(() => {
    const stored = getStoredTheme()
    document.documentElement.setAttribute('data-theme', stored)
  }, [])

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await new Promise((r) => setTimeout(r, 600))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const isId = language === 'id'

  return (
    <div className="standard-page">
      <PageHeading
        eyebrow={isId ? 'Konfigurasi' : 'Configuration'}
        title={isId ? 'Pengaturan' : 'Settings'}
        detail={isId ? 'Kelola profil dan preferensi workspace Anda.' : 'Manage your profile and workspace preferences.'}
      />

      <div className="settings-grid">
        {/* Profile section */}
        <section className="settings-section">
          <div className="settings-section-header">
            <span className="settings-icon"><User size={18} /></span>
            <div>
              <h3>{isId ? 'Profil' : 'Profile'}</h3>
              <small>{isId ? 'Informasi pribadi Anda' : 'Your personal information'}</small>
            </div>
          </div>
          <form className="settings-form" onSubmit={handleSave}>
            <div className="settings-field">
              <label htmlFor="settings-name">{isId ? 'Nama tampilan' : 'Display name'}</label>
              <input
                id="settings-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={isId ? 'Nama Anda' : 'Your name'}
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
              <small>{isId ? 'Email tidak dapat diubah. Hubungi admin.' : 'Email cannot be changed. Contact admin to update.'}</small>
            </div>
            <div className="settings-field">
              <label>Role</label>
              <div className="settings-role-display">
                <span className="settings-role-text">
                  {userRoleLabel(user?.role ?? 'EMPLOYEE')}
                </span>
                <small>{isId ? 'Ditetapkan oleh administrator workspace' : 'Assigned by workspace administrator'}</small>
              </div>
            </div>
            <div className="settings-actions">
              <button type="submit" className="primary-button" disabled={saving || !displayName.trim()}>
                {saving ? <><Loader2 size={15} className="spin" /> {isId ? 'Menyimpan…' : 'Saving…'}</> : saved ? <><Check size={15} /> {isId ? 'Tersimpan!' : 'Saved!'}</> : <><Save size={15} /> {isId ? 'Simpan perubahan' : 'Save changes'}</>}
              </button>
            </div>
          </form>
        </section>

        {/* Workspace section */}
        <section className="settings-section">
          <div className="settings-section-header">
            <span className="settings-icon"><ShieldCheck size={18} /></span>
            <div>
              <h3>{isId ? 'Workspace' : 'Workspace'}</h3>
              <small>{isId ? 'Informasi dan akses workspace' : 'Workspace information and access'}</small>
            </div>
          </div>
          <div className="settings-info-grid">
            <div className="settings-info-item">
              <label>{isId ? 'Nama workspace' : 'Workspace name'}</label>
              <span>Jogja Creative</span>
            </div>
            <div className="settings-info-item">
              <label>{isId ? 'ID workspace' : 'Workspace ID'}</label>
              <span>JC-001</span>
            </div>
            <div className="settings-info-item">
              <label>{isId ? 'Tingkat akses Anda' : 'Your access level'}</label>
              <span>{role === 'admin' ? (isId ? 'Akses penuh (Admin)' : 'Full access (Admin)') : (isId ? 'Perpustakaan pengetahuan (Karyawan)' : 'Knowledge library (Employee)')}</span>
            </div>
            <div className="settings-info-item">
              <label>{isId ? 'Koleksi yang dapat diakses' : 'Collections accessible'}</label>
              <span>{role === 'admin' ? (isId ? 'Semua koleksi' : 'All collections') : '3 collections'}</span>
            </div>
          </div>
        </section>

        {/* Appearance section */}
        <section className="settings-section">
          <div className="settings-section-header">
            <span className="settings-icon"><Palette size={18} /></span>
            <div>
              <h3>{isId ? 'Tampilan' : 'Appearance'}</h3>
              <small>{isId ? 'Sesuaikan tampilan antarmuka Anda' : 'Customize your interface look and feel'}</small>
            </div>
          </div>
          <div className="settings-form">
            {/* Theme */}
            <div className="settings-field">
              <label>{isId ? 'Tema' : 'Theme'}</label>
              <div className="settings-theme-grid">
                <button
                  className={`theme-card ${theme === 'light' ? 'active' : ''}`}
                  onClick={() => setTheme('light')}
                  type="button"
                >
                  <div className="theme-preview theme-light-preview">
                    <div className="theme-preview-sidebar" />
                    <div className="theme-preview-content">
                      <div className="theme-preview-bar" />
                      <div className="theme-preview-block" />
                      <div className="theme-preview-block short" />
                    </div>
                  </div>
                  <span className="theme-label"><Sun size={14} /> Light</span>
                </button>
                <button
                  className={`theme-card ${theme === 'dark' ? 'active' : ''}`}
                  onClick={() => setTheme('dark')}
                  type="button"
                >
                  <div className="theme-preview theme-dark-preview">
                    <div className="theme-preview-sidebar dark" />
                    <div className="theme-preview-content dark">
                      <div className="theme-preview-bar dark" />
                      <div className="theme-preview-block dark" />
                      <div className="theme-preview-block short dark" />
                    </div>
                  </div>
                  <span className="theme-label"><Moon size={14} /> Dark</span>
                </button>
              </div>
            </div>

            {/* Language */}
            <div className="settings-field">
              <label><Globe size={14} style={{ marginRight: 6, verticalAlign: -2 }} />{isId ? 'Bahasa' : 'Language'}</label>
              <div className="settings-language-options">
                <button
                  className={`language-option ${language === 'en' ? 'active' : ''}`}
                  onClick={() => setLanguage('en')}
                  type="button"
                >
                  <span className="lang-flag">🇬🇧</span>
                  <div className="lang-text">
                    <span className="lang-name">English</span>
                    <span className="lang-sub">Default language</span>
                  </div>
                  {language === 'en' && <Check size={16} className="lang-check" />}
                </button>
                <button
                  className={`language-option ${language === 'id' ? 'active' : ''}`}
                  onClick={() => setLanguage('id')}
                  type="button"
                >
                  <span className="lang-flag">🇮🇩</span>
                  <div className="lang-text">
                    <span className="lang-name">Bahasa Indonesia</span>
                    <span className="lang-sub">Bahasa nasional</span>
                  </div>
                  {language === 'id' && <Check size={16} className="lang-check" />}
                </button>
              </div>
            </div>

            {/* Compact mode */}
            <div className="settings-switch-row">
              <div className="settings-switch-info">
                <label>{isId ? 'Mode compact' : 'Compact mode'}</label>
                <small>{compact ? (isId ? 'Tata letak lebih rapat' : 'Denser layout with less spacing') : (isId ? 'Tata letak standar' : 'Standard layout with comfortable spacing')}</small>
              </div>
              <button className={`toggle-switch ${compact ? 'on' : ''}`} onClick={() => setCompact(!compact)} type="button">
                <span className="toggle-knob" />
              </button>
            </div>

            <div className="settings-divider" />

            {/* Notifications */}
            <div className="settings-switch-row">
              <div className="settings-switch-info">
                <label>{isId ? 'Notifikasi desktop' : 'Desktop notifications'}</label>
                <small>{notifications ? (isId ? 'Dapatkan notifikasi pembaruan dokumen' : 'Get notified about document updates') : (isId ? 'Notifikasi dinonaktifkan' : 'Notifications are disabled')}</small>
              </div>
              <button className={`toggle-switch ${notifications ? 'on' : ''}`} onClick={() => setNotifications(!notifications)} type="button">
                <span className="toggle-knob" />
              </button>
            </div>

            {/* Email digest */}
            <div className="settings-switch-row">
              <div className="settings-switch-info">
                <label>{isId ? 'Ringkasan email' : 'Email digest'}</label>
                <small>{emailDigest ? (isId ? 'Ringkasan mingguan dikirim ke inbox' : 'Weekly summary sent to your inbox') : (isId ? 'Tidak ada ringkasan email' : 'No email summaries')}</small>
              </div>
              <button className={`toggle-switch ${emailDigest ? 'on' : ''}`} onClick={() => setEmailDigest(!emailDigest)} type="button">
                <span className="toggle-knob" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

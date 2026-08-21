import { useEffect, useState } from 'react'
import { Check, Globe, Moon, Palette, Sun, User } from 'lucide-react'
import { ShieldCheck } from 'lucide-react'
import { PageHeading } from '@/components/PageHeading'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import { userRoleLabel } from '@/api/mockUsers'
import { isNotificationsEnabled, setNotificationsEnabled, isBrowserNotificationsEnabled, setBrowserNotificationsEnabled, requestNotificationPermission } from '@/utils/notifications'

const THEME_KEY = 'jcp-theme'

function getStoredTheme(): 'light' | 'dark' {
  const v = localStorage.getItem(THEME_KEY)
  if (v === 'dark' || v === 'light') return v
  return 'light'
}

export function SettingsPage() {
  const { user } = useAuth()
  const { role, language, setLanguage } = useWorkspace()
  const [theme, setTheme] = useState<'light' | 'dark'>(getStoredTheme)
  const [compact, setCompact] = useState(false)
  const [notifications, setNotifications] = useState(isNotificationsEnabled)
  const [browserNotif, setBrowserNotif] = useState(isBrowserNotificationsEnabled)
  const [emailDigest, setEmailDigest] = useState(false)

  // Apply theme to <html> and persist
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  // Apply initial theme on mount
  useEffect(() => {
    const stored = getStoredTheme()
    document.documentElement.setAttribute('data-theme', stored)
  }, [])

  // Persist notification toggles
  useEffect(() => {
    setNotificationsEnabled(notifications)
  }, [notifications])

  useEffect(() => {
    setBrowserNotificationsEnabled(browserNotif)
    if (browserNotif) requestNotificationPermission()
  }, [browserNotif])

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
          <div className="settings-form">
            <div className="settings-field">
              <label>{isId ? 'Nama' : 'Name'}</label>
              <input
                type="text"
                value={user?.name ?? ''}
                disabled
                className="disabled-input"
              />
              <small>{isId ? 'Dikelola oleh administrator.' : 'Managed by administrator.'}</small>
            </div>
            <div className="settings-field">
              <label>Email address</label>
              <input
                type="email"
                value={user?.email ?? ''}
                disabled
                className="disabled-input"
              />
              <small>{isId ? 'Dikelola oleh administrator.' : 'Managed by administrator.'}</small>
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
          </div>
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
                <label>{isId ? 'Suara notifikasi' : 'Notification sound'}</label>
                <small>{notifications ? (isId ? 'Suara dan getar aktif untuk pesan baru' : 'Sound and vibration active for new messages') : (isId ? 'Notifikasi dinonaktifkan' : 'Notifications are disabled')}</small>
              </div>
              <button className={`toggle-switch ${notifications ? 'on' : ''}`} onClick={() => setNotifications(!notifications)} type="button">
                <span className="toggle-knob" />
              </button>
            </div>

            {/* Browser notifications */}
            <div className="settings-switch-row">
              <div className="settings-switch-info">
                <label>{isId ? 'Notifikasi browser' : 'Browser notifications'}</label>
                <small>{browserNotif
                  ? (isId ? 'Popup notifikasi muncul di layar' : 'Notification popups appear on screen')
                  : (isId ? 'Popup notifikasi dinonaktifkan' : 'Notification popups are disabled')}</small>
              </div>
              <button className={`toggle-switch ${browserNotif ? 'on' : ''}`} onClick={() => setBrowserNotif(!browserNotif)} type="button">
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

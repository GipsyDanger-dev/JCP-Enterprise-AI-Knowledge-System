import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Globe, Loader2, Moon, Palette, Save, ShieldCheck, Sun, User, Users } from 'lucide-react'
import { PageHeading } from '@/components/PageHeading'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import { userRoleLabel } from '@/api/mockUsers'

const THEME_KEY = 'jcp-theme'
const LANG_KEY = 'jcp-lang'

type Theme = 'light' | 'dark'
type Language = 'en' | 'id'

function getStoredTheme(): Theme {
  const storedTheme = localStorage.getItem(THEME_KEY)
  return storedTheme === 'dark' ? 'dark' : 'light'
}

function getStoredLanguage(): Language {
  const storedLanguage = localStorage.getItem(LANG_KEY)
  return storedLanguage === 'id' ? 'id' : 'en'
}

export function SettingsPage() {
  const { user } = useAuth()
  const { role } = useWorkspace()
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [theme, setTheme] = useState<Theme>(getStoredTheme)
  const [language, setLanguage] = useState<Language>(getStoredLanguage)

  useEffect(() => {
    setDisplayName(user?.displayName ?? '')
  }, [user?.displayName])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem(LANG_KEY, language)
  }, [language])

  const handleSave = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    await new Promise((resolve) => setTimeout(resolve, 600))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const isIndonesian = language === 'id'

  return (
    <div className="standard-page">
      <PageHeading
        eyebrow={isIndonesian ? 'Konfigurasi' : 'Configuration'}
        title={isIndonesian ? 'Pengaturan' : 'Settings'}
        detail={isIndonesian ? 'Kelola profil dan preferensi workspace Anda.' : 'Manage your profile and workspace preferences.'}
      />

      <div className="settings-grid">
        <section className="settings-section">
          <div className="settings-section-header">
            <span className="settings-icon"><User size={18} /></span>
            <div>
              <h3>{isIndonesian ? 'Profil' : 'Profile'}</h3>
              <small>{isIndonesian ? 'Informasi pribadi Anda' : 'Your personal information'}</small>
            </div>
          </div>
          <form className="settings-form" onSubmit={handleSave}>
            <div className="settings-field">
              <label htmlFor="settings-name">{isIndonesian ? 'Nama tampilan' : 'Display name'}</label>
              <input
                id="settings-name"
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={isIndonesian ? 'Nama Anda' : 'Your name'}
              />
            </div>
            <div className="settings-field">
              <label htmlFor="settings-email">{isIndonesian ? 'Alamat email' : 'Email address'}</label>
              <input
                id="settings-email"
                type="email"
                value={user?.email ?? ''}
                disabled
                className="disabled-input"
              />
              <small>
                {isIndonesian
                  ? 'Email tidak dapat diubah. Hubungi admin untuk memperbaruinya.'
                  : 'Email cannot be changed. Contact admin to update.'}
              </small>
            </div>
            <div className="settings-field">
              <label>{isIndonesian ? 'Peran' : 'Role'}</label>
              <div className="settings-role-display">
                <span className={`role-badge ${role}`}>
                  {role === 'admin' ? <ShieldCheck size={13} /> : <Users size={13} />}
                  {userRoleLabel(user?.role ?? 'USER')}
                </span>
                <small>
                  {isIndonesian
                    ? 'Ditetapkan oleh administrator workspace'
                    : 'Assigned by workspace administrator'}
                </small>
              </div>
            </div>
            <div className="settings-actions">
              <button type="submit" className="primary-button" disabled={saving || !displayName.trim()}>
                {saving
                  ? <><Loader2 size={15} className="spin" /> {isIndonesian ? 'Menyimpan…' : 'Saving…'}</>
                  : saved
                    ? <><Check size={15} /> {isIndonesian ? 'Tersimpan!' : 'Saved!'}</>
                    : <><Save size={15} /> {isIndonesian ? 'Simpan perubahan' : 'Save changes'}</>}
              </button>
            </div>
          </form>
        </section>

        <section className="settings-section">
          <div className="settings-section-header">
            <span className="settings-icon"><ShieldCheck size={18} /></span>
            <div>
              <h3>Workspace</h3>
              <small>{isIndonesian ? 'Informasi dan akses workspace' : 'Workspace information and access'}</small>
            </div>
          </div>
          <div className="settings-info-grid">
            <div className="settings-info-item">
              <label>{isIndonesian ? 'Nama workspace' : 'Workspace name'}</label>
              <span>Jogja Creative</span>
            </div>
            <div className="settings-info-item">
              <label>{isIndonesian ? 'ID workspace' : 'Workspace ID'}</label>
              <span>JC-001</span>
            </div>
            <div className="settings-info-item">
              <label>{isIndonesian ? 'Tingkat akses Anda' : 'Your access level'}</label>
              <span>
                {role === 'admin'
                  ? (isIndonesian ? 'Akses penuh (Admin)' : 'Full access (Admin)')
                  : (isIndonesian ? 'Perpustakaan pengetahuan (Pengguna)' : 'Knowledge library (User)')}
              </span>
            </div>
            <div className="settings-info-item">
              <label>{isIndonesian ? 'Koleksi yang dapat diakses' : 'Collections accessible'}</label>
              <span>{role === 'admin' ? (isIndonesian ? 'Semua koleksi' : 'All collections') : '3 collections'}</span>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-header">
            <span className="settings-icon"><Palette size={18} /></span>
            <div>
              <h3>{isIndonesian ? 'Tampilan' : 'Appearance'}</h3>
              <small>
                {isIndonesian
                  ? 'Sesuaikan tampilan antarmuka Anda'
                  : 'Customize your interface look and feel'}
              </small>
            </div>
          </div>
          <div className="settings-form">
            <div className="settings-field">
              <label>{isIndonesian ? 'Tema' : 'Theme'}</label>
              <div className="settings-theme-grid">
                <button
                  className={`theme-card ${theme === 'light' ? 'active' : ''}`}
                  onClick={() => setTheme('light')}
                  type="button"
                  aria-pressed={theme === 'light'}
                >
                  <div className="theme-preview theme-light-preview">
                    <div className="theme-preview-sidebar" />
                    <div className="theme-preview-content">
                      <div className="theme-preview-bar" />
                      <div className="theme-preview-block" />
                      <div className="theme-preview-block short" />
                    </div>
                  </div>
                  <span className="theme-label">
                    <Sun size={14} /> {isIndonesian ? 'Terang' : 'Light'}
                  </span>
                </button>
                <button
                  className={`theme-card ${theme === 'dark' ? 'active' : ''}`}
                  onClick={() => setTheme('dark')}
                  type="button"
                  aria-pressed={theme === 'dark'}
                >
                  <div className="theme-preview theme-dark-preview">
                    <div className="theme-preview-sidebar dark" />
                    <div className="theme-preview-content dark">
                      <div className="theme-preview-bar dark" />
                      <div className="theme-preview-block dark" />
                      <div className="theme-preview-block short dark" />
                    </div>
                  </div>
                  <span className="theme-label">
                    <Moon size={14} /> {isIndonesian ? 'Gelap' : 'Dark'}
                  </span>
                </button>
              </div>
            </div>

            <div className="settings-field">
              <label>
                <Globe size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                {isIndonesian ? 'Bahasa' : 'Language'}
              </label>
              <div className="settings-language-options">
                <button
                  className={`language-option ${language === 'en' ? 'active' : ''}`}
                  onClick={() => setLanguage('en')}
                  type="button"
                  aria-pressed={language === 'en'}
                >
                  <span className="lang-flag" aria-hidden="true">🇬🇧</span>
                  <span className="lang-text">
                    <span className="lang-name">English</span>
                    <span className="lang-sub">Default language</span>
                  </span>
                  {language === 'en' && <Check size={16} className="lang-check" />}
                </button>
                <button
                  className={`language-option ${language === 'id' ? 'active' : ''}`}
                  onClick={() => setLanguage('id')}
                  type="button"
                  aria-pressed={language === 'id'}
                >
                  <span className="lang-flag" aria-hidden="true">🇮🇩</span>
                  <span className="lang-text">
                    <span className="lang-name">Bahasa Indonesia</span>
                    <span className="lang-sub">Bahasa nasional</span>
                  </span>
                  {language === 'id' && <Check size={16} className="lang-check" />}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

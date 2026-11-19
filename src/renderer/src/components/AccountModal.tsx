import { useEffect, useState } from 'react'
import { AlertTriangle, Copy, ExternalLink, LogOut, ShieldCheck, UserRound } from 'lucide-react'
import { explainAuthError, type AuthGuidance } from '@shared/authErrors'
import { api, errorMessage } from '../api'
import { useApp } from '../store'
import { Chip, Spinner } from './Controls'
import { Modal, ModalHeader } from './Modal'
import { SkinAvatar } from './SkinAvatar'

export function AccountModal() {
  const open = useApp((state) => state.accountOpen)
  const setOpen = useApp((state) => state.setAccountOpen)
  const account = useApp((state) => state.account)
  const deviceCode = useApp((state) => state.deviceCode)
  const setDeviceCode = useApp((state) => state.setDeviceCode)
  const auth = useApp((state) => state.auth)
  const setAuth = useApp((state) => state.setAuth)
  const refreshAccount = useApp((state) => state.refreshAccount)
  const pushToast = useApp((state) => state.pushToast)
  const [tab, setTab] = useState<'microsoft' | 'offline'>('microsoft')
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [offlineName, setOfflineName] = useState('')
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!open) return
    setShowForm(!account)
    setFormError('')
    setTab('microsoft')
    setOfflineName(account?.type === 'offline' ? account.name : '')
    if (!account) {
      setDeviceCode(null)
      setAuth({ status: 'idle' })
    }
  }, [open, account, setAuth, setDeviceCode])

  function close(): void {
    if (auth.status === 'waiting' || auth.status === 'working') {
      void api.account.cancelLogin()
    }
    setDeviceCode(null)
    setAuth({ status: 'idle' })
    setOpen(false)
  }

  async function signInMicrosoft(): Promise<void> {
    setBusy(true)
    setFormError('')
    setAuth({ status: 'waiting', message: 'Contacting Microsoft…' })
    try {
      const info = await api.account.loginMicrosoft()
      setDeviceCode(info)
      setAuth({ status: 'waiting', message: 'Waiting for you to approve the sign-in…' })
      void api.app.openExternal(info.verificationUri)
    } catch (signInError) {
      const message = errorMessage(signInError)
      setAuth({ status: 'error', error: message, guidance: explainAuthError(message) })
    } finally {
      setBusy(false)
    }
  }

  async function useOffline(): Promise<void> {
    setBusy(true)
    setFormError('')
    try {
      await api.account.setOffline(offlineName)
      await refreshAccount()
      setOpen(false)
    } catch (signInError) {
      setFormError(errorMessage(signInError))
    } finally {
      setBusy(false)
    }
  }

  async function signOut(): Promise<void> {
    await api.account.logout()
    await refreshAccount()
    setShowForm(true)
    pushToast({ title: 'Signed out', description: 'Choose a profile to keep playing.' })
  }

  return (
    <Modal open={open} onClose={close} className="account-modal" label="Account">
      <ModalHeader
        title="Account"
        subtitle="Play online with Microsoft, or jump into singleplayer offline."
        onClose={close}
        icon={<UserRound size={18} />}
      />

      {account && !showForm ? (
        <div className="modal-body">
          <div className="profile-card">
            <SkinAvatar account={account} size={76} />
            <div className="profile-copy">
              <h3>{account.name}</h3>
              <Chip tone={account.type === 'microsoft' ? 'accent' : 'muted'}>
                {account.type === 'microsoft' ? 'Microsoft account' : 'Offline profile'}
              </Chip>
              <span className="profile-uuid">{account.uuid}</span>
            </div>
          </div>
          <div className="profile-actions">
            <button type="button" className="btn" onClick={() => setShowForm(true)}>
              Switch account
            </button>
            <button type="button" className="btn btn-danger" onClick={() => void signOut()}>
              <LogOut size={14} /> Sign out
            </button>
          </div>
          <p className="modal-note">
            {account.type === 'microsoft'
              ? 'Your Microsoft session is stored locally. Online servers see your real Minecraft profile.'
              : 'Offline profiles can join singleplayer worlds and servers running in offline mode.'}
          </p>
        </div>
      ) : (
        <>
          <div className="account-tabs">
            <button
              type="button"
              className={tab === 'microsoft' ? 'active' : ''}
              onClick={() => setTab('microsoft')}
            >
              Microsoft
            </button>
            <button
              type="button"
              className={tab === 'offline' ? 'active' : ''}
              onClick={() => setTab('offline')}
            >
              Offline
            </button>
          </div>
          <div className="modal-body">
            {tab === 'microsoft' ? (
              <>
                {deviceCode && (auth.status === 'waiting' || auth.status === 'working') ? (
                  <div className="device-code">
                    <div className="device-code-head">
                      <Spinner size={16} />
                      <span>{auth.message ?? 'Waiting for Microsoft…'}</span>
                    </div>
                    <div className="device-code-value">
                      <span>{deviceCode.userCode}</span>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Copy code"
                        onClick={() => {
                          void navigator.clipboard.writeText(deviceCode.userCode)
                          pushToast({ title: 'Code copied', variant: 'success' })
                        }}
                      >
                        <Copy size={15} />
                      </button>
                    </div>
                    <p>Enter this code at microsoft.com/link to approve Triad.</p>
                    <div className="device-actions">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => void api.app.openExternal(deviceCode.verificationUri)}
                      >
                        <ExternalLink size={14} /> Open Microsoft
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          void api.account.cancelLogin()
                          setDeviceCode(null)
                          setAuth({ status: 'idle' })
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="signin-hero">
                      <div className="signin-mark">M</div>
                      <div>
                        <h3>Sign in with Microsoft</h3>
                        <p>
                          A browser window opens with a short code. Your password stays with
                          Microsoft — Triad only receives a Minecraft token.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-block"
                      disabled={busy}
                      onClick={() => void signInMicrosoft()}
                    >
                      {busy ? <Spinner size={15} /> : <ShieldCheck size={15} />}
                      {busy ? 'Contacting Microsoft…' : 'Continue with Microsoft'}
                    </button>
                  </>
                )}
                {auth.status === 'error' && auth.error && (
                  <AuthErrorPanel
                    guidance={auth.guidance ?? explainAuthError(auth.error)}
                    onRetry={() => void signInMicrosoft()}
                  />
                )}
              </>
            ) : (
              <>
                <div className="signin-hero">
                  <div className="signin-mark offline">@</div>
                  <div>
                    <h3>Offline profile</h3>
                    <p>
                      No account needed. Perfect for singleplayer, testing mods and offline-mode
                      servers. Online servers will reject this profile.
                    </p>
                  </div>
                </div>
                <input
                  className="input"
                  placeholder="Username (3–16 letters, numbers, _)"
                  value={offlineName}
                  maxLength={16}
                  onChange={(event) => setOfflineName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void useOffline()
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  disabled={busy || offlineName.trim().length < 3}
                  onClick={() => void useOffline()}
                >
                  {busy ? <Spinner size={15} /> : <UserRound size={15} />}
                  Play offline
                </button>
                {formError && <p className="form-error">{formError}</p>}
              </>
            )}

            <div className="modal-note">
              <ShieldCheck size={15} />
              <span>
                Triad signs in through Microsoft's device page and never sees your password. The
                public Minecraft launcher client ID is used by default; you can supply your own Azure
                app ID in Settings → Advanced.
              </span>
            </div>
          </div>
        </>
      )}
    </Modal>
  )
}

function AuthErrorPanel({
  guidance,
  onRetry
}: {
  guidance: AuthGuidance
  onRetry: () => void
}) {
  const pushToast = useApp((state) => state.pushToast)
  const [copied, setCopied] = useState(false)

  function copyDetails(): void {
    const detail = [
      guidance.title,
      guidance.summary,
      ...guidance.steps.map((step, index) => `${index + 1}. ${step}`),
      '',
      guidance.technical
    ].join('\n')
    void navigator.clipboard
      .writeText(detail)
      .then(() => {
        setCopied(true)
        pushToast({ title: 'Error details copied', variant: 'success' })
      })
      .catch(() => {
        pushToast({ title: 'Could not copy details', variant: 'error' })
      })
  }

  return (
    <div className="auth-error" role="alert">
      <div className="auth-error-head">
        <span className="auth-error-icon">
          <AlertTriangle size={16} />
        </span>
        <div>
          <strong>{guidance.title}</strong>
          <p>{guidance.summary}</p>
        </div>
      </div>
      <div className="auth-error-help">
        <span>What to do</span>
        <ol>
          {guidance.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
      <div className="auth-error-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>
          Try again
        </button>
        {guidance.helpUrl && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void api.app.openExternal(guidance.helpUrl!)}
          >
            <ExternalLink size={13} /> {guidance.helpLabel ?? 'Open help'}
          </button>
        )}
        <button type="button" className="btn btn-sm btn-ghost" onClick={copyDetails}>
          <Copy size={13} /> {copied ? 'Copied' : 'Copy details'}
        </button>
      </div>
      <details className="auth-error-details">
        <summary>Technical details</summary>
        <pre>{guidance.technical}</pre>
      </details>
    </div>
  )
}

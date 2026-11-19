import { useEffect, useState } from 'react'
import type { Account } from '@shared/types'
import { cn, initials } from '../lib/format'

export function SkinAvatar({
  account,
  size = 32,
  className
}: {
  account: Account | null
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [account?.uuid, account?.name, account?.skinUpdatedAt])

  return (
    <div
      className={cn('avatar', className)}
      style={{ width: size, height: size, flexBasis: size, borderRadius: Math.round(size * 0.28) }}
      aria-hidden
    >
      {account && !failed ? (
        <img
          src={`https://mc-heads.net/avatar/${encodeURIComponent(account.uuid)}/${size * 2}${
            account.skinUpdatedAt ? `?v=${account.skinUpdatedAt}` : ''
          }`}
          alt=""
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{account ? initials(account.name) : '?'}</span>
      )}
    </div>
  )
}

/**
 * /pay — enter an escrow ID and jump to the pay link.
 */
import React, { useState } from 'react'
import { useRouter } from './Router'
import { Card, Button, Input, SectionHead } from './ui'

export function PayEntry() {
  const { navigate } = useRouter()
  const [orderId, setOrderId] = useState('')
  const [error, setError] = useState('')

  function handleGo() {
    const trimmed = orderId.trim()
    if (!trimmed || !/^\d+$/.test(trimmed)) {
      setError('Enter a valid numeric order ID')
      return
    }
    setError('')
    navigate(`/pay/${trimmed}`)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleGo()
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16 flex flex-col gap-6">
      <SectionHead
        title="Pay an Order"
        subtitle="Enter the order ID your freelancer shared with you."
      />

      <Card className="flex flex-col gap-4">
        <Input
          label="Order ID"
          placeholder="e.g. 42"
          value={orderId}
          onChange={(e) => {
            setOrderId(e.target.value)
            if (error) setError('')
          }}
          onKeyDown={handleKey}
          error={error}
          autoFocus
        />
        <Button onClick={handleGo} disabled={!orderId.trim()}>
          Go to payment page
        </Button>
      </Card>

      <p className="text-xs text-center" style={{ color: 'var(--muted)' }}>
        Your freelancer can find their order ID on the escrow detail page.
      </p>
    </div>
  )
}

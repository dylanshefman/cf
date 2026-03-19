import React, { useState } from 'react'
import { Modal, TextInput, Button, Stack, Text } from '@mantine/core'
import { useAuth } from '../state/AuthProvider'

export function LoginPrompt() {
  const { authenticated, loggingIn, login } = useAuth()
  const [clientId, setClientId] = useState('')
  const [keyId, setKeyId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const open = !authenticated

  async function onSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null)
    const ok = await login(clientId.trim(), keyId.trim())
    if (!ok) setError('Invalid credentials')
  }

  return (
    <Modal opened={open} onClose={() => {}} withCloseButton={false} centered closeOnClickOutside={false} closeOnEscape={false} title="Sign in">
      <form onSubmit={onSubmit}>
        <Stack>
          <Text size="sm">Enter your Client ID and Key ID to unlock the app.</Text>
          <TextInput label="Client ID" value={clientId} onChange={(e) => setClientId(e.currentTarget.value)} />
          <TextInput label="Key ID" value={keyId} onChange={(e) => setKeyId(e.currentTarget.value)} />
          {error && <Text color="red">{error}</Text>}
          <Button type="submit" loading={loggingIn} onClick={() => onSubmit()}>
            Sign in
          </Button>
        </Stack>
      </form>
    </Modal>
  )
}

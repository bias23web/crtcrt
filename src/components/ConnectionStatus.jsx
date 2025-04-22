// src/components/ConnectionStatus.jsx
import React from 'react'

function ConnectionStatus({ connected }) {
  return (
    <div className={`status ${connected ? 'connected' : 'disconnected'}`}>
      {connected ? 'Connected to Reactive Network' : 'Disconnected from Reactive Network'}
    </div>
  )
}

export default ConnectionStatus
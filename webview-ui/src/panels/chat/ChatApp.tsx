import React from 'react';

export function ChatApp() {
  return (
    <div className="chat-app">
      <div className="chat-header">
        <h2>OpenCode Chat</h2>
      </div>
      <div className="chat-messages">
        <p>Welcome to OpenCode for VSCode!</p>
        <p>Start a conversation by typing below.</p>
      </div>
      <div className="chat-input">
        <textarea placeholder="Type your message... (@ to reference files, / for commands)" />
        <button>Send</button>
      </div>
    </div>
  );
}

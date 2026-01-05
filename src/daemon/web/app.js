/**
 * dot-agents Channels Web UI
 */

const API_BASE = window.location.origin;

// State
let currentChannel = null;
let currentThread = null;
let channels = [];
let eventSource = null;

// DOM Elements
const channelListEl = document.getElementById("channel-list");
const channelNameEl = document.getElementById("channel-name");
const channelDescriptionEl = document.getElementById("channel-description");
const messagesEl = document.getElementById("messages");
const composerEl = document.getElementById("composer");
const messageFormEl = document.getElementById("message-form");
const messageInputEl = document.getElementById("message-input");
const threadPanelEl = document.getElementById("thread-panel");
const threadMessagesEl = document.getElementById("thread-messages");
const closeThreadBtn = document.getElementById("close-thread");
const replyFormEl = document.getElementById("reply-form");
const replyInputEl = document.getElementById("reply-input");
const connectionStatusEl = document.getElementById("connection-status");

/**
 * Format ISO timestamp to readable time
 */
function formatTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

/**
 * Format message ID (ISO timestamp) to readable datetime
 */
function formatDateTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Simple markdown-like rendering (basic support)
 */
function renderContent(content) {
  // Escape HTML
  let html = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>");

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // Line breaks to paragraphs
  html = html
    .split(/\n\n+/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");

  return html;
}

/**
 * Render a single message
 */
function renderMessage(message, isReply = false) {
  const from = message.meta?.from || "unknown";
  const host = message.meta?.host;
  const tags = message.meta?.tags || [];
  const replyCount = message.replies?.length || 0;

  return `
    <div class="message" data-id="${message.id}">
      <div class="message-header">
        <span class="message-from">${escapeHtml(from)}</span>
        <span class="message-time">${formatDateTime(message.id)}</span>
        ${host ? `<span class="message-host">${escapeHtml(host)}</span>` : ""}
      </div>
      <div class="message-content">
        ${renderContent(message.content)}
      </div>
      <div class="message-footer">
        ${tags.length ? `<div class="message-tags">${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
        ${!isReply && replyCount > 0 ? `<span class="reply-count" data-thread="${message.id}">${replyCount} ${replyCount === 1 ? "reply" : "replies"}</span>` : ""}
        ${!isReply ? `<span class="reply-count" data-thread="${message.id}" style="cursor: pointer;">${replyCount === 0 ? "Reply" : ""}</span>` : ""}
      </div>
    </div>
  `;
}

/**
 * Escape HTML entities
 */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Fetch and render channel list
 */
async function loadChannels() {
  try {
    const response = await fetch(`${API_BASE}/channels`);
    const data = await response.json();
    channels = data.channels;

    // Separate public channels (#) and DMs (@)
    const publicChannels = channels.filter((c) => c.name.startsWith("#"));
    const dmChannels = channels.filter((c) => c.name.startsWith("@"));

    let html = "";

    if (publicChannels.length > 0) {
      html += `
        <div class="channel-section">
          <div class="channel-section-title">Channels</div>
          ${publicChannels
            .map(
              (c) => `
            <div class="channel-item" data-channel="${c.name}">
              <span class="channel-icon public">#</span>
              <span class="channel-name">${escapeHtml(c.name.slice(1))}</span>
            </div>
          `
            )
            .join("")}
        </div>
      `;
    }

    if (dmChannels.length > 0) {
      html += `
        <div class="channel-section">
          <div class="channel-section-title">Direct Messages</div>
          ${dmChannels
            .map(
              (c) => `
            <div class="channel-item" data-channel="${c.name}">
              <span class="channel-icon dm">@</span>
              <span class="channel-name">${escapeHtml(c.name.slice(1))}</span>
            </div>
          `
            )
            .join("")}
        </div>
      `;
    }

    if (publicChannels.length === 0 && dmChannels.length === 0) {
      html = '<div class="loading">No channels found</div>';
    }

    channelListEl.innerHTML = html;

    // Add click handlers
    channelListEl.querySelectorAll(".channel-item").forEach((item) => {
      item.addEventListener("click", () => {
        const channelName = item.dataset.channel;
        selectChannel(channelName);
      });
    });
  } catch (error) {
    console.error("Failed to load channels:", error);
    channelListEl.innerHTML =
      '<div class="loading">Failed to load channels</div>';
  }
}

/**
 * Select and load a channel
 */
async function selectChannel(channelName) {
  currentChannel = channelName;
  currentThread = null;

  // Update sidebar
  channelListEl.querySelectorAll(".channel-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.channel === channelName);
  });

  // Update header
  const channelData = channels.find((c) => c.name === channelName);
  channelNameEl.textContent = channelName;
  channelDescriptionEl.textContent = channelData?.metadata?.description || "";

  // Show composer
  composerEl.style.display = "block";

  // Close thread panel
  closeThread();

  // Load messages
  await loadMessages(channelName);
}

/**
 * Load messages for a channel
 */
async function loadMessages(channelName) {
  messagesEl.innerHTML =
    '<div class="empty-state"><div class="loading-spinner"></div></div>';

  try {
    const response = await fetch(
      `${API_BASE}/channels/${encodeURIComponent(channelName)}?limit=100`
    );
    const data = await response.json();

    if (data.messages.length === 0) {
      messagesEl.innerHTML =
        '<div class="empty-state"><p>No messages in this channel</p></div>';
      return;
    }

    // Reverse to show oldest first (chronological order)
    const messages = [...data.messages].reverse();
    messagesEl.innerHTML = messages.map((m) => renderMessage(m)).join("");

    // Scroll to bottom
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // Add thread click handlers
    messagesEl.querySelectorAll(".reply-count").forEach((el) => {
      el.addEventListener("click", () => {
        const threadId = el.dataset.thread;
        openThread(threadId);
      });
    });
  } catch (error) {
    console.error("Failed to load messages:", error);
    messagesEl.innerHTML =
      '<div class="empty-state"><p>Failed to load messages</p></div>';
  }
}

/**
 * Open thread panel for a message
 */
async function openThread(messageId) {
  currentThread = messageId;
  threadPanelEl.style.display = "flex";

  // Find the message
  const response = await fetch(
    `${API_BASE}/channels/${encodeURIComponent(currentChannel)}/${encodeURIComponent(messageId)}`
  );
  const data = await response.json();

  if (!data.message) {
    threadMessagesEl.innerHTML = "<p>Message not found</p>";
    return;
  }

  const message = data.message;

  // Render original message + replies
  let html = renderMessage(message, true);

  if (message.replies && message.replies.length > 0) {
    html += message.replies.map((r) => renderMessage(r, true)).join("");
  }

  threadMessagesEl.innerHTML = html;
  threadMessagesEl.scrollTop = threadMessagesEl.scrollHeight;
}

/**
 * Close thread panel
 */
function closeThread() {
  currentThread = null;
  threadPanelEl.style.display = "none";
}

/**
 * Send a message to current channel
 */
async function sendMessage(content) {
  if (!currentChannel || !content.trim()) return;

  try {
    const response = await fetch(
      `${API_BASE}/channels/${encodeURIComponent(currentChannel)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          from: "web-ui",
        }),
      }
    );

    if (response.ok) {
      messageInputEl.value = "";
      await loadMessages(currentChannel);
    }
  } catch (error) {
    console.error("Failed to send message:", error);
  }
}

/**
 * Reply to a thread
 */
async function sendReply(content) {
  if (!currentChannel || !currentThread || !content.trim()) return;

  try {
    const response = await fetch(
      `${API_BASE}/channels/${encodeURIComponent(currentChannel)}/${encodeURIComponent(currentThread)}/reply`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          from: "web-ui",
        }),
      }
    );

    if (response.ok) {
      replyInputEl.value = "";
      await openThread(currentThread);
      await loadMessages(currentChannel);
    }
  } catch (error) {
    console.error("Failed to send reply:", error);
  }
}

/**
 * Connect to SSE stream for real-time updates
 */
function connectSSE() {
  if (eventSource) {
    eventSource.close();
  }

  eventSource = new EventSource(`${API_BASE}/channels-stream`);

  eventSource.onopen = () => {
    connectionStatusEl.textContent = "Connected";
    connectionStatusEl.className = "connection-status connected";
  };

  eventSource.onerror = () => {
    connectionStatusEl.textContent = "Disconnected";
    connectionStatusEl.className = "connection-status disconnected";

    // Attempt reconnect after 5 seconds
    setTimeout(() => {
      if (eventSource.readyState === EventSource.CLOSED) {
        connectSSE();
      }
    }, 5000);
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === "connected") {
        console.log("SSE connected");
        return;
      }

      // Reload channel list on any channel activity
      if (data.type === "dm:received" || data.type === "channel:message") {
        // Refresh channel list
        loadChannels();

        // If we're viewing the affected channel, reload messages
        if (currentChannel === data.channel) {
          loadMessages(currentChannel);
        }
      }
    } catch (error) {
      console.error("Failed to parse SSE message:", error);
    }
  };
}

// Event listeners
messageFormEl.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage(messageInputEl.value);
});

replyFormEl.addEventListener("submit", (e) => {
  e.preventDefault();
  sendReply(replyInputEl.value);
});

closeThreadBtn.addEventListener("click", closeThread);

// Initialize
loadChannels();
connectSSE();

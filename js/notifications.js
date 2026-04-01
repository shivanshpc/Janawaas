// Notifications functionality
// API_URL is defined in auth.js

let notificationsOpen = false;
let unreadCount = 0;

// Initialize notifications
function initNotifications() {
    createNotificationUI();
    loadNotifications();
    
    // Poll for new notifications every 30 seconds
    setInterval(loadUnreadCount, 30000);
}

// Create notification UI elements
function createNotificationUI() {
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;

    const notificationBtn = document.createElement('a');
    notificationBtn.href = '#';
    notificationBtn.id = 'notificationBtn';
    notificationBtn.className = 'notification-btn';
    notificationBtn.innerHTML = `
        <span class="notification-icon">🔔</span>
        <span class="notification-badge" id="notificationBadge" style="display: none;">0</span>
    `;
    notificationBtn.addEventListener('click', toggleNotifications);

    // Insert before logout button
    const logoutLink = document.getElementById('navLogout');
    if (logoutLink) {
        navLinks.insertBefore(notificationBtn, logoutLink);
    }

    // Create notification dropdown
    const dropdown = document.createElement('div');
    dropdown.id = 'notificationDropdown';
    dropdown.className = 'notification-dropdown';
    dropdown.style.display = 'none';
    dropdown.innerHTML = `
        <div class="notification-header">
            <h3>Notifications</h3>
            <button id="markAllReadBtn" class="btn-link">Mark all as read</button>
        </div>
        <div class="notification-list" id="notificationList">
            <div class="loading">Loading notifications...</div>
        </div>
    `;
    document.body.appendChild(dropdown);

    document.getElementById('markAllReadBtn').addEventListener('click', markAllAsRead);

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.notification-btn') && !e.target.closest('.notification-dropdown')) {
            closeNotifications();
        }
    });

    // Real-time notification
    if (typeof realtimeManager !== 'undefined') {
        realtimeManager.socket?.on('notification', (data) => {
            unreadCount = data.unreadCount;
            updateBadge();
            
            // Add to dropdown if open
            if (notificationsOpen) {
                const list = document.getElementById('notificationList');
                if (list) {
                    const item = createNotificationItem(data.notification);
                    list.insertAdjacentHTML('afterbegin', item);
                    // Remove "No notifications" message if present
                    const noNotif = list.querySelector('.no-notifications');
                    if (noNotif) noNotif.remove();
                }
            }
        });
    }
}

// Toggle notification dropdown
function toggleNotifications(e) {
    e.preventDefault();
    const dropdown = document.getElementById('notificationDropdown');
    
    if (notificationsOpen) {
        closeNotifications();
    } else {
        openNotifications();
    }
}

// Open notifications
function openNotifications() {
    const dropdown = document.getElementById('notificationDropdown');
    const btn = document.getElementById('notificationBtn');
    
    dropdown.style.display = 'block';
    notificationsOpen = true;
    
    // Position dropdown below button
    const rect = btn.getBoundingClientRect();
    dropdown.style.top = (rect.bottom + 5) + 'px';
    dropdown.style.right = (window.innerWidth - rect.right) + 'px';
    
    loadNotifications();
}

// Close notifications
function closeNotifications() {
    const dropdown = document.getElementById('notificationDropdown');
    dropdown.style.display = 'none';
    notificationsOpen = false;
}

// Load notifications
async function loadNotifications() {
    const token = getToken();
    if (!token) return;

    try {
        const response = await fetch(`${API_URL}/notifications`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to load notifications');

        const { notifications, unreadCount: count } = await response.json();
        
        unreadCount = count;
        updateBadge();
        displayNotifications(notifications);
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

// Load unread count only
async function loadUnreadCount() {
    const token = getToken();
    if (!token) return;

    try {
        const response = await fetch(`${API_URL}/notifications`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) return;

        const data = await response.json();
        unreadCount = data.unreadCount;
        updateBadge();
    } catch (error) {
        console.error('Error loading unread count:', error);
    }
}

// Update notification badge
function updateBadge() {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;

    if (unreadCount > 0) {
        badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }
}

// Helper to create notification item HTML
function createNotificationItem(notif) {
    let actionButtons = '';
    if ((notif.type === 'merge_request' || notif.type === 'issue_merge_request') && !notif.isRead) {
        const isIssueMerge = notif.type === 'issue_merge_request';
        const sourceId = isIssueMerge ? notif.metadata.sourceAuthorityId : notif.metadata.sourceAuthorityId;
        const issueId = isIssueMerge ? notif.metadata.issueId : null;
        
        actionButtons = `
            <div class="notification-actions" style="margin-top: 10px; display: flex; gap: 10px;">
                <button class="btn btn-sm btn-primary accept-merge" 
                    data-id="${sourceId}" 
                    data-notif-id="${notif._id}" 
                    ${issueId ? `data-issue-id="${issueId}"` : ''}
                    style="padding: 4px 12px; font-size: 0.8rem; background: #54f0df; color: #0a192f; border: none; border-radius: 4px; font-weight: bold;">Accept</button>
                <button class="btn btn-sm btn-secondary reject-merge" 
                    data-id="${sourceId}" 
                    data-notif-id="${notif._id}" 
                    ${issueId ? `data-issue-id="${issueId}"` : ''}
                    style="padding: 4px 12px; font-size: 0.8rem; background: #ff4757; color: white; border: none; border-radius: 4px; font-weight: bold;">Reject</button>
            </div>
        `;
    }

    return `
        <div class="notification-item ${notif.isRead ? '' : 'unread'}" data-id="${notif._id}">
            <div class="notification-icon">${getNotificationIcon(notif.type)}</div>
            <div class="notification-content">
                <div class="notification-title">${notif.title}</div>
                <div class="notification-message">${notif.message}</div>
                ${actionButtons}
                <div class="notification-time">${getTimeAgo(notif.createdAt)}</div>
            </div>
            ${!notif.isRead ? '<span class="unread-dot"></span>' : ''}
        </div>
    `;
}

// Display notifications
function displayNotifications(notifications) {
    const list = document.getElementById('notificationList');
    
    // If notification list doesn't exist on this page, skip
    if (!list) return;
    
    if (notifications.length === 0) {
        list.innerHTML = '<div class="no-notifications">No notifications yet</div>';
        return;
    }

    list.innerHTML = notifications.map(notif => createNotificationItem(notif)).join('');

    // Add click handlers for items
    list.querySelectorAll('.notification-item').forEach(item => {
        item.addEventListener('click', (e) => {
            // Don't trigger if action button was clicked
            if (e.target.closest('.notification-actions')) return;
            handleNotificationClick(item.dataset.id, notifications);
        });
    });

    // Add handlers for merge actions
    list.querySelectorAll('.accept-merge').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const sourceAuthId = btn.dataset.id;
            const notifId = btn.dataset.notifId;
            const issueId = btn.dataset.issueId;
            await handleMergeAction('accept', sourceAuthId, notifId, issueId);
        });
    });

    list.querySelectorAll('.reject-merge').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const sourceAuthId = btn.dataset.id;
            const notifId = btn.dataset.notifId;
            const issueId = btn.dataset.issueId;
            await handleMergeAction('reject', sourceAuthId, notifId, issueId);
        });
    });
}

// Get notification icon
function getNotificationIcon(type) {
    const icons = {
        'issue_accepted': '✅',
        'issue_update': '🔄',
        'comment_reply': '💬',
        'comment': '💬',
        'upvote': '❤️',
        'issue_rejected': '❌',
        'merge_request': '🤝',
        'merge_accepted': '🤝',
        'merge_rejected': '🚫',
        'issue_merge_request': '🤝',
        'issue_merge_accepted': '🤝',
        'issue_merge_rejected': '🚫',
        'issue_unmerged': '🔓',
        'issue_unmerged_collaboration': '🔓',
        'unmerged': '💔'
    };
    return icons[type] || '🔔';
}

async function handleMergeAction(action, sourceAuthId, notifId, issueId = null) {
    const token = getToken();
    if (!token) return;

    try {
        let url;
        let body = {};
        
        if (issueId) {
            // Issue merge
            url = `${API_URL}/issues/${issueId}/merge-${action}`;
            body = { sourceAuthorityId: sourceAuthId };
        } else {
            // Authority merge
            url = `${API_URL}/authority/merge-${action}/${sourceAuthId}`;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || `Failed to ${action} merge request`);
        }

        // Mark notification as read
        await markAsRead(notifId);
        
        alert(`Merge request ${action}ed successfully!`);
        location.reload();
    } catch (error) {
        console.error(`Error ${action}ing merge request:`, error);
        alert(error.message);
    }
}

// Handle notification click
async function handleNotificationClick(notificationId, notifications) {
    const notification = notifications.find(n => n._id === notificationId);
    if (!notification) return;

    // Mark as read
    if (!notification.isRead) {
        await markAsRead(notificationId);
    }

    // Navigate to related page
    if (notification.metadata.issueId) {
        window.location.href = `/issue.html?id=${notification.metadata.issueId}`;
    } else if (notification.type.includes('merge') || notification.type === 'unmerged' || notification.type === 'issue_unmerged') {
        if (notification.metadata.sourceAuthorityId || notification.metadata.targetAuthorityId) {
            const authId = notification.metadata.sourceAuthorityId || notification.metadata.targetAuthorityId;
            window.location.href = `/authority-detail.html?id=${authId}`;
        }
    }
}

// Mark notification as read
async function markAsRead(notificationId) {
    const token = getToken();
    if (!token) return;

    try {
        const response = await fetch(`${API_URL}/notifications/${notificationId}/read`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            unreadCount = Math.max(0, unreadCount - 1);
            updateBadge();
            loadNotifications();
        }
    } catch (error) {
        console.error('Error marking notification as read:', error);
    }
}

// Mark all as read
async function markAllAsRead() {
    const token = getToken();
    if (!token) return;

    try {
        const response = await fetch(`${API_URL}/notifications/mark-all-read`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            unreadCount = 0;
            updateBadge();
            loadNotifications();
        }
    } catch (error) {
        console.error('Error marking all as read:', error);
    }
}

// Helper function to get time ago
function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
    
    return date.toLocaleDateString();
}

// Helper to get auth token
function getToken() {
    try {
        return localStorage.getItem('token');
    } catch (e) {
        console.warn('localStorage access denied:', e);
        return null;
    }
}

// Initialize when DOM is ready
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (getToken()) {
                initNotifications();
            }
        });
    } else {
        if (getToken()) {
            initNotifications();
        }
    }
}

// Function to update notification badge (called by realtime manager)
function updateNotificationBadge() {
    loadUnreadCount();
}

// If a page-level "Mark all as read" button exists (notifications page), attach handler
document.addEventListener('DOMContentLoaded', () => {
    const pageMarkBtn = document.getElementById('markAllReadBtn');
    if (pageMarkBtn) {
        pageMarkBtn.addEventListener('click', (e) => {
            e.preventDefault();
            markAllAsRead();
        });
    }
});

